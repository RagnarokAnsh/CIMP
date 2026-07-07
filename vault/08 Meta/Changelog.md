---
title: Changelog
tags: [cimp, changelog, updates]
type: log
updated: 2026-07-07
---
# Changelog / Updates Log
← [[CIMP - Home]] · [[Session Handoff]]

> Reverse-chronological record of significant work. Branch **`dev`** holds all of the below (~18 commits ahead of `main`, the deploy branch). Detailed tracker for security: `SECURITY_AUDIT.md`.

## 2026-07-07 — WATCHER role (read-only staff)
- **New `Role.WATCHER`** — read-only staff role, grantable per-platform or **globally** from Admin → Staff & roles. Sees issues/comments (incl. internal)/attachments/labels/links/dashboard/**CSV export** and can watch (subscribe to) issues; **no mutations**, no automation/API-token config, **excluded from the @mention picker** and crafted-mention delivery.
- Central role sets in `src/authz/role-sets.ts` (`STAFF_READ_ROLES` / `STAFF_WRITE_ROLES`) replaced the per-file `ALL_STAFF_ROLES`/`TRIAGE_ROLES` copies; `PlatformAccessGuard` default is now **fail-closed** (`STAFF_WRITE_ROLES` when no `@Roles`). → [[Module - Authz]]
- **Closed in passing:** `bulkUpdate` authorized against read scope (`scopedPlatformIds`) — a mixed-grant user could have bulk-mutated a platform they only watch; now requires a write role per issue.
- Migration #11 `AddWatcherRole` (`ALTER TYPE role_enum ADD VALUE`); frontend gating (detail panel actions/composer, board drag, bulk toolbar, labels/links `readOnly`); +6 unit / +6 e2e tests; demo watcher `lena.fischer@cimp.dev` in `seed:demo`.
- **All seeders updated:** `seed` adds `watcher@cimp.dev` (read-only on portal-a); `seed:prod` gets an opt-in watcher via `WATCHER_EMAIL`/`WATCHER_PASSWORD` (+`WATCHER_GLOBAL=true`); `seed:presentation` adds per-platform (`lena.fischer@demo.com`) and global (`victor.osei@demo.com`) watchers. Also fixed a latent seeder bug: staff lookups now match by email **or** `idp_subject` instead of email only (was colliding on the unique `idp_subject`).

## 2026-07 — Documentation
- Built this **Obsidian knowledge vault** (`D:\CIMP\CIMP\vault`): architecture, per-module notes, [[Entity Reference]], [[Migrations Log]], [[Directory Index]], [[LLM Guide]], and this changelog. Purpose: LLM/session resumability without re-reading source.

## Features (JIRA-like) — [[Features - Shipped]]
- **Scoped API tokens** — `ApiToken` (SHA-256 hashed, read-only per platform), `ApiTokenGuard`, `/api/integrations/issues[/:id]`, management under `/api/staff/platforms/:pid/api-tokens`. Backend + 3 tests. → [[Module - Integrations]]
- **Board WIP limits** — per-column soft caps with over-limit warning (`BoardPage.tsx`).
- **Automation rules** — per-platform "when X then Y" engine, loop-safe, `@OnEvent`-driven. Backend + 3 tests. → [[Module - Issues]] / [[Features - Shipped]]
- **Watchers** — subscribe + notified on status change (integrated into `notifyStatusChange`). Backend + tests + UI.
- **Labels** — per-platform catalog + issue tagging. Backend + tests + UI.
- **Issue links** — blocks/relates/duplicates, same-platform. Backend + tests + UI.
- **Feature UI** — `IssueExtras.tsx` (watch toggle + labels + links) wired into the staff issue detail panel.

## Security audit & hardening — [[Security Audit and Hardening]]
Multi-agent OWASP audit → 57 findings; ~42 fixed with tests. Highlights:
- **Wave 0 (launch blockers):** `uuid-ossp` in baseline migration (prod migrate was failing); fail-closed `NODE_ENV`; `JWT_SECRET`≥32 guard; unscanned-uploads guard; DB indexes.
- **Wave 1 + H8 (auth/tenant):** session revocation (`tokenVersion`); hand-off `maxAge`+`exp`; **existence oracle → 404**; cross-tenant `@mention` fix; `editComment` scope recheck; **SSE ticket auth**; FK NOT-NULL.
- **H5/M5 (uploads):** magic-byte content sniffing, `nosniff`, sandboxed PDF iframe.
- **Wave 2 (availability):** CSV export cap; FTS uses GIN `search_vector` index.
- **Wave 3 (observability):** login/401-403 audit logging; 500→409 lock mapping; timing-safe Jira webhook; password min 12; misc validation.
- **Wave 4 (tests):** handoff auth boundary, scan-gating, reporter INTERNAL-comment + cross-access.
- **Decision:** L1 = keep (focal-point triage) → [[Decisions and Glossary]].

## Integrations & connector
- **cimp-connect** npm package (`RagnarokAnsh/cimp-connect`, GitHub Packages v0.3.0): core + `/nestjs` + `/react` + `/element` + `init` CLI. → [[cimp-connect Package]]
- **FAFICS** connected as first consumer (`feat/cimp-connect-package`). → [[FAFICS Integration]]
- **Self-support**: in-app "Get Support" button (CIMP files issues into itself). → [[Module - Self-Support]]

## Ops
- **CI/CD**: `.github/workflows/deploy.yml` + `scripts/deploy.sh` — push to `main` → SSH deploy to AWS EC2 (pm2 + nginx). → [[Deployment, CI-CD and Dev Workflow]]

## Still open → [[Feature Roadmap]]
SLA policies + escalations (invasive), JQL-like filters, email-to-issue intake (do last), automation/API-token config UIs, full board swimlanes; decision-gated security (Redis throttler M8, disk-streaming uploads M6).
