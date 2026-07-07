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
| `ui/` (shadcn) | Owned-source primitives: button, card, dialog, select, table, tabs, badge, sheet, dropdown-menu, command, input, textarea, tooltip, skeleton, empty, sonner, chart, etc. Edit freely. |
| `AttachmentGallery.tsx` | Grid of attachments with scan-gated download. |
| `AttachmentPreview.tsx` | Inline preview; **PDFs render in a `sandbox=""` iframe** (opaque origin, no scripts — audit M5). |
| `StatusBadge.tsx` / `SlaBadge.tsx` | Status/priority + SLA state badges. |
| `AnimatedNumber.tsx`, `Reveal.tsx`, `GlobalLoadingBar.tsx`, `ThemeToggle.tsx`, `theme-provider.tsx` | Motion/UX + theming. |

## `lib/`
| File | Responsibility |
|---|---|
| `realtime.ts` | **`useStaffRealtime`** — fetches a short-lived SSE **ticket** (bearer header), opens `EventSource`, invalidates TanStack caches on events; re-fetches a ticket on reconnect. → [[Auth and Authorization]] |
| `issue-status.ts` | `STATUS_TRANSITIONS`, `canTransition`, `BOARD_STATUS_ORDER` (mirrors server status machine). |
| `issue-meta.ts` | Status/priority labels + colors. |
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
