#!/usr/bin/env bash
#
# Server-side deploy script. Runs ON the EC2 box — the GitHub Actions workflow
# (.github/workflows/deploy.yml) pipes it in over SSH after the build/test gate
# passes. It syncs the code to origin/main, rebuilds the backend and frontend,
# optionally runs DB migrations, and reloads the API under pm2. nginx serves
# frontend/dist in place, so no file copying is needed.
#
# Env (passed by the workflow):
#   APP_DIR         absolute path to the repo on the server        (required)
#   PM2_APP         pm2 process name for the API   (default: cimp-api)
#   RUN_MIGRATIONS  "true" to run `migration:run`   (default: false)
#
set -euo pipefail

APP_DIR="${APP_DIR:?APP_DIR env var is required}"
PM2_APP="${PM2_APP:-cimp-api}"
RUN_MIGRATIONS="${RUN_MIGRATIONS:-false}"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

cd "$APP_DIR"

log "Syncing code to origin/main"
# .env, uploads/ and dist/ are gitignored, so a hard reset leaves them untouched
# and guarantees the server matches CI exactly (no drift from local edits).
git fetch --prune origin
git reset --hard origin/main

log "Backend: install + build"
# --include=dev forces devDependencies even if NODE_ENV=production is exported
# on the server (the build needs @nestjs/cli / typescript).
npm ci --include=dev
npm run build

if [ "$RUN_MIGRATIONS" = "true" ]; then
  log "Running database migrations"
  npm run migration:run
else
  log "Skipping migrations (RUN_MIGRATIONS != true)"
fi

log "Frontend: install + build (nginx serves frontend/dist)"
npm --prefix frontend ci --include=dev
npm --prefix frontend run build

log "Reloading API under pm2 ($PM2_APP)"
pm2 reload "$PM2_APP" --update-env || pm2 start dist/main.js --name "$PM2_APP" --update-env
pm2 save

log "Deploy complete"
