---
title: Module - Admin
tags: [cimp, backend, admin, module]
updated: 2026-07-06
---
# Module - Admin (`src/admin`)
← [[Backend Modules and API]] · [[CIMP - Home]]

**Purpose:** Admin-only management surface for platforms (CRUD + hand-off secret rotation), staff users (create + password reset), role assignments (grant/revoke), and audit-log querying — every route is global-admin gated and every mutation is audited.

## Files
| File | Responsibility |
|---|---|
| `admin.module.ts` | Wires `AdminController` + `AdminService`; imports `TypeOrmModule.forFeature([Platform, StaffUser, UserPlatformRole])`, `AuthModule` (for `JwtAuthGuard`/`LocalAuthService`), `AuthzModule` (for `RolesGuard`). `AuditService` is available via a globally-exported audit module (not re-imported here). |
| `admin.controller.ts` | `@Controller('admin')`, all routes guarded by `JwtAuthGuard + RolesGuard` and `@Roles(Role.ADMIN)`. Thin — delegates to `AdminService`; `GET /audit` delegates straight to `AuditService.query`. |
| `admin.service.ts` | All business logic: platform/staff/role persistence, secret generation, password hashing, scope validation, and audit records — each mutation wrapped in a single DB transaction alongside its audit write. |
| `dto/create-platform.dto.ts` | Create-platform body: `key` (regex `^[a-z0-9-]{2,40}$`), `name` (2–120), optional `status`, `jiraProjectKey`, `jiraEnabled`, `handoffSecret` (32–200 chars). |
| `dto/update-platform.dto.ts` | Partial platform update: `name`, `status`, `jiraProjectKey` (nullable), `jiraEnabled`. **No `key`** — platform key is immutable (tokens reference it). |
| `dto/assign-role.dto.ts` | `staffUserId` (uuid), `role` (enum), `platformId` (uuid or `null` for global; validated only when non-null). |
| `dto/audit-query.dto.ts` | Audit filter: `actorType`, `action`, `issueId`, `from`/`to` (ISO8601), `page` (≥1), `pageSize` (1–200, default 50). |
| `dto/create-staff.dto.ts` | `name` (1–120), `email` (`@IsEmail`), `password` (12–200). |
| `dto/set-password.dto.ts` | `password` (12–200). |

## Public surface
All routes are prefixed `/api` (global prefix) and require **staff JWT with ADMIN role**.

| Method + Route | Handler → Service method | Notes |
|---|---|---|
| `GET /api/admin/platforms` | `listPlatforms` | Ordered by `createdAt ASC`; secret never returned. |
| `POST /api/admin/platforms` | `createPlatform` | 409 on duplicate `key`; generates random secret if none supplied. |
| `PATCH /api/admin/platforms/:id` | `updatePlatform` | `:id` via `ParseUUIDPipe`; 404 if missing. |
| `POST /api/admin/platforms/:id/rotate-secret` | `rotateSecret` | Returns `{ id, key, handoffSecret }` — **only place the secret is exposed**. |
| `GET /api/admin/staff` | `listStaff` | Includes flattened role assignments (`id, role, platformId, platformKey`). |
| `POST /api/admin/staff` | `createStaff` | 409 on duplicate email/idpSubject. |
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
- **`createStaff`** — lowercases email, sets `idpSubject = local:<email>` so the self-issued login token's `sub` resolves back; hashes via `LocalAuthService.hashPassword` (bcrypt, static method); 409 on `[{ email }, { idpSubject }]`; audit `STAFF_CREATED`.
- **`setStaffPassword`** — re-hashes password AND increments `tokenVersion` (`(tokenVersion ?? 1) + 1`) to invalidate any JWT issued before the reset; audit `STAFF_PASSWORD_SET`.
- **`assignRole`** — scope rules: `FOCAL_POINT` **requires** `platformId` (400 otherwise); `ADMIN` **must not** have `platformId` (400 otherwise); developers may be either. Validates staff + platform existence (404), dedupes existing grant (`platform: IsNull()` for global) → 409; audit `ROLE_ASSIGNED`.
- **`revokeRole`** — loads grant with `staffUser`+`platform` relations, `em.remove`, audit `ROLE_REVOKED` (records `oldValue = role`).

## Guards & auth
`JwtAuthGuard` (verifies self-issued staff JWT, upserts `StaffUser`) → `RolesGuard` + `@Roles(Role.ADMIN)`. No platform scoping — admins are unscoped/global. See [[Auth and Authorization]].

## Dependencies (injected)
- `AdminService`, `AuditService` (into controller).
- `Repository<Platform|StaffUser|UserPlatformRole>`, `DataSource`, `AuditService` (into service).
- `LocalAuthService.hashPassword` (static, from [[Module - Auth]]).

## Events (emitted/consumed)
No domain events. Instead every mutation writes an **audit record** in the same transaction via `AuditService.record(input, em)`. Actions emitted: `PLATFORM_CREATED`, `PLATFORM_UPDATED`, `PLATFORM_SECRET_ROTATED`, `STAFF_CREATED`, `STAFF_PASSWORD_SET`, `ROLE_ASSIGNED`, `ROLE_REVOKED` (all `actorType = STAFF`, `actorId = admin.id`). See [[Domain Events and Issue Lifecycle]].

## Entities touched
`Platform` (key, name, status, jiraProjectKey, jiraEnabled, handoffSecret), `StaffUser` (idpSubject, name, email, passwordHash, tokenVersion, status), `UserPlatformRole` (staffUser, platform, role), `AuditEvent` (written). See [[Data Model]].

## Gotchas / invariants
- **`handoffSecret` is write/rotate-only** — surfaced solely by `rotateSecret`, never in list/get. Rotating breaks existing portal hand-off tokens until the portal owner updates their backend.
- **Platform `key` is immutable** — absent from `UpdatePlatformDto` by design (tokens reference it).
- **Password reset revokes sessions** by bumping `tokenVersion`; JWT verification must compare token version (see [[Auth and Authorization]]).
- **Role scope enforcement lives here** at assign time (focal→platform-scoped, admin→global) mirroring `ScopeService` assumptions.
- **Global `ValidationPipe`** (whitelist + forbidNonWhitelisted) rejects any body field not declared on the DTO.
- Duplicate detection: platform by `key`, staff by email/idpSubject, role by (staffUser, role, platform/IsNull) → all `409 Conflict`.

## Related
[[Backend Modules and API]] · [[Auth and Authorization]] · [[Module - Auth]] · [[Module - Authz]] · [[Module - Audit, Events and Health]] · [[Data Model]] · [[Security Audit and Hardening]] · [[Configuration and Env]] · [[Integrations]] · [[CIMP - Home]]
