---
title: Configuration and Env
tags: [cimp, config, ops, security]
updated: 2026-07-13
---
# Configuration and Env
← [[CIMP - Home]]

`.env` (copy from `.env.example`). Loaded via `ConfigModule` with a Joi schema + a **fail-closed validator** (`src/config/env.validation.ts` + `is-production.ts`).

## Fail-closed rule (critical for prod)
`is-production.ts`: **any `NODE_ENV` that is not exactly `development`/`test` is treated as production** — so an unset or misspelled value can never silently disable hardening. In production the app **refuses to boot** unless:
- `DB_SYNCHRONIZE=false` (use migrations, not auto-sync)
- `CORS_ORIGINS` is explicit (not `*`/unset)
- `JWT_SECRET` is set **and ≥32 chars** (weak key = forgeable admin token)
- `SCAN_DRIVER=clamav` **or** `ALLOW_UNSCANNED_UPLOADS=true` (conscious opt-out)

Swagger + verbose errors are also disabled in production.

## Env vars (grouped)
- **Core:** `NODE_ENV`, `PORT` (default 3000), `CORS_ORIGINS`.
- **DB:** `DB_HOST/PORT/USER/PASSWORD/NAME`, `DB_SYNCHRONIZE`.
- **Staff auth:** `JWT_SECRET` (≥32, `openssl rand -hex 32`), `JWT_EXPIRES_IN` (8h).
- **Storage:** `STORAGE_DRIVER` (local|s3), `STORAGE_DIR`, `S3_*`.
- **Scanning:** `SCAN_DRIVER` (noop|clamav), `ALLOW_UNSCANNED_UPLOADS`, `CLAMAV_*`.
- **Rate limit:** `THROTTLE_TTL/LIMIT/INTAKE_LIMIT`, and `TRUST_PROXY` — Express `trust proxy` setting (number of hops / `loopback` / CIDR list; numeric strings coerced). **Default OFF.** Behind a load balancer, `ThrottlerGuard` keys on `req.ip` which is the proxy's address (one shared bucket for everyone), so this must be set to the real hop count in prod; but enabling it blindly lets any client spoof `X-Forwarded-For` and evade limits entirely, so it's an explicit operator choice — unset in prod is a boot **warning**, not fatal (single-container deploys have no proxy).
- **Mail:** `SMTP_*` (blank = log instead of send), `MAIL_FROM`, `APP_URL`.
- **SLA:** `SLA_HOURS_CRITICAL/HIGH/MEDIUM/LOW`, `SLA_AT_RISK_FRACTION` (env defaults). Per-platform overrides live in the DB (`platforms.sla_policy` jsonb, set via Admin → Platforms → SLA), not env.
- **Cron sweeps:** `SLA_SWEEP_ENABLED` (breach escalation every 5 min), `DIGEST_ENABLED` (Mon 08:00 weekly digest), and `SCAN_RETRY_ENABLED` (re-scan stuck-PENDING attachments every 10 min — [[Module - Storage and Scanning]]) — **all default on**; set `=false` to disable. → [[Backend Modules and API|Scheduled jobs]].
- **Jira:** `JIRA_BASE_URL/EMAIL/API_TOKEN/WEBHOOK_SECRET` (blank = disabled).
- **Policy:** `FOCAL_POINT_CAN_TRANSITION` (OD-09, default false).
- **Self-support:** `SELF_SUPPORT_PLATFORM_KEY` (default `cimp`) → [[Integrations]].
- **(FAFICS / connectors set):** `CIMP_PLATFORM_KEY`, `CIMP_HANDOFF_SECRET`, `CIMP_SUPPORT_URL` — live in the *consumer* project, not here. See [[cimp-connect Package]].

> ⚠️ **Deploy gotcha:** merging `dev`→`main` (which deploys) requires all the prod vars above set on the server, or boot fails by design. See [[Session Handoff]].

Related: [[Deployment, CI-CD and Dev Workflow]] · [[Security Audit and Hardening]]
