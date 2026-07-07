---
title: Deployment, CI-CD and Dev Workflow
tags: [cimp, ops, deployment, ci-cd]
updated: 2026-07-06
---
# Deployment, CI-CD and Dev Workflow
← [[CIMP - Home]]

## Hosting
AWS EC2 **`35.154.196.105`**. **pm2** runs the API (`node dist/main.js` on :3000). **nginx** serves the built frontend (`frontend/dist`, static) and reverse-proxies `/api` → :3000, terminating TLS on 443.

## CI/CD (`.github/workflows/deploy.yml`)
Trigger: **push to `main`** (or manual). Jobs:
1. **verify** — `npm ci` → typecheck → test → build (backend + frontend). Gate: nothing deploys unless green.
2. **deploy** — SSH into EC2, run `scripts/deploy.sh`.

`scripts/deploy.sh` (on server): `git fetch` + `git reset --hard origin/main` (`.env`/`uploads`/`dist` are gitignored, untouched) → `npm ci --include=dev` → `npm run build` → optional `migration:run` (if `RUN_MIGRATIONS=true`) → frontend `npm ci` + build → `pm2 reload`.

**GitHub Secrets:** `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY` (dedicated deploy key), `APP_DIR`, `PM2_APP`, `RUN_MIGRATIONS`. Add swap on small instances (Vite build can OOM). `NODE_ENV=production` + prod env vars required or boot fails ([[Configuration and Env]]).

## Git & branches
- **`main`** = deploy branch (push → deploy). **`dev`** = working branch (currently ~17 commits ahead). Feature/hardening branches merge into `dev`.
- **No AI co-author trailer** on commits/PRs (a `Co-Authored-By: Claude` line adds a GitHub *contributor*). Author = repo owner only.
- `gh` CLI (2.95) installed + authed as `RagnarokAnsh`.

## Dev commands (repo root)
- `docker compose up -d postgres` (:5432) · `npm run start:dev` (API :3000 `/api`) · `npm run build` · `npm run typecheck` · `npm test` · `npm run test:e2e`.
- Data: `npm run seed` (demo portal + admin + read-only watcher `watcher@cimp.dev` + token/curl), `npm run seed:demo` (WIPES schema, full dataset incl. watcher `lena.fischer@cimp.dev`), `npm run token` (mint a hand-off token).
- Prod seeding (`npm run seed:prod`, env-driven): `ADMIN_PASSWORD` required; optional read-only watcher via `WATCHER_EMAIL` + `WATCHER_PASSWORD` (+ `WATCHER_NAME`, `WATCHER_GLOBAL=true` for all-platforms scope; default scopes to `PLATFORM_KEY`).
- Seeder lookups match staff by **email OR `idp_subject`** (both unique) — an email-only lookup used to collide on `idp_subject` when a row existed under a different email.
- Migrations (`DB_SYNCHRONIZE=false`): `npm run migration:generate|run|revert`.
- Frontend (`frontend/`): `npm run dev` (:5173) · `npm run gen:api`.
- Tests run **without a DB** (boundaries stubbed).

Related: [[Configuration and Env]] · [[Session Handoff]]
