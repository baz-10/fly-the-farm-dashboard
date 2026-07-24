import { authenticatedTest, expect, test } from './fixtures/auth';

test('shows the login form for a genuinely signed-out browser', async ({ page }) => {
  await page.goto('/login');

  await expect(page.getByRole('heading', { name: 'Drone Chemical Reference' })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem('ftf_session'))).toBeNull();
});

authenticatedTest.describe('authenticated critical workflows', () => {
  authenticatedTest('uses compact navigation and opens New Mission', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('application-shell')).toBeVisible();

    await page.getByRole('link', { name: 'Missions' }).click();
    await expect(page).toHaveURL(/\/missions$/);
    await expect(page.getByRole('heading', { name: 'Missions' })).toBeVisible();

    await page.getByRole('button', { name: 'New Mission' }).click();
    await expect(page).toHaveURL(/\/missions\/new$/);
    await expect(page.getByRole('heading', { name: 'Mission Planner' })).toBeVisible();
  });

  authenticatedTest('opens Jobs, a Job detail, Aircraft kits, and Maintenance', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('link', { name: 'Jobs' }).click();
    await expect(page.getByRole('heading', { name: 'Your Clients' })).toBeVisible();

    await page.goto('/jobs/client/e2e-client/property/e2e-property/field/e2e-field/job/e2e-job');
    await expect(page.getByRole('heading', { name: /Spray Job/ })).toBeVisible();
    await expect(page.getByText('Synthetic weeds')).toBeVisible();

    await page.getByRole('button', { name: 'Operational resources' }).click();
    await page.getByRole('link', { name: 'Aircraft' }).click();
    await expect(page.getByRole('heading', { name: 'Aircraft Management' })).toBeVisible();
    await page.getByRole('tab', { name: /Equipment Kits/ }).click();
    await expect(page.getByRole('button', { name: 'Add new equipment kit to inventory' })).toBeVisible();

    await page.getByRole('link', { name: 'Maintenance' }).click();
    await expect(page.getByRole('heading', { name: 'Maintenance Command' })).toBeVisible();
    await expect(page.getByText(/invalid collection name|unable to load maintenance|failed to load/i)).toHaveCount(0);
    await expect(page.getByText('Synthetic Operations Truck')).toBeVisible();
  });

  authenticatedTest('refreshes a protected nested route without losing the application shell', async ({ page }) => {
    await page.goto('/missions/new');
    await expect(page.getByRole('heading', { name: 'Mission Planner' })).toBeVisible();

    await page.reload();

    await expect(page).toHaveURL(/\/missions\/new$/);
    await expect(page.getByTestId('application-shell')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Mission Planner' })).toBeVisible();
  });

  authenticatedTest('redacts seeded financial values while preserving contractor operations', async ({ page }) => {
    await page.goto('/fleet-work-packs');
    await expect(page.getByRole('heading', { name: 'Deployment assets & work packs' })).toBeVisible();
    await expect(page.getByText('Synthetic Operations Truck')).toBeVisible();
    await expect(page.getByText('Operational data remains visible')).toBeVisible();

    const pageText = await page.getByRole('main').innerText();
    expect(pageText).not.toContain('987,654.31');
    expect(pageText).not.toContain('987,654.32');
    expect(pageText).not.toContain('987,654.33');
    expect(pageText).not.toContain('987,654.34');
    expect(pageText).not.toContain('987,654.35');
    expect(pageText).not.toContain('987,654.36');
  });
});

authenticatedTest.describe('expanded mobile navigation', () => {
  authenticatedTest.use({ viewport: { width: 390, height: 844 } });

  authenticatedTest('opens the expanded drawer and routes to Maintenance', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open navigation' }).click();

    await expect(page.getByRole('button', { name: 'Daily operations' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Missions' })).toBeVisible();
    await page.getByRole('button', { name: 'Operational resources' }).click();
    await page.getByRole('link', { name: 'Maintenance' }).click();

    await expect(page).toHaveURL(/\/maintenance$/);
    await expect(page.getByRole('heading', { name: 'Maintenance Command' })).toBeVisible();
  });
});

test('performs an authenticated, successful, read-only store request with redaction', async ({ request }) => {
  const response = await request.get('/api/store?collection=ftf_missions', {
    headers: {
      'x-ftf-e2e-auth': 'contractor',
    },
  });

  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/json');
  const body = await response.json();
  expect(body.records[0]).toMatchObject({
    id: 'e2e-mission',
    missionName: 'Synthetic boundary mission',
    deploymentWorkPack: {
      assets: [{ id: 'e2e-truck', name: 'Synthetic truck' }],
      costingComplete: true,
    },
  });
  expect(body.records[0]).not.toHaveProperty('financialEstimate');
  expect(body.records[0]).not.toHaveProperty('financialActual');
  expect(JSON.stringify(body)).not.toMatch(
    /E2E_(?:COST|RATE|MARGIN|PROFIT|PURCHASE|DEPLOYMENT)_SENTINEL/
  );
});
