import { expect, test } from '@playwright/test';
import path from 'node:path';
import {
  acceptanceRunLabel,
  archiveAcceptanceChain,
  assertNoLegacyEntityPersistence,
  findAcceptanceRecord,
} from './fixtures/acceptanceRecords';

test('creates, persists, reopens, and archives the authoritative Client to Draft Mission chain', async ({ browser, page }, testInfo) => {
  testInfo.setTimeout(180_000);
  const label = acceptanceRunLabel();
  const records: Record<string, any> = {};
  let workflowError: unknown;

  try {
    await page.goto('/missions/new');
    await expect(page.getByRole('heading', { name: 'Create a Mission' })).toBeVisible();

    await page.getByRole('button', { name: 'Add new Client' }).click();
    await page.getByRole('textbox', { name: 'Client or business name' }).fill(label);
    await page.getByRole('button', { name: 'Save Client and continue' }).click();
    await expect(page.getByRole('heading', { name: 'Where is the work?' })).toBeVisible();
    records.client = await findAcceptanceRecord(page.request, 'clients', label);

    await page.getByRole('button', { name: 'Add new Property' }).click();
    await page.getByRole('textbox', { name: 'Property name' }).fill(label);
    await page.getByRole('textbox', { name: 'Property location' }).fill('1 Queen Street, Brisbane QLD 4000');
    const addressChoices = page.getByRole('option');
    await expect(addressChoices).not.toHaveCount(0);
    await addressChoices.first().click();
    await page.getByRole('button', { name: 'Confirm location' }).click();
    await expect(page.getByText('Property location confirmed.')).toBeVisible();
    await page.getByRole('button', { name: 'Save Property and continue' }).click();
    await expect(page.getByRole('heading', { name: 'Define the operational area' })).toBeVisible();
    records.property = await findAcceptanceRecord(page.request, 'properties', label);

    await page.getByRole('button', { name: 'Create new Field' }).click();
    await page.getByRole('textbox', { name: 'Field name' }).fill(label);
    await page.getByRole('button', { name: 'Upload' }).click();
    await page.locator('input[type="file"][accept*=".kml"]').setInputFiles(
      path.join(__dirname, 'fixtures/acceptance-boundary.kml'),
    );
    await expect(page.getByText(/Calculated area: (?!0\.00)/)).toBeVisible();
    await page.getByRole('button', { name: 'Save Field and boundary' }).click();
    await expect(page.getByRole('heading', { name: 'Create the work request' })).toBeVisible();
    records.field = await findAcceptanceRecord(page.request, 'fields', label);

    await page.getByRole('button', { name: 'Create new Job' }).click();
    await page.getByRole('textbox', { name: 'Job scope' }).fill(label);
    await page.getByRole('button', { name: 'Save Job and continue' }).click();
    await expect(page.getByRole('heading', { name: 'Create the authoritative Draft Mission' })).toBeVisible();
    records.job = await findAcceptanceRecord(page.request, 'jobs', label);

    await page.getByRole('textbox', { name: 'Mission title' }).fill(label);
    await page.getByRole('button', { name: 'Create Draft Mission' }).click();
    await expect(page).toHaveURL(/\/missions\/[0-9a-f-]+\?guided=1$/);
    records.mission = await findAcceptanceRecord(page.request, 'missions', label);

    await page.reload();
    await expect(page.getByText(label, { exact: true })).toBeVisible();
    await assertNoLegacyEntityPersistence(page);

    const secondContext = await browser.newContext({ storageState: 'test-results/.auth/organisation.json' });
    const secondPage = await secondContext.newPage();
    await secondPage.goto(`/missions/${records.mission.id}`);
    await expect(secondPage.getByText(label, { exact: true })).toBeVisible();
    await secondContext.close();
  } catch (error) {
    workflowError = error;
    throw error;
  } finally {
    // The remote workflow and cleanup have separate bounded budgets. This keeps
    // a primary workflow failure from cancelling or being masked by cleanup.
    testInfo.setTimeout(testInfo.timeout + 90_000);
    try {
      await archiveAcceptanceChain(page.request, records);
    } catch (error) {
      if (!workflowError) throw error;
      console.error(`[acceptance-cleanup] secondary_failure=${error instanceof Error ? error.message : 'UNKNOWN'}`);
    }
  }
});
