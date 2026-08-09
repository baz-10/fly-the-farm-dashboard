export interface CommercialApplicationInput {
  businessName: string;
  administratorName: string;
  administratorEmail: string;
  administratorPhone: string;
  base: {
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    timezone: string;
    addressSource: 'GEOCODED' | 'MANUALLY_ADJUSTED';
    locationConfirmedAt: string;
  };
  consentVersion: string;
  notes: string;
}

export interface CommercialApplicationReceipt {
  submitted: true;
  applicationReference: string;
}

export type CommercialApplicationStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'DECLINED' | 'WITHDRAWN';
export type CommercialInvitationStatus = 'PENDING' | 'SENT' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';

export interface PlatformActorEvidence { id: string | null; name: string; }
export interface CommercialOnboardingEvent {
  id: string; type: string; fromStatus: string | null; toStatus: string;
  actor: PlatformActorEvidence | null; notes: string | null; createdAt: string;
}
export interface CommercialInvitationEvidence {
  id: string; status: CommercialInvitationStatus; rowVersion: number;
  deliveryStatus: 'PREPARED' | 'SENT' | 'FAILED' | null; deliveryProvider: string | null;
  issuedBy: PlatformActorEvidence | null; issuanceNotes: string | null;
  createdAt: string; sentAt: string | null; expiresAt: string;
  revokedAt: string | null; revokedBy: PlatformActorEvidence | null; revocationReason: string | null;
  acceptedAt: string | null; resultingOrganisation: { id: string; reference: string } | null;
  events: CommercialOnboardingEvent[];
}
export interface CommercialOnboardingApplication {
  id: string; applicationReference: string; businessName: string;
  administrator: { name: string; email: string; phone: string };
  base: { name: string; address: string; latitude: number; longitude: number; timezone: string; addressSource: string; locationConfirmedAt: string | null } | null;
  consentVersion: string; applicationNotes: string | null;
  status: CommercialApplicationStatus; rowVersion: number; submittedAt: string; updatedAt: string;
  reviewedAt: string | null; reviewedBy: PlatformActorEvidence | null; decisionNotes: string | null;
  events: CommercialOnboardingEvent[]; invitations: CommercialInvitationEvidence[];
}
export interface CommercialOnboardingPage {
  items: CommercialOnboardingApplication[];
  nextCursor: string | null;
}

async function request<T>(action: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
  const response = await fetch(`/api/v1/commercial-onboarding?action=${encodeURIComponent(action)}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error?.message || 'Commercial onboarding request failed.');
  return result.data as T;
}

export function submitCommercialApplication(input: CommercialApplicationInput) {
  return request<CommercialApplicationReceipt>('apply', 'POST', input);
}

export async function listCommercialApplications(cursor?: string): Promise<CommercialOnboardingPage> {
  const suffix = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
  const response = await fetch(`/api/v1/commercial-onboarding?action=list${suffix}`, {
    method: 'GET', credentials: 'same-origin',
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error?.message || 'Commercial onboarding request failed.');
  return { items: result.data || [], nextCursor: result.meta?.nextCursor || null };
}

export function decideCommercialApplication(input: { applicationId: string; expectedVersion: number; decision: 'UNDER_REVIEW' | 'APPROVE' | 'DECLINE'; notes: string }) {
  const action = input.decision === 'UNDER_REVIEW' ? 'review' : input.decision === 'APPROVE' ? 'approve' : 'decline';
  return request<Record<string, unknown>>(action, 'POST', { applicationId: input.applicationId, expectedVersion: input.expectedVersion, notes: input.notes });
}

export function issueCommercialInvitation(input: { applicationId: string; expectedVersion: number; notes: string; expiresAt?: string; resend?: boolean }) {
  return request<{ delivered: true; invitation_id: string; status: 'SENT'; row_version: number; sent_at: string }>(input.resend ? 'resend' : 'issue', 'POST', input);
}

export function revokeCommercialInvitation(input: { invitationId: string; expectedVersion: number; reason: string }) {
  return request<Record<string, unknown>>('revoke', 'POST', input);
}
