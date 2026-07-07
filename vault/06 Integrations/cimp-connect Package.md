---
title: cimp-connect Package
tags: [cimp, connector, npm, bridge]
updated: 2026-07-06
---
# cimp-connect Package (the reusable connector)
← [[CIMP - Home]]

Separate repo/package that connects **any Node backend** to a CIMP support portal. This is the **bridge note** — link it from any other project's vault.

- **Repo:** `RagnarokAnsh/cimp-connect` (public). **Registry:** GitHub Packages `@ragnarokansh/cimp-connect` (published v0.3.0). Local: `D:\cimp-connect`.
- **Install (token-free, recommended):** `npm i github:RagnarokAnsh/cimp-connect` (builds on install via `prepare`). Or GitHub Packages with an `.npmrc` + `read:packages` token.

## What it does
Mints a short-lived HS256 hand-off token **server-side** (the secret never reaches the browser) and redirects the user to `<CIMP>/reporter/new?handoff=...`. Implements the exact contract in [[Auth and Authorization]].

## Entry points
- **`.` (core):** `mintHandoffToken({platformKey, secret, user})` + `buildHandoffUrl(baseUrl, token)` — framework-agnostic.
- **`/nestjs`:** `SupportModule.forRoot/forRootAsync({ guard, getUser, platformKey, handoffSecret, baseUrl })` → exposes `GET /support/handoff`. The one project-specific piece is `getUser(req) => {id,name,email}`.
- **`/react`:** `<GetSupportButton handoffUrl=... />`.
- **`/element`:** `<cimp-support-button>` web component (Angular/Vue/Svelte/plain HTML) via `defineCimpSupportButton()`.
- **CLI:** `npx cimp-connect init` — logs into CIMP as admin, creates the platform, captures the secret, writes `.env`.

## Consumer env
`CIMP_PLATFORM_KEY`, `CIMP_HANDOFF_SECRET` (from CIMP → Admin → Platforms → Rotate), `CIMP_SUPPORT_URL`.

First real consumer → [[FAFICS Integration]].

Related: [[Integrations]] · [[Auth and Authorization]]
