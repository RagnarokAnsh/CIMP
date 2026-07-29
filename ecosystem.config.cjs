// pm2 process definition for the API.
//
// This exists because of a real incident: on 2026-07-07 a deploy shipped the
// fail-closed production config check while the server's .env still had
// SCAN_DRIVER=noop and no ALLOW_UNSCANNED_UPLOADS opt-out. The app refused to
// boot, exited 1, and pm2 restarted it immediately — 20,971 times over ~22
// hours, until someone corrected the .env the next morning. It burned CPU on a
// 911 MB box for a day and left a 24 MB error log of the same stack trace.
//
// Two things now guard that path. `scripts/deploy.sh` runs a pre-flight env
// check before it touches pm2, so THAT specific misconfiguration aborts the
// deploy while the old build keeps serving. This file is the backstop for
// everything the pre-flight cannot know about — the database being unreachable
// at boot, a port already bound, a bad migration leaving the schema
// incompatible: failures that only appear once the process actually starts.
//
// The deploy script prefers this file when present (see pm2_restart there), so
// the policy is reapplied on every deploy rather than living only in pm2's
// dump file, where it would silently vanish the first time the process was
// deleted and recreated.
module.exports = {
  apps: [
    {
      // Kept configurable so it matches the PM2_APP deploy secret; the default
      // is the name the process has always had on the server.
      name: process.env.PM2_APP || 'cimp-api',
      script: 'dist/main.js',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      // Prefix log lines with a timestamp — without it a crash loop is very
      // hard to read back afterwards.
      time: true,

      autorestart: true,

      // A boot that dies inside 60s never really came up, so it counts as
      // unstable. A process that survives longer resets the counter, which is
      // what keeps ordinary deploy restarts from consuming the budget below.
      min_uptime: '60s',

      // After 10 consecutive unstable restarts pm2 gives up and marks the app
      // errored instead of looping. That is the whole point: a stopped app with
      // a clear status is far easier to notice and diagnose than one quietly
      // restarting 16 times a minute for a day. The deploy script's health
      // check already treats `errored` as fatal and rolls back.
      max_restarts: 10,

      // Back off between those attempts (100ms, 200ms, 400ms ... capped by pm2
      // at 15s) rather than retrying flat out. A transient dependency — Postgres
      // still starting after a reboot — gets time to recover, and a permanent
      // failure stops spinning the CPU while it exhausts the budget.
      exp_backoff_restart_delay: 100,

      // Deliberately NO max_memory_restart. It would add a brand-new restart
      // trigger, and the CSV export legitimately holds up to 50k rows in
      // memory (EXPORT_MAX_ROWS) — a cap tight enough to catch a leak would
      // also kill a large, valid export.
    },
  ],
};
