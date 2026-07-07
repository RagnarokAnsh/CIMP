---
title: Module - Self-Support
tags: [cimp, backend, integrations, auth]
updated: 2026-07-06
---
# Module - Self-Support (`src/self-support/`)
← [[Backend Modules and API]] · [[CIMP - Home]]

**Purpose:** Registers CIMP as one of its *own* reporter portals so a signed-in staff member can file an issue about CIMP itself — the reference implementation of the portal hand-off integration (see [[cimp-connect Package]]).

## Files
| File | Responsibility |
|---|---|
| `self-support.module.ts` | Nest module; imports `TypeOrmModule.forFeature([Platform])` + `AuthModule`; wires controller + service. |
| `self-support.controller.ts` | Exposes `POST /api/staff/support/handoff`, guarded by `JwtAuthGuard`; returns `mintForStaff` result. |
| `self-support.service.ts` | `SelfSupportService.mintForStaff` — looks up the self-support `Platform` and signs a short-lived hand-off JWT for the staff user. |

## Public surface
- `POST /api/staff/support/handoff` — guard: `JwtAuthGuard` (staff bearer JWT). No body. Returns `{ token: string; platformKey: string }`.
  - Swagger: `@ApiTags('self-support')`, `@ApiBearerAuth('staff')`, `@ApiOperation` "Mint a hand-off token so staff can file an issue about this platform."

## Key classes & logic
**`SelfSupportService.mintForStaff(staff: AuthenticatedStaff)`**
1. Resolves platform key from config `selfSupport.platformKey` (env `SELF_SUPPORT_PLATFORM_KEY`, default `'cimp'`).
2. `platforms.findOne({ where: { key } })` → `404 NotFoundException` if missing (message tells operator to create it in Admin → Platforms or set the env var).
3. `400 BadRequestException` if `platform.status !== PlatformStatus.ACTIVE`.
4. Signs a JWT with `jsonwebtoken` using **the platform's own `handoffSecret`** (read from the DB, per-portal secret) — HS256, `expiresIn: '10m'`.
   - Payload: `{ platformKey: platform.key, portalUserId: 'staff:<staff.id>', name: staff.name, email: staff.email }`.
5. Returns `{ token, platformKey }`.

**Trust model:** identical to any external portal hand-off. The reporter identity is keyed `staff:<id>` under the self-support platform. `HandoffGuard`/`HandoffService.verify()` validates the token per-portal exactly as it would an external portal's — no special-casing. This is why the module doubles as the connector reference impl.

**`SelfSupportController.handoff`** — thin; extracts staff via `@CurrentStaff()` and delegates to the service.

## Guards & auth
- Controller-level `@UseGuards(JwtAuthGuard)` — requires a valid staff JWT (see [[Auth and Authorization]]). No `@Roles` — any authenticated staff may mint.
- The *minted* token is a reporter hand-off token verified downstream by `HandoffGuard` on the reporter/intake routes, not by anything in this module.

## Dependencies (injected)
- `@InjectRepository(Platform)` → `Repository<Platform>`.
- `ConfigService` (reads `selfSupport.platformKey`).
- Module imports `AuthModule` (for `JwtAuthGuard` / `@CurrentStaff`).

## Events (emitted/consumed)
None. Issue creation events fire later on the normal intake path once the reporter surface uses the token.

## Entities touched
- `Platform` (read-only): fields `key`, `status` (`PlatformStatus.ACTIVE`), `handoffSecret`. See [[Data Model]].

## Config
- `SELF_SUPPORT_PLATFORM_KEY` (default `cimp`) — must match an existing platform created in Admin → Platforms. See [[Configuration and Env]].
- Defined in `src/config/configuration.ts` as `selfSupport.platformKey`.

## Frontend
- `SupportButton.tsx` (top bar) calls `POST /api/staff/support/handoff`, then opens the reporter surface `/reporter/new?handoff=<token>`, exercising the full portal integration path. See [[Frontend Overview]].

## Gotchas / invariants
- The self-support platform must **exist and be ACTIVE**, else 404/400. It is not auto-created — an operator must add it (key `cimp` by default).
- Token TTL is 10 minutes — the reporter surface must consume it promptly.
- The secret used is the *platform's* `handoffSecret` (per-portal), **not** `JWT_SECRET` (which signs staff tokens). Two distinct signing keys/paths.
- `portalUserId` collision-safe by the `staff:` prefix — distinguishes dogfood reporters from external portal users under the same platform.

## Related
- [[Integrations]] · [[cimp-connect Package]] · [[FAFICS Integration]]
- [[Auth and Authorization]] · [[Domain Events and Issue Lifecycle]] · [[Data Model]]
- [[Backend Modules and API]] · [[Configuration and Env]] · [[Frontend Overview]]
