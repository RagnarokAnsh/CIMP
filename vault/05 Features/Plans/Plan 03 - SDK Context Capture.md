---
title: Plan 03 - SDK Context Capture
tags: [cimp, plan, cimp-connect, diagnostics]
updated: 2026-07-10
effort: M (1-2 weeks, spans two repos)
status: planned
---
# Plan 03 — SDK context capture (pre-diagnosed reports)
← [[Plan 00 - How to Execute These Plans]] · [[cimp-connect Package]]

## Goal
Issues filed via cimp-connect arrive with environment + recent console errors +
failed network requests + route breadcrumbs auto-attached. Staff see a
"Diagnostics" panel; "cannot reproduce" round-trips disappear.

## Decisions (made — do not revisit)
- **Transport = URL fragment.** The SDK appends
  `#cimpctx=<base64url(gzip(JSON))>` to the handoff URL before `window.open`.
  Fragments are never sent to any server (no logs, no CORS, no storage); the
  CIMP reporter form reads and strips it client-side. Identity stays in the
  signed `?handoff=` query token; context is UNSIGNED, UNTRUSTED reporter input.
- Compression: browser-native `CompressionStream('gzip')`; if unavailable,
  fall back to uncompressed base64url. Hard cap 48KB encoded; if over, drop
  arrays largest-first (breadcrumbs → failedRequests → consoleErrors) until under.
- **Never capture**: request/response bodies, request headers, cookies,
  localStorage. URLs are redacted with
  `/([?&](token|key|secret|password|auth[^=&]*)=)[^&]*/gi → '$1[redacted]'`.
- Fetch-mode only (link mode 302s server-side; can't carry a fragment). The
  reporter always sees a chip showing diagnostics are attached and can remove
  them before submitting (consent).
- Screenshots: OUT of scope for v1. Leave a `captureScreenshot?: () => Promise<Blob>`
  config hook typed but unused; v2 uploads it as a normal attachment (existing
  scanning pipeline applies).
- Server stores raw JSON in `issues.context` jsonb, re-clamped server-side
  (defense in depth): max 25 consoleErrors/15 failedRequests/15 breadcrumbs,
  strings 1000 chars, total 64KB else 400.

## Part A — cimp-connect repo (`D:\cimp-connect`)
1. `src/diagnostics.ts` (new, exported from `src/index.ts`):
   - `initCimpDiagnostics(config?: { appVersion?: string; release?: string; extra?: () => Record<string, unknown> })`
     — idempotent; SSR-safe (`typeof window === 'undefined'` → no-op). Installs:
     `window.addEventListener('error')`, `('unhandledrejection')`; wraps
     `console.error` (call original first); wraps `window.fetch` recording only
     failures (`!res.ok` or thrown): `{ method, url: redact(url), status, ts }`;
     wraps `XMLHttpRequest.prototype.open/send` similarly; wraps
     `history.pushState/replaceState` + `popstate` for breadcrumb paths.
     Ring buffers: consoleErrors 20 × 500 chars, failedRequests 10,
     breadcrumbs 10. Store on a module-level singleton.
   - `collectContext(): CimpContext` — snapshot: `{ sdkVersion, appVersion,
     release, url: location.pathname, userAgent, language, timezone
     (Intl.DateTimeFormat().resolvedOptions().timeZone), viewport {w,h},
     consoleErrors, failedRequests, breadcrumbs, extra }`.
   - `encodeContextFragment(ctx): Promise<string>` — gzip+base64url+cap logic.
2. Wire into both buttons (fetch mode only): after receiving `{ url }`, if
   diagnostics initialized, `url += '#cimpctx=' + await encodeContextFragment(collectContext())`.
   Element: same in `openViaFetch()` in `src/element/index.ts`. React: in the
   fetch onClick in `src/react/index.tsx`.
3. README: new "Diagnostics" section — init snippet, privacy list (what is and
   is not captured), fetch-mode requirement. Bump minor version; `npm run build`.

## Part B — CIMP repo
1. Enum-free: no enum changes. Entity: `Issue` add
   `@Column({ type: 'jsonb', nullable: true }) context: Record<string, unknown> | null;`
   Migration `AddIssueContext` (jsonb nullable, no index).
2. `src/reporter/dto/create-issue.dto.ts`: add
   `@IsOptional() @IsObject() context?: Record<string, unknown>;`
   (REQUIRED because of global forbidNonWhitelisted — without this the whole
   create request 400s when context is present).
3. `src/reporter/reporter.service.ts` create path: `sanitizeContext(raw)` →
   clamps per Decisions, returns null if not a plain object; save on the issue.
   Unit-test the clamp directly.
4. Staff issue detail response: include `context`. Reporter detail response:
   include it too (it's their own data). Run `gen:api` after.
5. Frontend reporter `NewIssuePage.tsx`:
   - On mount: parse `location.hash` for `cimpctx`; decode
     (`DecompressionStream('gzip')`, with non-gzip fallback); store in state;
     `history.replaceState(null, '', location.pathname + location.search)` to
     strip the fragment (do this BEFORE the existing handoff-token strip logic
     runs, or integrate with it — read that code first).
   - UI chip above submit: "Diagnostics attached ✓ · view · remove". "view"
     opens a dialog rendering the JSON sections read-only.
   - Include `context` in the create POST body only if still attached.
6. Frontend staff `IssueDetailPanel.tsx`: "Diagnostics" collapsible (render
   only when `issue.context`): environment key/value table; console errors as
   monospace list; failed requests table (method, url, status); breadcrumbs
   list; "Copy JSON" button. Plain text rendering only (React default escaping
   — never dangerouslySetInnerHTML).

## Tests
- cimp-connect: none automated yet (no test harness) — manual checklist in README.
- CIMP unit: `reporter.service` sanitizeContext spec — oversize arrays clamped,
  non-object → null, >64KB → BadRequestException.
- CIMP e2e (`test/`, follow the intake e2e): create issue with context →
  stored and returned to staff; create with 100KB context → 400; create with
  `context: "string"` → 400 (DTO).

## Acceptance
In FAFICS or CleanMilk dev: `initCimpDiagnostics({ appVersion: '1.0.0' })`,
throw a console error, fail a fetch, click Get Support → reporter form shows
the chip → submit → staff panel shows the error and failed request. Verify the
fragment never appears in CIMP's nginx/access logs.

## Gotchas
- `CompressionStream` needs a stream roundtrip:
  `new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()`.
- base64url = base64 with `+→-`, `/→_`, strip `=`.
- The reporter form already strips `?handoff=` from the address bar — coordinate
  so both query and fragment are stripped in one replaceState.
- jsonb + class-validator: `@IsObject()` rejects arrays — that's intended.
