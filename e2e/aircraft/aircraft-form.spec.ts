import { expect, Page, test } from '@playwright/test';

const userId = '11111111-1111-4111-8111-111111111111';
const organisationId = '22222222-2222-4222-8222-222222222222';
const firstBaseId = '33333333-3333-4333-8333-333333333333';
const secondBaseId = '44444444-4444-4444-8444-444444444444';
const now = '2026-08-17T00:00:00.000Z';

function list(data: unknown[]) {
  return { data, pagination: { page: 1, pageSize: 100, total: data.length } };
}

function base(id: string, name: string) {
  return { id, name, address: '1 Test Road', timezone: 'Australia/Brisbane', rowVersion: 1, createdAt: now, updatedAt: now };
}

async function installApi(
  page: Page,
  delayedLocations: { delay?: boolean; release?: () => Promise<void> },
  activeBase: () => string = () => firstBaseId,
) {
  const activeBaseId = () => activeBase();
  await page.route('**/api/store*', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) }));
  await page.route('**/api/v1/**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(list([])) }));
  await page.route('**/api/auth', async (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ user: { id: userId, email: 'browser@example.test', name: 'Browser Operator', role: 'admin', identityPlane: 'organisation', entitlements: [] } }),
  }));
  await page.route('**/api/v1/session', async (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ data: {
      user: { id: userId, email: 'browser@example.test', name: 'Browser Operator' },
      organisation: { id: organisationId, name: 'Browser Test Organisation' },
      roles: ['organisation_admin'], permissions: ['aircraft.read', 'aircraft.create'], operatingLocationIds: [activeBaseId()],
    } }),
  }));
  await page.route('**/api/v1/operating-locations*', async (route) => {
    const fulfill = async () => {
      const id = activeBaseId();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(list([base(id, id === firstBaseId ? 'Fly The Farm Base' : 'Second Base')])) });
    };
    if (delayedLocations.delay && !delayedLocations.release) {
      await new Promise<void>((resolve) => { delayedLocations.release = async () => {
        await fulfill();
        resolve();
      }; });
    } else await fulfill();
  });
  await page.route('**/api/v1/aircraft*', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
    } else {
      await route.fallback();
    }
  });
  await page.route('**/api/v1/equipment-kits*', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) }));
}

async function fillRequiredAircraft(page: Page) {
  const fields: Array<[RegExp, string]> = [
    [/Registration/, 'FTF-BROWSER-001'], [/Serial Number/, 'SERIAL-BROWSER-001'], [/Manufacturer/, 'DJI'], [/Model/, 'T100'],
    [/MTOW/, '149.9'], [/Max Altitude/, '120'], [/Max Wind Speed/, '50'], [/Max Payload/, '75'],
    [/Battery Life/, '20'], [/Max Flight Time/, '18'], [/Service Range/, '8'],
    [/Policy Number/, 'POLICY-001'], [/Insurance Provider/, 'Browser Insurance'], [/Coverage Amount/, '5000000'], [/Hull Value/, '80000'],
  ];
  for (const [label, value] of fields) await page.getByLabel(label).fill(value);
  const dates: Array<[RegExp, string]> = [
    [/Activation Date/, '2025-10-27'], [/Last Inspection/, '2026-08-01'], [/Next Inspection Due/, '2027-08-01'],
    [/Last Major Service/, '2026-08-01'], [/Next Major Service Due/, '2027-08-01'], [/Expiry Date/, '2027-12-31'],
  ];
  for (const [label, value] of dates) await page.getByLabel(label).fill(value);
}

test('hydrates one authoritative Base before allowing a canonical single aircraft POST', async ({ page }) => {
  const delayed: { delay: boolean; release?: () => Promise<void> } = { delay: true };
  await installApi(page, delayed);
  let postCount = 0;
  let payload: Record<string, unknown> = {};
  await page.route('**/api/v1/aircraft', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    postCount += 1;
    payload = route.request().postDataJSON();
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: {
      ...payload, id: '55555555-5555-4555-8555-555555555555', assignedKits: [], notes: '', rowVersion: 1,
      createdAt: now, updatedAt: now,
    } }) });
  });

  await page.goto('/aircraft?onboarding=aircraft');
  const dialog = page.getByRole('dialog', { name: 'Add New Aircraft' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/Loading authorised Bases/)).toBeVisible();
  await expect(dialog.getByLabel(/Operating location/i)).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Create Aircraft' })).toBeDisabled();

  expect(delayed.release).toBeDefined();
  await delayed.release!();
  await expect(dialog.getByLabel(/Operating location/i)).toContainText('Fly The Farm Base');
  await expect(dialog.getByLabel(/Operating location/i)).toBeEnabled();

  await fillRequiredAircraft(page);
  await dialog.getByRole('button', { name: 'Create Aircraft' }).click();
  await expect(dialog).toBeHidden();
  expect(postCount).toBe(1);
  expect(payload.operatingLocationId).toBe(firstBaseId);
  expect(payload.activationDate).toBe('2025-10-27T00:00:00.000Z');
});

test('one failed POST produces one diagnostic submission error', async ({ page }) => {
  await installApi(page, {});
  let postCount = 0;
  await page.route('**/api/v1/aircraft', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    postCount += 1;
    await route.fulfill({
      status: 422,
      headers: { 'content-type': 'application/json', 'x-request-id': 'browser-request-123' },
      body: JSON.stringify({ error: { code: 'AIRCRAFT_INVALID', message: 'Review the aircraft details.' } }),
    });
  });

  await page.goto('/aircraft?onboarding=aircraft');
  const dialog = page.getByRole('dialog', { name: 'Add New Aircraft' });
  await expect(dialog.getByLabel(/Operating location/i)).toContainText('Fly The Farm Base');
  await fillRequiredAircraft(page);
  await dialog.getByRole('button', { name: 'Create Aircraft' }).click();

  await expect(dialog.getByRole('alert')).toHaveCount(1);
  await expect(dialog.getByRole('alert')).toContainText('Review the aircraft details. Code: AIRCRAFT_INVALID. Reference: browser-request-123.');
  expect(postCount).toBe(1);
});

test('a refreshed organisation scope cannot restore a stale Base', async ({ page }) => {
  let activeBase = firstBaseId;
  await installApi(page, {}, () => activeBase);
  await page.goto('/aircraft?onboarding=aircraft');
  let dialog = page.getByRole('dialog', { name: 'Add New Aircraft' });
  await expect(dialog.getByLabel(/Operating location/i)).toContainText('Fly The Farm Base');

  activeBase = secondBaseId;
  await page.reload();
  dialog = page.getByRole('dialog', { name: 'Add New Aircraft' });
  await expect(dialog.getByLabel(/Operating location/i)).toContainText('Second Base');
  await expect(dialog.getByLabel(/Operating location/i)).not.toContainText('Fly The Farm Base');
});
