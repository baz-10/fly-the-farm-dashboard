import { classifyCommercialOnboardingInvitationLink } from '../../e2e/acceptance/fixtures/commercialOnboardingInvitation';

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
