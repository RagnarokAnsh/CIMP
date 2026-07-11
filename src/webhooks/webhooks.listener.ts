import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Issue } from '../entities';
import {
  CommentAddedEvent, CsatReceivedEvent, IssueAssignedEvent, IssueCreatedEvent,
  IssueEvents, IssueMergedEvent, IssuePriorityChangedEvent, IssueSlaBreachedEvent,
  IssueStatusChangedEvent,
} from '../events/issue-events';
import { WebhooksService } from './webhooks.service';

// Bridges domain events onto outbound webhooks. Payloads carry a minimal issue
// snapshot plus the event's own fields; comment BODIES are deliberately
// excluded (they may hold internal detail — receivers get metadata only).
@Injectable()
export class WebhooksListener {
  private readonly logger = new Logger(WebhooksListener.name);

  constructor(
    @InjectRepository(Issue) private readonly issues: Repository<Issue>,
    private readonly webhooks: WebhooksService,
  ) {}

  @OnEvent(IssueEvents.CREATED, { async: true })
  onCreated(evt: IssueCreatedEvent): Promise<void> {
    return this.forward(IssueEvents.CREATED, evt.issueId, evt.platformId, {});
  }

  @OnEvent(IssueEvents.STATUS_CHANGED, { async: true })
  onStatusChanged(evt: IssueStatusChangedEvent): Promise<void> {
    return this.forward(IssueEvents.STATUS_CHANGED, evt.issueId, evt.platformId, {
      from: evt.from, to: evt.to,
    });
  }

  @OnEvent(IssueEvents.PRIORITY_CHANGED, { async: true })
  onPriorityChanged(evt: IssuePriorityChangedEvent): Promise<void> {
    return this.forward(IssueEvents.PRIORITY_CHANGED, evt.issueId, evt.platformId, {
      from: evt.from, to: evt.to,
    });
  }

  @OnEvent(IssueEvents.ASSIGNED, { async: true })
  onAssigned(evt: IssueAssignedEvent): Promise<void> {
    return this.forward(IssueEvents.ASSIGNED, evt.issueId, evt.platformId, {
      assigneeId: evt.assigneeId,
    });
  }

  @OnEvent(IssueEvents.COMMENT_ADDED, { async: true })
  onCommentAdded(evt: CommentAddedEvent): Promise<void> {
    return this.forward(IssueEvents.COMMENT_ADDED, evt.issueId, evt.platformId, {
      reporterVisible: evt.reporterVisible,
    });
  }

  @OnEvent(IssueEvents.MERGED, { async: true })
  onMerged(evt: IssueMergedEvent): Promise<void> {
    return this.forward(IssueEvents.MERGED, evt.duplicateIssueId, evt.platformId, {
      canonicalIssueId: evt.canonicalIssueId,
    });
  }

  @OnEvent(IssueEvents.CSAT_RECEIVED, { async: true })
  onCsat(evt: CsatReceivedEvent): Promise<void> {
    return this.forward(IssueEvents.CSAT_RECEIVED, evt.issueId, evt.platformId, {
      score: evt.score,
    });
  }

  @OnEvent(IssueEvents.SLA_BREACHED, { async: true })
  onSlaBreached(evt: IssueSlaBreachedEvent): Promise<void> {
    return this.forward(IssueEvents.SLA_BREACHED, evt.issueId, evt.platformId, {});
  }

  private async forward(
    eventName: string,
    issueId: string,
    platformId: string,
    change: Record<string, unknown>,
  ): Promise<void> {
    try {
      const issue = await this.issues.findOne({
        where: { id: issueId },
        relations: { platform: true },
      });
      if (!issue) return;
      await this.webhooks.deliver(eventName, platformId, {
        event: eventName,
        timestamp: new Date().toISOString(),
        platformKey: issue.platform.key,
        issue: {
          id: issue.id,
          referenceNo: issue.referenceNo,
          description: issue.description.slice(0, 300),
          status: issue.status,
          priority: issue.priority,
        },
        change,
      });
    } catch (err) {
      this.logger.error(`webhook forward for ${eventName} failed: ${(err as Error).message}`);
    }
  }
}
