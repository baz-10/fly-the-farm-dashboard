const { createHttpError } = require('./supabase');
const { resolveRequestContext } = require('./request-context');
const { OperationalRepository } = require('./operational-repository');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_BOUNDARY_BODY_BYTES = 256 * 1024;
const MAX_PAGE_SIZE = 100;
const AUSTRALIAN_STATES = new Set(['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT']);

const SCHEMAS = {
  operating_locations: { required: ['name'], fields: { name: 'name', address: 'address', timezone: 'timezone' } },
  clients: { required: ['name'], fields: { name: 'name', contactName: 'contact_name', contactEmail: 'contact_email', contactPhone: 'contact_phone' } },
  properties: { required: ['clientId', 'name', 'state'], fields: { clientId: 'client_id', name: 'name', address: 'address', state: 'state' } },
  fields: { required: ['propertyId', 'name'], readOnly: ['fieldBoundaryVersionId'], fields: { propertyId: 'property_id', fieldBoundaryVersionId: 'field_boundary_version_id', name: 'name', areaHectares: 'area_hectares' } },
  jobs: { required: ['clientId', 'propertyId', 'reference'], fields: { clientId: 'client_id', propertyId: 'property_id', fieldIds: 'field_ids', reference: 'reference', scope: 'scope', status: 'status', notes: 'notes', requestedDate: 'requested_date', scheduledDate: 'scheduled_date' } },
  missions: { required: ['jobId', 'operatingLocationId', 'missionNumber'], fields: { jobId: 'job_id', operatingLocationId: 'operating_location_id', missionNumber: 'mission_number', title: 'title', description: 'description', status: 'status', scheduledStartAt: 'scheduled_start_at' } },
};

function apiError(statusCode, code, message, meta) {
  const error = createHttpError(statusCode, message);
  error.code = code;
  error.meta = meta;
  return error;
}

function assertUuid(value, field) {
  if (!UUID.test(String(value || ''))) throw apiError(400, 'VALIDATION_ERROR', `${field} must be a UUID.`);
  return value;
}

function assertSameOrigin(req) {
  const origin = String(req.headers?.origin || '');
  const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '');
  if (!origin || !host) throw apiError(403, 'SAME_ORIGIN_REQUIRED', 'Same-origin requests are required.');
  const forwardedProto = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProto || (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
  let trustedOrigin;
  try { trustedOrigin = new URL(`${protocol}://${host}`).origin; } catch { throw apiError(403, 'SAME_ORIGIN_REQUIRED', 'Same-origin requests are required.'); }
  if (origin !== trustedOrigin) throw apiError(403, 'SAME_ORIGIN_REQUIRED', 'Same-origin requests are required.');
}

function parseBody(req, maxBytes = MAX_BODY_BYTES) {
  const length = Number(req.headers?.['content-length'] || 0);
  if (length > maxBytes) throw apiError(413, 'PAYLOAD_TOO_LARGE', 'Request payload is too large.');
  let body;
  try {
    body = req.body && typeof req.body === 'object' ? req.body : typeof req.body === 'string' && req.body ? JSON.parse(req.body) : {};
  } catch {
    throw apiError(400, 'VALIDATION_ERROR', 'Request body must be valid JSON.');
  }
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > maxBytes) throw apiError(413, 'PAYLOAD_TOO_LARGE', 'Request payload is too large.');
  return body;
}

function hasPermission(context, resource, action) {
  const permissions = new Set(context.permissions || []);
  return permissions.has('*') || permissions.has(`${resource}.*`) || permissions.has(`${resource}.${action}`);
}

function assertPermission(context, resource, action) {
  if (!hasPermission(context, resource, action)) throw apiError(403, 'FORBIDDEN', 'You do not have permission for this operation.');
}

function mapDatabaseRecord(resource, record) {
  if (!record) return null;
  const schema = SCHEMAS[resource];
  const result = { id: record.id };
  Object.entries(schema.fields).forEach(([apiField, databaseField]) => {
    if (record[databaseField] !== undefined) result[apiField] = record[databaseField];
  });
  if (record.row_version !== undefined) result.rowVersion = record.row_version;
  if (record.created_at !== undefined) result.createdAt = record.created_at;
  if (record.updated_at !== undefined) result.updatedAt = record.updated_at;
  return result;
}

function mapInput(resource, body, existing) {
  const schema = SCHEMAS[resource];
  const readOnly = new Set(schema.readOnly || []);
  const allowed = new Set([...Object.keys(schema.fields).filter((field) => !readOnly.has(field)), 'expectedVersion']);
  Object.keys(body).forEach((key) => {
    if (allowed.has(key)) return;
    if (/financial|cost|margin|price|revenue|payload/i.test(key)) {
      throw apiError(403, 'FORBIDDEN_FIELD', 'Financial fields are not permitted by this endpoint.');
    }
    throw apiError(400, 'VALIDATION_ERROR', `Unexpected field: ${key}.`);
  });
  const baseline = existing ? mapDatabaseRecord(resource, existing) : {};
  const merged = { ...baseline, ...body };
  schema.required.forEach((field) => {
    if (typeof merged[field] !== 'string' || merged[field].trim() === '') {
      throw apiError(400, 'VALIDATION_ERROR', `${field} is required.`);
    }
  });
  ['contactName', 'contactEmail', 'contactPhone', 'address', 'timezone', 'state', 'scope', 'status', 'notes', 'title', 'description', 'requestedDate', 'scheduledDate', 'scheduledStartAt'].forEach((field) => {
    if (merged[field] !== undefined && merged[field] !== null && typeof merged[field] !== 'string') {
      throw apiError(400, 'VALIDATION_ERROR', `${field} must be a string.`);
    }
  });
  if (merged.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(merged.contactEmail)) {
    throw apiError(400, 'VALIDATION_ERROR', 'contactEmail must be a valid email address.');
  }
  if (resource === 'properties' && !AUSTRALIAN_STATES.has(merged.state)) {
    throw apiError(400, 'VALIDATION_ERROR', 'state must be an Australian state or territory code.');
  }
  if (merged.areaHectares !== undefined && merged.areaHectares !== null && (!Number.isFinite(Number(merged.areaHectares)) || Number(merged.areaHectares) < 0)) {
    throw apiError(400, 'VALIDATION_ERROR', 'areaHectares must be a non-negative number.');
  }
  if (merged.scheduledStartAt && Number.isNaN(Date.parse(merged.scheduledStartAt))) {
    throw apiError(400, 'VALIDATION_ERROR', 'scheduledStartAt must be a valid ISO date-time.');
  }
  ['requestedDate', 'scheduledDate'].forEach((field) => {
    if (merged[field] && !isIsoCalendarDate(merged[field])) {
      throw apiError(400, 'VALIDATION_ERROR', `${field} must be an ISO date.`);
    }
  });
  ['clientId', 'propertyId', 'fieldBoundaryVersionId', 'jobId', 'operatingLocationId'].forEach((field) => {
    if (merged[field] !== undefined && merged[field] !== null) assertUuid(merged[field], field);
  });
  if (resource === 'missions' && merged.status && String(merged.status).toLowerCase() !== 'planning') {
    throw apiError(400, 'VALIDATION_ERROR', 'Mission API writes may only create or update Planning records.');
  }
  if (resource === 'jobs') {
    if (!Array.isArray(merged.fieldIds) || merged.fieldIds.length < 1 || merged.fieldIds.length > 100) {
      throw apiError(400, 'VALIDATION_ERROR', 'fieldIds must contain between 1 and 100 field IDs.');
    }
    const fieldIds = merged.fieldIds.map((fieldId) => assertUuid(fieldId, 'fieldIds'));
    if (new Set(fieldIds).size !== fieldIds.length) {
      throw apiError(400, 'VALIDATION_ERROR', 'fieldIds must not contain duplicates.');
    }
    merged.fieldIds = fieldIds;
  }
  const data = {};
  Object.entries(schema.fields).forEach(([apiField, databaseField]) => {
    if (!readOnly.has(apiField) && merged[apiField] !== undefined) data[databaseField] = merged[apiField];
  });
  if (resource === 'missions' && !data.status) data.status = 'planning';
  return { data, merged };
}

function isIsoCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function assertMissionLocationAccess(context, operatingLocationId) {
  if ((context.operatingLocationIds || []).includes(operatingLocationId)) return;
  throw apiError(403, 'LOCATION_FORBIDDEN', 'This mission operating location is not assigned to your membership.');
}

async function assertRelationships(repository, resource, context, values) {
  const required = [];
  if (resource === 'properties') required.push(['clients', values.clientId]);
  if (resource === 'fields') {
    required.push(['properties', values.propertyId]);
    if (values.fieldBoundaryVersionId) required.push(['field_boundary_versions', values.fieldBoundaryVersionId, { property_id: values.propertyId }]);
  }
  if (resource === 'jobs') {
    required.push(['clients', values.clientId]);
    required.push(['properties', values.propertyId, { client_id: values.clientId }]);
    (values.fieldIds || []).forEach((fieldId) => required.push(['fields', fieldId, { property_id: values.propertyId }]));
  }
  if (resource === 'missions') {
    required.push(['jobs', values.jobId]);
    required.push(['operating_locations', values.operatingLocationId]);
  }
  for (const [relatedResource, id, filters] of required) {
    const exists = await repository.relationshipExists(relatedResource, context, id, filters);
    if (!exists) throw apiError(409, 'RELATIONSHIP_CONFLICT', 'The related record is missing, archived, or belongs to another organisation.');
  }
}

function validateBoundaryGeojson(boundaryGeojson) {
  if (!boundaryGeojson || typeof boundaryGeojson !== 'object' || Array.isArray(boundaryGeojson)) {
    throw apiError(400, 'VALIDATION_ERROR', 'boundaryGeojson must be a GeoJSON Polygon or MultiPolygon object.');
  }
  if (!['Polygon', 'MultiPolygon'].includes(boundaryGeojson.type)) {
    throw apiError(400, 'VALIDATION_ERROR', 'boundaryGeojson type must be Polygon or MultiPolygon.');
  }
  if (!Array.isArray(boundaryGeojson.coordinates) || boundaryGeojson.coordinates.length === 0) {
    throw apiError(400, 'VALIDATION_ERROR', 'boundaryGeojson coordinates must not be empty.');
  }
  const allowedKeys = new Set(['type', 'coordinates']);
  if (Object.keys(boundaryGeojson).some((key) => !allowedKeys.has(key))) {
    throw apiError(400, 'VALIDATION_ERROR', 'boundaryGeojson may only contain type and coordinates.');
  }
  const polygons = boundaryGeojson.type === 'Polygon' ? [boundaryGeojson.coordinates] : boundaryGeojson.coordinates;
  polygons.forEach((polygon) => {
    if (!Array.isArray(polygon) || polygon.length === 0) {
      throw apiError(400, 'VALIDATION_ERROR', 'boundaryGeojson coordinates must contain polygon rings.');
    }
    polygon.forEach((ring) => {
      if (!Array.isArray(ring) || ring.length < 4) {
        throw apiError(400, 'VALIDATION_ERROR', 'Each boundary ring must contain at least four positions.');
      }
      ring.forEach((position) => {
        if (!Array.isArray(position) || position.length !== 2 || !position.every(Number.isFinite)) {
          throw apiError(400, 'VALIDATION_ERROR', 'Each boundary position must contain finite longitude and latitude numbers.');
        }
        if (position[0] < -180 || position[0] > 180 || position[1] < -90 || position[1] > 90) {
          throw apiError(400, 'VALIDATION_ERROR', 'Boundary coordinates are outside longitude or latitude limits.');
        }
      });
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        throw apiError(400, 'VALIDATION_ERROR', 'Each boundary ring must be closed.');
      }
    });
  });
  if (Buffer.byteLength(JSON.stringify(boundaryGeojson), 'utf8') > MAX_BOUNDARY_BODY_BYTES) {
    throw apiError(413, 'PAYLOAD_TOO_LARGE', 'Boundary GeoJSON is too large.');
  }
  return boundaryGeojson;
}

function mapBoundaryRecord(record, fieldVersion) {
  if (!record) return null;
  const mapped = {
    id: record.id,
    fieldId: record.field_id,
    propertyId: record.property_id,
    versionNumber: record.version_number,
    boundaryGeojson: record.boundary_geojson,
  };
  if (record.captured_at !== undefined && record.captured_at !== null) mapped.capturedAt = record.captured_at;
  if (record.row_version !== undefined) mapped.rowVersion = record.row_version;
  if (record.created_at !== undefined) mapped.createdAt = record.created_at;
  if (record.updated_at !== undefined) mapped.updatedAt = record.updated_at;
  if (fieldVersion !== undefined) mapped.fieldVersion = fieldVersion;
  return mapped;
}

function pagination(query) {
  const page = Number(query?.page || 1);
  const pageSize = Number(query?.pageSize || 25);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw apiError(400, 'VALIDATION_ERROR', `page must be positive and pageSize must be between 1 and ${MAX_PAGE_SIZE}.`);
  }
  return { page, pageSize };
}

function errorEnvelope(error) {
  const status = error.statusCode || 500;
  const code = error.code || (status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : 'INTERNAL_ERROR');
  const response = { error: { code, message: error.publicMessage || 'Operational API request failed.' } };
  if (error.meta) response.error.meta = error.meta;
  return { status, response };
}

function createOperationalHandler(resource, dependencies = {}) {
  const repository = dependencies.repository || new OperationalRepository();
  const getContext = dependencies.resolveContext || resolveRequestContext;
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (req.method === 'OPTIONS') { res.setHeader('Allow', 'GET,POST,PATCH,DELETE,OPTIONS'); return res.status(204).end(); }
    try {
      const context = await getContext(req, res);
      if (req.method === 'GET') {
        assertPermission(context, resource, 'read');
        const id = req.query?.id;
        if (id) {
          assertUuid(id, 'id');
          const record = await repository.get(resource, context, id);
          if (!record || record.archived_at) throw apiError(404, 'NOT_FOUND', 'Operational record not found.');
          return res.status(200).json({ data: mapDatabaseRecord(resource, record) });
        }
        const bounds = pagination(req.query);
        const records = await repository.list(resource, context, bounds);
        return res.status(200).json({ data: (records || []).map((record) => mapDatabaseRecord(resource, record)), pagination: bounds });
      }
      if (!['POST', 'PATCH', 'DELETE'].includes(req.method)) {
        res.setHeader('Allow', 'GET,POST,PATCH,DELETE,OPTIONS');
        return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } });
      }
      assertSameOrigin(req);
      const body = parseBody(req);
      if (req.method === 'POST') {
        assertPermission(context, resource, 'create');
        const { data, merged } = mapInput(resource, body);
        if (resource === 'missions') assertMissionLocationAccess(context, merged.operatingLocationId);
        await assertRelationships(repository, resource, context, merged);
        const result = await repository.create(resource, context, data);
        if (result.relationshipConflict) throw apiError(409, 'RELATIONSHIP_CONFLICT', 'The related record is missing, archived, or belongs to another organisation.');
        if (result.locationForbidden) throw apiError(403, 'LOCATION_FORBIDDEN', 'This mission operating location is not assigned to your membership.');
        if (result.lifecycleConflict) throw apiError(409, 'LIFECYCLE_CONFLICT', 'Only Planning missions can be changed through this endpoint.');
        return res.status(201).json({ data: mapDatabaseRecord(resource, result.record) });
      }
      const id = assertUuid(req.query?.id, 'id');
      const expectedVersion = Number(body.expectedVersion);
      if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw apiError(400, 'VALIDATION_ERROR', 'expectedVersion must be a positive integer.');
      if (req.method === 'PATCH') {
        assertPermission(context, resource, 'update');
        const existing = await repository.get(resource, context, id);
        if (!existing || existing.archived_at) throw apiError(404, 'NOT_FOUND', 'Operational record not found.');
        const { data, merged } = mapInput(resource, body, existing);
        if (resource === 'missions') assertMissionLocationAccess(context, merged.operatingLocationId);
        await assertRelationships(repository, resource, context, merged);
        const result = await repository.update(resource, context, id, expectedVersion, data);
        if (result.notFound) throw apiError(404, 'NOT_FOUND', 'Operational record not found.');
        if (result.relationshipConflict) throw apiError(409, 'RELATIONSHIP_CONFLICT', 'The related record is missing, archived, or belongs to another organisation.');
        if (result.locationForbidden) throw apiError(403, 'LOCATION_FORBIDDEN', 'This mission operating location is not assigned to your membership.');
        if (result.lifecycleConflict) throw apiError(409, 'LIFECYCLE_CONFLICT', 'Only Planning missions can be changed through this endpoint.');
        if (result.conflict) throw apiError(409, 'VERSION_CONFLICT', 'This record changed before your update.', { currentVersion: result.currentVersion });
        return res.status(200).json({ data: mapDatabaseRecord(resource, result.record) });
      }
      assertPermission(context, resource, 'archive');
      if (await repository.hasActiveDependencies(resource, context, id)) {
        throw apiError(409, 'ARCHIVE_CONFLICT', 'Archive dependent active records before archiving this record.');
      }
      const result = await repository.archive(resource, context, id, expectedVersion);
      if (result.notFound) throw apiError(404, 'NOT_FOUND', 'Operational record not found.');
      if (result.archiveConflict) throw apiError(409, 'ARCHIVE_CONFLICT', 'Archive dependent active records before archiving this record.');
      if (result.conflict) throw apiError(409, 'VERSION_CONFLICT', 'This record changed before your update.', { currentVersion: result.currentVersion });
      return res.status(200).json({ data: mapDatabaseRecord(resource, result.record) });
    } catch (error) {
      const { status, response } = errorEnvelope(error);
      return res.status(status).json(response);
    }
  };
}

function createFieldBoundaryVersionHandler(dependencies = {}) {
  const repository = dependencies.repository || new OperationalRepository();
  const getContext = dependencies.resolveContext || resolveRequestContext;
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (req.method === 'OPTIONS') { res.setHeader('Allow', 'GET,POST,OPTIONS'); return res.status(204).end(); }
    try {
      const context = await getContext(req, res);
      if (req.method === 'GET') {
        assertPermission(context, 'field_boundary_versions', 'read');
        if (req.query?.id) {
          const record = await repository.getBoundaryVersion(context, assertUuid(req.query.id, 'id'));
          if (!record || record.archived_at) throw apiError(404, 'NOT_FOUND', 'Boundary version not found.');
          return res.status(200).json({ data: mapBoundaryRecord(record) });
        }
        const fieldId = req.query?.fieldId ? assertUuid(req.query.fieldId, 'fieldId') : null;
        const propertyId = req.query?.propertyId ? assertUuid(req.query.propertyId, 'propertyId') : null;
        if (!fieldId && !propertyId) throw apiError(400, 'VALIDATION_ERROR', 'fieldId or propertyId is required.');
        const bounds = pagination(req.query);
        const records = await repository.listBoundaryVersions(context, { fieldId, propertyId, ...bounds });
        return res.status(200).json({ data: (records || []).map((record) => mapBoundaryRecord(record)), pagination: bounds });
      }
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'GET,POST,OPTIONS');
        return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } });
      }
      assertSameOrigin(req);
      assertPermission(context, 'field_boundary_versions', 'create');
      const body = parseBody(req, MAX_BOUNDARY_BODY_BYTES);
      const allowed = new Set(['fieldId', 'propertyId', 'expectedFieldVersion', 'boundaryGeojson', 'capturedAt']);
      Object.keys(body).forEach((key) => {
        if (!allowed.has(key)) throw apiError(400, 'VALIDATION_ERROR', `Unexpected field: ${key}.`);
      });
      const fieldId = assertUuid(body.fieldId, 'fieldId');
      const propertyId = assertUuid(body.propertyId, 'propertyId');
      const expectedFieldVersion = Number(body.expectedFieldVersion);
      if (!Number.isInteger(expectedFieldVersion) || expectedFieldVersion < 1) {
        throw apiError(400, 'VALIDATION_ERROR', 'expectedFieldVersion must be a positive integer.');
      }
      const boundaryGeojson = validateBoundaryGeojson(body.boundaryGeojson);
      const capturedAt = body.capturedAt ?? null;
      if (capturedAt !== null && (typeof capturedAt !== 'string' || Number.isNaN(Date.parse(capturedAt)))) {
        throw apiError(400, 'VALIDATION_ERROR', 'capturedAt must be a valid ISO date-time.');
      }
      if (!await repository.relationshipExists('properties', context, propertyId)) {
        throw apiError(409, 'RELATIONSHIP_CONFLICT', 'The property is missing, archived, or belongs to another organisation.');
      }
      if (!await repository.relationshipExists('fields', context, fieldId, { property_id: propertyId })) {
        throw apiError(409, 'RELATIONSHIP_CONFLICT', 'The field is missing, archived, or belongs to another property.');
      }
      const result = await repository.createBoundaryVersion(context, { fieldId, propertyId, expectedFieldVersion, boundaryGeojson, capturedAt });
      if (result.notFound || result.relationshipConflict) throw apiError(409, 'RELATIONSHIP_CONFLICT', 'The field or property is no longer active.');
      if (result.conflict) throw apiError(409, 'VERSION_CONFLICT', 'This field changed before the boundary update.', { currentVersion: result.currentVersion });
      return res.status(201).json({ data: mapBoundaryRecord(result.record, result.fieldVersion) });
    } catch (error) {
      const { status, response } = errorEnvelope(error);
      return res.status(status).json(response);
    }
  };
}

function createSessionHandler(dependencies = {}) {
  const getContext = dependencies.resolveContext || resolveRequestContext;
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } }); }
    try {
      const context = await getContext(req, res);
      return res.status(200).json({ data: { user: context.user, organisation: context.organisation, roles: context.roles, permissions: context.permissions, operatingLocationIds: context.operatingLocationIds, entitlement: context.entitlement } });
    } catch (error) {
      const { status, response } = errorEnvelope(error);
      return res.status(status).json(response);
    }
  };
}

module.exports = { createFieldBoundaryVersionHandler, createOperationalHandler, createSessionHandler, errorEnvelope, mapBoundaryRecord, mapDatabaseRecord };
