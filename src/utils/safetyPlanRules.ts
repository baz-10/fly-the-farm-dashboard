import type {
  SafetyPlan,
  SafetyPlanAcknowledgement,
  SafetyPlanField,
  SafetyPlanSection,
  SafetyPlanVersion,
} from '../types/safetyPlan';

export type SafetyPlanRuleInput = SafetyPlan;

export interface SafetyPlanAttention {
  code: 'safety_plan_absent' | 'crew_acknowledgement';
  blocking: false;
  message: string;
}

export interface PlanSubmissionResult {
  ok: boolean;
  missing: string[];
  reason?: 'current_version_missing';
}

const CANONICAL_UTC_ISO_TIMESTAMP =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/;

function currentVersion(plan: SafetyPlanRuleInput): SafetyPlanVersion | undefined {
  if (!plan.currentVersionId) return undefined;
  return plan.versions.find((version) => version.id === plan.currentVersionId);
}

function isCurrentAcknowledgement(acknowledgement: SafetyPlanAcknowledgement): boolean {
  return !acknowledgement.withdrawnAt && !acknowledgement.replacementAcknowledgementId;
}

function isEmptyValue(value: SafetyPlanField['value']): boolean {
  return value == null || (typeof value === 'string' && value.trim() === '') || (Array.isArray(value) && value.length === 0);
}

function sectionIsComplete(section: SafetyPlanSection): boolean {
  if (section.fields.length === 0) return false;
  return section.fields.filter((planField) => planField.required).every((planField) => !isEmptyValue(planField.value));
}

/** Attention informs a plan workflow only; none of these items can block a mission. */
export function getPlanAttention(
  plan?: SafetyPlanRuleInput
): SafetyPlanAttention[] {
  if (!plan) {
    return [{
      code: 'safety_plan_absent',
      blocking: false,
      message: 'No Safety Plan has been created for this job.',
    }];
  }

  const version = currentVersion(plan);
  if (!version || version.acknowledgements.some(isCurrentAcknowledgement)) return [];
  return [{
    code: 'crew_acknowledgement',
    blocking: false,
    message: 'Crew acknowledgement is still outstanding.',
  }];
}

/** Validates only a Safety Plan submission, never linked mission authorisation. */
export function canSubmitPlan(
  plan: SafetyPlanRuleInput
): PlanSubmissionResult {
  const version = currentVersion(plan);
  if (!version) {
    return {
      ok: false,
      missing: ['current_version'],
      reason: 'current_version_missing',
    };
  }
  const missing = version.sections
    .filter((section) => section.required && !sectionIsComplete(section))
    .map((section) => section.id);
  return { ok: missing.length === 0, missing };
}

/** Calculates the minimum seven-year retention date from an approval timestamp. */
export function getRetentionUntil(approvedAt: string): string {
  if (!CANONICAL_UTC_ISO_TIMESTAMP.test(approvedAt)) {
    throw new Error('approvedAt must be a canonical UTC ISO timestamp');
  }
  const retentionDate = new Date(approvedAt);
  if (Number.isNaN(retentionDate.getTime()) || retentionDate.toISOString() !== approvedAt) {
    throw new Error('approvedAt must be a valid canonical UTC ISO timestamp');
  }
  retentionDate.setUTCFullYear(retentionDate.getUTCFullYear() + 7);
  return retentionDate.toISOString();
}

/** Moves a controlled major.minor version forward by one minor revision. */
export function nextPlanVersion(current: string): string {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(current);
  if (!match) throw new Error('current version must use major.minor format');
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (!Number.isSafeInteger(major) || !Number.isSafeInteger(minor) || minor >= Number.MAX_SAFE_INTEGER) {
    throw new Error('current version components must be non-negative safe integers');
  }
  return `${major}.${minor + 1}`;
}
