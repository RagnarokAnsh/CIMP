---
title: Module - Notifications
tags: [cimp, backend, notifications]
updated: 2026-07-06
---
# Module - Notifications (`src/notifications`)
← [[Backend Modules and API]] · [[CIMP - Home]]

**Purpose:** Turn issue-lifecycle domain events into staff-facing email + in-app notifications, recording every attempt in `NotificationLog`, and serve each staff member their own notification bell feed.

## Files
| File | Responsibility |
|---|---|
| `notifications.module.ts` | Wires the module: registers `NotificationLog`, `UserPlatformRole`, `StaffUser`, `Issue`, `IssueWatcher` repos + imports `AuthModule`; provides `MailService`, `NotificationsService`, `NotificationsListener`; exports `NotificationsService`. |
| `notifications.listener.ts` | `NotificationsListener` — `@OnEvent` handlers (async) that translate domain events into `NotificationsService` calls; swallows/logs errors so a notification failure never breaks the originating request. |
| `notifications.service.ts` | `NotificationsService` — core logic: resolves recipients (focal points, assignee, watchers, mentions), sends staff email via `MailService`, writes `NotificationLog` rows, and serves the staff bell feed. |
| `notifications.controller.ts` | `NotificationsController` — staff bell endpoints under `/api/staff/notifications` (list + mark-all-read), guarded by `JwtAuthGuard`. |
| `mail.service.ts` | `MailService` — thin nodemailer wrapper; degrades to logging when `SMTP_HOST` is unset; exposes `send()` and `appUrl()`. |

## Public surface
HTTP (all `@UseGuards(JwtAuthGuard)`, `@ApiBearerAuth('staff')`):
- **GET `/api/staff/notifications`** → `listForStaff(staff.id)` — recent notifications (default limit 20, newest first) + unread count for the current staff member.
- **POST `/api/staff/notifications/read`** → `markAllRead(staff.id)` — marks all this staff member's rows read, returns `{ unread: 0 }`.

No platform-scope guard is applied: every row is keyed to the authenticated recipient (`recipientRef = staff.id`), so there is nothing cross-tenant to leak.

Exported provider: `NotificationsService` (consumed elsewhere; the listener is the primary internal caller).

## Key classes & logic

### NotificationsService
Recipient resolution helper `activeRecipients(users)` dedupes by `id` and drops any user without an `email`. Note: `notifyMentions` and `listForStaff` filter on `AccountStatus.ACTIVE`, but the email dispatch paths (`activeRecipients`) do **not** re-check account status — they filter only on presence + email + dedupe.

Notification methods:
- **`notifyFocalPointsOfNewIssue(issueId, platformId)`** (FR-NOT-01) — loads focal-point grants (`UserPlatformRole` where `role = FOCAL_POINT` AND `platform.id = platformId`; global focal points don't exist), emails each with subject `[<platformKey>] New issue <referenceNo>`, trigger `issue.created`.
- **`notifyAssignee(issueId, assigneeId)`** (FR-NOT-02) — no-op if `assigneeId` null; emails the assignee, trigger `issue.assigned`.
- **`notifyStatusChange(issueId, from, to, actorStaffId)`** — recipients = assignee + platform focal points + **issue watchers** (`IssueWatcher` rows), deduped, with the **actor excluded** (`r.id !== actorStaffId`); trigger `issue.status_changed`, subject `[<key>] <ref> → <to>`.
- **`notifyReporterReply(issueId)`** — recipients = assignee + focal points (no watcher fan-out, no actor filter); trigger `comment.reporter_reply`.
- **`notifyMentions(issueId, staffIds, actorStaffId)`** — **in-app only, no email**. Dedupes `staffIds`, drops the actor, keeps only staff that exist AND are `AccountStatus.ACTIVE`, writes one `NotificationLog` row each (`channel = IN_APP`, `status = SENT`, trigger `comment.mention`).
- **`listForStaff(staffId, limit=20)`** — returns `{ unread, items[] }`; items carry `id, trigger, createdAt, readAt, issue{id, referenceNo, platformKey}`.
- **`markAllRead(staffId)`** — bulk `update` setting `readAt = now` where `readAt IS NULL`.

Private **`dispatch(issueId, recipient, trigger, msg)`** — the email path: tries `mail.send()`, sets status `SENT` on success or `FAILED` on throw (logged, not rethrown), then always persists a `NotificationLog` row (`channel = EMAIL`). Email notifications thus also appear in the bell. All message bodies embed a deep link `${mail.appUrl()}/staff/issues/${issueId}`.

**Reporter notifications are IN_APP only (OD-02)** and are never emailed here — the reporter's `hasUpdates` flag handles them elsewhere.

### NotificationsListener
Async `@OnEvent` handlers, each wrapped in try/catch that only logs:
- `IssueEvents.CREATED` → `notifyFocalPointsOfNewIssue`
- `IssueEvents.ASSIGNED` → `notifyAssignee`
- `IssueEvents.STATUS_CHANGED` → `notifyStatusChange`
- `IssueEvents.COMMENT_ADDED` → branch: if `reporterVisible && !actorStaffId` (a reporter reply) → `notifyReporterReply`; else → `notifyMentions(issueId, mentionStaffIds, actorStaffId)`.

### MailService (`OnModuleInit`)
On init reads `mail.host`; if absent, logs a warning and stays in dev/log mode (`transporter = null`). Otherwise builds a nodemailer transport from `mail.{host,port,secure,user,password}` (auth omitted when no user). `send(msg)` returns `true` when actually dispatched, `false` when only logged (`[mail:dev] to=… subject="…"`). `appUrl()` returns `mail.appUrl` or defaults to `http://localhost:5173`.

## Guards & auth
Controller: `JwtAuthGuard` only (staff self-issued JWT). No `@Roles`/`PlatformAccessGuard` — recipient-keyed rows are inherently self-scoped. See [[Auth and Authorization]].

## Dependencies (injected)
- `NotificationsService` ← repos: `NotificationLog`, `UserPlatformRole`, `StaffUser`, `Issue`, `IssueWatcher`; + `MailService`.
- `NotificationsListener` ← `NotificationsService`.
- `NotificationsController` ← `NotificationsService`.
- `MailService` ← `ConfigService`, `nodemailer`.

## Events (consumed)
Consumes (never emits) from [[Domain Events and Issue Lifecycle]]: `issue.created`, `issue.assigned`, `issue.status_changed`, `comment.added`. (Does not consume `issue.priority_changed` or `issue.attachments_scanned`.)

## Entities touched
- **`NotificationLog`** (`notification_logs`) — written on every attempt: `issue` (FK, `onDelete CASCADE`), `recipientType` (STAFF/REPORTER — in practice always STAFF here), `recipientRef` (staff id), `trigger` (string), `channel` (EMAIL/IN_APP), `status` (PENDING/SENT/FAILED), `readAt` (nullable, powers unread dot), `createdAt`.
- **`IssueWatcher`** (`issue_watchers`) — read for status-change fan-out; unique on `(issue, staffUser)`, both FKs cascade-delete.
- **`UserPlatformRole`** — read to resolve platform focal points.
- **`StaffUser`** — read for assignee/mention lookup + `AccountStatus.ACTIVE` filtering.
- **`Issue`** — read for platform/assignee context.

See [[Data Model]] for full entity graph.

## Gotchas / invariants
- Notification failures are non-fatal: listeners and `dispatch` swallow errors so the originating request always succeeds.
- Actor-exclusion applies to `notifyStatusChange` and `notifyMentions` only; `notifyReporterReply` does not exclude anyone (there is no staff actor).
- Mentions never send email (IN_APP only); email notifications always also create a bell row (so they surface in both places).
- `activeRecipients` (email paths) filters on email presence + dedupe but does **not** check `AccountStatus` — a DISABLED staff user with an email could still be emailed on create/assign/status/reply. Only mention + list paths enforce ACTIVE.
- Recipient enum supports `REPORTER`, but this module only writes STAFF rows; reporter updates flow via `hasUpdates` (OD-02).
- With no `SMTP_HOST`, all "sends" are logged and `NotificationLog.status` is still recorded as `SENT` (since `mail.send` resolves without throwing).

## Related
[[Backend Modules and API]] · [[Domain Events and Issue Lifecycle]] · [[Data Model]] · [[Auth and Authorization]] · [[Configuration and Env]] · [[Module - Issues]] · [[Module - Comments]] · [[Integrations]] · [[Architecture Overview]] · [[Decisions and Glossary]]
