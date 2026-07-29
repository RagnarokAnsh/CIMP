---
title: Deployment, CI-CD and Dev Workflow
tags: [cimp, ops, deployment, ci-cd]
updated: 2026-07-29
---
# Deployment, CI-CD and Dev Workflow
← [[CIMP - Home]]

## Hosting
AWS EC2 **`35.154.196.105`**. **pm2** runs the API (`node dist/main.js` on :3000). **nginx** serves the built frontend (`frontend/dist`, static) and reverse-proxies `/api` → :3000, terminating TLS on 443.

## CI/CD (`.github/workflows/deploy.yml`)
Trigger: **push to `main`** (or manual `workflow_dispatch` with a **"Run database migrations" checkbox**). Jobs:
1. **verify** — `npm ci` → typecheck → **unit + e2e tests** → build (backend + frontend). Gate: nothing deploys unless green (hardened 2026-07-15: the e2e suite is DB-free, so it now runs in the gate too).
2. **deploy** — SSH into EC2 (host key **pinned** via the `SSH_KNOWN_HOSTS` secret — the workflow *fails* if it's unset; no more trust-on-first-use `ssh-keyscan`), run `scripts/deploy.sh`.
- **Migrations decision (2026-07-15):** manual runs use the dispatch checkbox; push runs use the repo **variable** `RUN_MIGRATIONS` (default false). The old `RUN_MIGRATIONS` *secret* is no longer read — delete it. Recommended: set the variable to `true` permanently (`migration:run` is a no-op with nothing pending), which removes the merge-dev-without-migrations footgun.

`scripts/deploy.sh` (on server, rewritten 2026-07-07): `flock` single-instance lock → tool check (`git/node/npm/pm2/curl/flock`) → `git fetch` + `git reset --hard $DEPLOY_REF` (default `origin/main`; `.env`/`uploads`/`dist` gitignored, untouched) → `npm ci --include=dev` → `npm run build` → **pre-flight env check** → optional `migration:run` (if `RUN_MIGRATIONS=true`) → frontend build to `dist.new` → **[danger zone]** atomic `swap_frontend` + `pm2 restart` → **health gate** (`GET /api/health`, `HEALTH_RETRIES`×2s, fails fast on pm2 `errored`/`stopped`).
- **Two-phase rollback:** a failure *before* the pm2 restart just aborts (old build still live, nothing touched); a failure *after* (incl. a failed health check) rolls back to the previous commit, rebuilds, and restarts. **DB is never rolled back** — keep migrations expand/contract.
- **Pre-flight env check** mirrors [[Configuration and Env|env.validation.ts]] (fail-closed: `DB_SYNCHRONIZE=false`, explicit `CORS_ORIGINS`, `JWT_SECRET`≥32, `SCAN_DRIVER=clamav` **or** `ALLOW_UNSCANNED_UPLOADS=true`). It reads exported env then `$APP_DIR/.env`. Runs *before* pm2, so a bad `.env` (e.g. **missing `SCAN_DRIVER=clamav`** — the clamav boot crash) aborts with a named error while the old build keeps serving, instead of crash-looping the new one. Override with `SKIP_PREFLIGHT=true` (not recommended).
- **Atomic frontend swap:** builds to `frontend/dist.new` and `mv`s it in at the end, so nginx never serves a half-empty `dist` mid-build.
- **pm2 restart policy (`ecosystem.config.cjs`, added 2026-07-29):** `pm2_restart()` prefers the versioned ecosystem file, so `min_uptime: 60s` / `max_restarts: 10` / `exp_backoff_restart_delay` are reapplied on **every** deploy. `pm2 restart <name>` keeps whatever options the process was first created with, so a policy set by hand lives only in pm2's dump file and vanishes the moment the process is deleted and recreated. It names exactly one app, so the co-hosted services are never touched. See the incident below for why this exists.

## The 2026-07-07 crash loop (20,971 restarts) — resolved, worth remembering
`cimp-api` shows a **cumulative** restart count in the tens of thousands. Almost all of it is one incident: **17,805 restarts on 07-07 and 3,170 on 07-08**. Every day since has been 1–4 (i.e. deploys).

**Cause:** the WATCHER deploy shipped the fail-closed production config check while the server's `.env` still had `SCAN_DRIVER=noop` and no opt-out. The app refused to boot — `Production configuration check failed: SCAN_DRIVER must be "clamav" in production` — exited 1, and pm2 restarted it instantly, ~16×/minute for **22 hours**, until `ALLOW_UNSCANNED_UPLOADS=true` was added to `.env` at 07-08 07:21.

**Two guards now:** the deploy script's **pre-flight env check** catches *that* class of failure before pm2 is touched (old build keeps serving), and the **ecosystem restart policy** bounds everything the pre-flight cannot know about — Postgres unreachable at boot, a bound port, a schema the code can't work with. After 10 unstable restarts pm2 marks the app `errored` and stops, which the deploy health gate already treats as fatal.

**Reading the counter:** `restart_time` is cumulative for the life of the pm2 process entry, so a big number is not evidence of a current problem. Check `unstable_restarts` and `uptime` instead, or count per day:
```bash
grep "App \[cimp-api:0\] starting" ~/.pm2/pm2.log | cut -c1-10 | sort | uniq -c
```

## Co-tenancy: this box is not ours alone
The EC2 instance also runs an unrelated project (`whoop-server`, `whoop-legacy`, Streamlit/uvicorn on :8600/:8601) under the **same pm2 daemon**, plus a static `portfolio`. Do not use `pm2 restart all`, `pm2 kill`, or `pm2 delete` — always name `cimp-api`. `pm2 save` is safe (it snapshots, it does not start or stop).

Observed 2026-07-29 and **not caused by our deploys**: something restarts both whoop apps roughly every ~28 minutes (`Process N in a stopped status, starting it`), independent of whether a deploy ran, and `whoop-server` crash-loops on its own every ~93 s. Their watchdog, their bug — but it means **the box is under constant churn**, which matters when judging our own memory headroom.

## Resource headroom (small instance)
911 MB RAM + 2 GB swap, 24 GB disk. The deploy builds **on the box** (`npm ci` twice, `nest build`, `vite build`), which is the tightest moment; the swap is what makes it survive. Logs are **not rotated** — `cimp-api-error.log` reached 24 MB and `-out.log` 21 MB, mostly from the crash loop above (`whoop-server-error.log` is another 25 MB). `pm2 flush cimp-api` clears ours. Installing `pm2-logrotate` would fix it permanently but is a **daemon-wide module that also affects the co-tenant**, so it is a decision for the box owner rather than something a CIMP deploy should do.

**GitHub Secrets:** `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY` (dedicated deploy key), `SSH_KNOWN_HOSTS` (**required since 2026-07-15** — pinned host key; get it with `ssh-keyscan -t ed25519 <host>` from a trusted machine and verify the fingerprint against the server's `/etc/ssh/ssh_host_ed25519_key.pub`), `APP_DIR`, `PM2_APP`. **Variables:** `RUN_MIGRATIONS` (push-deploy default). Optional deploy-script env (defaults are sane, not passed by the workflow today): `DEPLOY_REF`, `HEALTH_URL`, `HEALTH_RETRIES`, `SKIP_PREFLIGHT`. Add swap on small instances (Vite build can OOM). `NODE_ENV=production` + prod env vars required or boot fails ([[Configuration and Env]]).

## Git & branches
- **`main`** = deploy branch (push → deploy). **`dev`** = working branch. Feature/hardening branches merge into `dev`. As of 2026-07-29 the two are level: dev was merged to main and deployed (schema 11 → 20).
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
