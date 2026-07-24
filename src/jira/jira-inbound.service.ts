import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ActorType, IssueStatus } from '../common/enums';
import { Issue } from '../entities';
import { applyStatusSideEffects } from '../issues/status-side-effects';
import { AuditService } from '../audit/audit.service';

// Maps a Jira status category to our IssueStatus. Jira exposes three stable
// category keys regardless of the project's custom workflow names.
const CATEGORY_TO_STATUS: Record<string, IssueStatus> = {
  new: IssueStatus.NEW,
  indeterminate: IssueStatus.IN_PROGRESS,
  done: IssueStatus.RESOLVED,
};

// Local statuses whose only legal exit is REOPENED (see STATUS_TRANSITIONS).
const TERMINAL_STATUSES: IssueStatus[] = [IssueStatus.RESOLVED, IssueStatus.CLOSED];

// Applies inbound Jira status changes to the linked local issue, running the
// same timestamp/SLA bookkeeping as the staff path. Deliberately does NOT emit
// STATUS_CHANGED — the outbound listener answers that event by commenting on
// Jira, which would echo the change straight back and loop.
@Injectable()
export class JiraInboundService {
  private readonly logger = new Logger(JiraInboundService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  async applyWebhook(payload: any): Promise<{ applied: boolean }> {
    const key: string | undefined = payload?.issue?.key;
    const categoryKey: string | undefined =
      payload?.issue?.fields?.status?.statusCategory?.key;
    if (!key || !categoryKey) return { applied: false };

    const mapped = CATEGORY_TO_STATUS[categoryKey];
    if (!mapped) return { applied: false };

    // Status write + audit row in one transaction. We re-read inside the txn so
    // the audit reflects the actual prior state. Jira is authoritative for
    // inbound status, so this intentionally overrides the local value.
    const applied = await this.dataSource.transaction(async (em) => {
      const issue = await em.findOne(Issue, { where: { jiraIssueKey: key } });
      if (!issue) return false;

      const from = issue.status;
      const target = this.resolveTarget(from, mapped);
      if (from === target) return false;

      issue.status = target;
      // Run the shared side effects rather than a partial copy: a bare status
      // write is how an issue ends up back IN_PROGRESS with closedAt still set
      // (so exports and the CSV still read it as closed).
      applyStatusSideEffects(issue, target);
      await em.save(issue);
      await this.audit.record({
        issueId: issue.id,
        actorType: ActorType.SYSTEM,
        actorId: null,
        action: 'STATUS_CHANGED',
        field: 'status',
        oldValue: from,
        newValue: target,
        metadata: { source: 'jira-webhook', jiraKey: key },
      }, em);
      this.logger.log(`Jira webhook: ${issue.referenceNo} ${from} → ${target} (from ${key})`);
      return true;
    });
    return { applied };
  }

  // Jira reports a status *category*, not our status, so a ticket dragged out of
  // Done arrives as plain NEW/IN_PROGRESS. Writing that verbatim would leave
  // resolvedAt/closedAt populated and the SLA clock still measured from the
  // original createdAt — an instant re-breach (L8). Coming out of a terminal
  // state is a reopen, which is also the only exit the status machine allows.
  private resolveTarget(from: IssueStatus, mapped: IssueStatus): IssueStatus {
    if (mapped !== IssueStatus.RESOLVED && TERMINAL_STATUSES.includes(from)) {
      return IssueStatus.REOPENED;
    }
    return mapped;
  }
}
