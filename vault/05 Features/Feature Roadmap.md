---
title: Feature Roadmap
tags: [cimp, features, roadmap]
updated: 2026-07-10
---
# Feature Roadmap
← [[CIMP - Home]] · shipped → [[Features - Shipped]]

_2FA deferred by request. Email intake to be done **last** (user directive)._

## Differentiator track — executable plans ready (2026-07-10)
Detailed, executor-proof plans in `05 Features/Plans/` — start at
[[Plan 00 - How to Execute These Plans]] (order + repo-wide rules):
webhooks/Slack · duplicate merge · SDK context capture · known-issues
deflection · AI triage (free/pluggable) · CSAT loop · command palette + triage
inbox. These leverage the cimp-connect SDK moat; prefer them over Jira
feature-parity items below when prioritizing.

## Remaining backend features
1. ~~SLA policies + escalations~~ — **DONE 2026-07-12**: per-platform `sla_policy` jsonb (UI: Admin → Platforms → SLA), L8 fixed via `sla_started_at` baseline (reopen resets the clock), 5-min breach sweep (`sla-escalation.service.ts`, marks `sla_breached_at` once → email escalation + webhook + SYSTEM audit). Business-hours calendars descoped.
2. **JQL-like saved filters** — a query grammar/parser on top of the existing `SavedView` entity → translate to the issues list query.
3. **Email-to-issue intake** *(do last)* — inbound-email parsing (mail provider webhook) → reporter intake. Needs a provider decision.

## Remaining UI
- ~~Automation rules / API tokens config screens~~ — **DONE 2026-07-12**: Admin → Integrations tab (platform-scoped rules + tokens) and Admin → Webhooks tab (`AdminIntegrations.tsx`).
- **Board swimlanes** — group board by assignee/priority. Needs a dnd-kit **droppable-id-per-lane** refactor (current board uses `status` as the droppable id; swimlanes would collide). Simplest: render grouped static columns using the existing move-menu (no drag) in swimlane mode.
- **Sub-tasks** (extends issue links), **components/custom fields** (extends labels), **activity feed** (read over `AuditEvent`), **@mention autocomplete** for reporters.

## Decision-gated security (from [[Security Audit and Hardening]])
- Redis throttler store (M8) · disk-streaming uploads (M6).

Related: [[Session Handoff]]
