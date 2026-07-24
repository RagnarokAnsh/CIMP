---
title: Module - Jira
tags: [cimp, backend, integrations, jira]
updated: 2026-07-06
---
# Module - Jira (`src/jira`)
← [[Backend Modules and API]] · [[CIMP - Home]]

**Purpose:** One-way outbound push of issues/attachments/status-echoes into a mapped Jira Cloud project (event-driven, never in the request path), plus an inbound shared-secret-gated webhook that pulls Jira status changes back into the local issue.

## Files
| File | Responsibility |
|---|---|
| `jira.module.ts` | Wires the module: imports `TypeOrmModule.forFeature([Issue, Attachment])`, registers `JiraWebhookController`, providers `JiraService`/`JiraListener`/`JiraInboundService`, **exports `JiraService`**. |
| `jira.service.ts` | Minimal Jira Cloud REST v3 client (Basic auth via email + API token). Create issue, add attachment, add comment. `isConfigured()` gate. |
| `jira.listener.ts` | `@OnEvent` listener that performs all outbound sync: create-on-`IssueCreated`, attachment push on `AttachmentsScanned`, status-comment echo on `StatusChanged`. Idempotency, retry, atomic attachment claim. |
| `jira-inbound.service.ts` | Applies inbound Jira webhook status changes to the linked local `Issue` inside a transaction + audit row. Deliberately does **not** emit `STATUS_CHANGED` (avoids a sync loop). |
| `jira-webhook.controller.ts` | `POST /api/integrations/jira/webhook` — unauthenticated by JWT, gated by constant-time shared-secret comparison of `X-Webhook-Token`. |
| `jira-inbound.service.spec.ts` · `jira.listener.spec.ts` | Unit specs. |

## Public surface
- **HTTP:** `POST /api/integrations/jira/webhook` — Swagger tag `integrations`. **No JWT/handoff guard**; instead gated inline by `secretsMatch(token, jira.webhookSecret)`. Returns `{ applied: boolean }`. Rejects with `403 ForbiddenException` if the secret is unconfigured, the header is missing, or the token mismatches.
- **Providers exported:** `JiraService` (consumed elsewhere by anything that pushes to Jira; the listener is internal).

## Key classes & logic

### `JiraService` (client)
- `isConfigured()` → true only when `jira.baseUrl` + `jira.email` + `jira.apiToken` are all set.
- `createIssue(platform, issue)` → `POST /rest/api/3/issue`; project = `platform.jiraProjectKey`, summary = `[<referenceNo>] <description>` with whitespace collapsed to single spaces and trimmed, then clamped to Jira's 255-char limit (Jira rejects newlines / over-long summaries), issuetype `Task`, priority mapped via `mapPriority`. Returns the Jira key (e.g. `SUP-123`); throws on non-ok or missing key.
- `addAttachment(jiraKey, {buffer, filename, contentType})` → `POST /rest/api/3/issue/:key/attachments` as multipart `FormData`, with header `X-Atlassian-Token: no-check`.
- `addComment(jiraKey, text)` → `POST /rest/api/3/issue/:key/comment`. Used for **status echoes** instead of workflow transitions (which need project-specific transition ids).
- `mapPriority`: CRITICAL→`Highest`, HIGH→`High`, LOW→`Low`, else `Medium`.
- `toAdf(text)`: wraps plain text in Atlassian Document Format (required for v3 rich-text fields); guards empty/whitespace-only input (Jira rejects an empty text node).
- `authHeader()`: `Basic base64(email:apiToken)`. `baseUrl()` strips trailing slash. All requests use `AbortSignal.timeout(15_000)` (15s `REQUEST_TIMEOUT_MS`).

### `JiraListener` (outbound, event-driven)
- `@OnEvent(IssueEvents.CREATED, {async:true}) onIssueCreated` — loads issue+platform; **skips** unless `platform.jiraEnabled && platform.jiraProjectKey` and `jira.isConfigured()`. **Idempotency guard**: returns early if `jiraIssueKey` set or `jiraSyncStatus === SYNCED`, or `=== PENDING` **and the claim is fresh** (`updatedAt` within a 15-min staleness window). A PENDING claim older than that is treated as abandoned (process died mid-create) and allowed to retry — previously a mid-flight crash wedged the issue at PENDING forever. Sets status `PENDING`, creates via `withRetry`, then sets `jiraIssueKey` + `SYNCED`, then `syncAttachments`. On failure sets `FAILED`.
- `@OnEvent(IssueEvents.ATTACHMENTS_SCANNED, {async:true}) onAttachmentsScanned` — after scanning finishes, pushes now-servable attachments if a `jiraIssueKey` exists (handles scanning completing after issue creation).
- `@OnEvent(IssueEvents.STATUS_CHANGED, {async:true}) onStatusChanged` — outbound status echo: adds a Jira comment `Status changed in the support platform: <from> → <to>.` Only for issues with a linked key. Inbound webhook updates never emit this event, so **no sync loop**.
- `syncAttachments(issueId, jiraKey)` — pushes each attachment whose `scanStatus ∈ {CLEAN, SKIPPED}` (`SERVABLE_SCAN`) and `jiraSynced=false`. **Atomic claim**: `update({id, jiraSynced:false}, {jiraSynced:true})`; skips if `affected===0` (another concurrent path already claimed it). Reads file bytes via `StorageService.read(storageKey)`, pushes via `withRetry`; on error **releases the claim** (`jiraSynced:false`) so a later retry can push it.
- `withRetry(fn)` — up to `MAX_ATTEMPTS=3`, backoff `attempt*500ms`.

### `JiraInboundService`
- `applyWebhook(payload)` — reads `payload.issue.key` and `payload.issue.fields.status.statusCategory.key`. Maps Jira's three stable category keys via `CATEGORY_TO_STATUS`: `new`→NEW, `indeterminate`→IN_PROGRESS, `done`→RESOLVED. Returns `{applied:false}` if key/category missing or category unmapped.
- Applies status write + audit row in **one `dataSource.transaction`**: re-reads the issue by `jiraIssueKey`, no-ops if not found or already at target. Sets `status`, then runs the **shared `applyStatusSideEffects(issue, target)`** ([[Module - Issues]]) — the same helper the local path uses, so an inbound CLOSED→IN_PROGRESS now clears `closedAt` and a reopen resets the SLA clock (`slaStartedAt`/`slaBreachedAt`), which the old ad-hoc `resolvedAt`-only line skipped (the L8 instant-rebreach bug on the Jira path). Records an audit entry (`actorType SYSTEM`, `action STATUS_CHANGED`, `metadata: {source:'jira-webhook', jiraKey}`). **Jira is authoritative** for inbound status — intentionally overrides local value and does not emit a domain event.

### `JiraWebhookController`
- `secretsMatch(a,b)` — SHA-256 hashes both then `timingSafeEqual`. Hashing first equalizes length so `timingSafeEqual` never throws on mismatched sizes and length isn't leaked. Constant-time to avoid timing side-channels on this unauthenticated endpoint.

## Guards & auth
- Outbound listener: no guards (background `@OnEvent`).
- Webhook: **no `JwtAuthGuard`/`HandoffGuard`** (Jira can't carry a staff token). Security is the shared-secret header `X-Webhook-Token` compared constant-time against `JIRA_WEBHOOK_SECRET`. Blank secret disables inbound sync (endpoint rejects everything). See [[Auth and Authorization]] · [[Security Audit and Hardening]].

## Dependencies (injected)
- `JiraService`: `ConfigService`.
- `JiraListener`: `Repository<Issue>`, `Repository<Attachment>`, `JiraService`, `StorageService` ([[Module - Storage and Scanning]]).
- `JiraInboundService`: `DataSource`, `AuditService` ([[Module - Audit, Events and Health]]).
- `JiraWebhookController`: `JiraInboundService`, `ConfigService`.

## Events (consumed)
Consumes from [[Domain Events and Issue Lifecycle]] (`src/events/issue-events.ts`): `IssueEvents.CREATED`, `IssueEvents.ATTACHMENTS_SCANNED`, `IssueEvents.STATUS_CHANGED`. **Emits none** (inbound path deliberately silent to prevent loops).

## Entities touched
- `Issue` — reads/writes `jiraIssueKey`, `jiraSyncStatus` (`JiraSyncStatus` enum: PENDING/SYNCED/FAILED), `status`, `resolvedAt`; reads `platform.jiraEnabled`, `platform.jiraProjectKey`.
- `Attachment` — reads `scanStatus`, `storageKey`, `filename`, `contentType`; writes `jiraSynced` (atomic claim flag).
- Audit rows via `AuditService`. See [[Data Model]].

## Config / Env
`jira.baseUrl` (`JIRA_BASE_URL`), `jira.email` (`JIRA_EMAIL`), `jira.apiToken` (`JIRA_API_TOKEN`), `jira.webhookSecret` (`JIRA_WEBHOOK_SECRET`). Outbound disabled unless the first three are set; inbound disabled unless the secret is set. See [[Configuration and Env]].

## Gotchas / invariants
- **One-way push semantics:** outbound uses **comments** for status echoes, not workflow transitions (avoids needing per-project transition ids).
- **No sync loop:** inbound `applyWebhook` never emits `STATUS_CHANGED`, so an inbound change cannot trigger an outbound echo.
- **Idempotent create:** the `jiraIssueKey`/`PENDING`/`SYNCED` guard prevents duplicate Jira issues from re-delivered events — but PENDING is only honoured while fresh (15-min window on `updatedAt`), so a crash mid-create self-heals on the next event instead of wedging forever.
- **Inbound status runs the shared side-effects helper** (`applyStatusSideEffects`), not an ad-hoc `resolvedAt` set — keeps Jira-driven reopens from instantly re-breaching SLA and leaves no stale `closedAt`.
- `withRetry` skips the backoff sleep after its final attempt (was sleeping 1.5s before throwing).
- **Attachment exactly-once:** atomic `UPDATE ... WHERE jira_synced=false` claim means each file is pushed once even when the create-path and scan-complete path run concurrently; failed pushes release the claim.
- Only `CLEAN`/`SKIPPED` attachments are pushed — `PENDING`/`INFECTED` are never sent (mirrors the platform's never-serve-unscanned rule).
- Webhook secret comparison is constant-time and disabled-by-default; a blank secret rejects all requests with 403.

## Related
[[Integrations]] · [[Domain Events and Issue Lifecycle]] · [[Module - Storage and Scanning]] · [[Module - Audit, Events and Health]] · [[Configuration and Env]] · [[Security Audit and Hardening]] · [[Data Model]] · [[Features - Shipped]] · [[Backend Modules and API]]
