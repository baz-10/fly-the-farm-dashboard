const { resolveRequestContext } = require('./request-context');
const { resolvePlatformRequestContext } = require('./platform-request-context');
const { TechnicalCatalogueRepository } = require('./technical-catalogue-repository');
const { boundedPublicDiagnostics } = require('./public-diagnostics');

const MAX_BODY_BYTES = 32 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLATFORM_PUBLISH = 'platform.technical_catalogue.publish';
const PLATFORM_ACTIONS = new Set([
  'platform-propose',
  'platform-review',
  'publish-technical-version',
  'publish-part-equivalence',
  'publish-technical-applicability',
  'publish-platform-service-template',
]);

function apiError(statusCode, code, message, extra = {}) {
  return Object.assign(new Error(message), { statusCode, code, ...extra });
}

function requirePermission(context, code) {
  const permissions = new Set(context.permissions || []);
  if (!permissions.has('*') && !permissions.has(code)) {
    throw apiError(403, 'FORBIDDEN', 'You do not have permission for this operation.');
  }
}

function enforceSameOrigin(req) {
  if (String(req.headers?.['sec-fetch-site'] || '').toLowerCase() === 'cross-site') {
    throw apiError(403, 'CROSS_ORIGIN_REQUEST', 'Request origin is not allowed.');
  }
  const origin = String(req.headers?.origin || '').trim();
  const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '').split(',')[0].trim();
  const forwardedProtocol = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProtocol || (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
  let trustedOrigin;
  try { trustedOrigin = new URL(`${protocol}://${host}`).origin; } catch (_) {
    throw apiError(403, 'CROSS_ORIGIN_REQUEST', 'Request origin is not allowed.');
  }
  if (!origin || origin !== trustedOrigin) throw apiError(403, 'CROSS_ORIGIN_REQUEST', 'Request origin is not allowed.');
}

function parseBody(req) {
  const declaredLength = Number(req.headers?.['content-length'] || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw apiError(413, 'PAYLOAD_TOO_LARGE', 'Request payload is too large.');
  }
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); } catch (_) {
    throw apiError(400, 'INVALID_JSON', 'Request body is not valid JSON.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw apiError(400, 'VALIDATION_ERROR', 'Request body is invalid.');
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_BODY_BYTES) throw apiError(413, 'PAYLOAD_TOO_LARGE', 'Request payload is too large.');
  return body;
}

function requiredUuid(value, field) {
  if (!UUID.test(String(value || ''))) throw apiError(400, 'VALIDATION_ERROR', `${field} must be a UUID.`);
  return String(value);
}

function requiredAssetSource(value) {
  if (typeof value !== 'string' || !['aircraft', 'equipment-kit', 'fleet-asset'].includes(value)) {
    throw apiError(400, 'VALIDATION_ERROR', 'source is invalid.');
  }
  return value;
}

function requiredVersion(value) {
  const version = Number(value);
  if (!Number.isInteger(version) || version < 1) throw apiError(400, 'VALIDATION_ERROR', 'expectedVersion must be a positive integer.');
  return version;
}

function requiredInstant(value, field = 'effectiveFrom') {
  if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Date.parse(value))) {
    throw apiError(400, 'VALIDATION_ERROR', `${field} must be a valid timestamp.`);
  }
  return value;
}

function enumValue(value, allowed, field) {
  const normalized = String(value || '').toUpperCase();
  if (!allowed.includes(normalized)) throw apiError(400, 'VALIDATION_ERROR', `${field} is invalid.`);
  return normalized;
}

function requiredObject(value, field, allowEmpty = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || (!allowEmpty && Object.keys(value).length === 0)) {
    throw apiError(400, 'VALIDATION_ERROR', `${field} must be a non-empty object.`);
  }
  return value;
}

function reviewNotes(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 4000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
    throw apiError(400, 'VALIDATION_ERROR', 'reviewNotes is invalid.');
  }
  return value.trim();
}

function proposalInput(body) {
  return {
    proposalType: enumValue(body.proposalType, ['PART', 'PART_EQUIVALENCE', 'PART_APPLICABILITY', 'FLUID_SPECIFICATION', 'FLUID_APPLICABILITY', 'SERVICE_TEMPLATE'], 'proposalType'),
    proposedData: requiredObject(body.proposedData, 'proposedData'),
    evidence: body.evidence === undefined ? {} : requiredObject(body.evidence, 'evidence', true),
    proposedByType: enumValue(body.proposedByType, ['HUMAN', 'AI_EXTRACTION', 'MANUAL_EXTRACTION', 'IMPORT'], 'proposedByType'),
  };
}

function proposalReviewInput(body) {
  return {
    proposalId: requiredUuid(body.proposalId, 'proposalId'),
    expectedVersion: requiredVersion(body.expectedVersion),
    decision: enumValue(body.decision, ['REVIEW', 'APPROVE', 'REJECT'], 'decision'),
    reviewEvidence: requiredObject(body.reviewEvidence, 'reviewEvidence'),
    reviewNotes: reviewNotes(body.reviewNotes),
  };
}

function optionalText(value, maximum) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
    throw apiError(400, 'VALIDATION_ERROR', 'Preference text is invalid.');
  }
  return value.trim();
}

function compact(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

function preferenceData(type, bodyData, creating) {
  if (!bodyData || typeof bodyData !== 'object' || Array.isArray(bodyData)) throw apiError(400, 'VALIDATION_ERROR', 'Preference data is invalid.');
  if (type === 'PART') {
    const data = compact({
      technical_part_id: bodyData.technicalPartId === undefined ? undefined : requiredUuid(bodyData.technicalPartId, 'technicalPartId'),
      preferred_part_version_id: bodyData.preferredPartVersionId === undefined
        ? undefined
        : bodyData.preferredPartVersionId === null || bodyData.preferredPartVersionId === ''
          ? null
          : requiredUuid(bodyData.preferredPartVersionId, 'preferredPartVersionId'),
      preferred_supplier: optionalText(bodyData.preferredSupplier, 240),
      supplier_sku: optionalText(bodyData.supplierSku, 160),
      internal_sku: optionalText(bodyData.internalSku, 160),
      organisation_notes: optionalText(bodyData.organisationNotes, 4000),
    });
    if (creating && !data.technical_part_id) throw apiError(400, 'VALIDATION_ERROR', 'technicalPartId is required.');
    return data;
  }
  const data = compact({
    technical_fluid_specification_id: bodyData.technicalFluidSpecificationId === undefined ? undefined : requiredUuid(bodyData.technicalFluidSpecificationId, 'technicalFluidSpecificationId'),
    satisfied_fluid_specification_version_id: bodyData.satisfiedFluidSpecificationVersionId === undefined ? undefined : requiredUuid(bodyData.satisfiedFluidSpecificationVersionId, 'satisfiedFluidSpecificationVersionId'),
    preferred_product: optionalText(bodyData.preferredProduct, 240),
    preferred_brand: optionalText(bodyData.preferredBrand, 240),
    preferred_supplier: optionalText(bodyData.preferredSupplier, 240),
    supplier_sku: optionalText(bodyData.supplierSku, 160),
    organisation_notes: optionalText(bodyData.organisationNotes, 4000),
  });
  if (creating && (!data.technical_fluid_specification_id || !data.satisfied_fluid_specification_version_id)) {
    throw apiError(400, 'VALIDATION_ERROR', 'Fluid specification identities are required.');
  }
  if (!data.preferred_product) throw apiError(400, 'VALIDATION_ERROR', 'preferredProduct is required.');
  return data;
}

function checkedResult(result, notFoundMessage = 'Technical catalogue record was not found.') {
  if (result?.forbidden) throw apiError(403, 'FORBIDDEN', 'You do not have permission for this operation.');
  if (result?.not_found) throw apiError(404, 'NOT_FOUND', notFoundMessage);
  if (result?.conflict) throw apiError(409, 'VERSION_CONFLICT', 'This technical catalogue record changed. Reload it and try again.', { currentVersion: result.current_version });
  return result;
}

function createTechnicalCatalogueHandler(dependencies = {}) {
  const repository = dependencies.repository || new TechnicalCatalogueRepository();
  const getContext = dependencies.resolveContext || resolveRequestContext;
  const getPlatformContext = dependencies.resolvePlatformContext || resolvePlatformRequestContext;

  return async function technicalCatalogueHandler(req, res) {
    const correlationId = String(req.correlationId || req.headers?.['x-request-id'] || '');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    try {
      const action = String(req.query?.action || '');
      if (req.method === 'GET') {
        const context = await getContext(req, res);
        if (action === 'resolve-asset') {
          requirePermission(context, 'technical_catalogue.read');
          const resolved = checkedResult(await repository.resolveAssetRoute(
            context,
            requiredAssetSource(req.query?.source),
            requiredUuid(req.query?.sourceRecordId, 'sourceRecordId')
          ), 'Asset was not found.');
          return res.status(200).json({ data: resolved });
        }
        if (action === 'lookup') {
          requirePermission(context, 'technical_catalogue.read');
          const result = checkedResult(await repository.readAssetCatalogue(
            context,
            requiredUuid(req.query?.assetId, 'assetId'),
            requiredInstant(req.query?.asOf, 'asOf')
          ), 'Technical catalogue was not found.');
          return res.status(200).json({ data: result });
        }
        if (action === 'preferences') {
          requirePermission(context, 'technical_preferences.read');
          const result = checkedResult(await repository.readPreferences(context), 'Technical preferences were not found.');
          return res.status(200).json({ data: result });
        }
        if (action === 'service-template-version') {
          requirePermission(context, 'service_templates.read');
          const aggregate = checkedResult(await repository.readApplicableServiceTemplateVersion(
            context,
            requiredUuid(req.query?.assetId, 'assetId'),
            requiredUuid(req.query?.templateVersionId, 'templateVersionId'),
            requiredInstant(req.query?.asOf, 'asOf')
          ), 'Service Template version was not found.');
          return res.status(200).json({ data: aggregate });
        }
        throw apiError(400, 'UNSUPPORTED_ACTION', 'Unsupported technical catalogue action.');
      }

      if (req.method !== 'POST') throw apiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
      enforceSameOrigin(req);
      const body = parseBody(req);

      if (action === 'propose') {
        const context = await getContext(req, res);
        requirePermission(context, 'technical_proposals.create');
        const input = proposalInput(body);
        const result = checkedResult(await repository.createOrganisationProposal(
          context,input.proposalType,input.proposedData,input.evidence,input.proposedByType
        ), 'Technical proposal was not found.');
        return res.status(201).json({ data: result?.record || result });
      }

      if (action === 'review') {
        const context = await getContext(req, res);
        requirePermission(context, 'technical_proposals.review');
        const input = proposalReviewInput(body);
        const result = checkedResult(await repository.reviewOrganisationProposal(
          context,input.proposalId,input.expectedVersion,input.decision,input.reviewEvidence,input.reviewNotes
        ), 'Technical proposal was not found.');
        return res.status(200).json({ data: result?.record || result });
      }

      if (action === 'save-preference') {
        const context = await getContext(req, res);
        requirePermission(context, 'technical_preferences.manage');
        const type = enumValue(body.preferenceType, ['PART', 'FLUID'], 'preferenceType');
        const preferenceId = body.preferenceId == null || body.preferenceId === '' ? null : requiredUuid(body.preferenceId, 'preferenceId');
        const expectedVersion = preferenceId ? requiredVersion(body.expectedVersion) : null;
        const result = checkedResult(await repository.writePreference(
          context,
          type,
          preferenceId,
          expectedVersion,
          preferenceData(type, body.data, !preferenceId)
        ), 'Technical preference was not found.');
        return res.status(preferenceId ? 200 : 201).json({ data: result?.record || result });
      }

      if (action === 'publish-service-template') {
        const context = await getContext(req, res);
        requirePermission(context, 'service_templates.publish');
        const result = checkedResult(await repository.publishOrganisationServiceTemplate(
          context,
          requiredUuid(body.serviceTemplateVersionId, 'serviceTemplateVersionId'),
          requiredVersion(body.expectedVersion),
          requiredInstant(body.effectiveFrom)
        ), 'Service Template version was not found.');
        return res.status(200).json({ data: result?.record || result });
      }

      if (PLATFORM_ACTIONS.has(action)) {
        const context = await getPlatformContext(req, res);
        requirePermission(context, PLATFORM_PUBLISH);
        let result;
        if (action === 'platform-propose') {
          const input = proposalInput(body);
          result = await repository.createPlatformProposal(context,input.proposalType,input.proposedData,input.evidence,input.proposedByType);
          result = checkedResult(result, 'Platform technical proposal was not found.');
          return res.status(201).json({ data: result?.record || result });
        }
        if (action === 'platform-review') {
          const input = proposalReviewInput(body);
          result = await repository.reviewPlatformProposal(context,input.proposalId,input.expectedVersion,input.decision,input.reviewEvidence,input.reviewNotes);
          result = checkedResult(result, 'Platform technical proposal was not found.');
          return res.status(200).json({ data: result?.record || result });
        }
        const expectedVersion = requiredVersion(body.expectedVersion);
        const effectiveFrom = requiredInstant(body.effectiveFrom);
        if (action === 'publish-technical-version') {
          result = await repository.publishTechnicalVersion(
            context,
            enumValue(body.entityType, ['PART', 'FLUID'], 'entityType'),
            requiredUuid(body.entityId, 'entityId'), expectedVersion, effectiveFrom
          );
        } else if (action === 'publish-part-equivalence') {
          result = await repository.publishPartEquivalence(context, requiredUuid(body.equivalenceId, 'equivalenceId'), expectedVersion, effectiveFrom);
        } else if (action === 'publish-technical-applicability') {
          result = await repository.publishTechnicalApplicability(
            context,
            enumValue(body.applicabilityType, ['PART', 'FLUID'], 'applicabilityType'),
            requiredUuid(body.applicabilityId, 'applicabilityId'), expectedVersion, effectiveFrom
          );
        } else {
          result = await repository.publishPlatformServiceTemplate(context, requiredUuid(body.serviceTemplateVersionId, 'serviceTemplateVersionId'), expectedVersion, effectiveFrom);
        }
        result = checkedResult(result);
        return res.status(200).json({ data: result?.record || result });
      }

      throw apiError(400, 'UNSUPPORTED_ACTION', 'Unsupported technical catalogue action.');
    } catch (error) {
      const status = error.statusCode || error.status || 500;
      const code = error.code || (status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : 'INTERNAL_ERROR');
      const message = status < 500 ? (error.publicMessage || error.message) : 'Technical catalogue request failed.';
      const diagnostics = boundedPublicDiagnostics(
        { code, message, correlationId: correlationId || undefined },
        { code: 'TECHNICAL_CATALOGUE_ERROR', message: 'Technical catalogue request failed.' }
      );
      const payload = { code: diagnostics.code, message: diagnostics.message };
      if (diagnostics.correlationId) payload.correlationId = diagnostics.correlationId;
      return res.status(status).json({ error: payload });
    }
  };
}

module.exports = { createTechnicalCatalogueHandler };
