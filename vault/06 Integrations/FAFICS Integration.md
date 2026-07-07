---
title: FAFICS Integration
tags: [cimp, integration, fafics, bridge]
updated: 2026-07-06
---
# FAFICS Integration (first connected project)
← [[CIMP - Home]]

**FAFICS Expertise Pool** — a separate project connected to CIMP as a reporter portal. Bridge note between the two vaults.

- **Repo:** `RagnarokAnsh/FAFICS-expertise-pool`. Local: `D:\FAFICS`. Monorepo: `apps/api` (NestJS + **Prisma**), `apps/web` (Next.js).
- **Auth:** Passport-JWT in an **HttpOnly cookie** (`fafics_token`); `req.user = {userId, email, role}` (no name → name resolved from Prisma).

## How it connects
Uses the [[cimp-connect Package]]. Two implementations exist:
1. **Hand-written** `SupportModule` on branch `feat/cimp-support` (the original).
2. **Package-based** on branch `feat/cimp-connect-package`: `SupportModule.forRootAsync({ guard: JwtAuthGuard, inject: [ConfigService, PrismaService], useFactory: ... getUser resolves firstName/lastName from Prisma })`. Frontend: `<GetSupportButton />` in the admin sidebar (`apps/web/src/app/admin/layout.tsx`).

## Setup recap
1. In CIMP: Admin → Platforms → create key `fafics`, Rotate to get the secret.
2. In FAFICS `apps/api/.env`: `CIMP_PLATFORM_KEY=fafics`, `CIMP_HANDOFF_SECRET=<rotated>`, `CIMP_SUPPORT_URL=https://35.154.196.105`.
3. A CIMP admin (or a focal point on `fafics`) sees the resulting issues.

Verified end-to-end: authenticated `GET /api/support/handoff` → 302 with a token CIMP's `HandoffGuard` accepts (HTTP 200 on the reporter issue list).

Related: [[cimp-connect Package]] · [[Auth and Authorization]]
