// Hand-written API types mirroring the backend responses. For a fully typed
// client, run `npm run gen:api` against the running backend's OpenAPI doc
// (openapi-typescript) and import from ./schema instead.

export type IssueStatus =
  | 'NEW' | 'IN_PROGRESS' | 'ON_HOLD' | 'RESOLVED' | 'CLOSED' | 'REOPENED';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type CommentVisibility = 'INTERNAL' | 'REPORTER_VISIBLE';
export type Role = 'FOCAL_POINT' | 'DEVELOPER' | 'ADMIN';

export interface ReporterIssueSummary {
  id: string;
  referenceNo: string;
  status: IssueStatus;
  priority: Priority;
  createdAt: string;
  updatedAt: string;
  hasUpdates: boolean;
}

export interface ReporterIssueDetail {
  id: string;
  referenceNo: string;
  status: IssueStatus;
  priority: Priority;
  description: string;
  createdAt: string;
  updatedAt: string;
  attachments: {
    id: string; filename: string; contentType: string; sizeBytes: number; downloadable: boolean;
  }[];
  updates: { body: string; createdAt: string; author: string; fromReporter: boolean }[];
}

export interface StaffMe {
  id: string;
  name: string;
  email: string;
  roles: { role: Role; platformId: string | null }[];
}

export type SlaState = 'on_track' | 'at_risk' | 'breached' | null;

export interface StaffIssueSummary {
  id: string;
  referenceNo: string;
  status: IssueStatus;
  priority: Priority;
  version: number;
  createdAt: string;
  updatedAt: string;
  descriptionPreview: string;
  slaState: SlaState;
  dueAt: string;
  platform: { id: string; key: string; name: string } | null;
  reporter: { id: string; name: string } | null;
  assignee: { id: string; name: string } | null;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface StaffIssueDetail extends StaffIssueSummary {
  description: string;
  resolvedAt: string | null;
  closedAt: string | null;
  jiraIssueKey: string | null;
  jiraSyncStatus: string;
  comments: {
    id: string;
    body: string;
    visibility: CommentVisibility;
    authorType?: 'STAFF' | 'REPORTER' | 'SYSTEM';
    author: { id: string | null; name: string } | null;
    createdAt: string;
    editedAt: string | null;
  }[];
  attachments: {
    id: string; filename: string; contentType: string; sizeBytes: number; scanStatus: string;
  }[];
  history: {
    action: string; field: string | null; oldValue: string | null;
    newValue: string | null; actorType: string; createdAt: string;
  }[];
}

export interface DashboardSummary {
  totals: { all: number; open: number; resolvedOrClosed: number };
  byStatus: { key: string; count: number }[];
  byPriority: { key: string; count: number }[];
  byPlatform: { key: string; count: number }[];
  byAssignee: { assigneeId: string; name: string; count: number }[];
  trend: { created: { day: string; count: number }[]; resolved: { day: string; count: number }[] };
  sla: { overdue: number; atRisk: number };
}

export interface AssigneeOption {
  id: string;
  name: string;
  email: string;
}

export interface BulkResult {
  updated: number;
  skipped: { id: string; reason: string }[];
}

export interface StaffNotification {
  id: string;
  trigger: string;
  createdAt: string;
  readAt: string | null;
  issue: { id: string; referenceNo: string; platformKey: string | null } | null;
}

export interface NotificationFeed {
  unread: number;
  items: StaffNotification[];
}

export interface PlatformItem {
  id: string;
  key: string;
  name: string;
  status: string;
  jiraProjectKey: string | null;
  jiraEnabled: boolean;
  createdAt: string;
}

export interface SavedViewDto {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  updatedAt: string;
}

export interface AuditEntry {
  id: string;
  actorType: string;
  actorId: string | null;
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  issue: { id: string; referenceNo: string } | null;
}
