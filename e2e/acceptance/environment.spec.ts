import { expect, test } from '@playwright/test';
import { acceptanceEnvironment } from './environment';

test('uses an explicit HTTPS target and the controlled acceptance prefix', () => {
  const environment = acceptanceEnvironment({
    E2E_BASE_URL: 'https://spray-command-production-beta.vercel.app',
    E2E_ORGANISATION_EMAIL: 'operator@example.invalid',
    E2E_ORGANISATION_PASSWORD: 'not-logged-or-returned',
  });

  expect(environment.baseUrl).toBe('https://spray-command-production-beta.vercel.app');
  expect(environment.acceptancePrefix).toBe('SC ACCEPTANCE —');
  expect(environment.email).toBe('operator@example.invalid');
});

test('fails closed when the browser acceptance identity is incomplete', () => {
  expect(() => acceptanceEnvironment({ E2E_BASE_URL: 'https://spray-command-production-beta.vercel.app' }))
    .toThrow('E2E_ORGANISATION_EMAIL and E2E_ORGANISATION_PASSWORD are required');
});

test('rejects non-HTTPS remote acceptance targets', () => {
  expect(() => acceptanceEnvironment({
    E2E_BASE_URL: 'http://spray-command-production-beta.vercel.app',
    E2E_ORGANISATION_EMAIL: 'operator@example.invalid',
    E2E_ORGANISATION_PASSWORD: 'not-logged-or-returned',
  })).toThrow('Remote browser acceptance requires HTTPS');
});
