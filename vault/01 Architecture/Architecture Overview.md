---
title: Architecture Overview
tags: [cimp, architecture]
updated: 2026-07-06
---
# Architecture Overview
← [[CIMP - Home]]

## Shape
Monorepo. **Backend** = NestJS (`src/`), **Frontend** = Vite/React SPA (`frontend/`). One Postgres DB. The frontend's typed client is generated from the backend's OpenAPI (`npm run gen:api`), but many types are hand-written in `frontend/src/api/types.ts`.

## Cross-cutting facts (the stuff that spans files)
- **Global `/api` prefix** set in `src/main.ts`. Global `ValidationPipe` runs `whitelist + forbidNonWhitelisted + transform` — every accepted field must be on a DTO or the request is rejected.
- **Two independent auth paths** → [[Auth and Authorization]]. Identity lives in the token; **authorization always comes from the DB** (role grants), never the token.
- **Authorization is centralized** in `src/authz/scope.service.ts`. The **server is the enforcement point**; the frontend only gates UI for UX.
- **Event-driven decoupling** → [[Domain Events and Issue Lifecycle]]. State changes emit domain events; notifications, scanning, Jira sync, realtime SSE, and automation are `@OnEvent` listeners that never run in the request path.
- **Optimistic locking** on `Issue.version` → `409` on conflict (mapped from TypeORM `OptimisticLockVersionMismatchError` in the exception filter). Status transitions go through `src/issues/status-machine.ts`.
- **Swappable seams (env-chosen):** storage `local|s3` (`src/storage/`); scanning `noop|clamav` (`src/scanning/`); Jira one-way push (`src/jira/`, disabled when unconfigured). See [[Integrations]] and [[Configuration and Env]].
- **Fail-closed config** in `src/config/env.validation.ts` + `is-production.ts`: unset/misspelled `NODE_ENV` is treated as production, and prod refuses to boot on unsafe config. See [[Configuration and Env]].

## Request flow (staff issue read, canonical)
1. `JwtAuthGuard` verifies the staff JWT, resolves `req.user` (identity + DB role grants), rejects disabled/old-token-version accounts.
2. `PlatformAccessGuard` resolves the issue's platform and checks the caller holds a required `@Roles` role for it (or globally). Out-of-scope → **404** (no existence oracle).
3. The service enforces scope again in queries (defence in depth) and applies optimistic-lock version checks on writes.

## Key invariants (do not break)
- A focal point of platform A gets 404 on platform B's issue.
- Reporters only ever see their own issues + **REPORTER_VISIBLE** comments (never INTERNAL notes).
- PENDING/INFECTED attachments are never served.
- Hand-off + SSE tokens are short-lived and never the full session token in a URL.

Related: [[Data Model]] · [[Backend Modules and API]] · [[Security Audit and Hardening]]
