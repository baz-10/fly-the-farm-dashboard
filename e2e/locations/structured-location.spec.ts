import { expect, Page, test } from '@playwright/test';

const now = '2026-09-04T06:00:00.000Z';
const clientId = '11111111-1111-4111-8111-111111111111';
const propertyId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const organisationId = '44444444-4444-4444-8444-444444444444';
const list = (data: unknown[]) => ({ data, pagination: { page: 1, pageSize: 100, total: data.length } });

async function installApi(page: Page) {
  const client = { id: clientId, name: 'Glasshouse Grower', contactName: '', contactEmail: '', contactPhone: '', addresses: [], rowVersion: 1, createdAt: now, updatedAt: now };
  const property = { id: propertyId, clientId, name: '304A Glasshouse', address: '304A Glasshouse Mountains Road', locality: 'Beerburrum', state: 'QLD', postcode: '4517', latitude: -26.96, longitude: 152.96, addressSource: 'MANUAL', locationConfirmedAt: now, rowVersion: 1, createdAt: now, updatedAt: now };
  await page.route('**/api/v1/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(list([])) }));
  await page.route('**/api/store*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/api/auth', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: userId, email: 'operator@example.test', name: 'Operator', role: 'contractor', identityPlane: 'organisation', entitlements: [] } }) }));
  await page.route('**/api/v1/session', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { user: { id: userId, email: 'operator@example.test', name: 'Operator' }, organisation: { id: organisationId, name: 'Test Organisation' }, roles: ['organisation_admin'], permissions: ['*'], operatingLocationIds: [] } }) }));
  await page.route('**/api/geocode*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [{ address: 'Provider road wording', locality: 'Beerburrum', state: 'QLD', postcode: '4517', lat: -26.96, lng: 152.96, label: 'Provider wording' }] }) }));
  await page.route('**/api/v1/clients*', (route) => route.request().method() === 'GET' ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(list([client])) }) : route.fallback());
  await page.route('**/api/v1/properties*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(list([property])) }));
}

test('manual rural Client address keeps typed detail and sends confirmed coordinates', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await installApi(page);
  let payload: any;
  await page.route('**/api/v1/clients', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    payload = route.request().postDataJSON();
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { id: clientId, ...payload, rowVersion: 1, createdAt: now, updatedAt: now } }) });
  });
  await page.goto('/jobs?onboarding=client');
  const dialog = page.getByRole('dialog', { name: 'Add New Client' });
  await dialog.getByLabel('Client / Farmer Name').fill('Glasshouse Grower');
  await dialog.getByRole('button', { name: 'Enter address manually' }).click();
  await dialog.getByLabel('Street number and road').fill('304A Glasshouse Mountains Road');
  await dialog.getByLabel('Town / locality / region').fill('Beerburrum');
  expect(pageErrors).toEqual([]);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('combobox', { name: /^State/ }).click();
  await page.getByRole('option', { name: 'QLD' }).click();
  await dialog.getByLabel('Postcode').fill('4517');
  await dialog.getByRole('button', { name: 'Show address on map' }).click();
  await dialog.getByRole('button', { name: 'Confirm location' }).click();
  await dialog.getByRole('button', { name: 'Add Client' }).click();
  expect(payload.addresses[0]).toEqual(expect.objectContaining({ address: '304A Glasshouse Mountains Road', locality: 'Beerburrum', state: 'QLD', postcode: '4517', lat: -26.96, lng: 152.96 }));
});

test('optional Field access point must be explicitly confirmed', async ({ page }) => {
  await installApi(page);
  let payload: any;
  await page.route('**/api/v1/fields', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    payload = route.request().postDataJSON();
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { id: '55555555-5555-4555-8555-555555555555', ...payload, rowVersion: 1, createdAt: now, updatedAt: now } }) });
  });
  await page.goto('/jobs?view=fields&onboarding=field');
  const dialog = page.getByRole('dialog', { name: 'Add Field' });
  await dialog.getByLabel('Select Client').click(); await page.getByRole('option', { name: 'Glasshouse Grower' }).click();
  await dialog.getByLabel('Select Property').click(); await page.getByRole('option', { name: '304A Glasshouse' }).click();
  await dialog.getByLabel('Field name').fill('Northern block');
  await dialog.getByRole('button', { name: 'Add field access / launch point' }).click();
  await expect(dialog.getByRole('button', { name: 'Save Field' })).toBeDisabled();
  await dialog.getByLabel('Access point label').fill('North gate');
  await dialog.getByRole('button', { name: 'Confirm access point' }).click();
  await dialog.getByRole('button', { name: 'Save Field' }).click();
  expect(payload).toEqual(expect.objectContaining({ accessPointLabel: 'North gate', accessLatitude: -26.96, accessLongitude: 152.96, accessCoordinateSource: 'PROPERTY_SUGGESTED' }));
});
