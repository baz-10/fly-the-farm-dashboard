import type { User } from '../contexts/AuthContext';
import type { SafetyPlan, SafetyPlanVersion } from '../types/safetyPlan';

type SafetyPlanUser = Pick<User, 'role' | 'safetyPlanAuthority'>;

export function isSafetyPlanAuthority(
  user: SafetyPlanUser | null | undefined
): boolean {
  if (!user || user.role === 'client') return false;
  return user.role === 'admin'
    || (user.role === 'contractor' && user.safetyPlanAuthority === true);
}

export function canApproveSafetyPlan(
  user: SafetyPlanUser | null | undefined
): boolean {
  return isSafetyPlanAuthority(user);
}

export function canEditSafetyPlan(
  user: SafetyPlanUser | null | undefined,
  plan: SafetyPlan
): boolean {
  return Boolean(
    user
    && ['admin', 'contractor'].includes(user.role)
    && plan.status === 'draft'
    && !plan.deletedAt
  );
}

export function canDeleteSafetyPlan(
  user: SafetyPlanUser | null | undefined,
  version: SafetyPlanVersion
): boolean {
  return user?.role === 'admin' && version.status === 'draft';
}
