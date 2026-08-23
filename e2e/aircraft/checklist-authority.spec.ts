import { expect, test, type Page, type Route } from '@playwright/test';

const userId = '11111111-1111-4111-8111-111111111111';
const organisationId = '22222222-2222-4222-8222-222222222222';
const baseId = '33333333-3333-4333-8333-333333333333';
const templateId = '44444444-4444-4444-8444-444444444444';

const fulfil = (route: Route, data: unknown, status = 200) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify({ data }),
});
const fulfilPage = (route: Route, data: unknown[]) => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ data, pagination: { page: 1, pageSize: 100 } }),
});

async function mockChecklistAdministration(page: Page) {
  const permissions = ['checklist_templates.read', 'checklist_templates.author', 'checklist_templates.publish'];
  await page.route('**/api/store*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/api/auth', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ user: { id: userId, tenantId: organisationId, email: 'checklists@example.test', name: 'Checklist Administrator', role: 'admin', identityPlane: 'organisation', entitlements: [], permissions } }),
  }));
  await page.route('**/api/v1/session', (route) => fulfil(route, {
    user: { id: userId, email: 'checklists@example.test', name: 'Checklist Administrator' },
    organisation: { id: organisationId, name: 'Checklist Test' },
    roles: ['organisation_admin'],
    permissions,
    operatingLocationIds: [baseId],
  }));
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/session')) return fulfil(route, {
      user: { id: userId, email: 'checklists@example.test', name: 'Checklist Administrator' },
      organisation: { id: organisationId, name: 'Checklist Test' }, roles: ['organisation_admin'], permissions, operatingLocationIds: [baseId],
    });
    if (url.pathname.endsWith('/checklists')) {
      const action = url.searchParams.get('action');
      if (action === 'templates') return fulfil(route, { records: [] });
      if (action === 'template') return fulfil(route, { record: { id: templateId, row_version: 1 } }, 201);
      if (action === 'publish') return fulfil(route, { record: { id: templateId, version_number: 1 } }, 201);
    }
    if (url.pathname.endsWith('/operating-locations')) return fulfilPage(route, [{ id: baseId, name: 'Fly The Farm Base', address: '', timezone: 'Australia/Brisbane', rowVersion: 1, createdAt: '2026-08-23T00:00:00Z', updatedAt: '2026-08-23T00:00:00Z' }]);
    return fulfilPage(route, []);
  });
}

const viewports = [
  ['phone', { width: 390, height: 844 }],
  ['tablet', { width: 768, height: 1024 }],
  ['desktop', { width: 1440, height: 900 }],
] as const;

for (const [viewportName, viewport] of viewports) {
  test(`keeps governed Checklist authoring usable at ${viewportName} width`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockChecklistAdministration(page);
    await page.goto('/compliance/checklists');

    await expect(page.getByRole('heading', { name: 'Checklists' })).toBeVisible();
    await expect(page.getByText('No controlled checklists yet.')).toBeVisible();
    await page.getByRole('button', { name: 'Create checklist' }).click();
    await page.getByLabel('Checklist name').fill('Pre-flight aircraft setup');
    await page.getByLabel('Item prompt').fill('Propellers secure');
    await page.getByRole('button', { name: 'Add item' }).click();

    const publishRequest = page.waitForRequest((request) => request.url().includes('/api/v1/checklists?action=publish') && request.method() === 'POST');
    await page.getByRole('button', { name: 'Publish controlled version' }).click();
    const request = await publishRequest;
    const payload = request.postDataJSON();
    expect(payload.sections[0].items[0]).toMatchObject({ prompt: 'Propellers secure', authorityClass: 'ORGANISATION_STANDARD', responseType: 'PASS_DEFECT_NA' });
    expect(payload.applicability[0]).toMatchObject({ operatingLocationId: baseId, lifecycleStage: 'PRE_FLIGHT', readinessRequired: false });
    await expect(page.getByText('Controlled checklist version published. Earlier versions remain immutable.')).toBeVisible();
    await expect(page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).resolves.toBe(true);
  });
}
