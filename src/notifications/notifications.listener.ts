import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  CommentAddedEvent, IssueAssignedEvent, IssueCreatedEvent, IssueEvents,
} from '../events/issue-events';
import { NotificationsService } from './notifications.service';

// Decoupled listeners: the issue/reporter services emit domain events; here we
// react with notifications. Errors are swallowed (logged) so a notification
// failure never breaks the originating request.
@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger(NotificationsListener.name);

  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent(IssueEvents.CREATED, { async: true })
  async onIssueCreated(evt: IssueCreatedEvent): Promise<void> {
    try {
      await this.notifications.notifyFocalPointsOfNewIssue(evt.issueId, evt.platformId);
    } catch (err) {
      this.logger.error(`issue.created notification failed: ${(err as Error).message}`);
    }
  }

  @OnEvent(IssueEvents.ASSIGNED, { async: true })
  async onIssueAssigned(evt: IssueAssignedEvent): Promise<void> {
    try {
      await this.notifications.notifyAssignee(evt.issueId, evt.assigneeId);
    } catch (err) {
      this.logger.error(`issue.assigned notification failed: ${(err as Error).message}`);
    }
  }

  @OnEvent(IssueEvents.COMMENT_ADDED, { async: true })
  async onCommentAdded(evt: CommentAddedEvent): Promise<void> {
    try {
      await this.notifications.notifyMentions(evt.issueId, evt.mentionStaffIds, evt.actorStaffId);
    } catch (err) {
      this.logger.error(`comment.added mention notification failed: ${(err as Error).message}`);
    }
  }
}
