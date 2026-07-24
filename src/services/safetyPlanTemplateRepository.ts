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

function cloneTemplate<T extends SafetyPlanTemplate>(template: T): T {
  return {
    ...template,
    sections: template.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => ({ ...field })),
    })),
  } as T;
}

function templateId(tenantId: string, version: number): string {
  return `safety-plan-master-${tenantId}-${version}`;
}

const DRAFT_RECORD_ID = 'safety-plan-template-draft';

export async function loadPublishedCompanySafetyPlanTemplate(
  actor: TemplateActor,
): Promise<CompanySafetyPlanTemplate | undefined> {
  const records = await readSharedCollection<CompanySafetyPlanTemplate>(
    PERSISTENCE_KEYS.safetyPlanTemplates,
    [],
  );
  const published = records
    .filter((record) =>
      record.tenantId === actor.tenantId
      && record.recordType === 'published'
      && Number.isSafeInteger(record.masterVersion)
    )
    .sort((left, right) => right.masterVersion - left.masterVersion)[0];
  return published ? cloneTemplate(published) : undefined;
}

async function remoteTemplateOperation(
  action: string,
  payload: CompanySafetyPlanTemplate,
  expectedRevision?: number,
): Promise<CompanySafetyPlanTemplate> {
  const response = await fetch('/api/store', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      collection: PERSISTENCE_KEYS.safetyPlanTemplates,
      action,
      payload,
      ...(expectedRevision === undefined ? {} : { expectedRevision }),
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || 'Company Safety Plan template could not be saved.');
  }
  return result.payload;
}

export async function loadCompanySafetyPlanTemplate(
  actor: TemplateActor,
): Promise<CompanySafetyPlanTemplate> {
  const records = await readSharedCollection<CompanySafetyPlanTemplate>(
    PERSISTENCE_KEYS.safetyPlanTemplates,
    [],
  );
  const owned = records.filter((record) => record.tenantId === actor.tenantId);
  const existingDraft = owned.find((record) =>
    record.id === DRAFT_RECORD_ID && record.recordType === 'draft'
  );
  if (existingDraft) return cloneTemplate(existingDraft) as CompanySafetyPlanTemplate;
  const published = owned
    .filter((record) => record.recordType !== 'draft')
    .sort((left, right) => right.masterVersion - left.masterVersion);

  const standard = cloneTemplate(published[0] ?? AU_REOC_SAFETY_PLAN_STANDARD);
  const firstMaster: CompanySafetyPlanTemplate = {
    ...standard,
    id: DRAFT_RECORD_ID,
    tenantId: actor.tenantId,
    recordType: 'draft',
    draftRevision: 1,
    standardVersion: published[0]?.standardVersion ?? AU_REOC_SAFETY_PLAN_STANDARD.version,
    sectionStandardVersions: published[0]?.sectionStandardVersions ?? Object.fromEntries(
      standard.sections.map((section) => [section.id, AU_REOC_SAFETY_PLAN_STANDARD.version])
    ),
    masterVersion: published[0]?.masterVersion ?? 0,
    version: 'draft',
    isPlatformStandard: false,
  };
  if (getPersistenceMode() === 'remote') {
    return remoteTemplateOperation('init_company_template_draft', firstMaster);
  }
  return writeSharedRecord(
    PERSISTENCE_KEYS.safetyPlanTemplates,
    DRAFT_RECORD_ID,
    firstMaster,
  );
}

export async function saveCompanySafetyPlanTemplateDraft(
  actor: TemplateActor,
  draft: CompanySafetyPlanTemplate,
): Promise<CompanySafetyPlanTemplate> {
  if (draft.tenantId !== actor.tenantId) {
    throw new Error('The company template belongs to another account.');
  }
  if (getPersistenceMode() === 'remote') {
    return remoteTemplateOperation(
      'update_company_template_draft',
      draft,
      draft.draftRevision,
    );
  }
  const saved: CompanySafetyPlanTemplate = {
    ...cloneTemplate(draft),
    id: DRAFT_RECORD_ID,
    tenantId: actor.tenantId,
    recordType: 'draft',
    draftRevision: (draft.draftRevision ?? 0) + 1,
    version: 'draft',
    publishedAt: undefined,
    publishedBy: undefined,
    isPlatformStandard: false,
  };
  return writeSharedRecord(
    PERSISTENCE_KEYS.safetyPlanTemplates,
    DRAFT_RECORD_ID,
    saved,
  );
}

export async function publishCompanySafetyPlanTemplate(
  actor: TemplateActor,
  draft: CompanySafetyPlanTemplate,
): Promise<CompanySafetyPlanTemplate> {
  if (draft.tenantId !== actor.tenantId) {
    throw new Error('The company template belongs to another account.');
  }
  if (getPersistenceMode() === 'remote') {
    return remoteTemplateOperation('publish_company_master', draft);
  }
  const records = await readSharedCollection<CompanySafetyPlanTemplate>(
    PERSISTENCE_KEYS.safetyPlanTemplates,
    [],
  );
  const latestPublishedVersion = records
    .filter((record) =>
      record.tenantId === actor.tenantId && record.recordType !== 'draft'
    )
    .reduce((latest, record) => Math.max(latest, record.masterVersion), 0);
  const nextMasterVersion = latestPublishedVersion + 1;
  const published: CompanySafetyPlanTemplate = {
    ...cloneTemplate(draft),
    id: templateId(actor.tenantId, nextMasterVersion),
    tenantId: actor.tenantId,
    recordType: 'published',
    draftRevision: undefined,
    standardVersion: draft.standardVersion,
    sectionStandardVersions: draft.sectionStandardVersions,
    masterVersion: nextMasterVersion,
    version: `${nextMasterVersion}.0`,
    publishedAt: new Date().toISOString(),
    publishedBy: { userId: actor.userId, name: actor.name || 'Company administrator' },
    isPlatformStandard: false,
  };
  const savedPublished = await writeSharedRecord(
    PERSISTENCE_KEYS.safetyPlanTemplates,
    published.id,
    published,
  );
  const refreshedDraft: CompanySafetyPlanTemplate = {
    ...cloneTemplate(draft),
    id: DRAFT_RECORD_ID,
    tenantId: actor.tenantId,
    recordType: 'draft',
    draftRevision: (draft.draftRevision ?? 0) + 1,
    masterVersion: nextMasterVersion,
    version: 'draft',
    publishedAt: undefined,
    publishedBy: undefined,
    isPlatformStandard: false,
  };
  await writeSharedRecord(
    PERSISTENCE_KEYS.safetyPlanTemplates,
    DRAFT_RECORD_ID,
    refreshedDraft,
  );
  return savedPublished;
}
