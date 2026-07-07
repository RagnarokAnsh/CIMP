---
title: Auth and Authorization
tags: [cimp, auth, security]
updated: 2026-07-06
---
# Auth and Authorization
← [[CIMP - Home]]

Two **independent** auth paths. Identity is proven by a token; **what you can do is decided by the database** (role grants), never the token.

## 1) Reporter hand-off (no login)
End users of a connected product never log into CIMP. Their product ("portal") vouches for them.

- **Flow:** portal backend mints a short-lived **HS256 JWT** signed with that platform's `handoffSecret`, delivered to the reporter SPA as `?handoff=<jwt>` (query) or `postMessage` (origin-allow-listed). SPA stores it in `sessionStorage`, sends it as **`X-Handoff-Token`** on every `/api/reporter/*` call.
- **Claims** (`src/handoff/handoff.types.ts`): `platformKey`, `portalUserId`, `name`, `email`, `exp`.
- **Verify** (`src/handoff/handoff.service.ts` → `HandoffGuard`): `jwt.decode` reads the (unverified) `platformKey` → load that ACTIVE platform → `jwt.verify` with its `handoffSecret`, **`algorithms:['HS256']`, `maxAge:'15m'`, and `exp` required** → context = `{ platformId, platformKey, reporter }` **from the DB row, not decoded claims**.
- Reporter is auto-provisioned on first intake (keyed platform + `portalUserId`).
- The reusable minter is the [[cimp-connect Package]].

## 2) Staff self-issued JWT (email/password)
No external IdP.
- `POST /api/auth/login` → `LocalAuthService`: `bcrypt.compare`, then `jwt.sign({ sub: local:<email>, name, email, tv }, JWT_SECRET, HS256)`. `tv` = `StaffUser.tokenVersion`.
- `JwtAuthGuard` (`src/auth/jwt-auth.guard.ts`) verifies → `AuthService.upsertFromClaims`: loads the `StaffUser`, **rejects if not ACTIVE or if `tv` ≠ current `tokenVersion`** (session revocation), loads role grants.
- **Session revocation:** password reset / disable bumps `tokenVersion` → old tokens instantly invalid. `JWT_SECRET` must be ≥32 chars in prod ([[Configuration and Env]]).
- **SSE auth (H8):** `EventSource` can't send headers, so instead of the 8h JWT in the URL, `POST /api/staff/events/ticket` (bearer) returns a **~30s audience-scoped ticket**; `SseAuthGuard` verifies `?ticket=`. Frontend re-fetches a ticket on reconnect.

## Authorization — scoping (the crown jewel)
`src/authz/scope.service.ts`: `scopedPlatformIds(staff)` → `'ALL' | string[]`; `canAccessPlatform(staff, platformId, roles)`; `scopeAllows(...)`.

- **Roles** (`UserPlatformRole` = `{ role, platform | null }`):
  - `FOCAL_POINT` — **always per-platform** (triage role).
  - `DEVELOPER` — per-platform **or** global (`platform = null`).
  - `ADMIN` — **always global**, unscoped.
- **`PlatformAccessGuard`** (`src/authz/platform-access.guard.ts`): for issue-`:id` routes, resolves the issue's platform and requires a `@Roles` role for it. **Out-of-scope → 404** (identical to not-found, so issue ids can't be enumerated across tenants). Wrong-role-but-in-scope → 403.
- **OD-09 seam:** `FOCAL_POINT_CAN_TRANSITION` toggles whether focal points may change **status**. Decision [[Decisions and Glossary|L1]]: focal points **keep** assign/priority regardless (they are the triage role).

## Tests
`src/handoff/handoff.service.spec.ts` (alg-pinning, expiry, unknown/inactive platform, wrong secret, missing claims), `src/authz/scope.service.spec.ts`, `test/authorization.e2e-spec.ts` (403/404 scoping).

Related: [[Security Audit and Hardening]] · [[Data Model]] · [[cimp-connect Package]]
