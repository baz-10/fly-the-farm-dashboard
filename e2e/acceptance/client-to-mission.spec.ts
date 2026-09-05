import { expect, test } from '@playwright/test';
import path from 'node:path';
import {
  acceptanceRunLabel,
  archiveAcceptanceRecord,
  archiveAcceptanceChain,
  assertNoLegacyEntityPersistence,
  findAcceptanceRecord,
} from './fixtures/acceptanceRecords';
import { acceptanceEnvironment } from './environment';
import { openMissionCreationWorkspace, runSingleAuthoritativeCommand } from './fixtures/missionCreationWorkspace';

test('creates, persists, reopens, and archives the authoritative Client to Draft Mission chain', async ({ browser, page }, testInfo) => {
  testInfo.setTimeout(180_000);
  const label = acceptanceRunLabel();
  const secondaryLabel = `${label} — River`;
  const records: Record<string, any> = {};
  let workflowError: unknown;

  try {
    await openMissionCreationWorkspace(page);

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

    await page.getByRole('button', { name: /2 Property/ }).click();
    await page.getByRole('button', { name: 'Add new Property' }).click();
    await page.getByRole('textbox', { name: 'Property name' }).fill(secondaryLabel);
    await page.getByRole('textbox', { name: 'Property location' }).fill('1 Queen Street, Brisbane QLD 4000');
    await expect(page.getByRole('option')).not.toHaveCount(0);
    await page.getByRole('option').first().click();
    await page.getByRole('button', { name: 'Confirm location' }).click();
    await page.getByRole('button', { name: 'Save Property and continue' }).click();
    records.secondaryProperty = await findAcceptanceRecord(page.request, 'properties', secondaryLabel);

    await page.getByRole('button', { name: 'Create new Field' }).click();
    await page.getByRole('textbox', { name: 'Field name' }).fill(secondaryLabel);
    await page.getByRole('button', { name: 'Upload' }).click();
    await page.locator('input[type="file"][accept*=".kml"]').setInputFiles(
      path.join(__dirname, 'fixtures/acceptance-boundary.kml'),
    );
    await expect(page.getByText(/Calculated area: (?!0\.00)/)).toBeVisible();
    await page.getByRole('button', { name: 'Save Field and boundary' }).click();
    records.secondaryField = await findAcceptanceRecord(page.request, 'fields', secondaryLabel);

    await page.goto('/jobs?view=jobs');
    await expect(page.getByRole('heading', { name: 'Jobs' })).toBeVisible();
    await page.getByRole('button', { name: 'Add Job' }).first().click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('combobox', { name: 'Client' }).selectOption(records.client.id);
    await page.getByRole('checkbox', { name: label }).check();
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.getByRole('button', { name: 'Add fields from another Property' }).click();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('checkbox', { name: secondaryLabel }).check();
    await expect(page.getByText(/2 Properties · 2 Fields/)).toBeVisible();
    await page.getByRole('button', { name: 'Continue to Job details' }).click();
    await expect(page.getByRole('heading', { name: 'Record Spray Job' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Job Reference' }).fill(label);
    await page.getByRole('combobox', { name: 'Weed Target' }).fill(label);
    const jobResponse = await runSingleAuthoritativeCommand(page, {
      pathname: '/api/v1/jobs', method: 'POST', expectedStatus: 201,
    }, () => page.getByRole('button', { name: 'Save Job' }).click());
    const jobResponseBody = await jobResponse.json();
    expect(jobResponseBody.data.fieldIds).toEqual(expect.arrayContaining([records.field.id, records.secondaryField.id]));
    expect(jobResponseBody.data.fieldIds).toHaveLength(2);
    records.job = await findAcceptanceRecord(page.request, 'jobs', label);

    await openMissionCreationWorkspace(page);
    await page.getByRole('combobox', { name: 'Client' }).click();
    await page.getByRole('option', { name: label }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('combobox', { name: 'Property' }).click();
    await page.getByRole('option', { name: label }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('combobox', { name: 'Field' }).click();
    await page.getByRole('option', { name: label }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('combobox', { name: 'Job' }).click();
    await page.getByRole('option', { name: new RegExp(label) }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('textbox', { name: 'Mission title' }).fill(label);
    await runSingleAuthoritativeCommand(page, {
      pathname: '/api/v1/missions', method: 'POST', expectedStatus: 201,
    }, () => page.getByRole('button', { name: 'Create Draft Mission' }).click());
    // Mission creation also retires the persisted setup Draft. Production cold
    // starts and optimistic-concurrency reconciliation can legitimately span
    // more than Playwright's default assertion timeout.
    await expect(page).toHaveURL(/\/missions\/[0-9a-f-]+\?guided=1$/, { timeout: 45_000 });
    records.mission = await findAcceptanceRecord(page.request, 'missions', label);

    await page.reload();
    await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible({ timeout: 45_000 });
    await assertNoLegacyEntityPersistence(page);

    const secondContext = await browser.newContext({ storageState: 'test-results/.auth/organisation.json' });
    const secondPage = await secondContext.newPage();
    await secondPage.goto(`/missions/${records.mission.id}`);
    await expect(secondPage.getByRole('heading', { name: label, exact: true })).toBeVisible({ timeout: 45_000 });
    await secondContext.close();
  } catch (error) {
    workflowError = error;
    throw error;
  } finally {
    // The remote workflow and cleanup have separate bounded budgets. This keeps
    // a primary workflow failure from cancelling or being masked by cleanup.
    testInfo.setTimeout(testInfo.timeout + 90_000);
    try {
      await archiveAcceptanceRecord(page.request, 'fields', records.secondaryField, { origin: new URL(acceptanceEnvironment().baseUrl).origin });
      await archiveAcceptanceRecord(page.request, 'properties', records.secondaryProperty, { origin: new URL(acceptanceEnvironment().baseUrl).origin });
      await archiveAcceptanceChain(page.request, records, { origin: new URL(acceptanceEnvironment().baseUrl).origin });
    } catch (error) {
      if (!workflowError) throw error;
      console.error(`[acceptance-cleanup] secondary_failure=${error instanceof Error ? error.message : 'UNKNOWN'}`);
    }
  }
});
