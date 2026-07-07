---
title: Backend Modules and API
tags: [cimp, backend, api]
updated: 2026-07-06
---
# Backend Modules and API
← [[CIMP - Home]]

## Module map (`src/app.module.ts`)
Global: `ConfigModule` (Joi-validated, `is-production` fail-closed), `TypeOrmModule`, `ThrottlerModule` (global rate limit, `APP_GUARD`), `EventEmitterModule`, **`AuditModule` (`@Global`)**.

Feature modules: `StorageModule`, `ScanningModule`, `HandoffModule`, `ReporterModule`, `AuthModule`, `AuthzModule`, `AuditModule`, `IssuesModule`, `CommentsModule`, `NotificationsModule`, `DashboardModule`, `AdminModule`, `JiraModule`, `HealthModule`, `SavedViewsModule`, `RealtimeModule`, `SelfSupportModule`, **`IssueLinksModule`**, **`LabelsModule`**, **`WatchersModule`**, **`AutomationModule`**, **`IntegrationsModule`** (bolded = added this session, [[Features - Shipped]]).

Guards: `JwtAuthGuard` (staff identity), `PlatformAccessGuard` + `RolesGuard` (scope), `HandoffGuard` (reporter), `SseAuthGuard` (ticket), `ApiTokenGuard` (integrations).

## API surface (route → purpose). Full table: `ARCHITECTURE.md` / Swagger `/api/docs`.

### Reporter (`/api/reporter/*`, `X-Handoff-Token`)
- `POST issues` — two-field intake (description + ≤5 files, sniffed types). `GET issues` — "My issues" + `hasUpdates`. `GET issues/:id` — detail (REPORTER_VISIBLE only). `POST issues/:id/comments` — reply. `POST issues/:id/seen`. `GET issues/:id/attachments/:aid` — scan-gated download.

### Staff auth (`/api/auth/*`)
- `POST login` (rate-limited 10/min) → `{ accessToken }`. `POST logout`.

### Staff (`/api/staff/*`, Bearer JWT + scope)
- `GET me`. Issues: `GET issues` (search/filter/sort/paginate, scoped, SLA), `GET issues/export` (CSV, capped 50k, injection-safe), `GET issues/:id`, `PATCH .../status|assignment|priority` (require `version`), `PATCH issues/bulk`, `GET .../assignees|members`, `GET platforms`. Attachments: `GET attachments/:id/download` (scan-gated, `nosniff`). Comments: `POST issues/:id/comments`, `PATCH comments/:id`. Dashboard: `GET dashboard`. Saved views: `GET/PUT/DELETE saved-views`. Notifications: `GET notifications`, `POST notifications/read`. Realtime: `POST events/ticket`, `GET events?ticket=` (SSE). **Links:** `GET/POST/DELETE issues/:id/links`. **Labels:** `.../platforms/:pid/labels` + `issues/:id/labels`. **Watchers:** `issues/:id/watchers`. **Automation:** `platforms/:pid/automation-rules`. **API tokens:** `platforms/:pid/api-tokens`.

### Admin (`/api/admin/*`, `@Roles(ADMIN)`)
- `GET/POST/PATCH platforms`, `POST platforms/:id/rotate-secret`, `GET/POST staff`, `POST staff/:id/password`, `POST/DELETE roles`, `GET audit`.

### Integrations
- `POST integrations/jira/webhook` (shared-secret, constant-time). **`GET integrations/issues[/:id]`** — token-authed read-only ([[Features - Shipped|API tokens]]).

### Health
- `GET health` (liveness), `GET ready` (DB check).

Related: [[Configuration and Env]] · [[Auth and Authorization]] · [[Domain Events and Issue Lifecycle]]
