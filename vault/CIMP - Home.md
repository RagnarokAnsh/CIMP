---
title: CIMP - Home
tags: [cimp, moc, index]
type: map-of-content
updated: 2026-07-06
---

# CIMP — Centralized Support & Issue Management Platform

> **Map of Content (MOC).** Start here. Every other note links back to this hub.
> Repo: `D:\CIMP\CIMP` · Vault: `D:\CIMP\CIMP\vault` · GitHub: `RagnarokAnsh/CIMP`

## What it is (30-second version)
A multi-tenant **support/issue-management platform**. External products ("portals") send their users' issues in via a signed hand-off token; a support team ("staff") triages them in a workspace. Think a lightweight, self-hostable JIRA-for-support with strict per-platform tenant isolation.

- **Backend:** NestJS + TypeORM + PostgreSQL REST API (`src/`, global `/api` prefix). Live Swagger at `/api/docs` (dev only).
- **Frontend:** Vite + React + TypeScript SPA (`frontend/`, shadcn/ui, TanStack Query/Table, React Router).
- **Two audiences, two auth paths:** [[Auth and Authorization]].

## Navigate
**Start / resume:** ⏭ [[Session Handoff]] (read first when resuming) · 🤖 [[LLM Guide]] (how to navigate) · 🗂 [[Directory Index]] (every folder → its note) · 🕒 [[Changelog]] (updates log)

**Understand:**
- 🏛 [[Architecture Overview]] — the big picture + invariants
- 🔐 [[Auth and Authorization]] — reporter hand-off + staff JWT + scoping
- 🗃 [[Data Model]] (summary) · 📇 [[Entity Reference]] (per-entity detail)
- ⚡ [[Domain Events and Issue Lifecycle]] — event bus + status machine
- 🧩 [[Backend Modules and API]] — module map + route table · 🧱 [[Migrations Log]]
- ⚙️ [[Configuration and Env]] — env vars + fail-closed rules
- 🖥 [[Frontend Overview]] — SPA structure

**Deep-dive (per-module notes):** see [[Directory Index]] — one code-grounded note per backend module (`[[Module - Auth]]`, `[[Module - Issues]]`, `[[Module - Authz]]`, …) and frontend directory (`[[Frontend - Staff Workspace]]`, …).

**Cross-cutting:**
- 🛡 [[Security Audit and Hardening]] · ✨ [[Features - Shipped]] · 🗺 [[Feature Roadmap]]
- 🔌 [[Integrations]] · 📦 [[cimp-connect Package]] · 🤝 [[FAFICS Integration]]
- 🚀 [[Deployment, CI-CD and Dev Workflow]] · 🧭 [[Decisions and Glossary]]

## Current status (snapshot)
- Branch **`dev`** is ~17 commits ahead of **`main`** (the deploy branch). See [[Session Handoff]].
- **Security:** ~42 audit findings fixed (all Critical/launch-blockers). Tracker: `SECURITY_AUDIT.md` in repo.
- **Features shipped:** issue links, labels, watchers (backend+tests+UI); automation rules, scoped API tokens (backend+tests); board WIP limits (UI); SSE-ticket auth.
- **Remaining:** SLA policies, JQL filters, email-to-issue intake, some config UIs, full board swimlanes. See [[Feature Roadmap]].
- Hosted on AWS EC2 `35.154.196.105` (pm2 + nginx). See [[Deployment, CI-CD and Dev Workflow]].

## Canonical in-repo docs (source of truth; this vault summarizes + links)
`README.md` (run/deploy) · `ARCHITECTURE.md` (module graph, ER, route table) · `DESIGN.md` · `PRODUCT.md` · `IMPROVEMENT_PLAN.md` · `SECURITY_AUDIT.md` · `CLAUDE.md` (agent guidance).

## Connect this vault to other projects
Any note here that a sibling project shares can be linked with `[[...]]`. Key bridge notes: [[cimp-connect Package]] (the reusable connector), [[FAFICS Integration]] (first consumer), [[Auth and Authorization]] (the hand-off contract). Tag with `#cimp` to surface in graph view.
