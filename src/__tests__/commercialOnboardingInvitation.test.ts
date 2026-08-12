import {
  classifyCommercialOnboardingInvitationLink,
  classifyMailboxFailure,
  commercialOnboardingMailboxHeaders,
  validateCreatedClientResponse,
  validateCreatedOperationalRecordResponse,
  validatePersistedClientResponse,
  validatePersistedOperationalRecordResponse,
} from '../../e2e/acceptance/fixtures/commercialOnboardingInvitation';

const applicationOrigin = 'https://spray-command-production-beta.vercel.app';
const supabaseOrigin = 'https://example.supabase.co';
const invitationId = '11111111-1111-4111-8111-111111111111';
const accepted = `${applicationOrigin}/onboarding/accept?invitation=${invitationId}`;

test('accepts the canonical application invitation route', () => {
  expect(classifyCommercialOnboardingInvitationLink(accepted, { applicationOrigin, supabaseOrigin, invitationId }))
    .toEqual({ kind: 'application', url: accepted });
});
test('accepts a Supabase verification URL only when its redirect is the exact invitation route', () => {
  const provider = new URL('/auth/v1/verify', supabaseOrigin);
  provider.searchParams.set('token', 'secret-provider-token');
  provider.searchParams.set('type', 'invite');
  provider.searchParams.set('redirect_to', accepted);

  expect(classifyCommercialOnboardingInvitationLink(provider.toString(), { applicationOrigin, supabaseOrigin, invitationId }))
    .toEqual({ kind: 'provider', url: provider.toString() });
});

test.each([
  ['wrong provider', 'https://attacker.invalid/auth/v1/verify?redirect_to=' + encodeURIComponent(accepted)],
  ['wrong route', `${supabaseOrigin}/auth/v1/token?redirect_to=${encodeURIComponent(accepted)}`],
  ['wrong invitation', `${supabaseOrigin}/auth/v1/verify?type=invite&redirect_to=${encodeURIComponent(`${applicationOrigin}/onboarding/accept?invitation=22222222-2222-4222-8222-222222222222`)}`],
  ['cross-origin redirect', `${supabaseOrigin}/auth/v1/verify?type=invite&redirect_to=${encodeURIComponent(`https://attacker.invalid/onboarding/accept?invitation=${invitationId}`)}`],
  ['unsupported type', `${supabaseOrigin}/auth/v1/verify?type=recovery&redirect_to=${encodeURIComponent(accepted)}`],
])('rejects an untrusted invitation link: %s', (_label, candidate) => {
  expect(classifyCommercialOnboardingInvitationLink(candidate, { applicationOrigin, supabaseOrigin, invitationId })).toBeNull();
});

test('sends separate mailbox and Vercel protection credentials', () => {
  expect(commercialOnboardingMailboxHeaders({
    mailboxToken: 'mailbox-secret',
    automationBypassSecret: 'vercel-bypass-secret',
  })).toEqual({
    Accept: 'application/json',
    Authorization: 'Bearer mailbox-secret',
    'x-vercel-protection-bypass': 'vercel-bypass-secret',
  });
});

test.each([
  [{ mailboxToken: '', automationBypassSecret: 'vercel-bypass-secret' }, 'MAILBOX_BEARER_TOKEN_MISSING'],
  [{ mailboxToken: 'mailbox-secret', automationBypassSecret: '' }, 'VERCEL_AUTOMATION_BYPASS_MISSING'],
])('fails closed when either mailbox credential is missing', (credentials, error) => {
  expect(() => commercialOnboardingMailboxHeaders(credentials)).toThrow(error);
});

test('distinguishes Vercel protection rejection from mailbox authentication rejection', () => {
  expect(classifyMailboxFailure(401, {})).toBe('VERCEL_PROTECTION_REJECTED');
  expect(classifyMailboxFailure(401, { error: { code: 'MAILBOX_BRIDGE_UNAUTHENTICATED' } }))
    .toBe('MAILBOX_BRIDGE_UNAUTHENTICATED');
});

const clientId = '33333333-3333-4333-8333-333333333333';
const clientLabel = 'SC ACCEPTANCE — CONTROLLED CLIENT';
const clientRecord = { id: clientId, name: clientLabel, rowVersion: 1 };

test('requires a 201 Client create response with an ID and exact controlled label', () => {
  expect(validateCreatedClientResponse(201, { data: clientRecord }, clientLabel)).toEqual(clientRecord);
  expect(() => validateCreatedClientResponse(200, { data: clientRecord }, clientLabel))
    .toThrow('CLIENT_CREATE_STATUS_INVALID');
  expect(() => validateCreatedClientResponse(201, { data: { name: clientLabel } }, clientLabel))
    .toThrow('CLIENT_CREATE_ID_MISSING');
  expect(() => validateCreatedClientResponse(201, { data: { ...clientRecord, name: `${clientLabel} changed` } }, clientLabel))
    .toThrow('CLIENT_CREATE_LABEL_MISMATCH');
});

test('fails closed unless exact-ID persistence returns the same Client and label', () => {
  expect(validatePersistedClientResponse(200, { data: clientRecord }, clientId, clientLabel)).toEqual(clientRecord);
  expect(() => validatePersistedClientResponse(404, { error: { code: 'NOT_FOUND' } }, clientId, clientLabel))
    .toThrow('CLIENT_PERSISTENCE_READ_FAILED');
  expect(() => validatePersistedClientResponse(200, { data: { ...clientRecord, id: '44444444-4444-4444-8444-444444444444' } }, clientId, clientLabel))
    .toThrow('CLIENT_PERSISTENCE_ID_MISMATCH');
  expect(() => validatePersistedClientResponse(200, { data: { ...clientRecord, name: `${clientLabel} other tenant` } }, clientId, clientLabel))
    .toThrow('CLIENT_PERSISTENCE_LABEL_MISMATCH');
});

test.each([
  ['properties', 'name'],
  ['fields', 'name'],
  ['jobs', 'scope'],
  ['missions', 'title'],
] as const)('requires authoritative create and exact-ID readback for %s', (resource, labelField) => {
  const record = { id: clientId, [labelField]: clientLabel, rowVersion: 1 };
  expect(validateCreatedOperationalRecordResponse(resource, 201, { data: record }, labelField, clientLabel)).toEqual(record);
  expect(validatePersistedOperationalRecordResponse(resource, 200, { data: record }, clientId, labelField, clientLabel)).toEqual(record);
});

test('fails operational creation immediately on non-201, missing ID, or label mismatch', () => {
  expect(() => validateCreatedOperationalRecordResponse('properties', 200, { data: clientRecord }, 'name', clientLabel))
    .toThrow('PROPERTIES_CREATE_STATUS_INVALID');
  expect(() => validateCreatedOperationalRecordResponse('fields', 201, { data: { name: clientLabel } }, 'name', clientLabel))
    .toThrow('FIELDS_CREATE_ID_MISSING');
  expect(() => validateCreatedOperationalRecordResponse('jobs', 201, { data: { id: clientId, scope: 'wrong' } }, 'scope', clientLabel))
    .toThrow('JOBS_CREATE_LABEL_MISMATCH');
});

test('fails operational exact-ID persistence on missing, wrong-ID, or wrong-label records', () => {
  expect(() => validatePersistedOperationalRecordResponse('properties', 404, {}, clientId, 'name', clientLabel))
    .toThrow('PROPERTIES_PERSISTENCE_READ_FAILED');
  expect(() => validatePersistedOperationalRecordResponse('fields', 200, { data: { id: 'wrong', name: clientLabel } }, clientId, 'name', clientLabel))
    .toThrow('FIELDS_PERSISTENCE_ID_MISMATCH');
  expect(() => validatePersistedOperationalRecordResponse('missions', 200, { data: { id: clientId, title: 'wrong' } }, clientId, 'title', clientLabel))
    .toThrow('MISSIONS_PERSISTENCE_LABEL_MISMATCH');
});
