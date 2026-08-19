import { expect, test } from '@playwright/test';

const userId = '11111111-1111-4111-8111-111111111111';
const organisationId = '22222222-2222-4222-8222-222222222222';
const baseId = '33333333-3333-4333-8333-333333333333';
const now = '2026-08-20T00:00:00.000Z';

test('authoritative Fleet form hydrates its Base and creates a generator without vehicle identity', async ({ page }) => {
  let postCount = 0;
  let payload: Record<string, unknown> = {};
  await page.route('**/api/v1/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], pagination: { page: 1, pageSize: 100 } }) }));
  await page.route('**/api/store*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/api/auth', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: userId, email: 'fleet@example.test', name: 'Fleet Operator', role: 'admin', identityPlane: 'organisation', entitlements: [], permissions: ['fleet_assets.read', 'fleet_assets.create', 'fleet_assets.update', 'fleet_assets.archive'] } }) }));
  await page.route('**/api/v1/session', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { user: { id: userId, email: 'fleet@example.test', name: 'Fleet Operator' }, organisation: { id: organisationId, name: 'Fleet Test' }, roles: ['organisation_admin'], permissions: ['fleet_assets.read', 'fleet_assets.create', 'fleet_assets.update', 'fleet_assets.archive'], operatingLocationIds: [baseId] } }) }));
  await page.route('**/api/v1/operating-locations*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: baseId, name: 'Fly The Farm Base', address: '1 Test Road', timezone: 'Australia/Brisbane', rowVersion: 1, createdAt: now, updatedAt: now }], pagination: { page: 1, pageSize: 100 } }) }));
  await page.route('**/api/v1/fleet-assets*', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], pagination: { page: 1, pageSize: 100 } }) });
    if (route.request().method() === 'POST') {
      postCount += 1; payload = route.request().postDataJSON();
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { ...payload, id: '44444444-4444-4444-8444-444444444444', rowVersion: 1, createdAt: now, updatedAt: now } }) });
    }
    return route.fallback();
  });

  await page.goto('/fleet-work-packs');
  await page.getByRole('button', { name: 'Add Fleet asset' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add Fleet asset' });
  await expect(dialog.getByLabel('Base')).toContainText('Fly The Farm Base');
  await dialog.getByLabel('Asset type').click();
  await page.getByRole('option', { name: 'Generator' }).click();
  await dialog.getByLabel('Asset identifier').fill('GEN-BROWSER-001');
  await dialog.getByLabel('Serial number').fill('SER-BROWSER-001');
  await dialog.getByRole('button', { name: 'Save asset' }).click();
  await expect(dialog).toBeHidden();
  expect(postCount).toBe(1);
  expect(payload).toMatchObject({ operatingLocationId: baseId, assetType: 'generator', assetIdentifier: 'GEN-BROWSER-001' });
  expect(payload.registration).toBeUndefined();
});
