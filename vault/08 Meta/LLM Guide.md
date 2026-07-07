---
title: LLM Guide
tags: [cimp, llm, navigation, meta]
updated: 2026-07-06
---
# LLM Guide — how to use this vault efficiently
← [[CIMP - Home]]

> For an AI agent resuming or extending CIMP. This vault is designed so you understand the codebase **without reading source** — read the note, then open only the specific file you need to edit.

## Read order (fastest path to orientation)
1. [[Session Handoff]] — current branch/state/next steps. **Always first.**
2. [[Architecture Overview]] — the mental model + invariants.
3. [[Directory Index]] — map every folder to its note.
4. The specific [[Backend Modules and API|module note]] for the area you're touching.

## Mental model (memorize this)
- **Two auth paths** ([[Auth and Authorization]]): reporters use a per-platform **hand-off token** (`X-Handoff-Token`); staff use a **self-issued JWT**. Identity is in the token; **authorization is always the DB** (`UserPlatformRole` via `ScopeService`).
- **Tenant isolation is sacred.** Every issue-scoped route goes through `PlatformAccessGuard`; a focal point of platform A gets **404** (not 403) on platform B. New features must enforce the same (same-platform checks).
- **Event-driven side effects** ([[Domain Events and Issue Lifecycle]]): never do notifications/scanning/jira/automation in the request path — emit a domain event, add an `@OnEvent` listener.
- **Optimistic locking**: mutations need `version` → 409 on conflict.
- **Fail-closed config** ([[Configuration and Env]]): prod won't boot on unsafe env.

## How to add a feature (the established pattern → [[Features - Shipped]])
1. Entity in `src/entities/` + register in `index.ts` (`ALL_ENTITIES`).
2. A migration in `src/migrations/` (idempotent, `CREATE ... IF NOT EXISTS`).
3. A scoped **service** (use `ScopeService.canAccessPlatform`) + **spec** (jest, no DB — mock repos).
4. A **controller** under `/api/staff/...` guarded by `PlatformAccessGuard` (issue-`:id` routes) or a platform-scope check.
5. Wire the module into `src/app.module.ts`.
6. UI in `frontend/src/staff/IssueExtras.tsx` (issue panel) or the relevant page.
7. `npm run typecheck && npm run build && npm test` before commit.

## Conventions
- Reuse enums (`src/common/enums.ts`); never restring statuses/roles.
- Reuse guards/`ScopeService`; don't hand-roll auth.
- Commit to `dev` (or a feature branch → `dev`), never straight to `main`. **No `Co-Authored-By: Claude` trailer.**
- Keep this vault current: after a change, update the relevant module note + [[Changelog]].

## Where things live (quick lookup)
- Auth/login → [[Module - Auth]]; scoping → [[Module - Authz]]; reporter token → [[Module - Handoff]].
- Issue writes/status/SLA → [[Module - Issues]]; comments → [[Module - Comments]].
- Realtime/SSE → [[Module - Realtime]]; notifications → [[Module - Notifications]].
- Config/env → [[Configuration and Env]]; entities → [[Entity Reference]]; schema history → [[Migrations Log]].
- The connector for other projects → [[cimp-connect Package]].

Related: [[Directory Index]] · [[Changelog]] · [[Decisions and Glossary]]
