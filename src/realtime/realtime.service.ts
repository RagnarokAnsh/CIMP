import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Observable, Subject } from 'rxjs';
import {
  CommentAddedEvent, IssueAssignedEvent, IssueCreatedEvent, IssueEvents,
  IssuePriorityChangedEvent, IssueStatusChangedEvent,
} from '../events/issue-events';

// A realtime event delivered to staff browsers over SSE. `platformId` is used to
// scope delivery; `targetStaffIds` (optional) forces delivery to specific staff
// regardless of platform scope (e.g. an @mention or assignment).
export interface RealtimeEvent {
  type: string;
  issueId: string;
  platformId: string;
  targetStaffIds?: string[];
}

// Bridges in-process domain events onto a single RxJS stream that the SSE
// controller fans out (filtered by scope) to connected staff. Listeners are
// synchronous and trivial (just push to the subject), so they never delay the
// originating request.
@Injectable()
export class RealtimeService {
  private readonly stream = new Subject<RealtimeEvent>();

  get events$(): Observable<RealtimeEvent> {
    return this.stream.asObservable();
  }

  @OnEvent(IssueEvents.CREATED)
  onCreated(e: IssueCreatedEvent): void {
    this.stream.next({ type: IssueEvents.CREATED, issueId: e.issueId, platformId: e.platformId });
  }

  @OnEvent(IssueEvents.STATUS_CHANGED)
  onStatusChanged(e: IssueStatusChangedEvent): void {
    this.stream.next({ type: IssueEvents.STATUS_CHANGED, issueId: e.issueId, platformId: e.platformId });
  }

  @OnEvent(IssueEvents.PRIORITY_CHANGED)
  onPriorityChanged(e: IssuePriorityChangedEvent): void {
    this.stream.next({ type: IssueEvents.PRIORITY_CHANGED, issueId: e.issueId, platformId: e.platformId });
  }

  @OnEvent(IssueEvents.ASSIGNED)
  onAssigned(e: IssueAssignedEvent): void {
    this.stream.next({
      type: IssueEvents.ASSIGNED,
      issueId: e.issueId,
      platformId: e.platformId,
      targetStaffIds: e.assigneeId ? [e.assigneeId] : undefined,
    });
  }

  @OnEvent(IssueEvents.COMMENT_ADDED)
  onCommentAdded(e: CommentAddedEvent): void {
    this.stream.next({
      type: IssueEvents.COMMENT_ADDED,
      issueId: e.issueId,
      platformId: e.platformId,
      targetStaffIds: e.mentionStaffIds?.length ? e.mentionStaffIds : undefined,
    });
  }
}
