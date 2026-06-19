# Support Platform API

Backend for the Centralized Support & Issue Management Platform.
Stack: NestJS + TypeORM + PostgreSQL. REST API. Files in object storage.

## Reporter side (Phase 1)

The reporter side, end to end:

- **Token hand-off** — portals mint a short-lived signed JWT; the platform
  verifies it per-portal. No reporter login. (`src/handoff/`)
- **Two-field intake** — `POST /api/reporter/issues` (description + up to 5 files).
- **"My issues" tracking** — `GET /api/reporter/issues`, with a `hasUpdates` flag.
- **Issue detail** — `GET /api/reporter/issues/:id` (reporter-visible updates only).
- **Seen marker** — `POST /api/reporter/issues/:id/seen` (powers the unread indicator).

## Staff side (Phase 2)

The staff management API, all under `/api/staff` and `/api/admin`:

- **Auth (OIDC)** — IdP access tokens validated via JWKS; `StaffUser` upserted
  from claims; `GET /api/staff/me`. (`src/auth/`)
- **Authorization** — role + platform scope. `ScopeService` + guards enforce that
  a focal point of Portal A gets `403` on a Portal B issue, lists are scoped, and
  admins/global developers are unscoped. (`src/authz/`)
- **Issues** — `GET /api/staff/issues` (filters, pagination, scoped), `:id` detail,
  `PATCH .../status|assignment|priority`. Status follows the state machine
  (`src/issues/status-machine.ts`); optimistic locking via a `version` column
  (`409` on conflict); CSV at `GET /api/staff/issues/export`.
- **Comments** — `POST /api/staff/issues/:id/comments` (internal or
  reporter-visible), `PATCH /api/staff/comments/:id`.
- **Dashboard** — `GET /api/staff/dashboard` (scoped counts + trend).
- **Admin** — `GET/POST/PATCH /api/admin/platforms`, secret rotation, staff/role
  management. (`src/admin/`)
- **Notifications** — event-driven staff email (`src/notifications/`); reporters
  stay in-app only (OD-02).
- **Jira** — one-way push on issue creation (`src/jira/`), resilient/retried.
- **Audit** — every state-changing action records an `AuditEvent` (`src/audit/`).

Domain events (`src/events/`) decouple notifications, scanning, and Jira sync
from the request path. Interactive API docs (Swagger) are served at
`/api/docs` — the frontend's typed client is generated from this.

The full data model (all 10 entities) is in `src/entities/`.

## Tests

```bash
npm test          # unit: ScopeService + status state machine
npm run test:e2e  # e2e: hand-off guard, intake, authorization (403/scoping)
```

These run without a database (boundaries are stubbed).

## Frontend

The web client lives in [`frontend/`](frontend/) — a Vite + React + TypeScript
SPA using shadcn/ui, TanStack Query/Table, and React Router. It serves both the
reporter surface (hand-off token) and the staff workspace (OIDC). See
[`frontend/README.md`](frontend/README.md). In dev it proxies `/api` to this
backend on `:3000`.

## Run locally

```bash
cp .env.example .env
docker compose up -d postgres        # starts PostgreSQL on :5432
npm install
npm run seed                         # creates a demo portal + prints a test token
npm run start:dev
```

`npm run seed` prints a ready-to-use `curl` command to raise your first issue.

### Full demo dataset

To populate the whole workflow (4 platforms, 9 staff with role grants, ~45 issues
across every status/priority, comments, audit history, reporter view state):

```bash
npm run seed:demo
```

It **wipes** the schema first (dev only), then prints a 2-hour reporter login URL
(`/reporter/issues?handoff=…`) and the seeded staff accounts. Staff sign-in is via
OIDC, so seeing the staff workspace needs `OIDC_*` configured; all staff/roles/issues
are seeded and ready for it.

> If port 5432 is already in use on your machine, run Postgres on another port and
> set `DB_PORT` in `.env` to match before seeding/starting.

## Production hardening

- **Migrations:** set `DB_SYNCHRONIZE=false`. Generate the baseline schema once
  against a live DB (`npm run migration:generate`), then `npm run migration:run`.
  Search matches the reference number (ILIKE) or Postgres full-text search over
  description + comment bodies, using a prefix `to_tsquery` (`term:*`) so it
  matches as the user types — computed at query time in `IssuesService`. The
  provided FTS migration
  (`src/migrations/*AddIssueSearchVector*`) adds a stored `tsvector` column + GIN
  index + triggers over description and comment bodies; apply it in production and
  swap those expressions for `issue.search_vector @@ plainto_tsquery` to make the
  lookup index-backed.
- **Storage:** set `STORAGE_DRIVER=s3` and the `S3_*` vars to use S3/MinIO.
  Attachments are served access-checked via `GET /api/staff/attachments/:id/download`.
- **Malware scanning:** `ScanService` is a seam (`src/scanning/`). The default
  no-op marks files `SKIPPED`; bind a ClamAV implementation in prod. `PENDING`/
  `INFECTED` files are never served.
- **CORS:** set `CORS_ORIGINS` to your known frontend origins.
- **Secrets:** per-portal signing secrets live on the `platforms` table for dev;
  resolve them from a secrets manager in production.
- **OD-09 seam:** `FOCAL_POINT_CAN_TRANSITION` toggles whether focal points may
  change issue status (default `false`).
