import { expect, test } from '@playwright/test';
import { acceptanceRunLabel } from './fixtures/acceptanceRecords';
import { openMissionCreationWorkspace } from './fixtures/missionCreationWorkspace';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });

test('keeps the authorised navigation shell usable while explaining Beta work', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Operations Brief' })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole('button', { name: 'New Mission' })).toBeEnabled();

  const navigation = page.getByRole('navigation', { name: 'Organisation navigation' });
  await expect(navigation.getByRole('button', { name: 'Home' })).toBeVisible();

  const beta = page.getByLabel('Beta availability').getByLabel('Beta');
  await expect(beta).toBeVisible();
  await beta.focus();
  await expect(page.getByRole('tooltip')).toHaveText(
    'This feature is available during Private Commercial Beta and is still being refined.',
  );
  await expect(page.locator('body')).not.toContainText(/Legacy/i);
});

test('keeps the authoritative Client to Mission path available without losing the session', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Operations Brief' })).toBeVisible({ timeout: 45_000 });
  await openMissionCreationWorkspace(page);

  await expect(page.getByRole('button', { name: /^1 Customer —/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^2 Property —/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^3 Field —/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^4 Job —/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^5 Mission —/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add new Client' })).toBeEnabled();
  await expect(page.locator('body')).not.toContainText(/Legacy/i);

  const navigation = page.getByRole('navigation', { name: 'Organisation navigation' });
  await navigation.getByRole('button', { name: 'Home' }).click();
  await expect(page.getByRole('heading', { name: 'Operations Brief' })).toBeVisible({ timeout: 45_000 });
  const session = await page.request.get('/api/v1/session');
  expect(session.ok()).toBeTruthy();
});

test('keeps validation beside the work and preserves entered Client data after a failed save', async ({ page }) => {
  const label = acceptanceRunLabel();
  await openMissionCreationWorkspace(page);
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
  await openMissionCreationWorkspace(page);
  await page.getByRole('button', { name: 'Add new Client' }).click();
  await page.getByRole('textbox', { name: 'Client or business name' }).fill(label);

  await page.getByRole('button', { name: /10 Review — BLOCKED/ }).click();

  await expect(page.getByText(/Create the authoritative Draft Mission before final review/)).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Client or business name' })).toHaveValue(label);
});

test('keeps primary guided actions usable at a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMissionCreationWorkspace(page);

  await expect(page.getByRole('button', { name: 'Save and exit' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add new Client' })).toBeVisible();
});
