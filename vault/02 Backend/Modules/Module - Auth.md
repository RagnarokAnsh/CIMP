---
title: Module - Auth
tags: [cimp, backend, auth]
updated: 2026-07-14
---
# Module - Auth (`src/auth/`)
← [[Backend Modules and API]] · [[CIMP - Home]]

**Purpose:** Staff identity — self-issued HS256 JWT login (email/password, bcrypt), per-request verification + session revocation, and short-lived SSE tickets; identity only, authorization lives in [[Module - Authz]].

> Companion to [[Module - Handoff]] (the *other* auth path: reporter hand-off tokens). This module is **staff-only**. See [[Auth and Authorization]] for the two-path overview.

## Files
| File | Responsibility |
|---|---|
| `local-auth.service.ts` | `LocalAuthService` — password login, JWT mint/verify, SSE ticket sign/verify. The core. |
| `local-auth.controller.ts` | `LocalAuthController` — `POST /api/auth/login` (public, throttled). |
| `auth.service.ts` | `AuthService.upsertFromClaims` — mirror StaffUser from verified claims, enforce revocation, load role grants. |
| `jwt-auth.guard.ts` | `JwtAuthGuard` — plain `CanActivate`; verifies `Bearer` token, attaches `req.user`. |
| `staff.controller.ts` | `StaffController` — `GET /api/staff/me` (guarded). |
| `current-staff.decorator.ts` | `@CurrentStaff()` param decorator → `req.user as AuthenticatedStaff`. |
| `auth.types.ts` | `AuthenticatedStaff`, `StaffRoleGrant`, `TokenClaims` interfaces. |
| `dto/login.dto.ts` | `LoginDto` — `email` (`@IsEmail`), `password` (`@MinLength(8)`). |
| `auth.module.ts` | Wires providers; **exports** `AuthService`, `JwtAuthGuard`, `LocalAuthService`. |
| `local-auth.service.spec.ts` | Unit tests for `login` (valid/wrong-pw/disabled/unknown-email/disabled-secret). |

> **No passport / OIDC strategy files exist.** `JwtAuthGuard` is a hand-rolled `CanActivate`, not `AuthGuard('jwt')`. Comments mention OIDC as an intended future IdP, but today the only path is self-issued (`idpSubject = local:<email>`).

## Public surface
| Method / Route | Guard | Notes |
|---|---|---|
| `POST /api/auth/login` | none (public) | `@Throttle 10/60s`. Body `LoginDto` → `{ accessToken }`. |
| `GET /api/staff/me` | `JwtAuthGuard` | Returns `{ id, name, email, roles }`. |

**Exported providers** (consumed platform-wide): `JwtAuthGuard` and `LocalAuthService` are re-instantiated in any module that does `@UseGuards(JwtAuthGuard)` — hence both are exported. `AuthService` is exported for the same reason (guard depends on it transitively).

## Key classes & logic

### `LocalAuthService` (`local-auth.service.ts`)
Inert unless `JWT_SECRET` is set — `enabled` getter reads `auth.jwtSecret` from config; all entry points return `null`/throw when unset.
- `static hashPassword(plain)` → `bcrypt.hash(plain, 10)` (used by admin/seed when setting passwords).
- `login(email, password)`:
  - Fetches user via QueryBuilder with **`addSelect('u.passwordHash')`** because `passwordHash` is `select:false` on the entity; email match is `LOWER(u.email) = LOWER(:email)`.
  - **Timing-safe existence:** always runs `bcrypt.compare` against a dummy hash when the user/hash is missing, so unknown emails and wrong passwords take the same time. Failure → `401 UnauthorizedException('Invalid email or password.')` + `logger.warn` (audit A09, never logs the password).
  - Blocks non-`ACTIVE` accounts (`AccountStatus.ACTIVE` check) → `401 'This account is disabled.'`.
  - Mints `jwt.sign({ sub: idpSubject, name, email, tv: tokenVersion }, secret, { algorithm:'HS256', expiresIn: auth.jwtExpiresIn ?? '8h' })`.
- `verifyToken(token)` → verifies HS256, then **rejects any token carrying `aud`** (SSE tickets are `aud:'sse'`) **and any without a string `sub`** (deflection subscribe tokens are sub-less), before delegating to `AuthService.upsertFromClaims`. This is what keeps the three `JWT_SECRET` token types non-interchangeable on staff routes (added in e5ecf8c — the `aud` check was missing before, so a 30s SSE ticket previously doubled as a full session). **Returns `null` on any error** (caught) so the guard cleanly 401s.
- `signSseTicket(idpSubject)` → only for an `ACTIVE` user; mints a **`audience:'sse'`, `expiresIn:'30s'`** token carrying just `{ sub, tv }`. Returns `null` if disabled/inactive.
- `verifySseTicket(ticket)` → verifies with **`audience:'sse'` + `maxAge:'30s'`** required, then `upsertFromClaims`. The audience requirement makes session JWTs and SSE tickets **non-interchangeable** in both directions.

### `AuthService.upsertFromClaims(claims)` (`auth.service.ts`)
Called on **every** authenticated request (via both guards). The DB mirrors token identity so role grants can be attached.
- Looks up `StaffUser` by `idpSubject = claims.sub`.
- **Revocation checks (return `null` → 401):** existing user not `ACTIVE`; or `claims.tv !== user.tokenVersion`. Re-checked per request, so disable/password-reset is **immediate**, not deferred to token expiry.
- Refreshes `name`/`email` **only for fields the token actually carries** (`claims.name ?? user.name`), so partial-claims tokens can't clobber the stored profile. Creates a new `StaffUser` when absent (signature already trusted); a concurrent-insert unique violation (PG `23505`) is caught → re-fetch the winner.
  - ✅ **Fixed 2026-07-14 — was the SSE 401-storm root cause.** The SSE ticket passes only `{sub,tv}`; the old `email = claims.email ?? ''` overwrote the stored row to `email=''`/`name=sub` on every connect. With `email` unique+not-null that broke password login and 401-stormed once two rows collided on `''`. Now partial claims leave stored fields intact (regression: `auth.service.spec.ts`).
- Returns `AuthenticatedStaff` with `roles` from `loadRoles`.
- `loadRoles(staffUserId)` → reads `UserPlatformRole` (relation `platform`), maps to `StaffRoleGrant[]` where `platformId: null` means **global scope**.

### `JwtAuthGuard` (`jwt-auth.guard.ts`)
Reads `Authorization: Bearer <token>`, calls `verifyToken`, throws `401` if null, else sets `req.user = staff`. Injects `LocalAuthService`.

## Guards & auth
- `JwtAuthGuard` — session auth for all staff routes (header bearer). Not a passport strategy.
- `SseAuthGuard` (lives in `src/realtime/`, injects this module's `LocalAuthService`) — verifies `?ticket=` for the SSE stream because `EventSource` can't send headers. Ticket flow: `POST /api/staff/events/ticket` (JwtAuthGuard'd) → `signSseTicket` → connect `GET /api/staff/events?ticket=...` → `verifySseTicket`. The full 8h JWT is **never** placed in a URL — see [[Module - Realtime]] / [[Security Audit and Hardening]].
- Authorization (roles/scope) is layered on top by `PlatformAccessGuard` + `@Roles` + `ScopeService` — see [[Module - Authz]] / [[Auth and Authorization]].

## Dependencies (injected)
- `LocalAuthService` ← `Repository<StaffUser>`, `ConfigService`, `AuthService`.
- `AuthService` ← `Repository<StaffUser>`, `Repository<UserPlatformRole>`.
- `JwtAuthGuard` ← `LocalAuthService`.
- Config keys: `auth.jwtSecret` (`JWT_SECRET`, required for staff auth; ≥32 chars in prod), `auth.jwtExpiresIn` (default `8h`). See [[Configuration and Env]].
- External libs: `jsonwebtoken` (HS256), `bcryptjs`, `@nestjs/throttler`.

## Events (emitted/consumed)
None — this module emits no domain events. (Password reset that bumps `tokenVersion` happens in `AdminService`.)

## Entities touched
- **`StaffUser`** (`staff_users`) — `idpSubject` (unique, `local:<email>`), `name`, `email` (unique), `passwordHash` (`nullable`, **`select:false`**), `status` (`AccountStatus`), **`tokenVersion`** (`int`, default 1). See [[Data Model]].
- **`UserPlatformRole`** — read-only here, to load role grants.

## Gotchas / invariants
- **`passwordHash` is `select:false`** — any query needing it must `addSelect`; a plain `findOne` returns it as `undefined`, silently breaking `bcrypt.compare`.
- **Whole module is inert without `JWT_SECRET`** — `enabled` gates login, verify, and SSE tickets. Missing secret ⇒ every login 401s and every guarded route 401s.
- **`tokenVersion` = session revocation lever.** `AdminService` (`src/admin/admin.service.ts:155`) does `user.tokenVersion = (user.tokenVersion ?? 1) + 1` on password reset/disable, instantly invalidating live JWTs (checked in `upsertFromClaims`). Changing the entity default also logs everyone out once on deploy — see [[Session Handoff]].
- **`verifyToken`/`verifySseTicket` swallow all errors → `null`.** Guards translate `null` to a bare `401`; they never leak *why* (expired vs bad signature vs revoked).
- **Three `JWT_SECRET` token types, mutually non-interchangeable** — each verifier pins a distinguishing claim: **session** (`sub`, no `aud`; `verifyToken` rejects any `aud`), **SSE ticket** (`aud:'sse'`+30s; `verifySseTicket` requires it), **deflection subscribe** (`purpose:'subscribe'`, no `sub`). Handoff + self-support tokens sign with the per-portal `handoffSecret`, webhook signatures are per-endpoint HMAC — neither touches `JWT_SECRET`. Nicety: session tokens are identified by *absence* of `aud`/`purpose`; a positive `aud:'staff'` marker would make this self-documenting.
- **Identity ≠ authorization.** A valid token with zero role grants authenticates fine (`GET /me` works) but is denied on scoped routes by [[Module - Authz]].
- Login email match is case-insensitive (`LOWER(...)`), but `StaffUser.email` has a `unique` constraint — mixed-case duplicates can't be created.

## Related
[[Auth and Authorization]] · [[Module - Authz]] · [[Module - Handoff]] · [[Module - Realtime]] · [[Module - Admin]] · [[Data Model]] · [[Configuration and Env]] · [[Security Audit and Hardening]] · [[Backend Modules and API]] · [[Architecture Overview]] · [[Session Handoff]] · [[Decisions and Glossary]]
