# Build Prompt — Centralized Support & Issue Management Platform

> Paste this into Claude Code (or keep it at the repo root as context). It describes
> the project, what is already implemented, and what to build next. **Read the existing
> codebase before writing anything, follow its conventions, and do not rebuild what
> already exists.** Implement the remaining backend in the order in Section 7, then
> scaffold the frontend (Section 9).

---

## 0. Your task

You are continuing development of an existing **NestJS + TypeORM + PostgreSQL** REST
backend. The reporter-facing slice is done and working. Your job is to:

1. Complete the **backend** — staff authentication, authorization, issue management,
   comments, notifications, dashboard, admin, Jira integration, audit, and production
   hardening.
2. Then scaffold the **frontend** (React + TypeScript + Vite).

Work in vertical slices, keep each slice compiling and tested, and follow the patterns
already established in `src/`. Skip browser-based verification; rely on `npm run typecheck`,
`npm run build`, and unit/e2e tests.

---

## 1. Product context

The organization runs 4–5 internal portals. There is no shared way for portal users to
report problems and no central place for staff to triage and resolve them. This platform
is a lightweight, internal Jira tailored to those portals.

Two distinct audiences:

- **Reporters** — end users already logged into a portal. They raise issues with **no
  login** and a **two-field form** (description + attachments). Their identity arrives
  via a trusted, signed **hand-off token** minted by the portal's backend. They follow
  their issues through an **in-app tracking view** (no email).
- **Staff** — three roles (`FOCAL_POINT`, `DEVELOPER`, `ADMIN`) who log in (OIDC) to a
  management workspace to triage, assign, comment, change status, and resolve issues.
  Focal points and developers are **scoped to specific portals**; admins are global.

A later phase pushes issues into the mapped **Jira** project automatically.

---

## 2. Architecture & key decisions

- **Reporter identity is never trusted from the browser.** It comes only from a signed
  token issued by the portal's backend. The signature is what makes the user object
  trustworthy. (Implemented — see `src/handoff/`.)
- **A reporter is not an account.** It is a lightweight record keyed by
  `(platform, portalUserId)`, auto-created on first submission, used only to group a
  person's issues for the tracking view.
- **Authorization is role + platform scope.** A `UserPlatformRole` row with
  `platform = NULL` means **global** scope. Focal points are always per-platform;
  developers may be per-platform **or** global; admins are global.
- **Files live in object storage**, never in the database — the DB stores only metadata
  and a `storageKey`.

### Resolved open decisions (apply these)

| ID | Decision |
|----|----------|
| OD-01 | Platform is taken from the hand-off token; reporters never pick it. **Done.** |
| OD-02 | Reporter tracking is **in-app only, no email** — same token hand-off reaches a "My issues" view; unread state via `ReporterIssueView`. **Done.** Reporter notifications must remain `IN_APP`. |
| OD-03 | Developers can be **global** (`platform = NULL`) or per-platform. Modeled; **enforce in the authorization guard.** |
| OD-04 | Upload limits: ≤5 files, ≤10 MB each, types `png/jpeg/webp/pdf`. **Done** in `src/common/constants.ts`. |
| OD-05 | Jira sync is **one-way (push)** in the first integrated release; two-way later. |
| OD-06 | Hand-off tokens use **HS256** per-portal secret now; RS256 (portal public key) is a seam in `HandoffService.verify`. |
| **OD-09** | **STILL OPEN.** Default assumption: focal points may **triage** (acknowledge, set priority, assign within their platform) but **status transitions are developer/admin**. Flag this and keep it easy to flip. |
| OD-07/08/10/11 | Business/ops decisions (SLAs, retention, SMTP availability, final stack sign-off). Not blocking. |

---

## 3. Tech stack & conventions

- **Runtime:** Node 22, NestJS 10, TypeORM 0.3, PostgreSQL 16. REST/JSON.
- **Validation:** global `ValidationPipe` (`whitelist + transform + forbidNonWhitelisted`)
  is already set in `main.ts`. Every endpoint takes a validated DTO.
- **Global prefix:** all routes are under `/api`.
- **Entities:** snake_case columns (`@Column({ name: '...' })`), `uuid` PKs,
  `timestamptz` timestamps, enums via `{ type: 'enum', enum: X }`. See `src/entities/`.
- **Enums:** centralized in `src/common/enums.ts`. Reuse them; do not duplicate string
  literals.
- **Modules:** feature module owns its controller/service and imports
  `TypeOrmModule.forFeature([...])` for the entities it touches. Follow `reporter/` and
  `handoff/` as templates.
- **Errors:** throw Nest HTTP exceptions (`BadRequestException`, `UnauthorizedException`,
  `ForbiddenException`, `NotFoundException`, and `UnprocessableEntityException` (422) for
  invalid state transitions).
- **Storage:** depend on the abstract `StorageService`, never on a concrete impl.
- **No secrets in code.** Read everything from config (`src/config/configuration.ts`).

---

## 4. Data model (already implemented)

All 10 entities exist in `src/entities/` with relations wired:

`Platform`, `StaffUser`, `UserPlatformRole`, `Reporter`, `Issue`, `Attachment`,
`Comment`, `AuditEvent`, `NotificationLog`, `ReporterIssueView`.

Key fields to know:

- `Platform`: `key` (unique), `name`, `status`, `jiraProjectKey?`, `jiraEnabled`,
  `handoffSecret` (dev only — move to secrets manager in prod).
- `StaffUser`: `idpSubject` (unique, = OIDC `sub`), `name`, `email`, `status`.
- `UserPlatformRole`: `staffUser`, `platform` (nullable → global), `role`. Unique on
  `(staffUser, role, platform)`.
- `Reporter`: `platform`, `portalUserId`, `name`, `email`. Unique on `(platform, portalUserId)`.
- `Issue`: `referenceNo` (unique), `platform`, `reporter`, `assignee?`, `description`,
  `status` (default `NEW`), `priority` (default `MEDIUM`), `jiraIssueKey?`,
  `jiraSyncStatus`, `resolvedAt?`, `closedAt?`.
- `Comment`: `issue`, `author`, `body`, `visibility` (`INTERNAL` | `REPORTER_VISIBLE`),
  `editedAt?`.
- `AuditEvent`: `issue?`, `actorType`, `actorId?`, `action`, `field?`, `oldValue?`,
  `newValue?`, `metadata?` (jsonb).
- `ReporterIssueView`: `reporter`, `issue`, `lastViewedAt`. Unique on `(reporter, issue)`.

Enums: `Role`, `IssueStatus`, `Priority`, `CommentVisibility`, `ScanStatus`, `ActorType`,
`RecipientType`, `NotificationChannel`, `NotificationStatus`, `JiraSyncStatus`,
`PlatformStatus`, `AccountStatus`.

---

## 5. What is already built (do NOT rebuild)

**Reporter side, end to end**, plus all foundations:

- **Config / bootstrap:** `main.ts` (prefix, validation, CORS), `config/configuration.ts`,
  `app.module.ts` (TypeORM `forRootAsync`, `synchronize` from env).
- **Storage:** `StorageService` (abstract) + `LocalDiskStorageService` + global
  `StorageModule`.
- **Token hand-off:** `handoff.types.ts`, `handoff.service.ts` (decode → load platform by
  `platformKey` → `jwt.verify` HS256 with that platform's secret → validate claims),
  `handoff.guard.ts` (reads `X-Handoff-Token` or `Bearer`), `@Handoff()` decorator,
  `handoff.module.ts`.
- **Reporter module:** `CreateIssueDto` (description 10–5000), `reporter.service.ts`
  (`upsertReporter`, file validation, transactional `createIssue` writing issue +
  attachments + audit, `listForReporter` with `hasUpdates`, `getIssueForReporter`
  exposing **only** reporter-visible comments, `markSeen`), `reporter.controller.ts`.
- **Scripts:** `scripts/seed.ts` (creates demo `portal-a`, prints a working token + curl),
  `scripts/make-token.ts`.
- **Dev infra:** `docker-compose.yml` (Postgres + MinIO), `.env.example`, `README.md`.

### Endpoints implemented (all `/api`, guarded by `HandoffGuard`)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/reporter/issues` | Two-field intake (multipart: `description` + `files[]`). |
| GET | `/api/reporter/issues` | "My issues" list, with `hasUpdates`. |
| GET | `/api/reporter/issues/:id` | Issue detail (reporter-visible updates only). |
| POST | `/api/reporter/issues/:id/seen` | Mark issue seen (drives unread indicator). |

### Known stubs / seams to finish later

- Storage = local disk → implement S3/MinIO `StorageService`.
- Attachments saved with `scanStatus: PENDING` → wire malware scanning.
- `synchronize: true` → replace with migrations for production.
- Hand-off secret on the `platforms` table → resolve from a secrets manager in prod.
- HMAC only → RS256 option (OD-06).

---

## 6. What's left — backend (detailed)

For each item: build it as a feature module, validate inputs, enforce authorization,
write audit events for state-changing actions, and add tests.

### 6.1 Cross-cutting quick wins (do first)

- **OpenAPI/Swagger:** add `@nestjs/swagger`, decorate DTOs/controllers, serve at
  `/api/docs`. This becomes the contract the frontend's typed client is generated from.
- **Global exception filter** with a consistent error body
  `{ statusCode, message, error, timestamp, path }`.
- **Rate limiting:** `@nestjs/throttler`, stricter on `POST /api/reporter/issues`.
- **Event bus:** `@nestjs/event-emitter` — emit domain events (`issue.created`,
  `issue.status_changed`, `issue.assigned`, `comment.added`) so notifications and Jira
  sync are decoupled listeners, not inline calls.

### 6.2 Staff authentication (OIDC)

- Validate IdP-issued JWT access tokens via **JWKS** (`jwks-rsa` + `passport-jwt`, or a
  custom strategy). Config keys: `OIDC_ISSUER`, `OIDC_JWKS_URI`, `OIDC_AUDIENCE`.
- On each authenticated request, **upsert `StaffUser`** from claims (`sub → idpSubject`,
  `name`, `email`).
- `UserPlatformRole` (in our DB) is the **source of truth for scope**. The IdP provides
  authentication; admins assign per-platform roles via the admin module (6.8).
- Provide `JwtAuthGuard` + a `@CurrentStaff()` decorator returning the `StaffUser` plus
  their role assignments.
- Endpoint: `GET /api/staff/me` → profile + role assignments.

### 6.3 Authorization — the backbone (build right after auth)

- `@Roles(...Role[])` metadata decorator.
- A `ScopeService` with:
  - `scopedPlatformIds(staff): string[] | 'ALL'` — `'ALL'` for any global assignment
    (global developer or admin); otherwise the set of platform ids they hold a role on.
  - `canAccessPlatform(staff, platformId, requiredRoles): boolean` — true if the staff has
    one of `requiredRoles` either globally or for that platform.
- A guard that, for routes operating on an issue, resolves the issue's `platformId` and
  enforces `canAccessPlatform`. List endpoints must filter by `scopedPlatformIds`.
- **Acceptance:** a `FOCAL_POINT` of Portal A gets `403` on a Portal B issue; lists return
  only permitted platforms; an `ADMIN` (or global `DEVELOPER`) sees everything.

### 6.4 Issue management (staff)

Add `@VersionColumn` to `Issue` for optimistic locking (return `409` on conflict).

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/staff/issues` | Filters: `platform`, `status`, `priority`, `assigneeId`, `q`, `from`, `to`; pagination + sort. **Scoped.** |
| GET | `/api/staff/issues/:id` | Full detail: all comments (internal + reporter-visible), attachments, reporter info, audit history. |
| PATCH | `/api/staff/issues/:id/status` | Enforce the state machine (Section 8); set `resolvedAt`/`closedAt`; audit; reject invalid transitions with `422`. Developer/admin (focal point per OD-09). |
| PATCH | `/api/staff/issues/:id/assignment` | Assign/reassign to a developer of that platform; audit; emit `issue.assigned`. |
| PATCH | `/api/staff/issues/:id/priority` | Set priority; audit. |

- **Keyword search (`q`):** implement Postgres full-text (a `tsvector` column on `Issue` +
  GIN index via migration, searching description and joined comment bodies). An `ILIKE`
  first cut is acceptable only if you leave a clear TODO to upgrade.

### 6.5 Comments

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/staff/issues/:id/comments` | `body` + `visibility`. Author = current staff. Audit; emit `comment.added`. A `REPORTER_VISIBLE` comment updates the reporter's `hasUpdates` (in-app, no email). |
| PATCH | `/api/staff/comments/:id` | Edit own comment; set `editedAt`. |

`@mentions` are Phase 3.

### 6.6 Notifications

- `NotificationService` with an SMTP email channel (`nodemailer`); driven by domain events.
- Triggers: `issue.created` → email the **focal points** of that platform (FR-NOT-01);
  `issue.assigned` → email the assignee (FR-NOT-02). **Reporter-facing notifications are
  `IN_APP` only** (the `hasUpdates` flag) per OD-02 — do **not** email reporters.
- Log every notification in `NotificationLog`.
- Templates configurable by admin (can start as code, move to DB-backed settings later).

### 6.7 Dashboard & reporting

- `GET /api/staff/dashboard` — counts by status / platform / priority / assignee, plus
  open-vs-resolved trend; **scoped**.
- `GET /api/staff/issues/export` — CSV export of the (filtered, scoped) list.
- Resolution metrics (time-to-acknowledge / time-to-resolve) are a "could" — add if time.

### 6.8 Administration (admin only)

- **Platforms:** `GET/POST/PATCH /api/admin/platforms` (name, key, status,
  `jiraProjectKey`, `jiraEnabled`); rotate the hand-off secret/key.
- **Staff & roles:** assign/revoke `UserPlatformRole` (`staffUserId`, `role`,
  `platformId | null`); list staff.
- **Config:** upload limits and notification templates (optionally move from constants to
  a DB-backed settings table).

### 6.9 Jira integration (one-way push first — OD-05)

- `JiraModule` + `JiraService` using the **Jira Cloud REST API v3** with an API token.
  **Confirm the current authentication model and rate limits at build time** — they change.
- Listener on `issue.created`: if `platform.jiraEnabled`, create a Jira issue in
  `platform.jiraProjectKey`, store `jiraIssueKey`, set `jiraSyncStatus`, then push
  attachments (separate API call). Map fields (description, priority, reporter) and status
  per project config.
- **Resilience:** never block intake on Jira; queue with retry; surface `jiraSyncStatus`
  on the issue. Two-way sync via webhooks is a later phase.

### 6.10 Audit (extend what exists)

- An `ISSUE_CREATED` audit event is already written. Extend a small `AuditService` so
  **every** status change, assignment, priority change, comment, and admin action records
  an `AuditEvent` (actor, action, field, old → new). Surface history in issue detail; add
  an admin audit export.

### 6.11 Production hardening

- **Migrations:** turn off `synchronize` for prod; generate an initial migration; include
  the FTS `tsvector` + GIN index and the `@VersionColumn`.
- **Object storage:** implement an `S3StorageService` (S3/MinIO) and bind it via env;
  generate access-checked URLs for serving attachments.
- **Malware scanning:** scan on upload (e.g. ClamAV); set `Attachment.scanStatus`; do not
  serve `INFECTED`/`PENDING` files.
- **CORS:** restrict to known frontend origins in production.
- **Tests:** unit tests for `ScopeService` and the status state machine; e2e tests for the
  hand-off guard, intake, and the authorization guard (403/scoping).

---

## 7. Suggested build order

1. Cross-cutting quick wins (6.1) — Swagger, error filter, throttler, event bus.
2. Staff auth (6.2) + `GET /api/staff/me`.
3. Authorization backbone (6.3) + tests.
4. Issue management (6.4) + status state machine + optimistic locking.
5. Comments (6.5).
6. Audit extension (6.10).
7. Notifications (6.6) — event-driven, staff email.
8. Dashboard + CSV export (6.7).
9. Admin module (6.8).
10. Production storage + malware scanning (6.11).
11. Migrations + FTS index; disable `synchronize` (6.11).
12. Jira integration (6.9).

Then move to the frontend.

---

## 8. Status workflow (enforce exactly)

Implement as a transition map; reject anything not listed with `422`.

```
NEW         → IN_PROGRESS | ON_HOLD | CLOSED
IN_PROGRESS → ON_HOLD | RESOLVED
ON_HOLD     → IN_PROGRESS | CLOSED
RESOLVED    → CLOSED | REOPENED
CLOSED      → REOPENED
REOPENED    → IN_PROGRESS
```

Side effects: set `resolvedAt` on `→ RESOLVED`; set `closedAt` on `→ CLOSED`; clear both
on `→ REOPENED`. Record an `AuditEvent` for every transition.

---

## 9. Permissions matrix (enforce server-side)

`●` allowed · `–` no · `Scoped` = limited to the staff member's platform(s); global
developers and admins are unscoped.

| Capability | Reporter (token) | Focal Point | Developer | Admin |
|---|---|---|---|---|
| Raise issue / track own issues | ● | ● | ● | ● |
| View issues for a platform | – | Scoped | Scoped | ● |
| View issues across all platforms | – | – | global only | ● |
| Comment / triage / set priority / assign | – | Scoped | Scoped | ● |
| Change issue status | – | per OD-09 (default: –) | Scoped | ● |
| Manage platforms / users / roles / config / Jira | – | – | – | ● |

The reporter has **no** staff routes; their access is entirely via the hand-off token.

---

## 10. Frontend (next, after backend)

**Stack:** React + TypeScript + **Vite** (SPA). Server state: **TanStack Query**. Tables:
**TanStack Table** (+ a component library such as shadcn/ui or MUI). Routing: React Router.
Generate a **typed API client from the backend's OpenAPI** (`openapi-typescript`).

Two surfaces:

**A) Reporter surface (build first — backend is ready).** Minimal. The two-field form +
"My issues" list/detail. It is embedded in / launched from each portal and receives the
hand-off token from the portal (query param or `postMessage`), then sends it as the
`X-Handoff-Token` header on every request. Show `hasUpdates` badges; call `/seen` when an
issue is opened. No login UI.

**B) Staff workspace (after the staff backend).** OIDC login (`react-oidc-context` /
`oidc-client-ts`), then: issue list with filters + search, issue detail (status
transitions, assignment, priority, comments with an internal/reporter-visible toggle,
audit history), dashboard, and admin screens (platforms, users/roles) for admins. Gate UI
by role for UX, but remember the **server is the real enforcement point**.

---

## 11. Endpoint reference

**Built:** `POST /api/reporter/issues`, `GET /api/reporter/issues`,
`GET /api/reporter/issues/:id`, `POST /api/reporter/issues/:id/seen`.

**To build:** `GET /api/staff/me`; `GET /api/staff/issues`, `GET /api/staff/issues/:id`,
`PATCH /api/staff/issues/:id/status`, `.../assignment`, `.../priority`,
`GET /api/staff/issues/export`; `POST /api/staff/issues/:id/comments`,
`PATCH /api/staff/comments/:id`; `GET /api/staff/dashboard`;
`GET/POST/PATCH /api/admin/platforms`, admin role-assignment and config endpoints.

---

## 12. Definition of done (backend)

- All endpoints above implemented, validated, authorized, and documented in Swagger.
- Status transitions enforced; optimistic locking in place.
- Audit events for every state-changing action.
- Staff notifications by email; reporter updates in-app only.
- Migrations replace `synchronize`; FTS index present.
- S3/MinIO storage + malware scanning active.
- Jira one-way push working and resilient.
- Unit tests for scope + state machine; e2e tests for hand-off, intake, and authorization.
