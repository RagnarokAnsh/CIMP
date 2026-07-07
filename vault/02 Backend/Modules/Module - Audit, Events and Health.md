---
title: Module - Audit, Events and Health
tags: [cimp, backend]
updated: 2026-07-06
---
# Module — Audit, Events and Health (`src/audit/`, `src/events/`, `src/health/`)
← [[Backend Modules and API]] · [[CIMP - Home]]

Three small cross-cutting pieces.

## Audit (`src/audit/`)
| File | Responsibility |
|---|---|
| `audit.service.ts` | `AuditService` — the immutable trail writer + reader. |
| `audit.module.ts` | **`@Global`** — any module can inject `AuditService` without importing. |

- `record(input: AuditInput, em?)` — writes one `AuditEvent` (`{ issueId?, actorType, actorId?, action, field?, oldValue?, newValue?, metadata? }`). Pass a transaction `EntityManager` to keep the audit row **atomic** with the change it describes.
- `forIssue(issueId)` — history newest-first (powers issue detail "History").
- `query(filters)` — the admin audit-log viewer (filter by actorType/action/issueId/date, paginated; `from/to` validated `@IsISO8601`).
- Actors: STAFF / SYSTEM (automation, jira) / REPORTER. **Audit gap fixed:** login events + 401/403 denials now logged (see [[Security Audit and Hardening]]).

## Events (`src/events/`)
| File | Responsibility |
|---|---|
| `issue-events.ts` | `IssueEvents` name constants + typed payload interfaces. |

Names: `issue.created`, `issue.status_changed`, `issue.priority_changed`, `issue.assigned`, `comment.added`, `issue.attachments_scanned`. Full producer/consumer matrix → [[Domain Events and Issue Lifecycle]].

## Health (`src/health/`)
| File | Responsibility |
|---|---|
| `health.controller.ts` | `GET /api/health` (liveness), `GET /api/ready` (DB check → 503 when down). Uses `@nestjs/terminus`. |
| `health.module.ts` | Wiring. |

## Related
[[Domain Events and Issue Lifecycle]] · [[Data Model]] · [[Deployment, CI-CD and Dev Workflow]]
