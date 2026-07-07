---
title: Frontend Overview
tags: [cimp, frontend, react]
updated: 2026-07-06
---
# Frontend Overview
← [[CIMP - Home]]

`frontend/` — Vite + React + TypeScript SPA. shadcn/ui (owned source in `src/components/ui/`), TanStack Query + Table, React Router, sonner (toasts), dnd-kit (board).

## Two surfaces (one SPA, `src/App.tsx`)
- **Reporter** (`/reporter/*`) — embedded in portals; auth via hand-off token (`src/api/handoff.ts` captures `?handoff=`/postMessage → `sessionStorage`, stripped from URL). Pages: NewIssuePage, MyIssuesPage, ReporterIssueDetailPage.
- **Staff** (`/staff/*`) — email/password login (`src/staff/local-auth.tsx`, token in `sessionStorage`). Layout `StaffLayout.tsx` (sidebar + top bar). Pages: IssuesListPage, BoardPage, DashboardPage, AuditPage, AdminPage, StaffIssueDetailPage. Command palette (⌘K).

## Key pieces
- **API clients** (`src/api/client.ts`): `staffApi` (Bearer) + `reporterApi` (`X-Handoff-Token`), axios, 401 handling.
- **Types** (`src/api/types.ts`): hand-written response types (mirror backend). Regenerate the full client with `npm run gen:api` against running backend.
- **Realtime** (`src/lib/realtime.ts`): `useStaffRealtime` — fetches a short-lived SSE ticket (header), opens `EventSource`, invalidates TanStack caches on events; reconnects with a fresh ticket. See [[Auth and Authorization]].
- **Issue detail** (`src/staff/IssueDetailPanel.tsx`): status/priority/assignee actions, comments with @mention autocomplete, history, attachments (`AttachmentPreview.tsx` renders PDFs in a **sandboxed** iframe). Sidebar extras: **`IssueExtras.tsx`** = watch toggle + labels + links ([[Features - Shipped]]).
- **Board** (`src/staff/BoardPage.tsx`): drag-drop Kanban by status + per-column **WIP limits**.
- **Support button** (`src/staff/SupportButton.tsx`): self-support handoff → [[Integrations]].

## Commands (`frontend/`)
`npm run dev` (:5173, proxies `/api`→:3000) · `npm run build` (`tsc -b && vite build`) · `npm run typecheck` · `npm run gen:api`.

Related: [[Backend Modules and API]] · [[Features - Shipped]]
