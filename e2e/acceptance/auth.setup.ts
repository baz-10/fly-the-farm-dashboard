import { expect, test as setup } from '@playwright/test';
import { diagnoseOrganisationLogin, formatOrganisationLoginFailure, summariseOrganisationAuthority } from './authDiagnostics';
import { acceptanceEnvironment } from './environment';

const authFile = 'test-results/.auth/organisation.json';

setup('authenticate organisation operator', async ({ page }) => {
  const environment = acceptanceEnvironment();
  console.log(`Acceptance secrets present: email=${Boolean(environment.email)} password=${Boolean(environment.password)}`);
  await page.goto('/login');
  await page.getByLabel('Email').fill(environment.email);
  await page.getByLabel('Password').fill(environment.password);

  const [loginResponse] = await Promise.all([
    page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/auth' && response.request().method() === 'POST';
    }),
    page.getByRole('button', { name: 'Sign In' }).click(),
  ]);
  const loginPayload = await loginResponse.json().catch(() => ({}));
  const correlationId = loginResponse.headers()['x-correlation-id'] || loginPayload.correlationId;
  await page.waitForURL((url) => !/\/login(?:\?|$)/.test(url.pathname + url.search), { timeout: 5_000 }).catch(() => undefined);

  const alert = page.getByRole('alert');
  const alertCount = await alert.count();
  const visibleError = alertCount === 1 && await alert.isVisible() ? (await alert.innerText()).trim() : '';
  const sessionResponse = await page.request.get('/api/v1/session');
  const session = await sessionResponse.json().catch(() => ({}));
  const cookieNames = new Set((await page.context().cookies(environment.baseUrl)).map((cookie) => cookie.name));
  const trustedSessionCookies = cookieNames.has('ftf_access_token') && cookieNames.has('ftf_refresh_token');
  const platformIdentity = loginPayload.user?.identityPlane === 'platform' || loginPayload.user?.role === 'platform';
  const organisationResolved = Boolean(session.data?.organisation?.id);
  const remainedOnLogin = /\/login(?:\?|$)/.test(new URL(page.url()).pathname + new URL(page.url()).search);
  const diagnosis = diagnoseOrganisationLogin({
    loginStatus: loginResponse.status(),
    loginError: visibleError || String(loginPayload.error || ''),
    correlationId,
    sessionStatus: sessionResponse.status(),
    trustedSessionCookies,
    organisationResolved,
    platformIdentity,
    remainedOnLogin,
  });

  console.log(JSON.stringify({
    organisationAuthentication: diagnosis.code,
    loginStatus: loginResponse.status(),
    sessionRequested: true,
    sessionStatus: sessionResponse.status(),
    trustedSessionCookies,
    operatorVisibleError: visibleError || null,
    correlationId: correlationId || null,
  }));

  if (diagnosis.code !== 'AUTHENTICATED') {
    throw new Error(formatOrganisationLoginFailure(diagnosis));
  }

  console.log(JSON.stringify({ acceptanceAuthority: summariseOrganisationAuthority(session.data || {}) }));
  expect(session.data?.operatingLocationIds?.length).toBeGreaterThan(0);
  await page.context().storageState({ path: authFile });
});
