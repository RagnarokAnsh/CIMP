---
title: Features - Shipped
tags: [cimp, features]
updated: 2026-07-27
---
# Features - Shipped (JIRA-like)
← [[CIMP - Home]] · roadmap → [[Feature Roadmap]]

All backend follows the same pattern: entity + migration + service (scoped, tested) + controller under `/api/staff/...`, guarded by `PlatformAccessGuard` or a platform-scope check. All tenant-isolated.

## Canned responses `#feature`
`src/canned-responses/*` · `CannedResponse`. Per-platform reply templates with `{{reporter}}`/`{{reference}}`/`{{assignee}}`/`{{platform}}` placeholders substituted **client-side at insert** (the server never interpolates). Write-role only for reads too — a watcher can't comment, so there is no read-only surface. Routes: `/api/staff/platforms/:pid/canned-responses` (CRUD). **UI:** Admin → Integrations (manage) + a "Templates" dropdown in the comment composer that inserts at the caret. → [[Module - Canned Responses]]

## Public status page `#feature`
`src/status/*` · `StatusComponent` + `StatusIncident` + `StatusIncidentUpdate`. Per-platform components with a health status, and incidents carrying an **append-only public timeline** — posting an update is how an incident progresses (the incident inherits the update's status; RESOLVED stamps `resolvedAt`, re-opening clears it). Overall banner = worst component, and an open incident forces at least DEGRADED so a platform that only posts incidents never reads green. Cross-platform component ids are refused. Routes: staff `/api/staff/platforms/:pid/status/*`; **public `GET /api/public/platforms/:key/status`** (unauthenticated, CORS `*`, 30s cache, 60/min — a DISABLED platform 404s like an unknown one). **UI:** Admin → Status page tab; public page at `/status/:key`. → [[Module - Status Page]]

## Tenant-owner reporting `#feature`
`src/dashboard/*` — `GET /api/staff/platforms/:pid/report`. One platform's support health (FRT/resolution percentiles, SLA, CSAT, reopen rate, deflection, 14-day trend, published known issues), reusing every dashboard aggregate via `computeForScope`. **Read-role, so the read-only `WATCHER` grant is the canonical tenant-observer role** — a platform's owning team can watch their support health with zero mutation rights. **UI:** `/staff/reports`, sharing `dashboard-widgets.tsx` with the main dashboard so the two can't drift. → [[Module - Dashboard]]

## Reporter portal i18n + machine translation `#feature`
Two independent halves:
- **UI localization** (`frontend/src/i18n/`) — EN/ES/FR/DE for the reporter portal, dependency-free and typed off the `en` dictionary; `?lang=` → localStorage → `navigator.language` → `en`; per-*key* English fallback. The staff workspace is deliberately not localized. → [[Frontend - Reporter Surface]]
- **Message translation** (`src/translation/`) — an env-chosen seam (`TRANSLATE_DRIVER=none|libretranslate`, default off) that fills a jsonb cache off the `comment.added` event. **`Comment.body` is always the original**; both surfaces show the translation with a "show original" toggle, so a provider outage degrades to untranslated text rather than a failed reply. The reporter's language rides an optional `locale` claim on the hand-off token. → [[Module - Translation]]

## Issue links `#feature`
`src/issues/issue-links.*` · `IssueLink` entity. Directional `BLOCKS|RELATES|DUPLICATES`, **same-platform only**, self-link/duplicate rejected, inward/outward presentation. Routes: `GET/POST/DELETE /api/staff/issues/:id/links`. **UI:** links card in [[Frontend Overview|IssueExtras.tsx]] (add by typing a reference → resolved via scoped search).

## Labels `#feature`
`src/issues/labels.*` · `Label` + `IssueLabel`. Per-platform catalog + issue tagging; foreign-platform label rejected. Routes: `/api/staff/platforms/:pid/labels` (catalog) + `/api/staff/issues/:id/labels` (tagging). **UI:** label chips + add-existing + inline create.

## Watchers `#feature`
`src/issues/watchers.*` · `IssueWatcher`. Watch/unwatch; **integrated into `notifyStatusChange`** so watchers get status-change notifications alongside assignee + focal points. Routes: `/api/staff/issues/:id/watchers`. **UI:** watch toggle in the issue header.

## Automation rules `#feature`
`src/issues/automation.*` · `AutomationRule`. Per-platform "when X then Y": trigger `ISSUE_CREATED` / `STATUS_CHANGED[+status]`, action `SET_PRIORITY|ASSIGN|ADD_LABEL`. **Loop-safe** (actions emit only `PRIORITY_CHANGED`/`ASSIGNED`, which the listener doesn't react to; it only hooks `CREATED`/`STATUS_CHANGED`). **`actionValue` is validated per-action** at write time *and* re-checked at apply time (2026-07-24): SET_PRIORITY must be a `Priority`, ASSIGN a uuid of an ACTIVE DEVELOPER on the platform (mirrors `IssuesService.applyAssignment`), ADD_LABEL a label owned by the platform — a rule can no longer assign to someone with no access. SET_PRIORITY/ASSIGN now **emit the same domain events the manual path does**, so an automation write reaches notifications/webhooks/SSE (`actorStaffId=''`, so the system never notifies "itself"). `AutomationListener` hooks `@OnEvent` off the [[Domain Events and Issue Lifecycle|event bus]]; misconfigured/stale rules are logged, never break intake; changes audited as `SYSTEM`. Routes: `/api/staff/platforms/:pid/automation-rules` (CRUD). **UI:** Admin → Integrations tab (rule builder, `AdminIntegrations.tsx`).

## Scoped API tokens `#feature`
`src/integrations/*` · `ApiToken`. SHA-256 hashed (plaintext shown once, `cimp_<48hex>`), read-only per platform. `ApiTokenGuard` authenticates `Authorization: Bearer`/`X-Api-Token` → binds request to the platform. Routes: management `/api/staff/platforms/:pid/api-tokens`; read `GET /api/integrations/issues[/:id]`. **UI:** Admin → Integrations tab (copy-once token, `AdminIntegrations.tsx`).

## Board WIP limits + swimlanes `#feature`
`frontend/src/staff/BoardPage.tsx` — per-column soft caps (`IN_PROGRESS:6`, `ON_HOLD:4`); badge turns red at/over limit. **Swimlanes:** group by Assignee/Priority (persisted in localStorage); each lane is a row of compact status columns. Dragging is disabled in lanes (droppable ids namespaced `lane::status` to avoid collisions) — cards move via the per-card menu. WIP badges only on the flat board.

## Duplicate merge flow `#feature`
`src/issues/merge.service.ts` · `Issue.duplicateOf`. `POST /api/staff/issues/:id/merge` closes the duplicate → canonical, creates the DUPLICATES issue-link, copies staff watchers, posts reporter-visible + internal system comments, emits **`issue.merged`** (deliberately not `STATUS_CHANGED` — no automation/notification side effects). Chain-flattening (one hop deep), same-platform-only, optimistic-lock 409, closed-issue guards; REOPEN detaches. **Close-the-loop:** a `STATUS_CHANGED` listener drops a reporter-visible comment + bumps `updatedAt` on every duplicate when the canonical resolves (in-app only, OD-02). **UI:** Merge-into dialog, duplicate banner, "Duplicates (N)" list. → [[Plan 02 - Duplicate Merge Flow]]

## Outbound webhooks `#feature`
`src/webhooks/*` · `WebhookEndpoint`. Admin-configured HTTPS targets (per-platform or global), optional event filter. `WebhooksListener` bridges all domain events → `X-CIMP-Event` + `X-CIMP-Signature: sha256=<HMAC(rawBody)>`; 5s timeout, 3 detached unref'd retries (2s/8s/30s), never blocks the request path; comment bodies excluded. **SSRF guard** (`assertSafeUrl`): https-only + loopback/private/link-local rejection **+ all IPv6 literals wholesale** (IPv4-mapped `::ffff:` reaches cloud metadata), re-checked per send. Routes: `/api/admin/webhooks` CRUD (`@Roles(ADMIN)`, secret returned once). **UI:** Admin → Webhooks tab. → [[Plan 01 - Outbound Webhooks and Slack]]

## SDK context capture (diagnostics) `#feature`
`src/reporter/context-sanitizer.ts` · `Issue.context` jsonb. cimp-connect rings console errors/failed requests/breadcrumbs and appends a `#cimpctx=` **URL fragment** (never hits a server); the reporter form decodes it (`src/api/diagnostics.ts`), shows a removable consent chip, and submits it as the `context` field. Untrusted input — parsed + clamped (strings 1k, arrays 25, keys 40, depth 5, total 64KB; malformed dropped silently, never fails the report). Rendered plain-text via `DiagnosticsView` on both reporter + staff. Screenshots ride the same fragment but submit as a **normal attachment** (scan pipeline applies), never jsonb. → [[Plan 03 - SDK Context Capture]]

## CSAT `#feature`
`src/csat/*` · `CsatResponse`. In-portal 👍/👎 on the reporter's issue page once RESOLVED/CLOSED (`POST /api/reporter/issues/:id/csat`, upsert, 409 before resolution; email links descoped per OD-02). 👎 adds an internal flag comment; emits **`csat.received`** → webhooks. Staff CSAT badge on the detail panel; dashboard "CSAT (30d)" KPI. → [[Plan 06 - CSAT and Close the Loop]]

## Known-issues deflection `#feature`
`src/deflection/*` · `ReporterSubscription` + `Issue.publiclyVisible/publicTitle`. While typing a report, `GET /api/reporter/similar-issues` returns **privacy-safe** matches (status/age/report-count + opaque 30-min subscribe JWT — no ids/refs/descriptions leak). "Notify me instead" → `POST /api/reporter/subscriptions` → one-shot **email** on resolution (documented OD-02 exception). Staff publish a curated title (`PATCH /api/staff/issues/:id/publish`) → unauthenticated `GET /api/public/platforms/:key/known-issues` (titles only, CORS `*`, throttled) → cimp-connect banner. Shared FTS helper `src/issues/search-terms.ts`. → [[Plan 04 - Known-Issues Deflection]]

## Triage inbox `#feature`
`frontend/src/staff/TriagePage.tsx` (`/staff/triage`) — NEW queue oldest-first, one card at a time, keyboard-first (`j/k` nav, `1-4` priority, `s` first legal transition, `a` assign-to-me, merge dialog), auto-advance on action. `src/lib/use-hotkeys.ts` (dead in inputs/open dialogs). Nav + ⌘K palette entries. → [[Plan 07 - Command Palette and Triage Inbox]]

## SLA policies + escalations `#feature`
`src/issues/sla.ts` + `sla-escalation.service.ts` · `Platform.slaPolicy` + `Issue.slaStartedAt/slaBreachedAt`. Per-priority hour overrides per platform (Admin → Platforms → SLA, validated ≤8760h); baseline is `slaStartedAt` (resets on REOPEN — L8 fix, no instant re-breach). `computeSla` (JS) + `slaDueSql` (SQL twin, platform join required) kept in lockstep. **Breach sweep** (`@Cron`, 5 min): conditional-update mark → SYSTEM audit + **`issue.sla_breached`** → email escalation (assignee/focal/watchers) + webhook. `SLA_SWEEP_ENABLED` kill-switch.

## Ops analytics + weekly digest `#feature`
Dashboard `ops` block (`src/dashboard/dashboard.service.ts`, raw-SQL percentiles): time-to-first-staff-action p50/p90, resolution p50/p90, reopen rate, deflected count + rate (30d). **Weekly digest** (`src/notifications/digest.service.ts`, Mon 08:00 cron) — per-platform summary email to focal points + watcher-role staff; skips quiet platforms; `DIGEST_ENABLED` kill-switch.

## JQL-like filters `#feature`
`src/issues/jql.ts` — AND-only grammar on the staff issues list (`GET /api/staff/issues?jql=`): fields status/priority/platform/assignee/reporter/label/created/updated/text; ops `= != ~ >= <= IN`; `me`/`unassigned` sentinels; quoted values; parse errors → 400 with pointed messages. Applied **on top of** the scope filter (narrow-only, never widens). SavedViews persist the query. Note: CSV export ignores `jql`. **UI:** monospace query input on IssuesListPage.

## WATCHER role (read-only staff) `#feature`
`Role.WATCHER` + `src/authz/role-sets.ts` (`STAFF_READ_ROLES`/`STAFF_WRITE_ROLES`) + migration `AddWatcherRole`. Read-only staff role, grantable **per-platform or globally** from Admin → Staff & roles (no new endpoints — `POST /api/admin/roles` accepts it). Sees issues/comments (incl. internal)/attachments/labels/links/dashboard/CSV export, may watch issues; no mutations, no automation/API-token config, **not @mentionable** (`/members` and `platformMemberIds` filter watcher grants). Not to be confused with per-issue **Watchers** above — that's a subscription any staff can make; this is a role. **UI:** role in the admin picker; detail-panel actions/composer hidden, board drag disabled, bulk toolbar hidden, labels/links read-only. → [[Module - Authz]]

Related: [[Data Model]] · [[Backend Modules and API]]
