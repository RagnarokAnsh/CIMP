---
title: Module - Comments
tags: [cimp, backend, comments]
updated: 2026-07-06
---
# Module - Comments (`src/comments`)
← [[Backend Modules and API]] · [[CIMP - Home]]

**Purpose:** Staff-authored comments on issues — add (internal or reporter-visible), edit-your-own, with @mentions filtered to platform members and an author-side platform access recheck on edit.

## Files
| File | Responsibility |
|---|---|
| `comments.controller.ts` | `CommentsController` — `staff/`-prefixed HTTP routes for add/edit; wires guards. |
| `comments.service.ts` | `CommentsService` — add/edit logic, visibility handling, mention filtering, platform recheck, audit, event emit. |
| `comments.module.ts` | Registers controller/service; imports `Comment`, `Issue`, `UserPlatformRole` repos + `AuthModule`, `AuthzModule`. |
| `dto/create-comment.dto.ts` | `CreateCommentDto` — `body` (1–5000), `visibility` (enum, default INTERNAL), optional `mentionStaffIds` (≤20 UUIDs). |
| `dto/update-comment.dto.ts` | `UpdateCommentDto` — `body` (1–5000) only. |

## Public surface
All routes carry the global `/api` prefix, are `@ApiTags('staff-comments')`, and require a staff JWT (`JwtAuthGuard` at controller level).

- **`POST /api/staff/issues/:id/comments`** — add a comment. `:id` = **issue** id. Guards: `JwtAuthGuard` → `PlatformAccessGuard` (resolves platform from the issue id) → `@Roles(FOCAL_POINT, DEVELOPER, ADMIN)`. Body `CreateCommentDto`. → `addComment`.
- **`PATCH /api/staff/comments/:id`** — edit your own comment. `:id` = **comment** id. Guard: `JwtAuthGuard` only (no `PlatformAccessGuard`, no `@Roles`) — ownership + platform access are enforced in the service. Body `UpdateCommentDto`. → `editComment`.

## Key classes & logic

### `CommentsService.addComment(staff, issueId, dto)`
- Loads the `Issue` (with `platform` relation); `404` if missing.
- `reporterVisible = dto.visibility === REPORTER_VISIBLE`.
- In a DB transaction: creates+saves the `Comment` (author = current staff, body, visibility); if `reporterVisible`, bumps `Issue.updatedAt = now()` via query builder **without touching `version`** (so the reporter's "My issues" view shows `hasUpdates` — derived from `updatedAt` vs `lastViewedAt`, OD-02 — with no optimistic-lock conflict). Records an `COMMENT_ADDED` audit entry (`field: 'visibility'`, `newValue: visibility`, `metadata.commentId`).
- **Mention filtering** (post-commit): de-dupes `dto.mentionStaffIds`, drops the author's own id, then keeps only ids that are members of the issue's platform (`platformMemberIds`). This prevents a client-supplied id for another tenant's staff from leaking the issue via the notification bell or SSE `targetStaffIds`.
- Emits `IssueEvents.COMMENT_ADDED` (`CommentAddedEvent`) with the **filtered** `mentionStaffIds`, `reporterVisible`, `actorStaffId`, `platformId`. Notifications/SSE are `@OnEvent` listeners, never in the request path.
- Returns `getOne(commentId)`.

### `CommentsService.platformMemberIds(staffIds, platformId)` (private)
- Given candidate staff ids, returns the `Set` that actually hold a `UserPlatformRole` on `platformId` **or** a global grant (`platform IS NULL`). Empty input → empty set. Used to strip cross-tenant @mentions.

### `CommentsService.editComment(staff, commentId, dto)`
- Loads the `Comment` with `author` + `issue.platform`; `404` if missing.
- **Ownership check:** `comment.author?.id !== staff.id` → `403` ("You can only edit your own comments.").
- **Platform recheck:** authorship alone is insufficient — the author may have lost access since writing. Because this route carries a comment id, `PlatformAccessGuard`'s issue branch never runs, so the service calls `scope.canAccessPlatform(staff, platformId, ALL_STAFF_ROLES)`; failure → `403` ("You no longer have access to this platform.").
- Updates `body`, sets `editedAt = new Date()`; in a transaction saves and records `COMMENT_EDITED` audit (`field: 'body'`, old/new bodies truncated to 255 chars). Returns `getOne`.

### `CommentsService.getOne(commentId)` (private)
- Returns a projected shape: `{ id, body, visibility, author: {id,name}|null, createdAt, editedAt }`.

`ALL_STAFF_ROLES = [FOCAL_POINT, DEVELOPER, ADMIN]`.

## Guards & auth
- Controller-wide `JwtAuthGuard` (staff JWT). Add route adds `PlatformAccessGuard` + `@Roles(...)`. Edit route relies entirely on in-service ownership + `ScopeService.canAccessPlatform`. See [[Auth and Authorization]].

## Dependencies (injected)
- Repos: `Comment`, `Issue`, `UserPlatformRole`.
- `ScopeService` ([[Auth and Authorization]]), `DataSource` (transactions), `AuditService` ([[Module - Audit, Events and Health]]), `EventEmitter2`.

## Events (emitted/consumed)
- **Emits** `IssueEvents.COMMENT_ADDED` (`CommentAddedEvent { issueId, platformId, commentId, reporterVisible, actorStaffId, mentionStaffIds }`). Consumed by notifications/SSE listeners — see [[Domain Events and Issue Lifecycle]].

## Entities touched
- `Comment` (`comments`): `issue`, `author` (nullable, `SET NULL`), `authorType` (STAFF default / REPORTER), `authorName` (reporter snapshot), `body`, `visibility` (INTERNAL default / REPORTER_VISIBLE), `createdAt`, `editedAt`. Note: reporter-authored comments have `author = null` + `authorType = REPORTER`; this module only writes STAFF-authored comments.
- `Issue` (read + conditional `updatedAt` bump), `UserPlatformRole` (membership lookup). See [[Data Model]].

## Gotchas / invariants
- Reporter-visible add bumps `Issue.updatedAt` but **not** `version` — intentional, to avoid optimistic-lock 409s while still triggering the reporter's unread indicator (OD-02).
- Mention ids are filtered **after** commit and only the filtered set is emitted; an id that is neither author nor platform member is silently dropped (no error).
- Edit route deliberately skips `PlatformAccessGuard`; without the in-service `canAccessPlatform` recheck a revoked/moved author could still edit — the recheck closes that gap.
- Audit `oldValue`/`newValue` for edits are truncated to 255 chars.
- `CreateCommentDto.visibility` has a class default of `INTERNAL`, but is `@IsEnum` (required in Swagger); global `ValidationPipe` whitelist rejects undeclared fields.

## Related
- [[Backend Modules and API]] · [[Module - Issues]] · [[Module - Notifications]] · [[Module - Audit, Events and Health]] · [[Auth and Authorization]] · [[Domain Events and Issue Lifecycle]] · [[Data Model]] · [[Decisions and Glossary]]
