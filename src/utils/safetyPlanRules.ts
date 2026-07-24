import type {
  SafetyPlan,
  SafetyPlanAcknowledgement,
  SafetyPlanField,
  SafetyPlanSection,
  SafetyPlanVersion,
} from '../types/safetyPlan';

type PlanRuleSubject = Pick<SafetyPlanVersion, 'sections' | 'acknowledgements'>;

export interface SafetyPlanAttention {
  code: 'safety_plan_absent' | 'crew_acknowledgement';
  blocking: false;
  message: string;
}

export interface PlanSubmissionResult {
  ok: boolean;
  missing: string[];
}

function currentVersion(plan: SafetyPlan): SafetyPlanVersion | undefined {
  return plan.versions.find((version) => version.id === plan.currentVersionId) ?? plan.versions.at(-1);
}

function asRuleSubject(plan: (SafetyPlan & Partial<PlanRuleSubject>) | SafetyPlanVersion): PlanRuleSubject | undefined {
  if ('sections' in plan && Array.isArray(plan.sections)) return plan as PlanRuleSubject;
  if ('versions' in plan) return currentVersion(plan);
  return plan;
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
  plan?: (SafetyPlan & Partial<PlanRuleSubject>) | SafetyPlanVersion
): SafetyPlanAttention[] {
  if (!plan) {
    return [{
      code: 'safety_plan_absent',
      blocking: false,
      message: 'No Safety Plan has been created for this job.',
    }];
  }

  const subject = asRuleSubject(plan);
  if (!subject || subject.acknowledgements.length > 0) return [];
  return [{
    code: 'crew_acknowledgement',
    blocking: false,
    message: 'Crew acknowledgement is still outstanding.',
  }];
}

/** Validates only a Safety Plan submission, never linked mission authorisation. */
export function canSubmitPlan(
  plan: (SafetyPlan & Partial<PlanRuleSubject>) | SafetyPlanVersion
): PlanSubmissionResult {
  const subject = asRuleSubject(plan);
  const missing = (subject?.sections ?? [])
    .filter((section) => section.required && !sectionIsComplete(section))
    .map((section) => section.id);
  return { ok: missing.length === 0, missing };
}

/** Calculates the minimum seven-year retention date from an approval timestamp. */
export function getRetentionUntil(approvedAt: string): string {
  const retentionDate = new Date(approvedAt);
  if (Number.isNaN(retentionDate.getTime())) throw new Error('approvedAt must be a valid ISO timestamp');
  retentionDate.setUTCFullYear(retentionDate.getUTCFullYear() + 7);
  return retentionDate.toISOString();
}

/** Moves a controlled major.minor version forward by one minor revision. */
export function nextPlanVersion(current: string): string {
  const match = /^(\d+)\.(\d+)$/.exec(current);
  if (!match) throw new Error('current version must use major.minor format');
  return `${match[1]}.${Number(match[2]) + 1}`;
}
