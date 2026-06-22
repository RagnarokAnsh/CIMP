import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
    @InjectRepository(Issue) private readonly issues: Repository<Issue>,
    private readonly audit: AuditService,
  ) {}

  async applyWebhook(payload: any): Promise<{ applied: boolean }> {
    const key: string | undefined = payload?.issue?.key;
    const categoryKey: string | undefined =
      payload?.issue?.fields?.status?.statusCategory?.key;
    if (!key || !categoryKey) return { applied: false };

    const target = CATEGORY_TO_STATUS[categoryKey];
    if (!target) return { applied: false };

    const issue = await this.issues.findOne({ where: { jiraIssueKey: key } });
    if (!issue || issue.status === target) return { applied: false };

    const from = issue.status;
    issue.status = target;
    if (target === IssueStatus.RESOLVED) issue.resolvedAt = issue.resolvedAt ?? new Date();
    await this.issues.save(issue);
    await this.audit.record({
      issueId: issue.id,
      actorType: ActorType.SYSTEM,
      actorId: null,
      action: 'STATUS_CHANGED',
      field: 'status',
      oldValue: from,
      newValue: target,
      metadata: { source: 'jira-webhook', jiraKey: key },
    });
    this.logger.log(`Jira webhook: ${issue.referenceNo} ${from} → ${target} (from ${key})`);
    return { applied: true };
  }
}
