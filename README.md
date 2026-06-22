# Support Platform API

Backend for the **Centralized Support & Issue Management Platform**.
Stack: NestJS + TypeORM + PostgreSQL. REST API, SSE for live updates, files in
local disk or S3-compatible object storage.

There are two audiences and two completely separate auth paths:

- **Reporters** — end users of *your* products. They never log into this
  platform. Their host product (a "portal") mints a short-lived signed JWT and
  hands it over; this API trusts that signature. See
  [Connecting a portal](#connecting-a-portal-reporter-hand-off).
- **Staff** — your support team (focal points, developers, admins). They sign in
  with an identity provider (OIDC) — or a local dev shim — and every issue-scoped
  route enforces **role + platform scope**. See
  [Authentication & RBAC](#authentication--rbac).

---

## How it all works (the workflow)

```
 End user (in your product)                 Support staff (this app's workspace)
 ─────────────────────────                  ───────────────────────────────────
 1. clicks "Get help"                        4. sees the new issue live (SSE) and
 2. your backend mints a hand-off  ──┐          a focal-point email/notification
    JWT (HS256, per-portal secret)   │       5. assigns it, changes status,
 3. opens /reporter/...?handoff=JWT  │          comments (internal or
        │                            │          reporter-visible)
        ▼                            │       6. transitions follow a state machine;
   POST /api/reporter/issues  ───────┘          every change is audited + can sync
   (description + attachments)                   one-way/!two-way to Jira
        │                                            │
        ▼                                            ▼
   issue stored, reference no. assigned        reporter sees status + replies in
   `issue.created` event fired                 "My issues" (and can reply back)
        │
        ├─► Notifications listener  → emails platform focal points
        ├─► Scanning listener       → ClamAV scan of each attachment
        ├─► Jira listener           → creates the linked Jira issue
        └─► Realtime service        → pushes the event to connected staff (SSE)
```

Everything after a state change is **event-driven** (`src/events/`): the request
returns immediately, and notifications, scanning, Jira sync, and live SSE updates
run as decoupled `@OnEvent` listeners. State transitions go through a state
machine (`src/issues/status-machine.ts`) and use optimistic locking (a `version`
column → `409` on a stale write).

---

## Reporter API (no login — hand-off token)

Auth: every route requires a valid `X-Handoff-Token` header (`src/handoff/`).

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/reporter/issues` | Two-field intake: description + ≤5 files (≤10 MB, png/jpeg/webp/pdf). |
| `GET`  | `/api/reporter/issues` | "My issues" list with a `hasUpdates` flag. |
| `GET`  | `/api/reporter/issues/:id` | Detail: reporter-visible updates only + attachments. |
| `POST` | `/api/reporter/issues/:id/comments` | **Reply back to support** (reporter-visible). |
| `GET`  | `/api/reporter/issues/:id/attachments/:attachmentId` | Download own attachment (scan-gated). |
| `POST` | `/api/reporter/issues/:id/seen` | Mark seen (powers the unread indicator). |

## Staff API (`/api/staff`, `/api/admin`)

Auth: OIDC bearer token (or dev shim) → `JwtAuthGuard`; issue-scoped routes add
`PlatformAccessGuard` + `@Roles`.

- **Identity** — `GET /api/staff/me`.
- **Issues** — `GET /api/staff/issues` (full-text + reference search, status/
  priority/platform/assignee/date filters, sort, pagination, **scoped**), with
  computed **SLA** (`slaState`/`dueAt`; env-tunable targets in `src/issues/sla.ts`);
  `:id` detail; `PATCH .../status|assignment|priority` (require `version`);
  `PATCH /api/staff/issues/bulk`; `GET .../:id/assignees`, `GET .../:id/members`;
  `GET /api/staff/platforms`; `GET /api/staff/issues/export` (CSV, injection-safe).
- **Attachments** — `GET /api/staff/attachments/:id/download` (access-checked,
  scan-gated, RFC-5987 filename).
- **Comments** — `POST /api/staff/issues/:id/comments` (internal or
  reporter-visible, optional `mentionStaffIds`); `PATCH /api/staff/comments/:id`.
- **Dashboard** — `GET /api/staff/dashboard` (scoped counts, 14-day trend, SLA tallies).
- **Saved views** — `GET/PUT/DELETE /api/staff/saved-views` (per-staff, server-side).
- **Notifications** — `GET /api/staff/notifications`, `POST /api/staff/notifications/read`.
- **Realtime (SSE)** — `GET /api/staff/events?access_token=<token>`: a live,
  scope-filtered event stream (issues, comments, assignments). The web client
  subscribes and refreshes views instantly. 25 s heartbeat; auto-reconnects.
- **Admin** — `GET/POST/PATCH /api/admin/platforms`, `POST /api/admin/platforms/:id/rotate-secret`,
  `GET /api/admin/staff`, `POST /api/admin/roles`, `DELETE /api/admin/roles/:id`,
  and the **audit log** `GET /api/admin/audit` (filter by actor/action/date).
- **Health** — `GET /api/health` (liveness), `GET /api/ready` (DB check, 503 when down).

## Integrations & seams

- **Jira (two-way)** — on issue creation, creates the linked Jira issue
  (idempotent, retried, timed out); on status change, echoes a comment to Jira;
  inbound status updates via `POST /api/integrations/jira/webhook`
  (shared-secret `X-Webhook-Token`). Disabled until `JIRA_*` are set.
- **Malware scanning** — `SCAN_DRIVER=clamav` streams attachments to a clamd
  daemon; default `noop` marks files `SKIPPED`. `PENDING`/`INFECTED` files are
  never served. Production warns if scanning is the no-op.
- **Storage** — `STORAGE_DRIVER=local` (disk) or `s3` (S3/MinIO).
- **Audit** — every state-changing action records an `AuditEvent`.

Interactive API docs (Swagger) at `/api/docs` (disabled in production); the
frontend's typed client is generated from it. Full data model in `src/entities/`.

---

## Connecting a portal (reporter hand-off)

"Portal" = any product of yours whose users need support. You connect it **once**
as a `platform`, then its backend mints a token whenever a user opens support.
**No reporter accounts, no passwords** — the signature is the trust.

### 1. Register the platform (admin, once)

`POST /api/admin/platforms` (or seed it):

```json
{ "key": "acme-store", "name": "Acme Store", "status": "ACTIVE",
  "jiraEnabled": false }
```

The response/seed gives you a **per-portal signing secret** (`handoffSecret`).
Store it as a secret in *your portal's backend* — never ship it to the browser.
Rotate any time with `POST /api/admin/platforms/:id/rotate-secret`.

### 2. Mint a hand-off token in your portal's backend

When a logged-in user clicks "Get help", your backend signs a short-lived JWT
(HS256) with that platform's secret. The claims are defined in
`src/handoff/handoff.types.ts`:

```ts
// In YOUR product's backend (Node example; any language with a JWT lib works):
import jwt from 'jsonwebtoken';

const token = jwt.sign(
  {
    platformKey: 'acme-store',     // identifies which portal/secret to verify with
    portalUserId: user.id,         // stable id of the user *in your system*
    name: user.fullName,
    email: user.email,
  },
  process.env.ACME_HANDOFF_SECRET, // the per-portal secret from step 1
  { algorithm: 'HS256', expiresIn: '5m' },
);
```

`HandoffGuard` reads the (unverified) `platformKey`, loads that platform's secret,
then verifies the signature + expiry against it. The reporter identity is trusted
**only** because the signature proves it came from your backend.

### 3. Open the reporter UI with the token

Two supported delivery methods (`frontend/src/api/handoff.ts`):

- **Query param** (simplest — redirect or link):
  `https://support.example.com/reporter/issues?handoff=<JWT>`
  The SPA stores it in `sessionStorage` and strips it from the URL.
- **postMessage** (when embedding the support UI in an `<iframe>`):
  `iframe.contentWindow.postMessage({ type: 'handoff', token }, SUPPORT_ORIGIN)`.
  The SPA only accepts it from origins listed in `VITE_PORTAL_ORIGINS`.

That's the whole integration. Every reporter API call then sends the token as
`X-Handoff-Token`, and issues are automatically attributed to that platform +
`portalUserId`. A user with no prior issues is auto-provisioned on first intake.

> Quick local test: `npm run token -- acme-store <secret> u-1 "Asha" asha@x.com`
> prints a token; or `npm run seed` prints a ready-to-use `curl`.

---

## Authentication & RBAC

Two independent systems; you can change the **staff** one freely without touching
the reporter hand-off.

The golden rule across every method below: **the token proves *identity* (who you
are); the database decides *authorization* (what you can do).** Roles are never in
the token — so you can change someone's access instantly without a re-login, and
swapping login methods never touches RBAC.

**RBAC model (identical for every login method):** a `StaffUser` holds
`UserPlatformRole` grants of `{ role, platform | null }`.
- `FOCAL_POINT` — always per-platform.
- `DEVELOPER` — per-platform or global (`platform = null`).
- `ADMIN` — always global.

`ScopeService` (`src/authz/scope.service.ts`) turns those grants into
`scopedPlatformIds` (`'ALL' | string[]`) and `canAccessPlatform`. The **server**
enforces it on every issue-scoped route; the frontend only gates UI for UX.

### Choose a staff login method

`JwtAuthGuard` tries each configured method in turn (self-issued JWT → dev shim →
OIDC), so you can enable one or several. Pick what you need:

| Method | Enable with | Use when |
|---|---|---|
| **Self-issued JWT** (built-in) | backend `JWT_SECRET` + frontend `VITE_AUTH_MODE=local` | You want simple RBAC, no external service. **Recommended.** |
| **OIDC SSO** | `OIDC_*` (backend) + `VITE_OIDC_*` (frontend) | You already have an IdP (Keycloak/Auth0/Entra/…). |
| **Dev shim** | `DEV_AUTH=true` + `VITE_DEV_AUTH=true` | Local dev only; a role picker, force-disabled in production. |

### Self-issued JWT (built-in — no Keycloak, no IdP)

This is fully implemented. The API issues and verifies its own HS256 tokens; no
external service is involved.

1. **Configure it.** Set a strong random `JWT_SECRET` (and optional
   `JWT_EXPIRES_IN`, default `8h`) in the backend `.env`; set `VITE_AUTH_MODE=local`
   in `frontend/.env`. The staff workspace then shows an email/password sign-in.
2. **Create staff + passwords** (admin, via the API or an Admin UI button):
   - `POST /api/admin/staff` `{ name, email, password }` — creates a `StaffUser`
     (keyed `idp_subject = local:<email>`), password bcrypt-hashed at rest.
   - `POST /api/admin/staff/:id/password` `{ password }` — reset a password.
3. **Grant roles** as usual: `POST /api/admin/roles` `{ staffUserId, role, platformId? }`.
4. **Sign in.** `POST /api/auth/login` `{ email, password }` → `{ accessToken }`.
   The SPA stores it and sends it as `Authorization: Bearer …`; SSE uses
   `?access_token=`. Login is rate-limited; `passwordHash` is `select: false` so it
   never leaves the DB.

How it works under the hood (`src/auth/local-auth.service.ts`): on login we
`bcrypt.compare` then `jwt.sign({ sub, name, email }, JWT_SECRET)`; on every
request `JwtAuthGuard` `jwt.verify`s with the same secret and calls
`AuthService.upsertFromClaims` — the exact same path OIDC uses, so RBAC is
untouched. The token carries no roles.

> Refresh/expiry: the default is a single `8h` token plus a logout the frontend
> forgets. To add refresh tokens later, issue a short access token and a refresh
> endpoint — the 401 handling and SSE token-in-query already work the same way.

If you later want SSO, just configure `OIDC_*` instead (or as well) — nothing else
changes, because roles never lived in the token.

---

## Run locally

```bash
cp .env.example .env
docker compose up -d postgres        # PostgreSQL (see DB_PORT in .env)
npm install
npm run seed                         # demo portal + a ready-to-use reporter token/curl
npm run start:dev                    # API on :3000 under /api
```

Frontend (in `frontend/`): `npm run dev` (`:5173`, proxies `/api` → `:3000`).
With `VITE_DEV_AUTH=true` the staff workspace shows a role picker — no IdP needed.

### Full demo dataset

```bash
npm run seed:demo   # WIPES the schema (dev only): 4 platforms, 9 staff w/ roles,
                    # ~45 issues across every status/priority, comments, audit,
                    # then prints a 2-hour reporter URL and the seeded staff.
```

## Tests

```bash
npm test          # unit: ScopeService, status machine, DTO/version, CSV, reporter, jira-inbound
npm run test:e2e  # e2e: hand-off guard, intake, authorization (403/scoping)
```

Tests run without a database (boundaries stubbed).

## Production hardening

The app **fails closed** in production (`src/config/env.validation.ts`): with
`NODE_ENV=production` it refuses to boot if `DB_SYNCHRONIZE=true`, `CORS_ORIGINS`
is `*`/unset, `DEV_AUTH=true`, or OIDC is unconfigured (when dev-auth is off).

- **Migrations:** set `DB_SYNCHRONIZE=false`; generate a baseline against a live DB
  (`npm run migration:generate`) then `npm run migration:run`. (Includes the
  additive `notification_logs.read_at`, `comments.author_type/author_name`,
  `staff_users.password_hash`, and the `saved_views` table.) The FTS migration
  (`src/migrations/*AddIssueSearchVector*`)
  adds a stored `tsvector` + GIN index; apply it and swap the query-time
  expressions in `IssuesService` for `issue.search_vector @@ plainto_tsquery`.
- **Security:** helmet, 1 MB body limit, and graceful shutdown are on by default
  (`src/main.ts`). Swagger is disabled in production.
- **Storage / scanning:** set `STORAGE_DRIVER=s3` + `S3_*`; set `SCAN_DRIVER=clamav`
  + `CLAMAV_*` for real malware scanning.
- **CORS / secrets:** set `CORS_ORIGINS` to your frontend origins; resolve
  per-portal hand-off secrets from a secrets manager (they live on `platforms` for dev).
- **SLA / policy:** tune `SLA_HOURS_*` / `SLA_AT_RISK_FRACTION`;
  `FOCAL_POINT_CAN_TRANSITION` toggles whether focal points may change status.

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the module graph, request/auth flow,
domain events, ER diagram, and route→handler table, and
[`IMPROVEMENT_PLAN.md`](IMPROVEMENT_PLAN.md) for shipped vs. planned work.
