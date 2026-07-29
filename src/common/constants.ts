import { IssueStatus, ScanStatus } from './enums';

// The statuses that count as "live work" — SLA tracking, dashboards, the
// escalation sweep and deflection all share this one definition.
export const OPEN_ISSUE_STATUSES: readonly IssueStatus[] = [
  IssueStatus.NEW, IssueStatus.IN_PROGRESS, IssueStatus.ON_HOLD, IssueStatus.REOPENED,
];

// Upload limits (see OD-04). Enforced both at the Multer layer and in the service.
export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
];

// Attachments that have cleared (or skipped) scanning may be downloaded by
// reporters and staff, and pushed to Jira. PENDING and INFECTED must never leave
// the system. This is a security boundary, so it is defined exactly once — it
// previously lived in three places (reporter, attachments, jira listener) that
// happened to agree; the risk was always the next edit to one of them.
export const SERVABLE_SCAN_STATUSES: ReadonlySet<ScanStatus> = new Set([
  ScanStatus.CLEAN,
  ScanStatus.SKIPPED,
]);
