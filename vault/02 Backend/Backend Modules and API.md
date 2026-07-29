---
title: Backend Modules and API
tags: [cimp, backend, api]
updated: 2026-07-13
---
# Backend Modules and API
← [[CIMP - Home]]

## Module map (`src/app.module.ts`)
Global: `ConfigModule` (Joi-validated, `is-production` fail-closed), `TypeOrmModule`, `ThrottlerModule` (global rate limit, `APP_GUARD`), `EventEmitterModule`, **`ScheduleModule.forRoot()`** (cron sweeps — SLA breach + weekly digest), **`AuditModule` (`@Global`)**.

Feature modules: `StorageModule`, `ScanningModule`, `HandoffModule`, `ReporterModule`, `AuthModule`, `AuthzModule`, `AuditModule`, `IssuesModule`, `CommentsModule`, `NotificationsModule`, `DashboardModule`, `AdminModule`, `JiraModule`, `HealthModule`, `SavedViewsModule`, `RealtimeModule`, `SelfSupportModule`, `IssueLinksModule`, `LabelsModule`, `WatchersModule`, `AutomationModule`, `IntegrationsModule`, `WebhooksModule`, `CsatModule`, `DeflectionModule`, **`CannedResponsesModule`** ([[Module - Canned Responses]]), **`StatusModule`** ([[Module - Status Page]]), **`TranslationModule`** (`@Global`, [[Module - Translation]]) — bolded = added 2026-07-27.

Guards: `JwtAuthGuard` (staff identity), `PlatformAccessGuard` + `RolesGuard` (scope), `HandoffGuard` (reporter), `SseAuthGuard` (ticket), `ApiTokenGuard` (integrations).

## API surface (route → purpose). Full table: `ARCHITECTURE.md` / Swagger `/api/docs`.

### Reporter (`/api/reporter/*`, `X-Handoff-Token`)
- `POST issues` — two-field intake (description + ≤5 files, sniffed types) + optional `context` JSON string (SDK diagnostics, sanitized/clamped — [[Features - Shipped|SDK context capture]]). `GET issues` — "My issues" + `hasUpdates`. `GET issues/:id` — detail (REPORTER_VISIBLE only) + `context`/`csat`. `POST issues/:id/comments` — reply. `POST issues/:id/seen`. `GET issues/:id/attachments/:aid` — scan-gated download.
- **CSAT:** `POST issues/:id/csat` — 👍/👎 resolution rating (upsert, 409 before RESOLVED/CLOSED). → [[Features - Shipped|CSAT]]
- **Deflection:** `GET similar-issues?q=` — privacy-safe matches (status/age/count + opaque subscribe JWT only). `POST subscriptions` — "notify me instead" via the opaque token. → [[Features - Shipped|Known-issues deflection]]

### Staff auth (`/api/auth/*`)
- `POST login` (rate-limited 10/min) → `{ accessToken }`. `POST logout`.

### Staff (`/api/staff/*`, Bearer JWT + scope)
- `GET me`. Issues: `GET issues` (search/filter/sort/paginate, scoped, SLA, **`jql=` AND-only filter grammar** — [[Features - Shipped|JQL filters]]), `GET issues/export` (CSV, capped 50k, injection-safe — note: ignores `jql`), `GET issues/:id` (+ `context`/`csat`/`duplicateOf`/`duplicates`/`publiclyVisible`), `PATCH .../status|assignment|priority` (require `version`), `PATCH issues/bulk`, `GET .../assignees|members`, `GET platforms`. Attachments: `GET attachments/:id/download` (scan-gated, `nosniff`). Comments: `POST issues/:id/comments`, `PATCH comments/:id`. Dashboard: `GET dashboard` (+ `csat`/`ops` blocks). Saved views: `GET/PUT/DELETE saved-views`. Notifications: `GET notifications`, `POST notifications/read`. Realtime: `POST events/ticket`, `GET events?ticket=` (SSE). **Merge:** `POST issues/:id/merge` (duplicate flow, WRITE roles). **Publish:** `PATCH issues/:id/publish` (known-issue opt-in, WRITE roles). **Links:** `GET/POST/DELETE issues/:id/links`. **Labels:** `.../platforms/:pid/labels` + `issues/:id/labels`. **Watchers:** `issues/:id/watchers`. **Automation:** `platforms/:pid/automation-rules`. **API tokens:** `platforms/:pid/api-tokens`. **Canned responses:** `platforms/:pid/canned-responses` (WRITE roles, [[Module - Canned Responses]]). **Status page:** `platforms/:pid/status/components|incidents` (+ `incidents/:id/updates`, WRITE roles, [[Module - Status Page]]). **Tenant report:** `GET platforms/:pid/report` — one platform's support health, READ roles incl. WATCHER ([[Module - Dashboard]]).

### Admin (`/api/admin/*`, `@Roles(ADMIN)`)
- `GET/POST/PATCH platforms` (`PATCH` now accepts `slaPolicy` jsonb), `POST platforms/:id/rotate-secret`, `GET/POST staff`, `POST staff/:id/password`, `POST/DELETE roles`, `GET audit`. **Webhooks:** `GET/POST/PATCH/DELETE webhooks` — outbound endpoint CRUD (`RolesGuard`, secret returned once). → [[Features - Shipped|Outbound webhooks]]

### Public (unauthenticated)
- `GET public/platforms/:key/known-issues` — staff-curated titles only, CORS `*`, `Cache-Control: max-age=60`, throttled. Feeds the cimp-connect known-issues banner. → [[Features - Shipped|Known-issues deflection]]
- `GET public/platforms/:key/status` — **public status page**: components + active/past incidents with their update timelines. CORS `*`, `max-age=30`, throttled 60/min. A DISABLED platform 404s like an unknown one. → [[Module - Status Page]]

### Integrations
- `POST integrations/jira/webhook` (shared-secret, constant-time). **`GET integrations/issues[/:id]`** — token-authed read-only ([[Features - Shipped|API tokens]]).

### Health
- `GET health` (liveness), `GET ready` (DB check).

## Scheduled jobs (`@nestjs/schedule` crons)
- **SLA breach sweep** (`src/issues/sla-escalation.service.ts`, every 5 min) — marks open issues past their per-platform/env SLA window (`sla_breached_at`, once per cycle) → SYSTEM audit + `issue.sla_breached` event. Kill-switch `SLA_SWEEP_ENABLED=false`.
- **Weekly digest** (`src/notifications/digest.service.ts`, Mon 08:00) — per-platform summary email to focal points + watcher-role staff. Kill-switch `DIGEST_ENABLED=false`. → [[Configuration and Env]]

Related: [[Configuration and Env]] · [[Auth and Authorization]] · [[Domain Events and Issue Lifecycle]]
