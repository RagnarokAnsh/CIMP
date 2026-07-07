---
title: Module - Reporter
tags: [cimp, backend, module, reporter, intake]
updated: 2026-07-06
---
# Module - Reporter (`src/reporter`)
← [[Backend Modules and API]] · [[CIMP - Home]]

**Purpose:** The reporter-facing surface — a portal user (never logged in, authenticated only by a signed hand-off token) submits issues with attachments, tracks them, replies to support, and downloads their own scan-cleared files.

## Files
| File | Responsibility |
|---|---|
| `reporter.controller.ts` | `@Controller('reporter')`, entirely gated by `HandoffGuard`. Defines the six reporter HTTP routes; handles multipart upload interception and streams attachment downloads. |
| `reporter.service.ts` | `ReporterService` — all business logic: reporter upsert, content-sniff validation, issue creation (with reference-collision retry), ownership-scoped reads, INTERNAL-comment filtering, reporter replies, seen-tracking, attachment download. |
| `reporter.module.ts` | Wires `ReporterController` + `ReporterService`; imports `TypeOrmModule.forFeature([Reporter, Issue, ReporterIssueView, Attachment])` and `HandoffModule`. |
| `dto/create-issue.dto.ts` | `CreateIssueDto` — single field `description` (`@IsString`, `@Length(10, 5000)`). Files arrive via multipart, not the DTO. |
| `dto/reporter-comment.dto.ts` | `ReporterCommentDto` — single field `body` (`@IsString`, `@Length(1, 5000)`). No visibility/@mention (staff-only concepts). |
| `reporter.service.spec.ts`, `reporter.visibility.spec.ts` | Unit specs (content-sniff, visibility filtering). |

## Public surface
All routes are under the global `/api` prefix and gated by `HandoffGuard` (`X-Handoff-Token`). Reporter identity comes from the token via the `@Handoff()` param decorator (`HandoffContext`).

| Method / Route | Guard · Throttle | Handler → Service |
|---|---|---|
| `POST /api/reporter/issues` | `HandoffGuard`, `@Throttle 10/60s`, `FilesInterceptor('files', MAX_FILES, memoryStorage, fileSize=MAX_FILE_BYTES)` | `createIssue` → `ReporterService.createIssue` |
| `GET /api/reporter/issues` | `HandoffGuard` | `listIssues` → `listForReporter` |
| `GET /api/reporter/issues/:id` | `HandoffGuard`, `ParseUUIDPipe` | `getIssue` → `getIssueForReporter` |
| `POST /api/reporter/issues/:id/seen` | `HandoffGuard`, `ParseUUIDPipe` | `markSeen` → `markSeen` |
| `POST /api/reporter/issues/:id/comments` | `HandoffGuard`, `@Throttle 30/60s`, `ParseUUIDPipe` | `addComment` → `addComment` |
| `GET /api/reporter/issues/:id/attachments/:attachmentId` | `HandoffGuard`, two `ParseUUIDPipe` | `downloadAttachment` → `getAttachmentForReporter` (streams via `@Res()`) |

Upload limits (`src/common/constants.ts`): `MAX_FILES = 5`, `MAX_FILE_BYTES = 10 MB`, `ALLOWED_MIME_TYPES = image/png, image/jpeg, image/webp, application/pdf`. Enforced both at the Multer layer and again in the service.

## Key classes & logic

### `ReporterController`
Thin. The intake route uses `memoryStorage()` (files buffered in RAM, never written to disk by Multer) with `FilesInterceptor` limits mirroring the constants. The download route sets `Content-Type` to the **stored (sniffed) contentType**, `X-Content-Type-Options: nosniff`, and a safe `Content-Disposition` (via `../common/content-disposition`) before `res.send(buffer)`.

### `ReporterService`
Injects repositories for `Reporter`, `Issue`, `ReporterIssueView`, `Attachment`, plus `StorageService`, `DataSource`, and `EventEmitter2`. Module-level `SERVABLE_SCAN = {CLEAN, SKIPPED}` — the only scan states whose bytes may be served.

- **`upsertReporter(ctx)`** — auto-provisions the reporter identity from the verified token. Looks up by `(platform.id, portalUserId)`; creates or refreshes `name`/`email`, then saves. On a unique-violation (`23505`) from a concurrent first submit, re-reads via `findReporter` and returns the existing row instead of 500ing.
- **`validateFiles(files)`** — count/size guard, then **content-sniffs each file's real MIME via `file-type`'s `fromBuffer`** (magic bytes). The client-declared multipart mimetype is untrusted and never persisted or served. Rejects (400) anything not in `ALLOWED_MIME_TYPES`. Returns detected types aligned to `files`.
- **`createIssue(ctx, dto, files)`** — sniffs → upserts reporter → writes buffers to `StorageService.save` **outside** the transaction (returns `storageKey`) → `createIssueWithUniqueReference` → emits `IssueEvents.CREATED` → returns `getIssueForReporter`.
- **`createIssueWithUniqueReference` / `persistIssue`** — `referenceNo` is uniquely indexed; on a `23505` generation collision it retries up to `MAX_ATTEMPTS = 5` with a fresh reference (storage writes already done, so retry just re-inserts same attachment rows). `persistIssue` runs one transaction: create `Issue` (`referenceNo` from `generateReference()` = `SUP-<8 hex upper>`, `description`), save child `Attachment` rows with `scanStatus = PENDING`, and one `AuditEvent` (`ISSUE_CREATED`, actorType `REPORTER`).
- **`listForReporter(ctx)`** — the "My issues" list. Query-builder left-joins only **this reporter's** `ReporterIssueView` row (`view.reporter_id = :reporterId`) per issue, filtered to `issue.reporter_id = :reporterId`, ordered `created_at DESC`. Computes `hasUpdates = !lastViewed || lastViewed < updatedAt`. (Fix note in code: the older in-memory compare never loaded the reporter relation, so "new updates" was always true.)
- **`getIssueForReporter(ctx, id)`** — ownership-scoped fetch (`where id + reporter.id`; 404 otherwise). **INTERNAL-comment filtering:** only `CommentVisibility.REPORTER_VISIBLE` comments are exposed, sorted ascending by `createdAt`; each mapped to `{body, createdAt, fromReporter, author}` where reporter comments show `authorName ?? 'You'` and staff show `'Support'`. Attachments include `downloadable = SERVABLE_SCAN.has(scanStatus)`.
- **`addComment(ctx, id, dto)`** — reporter reply. Always `visibility = REPORTER_VISIBLE`, `authorType = REPORTER`, `author = null` (no `StaffUser`), `authorName = reporter.name`. In one transaction: saves comment, bumps `Issue.updatedAt = now()` via query-builder **without touching `version`** (so no optimistic-lock bump), writes `COMMENT_ADDED` audit. Emits `IssueEvents.COMMENT_ADDED` with `reporterVisible: true`, empty `actorStaffId`, empty `mentionStaffIds`.
- **`getAttachmentForReporter(ctx, id, attachmentId)`** — ownership-scoped (`attachment.issue.reporter.id`). 404 if not found; **403** if `scanStatus` not in `SERVABLE_SCAN` (PENDING/INFECTED never served). Reads bytes via `StorageService.read(storageKey)`.
- **`markSeen(ctx, id)`** — upserts the `(reporter, issue)` `ReporterIssueView` row's `lastViewedAt = now`.
- **`findReporter(ctx)`** — private lookup by `(platform.id, portalUserId)`; returns `null` (reads then throw `NotFoundException` so a missing reporter can't probe issue existence).

**Invariants:** the sniffed content type is the single source of truth for what's stored and served (defends against `Content-Type` spoofing / stored XSS); every read is scoped to the token's reporter + platform; internal comments never leave the service.

## Guards & auth
Every route is `@UseGuards(HandoffGuard)` (see [[Auth and Authorization]]). `HandoffGuard` verifies the per-portal signed JWT (`X-Handoff-Token`), resolves the platform, and attaches `HandoffContext` (`platformId`, `platformKey`, `reporter{portalUserId,name,email}`) consumed via the `@Handoff()` decorator. No `JwtAuthGuard`/`@Roles`/`ScopeService` here — this is the reporter path, not the staff path.

## Dependencies (injected)
`Repository<Reporter>`, `Repository<Issue>`, `Repository<ReporterIssueView>`, `Repository<Attachment>`, `StorageService` ([[Integrations]] storage seam, local|s3), `DataSource` (transactions), `EventEmitter2`. Module also imports `HandoffModule`.

## Events (emitted / consumed)
Emits only (via `EventEmitter2`), consumes none:
- `IssueEvents.CREATED` → `IssueCreatedEvent { issueId, platformId }` — drives focal-point notification (FR-NOT-01), attachment scanning, Jira sync.
- `IssueEvents.COMMENT_ADDED` → `CommentAddedEvent { issueId, platformId, commentId, reporterVisible: true, actorStaffId: '', mentionStaffIds: [] }`.

See [[Domain Events and Issue Lifecycle]].

## Entities touched
`Reporter` (upsert), `Issue` (create/read/updatedAt bump), `Attachment` (create with `scanStatus=PENDING`, read), `Comment` (create reporter-visible, filtered read), `AuditEvent` (`ISSUE_CREATED`, `COMMENT_ADDED`), `ReporterIssueView` (seen-tracking + `hasUpdates`). See [[Data Model]].

## Gotchas / invariants
- **Content sniff, not header** — persisted/served `contentType` comes from `file-type.fromBuffer`; the multipart-declared mimetype is discarded. A file whose bytes aren't a real PNG/JPEG/WEBP/PDF is rejected 400.
- **Attachments created `PENDING`**, so a fresh upload is not immediately downloadable until scanning marks it `CLEAN`/`SKIPPED` (default no-op scanner marks `SKIPPED`). `INFECTED`/`PENDING` → 403.
- **Storage write is outside the DB transaction**; the reference-collision retry can re-run the insert reusing the same `storageKey`s.
- **`addComment` bumps `updatedAt` without bumping `version`** — avoids tripping optimistic locking on the staff side while still surfacing as activity.
- Missing reporter yields `NotFoundException`, not a distinct "no reporter" error — prevents issue-existence probing.
- Reporter intake is throttled tighter than global default (10/min create, 30/min comment).

## Related
[[Backend Modules and API]] · [[Auth and Authorization]] · [[Module - Handoff]] · [[Data Model]] · [[Domain Events and Issue Lifecycle]] · [[Integrations]] · [[Security Audit and Hardening]] · [[Configuration and Env]] · [[Features - Shipped]] · [[Architecture Overview]]
