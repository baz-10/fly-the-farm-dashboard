import { expect, test } from './fixtures/auth';

test.describe('public authentication', () => {
  test('shows the login form without using real credentials', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'Drone Chemical Reference' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });
});

test.describe('authenticated critical workflows', () => {
  test('navigates through Missions and opens New Mission', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('application-shell')).toBeVisible();

    await page.getByRole('link', { name: 'Missions' }).click();
    await expect(page).toHaveURL(/\/missions$/);
    await expect(page.getByRole('heading', { name: 'Missions' })).toBeVisible();

    await page.getByRole('button', { name: 'New Mission' }).click();
    await expect(page).toHaveURL(/\/missions\/new$/);
    await expect(page.getByRole('heading', { name: 'Mission Planner' })).toBeVisible();
  });

  test('opens Jobs, Aircraft, and Maintenance from grouped navigation', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('link', { name: 'Jobs' }).click();
    await expect(page.getByRole('heading', { name: 'Your Clients' })).toBeVisible();

    await page.getByRole('button', { name: 'Operational resources' }).click();
    await page.getByRole('link', { name: 'Aircraft' }).click();
    await expect(page.getByRole('heading', { name: 'Aircraft Management' })).toBeVisible();

    await page.getByRole('link', { name: 'Maintenance' }).click();
    await expect(page.getByRole('heading', { name: 'Maintenance Command' })).toBeVisible();
  });

  test('refreshes a protected nested route without losing the application shell', async ({ page }) => {
    await page.goto('/missions/new');
    await expect(page.getByRole('heading', { name: 'Mission Planner' })).toBeVisible();

    await page.reload();

    await expect(page).toHaveURL(/\/missions\/new$/);
    await expect(page.getByTestId('application-shell')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Mission Planner' })).toBeVisible();
  });

  test('keeps administrator-only maintenance financials out of contractor views', async ({ page }) => {
    await page.goto('/maintenance');
    await expect(page.getByRole('heading', { name: 'Maintenance Command' })).toBeVisible();

    const main = page.getByRole('main');
    await expect(main.getByText(/profit|margin|purchase value|maintenance cost/i)).toHaveCount(0);
  });
});

test('routes a non-destructive store read to JSON rather than the SPA', async ({ request }) => {
  const response = await request.get('/api/store?collection=ftf_missions');

  expect(response.status()).toBe(401);
  expect(response.headers()['content-type']).toContain('application/json');
  await expect(response.json()).resolves.toMatchObject({ error: expect.any(String) });
});
