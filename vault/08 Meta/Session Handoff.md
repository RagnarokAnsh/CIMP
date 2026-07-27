---
title: Session Handoff
tags: [cimp, handoff, resume]
updated: 2026-07-27
---
# Session Handoff — read this first when resuming
← [[CIMP - Home]]

> Purpose: pick up work in a **fresh session** without re-deriving context. Read this + [[Architecture Overview]] + [[Backend Modules and API]] and you're oriented.

## Where the code is
- **Active branch: `dev`** — ~26 commits ahead of **`main`** (the deploy branch). All recent work (security + features + the UI/UX batch) is on `dev`. `main` is untouched.
- Repo `D:\CIMP\CIMP` (GitHub `RagnarokAnsh/CIMP`). Vault `D:\CIMP\CIMP\vault`.
- Sibling repos: `D:\cimp-connect` ([[cimp-connect Package]]), `D:\FAFICS` ([[FAFICS Integration]]).

## State (green)
- **244 unit (30 suites) + 40 e2e (backend) pass**; both typechecks clean; **ESLint green** (`npm run lint` in each root — 0 errors; 86 backend + 8 frontend warnings, informational); frontend build clean. Verify: `npm test && npm run test:e2e` (root) and `cd frontend && npm run test:e2e` (needs dev Postgres up; boots API on :3972 + Vite on :5199).
- ⚠️ **The Playwright suite has NOT been run since the 2026-07-27 UI/UX batch** — dev Postgres wasn't up in that session, so it timed out waiting for the webServer rather than running. It is now **12 tests** (a drift guard was added to `design-tokens.spec.ts`). **Run it first thing next session**; the batch changed interaction semantics the suite touches (the board card became a link instead of a `role="button"` div, Triage priority became a group, the login form gained a second button). Nothing is known-broken — it is simply unverified.
- **2026-07-27 (2): UI/UX audit — 48 findings measured and fixed, 6 commits.** Frontend only; **no backend, API or schema change, no migration.** Colour tokens re-solved against WCAG (light mode was systematically under-checked), status dots re-solved for colour-vision distance, the type scale actually implemented, heading semantics restored, focus ring / kbd / z-index / meter tones consolidated, accessibility floor established (skip link, route titles, landmarks), reporter i18n completed. `DESIGN.md` rewritten to match what ships. → Changelog · [[Frontend Overview]] · `DESIGN.md`
- **2026-07-27 (1): audit pass + six-feature batch.** A full audit (OWASP, bugs, redundancy, reuse, QA, UI/UX) found **no exploitable holes and no functional bugs**; then shipped: 429/error message mapping, **canned responses**, **tenant-owner reporting**, **public status page**, **reporter i18n (EN/ES/FR/DE)**, and **machine translation** of reporter↔staff messages. **Migrations now #20** (18 canned responses, 19 status page, 20 comment translations). New env (all default off/none): `TRANSLATE_DRIVER`, `TRANSLATE_API_URL`, `TRANSLATE_API_KEY`, `TRANSLATE_STAFF_LOCALE`, `TRANSLATE_REPORTER_LOCALES`. → Changelog · [[Module - Status Page]] · [[Module - Translation]] · [[Module - Canned Responses]]
- **Open from those audits (not yet done):** `npm audit fix` in both roots (18 backend / 7 frontend advisories, mostly build-time tooling — `typeorm <0.3.31`, `picomatch`, `tmp`, `webpack buildHttp`); and a status-machine parity test between `src/issues/status-machine.ts` and `frontend/src/lib/issue-status.ts` (they agree today, nothing enforces it). ✅ The duplicated audit-action label formatting is **done** — `actionLabel` in `lib/issue-meta.ts` now serves both `AuditPage` and `IssueDetailPanel`.
- **Design-system rules are now enforceable, so respect them:** no raw Tailwind palette outside `issue-meta.ts`/`status-meta.ts` (currently zero violations), no arbitrary type sizes (11px floor has a token), one `.focus-ring`, `--input` ≠ `--border`. `DESIGN.md` is accurate as of this batch — it previously described a system that had never been built. → [[Frontend Overview]]
- **2026-07-24: audit remediation batch** — essentially all of a ~30-finding audit pass fixed (tenant-isolation oracles, live SSE/notification/token revocation, webhook redirect SSRF, automation validation+events, Jira side-effects, scan-retry sweep, storage-cleanup, trust-proxy, plus consistency/dedup + the ESLint gate). Migrations unchanged (still #17). New env (all default on): `SCAN_RETRY_ENABLED`; new opt-in: `TRUST_PROXY` (default off). → Changelog · [[Security Audit and Hardening]]
- **2026-07-22: admin CRUD completed** — platform + staff lifecycle (disable/enable/delete), self- and last-admin lockout guards, a ghost-account fix in `upsertFromClaims`, and confirmation dialogs on every destructive action. No migration needed (`status` columns already existed). → Changelog · [[Module - Admin]]
- **2026-07-13 audit pass done** (auth hardening + dedup — see Changelog). Top remaining engineering gaps, in order: **CI pipeline** (231 tests, nothing runs them automatically), error monitoring, then deploy dev→main (migrations 12-17) + domain/TLS.
- **Differentiator track COMPLETE except Plan 05 (AI triage — user deferred):** merge (02), webhooks (01), SDK context capture (03, v0.5.0), CSAT (06), deflection (04, v0.6.0), triage inbox (07). PLUS 2026-07-12: **SLA policies/escalations (L8 fixed), Admin Integrations UI, ops analytics + weekly digest, screenshots (cimp-connect v0.7.0)**. All live-verified. Migrations now #17 (`AddSlaPolicy`). New deps: `@nestjs/schedule`.
- **Deploy note:** dev is many features ahead of the AWS `main` deploy — merging dev→main runs migrations 12-17 and ships all new surfaces at once. New env (optional): `SLA_SWEEP_ENABLED`, `DIGEST_ENABLED` (both default on).
- **Local dev ports:** FAFICS now squats :3000 (web) and :3001 (api) — run the CIMP backend with `PORT=<free> npm run start:dev` when both are up.
- **Security:** the 2026-07-24 batch closed essentially all remaining open findings from the audit (tenant-isolation oracles, live revocation across SSE/notifications/tokens, webhook redirect SSRF, +more). Tracker: `SECURITY_AUDIT.md`. → [[Security Audit and Hardening]].
- **Features shipped:** issue links, labels, watchers, automation rules, scoped API tokens (all backend+tests+**UI** — automation/token UIs now live in Admin → Integrations); board WIP limits **+ swimlanes** (UI); SSE-ticket auth; **WATCHER read-only role** (backend+tests+UI, admin-managed, per-platform or global). Plus the differentiator track: merge, webhooks, SDK context capture, CSAT, deflection, triage inbox, SLA policies/escalations, ops analytics/digest, JQL. Plus the 2026-07-27 batch: **canned responses, tenant-owner reporting, public status page, reporter i18n, machine translation**. → [[Features - Shipped]] / [[Module - Authz]].

## What's next (priority order) → [[Feature Roadmap]]
The differentiator + JIRA-like feature tracks are **done** (SLA policies/escalations, automation/API-token UIs, board swimlanes, JQL all shipped — see [[Features - Shipped]]). Remaining, in order:
0. **Run the Playwright suite** (`cd frontend && npm run test:e2e`, needs dev Postgres on :5433). It hasn't run since the UI/UX batch changed interaction semantics — see the warning above. Do this before anything else.
1. **CI pipeline** — 296 tests (244 unit + 40 backend e2e + 12 Playwright) **+ `npm run lint`** (green in both roots) **+ `npm audit`**, nothing runs them automatically yet. Note: adopting lint in CI needs `npm install` first (the eslint deps were added 2026-07-24) — first real run may surface warnings to triage. The Playwright gap above is exactly the failure mode CI exists to prevent.
2. **`npm audit fix`** in both roots — 18 backend / 7 frontend advisories, mostly build-time tooling; a few need breaking bumps (`@nestjs/typeorm@11`). Surfaced by the 2026-07-27 audit.
3. **Error monitoring** (no runtime observability).
4. **Deploy `dev → main`** — runs migrations 12–20, ships all new surfaces at once; needs the prod env set (incl. optional `SLA_SWEEP_ENABLED`/`DIGEST_ENABLED`; translation stays off unless `TRANSLATE_DRIVER` is set) + domain/TLS. → [[Configuration and Env]].
5. **AI triage (Plan 05)** — user-deferred. → [[Plan 05 - AI Triage Pluggable and Free]].
6. **Email-to-issue intake** — **do LAST** (user directive); needs a mail-provider decision.
- Decision-gated security: Redis throttler (M8), disk-streaming uploads (M6). Webhook SSRF: redirects are now refused and CGNAT blocked (2026-07-24); the remaining gap is DNS-rebinding (a public name resolving to a private IP) — hostname-string check only, admin-gated.

## Dev-environment gotchas (bit us on 2026-07-22)
- **`npm run seed` is idempotent by existence, not by content.** It only creates missing rows. A `admin@cimp.dev` row created some other way (2026-07-14, password-less and role-less) meant the whole Playwright suite failed at login. It now *repairs* `portal-a`'s hand-off secret and status, but staff rows are still create-only — if a staff login misbehaves, check `password_hash IS NOT NULL` and that the ADMIN grant exists before debugging code.
- **Never rotate `portal-a`'s hand-off secret in dev.** The Playwright helpers mint reporter tokens against the hard-coded `dev-secret-portal-a`; rotating breaks every reporter flow until `npm run seed` puts it back.
- FAFICS squats :3000/:3001 and its Postgres owns :5432 — **CIMP's Postgres is `cimp-pg` on :5433**. Run the backend with `PORT=<free> npm run start:dev`, and point Vite at it with `VITE_PROXY_TARGET`.

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
