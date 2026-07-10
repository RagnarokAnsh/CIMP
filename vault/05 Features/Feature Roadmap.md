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
1. **SLA policies + escalations** — per-platform SLA config (targets, business hours) overriding env defaults; breach escalation. **Invasive:** rewires `computeSla` (`src/issues/sla.ts`), used by list/detail/dashboard — do test-first. Also fixes **L8** (reopened issue measures SLA from original `createdAt`; add an `slaStartedAt` baseline).
2. **JQL-like saved filters** — a query grammar/parser on top of the existing `SavedView` entity → translate to the issues list query.
3. **Email-to-issue intake** *(do last)* — inbound-email parsing (mail provider webhook) → reporter intake. Needs a provider decision.

## Remaining UI
- **Automation rules** config screen (backend done).
- **API tokens** management screen (backend done).
- **Board swimlanes** — group board by assignee/priority. Needs a dnd-kit **droppable-id-per-lane** refactor (current board uses `status` as the droppable id; swimlanes would collide). Simplest: render grouped static columns using the existing move-menu (no drag) in swimlane mode.
- **Sub-tasks** (extends issue links), **components/custom fields** (extends labels), **activity feed** (read over `AuditEvent`), **@mention autocomplete** for reporters.

## Decision-gated security (from [[Security Audit and Hardening]])
- Redis throttler store (M8) · disk-streaming uploads (M6).

Related: [[Session Handoff]]
