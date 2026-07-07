---
title: Data Model
tags: [cimp, data-model, entities]
updated: 2026-07-06
---
# Data Model
← [[CIMP - Home]]

Entities in `src/entities/` (registered in `src/entities/index.ts` → `ALL_ENTITIES`). UUID PKs (`uuid_generate_v4()` — the baseline migration now creates the `uuid-ossp` extension). Timestamps are `timestamptz`.

## Core
- **Platform** — a connected product/tenant. `key` (public slug, used in hand-off tokens), `name`, `status` (ACTIVE|DISABLED), `handoffSecret` (per-portal HS256 key; dev seam — prod should use a secrets manager), `jiraProjectKey`, `jiraEnabled`.
- **StaffUser** — support staff. `idpSubject` (`local:<email>`), `name`, `email`, `passwordHash` (`select:false`), `status`, **`tokenVersion`** (session revocation).
- **UserPlatformRole** — the RBAC grant: `{ staffUser, platform|null, role }`. Source of truth for authorization. See [[Auth and Authorization]].
- **Reporter** — an end user of a platform, auto-provisioned from hand-off claims. Unique `(platform, portalUserId)`.
- **Issue** — the central entity. `referenceNo` (SUP-XXXX, unique), `platform`, `reporter`, `assignee?`, `status`, `priority`, `description`, `version` (optimistic lock), `resolvedAt/closedAt`, `jiraIssueKey/jiraSyncStatus`, `searchVector` (tsvector, GIN-indexed, triggers). Indexed on platform/status/assignee/reporter/created_at (+composites).

## Around an issue
- **Attachment** — file on an issue. `storageKey`, `filename`, `contentType` (sniffed, not client-declared), `sizeBytes`, `scanStatus` (PENDING|CLEAN|INFECTED|SKIPPED — only CLEAN/SKIPPED served).
- **Comment** — `body`, `visibility` (INTERNAL|REPORTER_VISIBLE), `authorType`, `author?`, `editedAt?`. Reporters only see REPORTER_VISIBLE.
- **AuditEvent** — immutable trail: `issue?`, `actorType` (STAFF|SYSTEM|REPORTER), `actorId?`, `action`, `field/oldValue/newValue`, `metadata`.
- **NotificationLog** — per-recipient notification record (EMAIL|IN_APP, PENDING|SENT|FAILED). Powers the bell.
- **ReporterIssueView** — per-reporter "last viewed" for the unread indicator.
- **SavedView** — per-staff saved issue filters (server-side).

## Feature entities (added this session — see [[Features - Shipped]])
- **IssueLink** — directional `source→target` with `type` (BLOCKS|RELATES|DUPLICATES). Same-platform only.
- **Label** + **IssueLabel** — per-platform label catalog + issue join. Unique `(platform,name)` / `(issue,label)`.
- **IssueWatcher** — `(issue, staffUser)`; watchers get status-change notifications.
- **AutomationRule** — per-platform "when X then Y". `trigger` (ISSUE_CREATED|STATUS_CHANGED[+triggerStatus]), `action` (SET_PRIORITY|ASSIGN|ADD_LABEL), `actionValue`, `enabled`.
- **ApiToken** — scoped integration token. SHA-256 `tokenHash` (plaintext shown once), `lastFour`, `platform`, `lastUsedAt`, `revokedAt`.

## Enums
`src/common/enums.ts`: `Role`, `IssueStatus`, `Priority`, `CommentVisibility`, `ScanStatus`, `ActorType`, `RecipientType`, `NotificationChannel`, `NotificationStatus`, `JiraSyncStatus`, `PlatformStatus`, `AccountStatus`, `IssueLinkType`, `AutomationTrigger`, `AutomationAction`. **Reuse these; don't restring.**

## Migrations
`src/migrations/` (10 files). Prod uses migrations (`DB_SYNCHRONIZE=false`); dev auto-syncs. FK-nullability tightened (`TightenFkNullability`). See [[Configuration and Env]].

Related: [[Domain Events and Issue Lifecycle]] · [[Architecture Overview]]
