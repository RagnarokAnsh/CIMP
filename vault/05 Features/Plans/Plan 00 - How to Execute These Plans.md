---
title: Plan 00 - How to Execute These Plans
tags: [cimp, plan, meta]
updated: 2026-07-10
---
# Plan 00 — How to execute these plans (READ FIRST)
← [[CIMP - Home]] · [[Feature Roadmap]]

These plans are written so a developer or LLM agent can implement each feature
**without making architectural decisions** — the decisions are already made and
recorded in each plan. Follow them literally; where a plan says "decision", do
not substitute your own.

## Before starting any plan
1. Read `vault/08 Meta/Session Handoff.md` and `vault/08 Meta/LLM Guide.md`.
2. Read the plan top to bottom before writing code.
3. Work on a branch off `dev` (never `main`). No `Co-Authored-By` trailers.

## Repo-wide rules that WILL bite you if ignored
- **ValidationPipe is global with `whitelist + forbidNonWhitelisted`** (set in
  `src/main.ts`). Any new request field MUST be declared on a DTO with
  class-validator decorators, or the whole request is rejected with 400.
- **Enums live in `src/common/enums.ts`.** Add new enum values there; never
  inline string unions.
- **Authorization:** import `STAFF_WRITE_ROLES` / `STAFF_READ_ROLES` from
  `src/authz/role-sets.ts`; scope checks go through `src/authz/scope.service.ts`
  (`canAccessPlatform`). Cross-platform access returns **404, not 403**
  (enumeration defense). `scopedPlatformIds` is READ scope — never authorize a
  mutation with it alone.
- **Status changes only via `src/issues/status-machine.ts`** (`canTransition`),
  except where a plan explicitly documents a sanctioned exception.
- **Side effects go through domain events** (`src/events/issue-events.ts`) and
  `@OnEvent` listeners — never in the request path. Listeners must catch their
  own errors (a listener throw must never fail the request).
- **Optimistic locking:** `Issue.version` — mutations take a `version` and 409
  on mismatch. Follow the pattern in `src/issues/issues.service.ts`.
- **Migrations:** new columns/tables need BOTH the entity change AND a
  migration in `src/migrations/` (13-digit-timestamp-prefixed class name,
  mirroring existing ones). Dev runs `DB_SYNCHRONIZE=true` so you won't notice
  a missing migration locally — production will crash. Never edit old migrations.
- **Frontend API types are generated:** after any backend contract change run
  the backend, then `cd frontend && npm run gen:api`.
- **New feature wiring:** module in `src/<feature>/`, imported in
  `src/app.module.ts`; UI in the relevant page or `frontend/src/staff/IssueExtras.tsx`.
  Follow an existing sibling (labels/ watchers/ issue-links are good templates).

## Definition of done (every plan)
- `npm run typecheck && npm test && npm run test:e2e` green at repo root;
  `cd frontend && npm run typecheck && npm run build` green.
- The unit/e2e specs listed in the plan's **Tests** section exist and pass.
- Swagger (`/api/docs`) shows the new endpoints; `gen:api` ran if contracts changed.
- Vault updated: the feature's module note + `08 Meta/Changelog.md` +
  the plan's `status:` frontmatter set to `done` (or run `/doc-sync`).
- Committed to `dev` with a conventional message (`feat: ...`).

## Plan index (recommended order)
1. [[Plan 01 - Outbound Webhooks and Slack]] — S, unlocks integrations
2. [[Plan 02 - Duplicate Merge Flow]] — M, prerequisite for deflection + triage apply
3. [[Plan 03 - SDK Context Capture]] — M, spans cimp-connect + CIMP
4. [[Plan 05 - AI Triage Pluggable and Free]] — M, depends on 02 for "merge" apply
5. [[Plan 06 - CSAT and Close the Loop]] — S/M
6. [[Plan 04 - Known-Issues Deflection]] — M, depends on 02
7. [[Plan 07 - Command Palette and Triage Inbox]] — M, frontend-only
