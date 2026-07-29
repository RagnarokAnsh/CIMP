---
title: Security Audit and Hardening
tags: [cimp, security, owasp]
updated: 2026-07-28
---
# Security Audit and Hardening
← [[CIMP - Home]]

Full tracker: **`SECURITY_AUDIT.md`** in the repo (all 57 findings, per-wave status). This is the crisp summary.

## The audit
Multi-agent OWASP-aligned review across 11 dimensions → **57 findings** (2 Critical, 17 High, 20 Medium, 18 Low), verified. ~**42 fixed** on branch `dev` (was `hardening/security-audit`). Every Critical + launch-blocker + most Highs done, with tests. 71 unit + 8 e2e green.

## Fixed (by theme)
- **Boot/config (Wave 0):** `uuid-ossp` extension in baseline migration (prod migrate was failing); **fail-closed `NODE_ENV`**; `JWT_SECRET` ≥32 guard; unscanned-uploads guard; DB indexes on hot columns. → [[Configuration and Env]].
- **Auth/tenant (Wave 1 + H8):** session revocation (`tokenVersion` + status recheck each request); hand-off token `maxAge` + required `exp`; **existence oracle closed** (out-of-scope → 404); cross-tenant `@mention` leak fixed (mentions scoped to platform members); `editComment` platform recheck; **SSE ticket auth** (no session JWT in URL); FK NOT-NULL migration.
- **Uploads (H5/M5):** magic-byte content sniffing (not client MIME), `X-Content-Type-Options: nosniff`, sandboxed PDF iframe.
- **Availability (Wave 2):** CSV export cap (50k), **FTS uses the GIN `search_vector` index** (was full-scan tokenizing per row).
- **Observability/hardening (Wave 3):** login/401-403 audit logging; optimistic-lock → 409 (not 500); Jira webhook `timingSafeEqual`; password min 12; ISO8601 audit filters; LIKE-metachar escaping; handoff-secret floor 32; seed secret to 0600 file not stdout.
- **Tests (Wave 4):** `handoff.service.spec` (auth boundary), attachment scan-gating, reporter INTERNAL-comment hiding + cross-access IDOR.

## Decided, not changed
- **L1** (focal-point assign/priority vs OD-09) = **keep** ([[Decisions and Glossary]]).

## ✅ 2026-07-28 (3) — second audit pass (5 agents): 25 findings, zero critical/high, all fixed
The per-controller IDOR sweep that the failed run never reached now has an answer: ~80 routes across **31** controllers, **one low finding** (the staff attachment download's 403-vs-404 existence oracle, now 404 both ways). Every nested-resource load joins back to its parent, no mutation is authorized with `scopedPlatformIds`, no route escapes a guard, and `STAFF_READ_ROLES` gates only reads.

Security-relevant fixes from that pass:
- **Staff email enumeration via login timing.** The anti-timing dummy bcrypt hash was 59 chars (valid is 60), so bcryptjs short-circuited and the unknown-email path returned in **0.00 ms** against **83 ms** for a known email — a binary oracle, and the precise failure the defence was written to prevent. Fixed with a valid constant + a spec pinning both the format and that a compare still costs real work.
- **SSE: no connection cap** (the route skips the throttler, so nothing bounded it — any staff principal could pin sockets, each costing a re-auth query every 25 s) and **no `tokenVersion` re-check**, so a password reset — the forced-logout lever — did not disconnect anyone already streaming. Both closed; the cap is per-process, same Redis decision as M8.
- **API-token mint/revoke now audited** (the only credential operation that wasn't).
- **Partial upload failures orphaned blobs** in storage; cleanup now runs for the writes that succeeded.

## ✅ 2026-07-28 (2) — the Critical below is CLOSED, and the proposed mitigation was wrong
Fixed by removing the vulnerable parser from the request path, **not** by a timeout: the PoC's 1-second heartbeat never fires, so the hang is *synchronous* and no `Promise.race` can rescue it — that mitigation would have shipped a still-vulnerable API while looking like a fix. `src/common/magic-bytes.ts` now checks the four accepted signatures itself, `file-type` is uninstalled, and `magic-bytes.spec.ts` pins the 118-byte ASF payload (returns `null` in <1 ms). `@nestjs/common` still vendors `file-type@20.4.1` transitively, but it is reachable only through `FileTypeValidator`/`ParseFilePipe`, which this codebase never uses.

Also closed in that batch: the three fail-**open** env flags (`src/common/env-flag.ts` now throws on an uninterpretable value and `env.validation.ts` checks all three at boot), the servable-scan constant (one `SERVABLE_SCAN_STATUSES` in `common/constants.ts`), and the reporter query-cache leak on hand-off token swap.

**New, found while verifying (pre-existing):** staff requests to `/staff/me` and `/staff/notifications` were sent with **no `Authorization` header** because Vite served `api/client.ts` as two module instances, giving two copies of the module-level `staffTokenGetter` — the components holding the unregistered copy 401'd while siblings succeeded in the same tick. Symptom: no `me`, so the admin self-lockout guard never armed in the UI (the server still refuses). Fixed by resolving the token from `sessionStorage` as a fallback, which cannot desync across instances.

## 🔴 2026-07-28 — new Critical, now FIXED (see above) — was a regression in dependency posture, not in our code
**Remote DoS via reporter attachment upload.** `src/reporter/reporter.service.ts:64` sniffs uploads with `fromBuffer` from **`file-type` 16.5.4** — inside the vulnerable range for GHSA-5v7r-6r5c-r473 (ASF-parser infinite loop). **Verified with a working PoC against the installed copy:** a 118-byte crafted ASF header hangs `fromBuffer` indefinitely, and a 1-second heartbeat timer never fires once — the event loop is blocked **synchronously**. With single-threaded Node and no request timeout anywhere in `main.ts`, one request downs the entire API for every tenant, staff and reporter alike.

Two things make this worse than it looks: the `ALLOWED_MIME_TYPES` allowlist gives **no** protection, because `fromBuffer` parses the buffer to *determine* the type and the allowlist check on line 65 only runs on its return value — the hang happens strictly first; and the 10/min throttle is irrelevant because one request is enough. This sits on the reporter intake path, our lowest-trust surface (hand-off token only). **Mitigate now** with a `Promise.race` timeout around the sniff; the real fix is `file-type` 22.x (semver-major, ESM/async-iterator API — the call site needs rework).

**Dependency posture has drifted** from the recorded "18 backend / 7 frontend, mostly build-time tooling" to **31 backend (10 high) / 12 frontend (9 high)**, with several now *runtime*: `nodemailer` 6.10.1 (SMTP command injection via CRLF in transport name, CRLF `List-*` header injection, improper TLS validation in OAuth2 token fetch), `multer` 2.0.2 (5 DoS, same upload path), `react-router-dom` (open redirect → XSS).

Other open findings from that pass (Medium and below) — servable-scan constant defined 3×, reporter query cache not cleared on hand-off token swap, placeholder-only labels on filter controls, per-process webhook mute state, and three fail-**open** env flags outside `env.validation.ts` — are itemised in the Changelog (2026-07-28). That pass also **re-verified as clean**: JQL/ORDER BY/tsquery injection, hand-off JWT verification, attachment scan-gating both sides, internal-comment isolation, and webhook SSRF.

> Coverage caveat: the 10-agent audit workflow died on the session usage limit, so per-controller IDOR sweep, API-token scope enforcement and SSE authorization were **not** re-covered in this pass.

## Still open (scoped in SECURITY_AUDIT.md)
Decision-gated: Redis throttler store (M8), disk-streaming uploads (M6). Plus lower-priority polish (M7 SSE cap, M11 audit CASCADE→SET NULL, M12 TOCTOU, remaining Lows) and last 3 Wave-4 tests.

Related: [[Auth and Authorization]] · [[Session Handoff]]
