---
title: Module - Canned Responses
tags: [cimp, backend, canned-responses, comments]
updated: 2026-07-27
---
# Module - Canned Responses (`src/canned-responses`)
← [[Backend Modules and API]] · [[CIMP - Home]]

**Purpose:** A per-platform catalog of reply templates ("macros") that staff insert into the comment composer. Bodies carry `{{placeholders}}` which are substituted **client-side at insert time** — the server stores and returns the template verbatim and never interpolates.

## Files
| File | Responsibility |
|---|---|
| `canned-responses.module.ts` | Wires `TypeOrmModule.forFeature([CannedResponse])` + `AuthModule` + `AuthzModule`; declares controller + service. |
| `canned-responses.controller.ts` | CRUD under `/api/staff/platforms/:platformId/canned-responses`. Carries a **platformId, not an issue id**, so only `JwtAuthGuard` is applied and the service does the scope check. |
| `canned-responses.service.ts` | Scope enforcement + CRUD; maps `23505` → 409 via the shared `isUniqueViolation`. |
| `dto/canned-response.dto.ts` | `CreateCannedResponseDto` (title ≤80, body ≤5000), `UpdateCannedResponseDto` (both optional). |
| `canned-responses.service.spec.ts` | 6 specs — scope refusal, watcher refusal, author stamping, duplicate-title 409, cross-platform 404, view shape. |

## Public surface
All routes `JwtAuthGuard`, Swagger tag `staff-canned-responses`, bearer `staff`. Access is checked in the service (`STAFF_WRITE_ROLES` on the path platform).

| Method | Route | Handler |
|---|---|---|
| GET | `/api/staff/platforms/:platformId/canned-responses` | `list` |
| POST | `/api/staff/platforms/:platformId/canned-responses` | `create` |
| PATCH | `/api/staff/platforms/:platformId/canned-responses/:id` | `update` |
| DELETE | `/api/staff/platforms/:platformId/canned-responses/:id` | `remove` |

## Key classes & logic
**`CannedResponsesService`** (injected `Repository<CannedResponse>`, `ScopeService`):
- `assertAccess(staff, platformId)` — `canAccessPlatform(..., STAFF_WRITE_ROLES)` else 403. **Write-role only for reads too**: unlike the labels catalog (which watchers list because labels appear on issues they can see), a watcher cannot comment, so there is no read-only surface for reply templates.
- `create` — trims the title, stamps `createdBy: staff.id`. A duplicate title on the same platform hits `UQ_canned_responses_platform_title` → `ConflictException`.
- `update` / `remove` — load by id **then verify `row.platform.id === platformId`**, else 404. A template id from another platform is indistinguishable from one that doesn't exist.
- `toView` — `{ id, title, body, createdAt, updatedAt }`. `createdBy` is deliberately not exposed.

## Placeholders
Substituted in `IssueDetailPanel.fillTemplate` (frontend), never server-side:
`{{reporter}}` · `{{reference}}` · `{{assignee}}` · `{{platform}}` — case-insensitive, tolerant of inner whitespace. Unknown placeholders are left literal.

## Guards & auth
`JwtAuthGuard` only at the controller; `PlatformAccessGuard`'s `:id` branch does not apply (this route carries a platformId). Scope enforced in-service — same shape as [[Module - Issues|labels/automation controllers]].

## Dependencies (injected)
- `Repository<CannedResponse>` · `ScopeService` (from `AuthzModule`).

## Events
None emitted or consumed.

## Entities touched
`CannedResponse` (platform FK CASCADE, `UQ(platform, title)`, `created_by` a plain uuid column — **not** an FK, so deleting a staff member never removes the team's shared templates). See [[Entity Reference]].

## Gotchas / invariants
- `created_by` is intentionally not a foreign key (matches `IssueLink.createdBy`).
- The body is stored raw; React escapes it at render, and the composer inserts it as plain text into a `<textarea>`.
- Migration **#18** `AddCannedResponses` → [[Migrations Log]].

## Related
[[Module - Comments]] · [[Module - Authz]] · [[Frontend - Staff Workspace]] · [[Features - Shipped]] · [[Entity Reference]]
