---
title: Module - Saved Views
tags: [cimp, backend, module]
updated: 2026-07-06
---
# Module - Saved Views (`src/saved-views`)
← [[Backend Modules and API]] · [[CIMP - Home]]

**Purpose:** Per-staff CRUD for named, server-persisted issue-list filter sets ("saved views"), scoped strictly to the calling staff member so views follow a user across devices.

## Files
| File | Responsibility |
|---|---|
| `saved-views.module.ts` | `SavedViewsModule` — registers `TypeOrmModule.forFeature([SavedView])`, imports `AuthModule` (for `JwtAuthGuard`), wires controller + service. |
| `saved-views.controller.ts` | `SavedViewsController` — REST surface under `staff/saved-views`, guarded by `JwtAuthGuard`; delegates to service passing `staff.id`. |
| `saved-views.service.ts` | `SavedViewsService` — TypeORM repository logic: list, upsert-by-name, delete; maps entities to a lean DTO. |
| `dto/save-view.dto.ts` | `SaveViewDto` — validated request body (`name`, `filters`). |
| `../entities/saved-view.entity.ts` | `SavedView` entity (lives in `src/entities`, not this dir) — the persisted table. |

## Public surface
All routes carry the global `/api` prefix and require a staff JWT (`Authorization: Bearer`, Swagger `@ApiBearerAuth('staff')`, tag `staff-saved-views`).

| Method | Route | Guard | Handler | Behavior |
|---|---|---|---|---|
| GET | `/api/staff/saved-views` | `JwtAuthGuard` | `list` | Returns caller's views, ordered by `name ASC`. |
| PUT | `/api/staff/saved-views` | `JwtAuthGuard` | `save` | Create-or-update by `name` (upsert). Body = `SaveViewDto`. |
| DELETE | `/api/staff/saved-views/:id` | `JwtAuthGuard` | `remove` | `:id` via `ParseUUIDPipe`; 404 if not owned by caller. Returns `{ ok: true }`. |

There are no exported providers beyond `SavedViewsService` (module-internal; not exported to other modules).

## Key classes & logic
**`SavedViewsController`** — thin. Every handler reads the authenticated staff via the `@CurrentStaff()` decorator (`AuthenticatedStaff`) and forwards only `staff.id`. No role gate beyond authentication — any logged-in staff manages their own views.

**`SavedViewsService`** (injects `Repository<SavedView>`):
- `list(staffId)` — `find({ where: { staffUser: { id: staffId } }, order: { name: 'ASC' } })`, mapped through `toDto`.
- `save(staffId, dto)` — **upsert keyed on `(staffUser, name)`**: looks up an existing row by staff + `dto.name`; if found, overwrites `filters` in place; else `create`s a new row. Saving an existing name silently overwrites its filters (no new row, no error).
- `remove(staffId, id)` — fetches by both `id` **and** `staffUser.id`; throws `NotFoundException('Saved view not found')` if absent — this is the ownership check (another user's id yields 404, not 403).
- `toDto(v)` — projects to `{ id, name, filters, updatedAt }` (drops `staffUser`, `createdAt`).

**`SaveViewDto`** — `name`: string, `MinLength(1)`/`MaxLength(60)`; `filters`: `@IsObject()`, `Record<string, unknown>`. The global `ValidationPipe` (`whitelist + forbidNonWhitelisted`) rejects unknown top-level fields, but `filters` is an **opaque blob owned by the frontend** — its inner shape (status, priority, `q`, etc.) is not validated server-side.

## Guards & auth
- `JwtAuthGuard` (from `AuthModule`) authenticates the staff JWT and populates `AuthenticatedStaff`. See [[Auth and Authorization]].
- **No `PlatformAccessGuard` / `@Roles` / `ScopeService`** — authorization here is pure row-ownership: every query filters by `staffUser.id = caller`. There is no cross-user or platform scoping because saved views hold only opaque UI filters, not issue data.

## Dependencies (injected)
- `SavedViewsService` ← `Repository<SavedView>` (TypeORM).
- Module imports `AuthModule` to obtain `JwtAuthGuard`.

## Events
None emitted or consumed. Pure CRUD; no domain events (contrast [[Domain Events and Issue Lifecycle]]).

## Entities touched
`SavedView` (`saved_views` table) — see [[Data Model]]:
- `id` uuid PK; `staffUser` `ManyToOne(StaffUser, { onDelete: 'CASCADE' })` on column `staff_user_id`; `name` text; `filters` `jsonb`; `created_at` / `updated_at` timestamptz.
- **`@Unique(['staffUser', 'name'])`** — one view name per staff member; enforces the upsert key at the DB level.
- `onDelete: 'CASCADE'` — deleting a `StaffUser` removes their saved views.

## Gotchas / invariants
- **Upsert, not versioned create.** PUT with an existing `name` overwrites `filters`; there is no optimistic-locking `version` and no 409 (unlike `Issue`).
- **Ownership = 404, not 403.** Deleting a view you don't own returns `NotFoundException`, deliberately not leaking existence.
- **`filters` is unvalidated JSON** — server trusts the frontend's payload shape; only that it is an object. Do not rely on server-side filter semantics.
- Migrated from a prior **localStorage-only** implementation on the frontend; server persistence makes views cross-device. See [[Frontend Overview]].
- `updatedAt` is surfaced in the DTO (useful for client cache/sync); `createdAt` is not.

## Related
[[Backend Modules and API]] · [[Auth and Authorization]] · [[Data Model]] · [[Module - Admin]] · [[Frontend Overview]] · [[Features - Shipped]] · [[Architecture Overview]]
