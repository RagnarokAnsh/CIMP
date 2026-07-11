import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IssueStatus } from '../common/enums';
import { Issue, ReporterSubscription } from '../entities';
import { IssueEvents, IssueStatusChangedEvent } from '../events/issue-events';
import { MailService } from '../notifications/mail.service';

// One-shot subscriber fan-out: when a followed issue resolves, email every
// subscriber then delete the rows. This is the documented exception to OD-02
// (reporters in-app only) — a subscriber has no issue of their own, so email
// is the only channel that can reach them.
@Injectable()
export class DeflectionListener {
  private readonly logger = new Logger(DeflectionListener.name);

  constructor(
    @InjectRepository(Issue) private readonly issues: Repository<Issue>,
    @InjectRepository(ReporterSubscription) private readonly subscriptions: Repository<ReporterSubscription>,
    private readonly mail: MailService,
  ) {}

  @OnEvent(IssueEvents.STATUS_CHANGED, { async: true })
  async onStatusChanged(evt: IssueStatusChangedEvent): Promise<void> {
    if (evt.to !== IssueStatus.RESOLVED) return;
    try {
      const subs = await this.subscriptions.find({
        where: { issue: { id: evt.issueId } },
        relations: { reporter: true },
      });
      if (subs.length === 0) return;

      const issue = await this.issues.findOne({
        where: { id: evt.issueId },
        relations: { platform: true },
      });
      if (!issue) return;

      for (const sub of subs) {
        if (!sub.reporter?.email) continue;
        try {
          await this.mail.send({
            to: sub.reporter.email,
            subject: `[${issue.platform.name}] An issue you follow has been resolved`,
            text:
              `Good news — the issue you asked to be notified about on ${issue.platform.name} has been resolved.\n\n`
              + `If you still see the problem, please raise a new report from the app.`,
          });
        } catch (err) {
          this.logger.warn(`subscriber mail to ${sub.reporter.email} failed: ${(err as Error).message}`);
        }
      }
      await this.subscriptions.delete(subs.map((s) => s.id));
    } catch (err) {
      this.logger.error(`subscription fan-out failed for ${evt.issueId}: ${(err as Error).message}`);
    }
  }
}
