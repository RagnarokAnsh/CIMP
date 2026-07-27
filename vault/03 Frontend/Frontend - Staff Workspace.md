---
title: Frontend - Staff Workspace
tags: [cimp, frontend, react]
updated: 2026-07-27
---
# Frontend — Staff Workspace (`frontend/src/staff/`)
← [[Frontend Overview]] · [[CIMP - Home]]

The `/staff/*` SPA surface: email/password login → triage workspace. TanStack Query for data, shadcn/ui, sonner toasts, dnd-kit board.

## Files
| File | Responsibility |
|---|---|
| `StaffApp.tsx` | Mounts the staff app; gates on login. |
| `local-auth.tsx` | `LocalStaffApp` — login form; stores the JWT in `sessionStorage`; registers the token getter for `staffApi`; signs out on 401. |
| `StaffLayout.tsx` | Sidebar nav + top bar (search/⌘K, `NotificationsBell`, `ThemeToggle`, user menu, `SupportButton`). Runs `useStaffRealtime`. |
| `routes.tsx` | `StaffWorkspaceRoutes`. |
| `IssuesListPage.tsx` | Filter/search/sort/paginate issue table; saved views; bulk actions. |
| `BoardPage.tsx` | dnd-kit Kanban by status + **per-column WIP limits** (over-limit badge turns red). Quick-move menu + optimistic moves with 409 handling. |
| `DashboardPage.tsx` + `TrendChart.tsx` | Scoped dashboard (counts, SLA tallies, 14-day trend via recharts). Cards come from `dashboard-widgets.tsx`. |
| `dashboard-widgets.tsx` | **Shared analytics vocabulary** — `HeroStat`, `KpiCard`, `SlaHealth`, `Breakdown` (+ its domain ordering). Used by *both* `DashboardPage` and `PlatformReportPage` so the two surfaces cannot drift. Pure helpers (`pct`, `hoursFmt`) live in `lib/format.ts` so this file exports components only (Fast Refresh). |
| `PlatformReportPage.tsx` | **Tenant-owner report** (`/staff/reports`) — one platform's support health: FRT/resolution percentiles, SLA, CSAT, reopen rate, deflection, trend, and its published known issues. Platform picker is fed by the already-scoped `/staff/platforms`. Read-role, so a **WATCHER** can use it. → [[Module - Dashboard]] |
| `AuditPage.tsx` | Admin audit-log viewer (filter/paginate). |
| `AdminPage.tsx` | Platforms · Staff & roles · Integrations · **Status page** · Webhooks tabs. Every destructive action goes through `ConfirmDialog`; the irreversible ones require typing the platform key / staff email. |
| `AdminIntegrations.tsx` | Integrations tab (automation rules, API tokens, **canned responses**) + Webhooks tab. → [[Module - Canned Responses]] |
| `AdminStatusPage.tsx` | **Status page tab** — components (add/delete, set status inline) and incidents (publish, post timeline updates, delete), plus a "View public page" link to `/status/:key`. → [[Module - Status Page]] |
| `StaffIssueDetailPage.tsx` | Route wrapper for the detail panel. |
| `IssueDetailPanel.tsx` | Full issue detail: status/priority/assignee actions (require `version`, 409 → reload), comments with **@mention autocomplete**, history, attachments, and the extras sidebar. **Renders in two very different containers** — the full-page route (~1472px) and the split view (~1052px) — so it is an `@container` and switches to the `[1fr_300px]` sidebar layout at `@6xl`, *not* at a viewport breakpoint. Using `xl:` here put a tall sidebar beside a short main column in split view. |
| `IssueExtras.tsx` | **`IssueWatch` + `IssueLabels` + `IssueLinks`** — the shipped features' UI. → [[Features - Shipped]] |
| *(in `IssueDetailPanel`)* | **Canned-response picker** — a "Templates" dropdown beside the visibility select; `fillTemplate` substitutes `{{reporter}}`/`{{reference}}`/`{{assignee}}`/`{{platform}}` and `insertCanned` drops the result at the caret. Only queried when `canWrite` (the endpoint 403s for watchers). |
| `SupportButton.tsx` | Mints a self-support hand-off and opens the reporter form. → [[Module - Self-Support]] |
| `NotificationsBell.tsx` | Bell dropdown (unread count, mark-read). |
| `CommandPalette.tsx` | ⌘K quick nav/search. |

## Auth & data flow
- JWT in `sessionStorage`; `staffApi` sends it as `Authorization: Bearer`. → [[Auth and Authorization]]
- Live updates via `useStaffRealtime` (SSE ticket) invalidate TanStack caches → board/lists/detail/bell refresh. → [[Frontend - Components, Lib and API]]
- Mutations optimistic; a **409** (stale `version`) reloads + toasts "changed elsewhere".

## Gotchas
- The frontend only gates UI; the **server enforces** scope (a hidden button is not a security control).
- Staff token in `sessionStorage` is XSS-readable (audit L14) — mitigated by no unsafe HTML rendering.
- **The staff workspace is not localized** — only the reporter portal is. → [[Frontend - Reporter Surface]]
- The `Reports` nav entry sits outside the `isAdmin` block: its endpoint is read-role scoped, so every staff role (watchers included) may reach it.

## Related
[[Frontend Overview]] · [[Frontend - Components, Lib and API]] · [[Frontend - Reporter Surface]] · [[Features - Shipped]] · [[Module - Issues]] · [[Module - Dashboard]] · [[Module - Canned Responses]] · [[Module - Status Page]]
