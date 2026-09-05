import { expect, test } from '@playwright/test';
import { runSingleAuthoritativeCommand } from '../acceptance/fixtures/missionCreationWorkspace';

const protectedFixtureAvailable = Boolean(process.env.E2E_ORGANISATION_EMAIL
  && process.env.E2E_ORGANISATION_PASSWORD && process.env.E2E_MULTIDAY_MISSION_ID
  && process.env.E2E_MULTIDAY_FIELD_LABEL && process.env.E2E_BASE_URL);

test.describe('real multi-Field multi-day Mission workspace', () => {
  test.skip(!protectedFixtureAvailable, 'CANNOT_VERIFY: protected controlled Mission fixture credentials/identity are unavailable.');

  test('renders the real Mission authority surface responsively and rejects a stale scope command once', async ({ page }) => {
    const missionId = process.env.E2E_MULTIDAY_MISSION_ID!;
    const fieldLabel = process.env.E2E_MULTIDAY_FIELD_LABEL!;
    await page.goto(`/missions/${encodeURIComponent(missionId)}?stage=review`);
    for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }]) {
      await page.setViewportSize(viewport);
      await expect(page.getByRole('heading', { name: 'Mission Planner' })).toBeVisible();
      await expect(page.getByText('Mission scope and CRP review')).toBeVisible();
      await expect(page.getByRole('checkbox', { name: fieldLabel })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }

    await page.route('**/api/v1/mission-operations?action=scope', (route) => route.fulfill({
      status: 409, contentType: 'application/json', headers: { 'X-Correlation-ID': 'task13-stale-scope' },
      body: JSON.stringify({ error: { code: 'MISSION_PACKAGE_VERSION_CONFLICT', message: 'Mission package changed. Reload before deciding.', correlationId: 'task13-stale-scope', currentVersion: 2 } }),
    }));
    await runSingleAuthoritativeCommand(page, {
      origin: new URL(process.env.E2E_BASE_URL!).origin, pathname: '/api/v1/mission-operations', method: 'POST', action: 'scope',
      expectedStatus: 409, expectedCorrelationId: 'task13-stale-scope',
    }, () => page.getByRole('button', { name: 'Save Mission Field scope' }).click());
    await expect(page.getByRole('alert')).toContainText('Package changed. Reload before deciding.');
    await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible();
  });
});
