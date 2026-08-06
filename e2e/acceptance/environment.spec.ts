import { expect, test } from '@playwright/test';
import { ACCEPTANCE_PREFIX, acceptanceEnvironment } from './environment';
import { diagnoseOrganisationLogin, formatOrganisationLoginFailure, summariseOrganisationAuthority } from './authDiagnostics';
import { archiveAcceptanceChain, cleanupAcceptanceRecordsByPrefix, cleanupOrder } from './fixtures/acceptanceRecords';

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

test('reports acceptance role and only approved archive permission booleans without identity data', () => {
  expect(summariseOrganisationAuthority({
    roles: ['operator', 'production_beta_acceptance'],
    permissions: ['clients.read', 'clients.archive', 'missions.archive', 'platform.super_admin'],
    user: { id: 'secret-user-id', email: 'secret@example.invalid' },
  })).toEqual({
    roles: ['operator', 'production_beta_acceptance'],
    archivePermissions: {
      clients: true,
      properties: false,
      fields: false,
      jobs: false,
      missions: true,
    },
  });
});

function response(status: number, correlationId = 'cleanup-correlation') {
  return {
    ok: () => status >= 200 && status < 300,
    status: () => status,
    headers: () => ({ 'x-correlation-id': correlationId }),
    json: async () => ({}),
  };
}

test('archives acceptance records in dependency-safe order and verifies active-register removal', async () => {
  const calls: string[] = [];
  const request = {
    delete: async (url: string) => { calls.push(`DELETE ${url.split('?')[0]}`); return response(200); },
    get: async (url: string) => { calls.push(`GET ${url.split('?')[0]}`); return response(404); },
  } as any;
  const recordKey = { missions: 'mission', jobs: 'job', fields: 'field', properties: 'property', clients: 'client' } as const;
  const records = Object.fromEntries(cleanupOrder.map((resource, index) => [recordKey[resource], {
    id: `00000000-0000-0000-0000-00000000000${index + 1}`,
    rowVersion: 1,
  }]));

  await archiveAcceptanceChain(request, records as any, { log: () => undefined });

  expect(calls.filter((entry) => entry.startsWith('DELETE'))).toEqual([
    'DELETE /api/v1/missions', 'DELETE /api/v1/jobs', 'DELETE /api/v1/fields',
    'DELETE /api/v1/properties', 'DELETE /api/v1/clients',
  ]);
  expect(calls.filter((entry) => entry.startsWith('GET'))).toHaveLength(5);
});

test('treats already archived records as idempotent and reports safe cleanup diagnostics', async () => {
  const events: string[] = [];
  const request = {
    delete: async () => response(404, 'already-archived-correlation'),
    get: async () => response(404),
  } as any;

  await archiveAcceptanceChain(request, {
    client: { id: '00000000-0000-0000-0000-000000000099', rowVersion: 1 },
  }, { log: (event) => events.push(event) });

  expect(events.join('\n')).toContain('resource=clients');
  expect(events.join('\n')).toContain('status=404');
  expect(events.join('\n')).toContain('correlation=already-archived-correlation');
  expect(events.join('\n')).not.toContain('00000000-0000-0000-0000-000000000099');
});

test('distinguishes a bounded cleanup timeout from an API rejection', async () => {
  const request = {
    delete: async () => { throw new Error('apiRequestContext.delete: Timeout 15000ms exceeded.'); },
  } as any;

  await expect(archiveAcceptanceChain(request, {
    client: { id: '00000000-0000-0000-0000-000000000099', rowVersion: 1 },
  }, { log: () => undefined })).rejects.toThrow('CLEANUP_TIMEOUT resource=clients');
});

test('discovers only controlled acceptance records and archives them dependency-first', async () => {
  const archived: string[] = [];
  const records: Record<string, any[]> = {
    missions: [{ id: 'mission-a', rowVersion: 1, title: `${ACCEPTANCE_PREFIX} old` }, { id: 'mission-real', rowVersion: 1, title: 'Real Mission' }],
    jobs: [{ id: 'job-a', rowVersion: 1, scope: `${ACCEPTANCE_PREFIX} old` }], fields: [], properties: [],
    clients: [{ id: 'client-a', rowVersion: 1, name: `${ACCEPTANCE_PREFIX} old` }, { id: 'client-real', rowVersion: 1, name: 'Genuine Client' }],
  };
  const request = {
    get: async (url: string) => {
      const resource = url.match(/\/api\/v1\/([^?]+)/)?.[1] || '';
      if (url.includes('?id=')) return response(404);
      return { ...response(200), json: async () => ({ data: records[resource] || [] }) };
    },
    delete: async (url: string) => { archived.push(url); return response(200); },
  } as any;

  await cleanupAcceptanceRecordsByPrefix(request, { log: () => undefined });

  expect(archived.map((url) => url.match(/\/api\/v1\/([^?]+)/)?.[1])).toEqual(['missions', 'jobs', 'clients']);
  expect(archived.join('\n')).not.toContain('mission-real');
  expect(archived.join('\n')).not.toContain('client-real');
});
