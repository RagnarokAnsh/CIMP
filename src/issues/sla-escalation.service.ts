import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IsNull, Repository } from 'typeorm';
import { ActorType } from '../common/enums';
import { OPEN_ISSUE_STATUSES } from '../common/constants';
import { Issue } from '../entities';
import { AuditService } from '../audit/audit.service';
import { IssueEvents, IssueSlaBreachedEvent } from '../events/issue-events';
import { slaDueSql } from './sla';
import { envFlag } from '../common/env-flag';

const OPEN_STATUSES = OPEN_ISSUE_STATUSES;

// Escalation sweep: every 5 minutes, find open issues past their (per-platform
// or default) SLA window that haven't been escalated this cycle, mark them
// (sla_breached_at — the idempotence marker, cleared on REOPEN) and emit
// issue.sla_breached for the notification + webhook listeners. Disable with
// SLA_SWEEP_ENABLED=false.
@Injectable()
export class SlaEscalationService {
  private readonly logger = new Logger(SlaEscalationService.name);

  constructor(
    @InjectRepository(Issue) private readonly issues: Repository<Issue>,
    private readonly events: EventEmitter2,
    private readonly audit: AuditService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweep(): Promise<number> {
    if (!envFlag('SLA_SWEEP_ENABLED', true)) return 0;
    try {
      const due = slaDueSql('issue.sla_started_at', 'platform');
      const rows = await this.issues
        .createQueryBuilder('issue')
        .innerJoin('issue.platform', 'platform')
        .select('issue.id', 'id')
        .addSelect('platform.id', 'platformId')
        .where('issue.status IN (:...open)', { open: OPEN_STATUSES })
        .andWhere('issue.sla_breached_at IS NULL')
        .andWhere(`now() >= ${due}`)
        .getRawMany<{ id: string; platformId: string }>();

      let escalated = 0;
      for (const row of rows) {
        // Conditional update: a concurrent sweep (or a REOPEN between the
        // select and here) makes this a no-op instead of a double escalation.
        const res = await this.issues.update(
          { id: row.id, slaBreachedAt: IsNull() },
          { slaBreachedAt: new Date() },
        );
        if (!res.affected) continue;

        await this.audit.record({
          issueId: row.id,
          actorType: ActorType.SYSTEM,
          actorId: null,
          action: 'SLA_BREACHED',
        });
        this.events.emit(IssueEvents.SLA_BREACHED, {
          issueId: row.id,
          platformId: row.platformId,
        } satisfies IssueSlaBreachedEvent);
        escalated += 1;
      }
      if (escalated > 0) this.logger.warn(`SLA sweep escalated ${escalated} issue(s)`);
      return escalated;
    } catch (err) {
      this.logger.error(`SLA sweep failed: ${(err as Error).message}`);
      return 0;
    }
  }
}
