import { expect, test } from '@playwright/test';
import { acceptanceRunLabel } from './fixtures/acceptanceRecords';

test('keeps validation beside the work and preserves entered Client data after a failed save', async ({ page }) => {
  const label = acceptanceRunLabel();
  await page.goto('/missions/new');
  await page.getByRole('button', { name: 'Add new Client' }).click();

  const save = page.getByRole('button', { name: 'Save Client and continue' });
  await expect(save).toBeDisabled();
  await page.getByRole('textbox', { name: 'Client or business name' }).fill(label);
  await expect(save).toBeEnabled();

  await page.route('**/api/v1/clients', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'ACCEPTANCE_FORCED_FAILURE', message: 'Acceptance save was intentionally rejected.' } }),
      });
      return;
    }
    await route.continue();
  });
  await save.click();

  await expect(page.getByText('Acceptance save was intentionally rejected.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Client or business name' })).toHaveValue(label);
  await expect(page.getByRole('heading', { name: 'Who is this Mission for?' })).toBeVisible();
});

test('explains blocked stages without discarding the current work', async ({ page }) => {
  const label = acceptanceRunLabel();
  await page.goto('/missions/new');
  await page.getByRole('button', { name: 'Add new Client' }).click();
  await page.getByRole('textbox', { name: 'Client or business name' }).fill(label);

  await page.getByRole('button', { name: /10 Review — BLOCKED/ }).click();

  await expect(page.getByText(/Create the authoritative Draft Mission before final review/)).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Client or business name' })).toHaveValue(label);
});

test('keeps primary guided actions usable at a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/missions/new');

  await expect(page.getByRole('heading', { name: 'Create a Mission' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save and exit' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add new Client' })).toBeVisible();
});
