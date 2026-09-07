import { expect, test } from '@playwright/test';
import path from 'node:path';
import {
  acceptanceRunLabel,
  archiveAcceptanceRecord,
  assertNoLegacyEntityPersistence,
} from './fixtures/acceptanceRecords';
import {
  validateCreatedOperationalRecordResponse,
  validatePersistedOperationalRecordResponse,
} from './fixtures/commercialOnboardingInvitation';
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
    const clientCreateResponse = await runSingleAuthoritativeCommand(page, {
      origin: new URL(acceptanceEnvironment().baseUrl).origin, pathname: '/api/v1/clients', method: 'POST', expectedStatus: 201,
    }, () => page.getByRole('button', { name: 'Save Client and continue' }).click());
    const createdClient = validateCreatedOperationalRecordResponse(
      'clients', clientCreateResponse.status(), await clientCreateResponse.json().catch(() => ({})), 'name', label,
    );
    records.client = createdClient;
    await expect(page.getByRole('heading', { name: 'Where is the work?' })).toBeVisible();
    const persistedClientResponse = await page.request.get(`/api/v1/clients?id=${encodeURIComponent(createdClient.id)}`);
    records.client = validatePersistedOperationalRecordResponse(
      'clients', persistedClientResponse.status(), await persistedClientResponse.json().catch(() => ({})), createdClient.id, 'name', label,
    );

    await page.getByRole('button', { name: 'Add new Property' }).click();
    await page.getByRole('textbox', { name: 'Property name' }).fill(label);
    await page.getByRole('textbox', { name: 'Property location' }).fill('1 Queen Street, Brisbane QLD 4000');
    const addressChoices = page.getByRole('option');
    await expect(addressChoices).not.toHaveCount(0);
    await addressChoices.first().click();
    await page.getByRole('button', { name: 'Confirm location' }).click();
    await expect(page.getByText('Property location confirmed.')).toBeVisible();
    const propertyCreateResponse = await runSingleAuthoritativeCommand(page, {
      origin: new URL(acceptanceEnvironment().baseUrl).origin, pathname: '/api/v1/properties', method: 'POST', expectedStatus: 201,
    }, () => page.getByRole('button', { name: 'Save Property and continue' }).click());
    const createdProperty = validateCreatedOperationalRecordResponse(
      'properties', propertyCreateResponse.status(), await propertyCreateResponse.json().catch(() => ({})), 'name', label,
    );
    records.property = createdProperty;
    await expect(page.getByRole('heading', { name: 'Define the operational area' })).toBeVisible();
    const persistedPropertyResponse = await page.request.get(`/api/v1/properties?id=${encodeURIComponent(createdProperty.id)}`);
    records.property = validatePersistedOperationalRecordResponse(
      'properties', persistedPropertyResponse.status(), await persistedPropertyResponse.json().catch(() => ({})), createdProperty.id, 'name', label,
    );

    await page.getByRole('button', { name: 'Create new Field' }).click();
    await page.getByRole('textbox', { name: 'Field name' }).fill(label);
    await page.getByRole('button', { name: 'Upload' }).click();
    await page.locator('input[type="file"][accept*=".kml"]').setInputFiles(
      path.join(__dirname, 'fixtures/acceptance-boundary.kml'),
    );
    await expect(page.getByText(/Calculated area: (?!0\.00)/)).toBeVisible();
    const fieldCreateResponse = await runSingleAuthoritativeCommand(page, {
      origin: new URL(acceptanceEnvironment().baseUrl).origin, pathname: '/api/v1/fields', method: 'POST', expectedStatus: 201,
    }, () => page.getByRole('button', { name: 'Save Field and boundary' }).click());
    const createdField = validateCreatedOperationalRecordResponse(
      'fields', fieldCreateResponse.status(), await fieldCreateResponse.json().catch(() => ({})), 'name', label,
    );
    records.field = createdField;
    await expect(page.getByRole('heading', { name: 'Create the work request' })).toBeVisible();
    const persistedFieldResponse = await page.request.get(`/api/v1/fields?id=${encodeURIComponent(createdField.id)}`);
    records.field = validatePersistedOperationalRecordResponse(
      'fields', persistedFieldResponse.status(), await persistedFieldResponse.json().catch(() => ({})), createdField.id, 'name', label,
    );
    expect(records.field.propertyId).toBe(records.property.id);

    await page.getByRole('button', { name: /2 Property/ }).click();
    await page.getByRole('button', { name: 'Add new Property' }).click();
    await page.getByRole('textbox', { name: 'Property name' }).fill(secondaryLabel);
    await page.getByRole('textbox', { name: 'Property location' }).fill('1 Queen Street, Brisbane QLD 4000');
    await expect(page.getByRole('option')).not.toHaveCount(0);
    await page.getByRole('option').first().click();
    await page.getByRole('button', { name: 'Confirm location' }).click();
    const secondaryPropertyCreateResponse = await runSingleAuthoritativeCommand(page, {
      origin: new URL(acceptanceEnvironment().baseUrl).origin, pathname: '/api/v1/properties', method: 'POST', expectedStatus: 201,
    }, () => page.getByRole('button', { name: 'Save Property and continue' }).click());
    const createdSecondaryProperty = validateCreatedOperationalRecordResponse(
      'properties', secondaryPropertyCreateResponse.status(), await secondaryPropertyCreateResponse.json().catch(() => ({})), 'name', secondaryLabel,
    );
    records.secondaryProperty = createdSecondaryProperty;
    const persistedSecondaryPropertyResponse = await page.request.get(`/api/v1/properties?id=${encodeURIComponent(createdSecondaryProperty.id)}`);
    records.secondaryProperty = validatePersistedOperationalRecordResponse(
      'properties', persistedSecondaryPropertyResponse.status(), await persistedSecondaryPropertyResponse.json().catch(() => ({})), createdSecondaryProperty.id, 'name', secondaryLabel,
    );

    await page.getByRole('button', { name: 'Create new Field' }).click();
    await page.getByRole('textbox', { name: 'Field name' }).fill(secondaryLabel);
    await page.getByRole('button', { name: 'Upload' }).click();
    await page.locator('input[type="file"][accept*=".kml"]').setInputFiles(
      path.join(__dirname, 'fixtures/acceptance-boundary.kml'),
    );
    await expect(page.getByText(/Calculated area: (?!0\.00)/)).toBeVisible();
    const secondaryFieldCreateResponse = await runSingleAuthoritativeCommand(page, {
      origin: new URL(acceptanceEnvironment().baseUrl).origin, pathname: '/api/v1/fields', method: 'POST', expectedStatus: 201,
    }, () => page.getByRole('button', { name: 'Save Field and boundary' }).click());
    const createdSecondaryField = validateCreatedOperationalRecordResponse(
      'fields', secondaryFieldCreateResponse.status(), await secondaryFieldCreateResponse.json().catch(() => ({})), 'name', secondaryLabel,
    );
    records.secondaryField = createdSecondaryField;
    await expect(page.getByRole('heading', { name: 'Create the work request' })).toBeVisible();
    const persistedSecondaryFieldResponse = await page.request.get(`/api/v1/fields?id=${encodeURIComponent(createdSecondaryField.id)}`);
    records.secondaryField = validatePersistedOperationalRecordResponse(
      'fields', persistedSecondaryFieldResponse.status(), await persistedSecondaryFieldResponse.json().catch(() => ({})), createdSecondaryField.id, 'name', secondaryLabel,
    );
    expect(records.secondaryField.propertyId).toBe(records.secondaryProperty.id);

    await page.goto('/jobs?view=jobs');
    await expect(page.getByRole('heading', { name: 'Jobs' })).toBeVisible();
    await page.getByRole('button', { name: 'Add Job' }).first().click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('combobox', { name: 'Client' }).selectOption(records.client.id);
    await page.getByRole('button', { name: 'Add fields from another Property' }).click();
    await page.getByRole('checkbox', { name: label, exact: true }).check();
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.getByRole('checkbox', { name: secondaryLabel, exact: true }).check();
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.getByText(/2 Properties · 2 Fields/)).toBeVisible();
    await page.getByRole('button', { name: 'Continue to Job details' }).click();
    await expect(page.getByRole('heading', { name: 'Record Spray Job' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Job Reference' }).fill(label);
    await page.getByRole('combobox', { name: 'Weed Target' }).fill(label);
    const jobCreateResponse = await runSingleAuthoritativeCommand(page, {
      origin: new URL(acceptanceEnvironment().baseUrl).origin, pathname: '/api/v1/jobs', method: 'POST', expectedStatus: 201,
    }, () => page.getByRole('button', { name: 'Save Job' }).click());
    const jobResponseBody = await jobCreateResponse.json();
    const createdJob = validateCreatedOperationalRecordResponse(
      'jobs', jobCreateResponse.status(), jobResponseBody, 'scope', label,
    );
    records.job = createdJob;
    expect(jobResponseBody.data.fieldIds).toEqual(expect.arrayContaining([records.field.id, records.secondaryField.id]));
    expect(jobResponseBody.data.fieldIds).toHaveLength(2);
    const persistedJobResponse = await page.request.get(`/api/v1/jobs?id=${encodeURIComponent(createdJob.id)}`);
    records.job = validatePersistedOperationalRecordResponse(
      'jobs', persistedJobResponse.status(), await persistedJobResponse.json().catch(() => ({})), createdJob.id, 'scope', label,
    );

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
    const missionCreateResponse = await runSingleAuthoritativeCommand(page, {
      origin: new URL(acceptanceEnvironment().baseUrl).origin, pathname: '/api/v1/missions', method: 'POST', expectedStatus: 201,
    }, () => page.getByRole('button', { name: 'Create Draft Mission' }).click());
    const createdMission = validateCreatedOperationalRecordResponse(
      'missions', missionCreateResponse.status(), await missionCreateResponse.json().catch(() => ({})), 'title', label,
    );
    records.mission = createdMission;
    // Mission creation also retires the persisted setup Draft. Production cold
    // starts and optimistic-concurrency reconciliation can legitimately span
    // more than Playwright's default assertion timeout.
    await expect(page).toHaveURL(/\/missions\/[0-9a-f-]+\?guided=1$/, { timeout: 45_000 });
    const persistedMissionResponse = await page.request.get(`/api/v1/missions?id=${encodeURIComponent(createdMission.id)}`);
    records.mission = validatePersistedOperationalRecordResponse(
      'missions', persistedMissionResponse.status(), await persistedMissionResponse.json().catch(() => ({})), createdMission.id, 'title', label,
    );

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
      await archiveAcceptanceRecord(page.request, 'missions', records.mission, { origin: new URL(acceptanceEnvironment().baseUrl).origin });
      await archiveAcceptanceRecord(page.request, 'jobs', records.job, { origin: new URL(acceptanceEnvironment().baseUrl).origin });
      await archiveAcceptanceRecord(page.request, 'fields', records.secondaryField, { origin: new URL(acceptanceEnvironment().baseUrl).origin });
      await archiveAcceptanceRecord(page.request, 'fields', records.field, { origin: new URL(acceptanceEnvironment().baseUrl).origin });
      await archiveAcceptanceRecord(page.request, 'properties', records.secondaryProperty, { origin: new URL(acceptanceEnvironment().baseUrl).origin });
      await archiveAcceptanceRecord(page.request, 'properties', records.property, { origin: new URL(acceptanceEnvironment().baseUrl).origin });
      await archiveAcceptanceRecord(page.request, 'clients', records.client, { origin: new URL(acceptanceEnvironment().baseUrl).origin });
    } catch (error) {
      if (!workflowError) throw error;
      console.error(`[acceptance-cleanup] secondary_failure=${error instanceof Error ? error.message : 'UNKNOWN'}`);
    }
  }
});
