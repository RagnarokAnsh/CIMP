---
title: Module - Dashboard
tags: [cimp, backend, dashboard, sla, reporting]
updated: 2026-07-27
---
# Module - Dashboard (`src/dashboard`)
← [[Backend Modules and API]] · [[CIMP - Home]]

**Purpose:** Scope-limited issue aggregates — totals, group-by counts (status / priority / platform / assignee), a 14-day created-vs-resolved trend, SLA overdue/at-risk tallies, CSAT and ops percentiles — computed in the database and always filtered to the caller's platform scope. Serves **two** surfaces: the cross-scope staff dashboard and the single-platform **tenant-owner report**.

## Files
| File | Responsibility |
|---|---|
| `dashboard.module.ts` | Wires the module: imports `TypeOrmModule.forFeature([Issue, Platform])`, [[Auth and Authorization]]'s `AuthModule` and `AuthzModule`; declares `DashboardController` + `PlatformReportController` + `DashboardService`. |
| `dashboard.controller.ts` | `DashboardController` — `GET /api/staff/dashboard` (guards + `@Roles`). `PlatformReportController` — `GET /api/staff/platforms/:platformId/report` (JWT only; scope checked in-service). |
| `dashboard.service.ts` | All aggregation logic — resolves scope via `ScopeService`, runs the aggregates in parallel, shapes the response. |
| `dashboard.service.spec.ts` | 5 specs pinning the **tenant-report access boundary** (scope refusal, watcher allowed, exact-platform scoping, 404, published-only known issues). |

## Public surface
- `GET /api/staff/dashboard` — guards `JwtAuthGuard` + `PlatformAccessGuard` (class-level `@UseGuards`); `@Roles(STAFF_READ_ROLES)`; Swagger tag `staff-dashboard`, bearer `staff`. Handler `DashboardController.summary(staff)` → `DashboardService.summary(staff)`.
- `GET /api/staff/platforms/:platformId/report` — **tenant-owner report**. `JwtAuthGuard` only (this route carries a platformId, not an issue id, so `PlatformAccessGuard`'s `:id` branch doesn't apply); scope enforced in-service against `STAFF_READ_ROLES`. Swagger tag `staff-reporting`. Handler → `DashboardService.platformReport(staff, platformId)`.

Report response = the full summary shape below, plus:
```
{
  platform: { id, key, name },
  ...summary,
  knownIssues: [{ id, referenceNo, status, title, updatedAt }]   // publiclyVisible only, newest 20
}
```

Response shape:
```
{
  totals: { all, open, resolvedOrClosed },
  byStatus:   [{ key, count }],
  byPriority: [{ key, count }],
  byPlatform: [{ key, count }],     // key = platform.key
  byAssignee: [{ assigneeId, name, count }],
  trend: { created: [{ day, count }], resolved: [{ day, count }] },
  sla: { overdue, atRisk }
}
```

## Key classes & logic
**`DashboardService`** (injected `Repository<Issue>`, `Repository<Platform>`, `ScopeService`):
- `summary(staff)` — computes `scope = scopedPlatformIds(staff)` (`'ALL'` for global roles, else a `string[]` of platform IDs). If scope is an empty array (staff with no platform grants), short-circuits to `empty()` (all-zero payload) without touching the DB. Otherwise delegates to `computeForScope`.
- `computeForScope(scope)` — the shared aggregate fan-out (`Promise.all`), then derives `totals` from `byStatus`: `all` = sum of all status counts, `open` = sum over `OPEN_STATUSES` (NEW, IN_PROGRESS, ON_HOLD, REOPENED), `resolvedOrClosed` = all − open. Extracted so the tenant report reuses **every** aggregate rather than re-deriving them.
- `platformReport(staff, platformId)` — **the tenant-owner surface.** Requires a read role *on that platform* (`canAccessPlatform(..., STAFF_READ_ROLES)`) else 403 — checked **before any data is read**. 404s an unknown platform. Then `computeForScope([platformId])` + `publishedKnownIssues(platformId)` in parallel. The read-only **`WATCHER` grant is the canonical tenant-observer role**: it lets a platform's owning team see their support health without any mutation rights.
- `publishedKnownIssues(platformId)` — `publiclyVisible: true` only, newest 20, projecting `publicTitle` (never the reporter's own words).
- `base(scope)` — private query-builder factory on alias `issue`; adds `WHERE issue.platform_id IN (:...ids)` unless scope is `'ALL'`. Every aggregate builds on this so scoping can never be bypassed.
- `groupCount(scope, column, alias)` — generic `SELECT <column> AS key, COUNT(*) GROUP BY <column>`; used for `byStatus` (`issue.status`) and `byPriority` (`issue.priority`). Counts are `Number()`-coerced from Postgres string output.
- `byPlatform(scope)` — left-joins `issue.platform`, groups by `platform.key`.
- `byAssignee(scope)` — left-joins `issue.assignee`, filters `assignee.id IS NOT NULL` (unassigned excluded), groups by assignee id + name; note it re-applies the scope predicate via `.where(...)` (rather than `base`'s) — functionally equivalent because it rebuilds the same filter.
- `trend(scope)` — two separate queries over the last `interval '14 days'`: created issues bucketed by `date_trunc('day', created_at)`, and resolved issues bucketed by `date_trunc('day', resolved_at)` where `resolved_at IS NOT NULL`. Days are `to_char(... ,'YYYY-MM-DD')` strings, ordered ASC. Days with zero rows are simply absent (no zero-fill).
- `slaCounts(scope)` — one query over open issues only (`status IN OPEN_STATUSES`) using Postgres `COUNT(*) FILTER (WHERE ...)`:
  - `overdue` = `now() >= due`, where `due = slaDueSql()` = `created_at + per-priority interval`.
  - `atRisk` = `now() < due AND now() >= created_at + (due - created_at) * SLA_AT_RISK_FRACTION` (default 0.8) — i.e. past the at-risk fraction of the window but not yet breached.

**Invariant — SLA parity:** thresholds are shared with the per-issue JS computation via `src/issues/sla.ts` (`slaDueSql()`, `SLA_AT_RISK_FRACTION`, `SLA_TARGET_HOURS`) so the dashboard aggregate and `computeSla` never drift. See [[Module - Issues]].

## Guards & auth
- `JwtAuthGuard` — verifies the staff JWT, upserts `StaffUser`.
- `PlatformAccessGuard` + `@Roles` — on `/staff/dashboard`, enforce that only read roles reach the handler.
- **The report route is guarded in-service**, not by `PlatformAccessGuard` (it carries a platformId, not an issue id) — `platformReport` refuses before touching data.
- Data-level scoping is enforced independently inside the service via `ScopeService.scopedPlatformIds` + the `base()` WHERE clause — the server is the enforcement point; a focal point only ever sees their own platforms' aggregates. See [[Auth and Authorization]].

## Dependencies (injected)
- `Repository<Issue>` (TypeORM) — all counts read from the `Issue` table.
- `Repository<Platform>` — resolves/validates the platform named by the report route.
- `ScopeService` (from `AuthzModule`) — resolves caller scope.

## Events
None emitted or consumed. Read-only module; not part of [[Domain Events and Issue Lifecycle]].

## Entities touched
`Issue` (read-only), joined to `Platform` (`platform.key`) and `StaffUser` (`assignee.id`, `assignee.name`). See [[Data Model]].

## Gotchas / invariants
- All aggregation happens in SQL (raw `getRawMany`/`getRawOne`); counts arrive as strings and are `Number()`-coerced. Empty groups (statuses/days with no rows) are omitted, not zero-filled — consumers must not assume a fixed set of keys.
- Empty-scope staff get a fully-zeroed `empty()` payload with no DB round-trip.
- SLA and trend queries restrict to open statuses / non-null timestamps respectively; changing the shared `OPEN_STATUSES` list here must stay in sync with `src/issues/sla.ts`.
- SLA target hours and the at-risk fraction are env-tunable (`SLA_HOURS_*`, `SLA_AT_RISK_FRACTION`) — see [[Configuration and Env]].
- **The tenant report is read-role, not write-role.** It is deliberately reachable by a `WATCHER` — that is the whole point of the surface. Never tighten it to `STAFF_WRITE_ROLES` without replacing the tenant-observer story.
- Both surfaces share `computeForScope`, and the frontend shares its cards via `dashboard-widgets.tsx` — keep them in step so the two never disagree about what "SLA on track" means. → [[Frontend - Staff Workspace]]

## Related
[[Module - Issues]] · [[Auth and Authorization]] · [[Backend Modules and API]] · [[Data Model]] · [[Features - Shipped]] · [[Frontend Overview]] · [[Frontend - Staff Workspace]] · [[Configuration and Env]]
