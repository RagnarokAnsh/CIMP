---
title: Migrations Log
tags: [cimp, backend, database, migrations]
updated: 2026-07-13
---
# Migrations Log (`src/migrations/`)
← [[Backend Modules and API]] · [[CIMP - Home]]

**Prod** uses migrations (`DB_SYNCHRONIZE=false`; `npm run migration:run`). **Dev** auto-syncs from entities (`DB_SYNCHRONIZE=true`) and does **not** run these. Commands → [[Deployment, CI-CD and Dev Workflow]]. Idempotent (`IF NOT EXISTS`) where possible.

| # | File | What it does |
|---|---|---|
| 1 | `1718500000000-Baseline.ts` | All tables/enums/constraints from scratch. **Now creates `CREATE EXTENSION uuid-ossp`** first (was missing → prod migrate failed on clean Postgres — audit C1). |
| 2 | `1718600000000-AddIssueSearchVector.ts` | `issues.search_vector` tsvector (description weight A + comment bodies weight B) via triggers, GIN-indexed. Backfills existing rows. |
| 3 | `1718700000000-AddIssueIndexes.ts` | btree indexes on hot issue filter/sort/FK columns (platform, status, assignee, reporter, created_at, composites) + child-table FK indexes (audit C-perf H7). |
| 4 | `1718800000000-AddStaffTokenVersion.ts` | `staff_users.token_version` (default 1) for session revocation (H1/M4). |
| 5 | `1718900000000-TightenFkNullability.ts` | `NOT NULL` on `issues.platform_id/reporter_id`, `comments.issue_id`, `attachments.issue_id` (entity/migration drift — H11). |
| 6 | `1719000000000-AddIssueLinks.ts` | `issue_links` (source/target/type, FK cascade, unique, indexes) → [[Features - Shipped]]. |
| 7 | `1719100000000-AddLabels.ts` | `labels` + `issue_labels` join. |
| 8 | `1719200000000-AddIssueWatchers.ts` | `issue_watchers` (issue, staff_user, unique). |
| 9 | `1719300000000-AddAutomationRules.ts` | `automation_rules` + trigger/action enums. |
| 10 | `1719400000000-AddApiTokens.ts` | `api_tokens` (hash unique, platform FK). |
| 11 | `1719500000000-AddWatcherRole.ts` | `ALTER TYPE role_enum ADD VALUE IF NOT EXISTS 'WATCHER'` (read-only staff role). Down is a no-op — Postgres can't drop enum values. |
| 12 | `1719600000000-AddIssueDuplicateOf.ts` | `issues.duplicate_of_id` (self-FK `ON DELETE SET NULL`) + index. Duplicate merge flow → [[Features - Shipped|Duplicate merge]]. |
| 13 | `1719700000000-AddWebhookEndpoints.ts` | `webhook_endpoints` (url/secret/events jsonb/enabled/platform FK CASCADE, platform-nullable = global) + platform index. → [[Features - Shipped|Outbound webhooks]]. |
| 14 | `1719800000000-AddIssueContext.ts` | `issues.context` jsonb (unindexed) — SDK diagnostics, sanitized before write. → [[Features - Shipped|SDK context capture]]. |
| 15 | `1719900000000-AddCsatResponses.ts` | `csat_responses` (issue FK **unique** + reporter FK, smallint score, comment, CASCADE). → [[Features - Shipped|CSAT]]. |
| 16 | `1720000000000-AddDeflection.ts` | `issues.publicly_visible`/`public_title` + `reporter_subscriptions` (issue+reporter unique, CASCADE, index). → [[Features - Shipped|Known-issues deflection]]. |
| 17 | `1720100000000-AddSlaPolicy.ts` | `platforms.sla_policy` jsonb + `issues.sla_started_at` (backfilled from `created_at`) + `sla_breached_at` + partial index `WHERE sla_breached_at IS NULL`. → [[Features - Shipped|SLA policies + escalations]]. |
| 18 | `1720200000000-AddCannedResponses.ts` | `canned_responses` (platform FK CASCADE, `UQ(platform_id, title)`, body text, `created_by` plain uuid, platform index). → [[Module - Canned Responses]]. |
| 19 | `1720300000000-AddStatusPage.ts` | Public status page: `status_components`, `status_incidents`, `status_incident_updates`, `status_incident_components` (M2M) + **four enum types** (`status_components_status_enum`, `status_incidents_status_enum`, `status_incidents_impact_enum`, `status_incident_updates_status_enum`), created via `DO $$ … EXCEPTION WHEN duplicate_object` so re-runs are safe. → [[Module - Status Page]]. |
| 20 | `1720400000000-AddCommentTranslations.ts` | `comments.source_locale` (varchar 8) + `comments.translations` (jsonb). Both nullable — an unconfigured deployment never writes them. → [[Module - Translation]]. |

## Gotchas
- **`search_vector` FTS only works where migration #2 ran (prod).** Under dev `synchronize` the column is NULL → description search returns nothing (reference-number search still works). See [[Session Handoff]].
- Deploy runs migrations only when `RUN_MIGRATIONS=true`. Migrations #4 (tokenVersion) logs out all staff once on deploy.
- Migration #19 creates enum **types** as well as tables; its `down` drops both. Postgres cannot drop an enum still referenced by a column, so the table drops must come first (they do).

## Related
[[Data Model]] · [[Entity Reference]] · [[Security Audit and Hardening]]
