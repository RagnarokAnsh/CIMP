---
title: Integrations
tags: [cimp, integrations]
updated: 2026-07-06
---
# Integrations (Jira, Storage, Scanning, Self-Support)
← [[CIMP - Home]]

## Jira (`src/jira/`)
One-way push + inbound webhook. On `issue.created` → creates a linked Jira issue (idempotent, retried, timed out); on status change → echoes a comment; `issue.attachments_scanned` → pushes now-servable files. **Inbound:** `POST /api/integrations/jira/webhook` gated by `JIRA_WEBHOOK_SECRET` via **constant-time** compare (`crypto.timingSafeEqual`); `JiraInboundService.applyWebhook` overwrites local status as `SYSTEM`. Disabled entirely when `JIRA_*` unset.

## Storage (`src/storage/`)
`STORAGE_DRIVER=local|s3`. Local writes to `STORAGE_DIR`; S3/MinIO via `S3_*`. Attachment `storageKey` abstracts the backend.

## Scanning (`src/scanning/`)
`SCAN_DRIVER=noop|clamav`. `noop` marks files `SKIPPED` (servable). `clamav` streams to a clamd daemon. **PENDING/INFECTED never served.** Prod requires `clamav` unless `ALLOW_UNSCANNED_UPLOADS=true` ([[Configuration and Env]]).

## Self-support (dogfooding) (`src/self-support/`)
CIMP registered as one of its **own** reporter portals. `POST /api/staff/support/handoff` mints a hand-off token for the signed-in staff user (signed server-side with the `cimp` platform's own secret, read from the DB) → opens `/reporter/new?handoff=...`. Frontend: `SupportButton.tsx` (top bar). Env: `SELF_SUPPORT_PLATFORM_KEY` (default `cimp`). It's the reference implementation for the [[cimp-connect Package]].

## Scoped API tokens
Read-only integration access — see [[Features - Shipped|API tokens]].

Related: [[cimp-connect Package]] · [[FAFICS Integration]] · [[Domain Events and Issue Lifecycle]]
