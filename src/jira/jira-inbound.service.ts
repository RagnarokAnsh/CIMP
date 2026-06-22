import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ActorType, IssueStatus } from '../common/enums';
import { Issue } from '../entities';
import { AuditService } from '../audit/audit.service';

// Maps a Jira status category to our IssueStatus. Jira exposes three stable
// category keys regardless of the project's custom workflow names.
const CATEGORY_TO_STATUS: Record<string, IssueStatus> = {
  new: IssueStatus.NEW,
  indeterminate: IssueStatus.IN_PROGRESS,
  done: IssueStatus.RESOLVED,
};

// Applies inbound Jira status changes to the linked local issue. Deliberately
// does NOT emit STATUS_CHANGED — that would echo back out to Jira and loop.
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

    const target = CATEGORY_TO_STATUS[categoryKey];
    if (!target) return { applied: false };

    // Status write + audit row in one transaction. We re-read inside the txn so
    // the audit reflects the actual prior state. Jira is authoritative for
    // inbound status, so this intentionally overrides the local value.
    const applied = await this.dataSource.transaction(async (em) => {
      const issue = await em.findOne(Issue, { where: { jiraIssueKey: key } });
      if (!issue || issue.status === target) return false;

      const from = issue.status;
      issue.status = target;
      if (target === IssueStatus.RESOLVED) issue.resolvedAt = issue.resolvedAt ?? new Date();
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
}
