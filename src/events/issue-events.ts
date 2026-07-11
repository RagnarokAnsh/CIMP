import { IssueStatus, Priority } from '../common/enums';

// Domain event names. Notifications and Jira sync subscribe to these so they
// stay decoupled from the issue-management service that emits them.
export const IssueEvents = {
  CREATED: 'issue.created',
  STATUS_CHANGED: 'issue.status_changed',
  PRIORITY_CHANGED: 'issue.priority_changed',
  ASSIGNED: 'issue.assigned',
  COMMENT_ADDED: 'comment.added',
  // Emitted once an issue's attachments have finished scanning, so downstream
  // sync (e.g. Jira) can push the now-servable files.
  ATTACHMENTS_SCANNED: 'issue.attachments_scanned',
  // Emitted when an issue is merged into a canonical issue as a duplicate.
  // Deliberately NOT a STATUS_CHANGED (the merge close must not trigger
  // status automation rules or the standard status notifications).
  MERGED: 'issue.merged',
  // Emitted when a reporter rates a resolution (CSAT 👍/👎).
  CSAT_RECEIVED: 'csat.received',
} as const;

export interface IssueCreatedEvent {
  issueId: string;
  platformId: string;
}

export interface IssueStatusChangedEvent {
  issueId: string;
  platformId: string;
  from: IssueStatus;
  to: IssueStatus;
  actorStaffId: string;
}

export interface IssueAssignedEvent {
  issueId: string;
  platformId: string;
  assigneeId: string | null;
  actorStaffId: string;
}

export interface IssuePriorityChangedEvent {
  issueId: string;
  platformId: string;
  from: Priority;
  to: Priority;
  actorStaffId: string;
}

export interface CommentAddedEvent {
  issueId: string;
  platformId: string;
  commentId: string;
  reporterVisible: boolean;
  actorStaffId: string;
  mentionStaffIds: string[];
}

export interface AttachmentsScannedEvent {
  issueId: string;
}

export interface IssueMergedEvent {
  duplicateIssueId: string;
  canonicalIssueId: string;
  platformId: string;
  actorStaffId: string;
}

export interface CsatReceivedEvent {
  issueId: string;
  platformId: string;
  score: number; // 1 = positive, 0 = negative
}
