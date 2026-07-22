---
title: Changelog
tags: [cimp, changelog, updates]
type: log
updated: 2026-07-22
---
# Changelog / Updates Log
← [[CIMP - Home]] · [[Session Handoff]]

> Reverse-chronological record of significant work. Branch **`dev`** holds all of the below (~19 commits ahead of `main`, the deploy branch). Detailed tracker for security: `SECURITY_AUDIT.md`.

## 2026-07-22 — Admin CRUD completion: platform/staff lifecycle, lockout guards, destructive-action UX

**The gap.** `StaffUser.status` was enforced everywhere (login refused, live tokens rejected per request, excluded from assignee pickers and notifications) but **nothing in the codebase could ever set it to `DISABLED`** — offboarding was impossible; the best you could do was revoke role grants one at a time while the person kept a valid session. Platforms had no delete and no UI for `status` at all. `POST /admin/staff/:id/password` worked but the frontend never called it. And an admin could revoke their own last `ADMIN` grant in one unconfirmed click — permanent lockout, DB-access-only recovery. Verified live: this deployment had exactly **one** admin.

- **Backend — lifecycle routes.** `DELETE /api/admin/platforms/:id` (409 naming the issue count when non-empty, since `Issue.platform` is `ON DELETE RESTRICT` — points at disabling instead), `PATCH /api/admin/staff/:id` (name/email/status), `DELETE /api/admin/staff/:id`. New `UpdateStaffDto`. `AdminModule` now reads `Issue`.
- **Backend — lockout guards.** `assertNotLastAdmin()` blocks removing the last `ACTIVE` ADMIN grant via disable, delete, *or* `revokeRole`; self-disable and self-delete are refused outright (400). All live-verified against the dev DB.
- **Backend — ghost-account fix** (`auth.service.ts`). `upsertFromClaims` no longer auto-creates a missing `local:` subject. Without this, deleting a staff member (or re-keying their email) while a token was live would **resurrect them as a role-less row re-claiming the freed email**, silently undoing the delete. Corroborated in the wild: the dev DB's `admin@cimp.dev` was a password-less, role-less row created 2026-07-14 by exactly that path. External IdP subjects still self-provision. → [[Module - Auth]]
- **Frontend — reachable CRUD.** Row action menus on both tables: platform disable/enable/delete + secret rotation; staff edit, set password (endpoint had no UI before), disable/enable, delete, and **per-row role granting** (replaces the detached "pick a person from a dropdown" form). Staff table gains the `status` column, a name/email filter, and an empty state.
- **Frontend — destructive-action UX.** New `alert-dialog` primitive + `ConfirmDialog`; **every** delete/revoke in the workspace now confirms (previously zero `AlertDialog`/`confirm()` existed anywhere — webhooks, API tokens, automation rules and role revokes all fired on one click). Irreversible ones require typing the platform key / staff email. Rotated hand-off secrets moved from a **12-second toast** into a copyable dialog you must acknowledge. Self/last-admin actions render disabled with the reason. A11y: named `aria-label`s and real hit targets on the icon buttons; the saved-view delete is no longer invisible to keyboard users.
- **Dialog-in-menu correctness.** Dialogs opened from a row menu render *outside* it and are state-driven — nesting them left the menu open afterwards, which marks the rest of the page `aria-hidden` and pushes the table out of the accessibility tree. Caught by the new Playwright suite.
- **Seed self-healing.** `npm run seed` now repairs `portal-a` drift (rotated hand-off secret, non-ACTIVE status) instead of just reporting "already exists" — rotating that platform from the UI otherwise silently breaks every local reporter flow and the Playwright fixtures.
- **Tests: 147→180 unit, 21→40 backend e2e, 6→11 Playwright (231 total, all green).** New `admin.service.spec.ts` (the module had **zero** unit tests) and `test/admin.e2e-spec.ts` (ADMIN gating + ValidationPipe rejection on the new routes); `auth.service.spec.ts` updated for the ghost fix. Swagger client regenerated.

## 2026-07-15 — Deploy workflow hardening (3 fixes)
- **`deploy.yml` reworked** (deploy.sh itself unchanged — review found no bugs in it): (1) **SSH host-key pinning** — new required `SSH_KNOWN_HOSTS` secret replaces the trust-on-first-use `ssh-keyscan` (which made `StrictHostKeyChecking=yes` decorative); workflow fails with setup instructions if unset. (2) **Backend e2e in the verify gate** — the 21 e2e tests are DB-free (repos stubbed), verified green in isolation; gate now runs 161 unit + 21 e2e. (3) **`RUN_MIGRATIONS` is no longer a secret** — manual deploys get a `workflow_dispatch` checkbox; push deploys read the repo *variable* `RUN_MIGRATIONS` (default false). **Action needed before next deploy:** create the `SSH_KNOWN_HOSTS` secret, delete the old `RUN_MIGRATIONS` secret, optionally set the variable to `true` (recommended — no-op when nothing pending). → [[Deployment, CI-CD and Dev Workflow]]

## 2026-07-15 — User manual
- **`CIMP-User-Manual.docx`** written to the repo root (uncommitted): 21-page end-user manual covering all four audiences (reporter / staff / admin / integrator) — roles matrix, lifecycle + transition matrix, JQL reference, triage shortcuts, SLA + escalations, cimp-connect integration (diagnostics/screenshots/known-issues), webhook verification, env reference, troubleshooting. Content cross-checked against `status-machine.ts`, `enums.ts`, `sla.ts`, `issue-events.ts`, `TriagePage.tsx`. Regenerate: the build script lives in the session scratchpad; content sources are [[Features - Shipped]] + this changelog.

## 2026-07-14 — External-review fixes (5) + SSE 401-storm root cause
- **Verified & fixed the 5 `/code-review` findings** (commit e5ecf8c, +7 tests, **154 unit green**): (1) **SSRF** — `assertSafeUrl` rejects all IPv6 literals wholesale (`host.includes(':')`), closing the IPv4-mapped `[::ffff:169.254.169.254]` → cloud-metadata bypass (real webhook receivers are DNS-named); (2) **SSE-ticket escalation** — `verifyToken` now rejects any token carrying `aud`, so a 30s SSE ticket can no longer double as a staff session; the three `JWT_SECRET` tokens (session/SSE/subscribe) are now mutually non-interchangeable; (3) `#cimpctx=` fragment strip keeps a trailing `&b=2`; (4) screenshot-dropped toast; (5) digest open-status SQL built from `OPEN_ISSUE_STATUSES`. → [[Module - Auth]]
- **SSE 401 storm fixed** (`GET /api/staff/events` every 3s): frontend `realtime.ts` hardened (token re-read per reconnect, exponential backoff 3→30s, stop-on-401). **Root cause** was in `upsertFromClaims`: the SSE path passes only `{sub,tv}`, so `email = claims.email ?? ''` clobbered the stored row to `email=''`/`name=sub`; with `staff_users.email` unique+not-null this broke password login and 401-stormed once a second staff email collided on `''`. Fix: partial claims now refresh only the fields they carry (SSE `{sub,tv}` leaves `name`/`email` intact), and the INSERT-race catch matches PG code `23505` per [[Module - Reporter|reporter-upsert]]; +7 `auth.service.spec.ts` regression tests (**161 unit green**). → [[Module - Auth]]
- **JWT_SECRET inventory audited (Q):** only session/SSE/subscribe use it; handoff + self-support use the per-portal `handoffSecret`; webhook signatures are per-endpoint HMAC. Nothing unaudited remains.
- **Seeders refreshed for the current schema** (`scripts/seed-presentation.ts`, `seed-demo.ts`): **dynamic table-discovery wipe** (no more hard-coded TRUNCATE list that silently skipped new tables) and the **`sla_started_at` back-dating fix** (was defaulting to `now()`, so nothing ever showed overdue/at-risk). The presentation seeder now also seeds the differentiator features — CSAT ratings, a published known-issue + reporter subscription (deflection), a duplicate merge (linked+closed), SDK diagnostics context, labels + watchers, per-platform SLA policy, and one automation rule / API token / webhook — plus a JQL saved view. `seed.ts` and `seed-prod.ts` were already schema-correct (no issue rows). Ran `seed:presentation` green (33 issues; overdue SLA work now renders).

## 2026-07-13 — Full audit pass: auth hardening + dedup consolidation
- **Security fix (real finding):** three token kinds share `JWT_SECRET` (staff, SSE tickets, deflection subscribe tokens). A sub-less token presented as a staff Bearer reached `upsertFromClaims`, where TypeORM **drops undefined where-conditions** — `findOne({ idpSubject: undefined })` matched an arbitrary staff row; only the tokenVersion mismatch prevented authentication. `verifyToken` now rejects tokens without a string `sub`; `upsertFromClaims` guards as defense in depth.
- **Dedup:** `OPEN_ISSUE_STATUSES` (1 definition replaces 4 — sla/dashboard/deflection/sla-escalation); shared `reporter-upsert.ts` (replaces two divergent copies; deflection subscribers now get the name/email refresh); `focalPointsFor()` helper in notifications (replaces 4 repeated grant queries); frontend `lib/toast-error.ts` (replaces 5 toast handlers — kept single-param deliberately: a second param poisons TanStack's mutation-variables inference).
- **Audit verdicts recorded:** no injection paths (all raw SQL parameterized); migrations 1-17 match entities; over-engineering check on the new modules came back clean. Known gaps (accepted, tracked): no CI, no error monitoring, in-process webhook retries (M8), memory-buffered uploads + local storage driver (M6), server-local cron timezones, CSV export ignores `jql`. Method note: single-reviewer inline audit (multi-agent run blocked by session limits) — run `/code-review ultra` for an independent pass.
- **Doc-sync:** the structured reference notes (which had lagged the changelog since ~07-06) were brought current with the shipped features — [[Backend Modules and API]], [[Frontend Overview]], [[Configuration and Env]], [[Features - Shipped]], [[Entity Reference]] (17→20 entities), [[Migrations Log]] (#12–#17), and [[Session Handoff]] "what's next".

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
Engineering: CI pipeline (nothing runs the 174 tests), error monitoring, deploy `dev → main` (migrations 12–17). Features: AI triage (Plan 05, deferred), email-to-issue intake (do last), sub-tasks/components/activity feed. Decision-gated security: Redis throttler (M8), disk-streaming uploads (M6).
