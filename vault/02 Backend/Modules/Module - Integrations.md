---
title: Module - Integrations
tags: [cimp, backend, integration, feature]
updated: 2026-07-06
---
# Module — Integrations (`src/integrations/`)
← [[Backend Modules and API]] · [[CIMP - Home]]

**Purpose:** **Scoped API tokens** — a programmatic, read-only integration surface for a platform's issues, separate from staff JWT auth. (The Jira inbound webhook is `/integrations/jira` but lives in [[Module - Jira]].)

## Files
| File | Responsibility |
|---|---|
| `api-tokens.service.ts` | Token CRUD + `authenticate` + issue read methods. |
| `api-tokens.controller.ts` | Two controllers: `ApiTokensController` (staff mgmt) + `IntegrationIssuesController` (token-authed read). |
| `api-token.guard.ts` | `ApiTokenGuard` — authenticates the token, binds `req.apiToken`. |
| `integrations.module.ts` | `forFeature([ApiToken, Issue])` + Auth/Authz modules. |
| `dto/create-api-token.dto.ts` | `{ name }`. |
| `api-tokens.service.spec.ts` | scope, hash-not-plaintext, authenticate. |

## Public surface
- **Management** (`JwtAuthGuard`, platform-scoped in service): `GET/POST/DELETE /api/staff/platforms/:platformId/api-tokens`.
- **Read** (`ApiTokenGuard`): `GET /api/integrations/issues` (paged), `GET /api/integrations/issues/:id`.

## Key classes & logic
`ApiTokensService`:
- `create` → generates `cimp_<48 hex>`, stores only the **SHA-256 hash** + `lastFour`; returns the plaintext **once**.
- `authenticate(raw)` → SHA-256 lookup where `revokedAt IS NULL`; best-effort `lastUsedAt` stamp.
- `listIssues` / `getIssue` scoped to the token's platform.
- CRUD guarded by `ScopeService.canAccessPlatform`.

`ApiTokenGuard`: reads `Authorization: Bearer` or `X-Api-Token` → `authenticate` → sets `req.apiToken = { id, platformId }`.

## Entities touched
`ApiToken`, `Issue` (read) — see [[Entity Reference]].

## Gotchas / invariants
- Plaintext is unrecoverable after creation (only the hash is stored).
- Read-only, single-platform binding (v1 permission model — a [[Decisions and Glossary|decision]]).

## Related
[[Features - Shipped]] · [[Module - Authz]] · [[Module - Jira]] · [[cimp-connect Package]]
