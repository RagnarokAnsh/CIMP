---
title: Features - Shipped
tags: [cimp, features]
updated: 2026-07-06
---
# Features - Shipped (JIRA-like)
← [[CIMP - Home]] · roadmap → [[Feature Roadmap]]

All backend follows the same pattern: entity + migration + service (scoped, tested) + controller under `/api/staff/...`, guarded by `PlatformAccessGuard` or a platform-scope check. All tenant-isolated.

## Issue links `#feature`
`src/issues/issue-links.*` · `IssueLink` entity. Directional `BLOCKS|RELATES|DUPLICATES`, **same-platform only**, self-link/duplicate rejected, inward/outward presentation. Routes: `GET/POST/DELETE /api/staff/issues/:id/links`. **UI:** links card in [[Frontend Overview|IssueExtras.tsx]] (add by typing a reference → resolved via scoped search).

## Labels `#feature`
`src/issues/labels.*` · `Label` + `IssueLabel`. Per-platform catalog + issue tagging; foreign-platform label rejected. Routes: `/api/staff/platforms/:pid/labels` (catalog) + `/api/staff/issues/:id/labels` (tagging). **UI:** label chips + add-existing + inline create.

## Watchers `#feature`
`src/issues/watchers.*` · `IssueWatcher`. Watch/unwatch; **integrated into `notifyStatusChange`** so watchers get status-change notifications alongside assignee + focal points. Routes: `/api/staff/issues/:id/watchers`. **UI:** watch toggle in the issue header.

## Automation rules `#feature`
`src/issues/automation.*` · `AutomationRule`. Per-platform "when X then Y": trigger `ISSUE_CREATED` / `STATUS_CHANGED[+status]`, action `SET_PRIORITY|ASSIGN|ADD_LABEL`. **Loop-safe** (actions never change status, so no re-trigger). `AutomationListener` hooks `@OnEvent` off the [[Domain Events and Issue Lifecycle|event bus]]; misconfigured rules are logged, never break intake; changes audited as `SYSTEM`. Routes: `/api/staff/platforms/:pid/automation-rules` (CRUD). **UI: pending.**

## Scoped API tokens `#feature`
`src/integrations/*` · `ApiToken`. SHA-256 hashed (plaintext shown once, `cimp_<48hex>`), read-only per platform. `ApiTokenGuard` authenticates `Authorization: Bearer`/`X-Api-Token` → binds request to the platform. Routes: management `/api/staff/platforms/:pid/api-tokens`; read `GET /api/integrations/issues[/:id]`. **UI: pending.**

## Board WIP limits `#feature`
`frontend/src/staff/BoardPage.tsx` — per-column soft caps (`IN_PROGRESS:6`, `ON_HOLD:4`); badge turns red at/over limit. Swimlanes still pending ([[Feature Roadmap]]).

Related: [[Data Model]] · [[Backend Modules and API]]
