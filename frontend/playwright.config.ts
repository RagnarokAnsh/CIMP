import { defineConfig } from '@playwright/test';

// Thin end-to-end harness over the real stack: boots the NestJS API (against
// the local dev Postgres on :5433) and the Vite dev server, then drives the
// reporter and staff surfaces in Chromium. Run with `npm run test:e2e`.
//
// Prerequisite: the dev Postgres container is up (docker compose up -d
// postgres at the repo root). global-setup seeds portal-a + the staff login.
const API_PORT = 3972;
const WEB_PORT = 5199;

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 45_000,
  retries: 1,
  workers: 1, // the suites share one DB — keep runs deterministic
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'npm run start:dev',
      cwd: '..',
      url: `http://localhost:${API_PORT}/api/health`,
      timeout: 180_000,
      reuseExistingServer: true,
      env: {
        PORT: String(API_PORT),
        // Crons are irrelevant in e2e and just add log noise.
        SLA_SWEEP_ENABLED: 'false',
        DIGEST_ENABLED: 'false',
      },
    },
    {
      command: `npm run dev -- --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      timeout: 120_000,
      reuseExistingServer: true,
      env: { VITE_PROXY_TARGET: `http://localhost:${API_PORT}` },
    },
  ],
});
