import { AU_REOC_SAFETY_PLAN_STANDARD } from '../data/safetyPlanStandard';
import type { CompanySafetyPlanTemplate, SafetyPlanTemplate } from '../types/safetyPlan';
import {
  PERSISTENCE_KEYS,
  getPersistenceMode,
  readSharedCollection,
  writeSharedRecord,
} from './persistence';

export interface TemplateActor {
  tenantId: string;
  userId: string;
  name?: string;
}

function cloneTemplate(template: SafetyPlanTemplate): SafetyPlanTemplate {
  return {
    ...template,
    sections: template.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => ({ ...field })),
    })),
  };
}

function templateId(tenantId: string, version: number): string {
  return `safety-plan-master-${tenantId}-${version}`;
}

export async function loadCompanySafetyPlanTemplate(
  actor: TemplateActor,
): Promise<CompanySafetyPlanTemplate> {
  const records = await readSharedCollection<CompanySafetyPlanTemplate>(
    PERSISTENCE_KEYS.safetyPlanTemplates,
    [],
  );
  const owned = records
    .filter((record) => record.tenantId === actor.tenantId)
    .sort((left, right) => right.masterVersion - left.masterVersion);
  if (owned[0]) return cloneTemplate(owned[0]) as CompanySafetyPlanTemplate;

  const standard = cloneTemplate(AU_REOC_SAFETY_PLAN_STANDARD);
  const firstMaster: CompanySafetyPlanTemplate = {
    ...standard,
    id: templateId(actor.tenantId, 1),
    tenantId: actor.tenantId,
    standardVersion: AU_REOC_SAFETY_PLAN_STANDARD.version,
    sectionStandardVersions: Object.fromEntries(
      standard.sections.map((section) => [section.id, AU_REOC_SAFETY_PLAN_STANDARD.version])
    ),
    masterVersion: 1,
    version: '1.0',
    isPlatformStandard: false,
  };
  return firstMaster;
}

export async function publishCompanySafetyPlanTemplate(
  actor: TemplateActor,
  draft: CompanySafetyPlanTemplate,
): Promise<CompanySafetyPlanTemplate> {
  if (draft.tenantId !== actor.tenantId) {
    throw new Error('The company template belongs to another account.');
  }
  if (getPersistenceMode() === 'remote') {
    const response = await fetch('/api/store', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collection: PERSISTENCE_KEYS.safetyPlanTemplates,
        action: 'publish_company_master',
        payload: draft,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || 'Company Safety Plan master could not be published.');
    }
    return result.payload;
  }
  const nextMasterVersion = draft.masterVersion + 1;
  const published: CompanySafetyPlanTemplate = {
    ...cloneTemplate(draft),
    id: templateId(actor.tenantId, nextMasterVersion),
    tenantId: actor.tenantId,
    standardVersion: draft.standardVersion,
    sectionStandardVersions: draft.sectionStandardVersions,
    masterVersion: nextMasterVersion,
    version: `${nextMasterVersion}.0`,
    publishedAt: new Date().toISOString(),
    publishedBy: { userId: actor.userId, name: actor.name || 'Company administrator' },
    isPlatformStandard: false,
  };
  return writeSharedRecord(
    PERSISTENCE_KEYS.safetyPlanTemplates,
    published.id,
    published,
  );
}
