# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A monorepo for the **Centralized Support & Issue Management Platform**:

- **Backend** (repo root, `src/`) — NestJS + TypeORM + PostgreSQL REST API.
- **Frontend** (`frontend/`) — Vite + React + TypeScript SPA (shadcn/ui, TanStack Query/Table, React Router).

Deeper docs already exist and are kept current — read them before large changes:
`README.md` (run/deploy), `ARCHITECTURE.md` (module graph, auth flow, domain
events, ER diagram, route→handler table), `DESIGN.md`, `PRODUCT.md`. The live
**Swagger at `/api/docs`** is the source of truth for the API contract; the
frontend's typed client is generated from it.

## Knowledge vault — read this first when resuming

`vault/` is an Obsidian knowledge base of code-grounded notes (architecture,
per-module notes, security, features, ops). **Before any large change or when
resuming a session, read `vault/08 Meta/Session Handoff.md` (current state + next
steps) and `vault/08 Meta/LLM Guide.md` (how to navigate the vault).** They orient
you in ~3 notes without reading source. `vault/Directory Index.md` maps every
folder to its note. After a meaningful change, update the affected module note +
`vault/08 Meta/Changelog.md` — or run `/doc-sync` to do it.

## Commands

**Backend** (run from repo root):

```bash
docker compose up -d postgres   # Postgres on :5432
npm run start:dev               # watch mode; API on :3000 under /api
npm run build                   # nest build
npm run typecheck               # tsc --noEmit
npm test                        # jest unit tests
npm run test:e2e                # jest e2e (test/jest-e2e.json)
npx jest src/authz/scope.service.spec.ts   # run a single test file
```

Tests run **without a database** — external boundaries are stubbed. Unit specs
cover `ScopeService` and the issue status machine; e2e covers the hand-off guard,
intake, and authorization (403/scoping).

**Dev data & tokens:**

```bash
npm run seed         # demo portal + prints a ready-to-use reporter token/curl
npm run seed:demo    # full dataset — WIPES the schema first (dev only)
npm run token        # mint a hand-off token (scripts/make-token.ts)
```

**Migrations** (only with `DB_SYNCHRONIZE=false`):

```bash
npm run migration:generate
npm run migration:run
npm run migration:revert
```

**Frontend** (run from `frontend/`):

```bash
npm run dev          # :5173, proxies /api → :3000 (start the backend first)
npm run build        # tsc -b && vite build
npm run typecheck
npm run gen:api      # regenerate src/api/schema.d.ts from the live Swagger doc
```

## Architecture in brief

Cross-cutting facts that span multiple files (see `ARCHITECTURE.md` for the full
graph, ER diagram, and route table):

- **Global `/api` prefix** is set in `src/main.ts`. A global `ValidationPipe`
  runs with `whitelist + forbidNonWhitelisted + transform` — every accepted field
  must be declared on a DTO or the request is rejected.
- **Two independent auth paths.** Reporters never log in: portals mint a
  short-lived signed JWT verified per-portal by `HandoffGuard` (sent as
  `X-Handoff-Token`). Staff use a **self-issued JWT** (email/password): `POST
  /api/auth/login` (`LocalAuthService`, bcrypt + HS256 signed with `JWT_SECRET`);
  `JwtAuthGuard` verifies it and upserts a `StaffUser`, then `PlatformAccessGuard`
  + `@Roles` enforce access. Identity is in the token; roles are always in the DB.
- **Authorization is centralized** in `src/authz/scope.service.ts`
  (`scopedPlatformIds`, `canAccessPlatform`, `scopeAllows`), with the read/write
  role split in `src/authz/role-sets.ts` — `STAFF_READ_ROLES` includes the
  read-only `WATCHER` role, `STAFF_WRITE_ROLES` doesn't; import these instead of
  hand-rolling role lists. The **server is the enforcement point**; the frontend
  gates UI only for UX. A focal point of one platform gets `404` on another's
  issue (enumeration defense); admins/global developers are unscoped.
  `scopedPlatformIds` is *read* scope — never authorize a mutation with it alone.
- **Event-driven decoupling.** State changes emit domain events
  (`src/events/issue-events.ts`); notifications, attachment scanning, and Jira
  sync are `@OnEvent` listeners and never run in the request path.
- **Optimistic locking** on `Issue.version` returns `409` on conflict. Status
  transitions must go through the state machine in `src/issues/status-machine.ts`.
- **Swappable seams** (chosen by env): storage `local`|`s3`
  (`src/storage/`); scanning `ScanService` (`src/scanning/`, default no-op marks
  files `SKIPPED`; `PENDING`/`INFECTED` files are never served); Jira one-way push
  (`src/jira/`, disabled when unconfigured).

## Conventions worth knowing

- **Shared enums** live in `src/common/enums.ts` (`Role`, `IssueStatus`,
  `Priority`, `CommentVisibility`, `ScanStatus`, …). Reuse them; don't restring.
- **Policy seams via env.** `FOCAL_POINT_CAN_TRANSITION` (OD-09) toggles whether
  focal points may change status (default `false`). `JWT_SECRET` (required) signs
  staff tokens; create staff with `POST /api/admin/staff` or the seeds.
- `DB_SYNCHRONIZE=true` (auto-create schema) is **dev only** — production uses
  migrations.
- **Frontend:** shadcn/ui components in `frontend/src/components/ui/` are owned
  source — edit freely. After changing backend request/response shapes, run
  `npm run gen:api`.

## Config

Copy `.env.example` → `.env` (backend) and `frontend/.env.example` →
`frontend/.env`. Leaving `SMTP_HOST` blank logs emails instead of sending;
leaving the `JIRA_*` vars blank disables Jira sync.
