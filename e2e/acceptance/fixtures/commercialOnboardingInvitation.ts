export type CommercialOnboardingInvitationLink = {
  kind: 'application' | 'provider';
  url: string;
};

type InvitationBoundary = {
  applicationOrigin: string;
  supabaseOrigin: string;
  invitationId: string;
};

function isExactApplicationInvitation(url: URL, boundary: InvitationBoundary) {
  return url.origin === boundary.applicationOrigin
    && url.pathname === '/onboarding/accept'
    && url.searchParams.get('invitation') === boundary.invitationId;
}
export function classifyCommercialOnboardingInvitationLink(
  candidate: string,
  boundary: InvitationBoundary,
): CommercialOnboardingInvitationLink | null {
  try {
    const url = new URL(candidate);
    if (isExactApplicationInvitation(url, boundary)) return { kind: 'application', url: candidate };
    if (url.origin !== boundary.supabaseOrigin || url.pathname !== '/auth/v1/verify') return null;
    if (!['invite', 'magiclink', 'signup'].includes(url.searchParams.get('type') || '')) return null;
    const redirect = url.searchParams.get('redirect_to');
    if (!redirect || !isExactApplicationInvitation(new URL(redirect), boundary)) return null;
    return { kind: 'provider', url: candidate };
  } catch {
    return null;
  }
}
