import { readFile } from 'node:fs/promises';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.js';
import type { APIRequestContext, Download, Page } from '@playwright/test';

import {
  authenticateSafetyPlanRole,
  authenticatedTest as test,
  COMPANY_TEMPLATE,
  completedSafetyPlan,
  expect,
} from './fixtures/auth';
import { SAFETY_PLAN_NOTICE } from '../src/data/safetyPlanStandard';
import type { SafetyPlan } from '../src/types/safetyPlan';

const jobUrl = '/jobs/client/e2e-client/property/e2e-property/field/e2e-field/job/e2e-job';

async function seedRecord(
  request: APIRequestContext,
  collection: string,
  payload: { id: string }
) {
  const response = await request.put('/api/store', {
    headers: { 'x-ftf-e2e-auth': 'admin' },
    data: { collection, recordId: payload.id, payload },
  });
  expect(response.status()).toBe(200);
}

async function seedPlan(request: APIRequestContext, plan: SafetyPlan) {
  await seedRecord(request, 'ftf_safety_plans', plan);
}

async function completeRequiredFields(page: Page) {
  for (const step of ['Job details', 'People & assets', 'Hazards & controls', 'Emergency planning', 'Review & submit']) {
    await page.getByTestId('safety-plan-stepper').getByRole('button', { name: step }).click();
    const fields = page.locator('input[required], textarea[required]');
    for (let index = 0; index < await fields.count(); index += 1) {
      const field = fields.nth(index);
      if (!(await field.inputValue()).trim()) await field.fill(`Completed ${step} field ${index + 1}`);
    }
  }
  await expect(page.getByText('Saved', { exact: false })).toBeVisible();
}

async function pdfText(download: Download): Promise<string> {
  const filePath = await download.path();
  if (!filePath) throw new Error('Playwright did not retain the downloaded PDF.');
  const bytes = new Uint8Array(await readFile(filePath));
  const document = await pdfjs.getDocument({ data: bytes, disableWorker: true }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => 'str' in item ? item.str : '').join(' '));
  }
  return pages.join('\n');
}

test.beforeEach(async ({ request }) => {
  const reset = await request.delete('/api/store?fixtureReset=1', {
    headers: { 'x-ftf-e2e-auth': 'admin' },
  });
  expect(reset.status()).toBe(204);
  await seedRecord(request, 'ftf_safety_plan_templates', COMPANY_TEMPLATE);
});

test('runs the real remote job lifecycle through revision approval and client export', async ({ page }) => {
  await page.goto(jobUrl);
  await expect(page.getByText('Safety Plan optional')).toBeVisible();
  await page.evaluate(() => {
    const session = JSON.parse(localStorage.getItem('ftf_session') || 'null');
    const profiles = JSON.parse(localStorage.getItem('ftf_user_licenses') || '{}');
    profiles[session.id] = {
      userId: session.id,
      generalInfo: {
        applicatorName: session.name,
        primaryLicenseNumber: 'E2E-REOC',
        companyName: 'Synthetic Ag Operations',
        abn: '00 000 000 000',
        insurancePolicyNumber: 'E2E',
        insuranceExpiryDate: '2027-07-24',
      },
      stateLicenses: { NSW: {}, VIC: {}, QLD: {}, SA: {}, WA: {}, TAS: {}, NT: {}, ACT: {} },
      lastUpdated: new Date().toISOString(),
    };
    localStorage.setItem('ftf_user_licenses', JSON.stringify(profiles));
  });
  const missionLoad = page.waitForResponse((response) =>
    response.url().includes('/api/store?collection=ftf_missions')
    && response.request().method() === 'GET'
  );
  await page.reload();
  await missionLoad;
  await expect(page.getByText('Safety Plan optional')).toBeVisible();
  await page.getByRole('button', { name: 'Create Safety Plan' }).click();
  await expect(page).toHaveURL(/\/compliance\/safety-plans\/[^/]+$/);
  const editorUrl = page.url();

  await page.getByTestId('safety-plan-stepper').getByRole('button', { name: 'Hazards & controls' }).click();
  await expect(page.getByText('Powerlines', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Public access', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Weather may change', { exact: true }).first()).toBeVisible();
  await completeRequiredFields(page);
  await expect(page.getByText('Ready for submission')).toBeVisible();
  await expect(page.getByText(/attention only and does not block mission authorisation/i)).toBeVisible();
  await page.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(page.getByText('Safety Plan status: submitted')).toBeVisible();

  await authenticateSafetyPlanRole(page, 'authority');
  await page.getByTestId('safety-plan-stepper').getByRole('button', { name: 'Review & submit' }).click();
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Safety Plan status: approved')).toBeVisible();

  const approvedScope = page.getByRole('textbox', { name: 'Scope (required)' });
  await page.getByTestId('safety-plan-stepper').getByRole('button', { name: 'Job details' }).click();
  await approvedScope.fill('Attempted mutation of approved content');
  await expect(page.getByText('Save pending.')).toBeVisible();
  await page.reload();
  await page.getByTestId('safety-plan-stepper').getByRole('button', { name: 'Job details' }).click();
  await expect(page.getByRole('textbox', { name: 'Scope (required)' }))
    .not.toHaveValue('Attempted mutation of approved content');

  await authenticateSafetyPlanRole(page, 'pic');
  await page.getByTestId('safety-plan-stepper').getByRole('button', { name: 'Review & submit' }).click();
  await expect(page.getByText(/attention only and does not block mission authorisation/i)).toBeVisible();
  await page.getByRole('button', { name: 'Read and acknowledge' }).click();
  await expect(page.getByText(/^Acknowledged/)).toBeVisible();

  await authenticateSafetyPlanRole(page, 'authority');
  await page.getByTestId('safety-plan-stepper').getByRole('button', { name: 'Review & submit' }).click();
  await page.getByRole('button', { name: 'Revise' }).click();
  await expect(page.getByText('Controlled field plan · Version 1.1')).toBeVisible();
  await page.getByRole('button', { name: 'Submit for approval' }).click();
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Version 1.0', { exact: true })).toBeVisible();
  await expect(page.getByText('superseded')).toBeVisible();
  await expect(page.getByText('Version 1.1', { exact: true })).toBeVisible();

  await authenticateSafetyPlanRole(page, 'admin');
  await page.goto(jobUrl);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export client copy' }).click();
  const download = await downloadPromise;
  const exportedText = (await pdfText(download)).replaceAll("'", '’');
  expect(exportedText).toContain('Version 1.1');
  expect(exportedText).toContain(SAFETY_PLAN_NOTICE);

  const missionResponse = await page.request.get('/api/store?collection=ftf_missions', {
    headers: { 'x-ftf-e2e-auth': 'contractor' },
  });
  expect((await missionResponse.json()).records[0].status).toBe('Approved');
  expect(editorUrl).toMatch(/\/compliance\/safety-plans\//);
});

test('records Not required without changing the authorised mission', async ({ page }) => {
  await page.goto(jobUrl);
  await page.getByRole('button', { name: 'Not required' }).click();
  await page.getByLabel('Reason (optional)').fill('Covered by the job JSA');
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText('Not required: Covered by the job JSA')).toBeVisible();

  const response = await page.request.get('/api/store?collection=ftf_missions', {
    headers: { 'x-ftf-e2e-auth': 'contractor' },
  });
  expect((await response.json()).records[0].status).toBe('Approved');
});

test('denies contractor approval and client or unrelated-tenant reads', async ({ page, request }) => {
  await seedPlan(request, completedSafetyPlan('submitted'));
  await page.goto('/compliance/safety-plans/e2e-safety-plan');
  await page.getByTestId('safety-plan-stepper').getByRole('button', { name: 'Review & submit' }).click();
  await expect(page.getByText('Approval requires a nominated operational authority.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);

  for (const role of ['client', 'unrelated'] as const) {
    const response = await request.get(
      '/api/store?collection=ftf_safety_plans&recordId=e2e-safety-plan',
      { headers: { 'x-ftf-e2e-auth': role } }
    );
    if (role === 'client') expect(response.status()).toBe(403);
    else expect((await response.json()).payload).toBeNull();
  }
});

test('lets an administrator edit and publish the company master but denies a contractor', async ({ page }) => {
  await page.goto('/compliance/safety-plans/template');
  await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();

  await authenticateSafetyPlanRole(page, 'admin');
  await page.goto('/compliance/safety-plans/template');
  await expect(page.getByRole('heading', { name: 'Company Safety Plan master' })).toBeVisible();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Company template draft saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Publish company master' }).click();
  await expect(page.getByText(/Company master 2\.0 published/)).toBeVisible();
});

test('retains remote autosave text after a failure and retries successfully', async ({ page, request }) => {
  await seedPlan(request, completedSafetyPlan());
  let failOnce = true;
  await page.route('**/api/store', async (route) => {
    const requestBody = route.request().postDataJSON?.();
    if (
      failOnce
      && route.request().method() === 'PUT'
      && requestBody?.collection === 'ftf_safety_plans'
    ) {
      failOnce = false;
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Synthetic outage"}' });
      return;
    }
    await route.continue();
  });
  await page.goto('/compliance/safety-plans/e2e-safety-plan');
  const scope = page.getByRole('textbox', { name: 'Scope (required)' });
  await scope.fill('Retained remote edit');
  await expect(page.getByText('Save pending.')).toBeVisible();
  await expect(scope).toHaveValue('Retained remote edit');
  await page.getByRole('button', { name: 'Retry save' }).click();
  await expect(page.getByText('Saved', { exact: false })).toBeVisible();
});

test('requires an explicit source-refresh decision and contains the 375px editor', async ({ page, request }) => {
  const plan = completedSafetyPlan();
  plan.versions[0].sourceSnapshot.hazards = plan.versions[0].sourceSnapshot.hazards?.slice(0, 1);
  await seedPlan(request, plan);
  await page.goto('/compliance/safety-plans/e2e-safety-plan');
  const latest = completedSafetyPlan().versions[0].sourceSnapshot;
  await page.evaluate((snapshot) => {
    history.replaceState({ ...history.state, usr: { latestSourceSnapshot: snapshot } }, '', location.href);
  }, latest);
  await page.reload();
  await page.getByRole('button', { name: 'Review source changes' }).click();
  await expect(page.getByRole('button', { name: 'Apply refresh' })).toBeDisabled();

  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  const metrics = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth);
});
