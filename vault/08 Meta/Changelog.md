---
title: Changelog
tags: [cimp, changelog, updates]
type: log
updated: 2026-07-06
---
# Changelog / Updates Log
← [[CIMP - Home]] · [[Session Handoff]]

> Reverse-chronological record of significant work. Branch **`dev`** holds all of the below (~17 commits ahead of `main`, the deploy branch). Detailed tracker for security: `SECURITY_AUDIT.md`.

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
