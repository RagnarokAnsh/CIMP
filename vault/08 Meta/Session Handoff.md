---
title: Session Handoff
tags: [cimp, handoff, resume]
updated: 2026-07-07
---
# Session Handoff — read this first when resuming
← [[CIMP - Home]]

> Purpose: pick up work in a **fresh session** without re-deriving context. Read this + [[Architecture Overview]] + [[Backend Modules and API]] and you're oriented.

## Where the code is
- **Active branch: `dev`** — ~18 commits ahead of **`main`** (the deploy branch). All recent work (security + features) is on `dev`. `main` is untouched.
- Repo `D:\CIMP\CIMP` (GitHub `RagnarokAnsh/CIMP`). Vault `D:\CIMP\CIMP\vault`.
- Sibling repos: `D:\cimp-connect` ([[cimp-connect Package]]), `D:\FAFICS` ([[FAFICS Integration]]).

## State (green)
- **113 unit + 21 e2e tests pass**; `npm run build` (backend) + frontend build clean. Verify: `npm test && npm run test:e2e`.
- **Shipped from the differentiator track:** duplicate merge (2026-07-10, [[Plan 02 - Duplicate Merge Flow]]), outbound webhooks — Slack descoped (2026-07-11, [[Plan 01 - Outbound Webhooks and Slack]]), SDK context capture (2026-07-11, [[Plan 03 - SDK Context Capture]], cimp-connect v0.5.0). Next per [[Plan 00 - How to Execute These Plans]]: Plan 05 (AI triage) → 06 (CSAT) → 04 (deflection) → 07 (palette/triage inbox).
- **Local dev ports:** FAFICS now squats :3000 (web) and :3001 (api) — run the CIMP backend with `PORT=<free> npm run start:dev` when both are up.
- **Security:** ~42/57 audit findings fixed. Tracker: `SECURITY_AUDIT.md`. → [[Security Audit and Hardening]].
- **Features shipped:** issue links, labels, watchers (backend+tests+**UI**); automation rules, scoped API tokens (backend+tests, **UI pending**); board WIP limits (UI); SSE-ticket auth; **WATCHER read-only role** (backend+tests+UI, admin-managed, per-platform or global). → [[Features - Shipped]] / [[Module - Authz]].

## What's next (priority order) → [[Feature Roadmap]]
1. **SLA policies + escalations** — *test-first, invasive* (rewires `computeSla`); also fix L8 reopen baseline.
2. **Automation-rules + API-token config UIs** (backends done).
3. **Board swimlanes** (needs dnd-kit droppable-id-per-lane refactor).
4. **JQL-like filters** (query grammar on `SavedView`).
5. **Email-to-issue intake** — **do LAST** (user directive); needs a mail-provider decision.
- Decision-gated security: Redis throttler (M8), disk-streaming uploads (M6).

## Gotchas before merging `dev → main` (which deploys)
- Config is **fail-closed**: prod needs `NODE_ENV=production`, `DB_SYNCHRONIZE=false`, explicit `CORS_ORIGINS`, `JWT_SECRET`≥32, `SCAN_DRIVER=clamav` (or `ALLOW_UNSCANNED_UPLOADS=true`) — or it won't boot. → [[Configuration and Env]].
- The `tokenVersion` change **logs out all staff once** on deploy (re-login).
- `search_vector` FTS only works where the `AddIssueSearchVector` migration ran (prod); under dev `synchronize` description-search returns nothing (reference search still works).

## Working conventions
- Commit to `dev` (or a feature branch → `dev`), never straight to `main`. **No `Co-Authored-By: Claude` trailer.**
- New feature = follow the pattern in [[Features - Shipped]]: entity + migration + scoped service + controller + spec, then wire in `app.module.ts`, then UI in `IssueExtras.tsx`/relevant page.
- Reuse enums (`src/common/enums.ts`), the `PlatformAccessGuard`, and `ScopeService`. Keep everything tenant-isolated (same-platform checks).

## This vault lives inside the git repo (committed)
`D:\CIMP\CIMP\vault` is under the repo root and is **committed** as shared team docs. Obsidian's per-machine UI state (`vault/.obsidian/workspace.json`, `graph.json`, `cache/`) is gitignored; the shared config (`app.json`, `appearance.json`, `core-plugins.json`) is tracked. Keep it current with `/doc-sync` after a change (see [[LLM Guide]]).

Related: [[CIMP - Home]] · [[Decisions and Glossary]] · [[Deployment, CI-CD and Dev Workflow]]
