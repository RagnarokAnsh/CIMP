import { IssueStatus } from './enums';

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
