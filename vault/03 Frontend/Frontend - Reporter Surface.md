---
title: Frontend - Reporter Surface
tags: [cimp, frontend, react, reporter]
updated: 2026-07-06
---
# Frontend — Reporter Surface (`frontend/src/reporter/`)
← [[Frontend Overview]] · [[CIMP - Home]]

The `/reporter/*` SPA surface — what an end user of a connected portal sees. **No login:** authenticated entirely by the hand-off token captured at load (`api/handoff.ts`, sent as `X-Handoff-Token`). → [[Auth and Authorization]]

## Files
| File | Responsibility |
|---|---|
| `NewIssuePage.tsx` | The two-field intake: description (10–5000 chars) + ≤5 attachments (client-side type/size checks mirror the server's; server re-sniffs). Shows "No portal session" if no hand-off token. |
| `MyIssuesPage.tsx` | The reporter's own issue list with an "updates" indicator (`hasUpdates`). |
| `ReporterIssueDetailPage.tsx` | Detail: status/priority, description, attachments (scan-gated), and **REPORTER_VISIBLE updates only** (INTERNAL notes never returned by the server). Reporter can reply. |

## Data flow
- All calls go through `reporterApi` with `X-Handoff-Token`; the token was captured from `?handoff=`/postMessage into `sessionStorage` and stripped from the URL.
- The server ([[Module - Reporter]]) scopes every read to the token's reporter (ownership) — a reporter can only ever see their own issues.

## Gotchas / invariants
- The reporter surface is embedded/opened by a portal (or CIMP's own [[Module - Self-Support|Support button]]); it is useless without a valid hand-off token.
- INTERNAL comments and other reporters' data are enforced server-side, not here.

## Related
[[Frontend Overview]] · [[Module - Reporter]] · [[Module - Handoff]] · [[cimp-connect Package]]
