---
title: Domain Events and Issue Lifecycle
tags: [cimp, events, workflow]
updated: 2026-07-06
---
# Domain Events and Issue Lifecycle
← [[CIMP - Home]]

## Status machine (`src/issues/status-machine.ts`)
Statuses: **NEW → IN_PROGRESS → ON_HOLD → RESOLVED → CLOSED**, plus **REOPENED**. Every status change must pass `canTransition(from, to)`; illegal transitions are rejected. Side effects: RESOLVED sets `resolvedAt`; CLOSED sets `closedAt`; REOPENED clears both.

- **Optimistic locking:** mutating endpoints require the client's `version`; a stale version → **409** (client reloads + retries). Enforced by `assertVersion` + TypeORM `@VersionColumn`, mapped to 409 in `src/common/filters/http-exception.filter.ts`.
- **OD-09:** focal points may change status only if `FOCAL_POINT_CAN_TRANSITION=true`.
- **SLA:** `src/issues/sla.ts` `computeSla` derives `slaState` (on_track|at_risk|breached) + `dueAt` from `createdAt` + per-priority windows (env `SLA_HOURS_*`). *Known gap L8:* reopened issues measure from original `createdAt`. Per-platform SLA policies are on the [[Feature Roadmap]].

## Domain events (`src/events/issue-events.ts`)
Emitted by the issues/comments services; consumed by `@OnEvent` listeners **outside the request path** (decoupling).

| Event | Emitted when | Consumers |
|---|---|---|
| `issue.created` | intake | notifications (focal points), scanning, jira sync, realtime, **automation** |
| `issue.status_changed` | status patch | notifications (assignee+focals+**watchers**), jira echo, realtime, **automation** |
| `issue.priority_changed` | priority patch | realtime |
| `issue.assigned` | assignment | notifications (assignee), realtime |
| `comment.added` | comment | notifications (mentions, scoped to platform members), realtime |
| `issue.attachments_scanned` | scan done | jira (push now-servable files) |

## Listeners
- **Notifications** (`src/notifications/`) — email + `NotificationLog`; @mentions filtered to the issue's platform members (fixes cross-tenant leak M1); watchers included on status change.
- **Scanning** (`src/scanning/`) — ClamAV or no-op; marks `scanStatus`.
- **Jira** (`src/jira/`) — one-way push + inbound webhook (constant-time secret compare).
- **Realtime** (`src/realtime/`) — SSE fan-out, scope-filtered; auth via short-lived ticket ([[Auth and Authorization]]).
- **Automation** (`src/issues/automation.listener.ts`) — applies [[Features - Shipped|automation rules]]; loop-safe (actions never change status).

Related: [[Data Model]] · [[Backend Modules and API]] · [[Features - Shipped]]
