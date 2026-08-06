import { expect, test as setup } from '@playwright/test';
import { acceptanceEnvironment } from './environment';

const authFile = 'test-results/.auth/organisation.json';

setup('authenticate organisation operator', async ({ page }) => {
  const environment = acceptanceEnvironment();
  await page.goto('/login');
  await page.getByLabel('Email').fill(environment.email);
  await page.getByLabel('Password').fill(environment.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
  const sessionResponse = await page.request.get('/api/v1/session');
  expect(sessionResponse.ok()).toBeTruthy();
  const session = await sessionResponse.json();
  expect(session.data?.organisation?.id).toBeTruthy();
  expect(session.data?.operatingLocationIds?.length).toBeGreaterThan(0);
  await page.context().storageState({ path: authFile });
});
