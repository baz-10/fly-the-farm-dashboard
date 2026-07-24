import { beforeEach, describe, expect, it } from 'vitest';
import { AU_REOC_SAFETY_PLAN_STANDARD } from '../../data/safetyPlanStandard';
import type { CompanySafetyPlanTemplate } from '../../types/safetyPlan';
import {
  loadCompanySafetyPlanTemplate,
  loadPublishedCompanySafetyPlanTemplate,
  publishCompanySafetyPlanTemplate,
  saveCompanySafetyPlanTemplateDraft,
} from '../safetyPlanTemplateRepository';

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

  it('persists first-use edits across reload and publishes them as master version one', async () => {
    const actor = { tenantId: 'tenant-1', userId: 'admin-1', name: 'Admin' };
    const firstDraft = await loadCompanySafetyPlanTemplate(actor);
    const edited = {
      ...firstDraft,
      sections: firstDraft.sections.map((section, index) => index === 0
        ? { ...section, title: 'Our controlled plan identity' }
        : section),
    };

    await saveCompanySafetyPlanTemplateDraft(actor, edited);
    const reloaded = await loadCompanySafetyPlanTemplate(actor);
    const published = await publishCompanySafetyPlanTemplate(actor, reloaded);

    expect(reloaded.sections[0].title).toBe('Our controlled plan identity');
    expect(published.masterVersion).toBe(1);
    expect(published.version).toBe('1.0');
  });

  it('loads only the latest tenant-published company master and never falls back to the platform standard', async () => {
    const actor = { tenantId: 'tenant-1', userId: 'admin-1', name: 'Admin' };
    await expect(loadPublishedCompanySafetyPlanTemplate(actor)).resolves.toBeUndefined();

    const draft = await loadCompanySafetyPlanTemplate(actor);
    const published = await publishCompanySafetyPlanTemplate(actor, {
      ...draft,
      sections: draft.sections.map((section, index) => index === 0
        ? { ...section, title: 'Published company identity' }
        : section),
    });
    await expect(loadPublishedCompanySafetyPlanTemplate(actor)).resolves.toEqual(published);
  });
});
