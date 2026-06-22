# CIMP — Improvement & Roadmap Plan

## Status (last updated this session)

**Shipped** (all verified — typecheck, 25 unit + 8 e2e tests, both builds green):
- Health/readiness probes: `GET /api/health`, `GET /api/ready` (DB check, 503 when down, throttle-exempt).
- Reporter two-way comments: `POST /api/reporter/issues/:id/comments` + staff notification; reporter replies shown to staff with a "Reporter" badge.
- Reporter attachment download: `GET /api/reporter/issues/:id/attachments/:attachmentId` (scoped, scan-gated) + UI.
- Staff attachment download UI in the issue detail panel (scan-status aware).
- Status-change notifications: assignee + focal points emailed/logged on transitions.
- Server-side saved views: new `SavedView` entity + `GET/PUT/DELETE /api/staff/saved-views`; the issues list now persists views server-side (was localStorage).
- Audit log viewer: `GET /api/admin/audit` (filterable, paginated) + admin `AuditPage` + nav + command-palette entry.
- Env-configurable SLA targets (`SLA_HOURS_*`, `SLA_AT_RISK_FRACTION`).
- Real ClamAV `ScanService` (`SCAN_DRIVER=clamav`, INSTREAM over TCP) with a non-fatal prod warning when scanning is the no-op.
- Two-way Jira: outbound status-echo comment on transition (idempotent create + timeouts from the prior pass) and inbound status webhook `POST /api/integrations/jira/webhook` (shared-secret gated, no sync loop).
- **Self-issued JWT staff auth** (no external IdP): `POST /api/auth/login` (bcrypt + HS256), `JwtAuthGuard` verifies it alongside dev/OIDC, admin `POST /api/admin/staff` + `/:id/password`, frontend email/password login via `VITE_AUTH_MODE=local`. RBAC stays in the DB (roles never in the token). Smoke-tested end-to-end (create → login → `/staff/me` 200; wrong password / no token → 401).
- **SSE live updates**: `GET /api/staff/events` (auth via `?access_token=`, scope-filtered per staff, 25s heartbeat). The board, issue lists, detail, and notification bell now update live via `useStaffRealtime`; the bell poll is now a 10-min backstop. Smoke-tested end-to-end (401 without token, `text/event-stream` with, and a real `issue.status_changed` event delivered to a connected admin).

**Deferred (intentional):**
- **BullMQ job queue** — skipped per request.
- **OpenTelemetry tracing + pino structured logging** — invasive, low user-visible value; deferred.
- **Bulk assign-to-arbitrary-developer** and **full reporter status-history timeline** — partial value covered (assign-to-me, conversation timeline); revisit if needed.
- **Markdown in comments** — deferred to avoid XSS surface (would need a sanitizer).

---


A forward-looking plan, written after two full debug passes. The platform is
functionally solid and production-hardened (security headers, fail-closed config,
optimistic locking, scoped authz, scan-gated downloads). What follows is **net-new
value**: features, robustness upgrades, and UX polish — grouped by effort/impact,
not yet implemented.

> Already shipped in the debug passes (for context): helmet + body limits +
> graceful shutdown, fail-closed prod env validation, RFC-5987 download headers,
> required optimistic-lock versions, reference-no collision retry, bulk-update
> efficiency, reporter-view join fix, global 401/403 + 409 handling, postMessage
> origin check, client-side file validation, CSV formula-injection neutralisation,
> Jira create-idempotency + timeouts, label centralisation.

---

## 1. Quick wins (low effort, high value)

- **Reporter-visible comment notifications by email is out of scope, but** wire
  the dead `THROTTLE_INTAKE_LIMIT` env var (currently `reporter.controller.ts`
  hard-codes `10/60s`) so intake rate-limit is configurable, or delete the unused
  config key to remove drift.
- **Attachment download UX**: the staff detail panel lists attachments but there
  is no download button wired to `GET /staff/attachments/:id/download`. Add a
  download affordance with scan-status indication (PENDING/INFECTED shown as
  disabled with a tooltip).
- **Empty/error parity**: a few queries (dashboard, notifications) lack explicit
  error states. Add consistent error cards like `IssuesListPage`.
- **`firstLine`/preview consistency**: reporter and staff use different truncation
  helpers; consolidate in `lib/format.ts`.
- **Toast on reporter intake errors**: `NewIssuePage` shows an inline alert only;
  add a toast for parity with the staff surface.

## 2. Reporter experience

- **Comment back to support**: reporters can currently only read updates. Add a
  reporter reply box that creates a `REPORTER_VISIBLE` comment (new authenticated
  reporter endpoint + event), so the loop is two-way.
- **Attachment download for reporters**: let reporters re-download their own
  uploaded files (scoped, scan-gated) — currently only staff can.
- **Status timeline**: render the issue's public history (status changes) as a
  vertical timeline on the reporter detail page, not just comments.
- **Optimistic "mark seen"**: drive `hasUpdates` clearing instantly on open.

## 3. Staff productivity

- **Saved views server-side**: today saved views live in `localStorage`
  (`IssuesListPage`). Persist them per-staff so they follow the user across
  devices (new `SavedView` entity + CRUD).
- **Keyboard-first triage**: extend `CommandPalette` with actions (assign to me,
  change status, jump to issue) and j/k navigation in the split view.
- **Bulk assignment to any developer** (not just "assign to me"), with the
  skipped-reasons surfacing already in place.
- **SLA configuration UI**: SLA targets are hard-coded in `issues/sla.ts`. Make
  them per-priority/per-platform configurable via an admin screen + entity.
- **@mention everyone affordance** and mention notifications digest.

## 4. Notifications & real-time

- **WebSocket / SSE live updates**: replace the 180s bell poll with a server push
  (NestJS `@WebSocketGateway` or SSE) so new issues, assignments, and mentions
  appear instantly and the board/list invalidate live.
- **Notification dedup + preferences**: add a unique constraint on
  `NotificationLog (issue, recipientRef, trigger)` and a per-staff preference
  (email vs in-app, mute platforms).
- **Status-change notifications**: `STATUS_CHANGED`/`PRIORITY_CHANGED` events are
  emitted but reserved (audit-only). Add opt-in listeners to notify the assignee
  and focal points on transitions (e.g. RESOLVED → reporter-visible note).

## 5. Integrations & data

- **Two-way Jira sync**: currently one-way push on create. Add status mapping
  back from Jira (webhook in) and push status/comment updates out.
- **Real attachment scanning**: ship a ClamAV (or cloud AV) `ScanService`
  implementation; the no-op marks everything `SKIPPED`. Gate prod via the env
  validator (warn/fail if scanning is the no-op in production).
- **Full-text search hardening**: the search uses a GIN `search_vector` migration;
  add comment-body weighting and a trigram index for fuzzy reference lookups.
- **Audit log viewer**: an admin screen over `AuditEvent` with filters
  (actor, action, issue, date) — the data exists but isn't surfaced.

## 6. Reliability & ops

- **Background job queue**: move Jira sync, scanning, and email onto a durable
  queue (BullMQ + Redis) so retries survive restarts (today retries are
  in-process and lost on crash).
- **Health & readiness**: add `/api/health` (liveness) and `/api/ready`
  (DB + storage + queue checks) for orchestrators.
- **Structured logging + request IDs**: swap the default logger for pino with
  correlation IDs; redact secrets.
- **Metrics & tracing**: OpenTelemetry traces + Prometheus counters (intake rate,
  SLA breaches, notification failures).
- **Migrations as the default**: production already requires
  `DB_SYNCHRONIZE=false`; add a baseline migration and CI check that entities and
  migrations are in sync.

## 7. UI / UX polish

- **Density & responsive**: the issues table and board need a mobile/compact
  layout; the board is horizontally scrollable but cards are desktop-sized.
- **Loading skeletons everywhere**: dashboard charts pop in; add skeletons.
- **A11y pass**: focus rings on the board drag handles, ARIA live-regions for
  toasts, color-contrast audit on SLA/status badges in light mode.
- **Dark/light parity**: verify chart colors (`charts` bundle) in light mode.
- **Inline editing**: edit description/priority inline on the detail page with
  optimistic update + the 409 handling already wired.
- **Issue detail polish**: collapse long descriptions, render markdown in
  comments, show relative + absolute timestamps consistently.
- **Onboarding empty states**: first-run admin guidance (create a platform, mint
  a reporter token) linking to the seed flow.

---

## Suggested sequencing

1. **Phase 1 (polish + safety net):** §1 quick wins, attachment download UI,
   health endpoints, notification dedup constraint, real ScanService.
2. **Phase 2 (engagement):** reporter two-way comments, status-change
   notifications, SSE live updates, server-side saved views.
3. **Phase 3 (scale):** BullMQ job queue, two-way Jira, SLA config UI, audit
   viewer, observability stack.

Each phase is independently shippable. Recommend starting with **reporter two-way
comments** (highest user-visible value) and the **real ScanService** (closes the
last production safety gap) in parallel.
