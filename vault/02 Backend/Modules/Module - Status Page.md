---
title: Module - Status Page
tags: [cimp, backend, status-page, public, incidents]
updated: 2026-07-27
---
# Module - Status Page (`src/status`)
← [[Backend Modules and API]] · [[CIMP - Home]]

**Purpose:** A public, per-platform status page — named **components** with a health status, plus **incidents** carrying an append-only public update timeline. Staff publish; anyone may read. Everything served publicly is staff-authored: no reporter text, no issue references, no internal ids beyond the incident's own.

Complements [[Features - Shipped|known-issues deflection]] (which publishes curated *issue* titles) — this is the broader "is the service up" surface.

## Files
| File | Responsibility |
|---|---|
| `status.module.ts` | Wires `TypeOrmModule.forFeature([StatusComponent, StatusIncident, StatusIncidentUpdate, Platform])` + `AuthModule` + `AuthzModule`. |
| `status.controller.ts` | Two controllers: `StaffStatusController` (managed, JWT) and `PublicStatusController` (**unauthenticated**). |
| `status.service.ts` | Scope checks, component/incident CRUD, incident progression, and the public payload. |
| `dto/status.dto.ts` | `CreateComponentDto`, `UpdateComponentDto`, `CreateIncidentDto`, `AddIncidentUpdateDto` (componentIds `@IsUUID` each, `@ArrayMaxSize(50)`). |
| `status.service.spec.ts` | 10 specs — access, cross-platform 404/400, disabled-platform 404, overall-status derivation, active-vs-history split, timeline ordering. |

## Public surface
**Staff** — `JwtAuthGuard`, tag `staff-status-page`, scope checked in-service (`STAFF_WRITE_ROLES`):

| Method | Route |
|---|---|
| GET/POST | `/api/staff/platforms/:platformId/status/components` |
| PATCH/DELETE | `/api/staff/platforms/:platformId/status/components/:componentId` |
| GET/POST | `/api/staff/platforms/:platformId/status/incidents` |
| POST | `/api/staff/platforms/:platformId/status/incidents/:incidentId/updates` |
| DELETE | `/api/staff/platforms/:platformId/status/incidents/:incidentId` |

**Public** — `GET /api/public/platforms/:key/status`. No guard. `@Throttle(60/min)`, `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=30`. Same shape as the known-issues endpoint in [[Module - Reporter|deflection.controllers.ts]] so connected apps can render a banner straight from the browser.

Public response:
```
{
  platform: { key, name },
  overall: ComponentStatus,
  components:       [{ id, name, description, status }],
  activeIncidents:  [IncidentView],   // status != RESOLVED
  recentIncidents:  [IncidentView],   // status == RESOLVED
  updatedAt
}
```

## Key classes & logic
**`StatusService`** (injected the three repos + `Repository<Platform>`, `DataSource`, `ScopeService`):
- `assertAccess` — publishing to a public page is a **write** action: `STAFF_WRITE_ROLES` only, never a watcher.
- `createIncident` — transactional: saves the incident **and its opening statement as the first timeline entry**, so the public timeline is complete from the start rather than beginning at update #2. An incident opened already-`RESOLVED` still stamps `resolvedAt`.
- `addIncidentUpdate` — the incident **inherits the update's status**; the timeline is the source of truth for where it stands. `RESOLVED` stamps `resolvedAt` once (`?? new Date()`, so re-resolving keeps the original time); any non-resolved status clears it, so re-opening shows as ongoing again.
- `resolveComponents(platformId, ids)` — loads by `In(ids)` **scoped to the platform** and refuses if `rows.length !== wanted.length`, so an incident can never name another tenant's component.
- `publicStatus(key)` — a platform that is missing **or `DISABLED` 404s identically** (matches [[Module - Handoff|HandoffService]]). Splits incidents into active/history, caps history at 20.
- `overallStatus(components, hasActiveIncident)` — worst component wins via `SEVERITY_ORDER` (OPERATIONAL → MAINTENANCE → DEGRADED → PARTIAL_OUTAGE → MAJOR_OUTAGE). **With no components configured, an open incident still forces `DEGRADED`** — otherwise a platform that only posts incidents would always read green.
- `incidentView` — timeline sorted **newest-first**.

## Enums (in `src/common/enums.ts`)
- `ComponentStatus` — OPERATIONAL · MAINTENANCE · DEGRADED · PARTIAL_OUTAGE · MAJOR_OUTAGE (declared worst-last so `overall` is a max).
- `IncidentStatus` — INVESTIGATING · IDENTIFIED · MONITORING · RESOLVED (RESOLVED is terminal and stamps `resolvedAt`).
- `IncidentImpact` — MINOR · MAJOR · CRITICAL · MAINTENANCE.

## Guards & auth
Staff routes: `JwtAuthGuard` + in-service write-role scope check. Public route: **no guard by design** — throttled, CORS-open, and returns only published content.

## Events
None emitted or consumed.

## Entities touched
`StatusComponent`, `StatusIncident`, `StatusIncidentUpdate`, plus the `status_incident_components` M2M join. All CASCADE from `Platform`. `created_by` on incident/update is a plain uuid, not an FK, so removing a staff member never deletes public history. See [[Entity Reference]].

## Gotchas / invariants
- The public endpoint is the **only** unauthenticated write-free surface besides known-issues — keep it that way; never add a field sourced from reporter input.
- Deleting an incident removes its whole public timeline (CASCADE).
- Migration **#19** `AddStatusPage` creates four tables + four enum types → [[Migrations Log]].

## Related
[[Module - Reporter]] · [[Module - Authz]] · [[Frontend - Staff Workspace]] · [[Features - Shipped]] · [[Entity Reference]] · [[Integrations]]
