import type { User } from '../contexts/AuthContext';

const sorted = (values: string[] | undefined): string[] => [...(values ?? [])].sort();

/** Identifies every authenticated authority dimension that can change data visibility. */
export function authorityScopeKey(user: User | null): string {
  if (!user) return 'anonymous';
  const delegated = user.delegatedSupport;
  return JSON.stringify({
    userId: user.id,
    role: user.role,
    tenantId: user.tenantId ?? null,
    contractorId: user.contractorId ?? null,
    identityPlane: user.identityPlane ?? null,
    platformUserId: user.platformUserId ?? null,
    platformRoles: sorted(user.platformRoles),
    permissions: sorted(user.permissions),
    entitlements: sorted(user.entitlements),
    delegatedSupport: delegated ? {
      sessionId: delegated.sessionId,
      organisationId: delegated.organisationId,
      accessMode: delegated.accessMode,
      scopeType: delegated.scopeType,
      missionId: delegated.missionId ?? null,
      jobId: delegated.jobId ?? null,
      moduleCode: delegated.moduleCode ?? null,
      expiresAt: delegated.expiresAt,
    } : null,
  });
}
