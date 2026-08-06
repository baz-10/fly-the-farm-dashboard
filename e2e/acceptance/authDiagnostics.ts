export type OrganisationLoginCode =
  | 'AUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'IDENTITY_RESOLUTION_FAILED'
  | 'TRUSTED_SESSION_NOT_CREATED'
  | 'WRONG_IDENTITY_PLANE'
  | 'ORGANISATION_SESSION_UNAVAILABLE'
  | 'LOGIN_REDIRECT_NOT_COMPLETED'
  | 'LOGIN_REQUEST_FAILED';

export interface OrganisationLoginSignals {
  loginStatus: number | null;
  loginError: string;
  correlationId?: string;
  sessionStatus: number | null;
  trustedSessionCookies: boolean;
  organisationResolved: boolean;
  platformIdentity: boolean;
  remainedOnLogin?: boolean;
}

export interface OrganisationLoginDiagnosis {
  code: OrganisationLoginCode;
  correlationId?: string;
}

const archiveResources = ['clients', 'properties', 'fields', 'jobs', 'missions'] as const;

export function summariseOrganisationAuthority(session: {
  roles?: unknown;
  permissions?: unknown;
}): {
  roles: string[];
  archivePermissions: Record<(typeof archiveResources)[number], boolean>;
} {
  const roles = Array.isArray(session.roles) ? session.roles.filter((role): role is string => typeof role === 'string').sort() : [];
  const permissions = new Set(Array.isArray(session.permissions)
    ? session.permissions.filter((permission): permission is string => typeof permission === 'string')
    : []);
  return {
    roles,
    archivePermissions: Object.fromEntries(archiveResources.map((resource) => [resource, permissions.has(`${resource}.archive`)])) as Record<(typeof archiveResources)[number], boolean>,
  };
}

export function diagnoseOrganisationLogin(signals: OrganisationLoginSignals): OrganisationLoginDiagnosis {
  const correlationId = signals.correlationId || undefined;
  const normalisedError = signals.loginError.trim().toLowerCase();

  if (signals.loginStatus === 401 || normalisedError.includes('invalid email or password')) {
    return { code: 'INVALID_CREDENTIALS', correlationId };
  }
  if (signals.loginStatus === 403 || normalisedError.includes('not configured for spray command')) {
    return { code: 'IDENTITY_RESOLUTION_FAILED', correlationId };
  }
  if (signals.loginStatus !== 200) {
    return { code: 'LOGIN_REQUEST_FAILED', correlationId };
  }
  if (signals.platformIdentity) {
    return { code: 'WRONG_IDENTITY_PLANE', correlationId };
  }
  if (!signals.trustedSessionCookies) {
    return { code: 'TRUSTED_SESSION_NOT_CREATED', correlationId };
  }
  if (signals.sessionStatus !== 200 || !signals.organisationResolved) {
    return { code: 'ORGANISATION_SESSION_UNAVAILABLE', correlationId };
  }
  if (signals.remainedOnLogin) {
    return { code: 'LOGIN_REDIRECT_NOT_COMPLETED', correlationId };
  }
  return { code: 'AUTHENTICATED', correlationId };
}

export function formatOrganisationLoginFailure(diagnosis: OrganisationLoginDiagnosis): string {
  const prefix = diagnosis.code === 'TRUSTED_SESSION_NOT_CREATED'
    ? 'Organisation login failed after Supabase authentication:'
    : 'Organisation login failed:';
  return `${prefix} ${diagnosis.code}${diagnosis.correlationId ? `\nCorrelation: ${diagnosis.correlationId}` : ''}`;
}
