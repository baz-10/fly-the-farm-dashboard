import { AU_REOC_SAFETY_PLAN_STANDARD } from '../data/safetyPlanStandard';
import type {
  SafetyPlan,
  SafetyPlanTemplate,
  SafetyPlanVersion,
} from '../types/safetyPlan';

export function makeSafetyPlanTemplate(
  overrides: Partial<SafetyPlanTemplate> = {}
): SafetyPlanTemplate {
  return {
    ...AU_REOC_SAFETY_PLAN_STANDARD,
    id: 'template-1',
    name: 'Test Safety Plan Template',
    isPlatformStandard: false,
    sections: AU_REOC_SAFETY_PLAN_STANDARD.sections.map((section) => ({
      ...section,
      fields: section.fields.map((planField) => ({ ...planField })),
    })),
    ...overrides,
  };
}

export function makeSafetyPlanVersion(
  overrides: Partial<SafetyPlanVersion> = {}
): SafetyPlanVersion {
  const templateSnapshot = overrides.templateSnapshot ?? makeSafetyPlanTemplate();
  return {
    id: 'safety-plan-version-1',
    planId: 'safety-plan-1',
    version: '1.0',
    status: 'draft',
    templateSnapshot,
    sections: templateSnapshot.sections.map((section) => ({
      ...section,
      fields: section.fields.map((planField) => ({ ...planField, value: 'complete' })),
    })),
    sourceSnapshot: {
      capturedAt: '2026-07-24T00:00:00.000Z',
      job: { id: 'job-1', name: 'Test job' },
      missions: [],
      sourceLinks: [],
    },
    attachments: [],
    acknowledgements: [],
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
    revision: 1,
    ...overrides,
  };
}

export function makeSafetyPlan(
  overrides: Partial<SafetyPlan> = {}
): SafetyPlan {
  const currentVersion = makeSafetyPlanVersion();

  return {
    id: 'safety-plan-1',
    jobId: 'job-1',
    tenantId: 'tenant-1',
    revision: 1,
    status: 'draft',
    currentVersionId: currentVersion.id,
    versions: [currentVersion],
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
    ...overrides,
  };
}
