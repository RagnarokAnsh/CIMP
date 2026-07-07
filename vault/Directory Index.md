---
title: Directory Index
tags: [cimp, index, directories, navigation]
type: reference
updated: 2026-07-06
---
# Directory Index — every directory → what it is → its note
← [[CIMP - Home]]

> The master map. Each backend module and frontend directory has a dedicated, code-grounded note (see column 3). Read the note instead of the source.

## Repo root (`D:\CIMP\CIMP`)
| Path | What | Doc |
|---|---|---|
| `src/` | NestJS backend (global `/api` prefix) | this table ↓ |
| `frontend/` | Vite + React SPA | [[Frontend Overview]] |
| `scripts/` | seeders (`seed`, `seed-demo`, `seed-prod`, `seed-presentation`), `make-token.ts`, `deploy.sh` | [[Deployment, CI-CD and Dev Workflow]] |
| `.github/workflows/` | `deploy.yml` (CI/CD on push to main) | [[Deployment, CI-CD and Dev Workflow]] |
| `README.md` `ARCHITECTURE.md` `DESIGN.md`/`design.md` `PRODUCT.md` `IMPROVEMENT_PLAN.md` `SECURITY_AUDIT.md` `CLAUDE.md` | canonical in-repo docs | — |
| `docker-compose.yml` | dev Postgres + MinIO | [[Deployment, CI-CD and Dev Workflow]] |

## Backend modules (`src/*`)
| Dir | Purpose (1-liner) | Note |
|---|---|---|
| `src/auth` | Staff self-issued JWT: login, guard, tokenVersion, SSE ticket | [[Module - Auth]] |
| `src/authz` | Central authorization: ScopeService + PlatformAccessGuard + roles | [[Module - Authz]] |
| `src/handoff` | Reporter hand-off token verification | [[Module - Handoff]] |
| `src/reporter` | Reporter intake + read (no login) | [[Module - Reporter]] |
| `src/issues` | Core issue management (status, assign, priority, bulk, CSV, FTS) + feature sub-modules | [[Module - Issues]] |
| `src/comments` | Comments + visibility + scoped mentions | [[Module - Comments]] |
| `src/notifications` | Email + in-app notifications, NotificationLog | [[Module - Notifications]] |
| `src/dashboard` | Scoped dashboard aggregates | [[Module - Dashboard]] |
| `src/admin` | Admin-only platform/staff/role/audit management | [[Module - Admin]] |
| `src/jira` | One-way Jira push + inbound webhook | [[Module - Jira]] |
| `src/realtime` | SSE live stream (ticket auth, scope-filtered) | [[Module - Realtime]] |
| `src/saved-views` | Per-staff saved issue filters | [[Module - Saved Views]] |
| `src/self-support` | CIMP as its own reporter portal | [[Module - Self-Support]] |
| `src/integrations` | Scoped API tokens + read-only integration API | [[Module - Integrations]] |
| `src/storage` + `src/scanning` | Swappable storage + malware-scan seams | [[Module - Storage and Scanning]] |
| `src/audit` + `src/events` + `src/health` | Immutable audit trail, domain events, health checks | [[Module - Audit, Events and Health]] |
| `src/common` + `src/config` | Enums/constants/filters + fail-closed config | [[Module - Common and Config]] |
| `src/entities` | All 18 TypeORM entities | [[Entity Reference]] · [[Data Model]] |
| `src/migrations` | 10 SQL migrations | [[Migrations Log]] |

## Frontend (`frontend/src/*`)
| Dir | Purpose | Note |
|---|---|---|
| `frontend/src/staff` | Staff workspace (board, issues, dashboard, admin, detail) | [[Frontend - Staff Workspace]] |
| `frontend/src/reporter` | Reporter surface (new/my issues, detail) | [[Frontend - Reporter Surface]] |
| `frontend/src/components` + `lib` + `api` | Shared UI, hooks (realtime SSE), API clients, types | [[Frontend - Components, Lib and API]] |

Related: [[Backend Modules and API]] · [[Architecture Overview]] · [[LLM Guide]]
