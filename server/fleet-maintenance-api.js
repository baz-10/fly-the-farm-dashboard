const { resolveRequestContext } = require('./request-context');
const { FleetMaintenanceRepository } = require('./fleet-maintenance-repository');
const { boundedPublicDiagnostics } = require('./public-diagnostics');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;
const DUE_STATES = ['CURRENT', 'DUE_SOON', 'DUE', 'OVERDUE', 'INSUFFICIENT_DATA'];
const ASSET_TYPES = ['aircraft', 'equipment-kit', 'fleet-asset'];
const STATE_RANK = { OVERDUE: 0, DUE: 1, DUE_SOON: 2, INSUFFICIENT_DATA: 3, CURRENT: 4 };
const DEFAULT_FLEET_PAGE_SIZE = 25;
const MAX_FLEET_PAGE_SIZE = 25;
const MAX_FLEET_SCAN_SIZE = 100;
const MAX_CURSOR_LENGTH = 2048;
const CURSOR_KEYS = ['v', 'lastRegistryId', 'asOf', 'baseId', 'assetType', 'state', 'pageSize'];

function fail(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  throw error;
}

function sameOrigin(req) {
  const origin = String(req.headers?.origin || '');
  const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '');
  const proto = String(req.headers?.['x-forwarded-proto'] || 'https').split(',')[0];
  if (!origin || origin !== new URL(`${proto}://${host}`).origin) fail(403, 'SAME_ORIGIN_REQUIRED', 'Same-origin requests are required.');
}

function permission(context, code) {
  const permissions = new Set(context.permissions || []);
  if (!permissions.has('*') && !permissions.has(code)) fail(403, 'FORBIDDEN', 'You do not have permission for this operation.');
}

function uuid(value, name) {
  if (!UUID.test(String(value || ''))) fail(400, 'VALIDATION_ERROR', `${name} must be a UUID.`);
  return String(value);
}

function instant(value, name = 'asOf') {
  const parsed = String(value || '');
  if (!INSTANT.test(parsed) || Number.isNaN(Date.parse(parsed))) {
    fail(400, 'VALIDATION_ERROR', `${name} must be an ISO timestamp with an explicit UTC offset.`);
  }
  return parsed;
}

function optionalEnum(value, allowed, name) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !allowed.includes(value)) fail(400, 'VALIDATION_ERROR', `${name} is invalid.`);
  return value;
}

function boundedPositiveInteger(value, name, fallback, maximum) {
  if (value == null || value === '') return fallback;
  if (!/^\d+$/.test(String(value))) fail(400, 'VALIDATION_ERROR', `${name} must be a positive integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    fail(400, 'VALIDATION_ERROR', `${name} is outside the supported range.`);
  }
  return parsed;
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fleetCursorBinding(asOf, baseId, assetType, state, pageSize) {
  return { asOf, baseId, assetType, state, pageSize };
}

function decodeFleetCursor(value, binding) {
  if (value == null || value === '') return null;
  const cursor = String(value);
  if (cursor.length > MAX_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
    fail(400, 'VALIDATION_ERROR', 'cursor is malformed.');
  }
  try {
    const decoded = Buffer.from(cursor, 'base64url');
    if (decoded.toString('base64url') !== cursor) fail(400, 'VALIDATION_ERROR', 'cursor is malformed.');
    const payload = JSON.parse(decoded.toString('utf8'));
    if (!object(payload) || Object.keys(payload).length !== CURSOR_KEYS.length
      || CURSOR_KEYS.some((key) => !Object.hasOwn(payload, key)) || payload.v !== 1
      || !UUID.test(String(payload.lastRegistryId || ''))) {
      fail(400, 'VALIDATION_ERROR', 'cursor is malformed.');
    }
    if (payload.asOf !== binding.asOf || payload.baseId !== binding.baseId
      || payload.assetType !== binding.assetType || payload.state !== binding.state
      || payload.pageSize !== binding.pageSize) {
      fail(400, 'CURSOR_MISMATCH', 'cursor does not match this Fleet request.');
    }
    return payload.lastRegistryId;
  } catch (error) {
    if (error?.status) throw error;
    fail(400, 'VALIDATION_ERROR', 'cursor is malformed.');
  }
}

function encodeFleetCursor(lastRegistryId, binding) {
  return Buffer.from(JSON.stringify({ v: 1, lastRegistryId, ...binding })).toString('base64url');
}

function rejectAvailabilityAuthority(value) {
  if (Array.isArray(value)) return value.forEach(rejectAvailabilityAuthority);
  if (!object(value)) return;
  for (const [key, item] of Object.entries(value)) {
    const normalized = key.replace(/[^a-z]/gi, '').toLowerCase();
    if (['availability', 'operationalavailability', 'missionready', 'serviceability', 'aircraftserviceability', 'fleetstatus'].includes(normalized)) {
      fail(502, 'MAINTENANCE_DUE_RESPONSE_INVALID', 'Maintenance due-state response was invalid.');
    }
    rejectAvailabilityAuthority(item);
  }
}

function checkedDueResult(value, assetId, asOf, attached = true) {
  if (!object(value) || value.assetId !== assetId || typeof value.asOf !== 'string'
    || Number.isNaN(Date.parse(value.asOf)) || Date.parse(value.asOf) !== Date.parse(asOf)
    || typeof value.timezone !== 'string' || !Array.isArray(value.requirements)
    || (attached && !Array.isArray(value.attachedAssetSummaries))) {
    fail(502, 'MAINTENANCE_DUE_RESPONSE_INVALID', 'Maintenance due-state response was invalid.');
  }
  rejectAvailabilityAuthority(value);
  value.requirements.forEach((requirement) => {
    if (!object(requirement) || !DUE_STATES.includes(requirement.state) || !Array.isArray(requirement.thresholds)) {
      fail(502, 'MAINTENANCE_DUE_RESPONSE_INVALID', 'Maintenance due-state response was invalid.');
    }
  });
  if (attached) value.attachedAssetSummaries.forEach((summary) => {
    if (!object(summary) || typeof summary.registryId !== 'string' || !object(summary.dueState)) {
      fail(502, 'MAINTENANCE_DUE_RESPONSE_INVALID', 'Maintenance due-state response was invalid.');
    }
    checkedDueResult(summary.dueState, summary.registryId, asOf, false);
  });
  return value;
}

function emptyCounts() {
  return { CURRENT: 0, DUE_SOON: 0, DUE: 0, OVERDUE: 0, INSUFFICIENT_DATA: 0 };
}

function summarizeFleetRow(candidate, asOf) {
  const dueState = checkedDueResult(candidate.dueState, candidate.registryId, asOf);
  const stateCounts = emptyCounts();
  dueState.requirements.forEach((requirement) => { stateCounts[requirement.state] += 1; });
  const highestState = [...DUE_STATES]
    .filter((state) => stateCounts[state] > 0)
    .sort((left, right) => STATE_RANK[left] - STATE_RANK[right])[0] || 'CURRENT';
  return {
    registryId: candidate.registryId,
    source: candidate.source,
    sourceRecordId: candidate.sourceRecordId,
    identity: candidate.identity,
    operatingLocationId: candidate.operatingLocationId,
    highestState,
    requirementCount: dueState.requirements.length,
    attachedAssetCount: dueState.attachedAssetSummaries.length,
    stateCounts,
  };
}

function createFleetMaintenanceHandler(deps = {}) {
  const repository = deps.repository || new FleetMaintenanceRepository();
  const getContext = deps.resolveContext || resolveRequestContext;
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const correlationId = String(req.correlationId || req.headers?.['x-request-id'] || '');
    try {
      const context = await getContext(req, res);
      if (req.method === 'GET') {
        const action = req.query?.action;
        if (action === 'due-state') {
          permission(context, 'maintenance_requirements.read');
          const assetId = uuid(req.query?.assetId, 'assetId');
          const asOf = instant(req.query?.asOf);
          const result = await repository.readDueState(context, assetId, asOf);
          if (result?.forbidden) fail(403, 'FORBIDDEN', 'You do not have permission for this operation.');
          if (result?.not_found) fail(404, 'NOT_FOUND', 'Maintenance due state was not found.');
          return res.status(200).json({ data: checkedDueResult(result, assetId, asOf) });
        }
        if (action === 'fleet-due-summary') {
          permission(context, 'maintenance_requirements.read');
          const asOf = instant(req.query?.asOf);
          const baseId = req.query?.baseId == null || req.query.baseId === '' ? null : uuid(req.query.baseId, 'baseId');
          if (baseId && !(context.operatingLocationIds || []).includes(baseId)) fail(403, 'LOCATION_FORBIDDEN', 'This Base is outside the assigned scope.');
          const assetType = optionalEnum(req.query?.assetType, ASSET_TYPES, 'assetType');
          const state = optionalEnum(req.query?.state, DUE_STATES, 'state');
          if (req.query?.page != null && req.query.page !== '') fail(400, 'VALIDATION_ERROR', 'Offset pagination is not supported.');
          const pageSize = boundedPositiveInteger(req.query?.pageSize, 'pageSize', DEFAULT_FLEET_PAGE_SIZE, MAX_FLEET_PAGE_SIZE);
          const binding = fleetCursorBinding(asOf, baseId, assetType, state, pageSize);
          const afterRegistryId = decodeFleetCursor(req.query?.cursor, binding);
          const result = await repository.readFleetDueSummary(context, asOf, { baseId, assetType, state, afterRegistryId, pageSize });
          if (!object(result) || !Array.isArray(result.candidates) || typeof result.hasMore !== 'boolean'
            || !Array.isArray(result.rowRegistryIds) || result.rowRegistryIds.length > pageSize
            || !Number.isInteger(result.scannedCount) || result.scannedCount < 0 || result.scannedCount > MAX_FLEET_SCAN_SIZE
            || result.candidates.length > result.scannedCount
            || (result.hasMore && !UUID.test(String(result.lastScannedRegistryId || '')))) {
            fail(502, 'MAINTENANCE_DUE_RESPONSE_INVALID', 'Maintenance due-state response was invalid.');
          }
          const allRows = result.candidates.map((candidate) => summarizeFleetRow(candidate, asOf));
          const rowsById = new Map(allRows.map((row) => [row.registryId, row]));
          const rows = result.rowRegistryIds.map((registryId) => rowsById.get(registryId));
          if (rows.some((row) => !row) || rows.some((row) => state && row.highestState !== state)
            || (!state && rows.length !== allRows.length)) {
            fail(502, 'MAINTENANCE_DUE_RESPONSE_INVALID', 'Maintenance due-state response was invalid.');
          }
          const pageCounts = emptyCounts();
          allRows.forEach((row) => { pageCounts[row.highestState] += 1; });
          const nextCursor = result.hasMore ? encodeFleetCursor(result.lastScannedRegistryId, binding) : null;
          return res.status(200).json({
            data: {
              asOf,
              filters: { baseId, assetType, state },
              pageCounts,
              page: {
                pageSize,
                hasMore: result.hasMore,
                nextCursor,
                scannedCount: result.scannedCount,
                returnedCount: rows.length,
              },
              rows,
            },
          });
        }
        permission(context, 'asset_meters.read');
        const result = await repository.readWorkspace(context, uuid(req.query?.assetId, 'assetId'));
        if (result?.forbidden) fail(403, 'FORBIDDEN', 'You do not have permission for this operation.');
        if (result?.not_found) fail(404, 'NOT_FOUND', 'Asset maintenance workspace not found.');
        return res.status(200).json({ data: result });
      }

      if (req.method !== 'POST') fail(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
      sameOrigin(req);
      const body = req.body || {};
      const action = req.query?.action;
      let command;
      let id = null;
      let version = null;
      let data;
      if (action === 'attach') {
        permission(context, 'asset_attachments.manage');
        command = 'attach';
        data = { parent_asset_id: uuid(body.parentAssetId, 'parentAssetId'), child_asset_id: uuid(body.childAssetId, 'childAssetId'), position_label: String(body.positionLabel || '').trim(), attached_at: body.attachedAt, meter_snapshot: body.meterSnapshot || null };
        if (!data.position_label || Number.isNaN(Date.parse(data.attached_at))) fail(400, 'VALIDATION_ERROR', 'Attachment position and time are required.');
      } else if (action === 'detach') {
        permission(context, 'asset_attachments.manage');
        command = 'detach';
        id = uuid(body.id, 'id');
        version = Number(body.expectedVersion);
        data = { detached_at: body.detachedAt, meter_snapshot: body.meterSnapshot || null };
      } else if (action === 'record-reading' || action === 'correct-reading') {
        permission(context, 'asset_meters.manage');
        command = action.replace('-', '_');
        data = { meter_definition_id: uuid(body.meterDefinitionId, 'meterDefinitionId'), recorded_at: body.recordedAt, value: body.value, source: body.source, source_system: body.sourceSystem, source_record_id: body.sourceRecordId, evidence: body.evidence || {}, supersedes_reading_id: body.supersedesReadingId, correction_reason: body.correctionReason };
      } else fail(400, 'UNSUPPORTED_ACTION', 'Unsupported maintenance action.');
      const result = await repository.command(context, command, id, version, data);
      if (result?.forbidden) fail(403, 'FORBIDDEN', 'You do not have permission for this operation.');
      if (result?.location_forbidden) fail(403, 'LOCATION_FORBIDDEN', 'This asset is outside the assigned Base scope.');
      if (result?.not_found) fail(404, 'NOT_FOUND', 'Maintenance record not found.');
      if (result?.conflict) fail(409, 'VERSION_CONFLICT', 'This maintenance record changed before your update.');
      if (result?.relationship_conflict) fail(409, 'RELATIONSHIP_CONFLICT', 'The relationship is unavailable.');
      return res.status(201).json({ data: result.record });
    } catch (error) {
      const status = error.statusCode || error.status || 500;
      const code = error.code || (status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : 'REQUEST_FAILED');
      const message = status < 500 ? (error.publicMessage || error.message) : 'Maintenance request failed.';
      const diagnostics = boundedPublicDiagnostics(
        { code, message, correlationId: correlationId || undefined },
        { code: 'MAINTENANCE_API_ERROR', message: 'Maintenance request failed.' }
      );
      const payload = { code: diagnostics.code, message: diagnostics.message };
      if (diagnostics.correlationId) payload.correlationId = diagnostics.correlationId;
      return res.status(status).json({ error: payload });
    }
  };
}

module.exports = { createFleetMaintenanceHandler };
