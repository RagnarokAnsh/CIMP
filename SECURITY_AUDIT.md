# CIMP Production-Readiness & Security Audit

**Date:** 2026-07-04 · **Scope:** `dev` working tree, ~6,600 LOC backend + 54 frontend files
**Method:** 11-dimension multi-agent review (OWASP Top 10 + correctness/authz/QA), findings adversarially verified where possible, top items hand-verified against source.

**Verdict:** Not production-ready as-is. Strong architecture (centralized authz, optimistic locking, event decoupling, scan-gating, fail-closed config *design*), but one hard boot-blocker, several ways the security layer silently turns *off*, and thin coverage on the trust boundaries. All fixable without rewrites.

| Severity | Count |
|---|---|
| 🔴 Critical | 2 |
| 🟠 High | 17 |
| 🟡 Medium | 20 |
| ⚪ Low | 18 |

> ⚠️ **Deploy note:** Wave 0 makes the config *fail closed*. After merging, a production deploy MUST set `NODE_ENV=production`, `DB_SYNCHRONIZE=false`, explicit `CORS_ORIGINS`, a ≥32-char `JWT_SECRET`, and either `SCAN_DRIVER=clamav` or `ALLOW_UNSCANNED_UPLOADS=true` — otherwise the app will (correctly) refuse to boot. This is intended.

---

## Remediation waves

| Wave | Theme | Status |
|---|---|---|
| **0** | Launch blockers (won't boot / silently insecure) | ✅ **DONE** (this branch) |
| **1** | Auth & tenant isolation | ✅ **Done** — H1, H2, H8, M2, M4, M1, L9, H11 done; **L1 = keep** (focal points may assign/prioritize; OD-09 governs status only — product decision) |
| 2 | Availability / DoS | ◐ H9 (export cap) + H10 (FTS GIN index) done; M6 (disk-streaming upload), M7/M8/L12 planned |
| **3** | Observability & hardening | ◐ **Mostly done** — M3, M10, M13, L16, L5, L4, L10, L11, M14, H12 done |
| 4 | Tests (QA) | ◐ handoff, attachment scan-gating, reporter INTERNAL-filter + cross-access done |

### ✅ Wave 0 — completed on `hardening/security-audit`
1. **uuid-ossp extension** added to the baseline migration → prod migrate no longer fails on clean Postgres. `src/migrations/1718500000000-Baseline.ts`
2. **Fail-closed `NODE_ENV`** — new `src/config/is-production.ts`; unset/typo now treated as production; `@IsIn` rejects invalid values. `env.validation.ts`, `main.ts`
3. **`JWT_SECRET` ≥32-char** production guard. `env.validation.ts`
4. **Unscanned-uploads guard** — `SCAN_DRIVER=clamav` required in prod unless `ALLOW_UNSCANNED_UPLOADS=true`. `env.validation.ts`
5. **Issue indexes** — new `1718700000000-AddIssueIndexes` migration + `@Index` decorators on the Issue entity.
6. **Critical test added** — `src/handoff/handoff.service.spec.ts` (10 cases covering the reporter auth trust boundary).

### ◐ Wave 1 — done so far
- **H1 + M4 — session revocation.** `staff_users.token_version` (new column + migration); the value is embedded in the login token and re-checked on every request; a disabled account or a password reset (which bumps the version) now invalidates live tokens immediately. `auth.service.ts`, `local-auth.service.ts`, `admin.service.ts`, `staff-user.entity.ts`.
- **H2 — hand-off token expiry.** `verify()` now enforces a 15-min `maxAge` and rejects tokens without `exp`. `handoff.service.ts` (+2 spec cases).
- **M2 — existence oracle closed.** Out-of-scope issue routes return 404 (identical to not-found), keeping a truthful 403 only for in-scope/wrong-role. `platform-access.guard.ts` (+e2e).

> ⚠️ **Deploy note (Wave 1):** the token-version check invalidates all *existing* staff sessions on deploy — everyone re-logs in once. Intended for a security release.

### ◐ Wave 1 (rest) + Wave 3 — done in this batch
- **M1 — cross-tenant `@mention` leak** (+ its SSE twin): mentions are filtered to the issue's platform members at the source (`CommentsService.addComment`), so a non-member id never reaches the bell or the SSE `targetStaffIds`.
- **L9 — `editComment` scope recheck**: authorship is no longer sufficient; the editor must still hold a role on the comment's platform.
- **H11 — FK NOT-NULL** migration (`TightenFkNullability`) for `issues.platform_id/reporter_id`, `comments.issue_id`, `attachments.issue_id`.
- **H12** login audit logging (success/failure/disabled); **M10** 401/403 denial logging; **L16** non-Error throws logged; **M3** optimistic-lock mismatch → 409 (not 500); **M13** Jira webhook secret now `timingSafeEqual`; **L5** audit `from/to` ISO8601; **L4** LIKE metacharacters escaped; **L10** password min 12; **L11** seeder writes the handoff secret to a 0600 file instead of stdout; **M14** handoff secret floor raised to 32.
- **L1** (focal-point assign/priority vs OD-09): left as a **product decision** — focal points are the triage role, so gating assignment/priority behind the status flag may be undesirable. Needs your call.

---

## 🔴 Critical

| ID | Title | File:Line | Fix |
|---|---|---|---|
| C1 | Baseline migration never creates `uuid-ossp` → prod `migration:run` fails, app can't boot | `migrations/1718500000000-Baseline.ts:114` | ✅ `CREATE EXTENSION IF NOT EXISTS` |
| C2 | `HandoffService.verify` (reporter auth) had zero unit coverage — alg-pinning/expiry/inactive-platform untested | `handoff/handoff.service.ts:20` | ✅ spec added |

## 🟠 High

| ID | Title | File:Line | Fix |
|---|---|---|---|
| H1 | Disabled/reset staff keep access until token expiry (no status recheck per request) | `auth/auth.service.ts:18` | Reject non-ACTIVE in `upsertFromClaims`; add `tokenVersion` |
| H2 | Hand-off token accepted forever — `verify` has no `maxAge`; `exp` optional | `handoff/handoff.service.ts:37` | Pass `maxAge`, require `exp` |
| H3 | `JWT_SECRET` presence-only guard → weak key → admin forgery | `config/env.validation.ts:76` | ✅ ≥32-char guard |
| H4 | Prod guards downgrade to warnings on unset/typo `NODE_ENV` | `config/env.validation.ts:56` | ✅ fail-closed helper |
| H5 | Attachment MIME trusted from client header, never sniffed, echoed as response Content-Type | `reporter/reporter.service.ts:79` | Magic-byte sniff; `nosniff`; Multer fileFilter |
| H6 | No-op scanner serves files unscanned by default in prod (warn-only) | `config/env.validation.ts:91` | ✅ fail-closed + override |
| H7 | No indexes on hot issue columns → full scans on list/dashboard/SSE | `migrations/…Baseline.ts:178` | ✅ index migration + entity `@Index` |
| H8 | Staff JWT in SSE URL `?access_token=` → leaks to proxy/APM logs & history | `frontend/src/lib/realtime.ts:23`, `realtime/sse-auth.guard.ts:18` | Short-lived opaque SSE ticket |
| H9 | CSV export loads entire scoped table into memory, no cap → OOM | `issues/issues.service.ts:78` | Stream / hard `LIMIT` |
| H10 | Keyword search recomputes `to_tsvector` per row, never uses GIN index → CPU DoS | `issues/issues.service.ts:458` | Query stored `search_vector` |
| H11 | FK columns nullable in migration but NOT-NULL in entities → prod/dev drift, orphans, 500s | `migrations/…Baseline.ts:182` | Add NOT NULL + migration-drift CI check |
| H12 | Auth events (login success/failure) never audited or logged (A09) | `auth/local-auth.service.ts:36` | Audit LOGIN_SUCCEEDED/FAILED + IP |

## 🟡 Medium

| ID | Title | File:Line | Fix |
|---|---|---|---|
| M1 | Cross-tenant `@mention` — `mentionStaffIds` unvalidated vs platform → notification + SSE leak | `notifications/notifications.service.ts:131`, `realtime/realtime.controller.ts:33` | Intersect mentions with platform members |
| M2 | 404-vs-403 existence oracle on issue-scoped routes | `authz/platform-access.guard.ts:46` | Return 404 for both |
| M3 | Concurrent version mismatch → 500 not 409 | `issues/issues.service.ts:523`, `common/filters/http-exception.filter.ts:35` | Map `OptimisticLockVersionMismatchError` → ConflictException |
| M4 | Password reset does not invalidate existing tokens | `admin/admin.service.ts:150` | `tokenVersion` bump (pairs with H1) |
| M5 | Reporter-uploaded "PDF" rendered in same-origin iframe | `frontend/src/components/AttachmentPreview.tsx:64` | Sandbox iframe + separate origin + sniff |
| M6 | Intake buffers 5×10 MB in heap, no aggregate cap | `reporter/reporter.controller.ts:29` | Stream to disk/S3; aggregate cap |
| M7 | SSE: no per-user connection cap, throttle-exempt | `realtime/realtime.controller.ts:17` | Per-user cap + connection throttle |
| M8 | In-memory rate limiting → limits multiply per instance, reset on deploy | `app.module.ts:45` | Shared (Redis) ThrottlerStorage |
| M9 | Reporter hand-off token in `?handoff=` URL (Referer/history) | `frontend/src/staff/SupportButton.tsx:22` | postMessage/POST delivery + Referrer-Policy |
| M10 | 401/403 denials never logged | `common/filters/http-exception.filter.ts:35` | Warn-log security-relevant HttpExceptions |
| M11 | `audit_events.issue_id` ON DELETE CASCADE destroys "immutable" trail | `entities/audit-event.entity.ts:13` | ON DELETE SET NULL |
| M12 | Optimistic-lock read outside the write transaction (TOCTOU) + skippable version | `issues/issues.service.ts:235` | Re-load in tx; require `version` |
| M13 | Jira webhook secret compared non-constant-time | `jira/jira-webhook.controller.ts:24` | `crypto.timingSafeEqual` |
| M14 | Per-portal handoff secret floor only 16 chars, caller-overridable | `admin/dto/create-platform.dto.ts:40` | ≥32 chars or server-generate only |
| M15 | Reference-number 32-bit + over-broad 23505 retry | `reporter/reporter.service.ts:122` | Full-UUID ref; narrow retry to the ref constraint |
| M16 | Reporter INTERNAL-comment filter untested | `reporter/reporter.service.ts:225` | Unit test (Wave 4) |
| M17 | Attachment scan-gating untested | `issues/attachments.service.ts:40` | Unit test (Wave 4) |
| M18 | Reporter cross-access IDOR untested | `reporter/reporter.service.ts:217` | Unit + e2e (Wave 4) |
| M19 | `bulkUpdate` scoping/OD-09 untested | `issues/issues.service.ts:384` | Unit test (Wave 4) |
| M20 | Optimistic-lock 409 behavior untested | `issues/issues.service.ts:523` | Unit test (Wave 4) |

## ⚪ Low

| ID | Title | File:Line |
|---|---|---|
| L1 | Focal points can reassign/reprioritize despite OD-09 status gate | `issues/issues.service.ts:348` |
| L2 | `version` optional in apply* cores (latent stale-write bypass) | `issues/issues.service.ts:523` |
| L3 | bcrypt cost hardcoded 10, not configurable | `auth/local-auth.service.ts:33` |
| L4 | Unescaped LIKE wildcards in reference search | `issues/issues.service.ts:487` |
| L5 | Audit `from/to` `@IsString` (not ISO8601) → 500 on bad date | `admin/dto/audit-query.dto.ts:27` |
| L6 | PENDING attachments never re-scanned after transient failure | `scanning/scanning.listener.ts:39` |
| L7 | Bulk update non-atomic, opaque skip reasons | `issues/issues.service.ts:401` |
| L8 | Reopened issue instantly SLA-breached (clock from original createdAt) | `issues/sla.ts:38` |
| L9 | `editComment` skips platform-access recheck | `comments/comments.service.ts:91` |
| L10 | 8-char password min, no complexity/denylist | `admin/dto/set-password.dto.ts:7` |
| L11 | `seed-prod` prints handoff secret to stdout | `scripts/seed-prod.ts:67` |
| L12 | Reporter "My issues" list unbounded | `reporter/reporter.service.ts:189` |
| L13 | postMessage handoff trusts misconfigured/empty origins; no token shape check | `frontend/src/api/handoff.ts:33` |
| L14 | Staff token in sessionStorage (XSS-readable) | `frontend/src/staff/local-auth.tsx:20` |
| L15 | Platform delete cascade incoherence (reporter CASCADE vs issue RESTRICT) | `entities/reporter.entity.ts:18` |
| L16 | Non-Error throws logged nowhere | `common/filters/http-exception.filter.ts:35` |
| L17 | PlatformAccessGuard no-id/admin branch + empty-grants untested | `authz/platform-access.guard.ts:53` |
| L18 | CSV-injection test covers only `=`/quotes, not `+ - @ tab CR` | `issues/issues.csv.ts:11` |

---

## Wave 4 — test plan (priority order)
1. ✅ `handoff.service.spec.ts` — reporter trust boundary (10 cases).
2. ✅ `attachments.service.spec.ts` — INFECTED/PENDING → 403, `storage.read` never called, + scope 403/404.
3. ✅ `reporter.visibility.spec.ts` — INTERNAL notes hidden; another reporter's issue → 404 (ownership scoping).
4. ⬜ `bulkUpdate` scoping + OD-09 gate; optimistic-lock 409 behavior; PlatformAccessGuard no-id/admin branch; full CSV-injection char class.
5. ⬜ **CI gate:** `migration:generate` must produce an empty diff (catches entity/migration drift, H11).
6. ⬜ Reporter cross-access **e2e** (two portals) to complement the unit test.

## Feature roadmap (make it more like JIRA)
_2FA deferred by request._
1. ✅ **Issue links** (blocks/relates/duplicates) — backend + tests + **UI** (issue detail panel). Sub-tasks next.
2. ✅ **Labels** per platform — backend + tests + **UI** (label picker + create). Components/custom-fields next.
3. **Automation rules** ("when status→X, assign/notify") on the existing domain-event bus.
4. **Boards: swimlanes + WIP limits** (Kanban + bulk ops already exist).
5. **SLA policies with escalations + business hours** (SLA compute exists).
6. **JQL-like saved filters** (saved-views exist).
7. **Email-to-issue intake** + **scoped API/integration tokens** (currently only session JWT).
8. ✅ **Watchers** — backend + notification integration + **UI** (watch toggle). Activity feed + @mention autocomplete next.

> Issue links, labels, and watchers are now usable end-to-end in the staff issue detail panel (`IssueExtras.tsx`).
