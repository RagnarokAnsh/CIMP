import { Role } from '../common/enums';

// Central role sets — the single place that decides what WATCHER may reach.
// WATCHER is read-only: it belongs to the read set (and to the tenant-isolation
// check in PlatformAccessGuard) but never to the write set. Platform-config
// surfaces (labels catalog writes, automation rules, API tokens) are write-role
// only, including their list endpoints.

// Any staff role that may SEE a platform's issues (list/detail/comments/
// attachments/dashboard/CSV export) and subscribe to issue notifications.
export const STAFF_READ_ROLES: Role[] = [
  Role.FOCAL_POINT,
  Role.DEVELOPER,
  Role.ADMIN,
  Role.WATCHER,
];

// Roles that may MUTATE (status/assignment/priority/comments/labels/links/bulk)
// and manage platform config.
export const STAFF_WRITE_ROLES: Role[] = [
  Role.FOCAL_POINT,
  Role.DEVELOPER,
  Role.ADMIN,
];
