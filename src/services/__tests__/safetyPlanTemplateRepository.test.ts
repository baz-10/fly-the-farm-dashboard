import { beforeEach, describe, expect, it } from 'vitest';
import { AU_REOC_SAFETY_PLAN_STANDARD } from '../../data/safetyPlanStandard';
import type { CompanySafetyPlanTemplate } from '../../types/safetyPlan';
import { publishCompanySafetyPlanTemplate } from '../safetyPlanTemplateRepository';

describe('Safety Plan company-master provenance', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('ftf_session', JSON.stringify({
      id: 'admin-1',
      tenantId: 'tenant-1',
      role: 'admin',
      name: 'Admin',
    }));
  });

  it('preserves the source standard version when publishing edited older content', async () => {
    const draft: CompanySafetyPlanTemplate = {
      ...AU_REOC_SAFETY_PLAN_STANDARD,
      id: 'master-tenant-1-2',
      tenantId: 'tenant-1',
      masterVersion: 2,
      version: '2.0',
      standardVersion: 'AU-REOC-0.9',
      sectionStandardVersions: {
        plan_identity_scope_version: 'AU-REOC-0.9',
      },
      isPlatformStandard: false,
    };

    const published = await publishCompanySafetyPlanTemplate(
      { tenantId: 'tenant-1', userId: 'admin-1', name: 'Admin' },
      draft,
    );

    expect(published.standardVersion).toBe('AU-REOC-0.9');
    expect(published.sectionStandardVersions?.plan_identity_scope_version)
      .toBe('AU-REOC-0.9');
  });
});
