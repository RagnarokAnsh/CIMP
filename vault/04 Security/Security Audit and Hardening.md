---
title: Security Audit and Hardening
tags: [cimp, security, owasp]
updated: 2026-07-06
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

## Still open (scoped in SECURITY_AUDIT.md)
Decision-gated: Redis throttler store (M8), disk-streaming uploads (M6). Plus lower-priority polish (M7 SSE cap, M11 audit CASCADE→SET NULL, M12 TOCTOU, remaining Lows) and last 3 Wave-4 tests.

Related: [[Auth and Authorization]] · [[Session Handoff]]
