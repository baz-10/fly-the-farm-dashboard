import { expect, test } from '@playwright/test';
import { runSingleAuthoritativeCommand } from '../acceptance/fixtures/missionCreationWorkspace';
import { isExactControlledScopeBody } from './fixtures/missionScopeRequest';

const protectedFixtureAvailable = Boolean(process.env.E2E_ORGANISATION_EMAIL
  && process.env.E2E_ORGANISATION_PASSWORD && process.env.E2E_MULTIDAY_MISSION_ID
  && process.env.E2E_MULTIDAY_FIELD_LABEL && process.env.E2E_MULTIDAY_FIELD_IDS
  && process.env.E2E_MULTIDAY_EXPECTED_REVISION && process.env.E2E_BASE_URL);

test.describe('real multi-Field multi-day Mission workspace', () => {
  test.skip(!protectedFixtureAvailable, 'CANNOT_VERIFY: protected controlled Mission fixture credentials/identity are unavailable.');

  test('renders the real Mission authority surface responsively and rejects a stale scope command once', async ({ page }) => {
    const missionId = process.env.E2E_MULTIDAY_MISSION_ID!;
    const fieldLabel = process.env.E2E_MULTIDAY_FIELD_LABEL!;
    const expectedRevision = Number(process.env.E2E_MULTIDAY_EXPECTED_REVISION!);
    const fieldIds = process.env.E2E_MULTIDAY_FIELD_IDS!.split(',').map((value) => value.trim()).filter(Boolean);
    expect(Number.isSafeInteger(expectedRevision) && expectedRevision >= 0).toBe(true);
    expect(fieldIds.length).toBeGreaterThan(0);

    await page.route('**/api/v1/mission-operations?action=scope', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.abort('blockedbyclient');
        throw new Error('CONTROLLED_SCOPE_REQUEST_METHOD_INVALID');
      }
      let body: unknown;
      try {
        body = route.request().postDataJSON();
      } catch {
        await route.abort('blockedbyclient');
        throw new Error('CONTROLLED_SCOPE_REQUEST_BODY_INVALID');
      }
      if (!isExactControlledScopeBody(body, { missionId, expectedRevision, fieldIds })) {
        await route.abort('blockedbyclient');
        throw new Error('CONTROLLED_SCOPE_REQUEST_IDENTITY_MISMATCH');
      }
      await route.fulfill({
        status: 409, contentType: 'application/json', headers: { 'X-Correlation-ID': 'task13-stale-scope' },
        body: JSON.stringify({ error: { code: 'MISSION_PACKAGE_VERSION_CONFLICT', message: 'Mission package changed. Reload before deciding.', correlationId: 'task13-stale-scope', currentVersion: 2 } }),
      });
    });
    await page.goto(`/missions/${encodeURIComponent(missionId)}?stage=review`);
    for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }]) {
      await page.setViewportSize(viewport);
      await expect(page.getByRole('heading', { name: 'Mission Planner' })).toBeVisible();
      await expect(page.getByText('Mission scope and CRP review')).toBeVisible();
      await expect(page.getByRole('checkbox', { name: fieldLabel })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }

    await runSingleAuthoritativeCommand(page, {
      origin: new URL(process.env.E2E_BASE_URL!).origin, pathname: '/api/v1/mission-operations', method: 'POST', action: 'scope',
      expectedStatus: 409, expectedCorrelationId: 'task13-stale-scope',
    }, () => page.getByRole('button', { name: 'Save Mission Field scope' }).click());
    await expect(page.getByRole('alert')).toContainText('Package changed. Reload before deciding.');
    await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible();
  });
});
