import { expect, test } from '@playwright/test';
import { staffLogin } from './helpers';

// Drives the platform and staff lifecycle controls added to the admin screen:
// create → disable → re-enable → delete, plus the guards that keep an admin
// from locking themselves out. Uses a throwaway platform key so the suite can
// re-run against the same dev database.
const KEY = 'e2e-lifecycle';

test.describe('admin lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await staffLogin(page);
    await page.goto('/staff/admin');
    await expect(page.getByRole('heading', { name: 'Administration' })).toBeVisible();
  });

  test('a platform can be created, disabled, re-enabled and deleted', async ({ page }) => {
    const row = page.getByRole('row', { name: new RegExp(KEY) });

    // Clean up a leftover from a previous failed run.
    if (await row.count()) {
      await row.getByRole('button', { name: /^Actions for/ }).click();
      await page.getByRole('menuitem', { name: /Delete…/ }).click();
      await page.getByLabel(/Type .* to confirm/).fill(KEY);
      await page.getByRole('button', { name: 'Delete platform' }).click();
      await expect(row).toHaveCount(0, { timeout: 10_000 });
    }

    // ── create ──
    await page.getByRole('button', { name: 'New platform' }).click();
    await page.getByLabel('Key').fill(KEY);
    await page.getByLabel('Name').fill('E2E Lifecycle');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row.getByText('ACTIVE')).toBeVisible();

    // ── disable (goes through the confirm dialog) ──
    await row.getByRole('button', { name: /^Actions for/ }).click();
    await page.getByRole('menuitem', { name: 'Disable' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('can no longer hand off');
    await page.getByRole('button', { name: 'Disable platform' }).click();
    await expect(row.getByText('DISABLED')).toBeVisible({ timeout: 10_000 });

    // ── re-enable ──
    await row.getByRole('button', { name: /^Actions for/ }).click();
    await page.getByRole('menuitem', { name: 'Enable' }).click();
    await expect(row.getByText('ACTIVE')).toBeVisible({ timeout: 10_000 });

    // ── rotate the hand-off secret ──
    // Regression: rotation used to drop the one-time secret into a 12s toast —
    // unselectable, unrepeatable, and if you missed it that portal's hand-off
    // stayed broken. Done here on the throwaway platform rather than portal-a,
    // whose fixed dev secret the reporter suite mints tokens against.
    await row.getByRole('button', { name: /^Actions for/ }).click();
    await page.getByRole('menuitem', { name: /Rotate hand-off secret/ }).click();
    const secretDialog = page.getByRole('dialog');
    await expect(secretDialog).toContainText('New hand-off signing secret', { timeout: 10_000 });
    await expect(secretDialog.getByRole('button', { name: 'Copy' })).toBeVisible();
    await expect(secretDialog.locator('code')).toHaveText(/^[0-9a-f]{64}$/);
    await secretDialog.getByRole('button', { name: /saved it/i }).click();
    await expect(secretDialog).toHaveCount(0);

    // ── delete: the confirm button stays disabled until the key is typed ──
    await row.getByRole('button', { name: /^Actions for/ }).click();
    await page.getByRole('menuitem', { name: /Delete…/ }).click();
    const confirm = page.getByRole('button', { name: 'Delete platform' });
    await expect(confirm).toBeDisabled();
    await page.getByLabel(/Type .* to confirm/).fill('wrong-key');
    await expect(confirm).toBeDisabled();
    await page.getByLabel(/Type .* to confirm/).fill(KEY);
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(row).toHaveCount(0, { timeout: 10_000 });
  });

  test.describe('staff tab', () => {
    test.beforeEach(async ({ page }) => {
      await page.getByRole('tab', { name: /Staff/ }).click();
    });

    test('shows account status and filters by name or email', async ({ page }) => {
      const adminRow = page.getByRole('row', { name: /admin@cimp\.dev/ });
      await expect(adminRow).toBeVisible({ timeout: 10_000 });
      await expect(adminRow.getByText('ACTIVE')).toBeVisible();
      // The logged-in admin is marked so destructive actions read unambiguously.
      await expect(adminRow.getByText('(you)')).toBeVisible();

      await page.getByLabel('Filter staff').fill('watcher@cimp.dev');
      await expect(adminRow).toHaveCount(0);
      await expect(page.getByRole('row', { name: /watcher@cimp\.dev/ })).toBeVisible();

      await page.getByLabel('Filter staff').fill('nobody-matches-this');
      await expect(page.getByText('No matching staff')).toBeVisible();
    });

    // The server refuses both (400); not offering them beats explaining the error.
    test('disable and delete are unavailable on your own row', async ({ page }) => {
      const adminRow = page.getByRole('row', { name: /admin@cimp\.dev/ });
      await adminRow.getByRole('button', { name: /^Actions for/ }).click();
      await expect(page.getByRole('menuitem', { name: 'Disable account' })).toBeDisabled();
      await expect(page.getByRole('menuitem', { name: 'Delete account' })).toBeDisabled();
      // Non-destructive actions stay available.
      await expect(page.getByRole('menuitem', { name: 'Edit details' })).toBeEnabled();
      await expect(page.getByRole('menuitem', { name: 'Set password' })).toBeEnabled();
    });

    test('roles are granted from the member row, not a detached picker', async ({ page }) => {
      const watcherRow = page.getByRole('row', { name: /watcher@cimp\.dev/ });
      await watcherRow.getByRole('button', { name: /^Assign a role to/ }).click();
      const dialog = page.getByRole('dialog');
      // The dialog names the person, so there is no "which staff member" step.
      await expect(dialog.getByRole('heading', { name: /Assign role —/ })).toBeVisible();
      await page.keyboard.press('Escape');
    });

    test('an admin-initiated password reset is reachable from the UI', async ({ page }) => {
      const watcherRow = page.getByRole('row', { name: /watcher@cimp\.dev/ });
      await watcherRow.getByRole('button', { name: /^Actions for/ }).click();
      await page.getByRole('menuitem', { name: 'Set password' }).click();

      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('heading', { name: /Set password —/ })).toBeVisible();
      const submit = dialog.getByRole('button', { name: 'Set password' });
      await expect(submit).toBeDisabled();
      await dialog.getByLabel('New password').fill('short');
      await expect(dialog.getByText(/more character\(s\) needed/)).toBeVisible();
      await expect(submit).toBeDisabled();
      await page.keyboard.press('Escape');
    });
  });
});
