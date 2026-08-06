import { expect, test } from '@playwright/test';
import { acceptanceEnvironment } from './environment';
import { diagnoseOrganisationLogin, formatOrganisationLoginFailure } from './authDiagnostics';

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

test('diagnoses rejected credentials without returning entered credentials', () => {
  const diagnosis = diagnoseOrganisationLogin({
    loginStatus: 401,
    loginError: 'Invalid email or password.',
    correlationId: 'safe-reference-123',
    sessionStatus: 401,
    trustedSessionCookies: false,
    organisationResolved: false,
    platformIdentity: false,
  });

  expect(diagnosis).toEqual({
    code: 'INVALID_CREDENTIALS',
    correlationId: 'safe-reference-123',
  });
  expect(formatOrganisationLoginFailure(diagnosis)).toBe(
    'Organisation login failed: INVALID_CREDENTIALS\nCorrelation: safe-reference-123',
  );
});

test('diagnoses a missing trusted session after successful authentication', () => {
  const diagnosis = diagnoseOrganisationLogin({
    loginStatus: 200,
    loginError: '',
    correlationId: 'safe-reference-456',
    sessionStatus: 401,
    trustedSessionCookies: false,
    organisationResolved: false,
    platformIdentity: false,
  });

  expect(diagnosis.code).toBe('TRUSTED_SESSION_NOT_CREATED');
  expect(formatOrganisationLoginFailure(diagnosis)).toContain('after Supabase authentication');
});

test('rejects a platform-only account from organisation acceptance', () => {
  const diagnosis = diagnoseOrganisationLogin({
    loginStatus: 200,
    loginError: '',
    correlationId: 'safe-reference-789',
    sessionStatus: 200,
    trustedSessionCookies: true,
    organisationResolved: false,
    platformIdentity: true,
  });

  expect(diagnosis.code).toBe('WRONG_IDENTITY_PLANE');
});

test('accepts only a trusted organisation session', () => {
  const diagnosis = diagnoseOrganisationLogin({
    loginStatus: 200,
    loginError: '',
    correlationId: 'safe-reference-abc',
    sessionStatus: 200,
    trustedSessionCookies: true,
    organisationResolved: true,
    platformIdentity: false,
    remainedOnLogin: false,
  });

  expect(diagnosis.code).toBe('AUTHENTICATED');
});

test('diagnoses a route defect after the trusted organisation session exists', () => {
  const diagnosis = diagnoseOrganisationLogin({
    loginStatus: 200,
    loginError: '',
    correlationId: 'safe-reference-route',
    sessionStatus: 200,
    trustedSessionCookies: true,
    organisationResolved: true,
    platformIdentity: false,
    remainedOnLogin: true,
  });

  expect(diagnosis.code).toBe('LOGIN_REDIRECT_NOT_COMPLETED');
});
