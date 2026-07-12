import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';

const require = createRequire(import.meta.url);
// jsonwebtoken lives in the backend's node_modules (one level up).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const jwt = require('../../../node_modules/jsonwebtoken');

// Mirrors what `npm run seed` provisions (scripts/seed.ts).
export const ADMIN = { email: 'admin@cimp.dev', password: 'Password123!' };
const PORTAL_KEY = 'portal-a';
const PORTAL_SECRET = 'dev-secret-portal-a';

/** Mint a reporter hand-off token exactly like a connected portal would. */
export function mintHandoffToken(user = {
  id: 'e2e-user-1', name: 'E2E Reporter', email: 'e2e@example.org',
}): string {
  return jwt.sign(
    { platformKey: PORTAL_KEY, portalUserId: user.id, name: user.name, email: user.email },
    PORTAL_SECRET,
    { algorithm: 'HS256', expiresIn: '10m' },
  );
}

/** Log into the staff workspace and wait for the shell to render. */
export async function staffLogin(page: Page): Promise<void> {
  await page.goto('/staff');
  await page.getByRole('textbox', { name: /email/i }).or(page.locator('input[type="email"]')).first()
    .fill(ADMIN.email);
  await page.locator('input[type="password"]').fill(ADMIN.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  // The sidebar brand is the reliable "logged in" signal.
  await page.getByRole('link', { name: 'Issues' }).first().waitFor({ timeout: 15_000 });
}
