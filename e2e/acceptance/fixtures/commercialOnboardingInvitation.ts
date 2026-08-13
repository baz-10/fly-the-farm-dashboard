export type CommercialOnboardingInvitationLink = {
  kind: 'application' | 'provider';
  url: string;
};

type InvitationBoundary = {
  applicationOrigin: string;
  supabaseOrigin: string;
  invitationId: string;
};

type MailboxCredentials = {
  mailboxToken: string;
  automationBypassSecret: string;
};

type AuthoritativeOperationalRecord = {
  id: string;
  rowVersion: number;
} & Record<string, unknown>;

function operationalRecord(body: any): Partial<AuthoritativeOperationalRecord> {
  return body?.data && typeof body.data === 'object' && !Array.isArray(body.data) ? body.data : {};
}

const errorPrefix = (resource: string) => resource.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase();

export function validateCreatedOperationalRecordResponse(
  resource: string,
  status: number,
  body: any,
  labelField: string,
  expectedLabel: string,
): AuthoritativeOperationalRecord {
  const prefix = errorPrefix(resource);
  if (status !== 201) throw new Error(`${prefix}_CREATE_STATUS_INVALID`);
  const record = operationalRecord(body);
  if (typeof record.id !== 'string' || !record.id) throw new Error(`${prefix}_CREATE_ID_MISSING`);
  if (record[labelField] !== expectedLabel) throw new Error(`${prefix}_CREATE_LABEL_MISMATCH`);
  return record as AuthoritativeOperationalRecord;
}

export function validatePersistedOperationalRecordResponse(
  resource: string,
  status: number,
  body: any,
  expectedId: string,
  labelField: string,
  expectedLabel: string,
): AuthoritativeOperationalRecord {
  const prefix = errorPrefix(resource);
  if (status !== 200) throw new Error(`${prefix}_PERSISTENCE_READ_FAILED`);
  const record = operationalRecord(body);
  if (record.id !== expectedId) throw new Error(`${prefix}_PERSISTENCE_ID_MISMATCH`);
  if (record[labelField] !== expectedLabel) throw new Error(`${prefix}_PERSISTENCE_LABEL_MISMATCH`);
  return record as AuthoritativeOperationalRecord;
}

export function validateCreatedClientResponse(status: number, body: any, expectedLabel: string): AuthoritativeOperationalRecord {
  return validateCreatedOperationalRecordResponse('client', status, body, 'name', expectedLabel);
}

export function validatePersistedClientResponse(
  status: number,
  body: any,
  expectedId: string,
  expectedLabel: string,
): AuthoritativeOperationalRecord {
  return validatePersistedOperationalRecordResponse('client', status, body, expectedId, 'name', expectedLabel);
}

export function commercialOnboardingMailboxHeaders(credentials: MailboxCredentials): Record<string, string> {
  if (!credentials.mailboxToken) throw new Error('MAILBOX_BEARER_TOKEN_MISSING');
  if (!credentials.automationBypassSecret) throw new Error('VERCEL_AUTOMATION_BYPASS_MISSING');
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${credentials.mailboxToken}`,
    'x-vercel-protection-bypass': credentials.automationBypassSecret,
  };
}

export function classifyMailboxFailure(status: number, body: any): string {
  const mailboxCode = String(body?.error?.code || '');
  if (mailboxCode) return mailboxCode;
  if (status === 401) return 'VERCEL_PROTECTION_REJECTED';
  return `MAILBOX_REQUEST_FAILED_${status}`;
}

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
