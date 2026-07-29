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
// Open SSE streams allowed per staff account. Generous enough for several tabs
// and a stale connection the proxy has not yet reaped, low enough that a single
// account cannot pin sockets. The stream route deliberately skips the global
// throttler (a long-lived connection is not a request), so without this nothing
// bounded it: each held stream also runs a re-authorization query every 25s, so
// N streams cost N DB round trips per tick.
export const MAX_STREAMS_PER_STAFF = 6;

@Injectable()
export class RealtimeService {
  private readonly stream = new Subject<RealtimeEvent>();

  // Per-process, like the in-memory throttler: with multiple instances the cap
  // is per-instance, so it bounds the blast radius rather than enforcing a
  // global quota. Moving it to Redis is the same decision as M8.
  private readonly openStreams = new Map<string, number>();

  get events$(): Observable<RealtimeEvent> {
    return this.stream.asObservable();
  }

  // Returns false when the caller is already at the cap. Callers MUST pair a
  // successful acquire with releaseStream() in a finalize(), or a browser that
  // disconnects without unsubscribing leaks a slot until restart.
  acquireStream(staffId: string): boolean {
    const open = this.openStreams.get(staffId) ?? 0;
    if (open >= MAX_STREAMS_PER_STAFF) return false;
    this.openStreams.set(staffId, open + 1);
    return true;
  }

  releaseStream(staffId: string): void {
    const open = (this.openStreams.get(staffId) ?? 0) - 1;
    if (open > 0) this.openStreams.set(staffId, open);
    else this.openStreams.delete(staffId);
  }

  openStreamCount(staffId: string): number {
    return this.openStreams.get(staffId) ?? 0;
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
