import { expect, test } from '@playwright/test';
import { staffLogin } from './helpers';

test.describe('board', () => {
  test.beforeEach(async ({ page }) => staffLogin(page));

  test('renders status columns and switches into priority swimlanes', async ({ page }) => {
    await page.goto('/staff/board');
    await expect(page.getByRole('heading', { name: 'Board' })).toBeVisible();
    // Default: one flat set of status columns.
    await expect(page.getByText('In progress').first()).toBeVisible({ timeout: 15_000 });

    // Group by priority → swimlane sections appear, drag hint changes.
    await page.getByLabel('Group board by').click();
    await page.getByRole('option', { name: 'Priority' }).click();
    await expect(page.getByText(/Grouped board/)).toBeVisible();
    // At least one priority lane heading exists (seeded data has MEDIUM issues).
    await expect(
      page.getByRole('heading', { name: /CRITICAL|HIGH|MEDIUM|LOW/ }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Back to the flat board.
    await page.getByLabel('Group board by').click();
    await page.getByRole('option', { name: 'None' }).click();
    await expect(page.getByText(/Drag a card between columns/)).toBeVisible();
  });
});
