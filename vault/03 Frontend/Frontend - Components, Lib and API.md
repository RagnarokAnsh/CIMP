---
title: Frontend - Components, Lib and API
tags: [cimp, frontend, react]
updated: 2026-07-27
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
| `Pager.tsx` | The **one** paginator — used by the issues list and the audit log. Shows the record range and total ("Showing 1–20 of 59 · page 1 of 3"), not just the page number; `compact` drops the numbered buttons for narrow columns. Reach for this rather than hand-rolling prev/next. |
| `DateRangeFilter.tsx` | Created-date range as a Popover with presets, replacing two bare `<input type="date">` controls. |
| `AttachmentGallery.tsx` | Grid of attachments with scan-gated download. |
| `AttachmentPreview.tsx` | Inline preview; **PDFs render in a `sandbox=""` iframe** (opaque origin, no scripts — audit M5). |
| `StatusBadge.tsx` / `SlaBadge.tsx` | Status/priority + SLA state badges, both built on `lib/issue-meta.ts`. `SlaBadge` renders nothing for on-track/terminal issues **unless passed `showOnTrack`**, which the issues table sets: under a column headed "SLA" a blank cell was being asked to mean both "on track" and "no SLA policy applies". Cards and lists still stay quiet so the eye goes to what needs action. **Both** `StatusBadge` and `PriorityBadge` take an optional **`label`** override so the localized reporter portal reuses them instead of forking (priority only got one on 2026-07-27 — until then every locale read a translated status beside an English "Critical"). → [[Frontend - Reporter Surface]] |
| `AnimatedNumber.tsx`, `Reveal.tsx`, `GlobalLoadingBar.tsx`, `ThemeToggle.tsx`, `theme-provider.tsx` | Motion/UX + theming. |

## `lib/`
| File | Responsibility |
|---|---|
| `realtime.ts` | **`useStaffRealtime`** — fetches a short-lived SSE **ticket** (bearer header), opens `EventSource`, invalidates TanStack caches on events; re-fetches a ticket on reconnect. → [[Auth and Authorization]] |
| `issue-status.ts` | `STATUS_TRANSITIONS`, `canTransition`, `BOARD_STATUS_ORDER` (mirrors server status machine). |
| `status-meta.ts` | Status-page vocabulary in the same shape as `issue-meta.ts`: `COMPONENT_STATUS_META` (now also `banner`/`bannerIcon` for full-surface treatments), `INCIDENT_STATUS_META`, `INCIDENT_IMPACT_META`, `OVERALL_HEADLINE` + ordered picker lists. Tones reuse `BADGE_TONE`/`BANNER_TONE`, so the public page and the admin tab can never describe a state differently — though until 2026-07-27 the public banner simply **didn't read this map**, hard-coding `ok ? emerald : amber` and painting a major outage the same colour as a maintenance window. → [[Module - Status Page]] |
| `api-error.ts` | **`friendlyError(e, fallback)`** — the single status→human-text mapper. Prefers the server's message for *domain* statuses (400/404/409/422, which are specific and actionable) and substitutes friendly text elsewhere (429, 5xx, and `0` = no response reached us). Strips any `SomethingException:` prefix defensively. `GLOBALLY_TOASTED` (401/403/429) lets per-call handlers avoid stacking a second toast on the interceptor's. |
| `use-document-title.ts` | Sets `document.title` per route. Nothing did this before, so every route — including the public `/status/:key` — shared one static title (WCAG 2.4.2). Pass `null` while data loads; the title is set once it arrives. |
| `ui/kbd.tsx` | The only way to render a keyboard key. `aria-hidden` by default (a hint beside a labelled control is noise); pass `aria-hidden={false}` in a shortcut list where the key IS the content. Replaced three different hand-rolled treatments. |
| `issue-meta.ts` | Status/priority labels + colours, **and `BADGE_TONE` / `BANNER_TONE` / `TEXT_TONE` / `METER_TONE` — the single source for success/info/warning/severe/danger styling.** Reach for these instead of hand-rolling `bg-emerald-500/10 text-emerald-400`-style classes: every ad-hoc recipe that existed was written in dark mode and measured 1.7–3.5 against a 4.5 AA requirement in light. Also exports `meterTone()` (progress-bar fill from a needs-attention boolean) and `actionLabel`/`historyValue`/`enumLabel` (humanise `NOT_SYNCED` → "Not synced"). `tests/e2e/design-tokens.spec.ts` pins all 19 recipes in both themes **and** guards the list against drifting from this file — it had already gone stale once. The raw Tailwind palette (rather than the `--success`/`--warning` tokens) is deliberate here — 6 statuses × 4 priorities need more distinct hues than the semantic tokens provide. **`STATUS_META.dot` values are solved as a set for colour-vision distance** (worst-case pairwise ΔE 20.4 across normal/deuteranope/protanope); don't change one in isolation. |
| `format.ts`, `download.ts`, `motion.ts`, `utils.ts` | Formatting (`relativeTime`/`dateTime`/`shortDate`/`initials`/`firstLine` + the analytics helpers **`pct`/`hoursFmt`**), file download, command-palette open, `cn`. |
| `toast-error.ts` | `toastApiError` / `toastMutationError` — both now route through `api-error.ts` and **skip statuses the global interceptor already toasted**. |

## `api/`
| File | Responsibility |
|---|---|
| `client.ts` | `staffApi` (Bearer JWT) + `reporterApi` (`X-Handoff-Token`) axios instances; token getters; **401 / 403 / 429** handling, deduped (`authToast`, 3s window). 409 is deliberately passed through untouched so per-mutation handlers can refresh and retry. |
| `handoff.ts` | Captures the hand-off token from `?handoff=` / origin-checked `postMessage` → `sessionStorage`, strips it from the URL. |
| `types.ts` | Hand-written response types (mirror backend). Regenerate the full client: `npm run gen:api`. |

## Gotchas
- `handoff.ts` `postMessage` only trusts origins in `VITE_PORTAL_ORIGINS` (audit L13 — keep it exact).
- `types.ts` is manual; after backend shape changes, update it or run `gen:api`.

## Related
[[Frontend Overview]] · [[Frontend - Staff Workspace]] · [[Module - Realtime]] · [[Module - Handoff]]
