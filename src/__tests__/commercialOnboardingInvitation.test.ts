import {
  classifyCommercialOnboardingInvitationLink,
  classifyMailboxFailure,
  commercialOnboardingMailboxHeaders,
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
