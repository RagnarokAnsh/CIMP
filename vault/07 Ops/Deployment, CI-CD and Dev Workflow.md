---
title: Deployment, CI-CD and Dev Workflow
tags: [cimp, ops, deployment, ci-cd]
updated: 2026-07-07
---
# Deployment, CI-CD and Dev Workflow
← [[CIMP - Home]]

## Hosting
AWS EC2 **`35.154.196.105`**. **pm2** runs the API (`node dist/main.js` on :3000). **nginx** serves the built frontend (`frontend/dist`, static) and reverse-proxies `/api` → :3000, terminating TLS on 443.

## CI/CD (`.github/workflows/deploy.yml`)
Trigger: **push to `main`** (or manual). Jobs:
1. **verify** — `npm ci` → typecheck → test → build (backend + frontend). Gate: nothing deploys unless green.
2. **deploy** — SSH into EC2, run `scripts/deploy.sh`.

`scripts/deploy.sh` (on server, rewritten 2026-07-07): `flock` single-instance lock → tool check (`git/node/npm/pm2/curl/flock`) → `git fetch` + `git reset --hard $DEPLOY_REF` (default `origin/main`; `.env`/`uploads`/`dist` gitignored, untouched) → `npm ci --include=dev` → `npm run build` → **pre-flight env check** → optional `migration:run` (if `RUN_MIGRATIONS=true`) → frontend build to `dist.new` → **[danger zone]** atomic `swap_frontend` + `pm2 restart` → **health gate** (`GET /api/health`, `HEALTH_RETRIES`×2s, fails fast on pm2 `errored`/`stopped`).
- **Two-phase rollback:** a failure *before* the pm2 restart just aborts (old build still live, nothing touched); a failure *after* (incl. a failed health check) rolls back to the previous commit, rebuilds, and restarts. **DB is never rolled back** — keep migrations expand/contract.
- **Pre-flight env check** mirrors [[Configuration and Env|env.validation.ts]] (fail-closed: `DB_SYNCHRONIZE=false`, explicit `CORS_ORIGINS`, `JWT_SECRET`≥32, `SCAN_DRIVER=clamav` **or** `ALLOW_UNSCANNED_UPLOADS=true`). It reads exported env then `$APP_DIR/.env`. Runs *before* pm2, so a bad `.env` (e.g. **missing `SCAN_DRIVER=clamav`** — the clamav boot crash) aborts with a named error while the old build keeps serving, instead of crash-looping the new one. Override with `SKIP_PREFLIGHT=true` (not recommended).
- **Atomic frontend swap:** builds to `frontend/dist.new` and `mv`s it in at the end, so nginx never serves a half-empty `dist` mid-build.

**GitHub Secrets:** `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY` (dedicated deploy key), `APP_DIR`, `PM2_APP`, `RUN_MIGRATIONS`. Optional deploy-script env (defaults are sane, not passed by the workflow today): `DEPLOY_REF`, `HEALTH_URL`, `HEALTH_RETRIES`, `SKIP_PREFLIGHT`. Add swap on small instances (Vite build can OOM). `NODE_ENV=production` + prod env vars required or boot fails ([[Configuration and Env]]).

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
