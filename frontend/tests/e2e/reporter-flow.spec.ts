import { expect, test } from '@playwright/test';
import { mintHandoffToken } from './helpers';

// The core promise of the product: a portal user lands with a hand-off token
// and files an issue without any login.
test.describe('reporter flow', () => {
  test('files an issue via a handoff token and sees it tracked', async ({ page }) => {
    const token = mintHandoffToken();
    await page.goto(`/reporter/new?handoff=${token}`);

    // The token is captured and stripped from the address bar.
    await expect(page).toHaveURL(/\/reporter\/new$/);

    const description = `E2E: checkout button unresponsive after coupon apply ${Date.now()}`;
    await page.getByPlaceholder(/describe the problem/i).fill(description);
    await page.getByRole('button', { name: /submit issue/i }).click();

    // Lands on the issue detail with a reference number and the description.
    await expect(page).toHaveURL(/\/reporter\/issues\/[0-9a-f-]+$/, { timeout: 15_000 });
    await expect(page.getByText(/SUP-[0-9A-F]{8}/).first()).toBeVisible();
    await expect(page.getByText(description).first()).toBeVisible();
  });

  test('deflection: typing a matching description offers "notify me instead"', async ({ page }) => {
    // First report creates the trackable issue.
    const marker = `flaky invoice export freezes ${Date.now()}`;
    await page.goto(`/reporter/new?handoff=${mintHandoffToken()}`);
    await page.getByPlaceholder(/describe the problem/i).fill(`E2E deflection seed: ${marker}`);
    await page.getByRole('button', { name: /submit issue/i }).click();
    await expect(page).toHaveURL(/\/reporter\/issues\//, { timeout: 15_000 });

    // A second reporter typing similar words sees the deflection panel.
    await page.goto(`/reporter/new?handoff=${mintHandoffToken({
      id: 'e2e-user-2', name: 'Second Reporter', email: 'second@example.org',
    })}`);
    await page.getByPlaceholder(/describe the problem/i).fill(`the ${marker} for me too`);
    await expect(page.getByText(/already be tracked/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /notify me instead/i }).first()).toBeVisible();
  });
});
