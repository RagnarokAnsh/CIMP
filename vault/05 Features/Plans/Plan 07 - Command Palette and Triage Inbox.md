---
title: Plan 07 - Command Palette and Triage Inbox
tags: [cimp, plan, frontend, ux]
updated: 2026-07-10
effort: M (1 week, frontend-only)
status: planned
---
# Plan 07 — Command palette (Ctrl+K) + keyboard triage inbox
← [[Plan 00 - How to Execute These Plans]]

## Goal
Staff never need the mouse for routine work: Ctrl+K jumps anywhere and runs
actions; a "Triage" queue presents untriaged issues one at a time with
single-key actions. This is the "faster than Jira" feel.

## Decisions
- Use the shadcn `command` component (cmdk). Check
  `frontend/src/components/ui/command.tsx`; if absent, add via
  `npx shadcn@latest add command` (components are owned source — commit them).
- No new backend endpoints: palette search uses the existing staff issues list
  endpoint with its search param (read `IssuesListPage.tsx` to see the exact
  query key/param and reuse); actions call existing mutations.
- Keyboard scope rules: shortcuts NEVER fire when focus is in an input,
  textarea, contenteditable, or a dialog is open. One shared hook enforces this.
- Triage queue definition: status = NEW, ordered oldest-first, scoped platforms
  (server already scopes). "Done" criterion for an item: any of assign /
  priority-set / status-change / merge — then auto-advance.

## Steps
1. `frontend/src/lib/use-hotkeys.ts` — tiny hook: `useHotkeys(map: Record<string,
   () => void>, enabled)`; guards per Decisions (check `event.target` tagName /
   isContentEditable, and a global "dialog open" signal — Radix sets
   `document.body` style/attributes; simplest reliable check:
   `document.querySelector('[role="dialog"][data-state="open"]')`).
2. `frontend/src/staff/CommandPalette.tsx`, mounted once in `StaffLayout.tsx`:
   - Open on Ctrl+K / Cmd+K.
   - Static commands: Go to Issues / Board / Dashboard / Admin / Triage
     (`useNavigate`), "New saved view", theme toggle if present.
   - Async section: after 2+ chars, debounced query against the issues list
     endpoint (limit 8) → items "REF · first 60 chars · status" → Enter
     navigates to the issue (same navigation the list rows use — read how
     IssuesListPage opens the detail panel and replicate).
   - Context actions when an issue detail is open: Assign to me, Set priority
     …, Change status … — implement via a lightweight
     `CommandContext` React context that the detail panel registers actions
     into; palette renders whatever is registered (keeps palette decoupled).
3. `frontend/src/staff/TriagePage.tsx` + route `/staff/triage` (mirror how
   BoardPage is routed in `App.tsx`) + nav item with count badge (reuse the
   list endpoint with status=NEW, take total):
   - Loads the queue; shows ONE issue as a large card: description (scrollable),
     reporter, platform, age, labels, Plan 03 diagnostics summary if present,
     Plan 05 suggestions if present.
   - Keys: `a` assign popover (staff list — reuse the assignee picker component
     from the detail panel if extractable, else a simple Select), `1-4` set
     priority LOW→CRITICAL, `s` status menu (state-machine-legal targets only —
     the detail panel already computes these; reuse), `l` labels popover,
     `m` merge dialog (Plan 02), `j/k` or `←/→` skip/back, `?` overlay showing
     the key map.
   - Mutations: identical hooks the detail panel uses (optimistic, 409 toast).
     On success of a triage-completing action → advance with a subtle
     transition; queue refetch on SSE issue events (see how the list subscribes
     in `lib/realtime.ts`).
4. Polish: palette + triage page honor reduced-motion; all actions also have
   visible buttons (keyboard is an accelerator, not the only path — a11y).

## Tests
Frontend has no test harness — acceptance is manual:
- Ctrl+K works on every staff page; typing filters; Enter navigates.
- Shortcuts dead while typing in any input/dialog.
- Triage 5 seeded issues end-to-end without touching the mouse.
- `npm run typecheck && npm run build` green.

## Gotchas
- Radix dialogs trap focus — the palette must be a `CommandDialog` (cmdk's
  dialog variant) or shortcuts inside it will fight the hotkey hook.
- Don't fetch the palette search on every keystroke — 250ms debounce +
  TanStack `keepPreviousData`.
- The board/list already have row-level actions; do NOT refactor them into the
  context registry in this plan — register from the detail panel only.
