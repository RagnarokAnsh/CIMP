---
title: Module - Issues
tags: [cimp, backend, issues]
updated: 2026-07-06
---
# Module - Issues (`src/issues/`)
← [[Backend Modules and API]] · [[CIMP - Home]]

**Purpose:** The staff-facing core of the platform — list/search/detail of issues, status/assignment/priority mutations (state-machine + optimistic-lock enforced), bulk edits, CSV export, SLA computation, and scan-gated attachment downloads.

> Issue **creation** does not live here — reporters create issues through the intake path (see [[Backend Modules and API]] / intake module). This module owns everything staff do to an *existing* issue. The feature sub-modules physically colocated in this directory (links, labels, watchers, automation) are documented in [[Features - Shipped]]; this note covers only the core and gives pointers.

## Files
| File | Responsibility |
|---|---|
| `issues.module.ts` | Wires the core: registers `Issue/StaffUser/Attachment/UserPlatformRole/Platform` repos, imports [[Auth and Authorization]]'s `AuthModule`+`AuthzModule`; declares `IssuesController`, `AttachmentsController`, `StaffPlatformsController`; providers `IssuesService`+`AttachmentsService`; **exports `IssuesService`**. |
| `issues.controller.ts` | `staff/issues` HTTP surface — list, export, detail, assignees/members, bulk, and the three PATCH mutations. |
| `issues.service.ts` | All query + mutation logic, scoping, state-machine gate, OD-09 focal-point gate, audit writes, event emission, bulk loop. |
| `platforms.controller.ts` | `StaffPlatformsController` — read-only scoped platform list (`GET /api/staff/platforms`) that powers the list filter. |
| `attachments.controller.ts` | `staff/attachments/:id/download` — scan-gated, access-checked file download. |
| `attachments.service.ts` | Loads attachment, checks platform scope + scan status, reads bytes from `StorageService`. |
| `status-machine.ts` | `STATUS_TRANSITIONS` table + `canTransition(from,to)`. Pure. |
| `status-side-effects.ts` | `applyStatusSideEffects(issue, to)` — the resolvedAt/closedAt/REOPENED-reset side-effects, extracted so the Jira inbound path ([[Module - Jira]]) reuses the exact same logic. Pure (mutates the entity in place). |
| `sla.ts` | `SLA_TARGET_HOURS` (per-priority, env-overridable), `computeSla()` (JS) and `slaDueSql()` (SQL) kept in sync. |
| `issues.csv.ts` | `toCsv(issues)` — RFC-4180-ish CSV with spreadsheet formula-injection neutralisation. |
| `dto/list-issues.dto.ts` | `ListIssuesDto` (filters, paging, sort) + `IssueSortField`/`SortOrder` enums. |
| `dto/update-status.dto.ts` | `UpdateStatusDto` (target status + required `version`). |
| `dto/update-assignment.dto.ts` | `UpdateAssignmentDto` (nullable `assigneeId` + required `version`). |
| `dto/update-priority.dto.ts` | `UpdatePriorityDto` (priority + required `version`). |
| `dto/bulk-update.dto.ts` | `BulkUpdateDto` + `BulkOp` enum (status/priority/assignee, max 200 ids). |
| `*.spec.ts` | Unit tests: `status-machine.spec`, `issues.csv.spec`, `attachments.service.spec`, `update-dtos.spec`. |
| `issue-links.*`, `labels.*`, `watchers.*`, `automation.*` | Feature sub-modules (own `@Module`s, controllers, services) — see [[Features - Shipped]]. |

## Public surface
All staff routes are behind `JwtAuthGuard`; issue routes add `PlatformAccessGuard`. `TRIAGE_ROLES = [FOCAL_POINT, DEVELOPER, ADMIN]`.

**`IssuesController` (`@Controller('staff/issues')`, `JwtAuthGuard` + `PlatformAccessGuard`)**
| Method + Route | Roles | Handler |
|---|---|---|
| `GET /api/staff/issues` | TRIAGE | `list` — scoped, filtered, paginated list |
| `GET /api/staff/issues/export` | TRIAGE | `export` — streams `text/csv` attachment `issues.csv` |
| `GET /api/staff/issues/:id` | TRIAGE | `getOne` — full detail (comments, attachments, history) |
| `GET /api/staff/issues/:id/assignees` | TRIAGE | `assignees` — developers assignable to this issue |
| `GET /api/staff/issues/:id/members` | TRIAGE | `members` — active staff on platform (for @mentions) |
| `PATCH /api/staff/issues/bulk` | TRIAGE | `bulk` — one op across many issues |
| `PATCH /api/staff/issues/:id/status` | TRIAGE | `changeStatus` (service applies OD-09 gate) |
| `PATCH /api/staff/issues/:id/assignment` | TRIAGE | `changeAssignment` |
| `PATCH /api/staff/issues/:id/priority` | TRIAGE | `changePriority` |

> Route order matters: the literal `bulk` and `export` paths are declared so they resolve before the `:id` param routes (all `:id` params use `ParseUUIDPipe`, so a non-UUID `bulk`/`export` couldn't collide anyway).

**Other controllers**
- `GET /api/staff/platforms` — `StaffPlatformsController`, `JwtAuthGuard` only (no role decorator; scope filtering done in service).
- `GET /api/staff/attachments/:id/download` — `AttachmentsController`, `JwtAuthGuard` only; per-attachment platform scope + scan gate enforced in service.

**Feature sub-module routes** (see [[Features - Shipped]]): `staff/issues/:id/links`, `staff/issues/:id/labels`, `staff/issues/:id/watchers`, `staff/platforms/:platformId/labels`, `staff/platforms/:platformId/automation-rules`.

## Key classes & logic

### `IssuesService`
Injects `Issue/StaffUser/UserPlatformRole/Platform` repos, `DataSource`, [[Auth and Authorization]]'s `ScopeService` + `AuthService`, `AuditService`, `EventEmitter2`, `ConfigService`.

**Queries**
- `list(staff, dto)` — resolves `scope = scopedPlatformIds(staff)` (returns `'ALL'` for admins/global, else an id array); empty array short-circuits to empty page. Builds the query via `buildListQuery`, applies `skip/take` pagination. When the search string yields FTS terms, adds a named `ts_rank(...)` select and orders by `rank DESC` then the requested sort; otherwise orders by the requested sort only. Returns `{ data, total, page, pageSize }` with rows mapped through `toListItem`.
- `listAllForExport(staff, dto)` — same filters/scope, **no pagination**, hard-capped at `EXPORT_MAX_ROWS = 50_000` to avoid OOM on unfiltered exports.
- `getDetail(issueId)` — loads issue with platform/reporter/assignee/attachments/comments(+author); 404 if missing. Pulls audit history via `AuditService.forIssue`. Merges `computeSla(issue)`. Comments sorted ascending by `createdAt`; reporter-authored comments fall back to `authorName ?? 'Reporter'`. Only exposes attachment scan status, not storage keys.
- `listScopedPlatforms(staff)` — platforms in scope (or all), for the filter dropdown.
- `listAssignees(issueId)` — active staff holding a `DEVELOPER` grant on the issue's platform **or** a global (`platform_id IS NULL`) developer grant; deduped by id, name-sorted.
- `listPlatformMembers(issueId)` — broader: any active staff with **any** role on the platform, plus global staff (for @mentions).

**Mutations** — public handlers (`changeStatus/changeAssignment/changePriority`) `loadForWrite` then delegate to private `apply*` cores and return refreshed `getDetail`. The `apply*` cores do the write/audit/emit so `bulkUpdate` can reuse them on an already-loaded issue (no per-issue detail round-trip).
- `applyStatus` — `assertVersion` → `assertCanTransition` (OD-09) → rejects no-op (`422 UnprocessableEntity`) and illegal transitions (`422`, via `canTransition`) → sets status + `applyStatusSideEffects` → saves + audits in one transaction → emits `STATUS_CHANGED`.
- `applyAssignment` — `assertVersion`; if `assigneeId` set, loads staff, requires `ACTIVE`, and verifies (via `AuthService.loadRoles` + `ScopeService.canAccessPlatform([DEVELOPER])`) the target is a developer on this platform (else `400`); saves + audits; emits `ASSIGNED` (assigneeId may be null = unassign).
- `applyPriority` — `assertVersion`; **no-op now throws `422 UnprocessableEntity`** (`'Issue is already at that priority.'`), matching `applyStatus` (was a silent early return); saves + audits; emits `PRIORITY_CHANGED`.
- `bulkUpdate(staff, dto)` — validates target value up front (bulk writes bypass the request `ValidationPipe`), then loops ids: `loadForWrite`, **write-role** `canAccessPlatform(...STAFF_WRITE_ROLES)` check, dispatch to the matching `apply*` with `version: issue.version` (per-issue current version, so no `assertVersion` 409s within the batch — but the `@VersionColumn` still guards concurrent writes, surfacing as 409 via the filter). Per-issue failures are caught into `skipped[]`; a not-found id and an out-of-scope id both report the **single indistinguishable reason** `'Not found or out of scope'` (closing the same enumeration oracle `PlatformAccessGuard` defends — see [[Module - Authz]]), while genuine 422/409 messages pass through. Never aborts the batch. Returns `{ updated, skipped[] }`.

**Helpers / invariants**
- `buildListQuery` — left-joins platform/reporter/assignee; applies scope (`platform.id IN (:...scopeIds)` unless `'ALL'`), plus optional platform/status/priority/assignee/date filters, plus search (see FTS below).
- `searchParams(q)` — lowercases, splits on whitespace, strips non-alphanumerics per term, builds a **prefix** tsquery (`term:* & term:*`) and a LIKE-escaped reference-no pattern (`%…%`, escaping `\ % _`).
- `assertVersion` — throws `409 Conflict` if the supplied `version` ≠ current (optimistic lock on `Issue.version`). When `version` is `undefined` the check is skipped — but all three mutation DTOs make `version` required, so the guard always runs from HTTP.
- `assertCanTransition` — **OD-09 seam**: base roles `[DEVELOPER, ADMIN]`; adds `FOCAL_POINT` only when config `focalPointCanTransition` (`FOCAL_POINT_CAN_TRANSITION`, default false) is on. Else `403`.
- `applyStatusSideEffects` (now in `status-side-effects.ts`, imported here and by the Jira inbound path) — RESOLVED sets `resolvedAt`; CLOSED sets `closedAt` (once); REOPENED clears `resolvedAt`/`closedAt`/`duplicateOf` **and resets the SLA clock** (`slaStartedAt = now`, `slaBreachedAt = null`, the L8 fix so a reopened old issue doesn't instantly re-breach).

### `status-machine.ts`
`STATUS_TRANSITIONS` (Section 8 of the build spec): NEW→{IN_PROGRESS, ON_HOLD, CLOSED}; IN_PROGRESS→{ON_HOLD, RESOLVED}; ON_HOLD→{IN_PROGRESS, CLOSED}; RESOLVED→{CLOSED, REOPENED}; CLOSED→{REOPENED}; REOPENED→{IN_PROGRESS}. Anything else → `422`. See [[Domain Events and Issue Lifecycle]].

### `sla.ts`
`SLA_TARGET_HOURS` per priority — CRITICAL 4h / HIGH 24h / MEDIUM 72h / LOW 168h, each overridable via `SLA_HOURS_*` env (positive finite else fallback). `SLA_AT_RISK_FRACTION` (default 0.8) is the elapsed fraction at which an open issue flips to `at_risk`. `computeSla(issue, now?)` returns `{ dueAt, slaState }`; state is `null` for non-open (RESOLVED/CLOSED) issues, else `on_track`/`at_risk`/`breached`. `slaDueSql(col)` emits the equivalent SQL `CASE` interval expression so the dashboard aggregate never drifts from the JS path. See [[Configuration and Env]].

### `issues.csv.ts`
`toCsv` writes fixed `HEADERS` (referenceNo, status, priority, platform key, reporter/assignee name, timestamps). `cell()` quotes every field, doubles embedded quotes, and prefixes a `'` when a value starts with `= + - @`, tab, or CR — **formula-injection defense** because reporter names are portal-controlled (from the hand-off token). Rows joined with CRLF. See [[Security Audit and Hardening]].

### `AttachmentsService.getForStaff`
Loads attachment + `issue.platform`; 404 if missing. Requires `canAccessPlatform(staff, platformId, [FOCAL_POINT, DEVELOPER, ADMIN])` else `403`. **Serves only `CLEAN` or `SKIPPED`** scan statuses (`SERVABLE` set) — `PENDING`/`INFECTED` → `403`. Returns `{ buffer, filename, contentType }` from `StorageService.read(storageKey)`. Controller sets `X-Content-Type-Options: nosniff` and a safe `Content-Disposition`.

## Guards & auth
- All controllers: `JwtAuthGuard` (staff JWT → upserts `StaffUser`). `IssuesController` adds `PlatformAccessGuard` + `@Roles(...TRIAGE_ROLES)`. Platforms/attachments controllers use only `JwtAuthGuard` and do scope checks inside the service.
- The **server is the enforcement point**. Scope resolution and per-platform checks are centralized in `ScopeService` (`scopedPlatformIds`, `canAccessPlatform`, `scopeAllows`) — see [[Auth and Authorization]]. A focal point of platform A gets `403`/out-of-scope on platform B.

## Dependencies (injected)
`IssuesService`: repos `Issue/StaffUser/UserPlatformRole/Platform`, `DataSource`, `ScopeService`, `AuditService` ([[Backend Modules and API]]), `AuthService`, `EventEmitter2`, `ConfigService`. `AttachmentsService`: `Attachment` repo, `ScopeService`, `StorageService` ([[Integrations]] / storage seam).

## Events (emitted)
Via `EventEmitter2` (`src/events/issue-events.ts`), consumed out-of-band by notifications / Jira sync / automation — see [[Domain Events and Issue Lifecycle]]:
- `IssueEvents.STATUS_CHANGED` → `IssueStatusChangedEvent { issueId, platformId, from, to, actorStaffId }`
- `IssueEvents.ASSIGNED` → `IssueAssignedEvent { issueId, platformId, assigneeId|null, actorStaffId }`
- `IssueEvents.PRIORITY_CHANGED` → `IssuePriorityChangedEvent { issueId, platformId, from, to, actorStaffId }`

This module **consumes** no events. (The colocated `automation.listener.ts` consumes them — [[Features - Shipped]].)

## Entities touched
`Issue` (read/write; optimistic `version`, `status`, `priority`, `assignee`, `resolvedAt`/`closedAt`, `searchVector`), `StaffUser`, `UserPlatformRole`, `Platform`, `Attachment`, plus `Comment` (read in detail) and audit records. See [[Data Model]].

## Gotchas / invariants
- **Bulk bypasses the request pipe.** `bulkUpdate` validates status/priority target values manually before the loop — don't remove those checks. It passes each issue's own freshly-read `version`, so `assertVersion` can't fire intra-batch — this is deliberate (documented at the call site), **not** a missing optimistic-lock: the `@VersionColumn` still emits `UPDATE ... WHERE version = X`, so a truly concurrent write raises `OptimisticLockVersionMismatchError` → 409 via the filter.
- **Bulk skip reasons are oracle-safe:** not-found and out-of-scope collapse to one identical reason so the endpoint can't enumerate another platform's issue ids (it carries no `:id`, so `PlatformAccessGuard` never runs on it).
- **No-op writes:** status no-op → `422`; **priority no-op → `422`** (aligned 2026-07-24). Assignment doesn't special-case no-op.
- **FTS:** the search branch relies on the stored, GIN-indexed `issue.search_vector` (populated by a DB trigger over description + comment bodies) — see the `*AddIssueSearchVector*` migration. Prefix tsquery matches as the user types. Reference-number match is a separate `ILIKE` branch with escaped LIKE metacharacters.
- **Export cap:** exports silently truncate at 50k rows — narrow filters to get everything.
- **Detail never leaks storage keys**, only attachment scan status; downloads go through the scan gate.
- `computeSla` treats only NEW/IN_PROGRESS/ON_HOLD/REOPENED as open; resolved/closed report `slaState: null` but still expose `dueAt`.

## Related
[[Backend Modules and API]] · [[Auth and Authorization]] · [[Data Model]] · [[Domain Events and Issue Lifecycle]] · [[Features - Shipped]] · [[Configuration and Env]] · [[Security Audit and Hardening]] · [[Integrations]] · [[Architecture Overview]] · [[Frontend Overview]]
