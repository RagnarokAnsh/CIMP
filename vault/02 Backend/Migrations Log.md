---
title: Migrations Log
tags: [cimp, backend, database, migrations]
updated: 2026-07-06
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

## Gotchas
- **`search_vector` FTS only works where migration #2 ran (prod).** Under dev `synchronize` the column is NULL → description search returns nothing (reference-number search still works). See [[Session Handoff]].
- Deploy runs migrations only when `RUN_MIGRATIONS=true`. Migrations #4 (tokenVersion) logs out all staff once on deploy.

## Related
[[Data Model]] · [[Entity Reference]] · [[Security Audit and Hardening]]
