---
title: Module - Handoff
tags: [cimp, backend, auth, security]
updated: 2026-07-27
---
# Module - Handoff (`src/handoff`)
← [[Backend Modules and API]] · [[CIMP - Home]]

**Purpose:** Verifies the short-lived, portal-signed JWT that authenticates a reporter (a hand-off token), turning it into a trusted per-request `HandoffContext` — this is the reporter-auth trust boundary.

## Files
| File | Responsibility |
|---|---|
| `handoff.service.ts` | `HandoffService.verify(token)` — decode-then-verify a hand-off JWT against the issuing platform's per-portal secret; returns `HandoffContext`. |
| `handoff.guard.ts` | `HandoffGuard` (`CanActivate`) — extracts the token from the request, calls `verify`, and attaches the result to `req.handoff`. |
| `handoff.types.ts` | `HandoffClaims` (JWT payload shape) and `HandoffContext` (verified request-scoped identity). |
| `handoff-user.decorator.ts` | `@Handoff()` param decorator — injects `req.handoff` (the `HandoffContext`) into a controller method. |
| `handoff.module.ts` | `HandoffModule` — imports `TypeOrmModule.forFeature([Platform])`; provides + exports `HandoffService` and `HandoffGuard`. |
| `handoff.service.spec.ts` | Unit spec asserting every rejection path of `verify` (alg pinning, wrong secret, expiry, exp-required, unknown/inactive platform, missing claims). |

## Public surface
No HTTP routes of its own. It exports two providers consumed by other modules:
- **`HandoffGuard`** — applied via `@UseGuards(HandoffGuard)` on the reporter API (`src/reporter/reporter.controller.ts`, all `/api/reporter/*` routes). See [[Module - Reporter]].
- **`HandoffService`** — injected by `SelfSupportService` (`src/self-support/self-support.service.ts`) to mint/validate self-support hand-off tokens. See [[Module - Self-Support]] / [[Integrations]].
- **`@Handoff()`** decorator — used in reporter controller handlers to read the verified `HandoffContext`.

## Key classes & logic

### `HandoffService.verify(token): Promise<HandoffContext>`
The **only** thing standing between a portal-minted token and another tenant's issues. The identity is trusted *only* because the signature proves it came from the portal's backend — never from the browser. Ordered steps:
1. **Empty check** — no token → `401 UnauthorizedException('Missing hand-off token')` (before any DB lookup).
2. **Unverified decode** — `jwt.decode(token)` reads the `platformKey` claim. No `platformKey` → `401` (before any DB lookup). This claim is attacker-controlled and used *only* to pick which secret to verify against.
3. **Load platform** — `platforms.findOne({ where: { key: decoded.platformKey } })`. Missing platform or `status !== PlatformStatus.ACTIVE` → `401 'Unknown or inactive platform'`. Rejected **before** trusting the signature.
4. **Signature verify** — `jwt.verify(token, platform.handoffSecret, { algorithms: ['HS256'], maxAge: HANDOFF_MAX_AGE })`. Any failure (bad signature, wrong secret, `alg:none`, expired, older than maxAge) is caught and turned into `401 'Invalid or expired hand-off token'`.
5. **exp required** — after verify, `typeof claims.exp !== 'number'` → `401 'Hand-off token must have an expiry (exp).'` Necessary because `jsonwebtoken` only enforces `exp` when present; a portal minting a token without `exp` would otherwise be accepted up to `maxAge`.
6. **Required reporter claims** — missing `portalUserId` / `email` / `name` → `401 'Token missing required reporter claims'`.
7. **Build context** — returns `{ platformId, platformKey, reporter: { portalUserId, name, email, locale } }`. **`platformId` and `platformKey` come from the DB row, not the decoded claims** — the claims cannot forge tenancy.
8. **Optional `locale` claim** — normalized through `baseLocale()` (`'fr-CA'` → `'fr'`); anything malformed becomes `null` rather than rejecting the token. It only selects which cached translation the reporter is served, so the worst case of a bad value is an untranslated message, never a failed hand-off. → [[Module - Translation]]

Invariants:
- **Algorithm pinning:** only `HS256` accepted → `alg:none` and asymmetric-confusion attacks are rejected.
- **`HANDOFF_MAX_AGE = '15m'`** — a module-level constant that is an absolute server-side lifetime cap independent of the `exp` the portal set (sample portals mint 5m tokens). Backstops a leaked/over-long token.
- **Decode-then-verify order:** decode is used only to route to the correct secret; nothing from the unverified payload reaches the returned context except after full verification.
- **Per-portal secret:** each `Platform` row carries its own `handoffSecret` (per-tenant HS256 key), so one portal's token can never validate against another's.
- **RS256 note (OD-06):** to support asymmetric keys, verify with the portal's public key at step 4 instead.

### `HandoffGuard.canActivate(ctx)`
- `extractToken(req)`: reads the **`x-handoff-token`** header first; falls back to a `Bearer` token in the `Authorization` header; else `''`.
- Calls `await this.handoff.verify(token)` and assigns the result to `req.handoff`, then returns `true`. (A failed verify throws `401` from the service, so the guard never returns `false`.)

### `@Handoff()` decorator
`createParamDecorator` returning `req.handoff as HandoffContext`. Must be paired with `HandoffGuard` on the same route, otherwise `req.handoff` is undefined.

## Types
- **`HandoffClaims`** — `platformKey`, `portalUserId`, `name`, `email`, optional `locale`, `iat`, `exp`. The signed payload minted by a portal backend.
- **`HandoffContext`** — `platformId`, `platformKey`, `reporter: { portalUserId, name, email, locale }`. The verified, DB-anchored identity attached to the request.

## Guards & auth
Provides the reporter path of the two independent auth paths (the other is staff `JwtAuthGuard`; see [[Auth and Authorization]]). Reporters never log in. This module performs authentication only; **authorization scoping** for reporters happens downstream (the reporter controller filters by `ctx.platformId`) — see [[Module - Reporter]] and `ScopeService`.

## Dependencies (injected)
- `Repository<Platform>` (`@InjectRepository(Platform)`) — to load `key`, `status`, `handoffSecret`. See [[Data Model]] · [[Entity Reference]].
- `jsonwebtoken` (`jwt.decode` / `jwt.verify`).

## Events
None emitted or consumed.

## Entities touched
- **`Platform`** — read-only lookup by `key`; reads `id`, `status` (`PlatformStatus.ACTIVE`), and `handoffSecret`.

## Gotchas / invariants
- Never trust decoded claims for tenancy — `platformId`/`platformKey` in the returned context always come from the DB row.
- `exp` is mandatory *in addition to* `maxAge`; both must pass.
- The guard accepts the token from either `X-Handoff-Token` or `Authorization: Bearer …`; the SPA uses `X-Handoff-Token`.
- All rejections surface as `401 UnauthorizedException` with distinct messages (useful for debugging, but all map to 401).
- Disabling a platform (`status = DISABLED`) instantly invalidates all its outstanding reporter tokens.
- The spec file is a security regression guard — it asserts each rejection path (`alg:none`, wrong secret, expired, no-exp, unknown/inactive platform, missing claims) would fail loudly if a refactor weakened `verify`.

## Related
- [[Module - Reporter]] — primary consumer (`@UseGuards(HandoffGuard)`, `@Handoff()`).
- [[Module - Self-Support]] · [[Integrations]] · [[cimp-connect Package]] · [[FAFICS Integration]] — token minting side.
- [[Auth and Authorization]] · [[Security Audit and Hardening]] · [[Architecture Overview]] · [[Data Model]] · [[Backend Modules and API]] · [[Configuration and Env]] · [[Decisions and Glossary]]
