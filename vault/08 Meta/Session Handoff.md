---
title: Session Handoff
tags: [cimp, handoff, resume]
updated: 2026-07-13
---
# Session Handoff — read this first when resuming
← [[CIMP - Home]]

> Purpose: pick up work in a **fresh session** without re-deriving context. Read this + [[Architecture Overview]] + [[Backend Modules and API]] and you're oriented.

## Where the code is
- **Active branch: `dev`** — ~18 commits ahead of **`main`** (the deploy branch). All recent work (security + features) is on `dev`. `main` is untouched.
- Repo `D:\CIMP\CIMP` (GitHub `RagnarokAnsh/CIMP`). Vault `D:\CIMP\CIMP\vault`.
- Sibling repos: `D:\cimp-connect` ([[cimp-connect Package]]), `D:\FAFICS` ([[FAFICS Integration]]).

## State (green)
- **147 unit + 21 e2e (backend) + 6 Playwright e2e (frontend) pass**; both builds clean. Verify: `npm test && npm run test:e2e` (root) and `cd frontend && npm run test:e2e` (needs dev Postgres up; boots API on :3972 + Vite on :5199).
- **2026-07-13 audit pass done** (auth hardening + dedup — see Changelog). Top remaining engineering gaps, in order: **CI pipeline** (174 tests, nothing runs them automatically), error monitoring, then deploy dev→main (migrations 12-17) + domain/TLS.
- **Differentiator track COMPLETE except Plan 05 (AI triage — user deferred):** merge (02), webhooks (01), SDK context capture (03, v0.5.0), CSAT (06), deflection (04, v0.6.0), triage inbox (07). PLUS 2026-07-12: **SLA policies/escalations (L8 fixed), Admin Integrations UI, ops analytics + weekly digest, screenshots (cimp-connect v0.7.0)**. All live-verified. Migrations now #17 (`AddSlaPolicy`). New deps: `@nestjs/schedule`.
- **Deploy note:** dev is many features ahead of the AWS `main` deploy — merging dev→main runs migrations 12-17 and ships all new surfaces at once. New env (optional): `SLA_SWEEP_ENABLED`, `DIGEST_ENABLED` (both default on).
- **Local dev ports:** FAFICS now squats :3000 (web) and :3001 (api) — run the CIMP backend with `PORT=<free> npm run start:dev` when both are up.
- **Security:** ~42/57 audit findings fixed. Tracker: `SECURITY_AUDIT.md`. → [[Security Audit and Hardening]].
- **Features shipped:** issue links, labels, watchers, automation rules, scoped API tokens (all backend+tests+**UI** — automation/token UIs now live in Admin → Integrations); board WIP limits **+ swimlanes** (UI); SSE-ticket auth; **WATCHER read-only role** (backend+tests+UI, admin-managed, per-platform or global). Plus the differentiator track: merge, webhooks, SDK context capture, CSAT, deflection, triage inbox, SLA policies/escalations, ops analytics/digest, JQL. → [[Features - Shipped]] / [[Module - Authz]].

## What's next (priority order) → [[Feature Roadmap]]
The differentiator + JIRA-like feature tracks are **done** (SLA policies/escalations, automation/API-token UIs, board swimlanes, JQL all shipped — see [[Features - Shipped]]). Remaining, in order:
1. **CI pipeline** — 174 tests (147 unit + 21 e2e + 6 Playwright), nothing runs them automatically yet.
2. **Error monitoring** (no runtime observability).
3. **Deploy `dev → main`** — runs migrations 12–17, ships all new surfaces at once; needs the prod env set (incl. optional `SLA_SWEEP_ENABLED`/`DIGEST_ENABLED`) + domain/TLS. → [[Configuration and Env]].
4. **AI triage (Plan 05)** — user-deferred. → [[Plan 05 - AI Triage Pluggable and Free]].
5. **Email-to-issue intake** — **do LAST** (user directive); needs a mail-provider decision.
- Decision-gated security: Redis throttler (M8), disk-streaming uploads (M6); known gap — webhook SSRF guard is hostname-string only (admin-gated).

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
