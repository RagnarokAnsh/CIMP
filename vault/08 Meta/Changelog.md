---
title: Changelog
tags: [cimp, changelog, updates]
type: log
updated: 2026-07-07
---
# Changelog / Updates Log
← [[CIMP - Home]] · [[Session Handoff]]

> Reverse-chronological record of significant work. Branch **`dev`** holds all of the below (~18 commits ahead of `main`, the deploy branch). Detailed tracker for security: `SECURITY_AUDIT.md`.

## 2026-07-12 — JQL saved filters, board swimlanes, Playwright e2e harness
- **JQL filters** — AND-only grammar in `src/issues/jql.ts` (test-first, 9 specs): `status = NEW AND priority IN (HIGH, CRITICAL) AND assignee = me AND label = bug AND created >= 2026-07-01 AND text ~ "login"`; fields status/priority/platform(key)/assignee/reporter/label/created/updated/text, `me`/`unassigned` sentinels, quoted values; parse errors → 400 with pointed messages. Applied on top of the scope filter (narrow-only). List page gains a monospace query input with inline error display; SavedViews persist the query.
- **Board swimlanes** — Group-by select (Assignee/Priority) renders lanes of compact status columns; dragging disabled in lanes (droppable ids namespaced per lane per the roadmap's collision note) — the per-card move menu does the work. WIP badges only on the flat board.
- **Playwright e2e harness** (`frontend/playwright.config.ts` + `tests/e2e/`, `npm run test:e2e` in frontend): boots the real API (:3972, crons off) + Vite (:5199, proxy override) against dev Postgres, seeds via global-setup, mints real handoff tokens (fixed dev secret). 6 tests: reporter files via handoff, live deflection offer, triage inbox, JQL valid+invalid, ⌘K palette navigation, board swimlane toggle. All green on first full run (1.2m).
- Backend: **147 unit / 21 e2e**.

## 2026-07-12 — SLA policies/escalations, Integrations admin UI, ops analytics, weekly digest, screenshots
- **SLA (test-first, L8 fixed)** — `platforms.sla_policy` jsonb overrides the env defaults per priority (UI: Admin → Platforms → SLA, validated ≤8760h); `issues.sla_started_at` baseline resets on REOPEN (no instant re-breach) + `sla_breached_at` idempotence marker (migration #17). `computeSla`/`slaDueSql` rewired (platform join now required for the SQL twin). **Breach sweep** every 5 min (`@nestjs/schedule`): conditional-update mark → SYSTEM audit + `issue.sla_breached` event → email escalation (assignee/focal/watchers) + webhook. `SLA_SWEEP_ENABLED` env kill-switch. +11 unit tests.
- **Admin Integrations UI** (`AdminIntegrations.tsx`) — new Admin tabs: **Integrations** (per-platform automation-rule builder with staff/label/priority pickers + API-token management with copy-once plaintext) and **Webhooks** (CRUD, event filter checkboxes, copy-once secret). Closes the three UI-less backends.
- **Ops analytics** — dashboard `ops` block (raw SQL percentiles): time-to-first-staff-action p50/p90, resolution p50/p90, reopen rate, deflected count + deflection rate (30d); rendered as a second KPI row.
- **Weekly digest** (`digest.service.ts`) — Monday 08:00 cron per active platform → focal points + watcher-role staff (incl. global): created/resolved/open/past-SLA counts + CSAT. Skips quiet platforms; `DIGEST_ENABLED` kill-switch.
- **Screenshots (cimp-connect v0.7.0)** — `captureScreenshot` hook (canvas/Blob/dataURL; `displayMediaScreenshot()` helper needs no deps) → downscaled ≤1200px JPEG rides the fragment (cap 480KB, dropped first when over); the CIMP form shows a removable preview and submits it as a **normal attachment** (scan pipeline applies) — never stored in jsonb.

## 2026-07-12 — Plans 04 + 06 + 07 shipped (deflection, CSAT, triage inbox)
- **CSAT (Plan 06)** — in-portal only (email links descoped per OD-02): 👍/👎 widget on the reporter's issue page once RESOLVED/CLOSED (`POST /reporter/issues/:id/csat`, upsert, 409 before resolution); 👎 adds an internal flag comment; `csat.received` event → webhooks; staff CSAT badge; dashboard "CSAT (30d)" KPI. `csat_responses` (migration #15).
- **Deflection (Plan 04)** — reporter form shows privacy-safe "already tracked" matches while typing (status/age/report-count + opaque 30-min subscribe JWT — no ids/refs/descriptions leak); "Notify me instead" → `reporter_subscriptions` (migration #16, with `issues.publicly_visible`/`public_title`); one-shot **email** on resolution (documented OD-02 exception — subscribers have no in-app surface). Staff "Known issue" publish card → unauthenticated `GET /public/platforms/:key/known-issues` (curated titles only, CORS `*`, throttled) → **cimp-connect v0.6.0** `<cimp-known-issues>` element + React `<KnownIssues />`. Shared FTS helper `src/issues/search-terms.ts` (per-term ILIKE fallback under dev synchronize).
- **Triage inbox (Plan 07)** — `/staff/triage`: NEW queue oldest-first, one card at a time, keyboard-first (`j/k` nav, `1-4` priority, `s` first legal transition, `a` assign-to-me, merge dialog), auto-advance on completing actions; `use-hotkeys` hook (dead in inputs/dialogs); nav + palette entries. Command palette itself already existed — plan note corrected.
- Tests: **127 unit** (+14 csat/deflection) / **21 e2e** green; live smoke verified all flows incl. privacy shapes, CORS, throttle-auth, subscription fan-out (rows cleared on resolution).

## 2026-07-11 — SDK context capture (Plan 03) shipped — pre-diagnosed reports
- **cimp-connect v0.5.0** (tagged): `initCimpDiagnostics()` passively rings console errors (20) / failed requests (10, method + redacted URL + status — never bodies/headers) / route breadcrumbs (10). Fetch-mode buttons append the snapshot to the handoff URL as a **`#cimpctx=` fragment** (gzip + base64url, 48KB cap) — fragments never reach any server or log.
- **CIMP intake**: `issues.context` jsonb (migration #14). Multipart nuance: `context` arrives as a JSON *string* form field (multer), parsed + clamped by `src/reporter/context-sanitizer.ts` (strings 1k, arrays 25, keys 40, depth 5, total 64KB; malformed → dropped silently, oversize raw → 400). Never fails the report it rides on.
- **UI**: reporter form shows a removable "diagnostics will be included" chip with a view dialog (consent); staff detail gets a collapsible Diagnostics panel (env table, console errors, failed requests, route history, Copy JSON) — shared `DiagnosticsView` component, plain-text rendering only.
- Tests: 113 unit (+5 sanitizer) / 21 e2e. Live-verified end-to-end: SDK encode → lossless decode → intake → staff detail; hostile inputs contained. → [[Plan 03 - SDK Context Capture]]

## 2026-07-11 — Outbound webhooks (Plan 01) shipped — Slack descoped
- **`webhook_endpoints`** (migration #13): admin-configured HTTPS targets, per-platform or global, optional event-name filter. CRUD at `/api/admin/webhooks` (ADMIN only, Swagger/curl — no UI yet); HMAC secret generated server-side, returned exactly once.
- **Delivery** (`src/webhooks/`): listener bridges all six domain events (incl. `issue.merged`) → `X-CIMP-Event` + `X-CIMP-Signature: sha256=<HMAC(rawBody)>`, 5s timeout, 3 detached unref'd retries (2s/8s/30s), never blocks the request path. Comment bodies deliberately excluded from payloads.
- **SSRF guard**: https-only + loopback/private/link-local hostname rejection, enforced on create/update AND re-checked per send.
- **Slack variant dropped** (user decision — no Slack community); no `kind` column shipped, easy to add later.
- Tests: 108 unit (+9) / 21 e2e (+4, incl. whitelist + SSRF 400s). Live-verified against webhook.site: signatures recomputed and matched for `issue.created` + `issue.status_changed`. → [[Plan 01 - Outbound Webhooks and Slack]]

## 2026-07-10 — Duplicate merge flow (Plan 02) shipped
- **Merge as duplicate**: `POST /api/staff/issues/:id/merge` closes the duplicate with `issues.duplicate_of_id` → canonical (migration #12 `AddIssueDuplicateOf`), creates the DUPLICATES link, copies staff watchers, posts reporter-visible/internal system comments, emits new `issue.merged` event (deliberately NOT a STATUS_CHANGED — no automation/notification side effects). Chain-flattening, same-platform-only, optimistic-lock 409, closed-issue guards. REOPEN on a merged duplicate detaches it.
- **Close the loop**: when the canonical hits RESOLVED, a listener in `merge.service.ts` drops a reporter-visible "underlying problem resolved" comment on every duplicate + bumps `updatedAt` (in-app only per OD-02).
- **Privacy invariant verified live**: the duplicate's reporter payload never contains the canonical id/reference.
- **UI**: Merge-into dialog (search same-platform open issues), duplicate banner, "Duplicates (N)" list, System author fallback. `gen:api` regenerated.
- Tests: 88 unit (+11 `merge.service.spec.ts`) and 17 e2e (+3 merge authorization: focal 2xx, cross-platform 404-no-oracle, watcher 403) — all green. → [[Plan 02 - Duplicate Merge Flow]]

## 2026-07-10 — Feature strategy + executable plans; Add-staff UI; seed:prod wipe
- **8 implementation plans** written to `05 Features/Plans/` (webhooks, duplicate merge, SDK context capture, deflection, AI triage, CSAT, command palette/triage inbox) — designed for execution by junior devs/smaller LLMs; decisions pre-made, repo gotchas encoded. Index: [[Plan 00 - How to Execute These Plans]].
- **Admin UI: Add-staff dialog** in Staff & roles tab (`AdminPage.tsx`) — `POST /admin/staff` existed but had no UI; gap surfaced after the prod DB wipe.
- **`seed:prod` gained `WIPE_DATA="YES_DELETE_ALL_DATA"`** — dynamic TRUNCATE of all app tables (schema + migrations kept) for clean production resets; supports `HANDOFF_SECRET` passthrough so connected portals keep working.

## 2026-07-10 — cimp-connect v0.4.0: Express/Next/fetch-mode/Java (sibling repo `D:\cimp-connect`)
- **`/express`** one-liner (`cimpHandoff()`, env-configured, default `req.user` mapping) and **`/next`** App Router handler factory.
- **Content negotiation in every backend adapter** (Express/NestJS/Next/Spring): 302 for link clicks, `{ url }` JSON for `Accept: application/json` / `?format=json` — enables header-JWT apps (Angular interceptor) where link navigation carries no auth.
- **`mode="fetch"` + `getAuthHeaders`** on `/react` and `/element` buttons (popup-safe `window.open`).
- **Java port under `java/`**: dependency-free HS256 core (token cross-verified with Node `jsonwebtoken` incl. JSON-escaping edge cases) + Spring Boot 3 auto-configuration (`cimp.*` properties + one `CimpUserResolver` bean); JitPack via root `jitpack.yml`. Spring classes compile against Boot 3.3.5; not yet run in a live app. → [[cimp-connect Package]]

## 2026-07-07 — Deploy script hardening
- Rewrote `scripts/deploy.sh`: two-phase rollback (abort-early before pm2 / real rollback after), **`GET /api/health` gate** with fail-fast on pm2 `errored`/`stopped`, `flock` single-instance lock, required-tool check, `DEPLOY_REF` pinning, and **atomic frontend swap** (build to `dist.new`, `mv` in — no mid-deploy 404s).
- **Pre-flight env check** mirroring [[Configuration and Env|env.validation.ts]] runs *before* pm2 is touched — catches the fail-closed prod config (`SCAN_DRIVER=clamav`/`ALLOW_UNSCANNED_UPLOADS`, `JWT_SECRET`≥32, `DB_SYNCHRONIZE=false`, `CORS_ORIGINS`) and aborts with a named error while the old build stays live. This is the fix for the **clamav boot-crash** a deploy hit: the old script had no health check, so pm2 crash-looped while the deploy reported success. → [[Deployment, CI-CD and Dev Workflow]]

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
