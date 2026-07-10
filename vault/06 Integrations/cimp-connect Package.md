---
title: cimp-connect Package
tags: [cimp, connector, npm, java, bridge]
updated: 2026-07-10
---
# cimp-connect Package (the reusable connector)
← [[CIMP - Home]]

Separate repo/package that connects **any backend** (Node or Java) to a CIMP support portal. This is the **bridge note** — link it from any other project's vault.

- **Repo:** `RagnarokAnsh/cimp-connect` (public). **Registry:** GitHub Packages `@ragnarokansh/cimp-connect` (v0.4.0; v0.3.0 published — 0.4.0 pending push/publish). Local: `D:\cimp-connect`.
- **Install (token-free, recommended):** `npm i github:RagnarokAnsh/cimp-connect` (builds on install via `prepare`). Or GitHub Packages with an `.npmrc` + `read:packages` token. **Java:** JitPack `com.github.ragnarokansh:cimp-connect` (project under `java/`, built via root `jitpack.yml`).

## What it does
Mints a short-lived HS256 hand-off token **server-side** (the secret never reaches the browser) and hands the user to `<CIMP>/reporter/new?handoff=...`. Implements the exact contract in [[Auth and Authorization]].

**Content negotiation (v0.4.0, all backend adapters):** a browser link click (`Accept: text/html`) gets a **302 redirect**; clients sending `Accept: application/json` (or `?format=json`) get **`{ url }`** to open themselves — that's the path for apps whose JWT lives in an `Authorization` header (Angular interceptor apps) where a link navigation carries no auth.

## Entry points
- **`.` (core):** `mintHandoffToken({platformKey, secret, user})` + `buildHandoffUrl(baseUrl, token)` — framework-agnostic.
- **`/express`:** `app.get('/api/support/handoff', requireAuth, cimpHandoff())` — env-configured; default `getUser` maps common `req.user` shapes, override via `cimpHandoff({ getUser })`.
- **`/nestjs`:** `SupportModule.forRoot/forRootAsync({ guard, getUser, platformKey, handoffSecret, baseUrl })` → exposes `GET /support/handoff`. The one project-specific piece is `getUser(req) => {id,name,email}`.
- **`/next`:** `export const GET = createHandoffHandler({ getUser })` (App Router route handler).
- **`/react`:** `<GetSupportButton />` — plain link by default; `mode="fetch"` + `getAuthHeaders` for header-JWT apps.
- **`/element`:** `<cimp-support-button>` web component (Angular/Vue/Svelte/plain HTML) via `defineCimpSupportButton()`; same `mode="fetch"`, auth headers supplied at registration: `defineCimpSupportButton({ getAuthHeaders })`.
- **Java (`java/`):** zero-dependency `CimpHandoff` core (hand-rolled HS256, cross-verified against Node `jsonwebtoken`) + **Spring Boot 3 auto-configuration** — add dep, set `cimp.platform-key/handoff-secret/support-url`, define one `CimpUserResolver` bean → `GET /support/handoff` exists.
- **CLI:** `npx cimp-connect init` — logs into CIMP as admin, creates the platform, captures the secret, writes `.env`.

## Consumer env
`CIMP_PLATFORM_KEY`, `CIMP_HANDOFF_SECRET` (from CIMP → Admin → Platforms → Rotate), `CIMP_SUPPORT_URL` (Java: `cimp.*` properties).

First real consumer → [[FAFICS Integration]]. Verification state: TS adapters smoke-tested (Express 5 checks, Next 4 checks, tokens verified with CIMP's exact `jwt.verify` options); Java core compiled + token cross-verified with Node; Spring classes compile against Boot 3.3.5 but **no live Spring app run yet**. No automated test suite in the package itself.

Related: [[Integrations]] · [[Auth and Authorization]]
