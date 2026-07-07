---
title: Decisions and Glossary
tags: [cimp, decisions, glossary]
updated: 2026-07-06
---
# Decisions and Glossary
← [[CIMP - Home]]

## Key decisions (why things are the way they are)
- **OD-09 — `FOCAL_POINT_CAN_TRANSITION`** (default false): focal points change status only when on.
- **L1 = KEEP**: focal points may **assign/reprioritize** even when OD-09 is off — they are the triage role; OD-09 governs *status* only. (Chosen by user.)
- **Fail-closed config**: unset/typo `NODE_ENV` = production; prod refuses to boot on unsafe config. → [[Configuration and Env]].
- **HS256 hand-off** (not RS256): per-platform shared secret. RS256/asymmetric noted as future **OD-06** (secret then never leaves the connected project); would need `HandoffService.verify` to use a public key.
- **Self-support secret from DB**: the in-app support button reads the platform's `handoffSecret` server-side (no rotate needed) — [[Integrations]].
- **API tokens v1 = read-only per platform** (a separate `/integrations` surface, not woven into staff auth) — [[Features - Shipped]].
- **Automation actions exclude status changes** → guarantees no rule-trigger loops.
- **SSE ticket** = ~30s, audience `sse` — never the 8h session JWT in a URL (H8).
- **No Claude co-author trailer** on commits/PRs.

## Glossary
- **Platform / Portal** — a connected product = one tenant. `Platform.key` is its public slug.
- **Reporter** — an end user of a platform; never logs into CIMP; auto-provisioned.
- **Staff** — support team. Roles: **Focal point** (per-platform triage), **Developer** (per-platform or global), **Admin** (global).
- **Hand-off token** — short-lived per-platform HS256 JWT authenticating a reporter (`X-Handoff-Token`).
- **Self-issued JWT** — staff session token (email/password, `JWT_SECRET`), carries `tokenVersion`.
- **`tokenVersion`** — bumped on password reset/disable to revoke live sessions.
- **Scope** — the set of platforms a staff member can act on (`ScopeService`).
- **MOC** — Map of Content (Obsidian index note) → [[CIMP - Home]].
- **Connector** — the [[cimp-connect Package]] that mints hand-off tokens for other projects.

Related: [[Auth and Authorization]] · [[Security Audit and Hardening]]
