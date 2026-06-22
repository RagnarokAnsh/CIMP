import { IssueStatus, Priority } from '../common/enums';

// Domain event names. Notifications and Jira sync subscribe to these so they
// stay decoupled from the issue-management service that emits them.
export const IssueEvents = {
  CREATED: 'issue.created',
  STATUS_CHANGED: 'issue.status_changed',
  PRIORITY_CHANGED: 'issue.priority_changed',
  ASSIGNED: 'issue.assigned',
  COMMENT_ADDED: 'comment.added',
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
