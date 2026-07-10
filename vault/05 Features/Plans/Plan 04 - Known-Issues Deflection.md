---
title: Plan 04 - Known-Issues Deflection
tags: [cimp, plan, reporter, deflection]
updated: 2026-07-10
effort: M (1-2 weeks)
status: planned
depends: Plan 02 (merge), pairs with Plan 05 (same FTS reuse)
---
# Plan 04 — Known-issues deflection (before + inside the connected apps)
← [[Plan 00 - How to Execute These Plans]]

## Goal
Two deflection surfaces: (A) while a reporter types a new issue, show "this
looks already reported — subscribe instead"; (B) connected apps can render a
"known issues" banner fetched from CIMP, so users see acknowledged problems
before ever clicking Get Support.

## Decisions (made — do not revisit)
- **Privacy first:** reporters must never see other reporters' issue content.
  - Surface (A) returns ONLY: `status`, `createdAt`, `reportCount` (1 +
    duplicates), and a similarity score bucket. NO description, NO reference
    number, NO reporter info. The UI copy is "A similar issue is already being
    tracked (In progress, first reported 3 days ago, 4 reports) — [Notify me
    instead]".
  - Surface (B) is **opt-in per issue by staff**: new fields
    `issues.publicly_visible` bool default false + `issues.public_title`
    varchar(140) nullable. Staff explicitly publish an issue with a curated
    title. The public endpoint returns ONLY published issues' `public_title`,
    `status`, `updatedAt`.
- Subscribe = new `reporter_subscriptions` table (reporter ↔ issue), resolved
  notifications fan out to subscribers exactly like Plan 02 duplicates.
- Public endpoint is unauthenticated but platform-keyed and read-only:
  `GET /api/public/platforms/:key/known-issues`. Rate-limit it
  (`@Throttle` like login). CORS: allow GET from any origin for this route
  only (it's public data by definition) — do NOT widen global CORS.

## Data model
- Migration `AddDeflection`: `publicly_visible` bool NOT NULL default false and
  `public_title` varchar nullable on `issues` (+ entity fields);
  `reporter_subscriptions` table: `id` uuid, `issue_id` FK CASCADE,
  `reporter_id` FK CASCADE, unique (issue_id, reporter_id), `created_at`.

## Backend steps
1. Similar-search for reporters: `GET /api/reporter/issues/similar?q=` in
   `src/reporter/reporter.controller.ts` behind the same HandoffGuard/reporter
   auth as the existing reporter routes. Service: reuse the FTS candidate query
   from Plan 05's `findDuplicateCandidates` (extract it to a shared helper in
   `src/issues/` rather than duplicating), same platform only, statuses NEW/
   IN_PROGRESS/ON_HOLD/REOPENED, top 3, and map to the privacy-safe shape.
   `q` min length 15 (DTO @MinLength) to avoid noise.
2. Subscribe: `POST /api/reporter/issues/:id/subscribe` — validate the target
   issue belongs to the reporter's platform (404 otherwise); upsert
   subscription. `DELETE` to unsubscribe. The :id here is the CANONICAL issue
   id returned by similar-search — but we must not leak it... **Decision:**
   similar-search returns an opaque `subscribeToken` per result instead of the
   issue id: a JWT (JWT_SECRET, purpose 'subscribe', issueId inside, 30min
   expiry). Subscribe endpoint takes the token, verifies, subscribes. No id leak.
3. Fan-out: extend the Plan 02 resolution fan-out in
   `notifications.listener.ts` to also notify `reporter_subscriptions` rows
   (email "the issue you subscribed to was resolved"), then delete them.
4. Publish controls (staff): `PATCH /api/staff/issues/:id/publish`
   `{ publiclyVisible, publicTitle? }` — write roles + scope; validate title
   present when publishing. Audit event.
5. Public endpoint: new `src/public/public.module.ts` + controller;
   platform by key, ACTIVE only, else 404; select published issues (id NOT
   exposed — return `publicTitle`, `status`, `updatedAt`), order updatedAt
   desc, cap 10; `@Throttle({ default: { limit: 30, ttl: 60_000 } })`;
   set `Access-Control-Allow-Origin: *` for this controller only (small
   interceptor or @Header, verify preflight not needed for plain GET).

## Frontend steps
1. Reporter `NewIssuePage.tsx`: debounced (600ms) similar-search once
   description ≥ 15 chars; render results panel between description and submit:
   status badge + "first reported … · N reports" + "Notify me instead" button
   (calls subscribe with the token, then shows confirmation + optional
   "report anyway" continues the form). Dismissible.
2. Staff `IssueDetailPanel.tsx`: "Publish as known issue" toggle + title input
   (write-gated), badge when published.
3. SDK (`D:\cimp-connect`): new `<cimp-known-issues platform-key="cms" cimp-url="https://...">`
   element (same pattern as the support button — shadow DOM, unstyled,
   `::part(item)`): fetches the public endpoint, renders list or nothing when
   empty/errored (never breaks the host app). React twin `<KnownIssues />`.
   README section.

## Tests
- Unit: similar-search shape contains NO referenceNo/description (assert on
  keys); subscribeToken roundtrip; subscribe with expired/foreign-platform
  token → 401/404; publish requires title.
- e2e: public endpoint returns only published issues of an active platform;
  404 unknown key; throttle fires (fire 31 requests).
- Extend notifications spec: resolution notifies + clears subscriptions.

## Acceptance
Type a description similar to an existing open issue in the reporter form →
banner appears → subscribe → resolve the issue as staff → subscriber email
logged. Publish an issue → appears in `curl https://<cimp>/api/public/platforms/cms/known-issues`
and in the SDK banner in a test page.

## Gotchas
- Reuse the FTS helper — do not write a second tsquery variant that drifts.
- `search_vector` is NULL under dev synchronize (see [[Session Handoff]]):
  similar-search silently returns [] in dev unless the migration ran — use the
  same ILIKE fallback as Plan 05, or document dev behavior in the plan note.
- The public controller must NOT import anything auth-guarded by default;
  double-check no global guard applies (guards here are per-controller).
