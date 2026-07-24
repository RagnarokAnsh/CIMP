---
title: Module - Realtime
tags: [cimp, backend, realtime, sse]
updated: 2026-07-06
---
# Module - Realtime (`src/realtime`)
← [[Backend Modules and API]] · [[CIMP - Home]]

**Purpose:** Push live issue/comment activity to the staff workspace over Server-Sent Events (SSE), fanning domain events out to each connection filtered by the caller's platform scope.

## Files
| File | Responsibility |
|---|---|
| `realtime.controller.ts` | `RealtimeController` — two routes under `/api/staff`: mint an SSE ticket, and the SSE stream itself (per-connection scope filter + heartbeat). |
| `realtime.service.ts` | `RealtimeService` — `@OnEvent` listeners bridge in-process domain events onto a single RxJS `Subject`; exposes `events$`. Defines the `RealtimeEvent` interface. |
| `sse-auth.guard.ts` | `SseAuthGuard` — authenticates the SSE connection from a `?ticket=` query param (EventSource can't send headers). |
| `realtime.module.ts` | `RealtimeModule` — wires controller/service/guard; imports `AuthModule` + `AuthzModule`. |

## Public surface (HTTP routes, all under global `/api` prefix)
| Method + Route | Guard | Notes |
|---|---|---|
| `POST /api/staff/events/ticket` | `JwtAuthGuard` (`@ApiBearerAuth('staff')`) | Exchanges the bearer session JWT for a short-lived SSE ticket. Returns `{ ticket }`. Throttled: `limit 30 / 60s` (blunts ticket farming). |
| `GET /api/staff/events` | `SseAuthGuard` | `@Sse` stream. Auth via `?ticket=` (NOT a header). `@SkipThrottle()`. Emits `MessageEvent`s; `type:'ping'` heartbeats. |

Exported providers: `RealtimeService` (injectable event bus), `SseAuthGuard`.

## Key classes & logic

**`RealtimeController`** (`@Controller('staff')`, `@ApiTags('staff-realtime')`)
- `ticket()` — bearer-authenticated via `JwtAuthGuard`; calls `localAuth.signSseTicket(staff.idpSubject)`. Throws `UnauthorizedException` if signing returns null (auth disabled / non-active user).
- `events()` — builds the per-connection stream:
  - `let allowed = scope.scopedPlatformIds(staff)` → `'ALL'` (admin/global developer) or a list of platform IDs. **Mutable** — re-resolved on every heartbeat (see below).
  - `inScope(e)` predicate: `scope.scopeAllows(allowed, e.platformId)` OR `e.targetStaffIds?.includes(staff.id)` (direct-target override for assignment/@mention regardless of platform scope). Reads the mutable `allowed`, so a scope change takes effect on the next event without reconnecting.
  - `live = realtime.events$.pipe(filter(inScope), map → { data: e })`.
  - `heartbeat = interval(25_000)` — each tick `concatMap`s `auth.refreshAuthenticated(staff.id)`: **null** (account gone / no longer ACTIVE) → `revoked.next()` ends the stream; otherwise recompute `allowed` from the fresh grants. A DB error keeps the previous scope and logs (never fails a healthy stream closed in silence). Still emits the `{ type:'ping' }` frame.
  - Returns `merge(live, heartbeat).pipe(takeUntil(revoked))` — completing on revocation closes the SSE; the browser reconnects and fails auth cleanly at `/events/ticket`.

**`RealtimeService`**
- Private `stream = new Subject<RealtimeEvent>()`; `events$` getter returns `stream.asObservable()`.
- `@OnEvent` listeners (synchronous, trivial — just `stream.next(...)`, so they never delay the originating request):
  - `IssueEvents.CREATED` → `onCreated`
  - `IssueEvents.STATUS_CHANGED` → `onStatusChanged`
  - `IssueEvents.PRIORITY_CHANGED` → `onPriorityChanged`
  - `IssueEvents.ASSIGNED` → `onAssigned` — sets `targetStaffIds: [assigneeId]` when present.
  - `IssueEvents.COMMENT_ADDED` → `onCommentAdded` — sets `targetStaffIds: mentionStaffIds` when non-empty.
- `RealtimeEvent` shape: `{ type: string; issueId: string; platformId: string; targetStaffIds?: string[] }`. `platformId` drives scope filtering; `targetStaffIds` forces delivery to specific staff.

**`SseAuthGuard`** (implements `CanActivate`)
- Reads `req.query.ticket` (string), calls `localAuth.verifySseTicket(ticket)`. On null → `UnauthorizedException`. On success, sets `req.user = staff` so `@CurrentStaff()` resolves in the controller.

## Guards & auth
- **Ticket pattern** (defence-in-depth): the full 8h session JWT is never placed in a URL. `signSseTicket` (in `LocalAuthService`) mints an HS256 JWT with `audience:'sse'`, `expiresIn:'30s'`, claims `{ sub, tv: tokenVersion }`, only for an `AccountStatus.ACTIVE` user. `verifySseTicket` requires `audience:'sse'` + `maxAge:'30s'`, then re-derives identity via `authService.upsertFromClaims` → returns `AuthenticatedStaff`.
- The `audience:'sse'` requirement makes ticket and session token **non-interchangeable**: a session token (no audience) is rejected by `SseAuthGuard`, and a ticket is rejected on normal routes. See [[Auth and Authorization]] and [[Security Audit and Hardening]].

## Dependencies (injected)
- `RealtimeController`: `RealtimeService`, `ScopeService` ([[Auth and Authorization]]), `LocalAuthService`, `AuthService` (for `refreshAuthenticated` — the per-heartbeat re-authorization).
- `SseAuthGuard`: `LocalAuthService`.
- Module imports `AuthModule`, `AuthzModule`.

## Events (consumed)
Consumes domain events from `src/events/issue-events.ts` (see [[Domain Events and Issue Lifecycle]]): `CREATED`, `STATUS_CHANGED`, `PRIORITY_CHANGED`, `ASSIGNED`, `COMMENT_ADDED`. Emits nothing back onto the EventEmitter — it only re-publishes onto its own RxJS `Subject` for SSE fan-out. Consumed alongside notification/scanning/Jira listeners (all `@OnEvent`, off the request path).

## Entities touched
None directly. Identity is re-materialised through `LocalAuthService` → `StaffUser` (via `upsertFromClaims`); scope is computed by `ScopeService`.

## Gotchas / invariants
- SSE ticket TTL is ~30s and single-purpose — a leaked stream URL is not a usable session. Frontend must re-mint per connection.
- Scope is **re-resolved every 25s on the heartbeat** (`refreshAuthenticated`), not just at connect (fixed 2026-07-24). A disabled account or a revoked grant stops delivery within one tick; the stream ends outright when the account is no longer ACTIVE. **Residual:** a `tokenVersion` bump (password reset) is *not* re-checked mid-stream — the connection holds an `AuthenticatedStaff`, not the claims — so that one only takes effect on reconnect. Status + grant revocation, the security-critical cases, are live.
- The stream is a plain `Subject` (no replay/buffer): events emitted while a staff member is disconnected are lost — the client should refetch on (re)connect rather than rely on backlog delivery.
- `RealtimeService` is a singleton bridging **in-process** events only — this fan-out does not work across multiple backend instances without a shared broker.
- `targetStaffIds` override bypasses platform scope, so an assignee/@mentioned staffer receives the event even for a platform outside their scope.
- Heartbeat interval (25s) is shorter than typical proxy idle timeouts; `type:'ping'` frames must be ignored by the client.

## Related
[[Backend Modules and API]] · [[Auth and Authorization]] · [[Domain Events and Issue Lifecycle]] · [[Security Audit and Hardening]] · [[Frontend Overview]] · [[Architecture Overview]] · [[Configuration and Env]] · [[Module - Issues]] · [[Module - Auth]]
