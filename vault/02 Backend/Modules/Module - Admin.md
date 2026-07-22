---
title: Module - Admin
tags: [cimp, backend, admin, module]
updated: 2026-07-22
---
# Module - Admin (`src/admin`)
← [[Backend Modules and API]] · [[CIMP - Home]]

**Purpose:** Admin-only management surface for platforms (full CRUD + hand-off secret rotation), staff users (create, edit, disable/re-enable, delete, password reset), role assignments (grant/revoke), and audit-log querying — every route is global-admin gated and every mutation is audited.

> **Lifecycle model (2026-07-22).** Removal is two operations, not one:
> **disable** (reversible, always available, keeps history) and **delete** (hard,
> narrowly allowed). Prefer disable — the UI defaults to it. Deleting a platform
> is only possible while it holds **no issues** (`Issue.platform` is `ON DELETE
> RESTRICT`); deleting a staff user is possible but loses comment attribution.

## Files
| File | Responsibility |
|---|---|
| `admin.module.ts` | Wires `AdminController` + `AdminService`; imports `TypeOrmModule.forFeature([Platform, StaffUser, UserPlatformRole, Issue])` (`Issue` is read-only — `deletePlatform` counts them), `AuthModule` (for `JwtAuthGuard`/`LocalAuthService`), `AuthzModule` (for `RolesGuard`). `AuditService` is available via a globally-exported audit module (not re-imported here). |
| `admin.controller.ts` | `@Controller('admin')`, all routes guarded by `JwtAuthGuard + RolesGuard` and `@Roles(Role.ADMIN)`. Thin — delegates to `AdminService`; `GET /audit` delegates straight to `AuditService.query`. |
| `admin.service.ts` | All business logic: platform/staff/role persistence, secret generation, password hashing, scope validation, and audit records — each mutation wrapped in a single DB transaction alongside its audit write. |
| `dto/create-platform.dto.ts` | Create-platform body: `key` (regex `^[a-z0-9-]{2,40}$`), `name` (2–120), optional `status`, `jiraProjectKey`, `jiraEnabled`, `handoffSecret` (32–200 chars). |
| `dto/update-platform.dto.ts` | Partial platform update: `name`, `status`, `jiraProjectKey` (nullable), `jiraEnabled`. **No `key`** — platform key is immutable (tokens reference it). |
| `dto/assign-role.dto.ts` | `staffUserId` (uuid), `role` (enum), `platformId` (uuid or `null` for global; validated only when non-null). |
| `dto/audit-query.dto.ts` | Audit filter: `actorType`, `action`, `issueId`, `from`/`to` (ISO8601), `page` (≥1), `pageSize` (1–200, default 50). |
| `dto/create-staff.dto.ts` | `name` (1–120), `email` (`@IsEmail`), `password` (12–200). |
| `dto/update-staff.dto.ts` | Partial identity/lifecycle update: `name` (1–120), `email` (`@IsEmail`, re-keys the login subject), `status` (`AccountStatus`). **No `tokenVersion`/`passwordHash`** — the pipe rejects them. |
| `dto/set-password.dto.ts` | `password` (12–200). |
| `admin.service.spec.ts` | Unit specs for the destructive half — platform delete guard, staff disable/delete, and the last-admin/self lockout guards. |

## Public surface
All routes are prefixed `/api` (global prefix) and require **staff JWT with ADMIN role**.

| Method + Route | Handler → Service method | Notes |
|---|---|---|
| `GET /api/admin/platforms` | `listPlatforms` | Ordered by `createdAt ASC`; secret never returned. |
| `POST /api/admin/platforms` | `createPlatform` | 409 on duplicate `key`; generates random secret if none supplied. |
| `PATCH /api/admin/platforms/:id` | `updatePlatform` | `:id` via `ParseUUIDPipe`; 404 if missing. `status: DISABLED` is the **retire** path. |
| `DELETE /api/admin/platforms/:id` | `deletePlatform` | **409 when it holds any issues** (message names the count + points at disabling); otherwise cascades reporters/roles/labels/tokens/webhooks/rules. |
| `POST /api/admin/platforms/:id/rotate-secret` | `rotateSecret` | Returns `{ id, key, handoffSecret }` — **only place the secret is exposed**. |
| `GET /api/admin/staff` | `listStaff` | Includes `status` + flattened role assignments (`id, role, platformId, platformKey`). |
| `POST /api/admin/staff` | `createStaff` | 409 on duplicate email/idpSubject. |
| `PATCH /api/admin/staff/:id` | `updateStaff` | Name/email/status. `DISABLED` = offboard; email change re-keys `idpSubject`. 400 on self-disable, 409 on last-active-admin. |
| `DELETE /api/admin/staff/:id` | `deleteStaff` | Hard delete. 400 on self, 409 on last-active-admin. |
| `POST /api/admin/staff/:id/password` | `setStaffPassword` | Resets password + bumps `tokenVersion` (session revocation). |
| `POST /api/admin/roles` | `assignRole` | Scope validation; 409 on duplicate grant. |
| `DELETE /api/admin/roles/:id` | `revokeRole` | Removes a `UserPlatformRole` grant. |
| `GET /api/admin/audit` | `AuditService.query` | Filterable, paginated `{ data, total, page, pageSize }`. |

## Key classes & logic

### AdminController
`@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.ADMIN)` applied at class level. Uses `RolesGuard` (not `PlatformAccessGuard`) deliberately — these routes carry platform/role ids, not issue ids, and ADMIN is always global scope. `@CurrentStaff()` injects `AuthenticatedStaff` (passed to every mutating service call as the audit actor).

### AdminService
Injects repos for `Platform`, `StaffUser`, `UserPlatformRole`, plus `DataSource` (for transactions) and `AuditService`. Invariants:

- **`toPlatform(p)`** — serializer that whitelists fields; `handoffSecret` is **never** in list/get responses.
- **`newSecret()`** — `randomBytes(32).toString('hex')` (64 hex chars).
- **`createPlatform`** — pre-checks unique `key` → 409; defaults `jiraEnabled=false`, secret to `newSecret()`; transaction: save + `PLATFORM_CREATED` audit.
- **`updatePlatform`** — patches only provided fields (`!== undefined` checks); transaction: save + `PLATFORM_UPDATED`.
- **`rotateSecret`** — sets new secret, transaction save + `PLATFORM_SECRET_ROTATED`, returns secret once.
- **`deletePlatform`** — counts `Issue` rows for the platform first; >0 → **409** naming the count and directing the caller to `status: DISABLED`. The DB would reject it anyway (`ON DELETE RESTRICT`), so this exists to turn a 500 into an actionable error. Audit `PLATFORM_DELETED`.
- **`updateStaff`** — patches name/email/status. Email change lowercases, checks `[{email},{idpSubject}]` for a clash (409), **re-keys `idpSubject` to `local:<newEmail>` and bumps `tokenVersion`** so old sessions die rather than resolving to a stale subject. `DISABLED` also bumps `tokenVersion`. Guards: self-disable → 400, last active admin → 409. Audit `STAFF_UPDATED`.
- **`deleteStaff`** — hard `em.remove`. Guards: self → 400, last active admin → 409. Audit `STAFF_DELETED`.
- **`assertNotLastAdmin(id, action)`** (private) — counts *other* `ADMIN` grants held by `ACTIVE` staff; zero → 409. Called from `updateStaff` (on disable), `deleteStaff`, and `revokeRole` (when the grant being revoked is `ADMIN`).
- **`createStaff`** — lowercases email, sets `idpSubject = local:<email>` so the self-issued login token's `sub` resolves back; hashes via `LocalAuthService.hashPassword` (bcrypt, static method); 409 on `[{ email }, { idpSubject }]`; audit `STAFF_CREATED`.
- **`setStaffPassword`** — re-hashes password AND increments `tokenVersion` (`(tokenVersion ?? 1) + 1`) to invalidate any JWT issued before the reset; audit `STAFF_PASSWORD_SET`.
- **`assignRole`** — scope rules: `FOCAL_POINT` **requires** `platformId` (400 otherwise); `ADMIN` **must not** have `platformId` (400 otherwise); developers may be either. Validates staff + platform existence (404), dedupes existing grant (`platform: IsNull()` for global) → 409; audit `ROLE_ASSIGNED`.
- **`revokeRole`** — loads grant with `staffUser`+`platform` relations; if `role === ADMIN`, runs `assertNotLastAdmin` first; `em.remove`, audit `ROLE_REVOKED` (records `oldValue = role`).

## Guards & auth
`JwtAuthGuard` (verifies self-issued staff JWT, upserts `StaffUser`) → `RolesGuard` + `@Roles(Role.ADMIN)`. No platform scoping — admins are unscoped/global. See [[Auth and Authorization]].

## Dependencies (injected)
- `AdminService`, `AuditService` (into controller).
- `Repository<Platform|StaffUser|UserPlatformRole>`, `DataSource`, `AuditService` (into service).
- `LocalAuthService.hashPassword` (static, from [[Module - Auth]]).

## Events (emitted/consumed)
No domain events. Instead every mutation writes an **audit record** in the same transaction via `AuditService.record(input, em)`. Actions emitted: `PLATFORM_CREATED`, `PLATFORM_UPDATED`, `PLATFORM_DELETED`, `PLATFORM_SECRET_ROTATED`, `STAFF_CREATED`, `STAFF_UPDATED`, `STAFF_DELETED`, `STAFF_PASSWORD_SET`, `ROLE_ASSIGNED`, `ROLE_REVOKED` (all `actorType = STAFF`, `actorId = admin.id`). `AuditEvent.actorId` is a plain varchar with no FK, so deleting a staff user does **not** erase their history. See [[Domain Events and Issue Lifecycle]].

## Entities touched
`Platform` (key, name, status, jiraProjectKey, jiraEnabled, handoffSecret), `StaffUser` (idpSubject, name, email, passwordHash, tokenVersion, status), `UserPlatformRole` (staffUser, platform, role), `AuditEvent` (written). See [[Data Model]].

## Gotchas / invariants
- **`handoffSecret` is write/rotate-only** — surfaced solely by `rotateSecret`, never in list/get. Rotating breaks existing portal hand-off tokens until the portal owner updates their backend. In **dev**, rotating `portal-a` breaks the Playwright reporter fixtures (they mint tokens against the hard-coded `dev-secret-portal-a`); `npm run seed` now detects and repairs that drift.
- **You cannot lock yourself out.** Self-disable/self-delete → 400; anything that would remove the last `ACTIVE` `ADMIN` grant → 409. Nothing in the app can re-grant `ADMIN`, so this is otherwise DB-access-only recovery.
- **Deleting a platform is issue-count-gated**, not force-able. Retire with `status: DISABLED`, which is enforced at the reporter token gate ([[Module - Handoff]]), self-support, deflection and the weekly digest.
- **Deleting a staff user is lossy but non-destructive to issues**: `Issue.assignee` and `Comment.author` are `ON DELETE SET NULL` (assignments clear, comments survive unattributed); roles/watches/saved views `CASCADE`. Disabling preserves all of it.
- **Changing a staff email re-keys `idpSubject`.** `AuthService.upsertFromClaims` refuses to auto-create a missing `local:` subject, so the stale token 401s instead of resurrecting the old identity as a role-less ghost — see [[Module - Auth]].
- **Platform `key` is immutable** — absent from `UpdatePlatformDto` by design (tokens reference it).
- **Password reset revokes sessions** by bumping `tokenVersion`; JWT verification must compare token version (see [[Auth and Authorization]]).
- **Role scope enforcement lives here** at assign time (focal→platform-scoped, admin→global) mirroring `ScopeService` assumptions.
- **Global `ValidationPipe`** (whitelist + forbidNonWhitelisted) rejects any body field not declared on the DTO.
- Duplicate detection: platform by `key`, staff by email/idpSubject, role by (staffUser, role, platform/IsNull) → all `409 Conflict`.

## Related
[[Backend Modules and API]] · [[Auth and Authorization]] · [[Module - Auth]] · [[Module - Authz]] · [[Module - Audit, Events and Health]] · [[Data Model]] · [[Security Audit and Hardening]] · [[Configuration and Env]] · [[Integrations]] · [[CIMP - Home]]
