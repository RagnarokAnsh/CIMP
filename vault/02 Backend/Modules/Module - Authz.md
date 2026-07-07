---
title: Module - Authz
tags: [cimp, backend, authorization, security]
updated: 2026-07-07
---
# Module - Authz (`src/authz`)
← [[Backend Modules and API]] · [[CIMP - Home]]

**Purpose:** The centralized authorization backbone — pure role/platform-scope logic plus two NestJS guards that enforce it as the server-side gate (a focal point of one platform cannot reach another's issues).

See also [[Auth and Authorization]] (end-to-end auth flow), [[Security Audit and Hardening]] (the 404-not-403 enumeration defense).

## Files
| File | Responsibility |
|---|---|
| `scope.service.ts` | `ScopeService` — pure functions over a staff member's role grants: `scopedPlatformIds`, `canAccessPlatform`, `scopeAllows`. No DB access. |
| `platform-access.guard.ts` | `PlatformAccessGuard` — role + per-platform enforcement; resolves the issue from route `:id` and applies the 404-not-403 rule. |
| `roles.guard.ts` | `RolesGuard` — role-only enforcement (no platform/issue resolution); used by admin routes. |
| `roles.decorator.ts` | `@Roles(...roles)` decorator + `ROLES_KEY` metadata key that both guards read via `Reflector`. |
| `role-sets.ts` | **Central read/write role sets.** `STAFF_READ_ROLES` = all four roles (incl. `WATCHER`); `STAFF_WRITE_ROLES` = `FOCAL_POINT, DEVELOPER, ADMIN`. The single place that decides what the read-only `WATCHER` role may reach — controllers/services import these instead of hand-rolled `ALL_STAFF_ROLES` copies. |
| `authz.module.ts` | `AuthzModule` — provides & exports the two guards + `ScopeService`; imports `TypeOrmModule.forFeature([Issue])`. |
| `scope.service.spec.ts` | Unit tests for `ScopeService` (no DB). |

## Public surface
No HTTP routes of its own. Exported providers (consumed by issues, comments, dashboard, admin, realtime, labels, watchers, issue-links modules):
- `ScopeService`
- `PlatformAccessGuard`
- `RolesGuard`

Applied at consumer controllers, e.g.:
- Issues: `@UseGuards(JwtAuthGuard, PlatformAccessGuard)` + per-handler `@Roles(...STAFF_READ_ROLES)` on reads (list/export/detail) and `@Roles(...STAFF_WRITE_ROLES)` on mutations (status/assignment/priority/bulk) and on the assignees/members pickers.
- Admin: `@UseGuards(JwtAuthGuard, RolesGuard)` + class-level `@Roles(Role.ADMIN)`.

## Key classes & logic

### `ScopeService` (pure, no DB)
Operates on `AuthenticatedStaff.roles` — a flattened list of `StaffRoleGrant { role: Role, platformId: string | null }` where `platformId === null` means **global scope**. Grants are loaded once at auth time and carried on `req.user`.

- `scopedPlatformIds(staff): PlatformScope` — returns the string literal `'ALL'` if the staff holds any grant with `platformId === null` (admin or global developer); otherwise the distinct set (deduped via `Set`) of platform ids they hold any role on. `PlatformScope = string[] | 'ALL'`. Used to filter list/dashboard queries.
- `canAccessPlatform(staff, platformId, requiredRoles: Role[]): boolean` — true if the staff holds one of `requiredRoles` either globally (`platformId === null`) or specifically for `platformId`.
- `scopeAllows(scope: PlatformScope, platformId): boolean` — `scope === 'ALL' || scope.includes(platformId)`; used after `scopedPlatformIds`.

### `PlatformAccessGuard`
Runs **after** `JwtAuthGuard` (expects `req.user: AuthenticatedStaff`; throws `ForbiddenException('Not authenticated')` if absent). Reads required roles from `@Roles` metadata via `reflector.getAllAndOverride(ROLES_KEY, [handler, class])`, defaulting to `STAFF_WRITE_ROLES` when none declared (**fail-closed**: a read-only `WATCHER` only reaches routes that opt in via an explicit `@Roles`).

Two branches keyed on `req.params.id`:
- **Issue-scoped** (`:id` present): loads `Issue` with `relations: { platform: true }`.
  - Issue not found → `NotFoundException('Issue not found')`.
  - Staff has **no** role on the issue's platform (`!canAccessPlatform(staff, platform.id, STAFF_READ_ROLES)`) → `NotFoundException('Issue not found')`. **This is the key invariant:** out-of-scope existence returns 404 identical to genuinely-missing, so issue ids cannot be enumerated across platforms via a 403-vs-404 oracle. A `WATCHER` grant counts here (the issue "exists" for them); they then get a truthful 403 on write routes.
  - Staff IS scoped but lacks the **specific** role for this action (`!canAccessPlatform(staff, platform.id, required)`) → truthful `ForbiddenException('You do not have access to this issue.')`.
- **No issue context**: requires the role in any scope (`staff.roles.some(g => required.includes(g.role))`) else `ForbiddenException('Insufficient role.')`. Admin routes hit this branch (admins are always global).

### `RolesGuard`
Role-only, no platform/issue resolution. Reads `@Roles` metadata; if none/empty → allows. Otherwise requires `staff.roles.some(g => required.includes(g.role))` else `ForbiddenException('Insufficient role.')`. Used chiefly by admin routes where the role (`ADMIN`) is always global — cheaper than `PlatformAccessGuard` (no DB hit).

### `@Roles` / `ROLES_KEY`
`export const Roles = (...roles: Role[]) => SetMetadata('roles', roles)`. Both guards resolve it with `getAllAndOverride` so handler-level metadata overrides class-level.

## Guards & auth
- These guards are the **enforcement point** (server-side); the frontend only gates UI for UX — see [[Auth and Authorization]] and [[Frontend Overview]].
- Order matters: always list after `JwtAuthGuard`, which populates `req.user`. `PlatformAccessGuard` never authenticates — it only authorizes.
- `Role` enum comes from `src/common/enums.ts` (`FOCAL_POINT`, `DEVELOPER`, `ADMIN`, `WATCHER`).
- **`WATCHER` (2026-07-07)** is a read-only role, grantable per-platform or globally (like `DEVELOPER`). It reads issues/comments (incl. internal)/attachments/labels/links/dashboard/CSV export and may watch issues (subscribe), but: no mutations anywhere, no automation-rules/API-token config (not even list), excluded from the `/members` @mention picker and from crafted-mention delivery (`CommentsService.platformMemberIds` filters to `STAFF_WRITE_ROLES`), and `IssuesService.bulkUpdate` checks **write** access per issue (`canAccessPlatform(..., STAFF_WRITE_ROLES)`), not just read scope — a developer-on-A + watcher-on-B user cannot bulk-mutate B.

## Dependencies (injected)
- `PlatformAccessGuard`: `Reflector`, `ScopeService`, `@InjectRepository(Issue) Repository<Issue>`.
- `RolesGuard`: `Reflector` only.
- `ScopeService`: none (pure).
- Types: `AuthenticatedStaff`, `StaffRoleGrant` from `src/auth/auth.types.ts`.

## Events (emitted/consumed)
None — authz is synchronous and in the request path.

## Entities touched
`Issue` (read-only, via `PlatformAccessGuard` to resolve `issue.platform.id`). See [[Data Model]].

## Gotchas / invariants
- **404-not-403 for out-of-scope issues** is a deliberate enumeration defense, not a bug. Do not "fix" it to return 403.
- `platformId === null` in a grant = global scope; treat it as wildcard everywhere.
- `scopedPlatformIds` returns the literal `'ALL'`, not a list — callers must use `scopeAllows` (or a `=== 'ALL'` check) rather than assuming an array.
- `PlatformAccessGuard` keys entirely on `req.params.id`. Routes that carry an issue id under a different param name won't get issue-scoped enforcement — they fall through to the role-in-any-scope branch.
- Default required roles when `@Roles` is omitted under `PlatformAccessGuard` is `STAFF_WRITE_ROLES` (watchers excluded — fail-closed); `RolesGuard` with no `@Roles` allows everyone (open).
- `scopedPlatformIds` is **read scope** (includes watcher platforms; a global watcher grant returns `'ALL'`). Never use it alone to authorize a mutation — check `canAccessPlatform(..., STAFF_WRITE_ROLES)` per platform instead (see `bulkUpdate`).
- Guards are stateless/request-scoped over `req.user`; role changes only take effect on the next token (roles are re-loaded at auth time, not per-request).

## Related
[[Auth and Authorization]] · [[Security Audit and Hardening]] · [[Backend Modules and API]] · [[Data Model]] · [[Decisions and Glossary]] · [[Architecture Overview]] · [[Module - Issues]] · [[Module - Admin]] · [[CIMP - Home]]
