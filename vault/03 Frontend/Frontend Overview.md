---
title: Frontend Overview
tags: [cimp, frontend, react]
updated: 2026-07-13
---
# Frontend Overview
← [[CIMP - Home]]

`frontend/` — Vite + React + TypeScript SPA. shadcn/ui (owned source in `src/components/ui/`), TanStack Query + Table, React Router, sonner (toasts), dnd-kit (board). E2E via **Playwright** (`tests/e2e/`, `npm run test:e2e`).

## Three surfaces (one SPA, `src/App.tsx`)
- **Reporter** (`/reporter/*`) — embedded in portals; auth via hand-off token (`src/api/handoff.ts` captures `?handoff=`/postMessage → `sessionStorage`, stripped from URL). SDK diagnostics ride a `#cimpctx=` URL **fragment**, captured by `src/api/diagnostics.ts` before render (never hits a server). Pages: NewIssuePage (+ deflection "already tracked" panel + removable diagnostics/screenshot chips), MyIssuesPage, ReporterIssueDetailPage (+ CSAT 👍/👎 widget once RESOLVED/CLOSED).
- **Staff** (`/staff/*`) — email/password login (`src/staff/local-auth.tsx`, token in `sessionStorage`). Layout `StaffLayout.tsx` (sidebar + top bar). Pages: IssuesListPage (+ **JQL** query input with inline errors), BoardPage, DashboardPage, **PlatformReportPage** (`/staff/reports` — per-platform tenant report), AuditPage, AdminPage, **TriagePage** (`/staff/triage` — keyboard-first NEW queue), StaffIssueDetailPage. Command palette (⌘K).
- **Public status page** (`/status/:key`) — `src/status/PublicStatusPage.tsx`. **Unauthenticated**, and deliberately uses its own bare axios instance rather than `staffApi`/`reporterApi`, which would attach credentials this page must never send. Auto-refreshes every 60s. → [[Module - Status Page]]

The reporter surface is **localized** (EN/ES/FR/DE, `src/i18n/`); the staff workspace is not. → [[Frontend - Reporter Surface]]

## Key pieces
- **API clients** (`src/api/client.ts`): `staffApi` (Bearer) + `reporterApi` (`X-Handoff-Token`), axios, 401 handling.
- **Types** (`src/api/types.ts`): hand-written response types (mirror backend). Regenerate the full client with `npm run gen:api` against running backend.
- **Shared helpers:** `src/lib/toast-error.ts` (`toastApiError` — single-param `onError`, unwraps class-validator arrays), `src/lib/use-hotkeys.ts` (single-key shortcuts, dead in inputs/open dialogs), `components/DiagnosticsView.tsx` (read-only render of SDK `context`, plain text only — shared by reporter consent dialog + staff panel).
- **Realtime** (`src/lib/realtime.ts`): `useStaffRealtime` — fetches a short-lived SSE ticket (header), opens `EventSource`, invalidates TanStack caches on events; reconnects with a fresh ticket. See [[Auth and Authorization]].
- **Issue detail** (`src/staff/IssueDetailPanel.tsx`): status/priority/assignee actions, comments with @mention autocomplete, history, attachments (`AttachmentPreview.tsx` renders PDFs in a **sandboxed** iframe). Also: collapsible **Diagnostics** panel, CSAT/Published badges, duplicate banner + "Duplicates (N)" list, **Merge-into** dialog (`MergeIssueButton` in `IssueExtras.tsx`), and a **Known issue** publish card. Sidebar extras: **`IssueExtras.tsx`** = watch toggle + labels + links + merge ([[Features - Shipped]]).
- **Board** (`src/staff/BoardPage.tsx`): drag-drop Kanban by status + per-column **WIP limits** + **swimlanes** (group by Assignee/Priority; dragging off in lanes — cards move via the per-card menu, droppable ids namespaced per lane).
- **Admin** (`src/staff/AdminPage.tsx` + `AdminIntegrations.tsx`): tabs Platforms (+ per-platform **SLA policy** dialog), Staff & roles (+ Add-staff), **Integrations** (automation-rule builder + API-token management, copy-once secrets), **Webhooks** (CRUD + event filters, copy-once secret).
- **Dashboard** (`src/staff/DashboardPage.tsx`): KPI rows now include **CSAT (30d)** + an **ops** row (first-response/resolution p50·p90, reopen rate, deflected).
- **Support button** (`src/staff/SupportButton.tsx`): self-support handoff → [[Integrations]].

## Commands (`frontend/`)
`npm run dev` (:5173, proxies `/api`→:3000) · `npm run build` (`tsc -b && vite build`) · `npm run typecheck` · `npm run gen:api` · `npm run test:e2e` (Playwright, needs dev Postgres).

Related: [[Backend Modules and API]] · [[Features - Shipped]]
