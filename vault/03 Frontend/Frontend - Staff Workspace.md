---
title: Frontend - Staff Workspace
tags: [cimp, frontend, react]
updated: 2026-07-06
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
| `DashboardPage.tsx` + `TrendChart.tsx` | Scoped dashboard (counts, SLA tallies, 14-day trend via recharts). |
| `AuditPage.tsx` | Admin audit-log viewer (filter/paginate). |
| `AdminPage.tsx` | Platforms tab (create · SLA · rotate-secret · **disable/enable · delete**) + Staff & roles tab (create · filter · **edit · set password · disable/enable · delete**, per-row role grant/revoke). Every destructive action goes through `ConfirmDialog`; the irreversible ones require typing the platform key / staff email. |
| `StaffIssueDetailPage.tsx` | Route wrapper for the detail panel. |
| `IssueDetailPanel.tsx` | Full issue detail: status/priority/assignee actions (require `version`, 409 → reload), comments with **@mention autocomplete**, history, attachments, and the extras sidebar. **Renders in two very different containers** — the full-page route (~1472px) and the split view (~1052px) — so it is an `@container` and switches to the `[1fr_300px]` sidebar layout at `@6xl`, *not* at a viewport breakpoint. Using `xl:` here put a tall sidebar beside a short main column in split view. |
| `IssueExtras.tsx` | **`IssueWatch` + `IssueLabels` + `IssueLinks`** — the shipped features' UI. → [[Features - Shipped]] |
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

## Related
[[Frontend Overview]] · [[Frontend - Components, Lib and API]] · [[Features - Shipped]] · [[Module - Issues]]
