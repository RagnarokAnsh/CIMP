---
title: Plan 06 - CSAT and Close the Loop
tags: [cimp, plan, csat, reporter]
updated: 2026-07-10
effort: S-M (3-5 days)
status: planned
---
# Plan 06 — CSAT + close-the-loop
← [[Plan 00 - How to Execute These Plans]]

## Goal
When an issue resolves, the reporter gets a one-click 👍/👎 (in the resolution
email and on their issue page). Scores roll up per platform. 👎 invites a
comment and flags the issue for staff attention.

## Decisions
- One response per issue (upsert; latest wins). Score stored as smallint
  (1 = positive, 0 = negative) + optional comment (≤ 500 chars).
- Email links are one-click GETs with a signed token: JWT (existing
  `JWT_SECRET`, claims `{ purpose: 'csat', issueId, reporterId }`, 7d expiry).
  GET must be idempotent and safe: the link lands on a tiny reporter-portal
  page that confirms + offers the comment box — the GET itself does not write;
  the page POSTs. (Mail scanners prefetch links — never mutate on GET.)
- In-portal: the reporter issue detail page shows the widget whenever status is
  RESOLVED/CLOSED and no response exists.
- 👎 does NOT reopen automatically; it adds an internal system comment
  "Reporter rated the resolution negatively: <comment>" and (if Plan 01 is
  merged) fires a webhook event `csat.received`.

## Data model
`src/entities/csat-response.entity.ts`, table `csat_responses`: `id` uuid PK;
`issue` OneToOne→Issue unique CASCADE; `reporter` ManyToOne→Reporter;
`score` smallint; `comment` varchar(500) nullable; `createdAt`, `updatedAt`.
Migration `AddCsatResponses`.

## Backend steps
1. `src/csat/csat.module.ts` (+ app.module), service + controller.
2. Token mint: in the RESOLVED branch of `notifications.listener.ts`, mint the
   csat JWT and add two links to the resolution email (and to Plan 02/04
   fan-out emails): `<FRONTEND_URL>/reporter/csat?token=...&score=up|down`.
   (Find how the frontend base URL is configured for existing email links and
   reuse it — read `mail.service.ts` first.)
3. Endpoint: `POST /api/reporter/csat` body `{ token, score: 'up'|'down',
   comment? }` — verify JWT purpose/expiry (401), load issue+reporter match
   (404), status is RESOLVED or CLOSED (409), upsert response, add the internal
   comment on down-votes, emit `csat.received` event. Also
   `GET /api/reporter/issues/:id/csat` for the in-portal widget state under
   existing reporter auth.
4. Aggregates: extend the dashboard service (`src/dashboard/`) with per-platform
   `csatPositiveRate` + `csatCount` (simple AVG over csat_responses joined via
   issues.platform_id, scoped like the other dashboard numbers).

## Frontend steps
1. New tiny route `frontend/src` reporter side: `/reporter/csat` page — reads
   token+score from query, shows "Thanks — confirm?" button (and comment box
   when score=down), POSTs, shows done state. No auth needed beyond the token.
2. `ReporterIssueDetailPage.tsx`: 👍/👎 widget when eligible (uses reporter
   session, calls same POST with a token fetched from the GET state endpoint —
   or simpler: allow the POST under reporter session with issueId instead of
   token; decision: support BOTH auth shapes in one endpoint, token OR session).
3. Staff: CSAT badge on issue detail when a response exists (score + comment);
   dashboard tile "CSAT (30d)" per platform.

## Tests
- Unit: token purpose/expiry rejection; upsert overwrites; down-vote creates
  internal comment; wrong-status 409.
- e2e: full roundtrip with seeded reporter; token for issue A cannot rate issue B.

## Gotchas
- Never mutate on GET (mail scanners). The GET page + POST confirm pattern is
  deliberate.
- Reporter emails go through the existing mail seam — SMTP blank logs instead
  of sending; acceptance-test via logs.
