---
title: Plan 01 - Outbound Webhooks and Slack
tags: [cimp, plan, webhooks, integrations]
updated: 2026-07-10
effort: S (2-4 days)
status: planned
---
# Plan 01 — Outbound webhooks + Slack notifier
← [[Plan 00 - How to Execute These Plans]]

## Goal
When issue events happen, POST signed JSON to configured endpoint URLs
(per-platform or global), with a Slack-formatted variant. Turns CIMP into a hub
other systems can react to.

## Decisions (made — do not revisit)
- Delivery is **best-effort in-process** (timeout 5s, 3 retries with 2s/8s/30s
  backoff via `setTimeout`, fire-and-forget from an `@OnEvent` listener). A
  durable queue (Redis/BullMQ) is explicitly out of scope — note it in code.
- Signature: `X-CIMP-Signature: sha256=<hex HMAC-SHA256(secret, rawBody)>`
  (GitHub convention). `X-CIMP-Event: issue.created` header carries the event name.
- Two endpoint kinds: `GENERIC` (signed JSON) and `SLACK` (Slack incoming-webhook
  Block Kit body, no signature — Slack URLs are themselves the secret).
- **SSRF guard is mandatory**: only `https://` URLs; reject hostnames/IPs matching
  `localhost`, `127.*`, `10.*`, `192.168.*`, `172.16-31.*`, `169.254.*`, `[::1]`.
- Admin-only CRUD API; config UI is out of scope (use Swagger/curl for now).

## Data model
New entity `src/entities/webhook-endpoint.entity.ts`, table `webhook_endpoints`:
- `id` uuid PK; `platform` ManyToOne Platform nullable (`null` = all platforms),
  `onDelete: 'CASCADE'`; `kind` enum `WebhookKind` (GENERIC|SLACK — add to
  `src/common/enums.ts`); `url` varchar; `secret` varchar nullable (required for
  GENERIC — generate `crypto.randomBytes(32).toString('hex')` server-side on create,
  return once in the create response only); `events` jsonb (string[] of
  IssueEvents values; empty = all); `enabled` bool default true;
  `createdBy` uuid nullable; `createdAt`.
Export from `src/entities/index.ts`. Migration `AddWebhookEndpoints` in `src/migrations/`.

## Backend steps
1. `src/webhooks/webhooks.module.ts` — imports TypeOrmModule.forFeature([WebhookEndpoint, Issue, Platform]); register in `app.module.ts`.
2. `src/webhooks/webhooks.service.ts`:
   - `deliver(eventName: string, platformId: string, payload: object)`: load
     enabled endpoints where `platform IS NULL OR platform_id = :platformId`
     and (`events` empty or contains eventName); for each, build body and POST
     with global `fetch`, signature header for GENERIC, Slack blocks for SLACK;
     retries as decided; log failures with `Logger.warn` — NEVER throw.
   - `assertSafeUrl(url)` — the SSRF guard above; used on create/update AND
     before every send (DNS may change).
3. `src/webhooks/webhooks.listener.ts` — `@OnEvent` for each name in
   `IssueEvents` (CREATED, STATUS_CHANGED, PRIORITY_CHANGED, ASSIGNED,
   COMMENT_ADDED). Payload: `{ event, timestamp, platformKey, issue: { id,
   referenceNo, description: first 300 chars, status, priority }, change: <the
   event payload fields> }`. Load the issue with relations `platform` once.
   For COMMENT_ADDED include `reporterVisible` but NOT the comment body
   (bodies may hold internal info; decision: metadata only).
4. `src/webhooks/webhooks.controller.ts` — `@Controller('admin/webhooks')`,
   guards + `@Roles(Role.ADMIN)` exactly like `src/admin/admin.controller.ts`.
   CRUD: GET list, POST create (DTO below), PATCH `:id` (enabled/events/url),
   DELETE `:id`. POST returns the generated secret once.
5. DTO `src/webhooks/dto/webhook.dto.ts`: `url` @IsUrl({ protocols: ['https'] }),
   `kind` @IsEnum(WebhookKind), `platformId` @IsOptional() @IsUUID(),
   `events` @IsOptional() @IsArray() @IsIn(Object.values(IssueEvents), { each: true }).
6. Slack formatting: title line `[<platformKey>] <referenceNo> <event>` +
   context line with status/priority. Keep to one `blocks` section — simple.

## Tests
- `src/webhooks/webhooks.service.spec.ts`: mock global fetch. Cases: signs
  GENERIC correctly (recompute HMAC in test); filters by platform and event
  list; retries then gives up without throwing; `assertSafeUrl` rejects each
  private-range case and http://.
- e2e (`test/`): non-admin gets 403 on `/api/admin/webhooks`; admin CRUD roundtrip.

## Acceptance
- Create a GENERIC endpoint via Swagger pointing at https://webhook.site, file
  an issue via seeded portal → delivery arrives with valid signature.
- Create SLACK endpoint with a real Slack incoming webhook → message renders.
- Kill the target URL → API stays fast (listener is async), warnings logged.

## Gotchas
- Register the listener module AFTER EventEmitterModule is already global (it
  is — see `app.module.ts`); just import WebhooksModule.
- Don't `await` delivery inside the listener handler beyond the initial call —
  retries must not hold the event loop hostage; schedule with setTimeout.
- `events` jsonb column: use `{ type: 'jsonb', default: () => "'[]'" }`.
