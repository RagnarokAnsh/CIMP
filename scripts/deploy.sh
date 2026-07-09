#!/usr/bin/env bash
#
# Server-side deploy script. Runs ON the server — the GitHub Actions
# workflow (.github/workflows/deploy.yml) pipes it in over SSH after
# the build/test gate passes.
#
# Flow: acquire lock -> tool check -> fetch + hard-reset to the target
# ref -> build backend -> PRE-FLIGHT env check -> optional DB migrations
# -> build frontend to a temp dir -> [danger zone] swap frontend + pm2
# restart -> health check.
#
# Rollback is two-phase, on purpose:
#   - Any failure BEFORE pm2 is touched just aborts. The old build is
#     still running, untouched, so there is nothing to roll back yet.
#   - Any failure AFTER the pm2 restart (including a failed health
#     check) triggers a real rollback: old commit, rebuild, pm2 restart.
#
# The PRE-FLIGHT env check is deliberately before the danger zone: the
# app fails CLOSED at boot in production (missing SCAN_DRIVER=clamav,
# JWT_SECRET, DB_SYNCHRONIZE=false, CORS_ORIGINS ...). Catching that here
# means a misconfigured .env aborts with a clear message while the old
# build keeps serving — instead of pm2 crash-looping the new one and
# forcing a rollback. Mirrors src/config/env.validation.ts; keep in sync.
#
# IMPORTANT: this does NOT roll back the database. If a migration ran
# during a deploy that fails later, reverting the code does not undo
# the schema change, and the old code may not be compatible with the
# new schema. Keep migrations backward-compatible (expand/contract) or
# snapshot the DB before risky ones — a script can't safely reverse a
# migration on its own, so this one warns loudly instead of pretending to.
#
# Env (passed by the workflow):
#   APP_DIR          absolute path to the repo on the server         (required)
#   PM2_APP          pm2 process name for the API    (default: cimp-api)
#   DEPLOY_REF       git ref to deploy               (default: origin/main)
#   RUN_MIGRATIONS   "true" to run `migration:run`    (default: false)
#   HEALTH_URL       local health endpoint            (default: http://127.0.0.1:3000/api/health)
#   HEALTH_RETRIES   health check attempts, 2s apart  (default: 15)
#   SKIP_PREFLIGHT   "true" to skip the env pre-flight (default: false; not recommended)
#
set -Eeuo pipefail

APP_DIR="${APP_DIR:?APP_DIR env var is required}"
PM2_APP="${PM2_APP:-cimp-api}"
DEPLOY_REF="${DEPLOY_REF:-origin/main}"
RUN_MIGRATIONS="${RUN_MIGRATIONS:-false}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
HEALTH_RETRIES="${HEALTH_RETRIES:-15}"
SKIP_PREFLIGHT="${SKIP_PREFLIGHT:-false}"

log()     { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
success() { printf '\033[1;32m%s\033[0m\n' "$*"; }
warn()    { printf '\033[1;33m%s\033[0m\n' "$*" >&2; }
error()   { printf '\033[1;31m%s\033[0m\n' "$*" >&2; }

# --- single-instance lock ----------------------------------------------
# Two overlapping deploys sharing one working tree corrupt each other
# (one resets HEAD while the other builds). flock serializes them.
LOCK_FILE="${LOCK_FILE:-/tmp/cimp-deploy.$PM2_APP.lock}"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
    error "Another deploy for '$PM2_APP' is already running (lock: $LOCK_FILE). Aborting."
    exit 1
fi

# --- required tooling ---------------------------------------------------
# Fail with a clear message now rather than a cryptic one mid-deploy.
for cmd in git node npm pm2 curl flock; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        error "Required command '$cmd' not found on PATH. Install it and retry."
        exit 1
    fi
done

cd "$APP_DIR"
OLD_COMMIT="$(git rev-parse HEAD)"
MIGRATIONS_RAN=false

# --- env lookup (for the pre-flight only) ------------------------------
# The app reads config from process.env merged over $APP_DIR/.env
# (@nestjs/config, no ignoreEnvFile). Mirror that precedence: an exported
# shell var wins, else fall back to the .env file. We parse .env by hand
# (never `source` it — that would execute arbitrary code and choke on
# values with spaces).
getenv() {
    local key="$1"
    if [ -n "${!key-}" ]; then
        printf '%s' "${!key}"
        return 0
    fi
    if [ -f "$APP_DIR/.env" ]; then
        # last matching KEY=..., strip key, optional surrounding quotes, CR.
        sed -n "s/^[[:space:]]*${key}[[:space:]]*=//p" "$APP_DIR/.env" \
            | tail -n1 | sed 's/\r$//; s/^"\(.*\)"$/\1/; s/^'\''\(.*\)'\''$/\1/'
    fi
}

# Mirrors src/config/env.validation.ts + is-production.ts. Prod unless
# NODE_ENV is exactly 'development' or 'test'. Runs BEFORE the danger zone.
preflight_env() {
    if [ "$SKIP_PREFLIGHT" = "true" ]; then
        warn "Skipping env pre-flight (SKIP_PREFLIGHT=true) — the app may crash-loop on boot."
        return 0
    fi

    local node_env db_sync cors jwt scan allow_unscanned
    node_env="$(getenv NODE_ENV)"
    db_sync="$(getenv DB_SYNCHRONIZE)"
    cors="$(getenv CORS_ORIGINS)"
    jwt="$(getenv JWT_SECRET)"
    scan="$(getenv SCAN_DRIVER)"
    allow_unscanned="$(getenv ALLOW_UNSCANNED_UPLOADS)"

    local lc_node_env
    lc_node_env="$(printf '%s' "$node_env" | tr '[:upper:]' '[:lower:]')"
    if [ "$lc_node_env" = "development" ] || [ "$lc_node_env" = "test" ]; then
        log "Pre-flight: NODE_ENV='$node_env' — dev/test, skipping production checks."
        return 0
    fi

    log "Pre-flight: validating production env (NODE_ENV='${node_env:-<unset ⇒ production>}')"
    local problems=()

    [ "$db_sync" = "false" ] || problems+=("DB_SYNCHRONIZE must be exactly \"false\" (got: '${db_sync:-<unset>}').")

    if [ -z "$cors" ] || [ "$cors" = "*" ]; then
        problems+=("CORS_ORIGINS must be set to explicit origin(s), not '*' (got: '${cors:-<unset>}').")
    fi

    if [ -z "$jwt" ]; then
        problems+=("JWT_SECRET must be set (staff auth signs/verifies with it).")
    elif [ "${#jwt}" -lt 32 ]; then
        problems+=("JWT_SECRET must be >=32 chars (got ${#jwt}). Generate: openssl rand -hex 32.")
    fi

    local lc_allow
    lc_allow="$(printf '%s' "$allow_unscanned" | tr '[:upper:]' '[:lower:]')"
    if [ "$scan" != "clamav" ] && [ "$lc_allow" != "true" ]; then
        problems+=("SCAN_DRIVER must be \"clamav\" (got: '${scan:-<unset>}'), or set ALLOW_UNSCANNED_UPLOADS=true to accept unscanned uploads.")
    fi

    if [ "${#problems[@]}" -gt 0 ]; then
        error ""
        error "Pre-flight FAILED — these would crash the app at boot (fail-closed config):"
        for p in "${problems[@]}"; do error "  - $p"; done
        error ""
        error "Fix $APP_DIR/.env (or the exported env), then redeploy. The current"
        error "build is still live and was NOT touched."
        exit 1
    fi
    success "Pre-flight passed."
}

# --- atomic frontend build ---------------------------------------------
# nginx serves frontend/dist in place. A plain `vite build` empties dist
# at the start, so users get 404s for the ~10-20s build window. Build to
# a temp dir and swap it in at the very end (near the pm2 restart) so the
# switch is a single, near-instant `mv`.
build_frontend() {
    log "Frontend: install + build (to temp dir for an atomic swap)"
    npm --prefix frontend ci --include=dev
    rm -rf frontend/dist.new
    # Type-check (tsc -b) then emit to dist.new. Mirrors the `build` script
    # but with an override outDir so the live dist is untouched until swap.
    ( cd frontend && npx tsc -b && npx vite build --outDir dist.new --emptyOutDir )
    if [ ! -d frontend/dist.new ]; then
        error "Frontend build did not produce frontend/dist.new — aborting."
        exit 1
    fi
}

swap_frontend() {
    rm -rf frontend/dist.old
    [ -d frontend/dist ] && mv frontend/dist frontend/dist.old
    mv frontend/dist.new frontend/dist
}

# --- pm2 helpers --------------------------------------------------------
pm2_restart() {
    if pm2 describe "$PM2_APP" >/dev/null 2>&1; then
        pm2 restart "$PM2_APP" --update-env
    else
        pm2 start dist/main.js --name "$PM2_APP" --update-env --time
    fi
    pm2 save
}

# Reads the pm2 process status via jlist (node is guaranteed present).
# Prints one of: online | errored | stopped | missing | ...
pm2_status() {
    pm2 jlist 2>/dev/null | node -e '
        let raw = ""; process.stdin.on("data", d => raw += d).on("end", () => {
            try {
                const list = JSON.parse(raw || "[]");
                const p = list.find(x => x.name === process.argv[1]);
                process.stdout.write(p ? (p.pm2_env.status || "unknown") : "missing");
            } catch { process.stdout.write("unknown"); }
        });
    ' "$PM2_APP"
}

# --- failure handlers ---------------------------------------------------
abort_early() {
    trap - ERR
    error ""
    error "Deploy failed before restart. pm2 ($PM2_APP) was never touched —"
    error "the previous build is still live. Nothing to roll back."
    exit 1
}
trap abort_early ERR

rollback() {
    trap - ERR   # a failure in here must not re-trigger this same handler
    error ""
    error "Deploy failed after restart — rolling back to ${OLD_COMMIT:0:8}"
    if [ "$MIGRATIONS_RAN" = "true" ]; then
        error "WARNING: migrations ran during this deploy. Reverting the code"
        error "does NOT undo them — check schema/code compatibility by hand."
    fi
    git reset --hard "$OLD_COMMIT"
    npm ci --include=dev
    npm run build
    build_frontend
    swap_frontend
    pm2_restart
    error "Rollback finished. Investigate before deploying again."
    pm2 logs "$PM2_APP" --lines 100 --nostream || true
    exit 1
}

# --- deploy -------------------------------------------------------------

log "Fetching latest code"
git fetch --prune origin
# .env, uploads/ and dist/ are gitignored, so a hard reset leaves them
# untouched and guarantees the server matches the target ref exactly.
git reset --hard "$DEPLOY_REF"
log "Now at $(git rev-parse --short HEAD) (was ${OLD_COMMIT:0:8})"

log "Backend: install + build"
# --include=dev forces devDependencies even if NODE_ENV=production is
# exported on the server (the build needs @nestjs/cli / typescript).
npm ci --include=dev
npm run build

# Catch fail-closed misconfig (clamav/JWT/CORS/synchronize) while the old
# build is still safely live — see the header note.
preflight_env

if [ "$RUN_MIGRATIONS" = "true" ]; then
    log "Running database migrations"
    npm run migration:run
    MIGRATIONS_RAN=true
else
    log "Skipping migrations (RUN_MIGRATIONS != true)"
fi

build_frontend

# ---------------------------------------------------------------------
# DANGER ZONE: from here a failure means an automatic rollback.
# ---------------------------------------------------------------------
log "Swapping frontend + restarting $PM2_APP under pm2"
trap rollback ERR
swap_frontend
pm2_restart

log "Waiting for the app to come up"
sleep 5
for i in $(seq 1 "$HEALTH_RETRIES"); do
    # Fail fast on a crash-loop instead of waiting out every retry.
    status="$(pm2_status)"
    if [ "$status" = "errored" ] || [ "$status" = "stopped" ]; then
        error "pm2 reports '$PM2_APP' status=$status — the app is not staying up."
        rollback
    fi
    if curl -fs --max-time 3 "$HEALTH_URL" >/dev/null; then
        trap - ERR
        success ""
        success "Healthy — deploy complete ($(git rev-parse --short HEAD))"
        exit 0
    fi
    echo "Health check attempt $i/$HEALTH_RETRIES (pm2 status=$status)..."
    sleep 2
done

error "Health check never passed after $HEALTH_RETRIES attempts"
rollback
