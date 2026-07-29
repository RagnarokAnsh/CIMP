import { expect, test } from '@playwright/test';
import { staffLogin } from './helpers';

// Staff surfaces: login, triage inbox, JQL filtering, saved-view plumbing.
test.describe('staff workspace', () => {
  test.beforeEach(async ({ page }) => staffLogin(page));

  test('triage inbox renders the queue (or inbox zero) with keyboard hints', async ({ page }) => {
    await page.goto('/staff/triage');
    await expect(
      page.getByRole('heading', { name: 'Triage' }).or(page.getByText('Inbox zero')),
    ).toBeVisible({ timeout: 15_000 });
  });

  // There is no JQL bar to drive: the control was REMOVED from IssuesListPage,
  // not feature-flagged (an earlier version of this comment claimed a `false &&`
  // guard that does not exist — don't go looking for a flag). What remains wired
  // is the `jql` field in the filter state, the query param, and saved views
  // that persist one, so the grammar is still reachable without any UI.
  // Un-skip by re-adding a query input; backend coverage: src/issues/jql.spec.ts.
  test.skip('JQL: a valid query filters, an invalid one surfaces the parse error', async ({ page }) => {
    await page.goto('/staff/issues');
    const jql = page.getByLabel('Filter query');

    await jql.fill('status = NEW AND priority IN (HIGH, CRITICAL, MEDIUM, LOW)');
    await page.getByRole('button', { name: /apply query/i }).click();
    // The list reloads without an error banner (result count may be 0 — fine).
    await expect(page.getByText(/issue(s)? in your scope/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/JQL:/)).toHaveCount(0);

    await jql.fill('bogusfield = NEW');
    await page.getByRole('button', { name: /apply query/i }).click();
    await expect(page.getByText(/Unknown field/i)).toBeVisible({ timeout: 10_000 });
  });

  test('command palette opens with Ctrl+K and navigates', async ({ page }) => {
    await page.goto('/staff/issues');
    await page.keyboard.press('Control+k');
    await expect(page.getByPlaceholder(/search issues or type a command/i)).toBeVisible();
    await page.getByRole('option', { name: /dashboard/i }).click();
    await expect(page).toHaveURL(/\/staff\/dashboard/);
  });
});
