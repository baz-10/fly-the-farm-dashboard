const { createHttpError } = require('./supabase');
const { resolveRequestContext } = require('./request-context');
const { errorEnvelope } = require('./operational-api');
const { ChecklistsRepository } = require('./checklists-repository');

const err = (status, code, message) => Object.assign(createHttpError(status, message), { code });
const permitted = (context, permission) => {
  const permissions = new Set(context.permissions || []);
  return permissions.has('*') || permissions.has(permission) || permissions.has('compliance.*');
};
const uuid = (value, name) => {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw err(400, 'VALIDATION_ERROR', `${name} must be a UUID.`);
  }
  return value;
};
const lifecycleStage = (value) => {
  const stage = String(value || '');
  if (!['PRE_FLIGHT', 'POST_FLIGHT', 'MAINTENANCE', 'GENERAL'].includes(stage)) throw err(400, 'VALIDATION_ERROR', 'lifecycleStage is invalid.');
  return stage;
};
const optionalUuid = (value, name) => value ? uuid(value, name) : null;
const digest = (value, name) => {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw err(400, 'VALIDATION_ERROR', `${name} must be a SHA-256 digest.`);
  return value;
};
const compositionScope = (input) => ({
  operatingLocationId: uuid(input.operatingLocationId, 'operatingLocationId'),
  lifecycleStage: lifecycleStage(input.lifecycleStage),
  missionId: optionalUuid(input.missionId, 'missionId'),
  aircraftId: optionalUuid(input.aircraftId, 'aircraftId'),
  maintainableAssetId: optionalUuid(input.maintainableAssetId, 'maintainableAssetId'),
  configurationCode: input.configurationCode ? String(input.configurationCode) : null,
});
const checkedFailures = [
  ['forbidden', 403, 'CHECKLIST_SCOPE_FORBIDDEN', 'Checklist scope is not permitted.'],
  ['not_found', 404, 'CHECKLIST_NOT_FOUND', 'Checklist authority was not found.'],
  ['invalid_context', 400, 'CHECKLIST_REQUEST_INVALID', 'Checklist request is invalid.'],
  ['not_applicable', 422, 'CHECKLIST_NOT_APPLICABLE', 'Checklist does not apply to this context.'],
  ['applicability_unresolved', 422, 'CHECKLIST_APPLICABILITY_UNRESOLVED', 'Checklist applicability could not be resolved.'],
  ['configuration_ambiguous', 409, 'CHECKLIST_CONFIGURATION_AMBIGUOUS', 'Checklist configuration is ambiguous.'],
  ['configuration_mismatch', 422, 'CHECKLIST_CONFIGURATION_MISMATCH', 'Checklist configuration does not match authoritative state.'],
  ['composition_invalid', 422, 'CHECKLIST_COMPOSITION_INVALID', 'Checklist composition is invalid.'],
  ['stale_composition', 409, 'CHECKLIST_COMPOSITION_STALE', 'Checklist composition changed. Preview it again.'],
  ['conflict', 409, 'VERSION_CONFLICT', 'Checklist authority changed.'],
  ['ineligible_completing_personnel', 422, 'CHECKLIST_PERSONNEL_INELIGIBLE', 'Completing Personnel is not eligible.'],
];
const checked = (result) => {
  for (const [flag, status, code, message] of checkedFailures) if (result?.[flag] === true) {
    const failure = err(status, code, message);
    if (typeof result.reason === 'string' && /^[A-Z0-9_]{1,80}$/.test(result.reason)) failure.details = result.reason;
    if (Number.isSafeInteger(result.currentVersion) && result.currentVersion > 0) failure.currentVersion = result.currentVersion;
    throw failure;
  }
  return result;
};

function publicEvidence(result) {
  const record = result?.record || {};
  return { ...result, record: { id: record.id, internal_file_id: record.internal_file_id, file_version: record.file_version, sha256_checksum: record.sha256_checksum, original_filename: record.original_filename, content_type: record.content_type, byte_size: record.byte_size, created_at: record.created_at } };
}

function createChecklistsHandler(dependencies = {}) {
  const repository = dependencies.repository || new ChecklistsRepository();
  const resolve = dependencies.resolveContext || resolveRequestContext;
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    try {
      const context = await resolve(req, res);
      const action = req.query?.action;
      if (req.method === 'GET') {
        if (action === 'templates') {
          if (!permitted(context, 'checklist_templates.read') && !permitted(context, 'checklists.execute')) throw err(403, 'FORBIDDEN', 'You do not have permission for this operation.');
          return res.status(200).json({ data: await repository.readApplicableTemplates(context, compositionScope(req.query || {})) });
        }
        if (action === 'composition-preview') {
          if (!permitted(context, 'checklists.execute')) throw err(403, 'FORBIDDEN', 'You do not have permission for this operation.');
          return res.status(200).json({ data: checked(await repository.previewComposition(context, uuid(req.query?.profileVersionId, 'profileVersionId'), compositionScope(req.query || {}))) });
        }
        if (action === 'composition-library') {
          if (!permitted(context, 'checklist_templates.read')) throw err(403, 'FORBIDDEN', 'You do not have permission for this operation.');
          return res.status(200).json({ data: checked(await repository.readCompositionLibrary(context)) });
        }
        if (action === 'mission') {
          if (!permitted(context, 'checklists.read_completed') && !permitted(context, 'checklists.execute')) throw err(403, 'FORBIDDEN', 'You do not have permission for this operation.');
          return res.status(200).json({ data: await repository.readMissionExecutions(context, uuid(req.query?.missionId, 'missionId')) });
        }
        if (action === 'readiness') {
          if (!permitted(context, 'checklists.read_completed') && !permitted(context, 'checklists.execute')) throw err(403, 'FORBIDDEN', 'You do not have permission for this operation.');
          return res.status(200).json({ data: await repository.evaluateMissionReadiness(context, uuid(req.query?.missionId, 'missionId'), String(req.query?.lifecycleStage || '')) });
        }
        throw err(400, 'UNSUPPORTED_ACTION', 'Unsupported Checklist action.');
      }
      if (req.method !== 'POST') throw err(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
      const origin = req.headers?.origin;
      if (origin && new URL(origin).host !== req.headers?.host) throw err(403, 'ORIGIN_FORBIDDEN', 'Request origin is not permitted.');
      const body = req.body || {};
      if (action === 'template' || action === 'publish') {
        if (!permitted(context, action === 'publish' ? 'checklist_templates.publish' : 'checklist_templates.author')) throw err(403, 'FORBIDDEN', 'You do not have permission for this operation.');
        const result = action === 'publish'
          ? await repository.publishTemplate(context, uuid(body.templateId, 'templateId'), Number(body.expectedVersion), body)
          : await repository.writeTemplate(context, body.operation || 'CREATE', body.templateId ? uuid(body.templateId, 'templateId') : null, Number(body.expectedVersion || 0), body);
        return res.status(201).json({ data: result });
      }
      if (action === 'start') {
        if (!permitted(context, 'checklists.execute')) throw err(403, 'FORBIDDEN', 'You do not have permission for this operation.');
        return res.status(201).json({ data: await repository.startExecution(context, body) });
      }
      if (action === 'composition-start') {
        if (!permitted(context, 'checklists.execute')) throw err(403, 'FORBIDDEN', 'You do not have permission for this operation.');
        const payload = { profileVersionId: uuid(body.profileVersionId, 'profileVersionId'), ...compositionScope(body), expectedCompositionDigest: digest(body.expectedCompositionDigest, 'expectedCompositionDigest') };
        return res.status(201).json({ data: checked(await repository.startComposedExecution(context, payload)) });
      }
      if (action === 'composition-publish') {
        if (!permitted(context, 'checklist_templates.publish')) throw err(403, 'FORBIDDEN', 'You do not have permission for this operation.');
        if (!Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 1) throw err(400, 'VALIDATION_ERROR', 'expectedVersion is invalid.');
        return res.status(201).json({ data: checked(await repository.publishComposition(context, uuid(body.profileVersionId, 'profileVersionId'), body.expectedVersion, { modules: body.modules })) });
      }
      if (action === 'composition-adopt') {
        if (!permitted(context, 'checklist_templates.author')) throw err(403, 'FORBIDDEN', 'You do not have permission for this operation.');
        const payload = { sourceProfileVersionId: uuid(body.sourceProfileVersionId, 'sourceProfileVersionId'), stableCode: String(body.stableCode || ''), name: String(body.name || '') };
        return res.status(201).json({ data: checked(await repository.adoptSystemComposition(context, payload)) });
      }
      if (action === 'save') {
        if (!permitted(context, 'checklists.execute')) throw err(403, 'FORBIDDEN', 'You do not have permission for this operation.');
        const result = await repository.saveExecution(context, uuid(body.executionId, 'executionId'), Number(body.expectedVersion), body.responses);
        if (result?.conflict) throw err(409, 'VERSION_CONFLICT', 'Checklist execution changed.');
        return res.status(201).json({ data: result });
      }
      if (action === 'submit') {
        if (!permitted(context, 'checklists.execute')) throw err(403, 'FORBIDDEN', 'You do not have permission for this operation.');
        const result = await repository.completeExecution(context, uuid(body.executionId, 'executionId'), Number(body.expectedVersion), body.responses, { internalUserId: context.internalUser.id });
        if (result?.conflict) throw err(409, 'VERSION_CONFLICT', 'Checklist execution changed.');
        return res.status(201).json({ data: result });
      }
      if (action === 'evidence') {
        if (!permitted(context, 'checklists.execute')) throw err(403, 'FORBIDDEN', 'You do not have permission for this operation.');
        return res.status(201).json({ data: publicEvidence(await repository.stageEvidence(context, uuid(body.executionId, 'executionId'), body)) });
      }
      if (action === 'corrective-action') {
        if (!permitted(context, 'checklist_findings.manage')) throw err(403, 'FORBIDDEN', 'You do not have permission for this operation.');
        const result = await repository.writeCorrectiveAction(context, body.operation || 'CREATE', body.actionId ? uuid(body.actionId, 'actionId') : null, Number(body.expectedVersion || 0), body);
        if (result?.conflict) throw err(409, 'VERSION_CONFLICT', 'Corrective action changed.');
        return res.status(201).json({ data: result });
      }
      throw err(400, 'UNSUPPORTED_ACTION', 'Unsupported Checklist action.');
    } catch (error) {
      const { status, response } = errorEnvelope(error);
      return res.status(status).json(response);
    }
  };
}

module.exports = { createChecklistsHandler };
