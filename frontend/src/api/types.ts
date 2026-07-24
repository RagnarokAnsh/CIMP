// Hand-written API types mirroring the backend responses. For a fully typed
// client, run `npm run gen:api` against the running backend's OpenAPI doc
// (openapi-typescript) and import from ./schema instead.

export type IssueStatus =
  | 'NEW' | 'IN_PROGRESS' | 'ON_HOLD' | 'RESOLVED' | 'CLOSED' | 'REOPENED';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type CommentVisibility = 'INTERNAL' | 'REPORTER_VISIBLE';
export type Role = 'FOCAL_POINT' | 'DEVELOPER' | 'ADMIN' | 'WATCHER';

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
  context: Record<string, unknown> | null;
  csat: { score: number; comment: string | null } | null;
  createdAt: string;
  updatedAt: string;
  attachments: {
    id: string; filename: string; contentType: string; sizeBytes: number; downloadable: boolean;
  }[];
  updates: { body: string; createdAt: string; author: string; fromReporter: boolean }[];
}

export interface SimilarIssue {
  /**
   * Staff-curated public title, present only for an explicitly published
   * known issue. Null keeps an unpublished issue anonymous — the similar-issue
   * search never discloses another reporter's own words.
   */
  title: string | null;
  status: IssueStatus;
  firstReportedAt: string;
  reportCount: number;
  subscribeToken: string;
}

export interface StaffMe {
  id: string;
  name: string;
  email: string;
  roles: { role: Role; platformId: string | null }[];
  /**
   * Mirrors the server's FOCAL_POINT_CAN_TRANSITION seam (OD-09) so the UI can
   * hide controls the server would 403. Gating only — the server still decides.
   * Optional: absent on older responses, and absence must read as "off".
   */
  policy?: { focalPointCanTransition: boolean };
}

/** A row from GET /admin/staff — the account plus its role grants. */
export interface StaffWithRoles {
  id: string;
  name: string;
  email: string;
  /** AccountStatus: 'ACTIVE' | 'DISABLED'. DISABLED blocks login and revokes live tokens. */
  status: string;
  roles: { id: string; role: Role; platformId: string | null; platformKey: string | null }[];
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
  /** SDK-captured diagnostics attached at intake (untrusted reporter input). */
  context: Record<string, unknown> | null;
  /** Reporter's resolution rating (1 = 👍, 0 = 👎). */
  csat: { score: number; comment: string | null; createdAt: string } | null;
  /** Known-issue publication state (deflection). */
  publiclyVisible?: boolean;
  publicTitle?: string | null;
  /** Set when this issue was merged into a canonical issue as a duplicate. */
  duplicateOf: { id: string; referenceNo: string } | null;
  /** Issues merged into this one as duplicates. */
  duplicates: { id: string; referenceNo: string; status: IssueStatus }[];
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
  csat: { count: number; positiveRate: number | null };
  ops: {
    ttfrHours: { p50: number | null; p90: number | null };
    resolutionHours: { p50: number | null; p90: number | null };
    reopenRate: number | null;
    deflected: number;
    deflectionRate: number | null;
  };
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
  /** Per-priority SLA hour overrides; null = env defaults. */
  slaPolicy: Partial<Record<Priority, number>> | null;
  createdAt: string;
}

export interface AutomationRuleView {
  id: string;
  name: string;
  enabled: boolean;
  trigger: 'ISSUE_CREATED' | 'STATUS_CHANGED';
  triggerStatus: IssueStatus | null;
  action: 'SET_PRIORITY' | 'ASSIGN' | 'ADD_LABEL';
  actionValue: string;
  createdAt: string;
}

export interface ApiTokenView {
  id: string;
  name: string;
  lastFour: string;
  revoked: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  /** Present ONLY in the create response. */
  token?: string;
}

export interface WebhookView {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  platformId: string | null;
  createdAt: string;
  /** Present ONLY in the create response. */
  secret?: string;
}

export interface SavedViewDto {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  updatedAt: string;
}

export type IssueLinkType = 'BLOCKS' | 'RELATES' | 'DUPLICATES';

export interface IssueLinkView {
  id: string;
  type: IssueLinkType;
  direction: 'outward' | 'inward';
  issue: { id: string; referenceNo: string; status: IssueStatus };
  createdAt: string;
}

export interface LabelView {
  id: string;
  name: string;
  color: string;
}

export interface WatchersView {
  watching: boolean;
  watchers: { id: string; name: string }[];
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
