---
title: Entity Reference
tags: [cimp, data-model, entities, reference]
updated: 2026-07-06
---
# Entity Reference (`src/entities/`)
← [[Data Model]] (summary) · [[CIMP - Home]]

Detailed per-entity fields. All PKs are `uuid`; timestamps `timestamptz`. Registered in `src/entities/index.ts` (`ALL_ENTITIES`, 17 entities). Summary + relationships → [[Data Model]].

## Tenancy & identity
- **Platform** — `key` (unique slug, used in tokens), `name`, `status` (PlatformStatus), `handoffSecret` (per-portal HS256 key), `jiraProjectKey?`, `jiraEnabled`, `createdAt`. → reporters, issues, roleAssignments.
- **StaffUser** — `idpSubject` (unique, `local:<email>`), `name`, `email`, `passwordHash` (`select:false`), `status` (AccountStatus), **`tokenVersion`** (int, default 1 — session revocation), `createdAt`.
- **UserPlatformRole** — `staffUser` (M:1), `platform` (M:1, **nullable** = global grant), `role` (Role). The RBAC grant; source of truth for [[Auth and Authorization|authorization]].
- **Reporter** — `platform` (M:1), `portalUserId`, `name`, `email`. **Unique `(platform, portalUserId)`**. Auto-provisioned from hand-off claims.

## Issue core
- **Issue** — `referenceNo` (unique, `SUP-XXXX`), `platform` (M:1), `reporter` (M:1), `assignee?` (M:1 StaffUser), `status` (IssueStatus), `priority` (Priority), `description` (text), **`version`** (`@VersionColumn` — optimistic lock), `resolvedAt?`, `closedAt?`, `jiraIssueKey?`, `jiraSyncStatus` (JiraSyncStatus), **`searchVector`** (tsvector, `select:false`, unmanaged), `createdAt/updatedAt`. **Indexes:** platform, status, assignee, reporter, created_at, `(platform,status)`, `(platform,created_at)`, GIN `search_vector`.
- **Attachment** — `issue` (M:1), `storageKey`, `filename`, `contentType` (**sniffed**, not client-declared), `sizeBytes`, `scanStatus` (ScanStatus).
- **Comment** — `issue` (M:1), `author?` (M:1 StaffUser), `authorType` (ActorType), `authorName?`, `body` (text), `visibility` (CommentVisibility — INTERNAL vs REPORTER_VISIBLE), `editedAt?`, `createdAt`.

## Trail & notifications
- **AuditEvent** — `issue?` (M:1, `ON DELETE CASCADE` — audit note M11: consider SET NULL), `actorType` (ActorType), `actorId?` (varchar), `action`, `field?/oldValue?/newValue?`, `metadata?` (jsonb). "Immutable" trail.
- **NotificationLog** — `issue?` (M:1), `recipientType` (RecipientType), `recipientRef` (staff/reporter id), `trigger`, `channel` (NotificationChannel), `status` (NotificationStatus), `readAt?`.
- **ReporterIssueView** — `reporter` (M:1), `issue` (M:1), `lastViewedAt`. **Unique `(reporter, issue)`** — unread indicator.
- **SavedView** — `staffUser` (M:1), `name`, `filters` (jsonb), `updatedAt`.

## Feature entities → [[Features - Shipped]]
- **IssueLink** — `sourceIssue`/`targetIssue` (M:1, CASCADE), `type` (IssueLinkType), `createdBy?`. **Unique `(source,target,type)`**, indexes on both FKs. Same-platform enforced in service.
- **Label** — `platform` (M:1, CASCADE), `name`, `color` (default `#6b7280`). **Unique `(platform,name)`**.
- **IssueLabel** — `issue`/`label` (M:1, CASCADE). **Unique `(issue,label)`**, index on issue.
- **IssueWatcher** — `issue`/`staffUser` (M:1, CASCADE). **Unique `(issue,staffUser)`**, index on issue.
- **AutomationRule** — `platform` (M:1, CASCADE), `name`, `enabled` (default true), `trigger` (AutomationTrigger), `triggerStatus?` (IssueStatus), `action` (AutomationAction), `actionValue`, `createdBy?`. Index on platform.
- **ApiToken** — `platform` (M:1, CASCADE), `name`, `tokenHash` (**unique**, SHA-256), `lastFour`, `createdBy?`, `lastUsedAt?`, `revokedAt?`.

## Related
[[Data Model]] · [[Migrations Log]] · [[Module - Common and Config|enums]]
