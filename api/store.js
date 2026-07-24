const { authenticateRequest } = require('../server/session');
const { createHttpError, supabaseRequest } = require('../server/supabase');
const { randomUUID } = require('node:crypto');

const TABLE_NAME = 'ftf_store';
const SINGLETON_RECORD_ID = '__value__';
const MAX_RECORDS_PER_WRITE = 500;
const COLLECTION_POLICIES = {
  ftf_aircraft_data: { read: ['admin', 'contractor'], write: ['admin', 'contractor'] },
  ftf_missions: { read: ['admin', 'contractor'], write: ['admin', 'contractor'] },
  ftf_mission_templates: { read: ['admin', 'contractor'], write: ['admin', 'contractor'] },
  ftf_maintenance: { read: ['admin', 'contractor'], write: ['admin', 'contractor'] },
  ftf_pmav_checks: { read: ['admin', 'contractor'], write: ['admin', 'contractor'] },
  ftf_work_packs: { read: ['admin', 'contractor'], write: ['admin', 'contractor'] },
  ftf_safety_plan_templates: { read: ['admin', 'contractor'], write: ['admin'] },
  ftf_safety_plans: { read: ['admin', 'contractor'], write: ['admin', 'contractor'] },
  ftf_safety_plan_audit: { read: ['admin', 'contractor'], write: ['admin', 'contractor'] },
};
const ALLOWED_COLLECTIONS = new Set(Object.keys(COLLECTION_POLICIES));
const SAFETY_PLAN_COLLECTION = 'ftf_safety_plans';
const SAFETY_PLAN_AUDIT_COLLECTION = 'ftf_safety_plan_audit';
const SAFETY_PLAN_TEMPLATE_COLLECTION = 'ftf_safety_plan_templates';
const SAFETY_PLAN_FIELD_TYPES = new Set([
  'text',
  'textarea',
  'date',
  'date_range',
  'boolean',
  'select',
  'multi_select',
  'person_list',
  'asset_list',
  'attachment_list',
]);
const SAFETY_PLAN_ACTIONS = new Set([
  'created',
  'source_refreshed',
  'field_changed',
  'attachment_changed',
  'submitted',
  'returned_to_draft',
  'approved',
  'acknowledged',
  'revised',
  'superseded',
  'shared',
  'pdf_generated',
  'draft_deleted',
  'draft_restored',
  'not_required_selected',
]);

function redactAssetCosts(asset) {
  if (!asset || typeof asset !== 'object') return asset;
  const { costs: _costs, ...safeAsset } = asset;
  return safeAsset;
}

function redactDeploymentWorkPack(workPack) {
  if (!workPack || typeof workPack !== 'object') return workPack;
  const { estimatedDeploymentCost: _estimatedDeploymentCost, ...safeWorkPack } = workPack;
  return {
    ...safeWorkPack,
    assets: Array.isArray(workPack.assets) ? workPack.assets.map(redactAssetCosts) : workPack.assets,
  };
}

function redactMaintenanceCosts(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  return {
    ...payload,
    records: Array.isArray(payload.records)
      ? payload.records.map((record) => {
        const { cost: _cost, ...safeRecord } = record || {};
        return safeRecord;
      })
      : payload.records,
  };
}

function contractorSafePayload(collection, payload) {
  if (!payload || typeof payload !== 'object') return payload;
  if (collection === 'ftf_missions') {
    const {
      financialEstimate: _financialEstimate,
      financialActual: _financialActual,
      ...safePayload
    } = payload;
    return { ...safePayload, deploymentWorkPack: redactDeploymentWorkPack(payload.deploymentWorkPack) };
  }
  if (collection === 'ftf_work_packs') {
    return {
      ...payload,
      assets: Array.isArray(payload.assets) ? payload.assets.map(redactAssetCosts) : payload.assets,
      trucks: Array.isArray(payload.trucks) ? payload.trucks.map(redactAssetCosts) : payload.trucks,
    };
  }
  if (collection === 'ftf_maintenance') return redactMaintenanceCosts(payload);
  return payload;
}

function preserveAssetCosts(incomingAssets, storedAssets) {
  if (!Array.isArray(incomingAssets)) return incomingAssets;
  const storedById = new Map((Array.isArray(storedAssets) ? storedAssets : []).map((asset) => [asset?.id, asset]));
  return incomingAssets.map((asset) => {
    const safeAsset = redactAssetCosts(asset);
    const storedCosts = storedById.get(asset?.id)?.costs;
    return storedCosts === undefined ? safeAsset : { ...safeAsset, costs: storedCosts };
  });
}

function preserveMaintenanceCosts(incomingRecords, storedRecords) {
  if (!Array.isArray(incomingRecords)) return incomingRecords;
  const storedById = new Map((Array.isArray(storedRecords) ? storedRecords : []).map((record) => [record?.id, record]));
  return incomingRecords.map((record) => {
    const { cost: _cost, ...safeRecord } = record || {};
    const storedCost = storedById.get(record?.id)?.cost;
    return storedCost === undefined ? safeRecord : { ...safeRecord, cost: storedCost };
  });
}

function contractorWritePayload(collection, incoming, stored) {
  const safe = contractorSafePayload(collection, incoming);
  if (collection === 'ftf_missions') {
    const restoredFinancials = {
      ...(stored?.financialEstimate === undefined
        ? {}
        : { financialEstimate: stored.financialEstimate }),
      ...(stored?.financialActual === undefined
        ? {}
        : { financialActual: stored.financialActual }),
    };
    if (!safe?.deploymentWorkPack) {
      return { ...safe, ...restoredFinancials };
    }
    const storedWorkPack = stored?.deploymentWorkPack;
    return {
      ...safe,
      ...restoredFinancials,
      deploymentWorkPack: {
        ...safe.deploymentWorkPack,
        assets: preserveAssetCosts(safe.deploymentWorkPack.assets, storedWorkPack?.assets),
        ...(storedWorkPack?.estimatedDeploymentCost === undefined
          ? {}
          : { estimatedDeploymentCost: storedWorkPack.estimatedDeploymentCost }),
      },
    };
  }
  if (collection === 'ftf_work_packs') {
    return {
      ...safe,
      assets: preserveAssetCosts(safe.assets, stored?.assets),
      trucks: preserveAssetCosts(safe.trucks, stored?.trucks),
    };
  }
  if (collection === 'ftf_maintenance') {
    return {
      ...safe,
      records: preserveMaintenanceCosts(safe.records, stored?.records),
    };
  }
  return safe;
}

function getJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) return JSON.parse(req.body);
  return {};
}

function validateCollection(value) {
  const collection = String(value || '').trim();
  if (!ALLOWED_COLLECTIONS.has(collection)) {
    throw createHttpError(400, 'Invalid collection name.');
  }
  return collection;
}

function assertCollectionPermission(user, collection, action) {
  const roles = COLLECTION_POLICIES[collection]?.[action] || [];
  if (!roles.includes(user.role)) {
    const message = collection.startsWith('ftf_safety_plan_')
      ? 'This account cannot access the requested storage collection.'
      : 'This account cannot access mission workflow storage.';
    throw createHttpError(403, message);
  }
}

function isSafetyPlanAuthority(user) {
  return user.role === 'admin'
    || (user.role === 'contractor' && user.safetyPlanAuthority === true);
}

function currentSafetyPlanVersion(plan) {
  if (!plan?.currentVersionId || !Array.isArray(plan.versions)) return null;
  return plan.versions.find((version) => version?.id === plan.currentVersionId) || null;
}

function contractorCanAccessSafetyPlan(user, plan) {
  if (!plan || user.role !== 'contractor') return false;
  if (isSafetyPlanAuthority(user)) return true;
  if (plan.notRequiredActor?.userId === user.id) return true;
  const version = currentSafetyPlanVersion(plan);
  return Boolean(
    version
    && (
      version.createdBy?.userId === user.id
      || (Array.isArray(version.sourceSnapshot?.crew)
        && version.sourceSnapshot.crew.some((person) => person?.id === user.id))
    )
  );
}

function canReadSafetyPlan(user, plan) {
  return user.role === 'admin'
    || contractorCanAccessSafetyPlan(user, plan);
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function canonicalise(value) {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalise(value[key])])
  );
}

function valuesEqual(left, right) {
  return JSON.stringify(canonicalise(left)) === JSON.stringify(canonicalise(right));
}

function assertUniqueIds(records, label) {
  const ids = records.map((record) => record?.id);
  if (new Set(ids).size !== ids.length) {
    throw createHttpError(400, `${label} ids must be unique.`);
  }
}

function requiredString(value, label, maxLength = 5000) {
  if (typeof value !== 'string') {
    throw createHttpError(400, `${label} is invalid.`);
  }
  const result = value.trim();
  if (!result || result.length > maxLength) {
    throw createHttpError(400, `${label} is invalid.`);
  }
  return result;
}

function requiredBoolean(value, label) {
  if (typeof value !== 'boolean') {
    throw createHttpError(400, `${label} is invalid.`);
  }
  return value;
}

function normaliseCompanyTemplateContent(payload) {
  if (!isObject(payload) || payload.isPlatformStandard !== false) {
    throw createHttpError(400, 'Company Safety Plan master content is invalid.');
  }
  const sections = payload.sections;
  if (!Array.isArray(sections) || sections.length === 0 || sections.length > 100) {
    throw createHttpError(400, 'Company Safety Plan master sections are invalid.');
  }
  assertUniqueIds(sections, 'Safety Plan section');
  const normalisedSections = sections.map((section) => {
    if (!isObject(section) || !Array.isArray(section.fields) || section.fields.length === 0) {
      throw createHttpError(400, 'Each Safety Plan section requires fields.');
    }
    assertUniqueIds(section.fields, `Safety Plan field in ${section.id || 'section'}`);
    return {
      id: requiredString(section.id, 'Safety Plan section id', 150),
      title: requiredString(section.title, 'Safety Plan section title', 500),
      helpText: requiredString(section.helpText, 'Safety Plan section guidance'),
      required: requiredBoolean(section.required, 'Safety Plan section required flag'),
      companyEditable: requiredBoolean(
        section.companyEditable,
        'Safety Plan section company-editable flag'
      ),
      fields: section.fields.map((field) => {
        if (!isObject(field) || !SAFETY_PLAN_FIELD_TYPES.has(field.type)) {
          throw createHttpError(400, 'Safety Plan field type is invalid.');
        }
        return {
          id: requiredString(field.id, 'Safety Plan field id', 150),
          label: requiredString(field.label, 'Safety Plan field label', 500),
          helpText: requiredString(field.helpText, 'Safety Plan field help text'),
          type: field.type,
          required: requiredBoolean(field.required, 'Safety Plan field required flag'),
          companyEditable: requiredBoolean(
            field.companyEditable,
            'Safety Plan field company-editable flag'
          ),
        };
      }),
    };
  });
  const sectionIds = new Set(normalisedSections.map((section) => section.id));
  const sectionStandardVersions = isObject(payload.sectionStandardVersions)
    ? Object.fromEntries(Object.entries(payload.sectionStandardVersions).map(([sectionId, version]) => {
      if (!sectionIds.has(sectionId)) {
        throw createHttpError(400, 'Safety Plan section provenance references an unknown section.');
      }
      return [sectionId, requiredString(version, 'Safety Plan section standard version', 100)];
    }))
    : undefined;
  return {
    name: requiredString(payload.name, 'Safety Plan template name', 500),
    jurisdiction: requiredString(payload.jurisdiction, 'Safety Plan jurisdiction', 50),
    notice: requiredString(payload.notice, 'Safety Plan notice'),
    standardVersion: requiredString(payload.standardVersion, 'Safety Plan standard version', 100),
    ...(sectionStandardVersions ? { sectionStandardVersions } : {}),
    isPlatformStandard: false,
    sections: normalisedSections,
  };
}

function immutableVersionContent(version) {
  if (!isObject(version)) return version;
  const {
    status: _status,
    revision: _revision,
    updatedAt: _updatedAt,
    ...content
  } = version;
  return content;
}

function submittedVersionContent(version) {
  if (!isObject(version)) return version;
  const {
    status: _status,
    revision: _revision,
    updatedAt: _updatedAt,
    approvedBy: _approvedBy,
    approvedAt: _approvedAt,
    contentDigest: _contentDigest,
    retentionUntil: _retentionUntil,
    ...content
  } = version;
  return content;
}

function safetyPlanActor(user) {
  return {
    userId: user.id,
    name: user.name,
    role: user.role,
    operationalAuthority: isSafetyPlanAuthority(user),
  };
}

function normaliseSafetyPlanProvenance(actor, stored, incoming, now) {
  if (!isObject(incoming)) return incoming;
  if (incoming.deletedAt !== undefined || incoming.deletedBy !== undefined) {
    throw createHttpError(403, 'Safety Plan deletion metadata is server-managed.');
  }

  let normalised = {
    ...incoming,
    createdAt: stored?.createdAt || now,
    updatedAt: now,
  };
  if (stored && Array.isArray(incoming.versions)) {
    const storedById = new Map((stored.versions || []).map((version) => [version?.id, version]));
    normalised = {
      ...normalised,
      versions: incoming.versions.map((version) => {
        const prior = storedById.get(version?.id);
        if (prior?.status !== 'submitted') return version;
        if (version.status === 'approved') {
          return {
            ...version,
            approvedBy: safetyPlanActor(actor),
            approvedAt: now,
          };
        }
        if (version.status === 'draft') {
          const {
            approvedBy: _approvedBy,
            approvedAt: _approvedAt,
            contentDigest: _contentDigest,
            retentionUntil: _retentionUntil,
            ...draftVersion
          } = version;
          return draftVersion;
        }
        return version;
      }),
    };
  }
  if (incoming.status === 'not_required') {
    return {
      ...normalised,
      notRequiredActor: safetyPlanActor(actor),
      notRequiredSelectedAt: now,
    };
  }
  const {
    notRequiredActor: _notRequiredActor,
    notRequiredSelectedAt: _notRequiredSelectedAt,
    notRequiredReason: _notRequiredReason,
    ...withoutNotRequired
  } = normalised;
  return withoutNotRequired;
}

function assertIncomingPlanShape(actor, incoming, recordId) {
  if (!isObject(incoming) || incoming.id !== recordId) {
    throw createHttpError(400, 'Safety Plan id must match its record id.');
  }
  if (incoming.tenantId !== actor.tenantId) {
    throw createHttpError(403, 'Safety Plan tenant ownership cannot be changed.');
  }
  if (!Array.isArray(incoming.versions)) {
    throw createHttpError(400, 'Safety Plan versions must be an array.');
  }
  if (!Number.isSafeInteger(incoming.revision) || incoming.revision < 1) {
    throw createHttpError(400, 'Safety Plan record revision is invalid.');
  }
  assertUniqueIds(incoming.versions, 'Safety Plan version');
  if (incoming.status === 'not_required') {
    if (incoming.currentVersionId != null || incoming.versions.length !== 0) {
      throw createHttpError(400, 'A not-required Safety Plan cannot retain versions.');
    }
    if (typeof incoming.notRequiredReason !== 'string' || !incoming.notRequiredReason.trim()) {
      throw createHttpError(400, 'A not-required Safety Plan requires a reason.');
    }
    return;
  }
  if (
    incoming.notRequiredReason !== undefined
    || incoming.notRequiredActor !== undefined
    || incoming.notRequiredSelectedAt !== undefined
  ) {
    throw createHttpError(400, 'Not-required provenance is invalid for an active Safety Plan.');
  }
  const current = incoming.versions.find((version) => version?.id === incoming.currentVersionId);
  if (!current || current.status !== incoming.status) {
    throw createHttpError(400, 'Safety Plan status must match its current version.');
  }
  for (const version of incoming.versions) {
    if (!isObject(version) || !version.id || version.planId !== incoming.id) {
      throw createHttpError(400, 'Safety Plan version identity is invalid.');
    }
    if (!Number.isSafeInteger(version.revision) || version.revision < 1) {
      throw createHttpError(400, 'Safety Plan revision is invalid.');
    }
  }
}

function assertVersionTransition(actor, storedVersion, incomingVersion) {
  if (!incomingVersion) {
    throw createHttpError(
      409,
      'Safety Plan versions cannot be removed by an update. Use recoverable draft deletion.'
    );
  }
  if (incomingVersion.planId !== storedVersion.planId) {
    throw createHttpError(403, 'Safety Plan version ownership cannot be changed.');
  }
  if (valuesEqual(storedVersion, incomingVersion)) return;

  if (storedVersion.status === 'superseded') {
    throw createHttpError(403, 'Superseded Safety Plan versions are immutable.');
  }
  if (storedVersion.status === 'approved') {
    const isSuperseding = incomingVersion.status === 'superseded'
      && isSafetyPlanAuthority(actor)
      && valuesEqual(
        immutableVersionContent(storedVersion),
        immutableVersionContent(incomingVersion)
      );
    if (!isSuperseding) {
      throw createHttpError(403, 'Approved Safety Plan snapshots are immutable.');
    }
  } else {
    const isSubmitted = storedVersion.status === 'submitted';
    const allowedStatuses = isSubmitted
      ? ['draft', 'submitted', 'approved']
      : ['draft', 'submitted'];
    if (!allowedStatuses.includes(incomingVersion.status)) {
      throw createHttpError(403, 'Safety Plan workflow transition is not permitted.');
    }
    if (isSubmitted) {
      if (incomingVersion.status === 'submitted') {
        throw createHttpError(403, 'Submitted Safety Plan versions are immutable.');
      }
      if (!isSafetyPlanAuthority(actor)) {
        throw createHttpError(403, 'Only a Safety Plan authority may transition a submitted plan.');
      }
      if (!valuesEqual(
        submittedVersionContent(storedVersion),
        submittedVersionContent(incomingVersion)
      )) {
        throw createHttpError(403, 'Submitted Safety Plan content is immutable.');
      }
    }
  }

  if (incomingVersion.revision !== storedVersion.revision + 1) {
    throw createHttpError(409, 'Safety Plan revision is stale.');
  }
}

function assertSubmittedCurrentBoundary(stored, incoming) {
  const storedCurrent = (stored.versions || []).find(
    (version) => version?.id === stored.currentVersionId
  );
  if (storedCurrent?.status !== 'submitted') return;

  if (incoming.currentVersionId !== stored.currentVersionId) {
    throw createHttpError(409, 'A submitted Safety Plan must retain its current version identity.');
  }

  const storedIds = (stored.versions || []).map((version) => version?.id).sort();
  const incomingIds = (incoming.versions || []).map((version) => version?.id).sort();
  if (!valuesEqual(storedIds, incomingIds)) {
    throw createHttpError(409, 'A submitted Safety Plan must retain its exact version set.');
  }

  const incomingById = new Map(incoming.versions.map((version) => [version?.id, version]));
  for (const storedVersion of stored.versions || []) {
    if (storedVersion.id === stored.currentVersionId) continue;
    if (!valuesEqual(storedVersion, incomingById.get(storedVersion.id))) {
      throw createHttpError(403, 'Only the current submitted version may transition.');
    }
  }

  const incomingCurrent = incomingById.get(stored.currentVersionId);
  if (!['submitted', 'draft', 'approved'].includes(incomingCurrent?.status)) {
    throw createHttpError(403, 'Submitted Safety Plan transition is not permitted.');
  }
}

function safetyPlanConflict(currentRevision, message = 'Safety Plan changed in another session. Refresh and try again.') {
  const error = createHttpError(409, message);
  error.code = 'SAFETY_PLAN_CONFLICT';
  if (Number.isSafeInteger(currentRevision)) error.currentRevision = currentRevision;
  return error;
}

function assertSafetyPlanTransition({ actor, stored, incoming, recordId }) {
  assertIncomingPlanShape(actor, incoming, recordId);

  if (!stored) {
    if (incoming.revision !== 1) {
      throw createHttpError(409, 'A new Safety Plan must start at revision 1.');
    }
    if (!['draft', 'not_required'].includes(incoming.status)) {
      throw createHttpError(403, 'A new Safety Plan must start as a draft.');
    }
    if (incoming.versions.some((version) => version.status !== 'draft' || version.revision !== 1)) {
      throw createHttpError(403, 'A new Safety Plan may contain only initial draft versions.');
    }
    return;
  }
  if (stored.deletedAt) {
    throw createHttpError(409, 'Restore this deleted Safety Plan before changing it.');
  }
  if (stored.tenantId !== actor.tenantId || incoming.tenantId !== stored.tenantId) {
    throw createHttpError(403, 'Safety Plan tenant ownership cannot be changed.');
  }
  if (incoming.id !== stored.id || incoming.jobId !== stored.jobId) {
    throw createHttpError(403, 'Safety Plan identity cannot be changed.');
  }
  if (incoming.createdAt !== stored.createdAt) {
    throw createHttpError(403, 'Safety Plan creation provenance cannot be changed.');
  }
  if (!Number.isSafeInteger(stored.revision) || incoming.revision !== stored.revision + 1) {
    throw safetyPlanConflict(stored.revision, 'Safety Plan record revision is stale.');
  }
  assertSubmittedCurrentBoundary(stored, incoming);

  const incomingById = new Map(incoming.versions.map((version) => [version?.id, version]));
  for (const storedVersion of stored.versions || []) {
    assertVersionTransition(actor, storedVersion, incomingById.get(storedVersion?.id));
  }

  const storedIds = new Set((stored.versions || []).map((version) => version?.id));
  for (const incomingVersion of incoming.versions) {
    if (storedIds.has(incomingVersion.id)) continue;
    if (incomingVersion.status !== 'draft' || incomingVersion.revision !== 1) {
      throw createHttpError(403, 'New Safety Plan versions must start as drafts.');
    }
  }
}

function assertSafetyAuditAction(actor, plan, event) {
  if (!SAFETY_PLAN_ACTIONS.has(event.action)) {
    throw createHttpError(400, 'Safety audit action is invalid.');
  }
  if (['draft_deleted', 'draft_restored'].includes(event.action)) {
    throw createHttpError(403, 'This Safety audit action is server-managed.');
  }

  if (event.action === 'not_required_selected') {
    if (event.versionId != null || plan.status !== 'not_required') {
      throw createHttpError(409, 'Safety audit action does not match the linked plan state.');
    }
    return;
  }

  if (!event.versionId) {
    throw createHttpError(400, 'Safety audit action requires a linked version.');
  }
  const version = (plan.versions || []).find((candidate) => candidate?.id === event.versionId);
  if (!version) {
    throw createHttpError(409, 'Safety audit version does not exist on the linked plan.');
  }

  const authorityActions = new Set(['returned_to_draft', 'approved', 'superseded']);
  if (authorityActions.has(event.action) && !isSafetyPlanAuthority(actor)) {
    throw createHttpError(403, 'Only a Safety Plan authority may record this action.');
  }
  const allowedStatuses = {
    created: ['draft'],
    source_refreshed: ['draft'],
    field_changed: ['draft'],
    attachment_changed: ['draft'],
    submitted: ['submitted'],
    returned_to_draft: ['draft'],
    approved: ['approved'],
    acknowledged: ['submitted', 'approved'],
    revised: ['draft'],
    superseded: ['superseded'],
    shared: ['approved'],
    pdf_generated: ['approved'],
  }[event.action];
  if (!allowedStatuses?.includes(version.status)) {
    throw createHttpError(409, 'Safety audit action does not match the linked version state.');
  }
}

const STANDALONE_SAFETY_AUDIT_ACTIONS = new Set([
  'acknowledged',
  'shared',
  'pdf_generated',
]);

function deriveSafetyPlanMutationAudit(stored, incoming, sourceRefreshMetadata) {
  if (!stored) {
    return incoming.status === 'not_required'
      ? { action: 'not_required_selected' }
      : { action: 'created', versionId: incoming.currentVersionId };
  }

  if (!stored.deletedAt && incoming.deletedAt) {
    return { action: 'draft_deleted', versionId: incoming.currentVersionId };
  }
  if (stored.deletedAt && !incoming.deletedAt) {
    return { action: 'draft_restored', versionId: incoming.currentVersionId };
  }
  if (incoming.status === 'not_required' && stored.status !== 'not_required') {
    return { action: 'not_required_selected' };
  }

  const storedVersions = new Map(
    (stored.versions || []).map((version) => [version?.id, version])
  );
  const addedVersion = (incoming.versions || []).find(
    (version) => !storedVersions.has(version?.id)
  );
  if (addedVersion) {
    return { action: 'revised', versionId: addedVersion.id };
  }

  const supersededVersion = (incoming.versions || []).find((version) => {
    const previous = storedVersions.get(version?.id);
    return previous && previous.status !== 'superseded' && version.status === 'superseded';
  });
  if (supersededVersion) {
    return { action: 'superseded', versionId: supersededVersion.id };
  }

  if (stored.status !== incoming.status) {
    if (incoming.status === 'submitted') {
      return { action: 'submitted', versionId: incoming.currentVersionId };
    }
    if (incoming.status === 'approved') {
      return { action: 'approved', versionId: incoming.currentVersionId };
    }
    if (incoming.status === 'superseded') {
      return { action: 'superseded', versionId: incoming.currentVersionId };
    }
    if (incoming.status === 'draft' && stored.status === 'submitted') {
      return { action: 'returned_to_draft', versionId: incoming.currentVersionId };
    }
  }

  if (sourceRefreshMetadata) {
    return {
      action: 'source_refreshed',
      versionId: incoming.currentVersionId,
      before: sourceRefreshMetadata.before,
      after: sourceRefreshMetadata.after,
    };
  }

  return {
    action: 'field_changed',
    versionId: incoming.currentVersionId,
  };
}

const SOURCE_REFRESH_CONTEXT_CATEGORIES = new Set([
  'company',
  'job',
  'missions',
  'client',
  'property',
  'field',
  'crew',
  'assets',
  'chemicals',
  'emergencyContacts',
  'siteMap',
]);
const SOURCE_REFRESH_ACTIONS = new Set([
  'accept_source_value',
  'keep_company_value',
  'remove',
]);

function sourceRefreshDecisionIds(storedVersion, incomingVersion) {
  const ids = new Set();
  for (const snapshot of [
    storedVersion?.sourceSnapshot,
    incomingVersion?.sourceSnapshot,
  ]) {
    for (const hazard of snapshot?.hazards || []) {
      if (typeof hazard?.id === 'string' && hazard.id.trim()) ids.add(hazard.id);
    }
    for (const category of SOURCE_REFRESH_CONTEXT_CATEGORIES) {
      if (snapshot?.[category] !== undefined) ids.add(`context:${category}`);
    }
  }
  for (const version of [storedVersion, incomingVersion]) {
    for (const section of version?.sections || []) {
      for (const field of section?.fields || []) {
        if (typeof field?.id === 'string' && field.id.trim()) {
          ids.add(`field:${field.id}`);
        }
      }
    }
  }
  return ids;
}

function canonicalSourceRefreshMetadata(storedVersion, incomingVersion, intent) {
  const storedSnapshot = storedVersion?.sourceSnapshot;
  const incomingSnapshot = incomingVersion?.sourceSnapshot;
  const beforeCount = Array.isArray(storedSnapshot?.hazards)
    ? storedSnapshot.hazards.length
    : 0;
  const afterCount = Array.isArray(incomingSnapshot?.hazards)
    ? incomingSnapshot.hazards.length
    : 0;
  const decisions = intent.after.decisions;
  if (
    intent.before.capturedAt !== storedSnapshot?.capturedAt
    || intent.before.sourceItemCount !== beforeCount
    || intent.after.capturedAt !== incomingSnapshot?.capturedAt
    || intent.after.sourceItemCount !== afterCount
    || !Array.isArray(decisions)
  ) {
    throw createHttpError(409, 'Safety Plan source refresh metadata does not match the source snapshots.');
  }
  const allowedIds = sourceRefreshDecisionIds(storedVersion, incomingVersion);
  const seen = new Set();
  const canonicalDecisions = decisions.map((decision) => {
    if (
      !isObject(decision)
      || typeof decision.itemId !== 'string'
      || !decision.itemId.trim()
      || !SOURCE_REFRESH_ACTIONS.has(decision.action)
      || seen.has(decision.itemId)
      || !allowedIds.has(decision.itemId)
    ) {
      throw createHttpError(409, 'Safety Plan source refresh metadata contains an invalid decision.');
    }
    seen.add(decision.itemId);
    return {
      itemId: decision.itemId,
      action: decision.action,
    };
  }).sort((left, right) => left.itemId.localeCompare(right.itemId));
  return {
    before: {
      capturedAt: storedSnapshot.capturedAt,
      sourceItemCount: beforeCount,
    },
    after: {
      capturedAt: incomingSnapshot.capturedAt,
      sourceItemCount: afterCount,
      decisions: canonicalDecisions,
    },
  };
}

function consumeSourceRefreshIntent(stored, incoming) {
  if (!stored || !Array.isArray(incoming?.versions)) {
    return { payload: incoming, metadata: null };
  }
  const incomingCurrent = incoming.versions.find(
    (version) => version?.id === incoming.currentVersionId
  );
  const versionsWithIntent = incoming.versions.filter(
    (version) => version?.sourceRefreshIntent !== undefined
  );
  const intent = incomingCurrent?.sourceRefreshIntent;
  if (intent === undefined) {
    if (versionsWithIntent.length > 0) {
      throw createHttpError(400, 'Safety Plan source refresh intent must target the current version.');
    }
    return { payload: incoming, metadata: null };
  }
  if (
    versionsWithIntent.length !== 1
    || !isObject(intent)
    || intent.kind !== 'source_refresh'
    || !isObject(intent.before)
    || !isObject(intent.after)
    || intent.actor !== undefined
    || intent.occurredAt !== undefined
  ) {
    throw createHttpError(400, 'Safety Plan source refresh intent is invalid.');
  }
  const storedCurrent = (stored.versions || []).find(
    (version) => version?.id === stored.currentVersionId
  );
  if (
    incoming.status !== 'draft'
    || incoming.currentVersionId !== stored.currentVersionId
    || storedCurrent?.status !== 'draft'
    || intent.before.capturedAt !== storedCurrent.sourceSnapshot?.capturedAt
    || intent.after.capturedAt !== incomingCurrent.sourceSnapshot?.capturedAt
    || intent.before.capturedAt === intent.after.capturedAt
  ) {
    throw createHttpError(409, 'Safety Plan source refresh intent does not match the source transition.');
  }
  const metadata = canonicalSourceRefreshMetadata(storedCurrent, incomingCurrent, intent);
  return {
    metadata,
    payload: {
      ...incoming,
      versions: incoming.versions.map((version) => {
        if (version?.sourceRefreshIntent === undefined) return version;
        const {
          sourceRefreshIntent: _sourceRefreshIntent,
          ...canonicalVersion
        } = version;
        return canonicalVersion;
      }),
    },
  };
}

function normaliseSafetyAuditEventForPlan(
  actor,
  plan,
  event,
  recordId,
  now,
  derivedMutation
) {
  if (!isObject(event) || event.id !== recordId) {
    throw createHttpError(400, 'Safety audit event id must match its record id.');
  }
  if (typeof event.planId !== 'string' || !event.planId.trim()) {
    throw createHttpError(400, 'Safety audit event requires a linked plan.');
  }
  if (event.planId !== plan.id) {
    throw createHttpError(409, 'Safety audit event linked plan does not match the saved plan.');
  }
  if (plan.deletedAt) {
    throw createHttpError(409, 'Deleted Safety Plans accept only server-managed audit events.');
  }
  if (!derivedMutation) {
    if (!STANDALONE_SAFETY_AUDIT_ACTIONS.has(event.action)) {
      throw createHttpError(
        403,
        'Safety Plan mutation audit actions require the matching atomic plan transition.'
      );
    }
    assertSafetyAuditAction(actor, plan, event);
  }
  const action = derivedMutation?.action || event.action;
  const versionId = derivedMutation
    ? derivedMutation.versionId
    : event.versionId;
  return {
    id: event.id,
    tenantId: actor.tenantId,
    planId: plan.id,
    ...(versionId ? { versionId } : {}),
    actor: safetyPlanActor(actor),
    action,
    occurredAt: now,
    ...(derivedMutation?.before ? { before: derivedMutation.before } : {}),
    ...(derivedMutation?.after ? { after: derivedMutation.after } : {}),
  };
}

async function normaliseSafetyAuditEvent(actor, event, recordId, now) {
  if (!isObject(event) || typeof event.planId !== 'string' || !event.planId.trim()) {
    throw createHttpError(400, 'Safety audit event requires a linked plan.');
  }
  const plan = await getRecord(actor.tenantId, SAFETY_PLAN_COLLECTION, event.planId);
  if (!plan) throw createHttpError(409, 'Safety audit event linked plan was not found.');
  return normaliseSafetyAuditEventForPlan(actor, plan, event, recordId, now);
}

function validateRecordId(value) {
  const recordId = String(value || '').trim();
  if (!recordId || recordId.length > 160) {
    throw createHttpError(400, 'Invalid record id.');
  }
  return recordId;
}

function validateExpectedRevision(value) {
  const revision = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw createHttpError(400, 'A valid expected Safety Plan revision is required.');
  }
  return revision;
}

function assertSameOrigin(req) {
  if (!['PUT', 'DELETE'].includes(req.method)) return;
  const origin = String(req.headers?.origin || '');
  const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '');
  if (!origin || !host) return;

  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw createHttpError(403, 'Cross-origin storage changes are not allowed.');
  }

  if (originHost !== host) {
    throw createHttpError(403, 'Cross-origin storage changes are not allowed.');
  }
}

function tenantFilter(tenantId, collection) {
  return `tenant_id=eq.${encodeURIComponent(tenantId)}&collection=eq.${encodeURIComponent(collection)}`;
}

function buildRecord(tenantId, collection, recordId, payload) {
  return {
    tenant_id: tenantId,
    collection,
    record_id: recordId,
    payload,
    updated_at: new Date().toISOString(),
  };
}

async function listCollection(tenantId, collection) {
  const rows = await supabaseRequest(
    `rest/v1/${TABLE_NAME}?${tenantFilter(tenantId, collection)}&select=tenant_id,record_id,payload,updated_at&order=updated_at.desc`,
    { publicMessage: 'Persistent storage request failed.' }
  );
  return Array.isArray(rows)
    ? rows
      .filter((row) => row.tenant_id === tenantId)
      .map((row) => row.payload)
    : [];
}

async function getRecord(tenantId, collection, recordId) {
  const rows = await supabaseRequest(
    `rest/v1/${TABLE_NAME}?${tenantFilter(tenantId, collection)}&record_id=eq.${encodeURIComponent(recordId)}&select=tenant_id,payload&limit=1`,
    { publicMessage: 'Persistent storage request failed.' }
  );
  const row = Array.isArray(rows)
    ? rows.find((candidate) => candidate.tenant_id === tenantId)
    : null;
  return row ? row.payload : null;
}

async function deleteCollection(tenantId, collection) {
  await supabaseRequest(`rest/v1/${TABLE_NAME}?${tenantFilter(tenantId, collection)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
    publicMessage: 'Persistent storage delete failed.',
  });
}

async function deleteRecord(tenantId, collection, recordId) {
  await supabaseRequest(
    `rest/v1/${TABLE_NAME}?${tenantFilter(tenantId, collection)}&record_id=eq.${encodeURIComponent(recordId)}`,
    {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
      publicMessage: 'Persistent storage delete failed.',
    }
  );
}

async function upsertRecords(rows) {
  if (rows.length === 0) return;
  await supabaseRequest(`rest/v1/${TABLE_NAME}?on_conflict=tenant_id,collection,record_id`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
    publicMessage: 'Persistent storage save failed.',
  });
}

async function appendRecords(rows) {
  if (rows.length === 0) return;
  await supabaseRequest(`rest/v1/${TABLE_NAME}`, {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(rows),
    publicMessage: 'Safety audit append failed.',
  });
}

async function insertSafetyPlanRecords(rows) {
  if (rows.length === 0) return;
  await supabaseRequest(`rest/v1/${TABLE_NAME}`, {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(rows),
    publicMessage: 'Safety Plan creation conflicted with an existing record.',
  });
}

async function insertSafetyPlanWithAudit(
  tenantId,
  recordId,
  payload,
  auditEvent
) {
  const rows = await supabaseRequest('rest/v1/rpc/ftf_insert_safety_plan_with_audit', {
    method: 'POST',
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_plan_record_id: recordId,
      p_plan_payload: payload,
      p_audit_record_id: auditEvent.id,
      p_audit_payload: auditEvent,
    }),
    publicMessage: 'Safety Plan creation conflicted with an existing record.',
  });
  const outcome = Array.isArray(rows) ? rows[0] : rows;
  if (outcome?.succeeded !== true) {
    const current = await getRecord(tenantId, SAFETY_PLAN_COLLECTION, recordId);
    throw safetyPlanConflict(current?.revision);
  }
  return outcome.new_payload || payload;
}

async function compareAndSwapSafetyPlan(
  tenantId,
  recordId,
  expectedRevision,
  payload,
  auditEvent
) {
  const rows = await supabaseRequest('rest/v1/rpc/ftf_compare_and_swap_store_payload', {
    method: 'POST',
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_collection: SAFETY_PLAN_COLLECTION,
      p_record_id: recordId,
      p_expected_revision: expectedRevision,
      p_payload: payload,
      ...(auditEvent
        ? {
          p_audit_record_id: auditEvent.id,
          p_audit_payload: auditEvent,
        }
        : {}),
    }),
    publicMessage: 'Safety Plan concurrency check failed.',
  });
  const outcome = Array.isArray(rows) ? rows[0] : rows;
  if (outcome?.succeeded !== true) {
    const current = await getRecord(tenantId, SAFETY_PLAN_COLLECTION, recordId);
    throw safetyPlanConflict(current?.revision);
  }
  return outcome.new_payload || payload;
}

function buildServerAuditEvent(actor, plan, action, occurredAt) {
  return {
    id: randomUUID(),
    tenantId: actor.tenantId,
    planId: plan.id,
    versionId: plan.currentVersionId,
    actor: safetyPlanActor(actor),
    action,
    occurredAt,
  };
}

async function upsertCollection(tenantId, collection, records) {
  if (!Array.isArray(records)) throw createHttpError(400, 'Records must be an array.');
  if (records.length > MAX_RECORDS_PER_WRITE) {
    throw createHttpError(413, `Store at most ${MAX_RECORDS_PER_WRITE} records in one request.`);
  }

  const rows = records.map((record, index) => buildRecord(
    tenantId,
    collection,
    validateRecordId(record && typeof record === 'object' && record.id ? record.id : `record_${index}`),
    record
  ));
  await upsertRecords(rows);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET,PUT,DELETE,OPTIONS');
    return res.status(204).end();
  }

  try {
    assertSameOrigin(req);
    const user = await authenticateRequest(req, res);
    const tenantId = user.tenantId;

    if (req.method === 'GET') {
      const collection = validateCollection(req.query.collection);
      assertCollectionPermission(user, collection, 'read');
      const recordId = req.query.recordId ? validateRecordId(req.query.recordId) : '';
      const includeDeleted = String(req.query.includeDeleted || '') === 'true';
      if (collection === SAFETY_PLAN_COLLECTION && includeDeleted && user.role !== 'admin') {
        throw createHttpError(403, 'Only administrators may recover deleted Safety Plans.');
      }
      if (req.localE2eFixture) {
        const fixtureRecords = req.localE2eFixture.collections?.[collection];
        let records = Array.isArray(fixtureRecords) ? fixtureRecords : [];
        if (collection === SAFETY_PLAN_COLLECTION && !(user.role === 'admin' && includeDeleted)) {
          records = records.filter((plan) => !plan?.deletedAt);
        }
        if (collection === SAFETY_PLAN_COLLECTION) {
          records = records.filter((plan) => canReadSafetyPlan(user, plan));
        }
        if (collection === SAFETY_PLAN_TEMPLATE_COLLECTION && user.role === 'contractor') {
          records = records.filter((template) => template?.recordType !== 'draft');
        }
        if (recordId) {
          const payload = records.find((record) => record?.id === recordId) || null;
          return res.status(200).json({
            payload: user.role === 'contractor'
              ? contractorSafePayload(collection, payload)
              : payload,
          });
        }
        return res.status(200).json({
          records: user.role === 'contractor'
            ? records.map((payload) => contractorSafePayload(collection, payload))
            : records,
        });
      }
      if (recordId) {
        const payload = await getRecord(tenantId, collection, recordId);
        const visiblePayload = collection === SAFETY_PLAN_COLLECTION
          && (
            (payload?.deletedAt && !(user.role === 'admin' && includeDeleted))
            || (payload && !canReadSafetyPlan(user, payload))
          )
          ? null
          : collection === SAFETY_PLAN_TEMPLATE_COLLECTION
            && user.role === 'contractor'
            && payload?.recordType === 'draft'
            ? null
            : payload;
        return res.status(200).json({
          payload: user.role === 'contractor'
            ? contractorSafePayload(collection, visiblePayload)
            : visiblePayload,
        });
      }
      let records = await listCollection(tenantId, collection);
      if (collection === SAFETY_PLAN_COLLECTION && !(user.role === 'admin' && includeDeleted)) {
        records = records.filter((plan) => !plan?.deletedAt);
      }
      if (collection === SAFETY_PLAN_COLLECTION) {
        records = records.filter((plan) => canReadSafetyPlan(user, plan));
      }
      if (collection === SAFETY_PLAN_TEMPLATE_COLLECTION && user.role === 'contractor') {
        records = records.filter((template) => template?.recordType !== 'draft');
      }
      return res.status(200).json({
        records: user.role === 'contractor'
          ? records.map((payload) => contractorSafePayload(collection, payload))
          : records,
      });
    }

    if (req.localE2eFixture) {
      throw createHttpError(405, 'The local browser fixture is read-only.');
    }

    if (req.method === 'PUT') {
      const body = getJsonBody(req);
      const collection = validateCollection(body.collection || req.query.collection);
      assertCollectionPermission(user, collection, 'write');
      const now = new Date().toISOString();

      if (
        collection === SAFETY_PLAN_TEMPLATE_COLLECTION
        && body.action === 'init_company_template_draft'
      ) {
        const content = normaliseCompanyTemplateContent(body.payload);
        const draft = await supabaseRequest(
          'rest/v1/rpc/ftf_init_safety_plan_template_draft',
          {
            method: 'POST',
            body: JSON.stringify({
              p_tenant_id: tenantId,
              p_actor_user_id: user.id,
              p_actor_name: user.name,
              p_standard_content: content,
            }),
            publicMessage: 'Company Safety Plan template draft could not be initialised.',
          }
        );
        return res.status(200).json({ ok: true, count: 1, payload: draft });
      }

      if (
        collection === SAFETY_PLAN_TEMPLATE_COLLECTION
        && body.action === 'update_company_template_draft'
      ) {
        const content = normaliseCompanyTemplateContent(body.payload);
        const expectedRevision = validateExpectedRevision(body.expectedRevision);
        const draft = await supabaseRequest(
          'rest/v1/rpc/ftf_update_safety_plan_template_draft',
          {
            method: 'POST',
            body: JSON.stringify({
              p_tenant_id: tenantId,
              p_actor_user_id: user.id,
              p_actor_name: user.name,
              p_expected_revision: expectedRevision,
              p_template_content: content,
            }),
            publicMessage: 'Company Safety Plan template draft could not be saved.',
          }
        );
        if (!draft) throw safetyPlanConflict(expectedRevision);
        return res.status(200).json({ ok: true, count: 1, payload: draft });
      }

      if (
        collection === SAFETY_PLAN_TEMPLATE_COLLECTION
        && body.action === 'publish_company_master'
      ) {
        const content = normaliseCompanyTemplateContent(body.payload);
        const auditRecordId = randomUUID();
        const published = await supabaseRequest(
          'rest/v1/rpc/ftf_publish_safety_plan_master',
          {
            method: 'POST',
            body: JSON.stringify({
              p_tenant_id: tenantId,
              p_actor_user_id: user.id,
              p_actor_name: user.name,
              p_template_content: content,
              p_audit_record_id: auditRecordId,
            }),
            publicMessage: 'Company Safety Plan master could not be published.',
          }
        );
        return res.status(200).json({ ok: true, count: 1, payload: published });
      }

      if (collection === SAFETY_PLAN_COLLECTION && body.action === 'restore') {
        if (user.role !== 'admin') {
          throw createHttpError(403, 'Only administrators may restore deleted Safety Plans.');
        }
        const recordId = validateRecordId(body.recordId);
        const stored = await getRecord(tenantId, collection, recordId);
        const expectedRevision = validateExpectedRevision(body.expectedRevision);
        if (stored && stored.revision !== expectedRevision) {
          throw safetyPlanConflict(stored.revision);
        }
        if (!stored?.deletedAt || stored.status !== 'draft') {
          throw createHttpError(409, 'Only a deleted draft Safety Plan can be restored.');
        }
        if ((stored.versions || []).some((version) =>
          ['approved', 'superseded'].includes(version?.status)
        )) {
          throw createHttpError(403, 'Approved and superseded Safety Plan versions cannot be restored from deletion.');
        }
        const {
          deletedAt: _deletedAt,
          deletedBy: _deletedBy,
          ...activePlan
        } = stored;
        const restored = {
          ...activePlan,
          revision: stored.revision + 1,
          updatedAt: now,
        };
        const auditEvent = buildServerAuditEvent(user, restored, 'draft_restored', now);
        const saved = await compareAndSwapSafetyPlan(
          tenantId,
          recordId,
          expectedRevision,
          restored,
          auditEvent
        );
        return res.status(200).json({ ok: true, count: 1, payload: saved });
      }

      if (Array.isArray(body.records)) {
        if (body.records.length > MAX_RECORDS_PER_WRITE) {
          throw createHttpError(413, `Store at most ${MAX_RECORDS_PER_WRITE} records in one request.`);
        }
        if (collection === SAFETY_PLAN_COLLECTION) {
          throw createHttpError(
            400,
            'Safety Plans must use a singleton record write with audit linkage.'
          );
        }
        if (collection === SAFETY_PLAN_TEMPLATE_COLLECTION) {
          throw createHttpError(
            400,
            'Company Safety Plan masters must be published one immutable version at a time.'
          );
        }
        let records = body.records;
        if (collection === SAFETY_PLAN_AUDIT_COLLECTION) {
          assertUniqueIds(records, 'Safety audit event');
          records = await Promise.all(records.map(async (record, index) => {
            const recordId = validateRecordId(record?.id || `record_${index}`);
            const event = await normaliseSafetyAuditEvent(user, record, recordId, now);
            if (await getRecord(tenantId, collection, recordId)) {
              throw createHttpError(409, 'Safety audit events are append-only.');
            }
            return event;
          }));
        } else if (user.role === 'contractor') {
          const storedRecords = await listCollection(tenantId, collection);
          const storedById = new Map(storedRecords.map((record) => [record?.id, record]));
          records = records.map((record) => contractorWritePayload(collection, record, storedById.get(record?.id)));
        }
        if (collection === SAFETY_PLAN_AUDIT_COLLECTION) {
          const rows = records.map((record, index) => buildRecord(
            tenantId,
            collection,
            validateRecordId(record?.id || `record_${index}`),
            record
          ));
          await appendRecords(rows);
        } else {
          await upsertCollection(tenantId, collection, records);
        }
        return res.status(200).json({ ok: true, count: body.records.length });
      }

      const recordId = validateRecordId(body.recordId || SINGLETON_RECORD_ID);
      if (collection === SAFETY_PLAN_TEMPLATE_COLLECTION) {
        throw createHttpError(
          400,
          'Company Safety Plan masters must use controlled publication.'
        );
      }
      const needsStoredPayload = user.role === 'contractor'
        || collection === SAFETY_PLAN_COLLECTION
        || collection === SAFETY_PLAN_AUDIT_COLLECTION
        || collection === SAFETY_PLAN_TEMPLATE_COLLECTION;
      const storedPayload = needsStoredPayload ? await getRecord(tenantId, collection, recordId) : null;
      let payload = body.payload;
      let safetyAuditEvent = null;
      if (collection === SAFETY_PLAN_COLLECTION) {
        payload = normaliseSafetyPlanProvenance(user, storedPayload, body.payload, now);
        const sourceRefresh = consumeSourceRefreshIntent(storedPayload, payload);
        payload = sourceRefresh.payload;
        assertSafetyPlanTransition({
          actor: user,
          stored: storedPayload,
          incoming: payload,
          recordId,
        });
        if (body.audit === undefined) {
          throw createHttpError(400, 'Safety Plan writes require audit action and linkage metadata.');
        }
        const auditRecordId = validateRecordId(body.audit?.id);
        safetyAuditEvent = normaliseSafetyAuditEventForPlan(
          user,
          payload,
          body.audit,
          auditRecordId,
          now,
          deriveSafetyPlanMutationAudit(storedPayload, payload, sourceRefresh.metadata)
        );
      }
      if (collection === SAFETY_PLAN_AUDIT_COLLECTION) {
        payload = await normaliseSafetyAuditEvent(user, body.payload, recordId, now);
        if (storedPayload) throw createHttpError(409, 'Safety audit events are append-only.');
      }
      payload = user.role === 'contractor'
        && ![SAFETY_PLAN_COLLECTION, SAFETY_PLAN_AUDIT_COLLECTION].includes(collection)
        ? contractorWritePayload(collection, body.payload, storedPayload)
        : payload;
      const row = buildRecord(tenantId, collection, recordId, payload);
      if (collection === SAFETY_PLAN_AUDIT_COLLECTION) {
        await appendRecords([row]);
      } else if (collection === SAFETY_PLAN_COLLECTION) {
        let saved;
        if (storedPayload) {
          saved = await compareAndSwapSafetyPlan(
            tenantId,
            recordId,
            storedPayload.revision,
            payload,
            safetyAuditEvent
          );
        } else if (safetyAuditEvent) {
          saved = await insertSafetyPlanWithAudit(
            tenantId,
            recordId,
            payload,
            safetyAuditEvent
          );
        } else {
          try {
            await insertSafetyPlanRecords([row]);
            saved = payload;
          } catch (insertError) {
            if (insertError?.statusCode !== 409) throw insertError;
            const current = await getRecord(tenantId, SAFETY_PLAN_COLLECTION, recordId);
            throw safetyPlanConflict(current?.revision);
          }
        }
        return res.status(200).json({ ok: true, count: 1, payload: saved });
      } else {
        await upsertRecords([row]);
      }
      return res.status(200).json({ ok: true, count: 1 });
    }

    if (req.method === 'DELETE') {
      const collection = validateCollection(req.query.collection);
      assertCollectionPermission(user, collection, 'write');
      const recordId = req.query.recordId ? validateRecordId(req.query.recordId) : '';
      if (collection === SAFETY_PLAN_AUDIT_COLLECTION) {
        throw createHttpError(403, 'Safety audit events are append-only and cannot be deleted.');
      }
      if (collection === SAFETY_PLAN_COLLECTION) {
        if (!recordId) {
          throw createHttpError(403, 'Safety Plans cannot be deleted as a collection.');
        }
        if (user.role !== 'admin') {
          throw createHttpError(403, 'Only administrators may delete draft Safety Plans.');
        }
        const stored = await getRecord(tenantId, collection, recordId);
        const expectedRevision = validateExpectedRevision(req.query.expectedRevision);
        if (stored && stored.revision !== expectedRevision) {
          throw safetyPlanConflict(stored.revision);
        }
        if (!stored || stored.deletedAt || stored.status !== 'draft' || (stored.versions || []).some((version) =>
          ['approved', 'superseded'].includes(version?.status)
        )) {
          throw createHttpError(403, 'Approved and superseded Safety Plan versions cannot be deleted.');
        }
        const occurredAt = new Date().toISOString();
        const deleted = {
          ...stored,
          revision: stored.revision + 1,
          deletedAt: occurredAt,
          deletedBy: safetyPlanActor(user),
          updatedAt: occurredAt,
        };
        const auditEvent = buildServerAuditEvent(user, deleted, 'draft_deleted', occurredAt);
        const saved = await compareAndSwapSafetyPlan(
          tenantId,
          recordId,
          expectedRevision,
          deleted,
          auditEvent
        );
        return res.status(200).json({ ok: true, payload: saved });
      }
      if (recordId) {
        await deleteRecord(tenantId, collection, recordId);
      } else {
        await deleteCollection(tenantId, collection);
      }
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET,PUT,DELETE,OPTIONS');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    const status = error.statusCode || 500;
    console.error('Persistent store error:', error);
    return res.status(status).json({
      error: error.publicMessage || 'Persistent storage request failed.',
      ...(error.code ? { code: error.code } : {}),
      ...(Number.isSafeInteger(error.currentRevision)
        ? { currentRevision: error.currentRevision }
        : {}),
    });
  }
};
