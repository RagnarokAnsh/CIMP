---
title: Frontend - Components, Lib and API
tags: [cimp, frontend, react]
updated: 2026-07-06
---
# Frontend — Components, Lib and API (`frontend/src/{components,lib,api}/`)
← [[Frontend Overview]] · [[CIMP - Home]]

Shared UI, hooks, and the API clients used by both the [[Frontend - Staff Workspace|staff]] and [[Frontend - Reporter Surface|reporter]] surfaces.

## `components/`
| File | Responsibility |
|---|---|
| `ui/` (shadcn) | Owned-source primitives: button, card, dialog, **alert-dialog**, **popover**, select, table, tabs, badge, sheet, dropdown-menu, command, input, textarea, tooltip, skeleton, empty, sonner, chart, etc. All build on the already-installed unified `radix-ui` package — adding one costs no new dependency. Edit freely. Local divergences worth knowing: **`table.tsx`** wraps the scroller in `useScrollEdges` and paints edge shadows only when there is more to reveal (plus a focusable `region` for keyboard scrolling); **`tabs.tsx`** TabsList is `max-w-full overflow-x-auto` so a 4-tab strip can't clip its last tab on a phone; **`input.tsx`** styles the `file:` picker button to match the secondary Button. |
| `DateRangeFilter.tsx` | Created-date range filter: Popover with Last 7/30/90-day + This-month presets over exact From/To fields, trigger summarising the active range. Replaced two bare `<input type="date">` controls (the browser's own widget, which ignored every design token). Days are formatted in the **viewer's local timezone** — these read as calendar days, so UTC would shift the boundary west of Greenwich. |
| `ConfirmDialog.tsx` | The confirmation gate for **every** destructive action. Uncontrolled (pass `trigger`) or controlled (`open`/`onOpenChange`) — use controlled when the action lives in a dropdown menu, or closing the menu unmounts the dialog mid-flight and an open menu leaves the page `aria-hidden`. `confirmPhrase` requires typing an exact string for irreversible actions. |
| `SecretOnce.tsx` | `SecretOnce` (inline banner) + `SecretOnceDialog` (must-acknowledge modal) for values shown exactly once — API tokens, webhook secrets, rotated hand-off keys. |
| `AttachmentGallery.tsx` | Grid of attachments with scan-gated download. |
| `AttachmentPreview.tsx` | Inline preview; **PDFs render in a `sandbox=""` iframe** (opaque origin, no scripts — audit M5). |
| `StatusBadge.tsx` / `SlaBadge.tsx` | Status/priority + SLA state badges, both built on `lib/issue-meta.ts`. **`SlaBadge` renders nothing for on-track/terminal issues** — an empty SLA column means everything is on track, not a bug. |
| `AnimatedNumber.tsx`, `Reveal.tsx`, `GlobalLoadingBar.tsx`, `ThemeToggle.tsx`, `theme-provider.tsx` | Motion/UX + theming. |

## `lib/`
| File | Responsibility |
|---|---|
| `realtime.ts` | **`useStaffRealtime`** — fetches a short-lived SSE **ticket** (bearer header), opens `EventSource`, invalidates TanStack caches on events; re-fetches a ticket on reconnect. → [[Auth and Authorization]] |
| `issue-status.ts` | `STATUS_TRANSITIONS`, `canTransition`, `BOARD_STATUS_ORDER` (mirrors server status machine). |
| `issue-meta.ts` | Status/priority labels + colours, **and `BADGE_TONE` / `TEXT_TONE` — the single source for success/info/warning/danger styling.** Reach for these instead of hand-rolling `bg-emerald-500/10 text-emerald-400`-style classes: every ad-hoc recipe that existed was written in dark mode and measured 1.7–3.5 against a 4.5 AA requirement in light. `tests/e2e/design-tokens.spec.ts` pins all 17 recipes in both themes. The raw Tailwind palette (rather than the `--success`/`--warning` tokens) is deliberate here — 6 statuses × 4 priorities need more distinct hues than the semantic tokens provide. |
| `format.ts`, `download.ts`, `motion.ts`, `utils.ts` | Formatting, file download, command-palette open, `cn`. |

## `api/`
| File | Responsibility |
|---|---|
| `client.ts` | `staffApi` (Bearer JWT) + `reporterApi` (`X-Handoff-Token`) axios instances; token getters; 401 handling. |
| `handoff.ts` | Captures the hand-off token from `?handoff=` / origin-checked `postMessage` → `sessionStorage`, strips it from the URL. |
| `types.ts` | Hand-written response types (mirror backend). Regenerate the full client: `npm run gen:api`. |

## Gotchas
- `handoff.ts` `postMessage` only trusts origins in `VITE_PORTAL_ORIGINS` (audit L13 — keep it exact).
- `types.ts` is manual; after backend shape changes, update it or run `gen:api`.

## Related
[[Frontend Overview]] · [[Frontend - Staff Workspace]] · [[Module - Realtime]] · [[Module - Handoff]]
