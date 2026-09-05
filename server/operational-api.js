const { createHttpError } = require('./supabase');
const crypto = require('crypto');
const { Unzip, UnzipInflate } = require('fflate');
const { resolveOperationalActorContext } = require('./operational-actor-context');
const { resolveRequestContext } = require('./request-context');
const { OperationalRepository } = require('./operational-repository');
const { fetchOpenMeteoPlanningForecast } = require('./weather-provider');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_BOUNDARY_BODY_BYTES = 256 * 1024;
const MAX_IMPORT_SOURCE_BYTES = 3 * 1024 * 1024;
const MAX_IMPORT_BODY_BYTES = Math.ceil(MAX_IMPORT_SOURCE_BYTES * 1.4);
const MAX_KMZ_ENTRIES = 100;
const MAX_KMZ_EXPANDED_BYTES = 10 * 1024 * 1024;
const KMZ_STREAM_CHUNK_BYTES = 1024;
const MAX_PAGE_SIZE = 100;
const AUSTRALIAN_STATES = new Set(['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT']);
const ACCEPTANCE_PREFIX = 'SC ACCEPTANCE —';

const SCHEMAS = {
  operating_locations: { required: ['name'], fields: {
    name: 'name', address: 'address', timezone: 'timezone', latitude: 'latitude', longitude: 'longitude',
    addressSource: 'address_source', locationConfirmedAt: 'location_confirmed_at',
  } },
  clients: { required: ['name'], fields: { name: 'name', contactName: 'contact_name', contactEmail: 'contact_email', contactPhone: 'contact_phone', notes: 'notes', addresses: 'addresses' } },
  properties: { required: ['clientId', 'name', 'address', 'state'], fields: { clientId: 'client_id', name: 'name', address: 'address', state: 'state', locality: 'locality', postcode: 'postcode', lotPlan: 'lot_plan', primaryContactName: 'primary_contact_name', accessNotes: 'access_notes', notes: 'notes', latitude: 'latitude', longitude: 'longitude', addressSource: 'address_source', locationConfirmedAt: 'location_confirmed_at' } },
  fields: { required: ['propertyId', 'name'], readOnly: ['fieldBoundaryVersionId'], fields: {
    propertyId: 'property_id', fieldBoundaryVersionId: 'field_boundary_version_id', name: 'name', areaHectares: 'area_hectares',
    accessPointLabel: 'access_point_label', accessLatitude: 'access_latitude', accessLongitude: 'access_longitude',
    accessCoordinateSource: 'access_coordinate_source', accessLocationConfirmedAt: 'access_location_confirmed_at',
  } },
  jobs: { required: ['clientId', 'propertyId', 'reference'], fields: { clientId: 'client_id', propertyId: 'property_id', fieldIds: 'field_ids', reference: 'reference', scope: 'scope', status: 'status', notes: 'notes', requestedDate: 'requested_date', scheduledDate: 'scheduled_date' } },
  missions: { required: ['jobId', 'operatingLocationId', 'missionNumber'], fields: { jobId: 'job_id', operatingLocationId: 'operating_location_id', missionNumber: 'mission_number', title: 'title', description: 'description', status: 'status', scheduledStartAt: 'scheduled_start_at', aircraftIds: 'aircraft_ids', equipmentKitIds: 'equipment_kit_ids' } },
  aircraft: { required: ['operatingLocationId', 'registration', 'manufacturer', 'model', 'serialNumber'], fields: {
    operatingLocationId: 'operating_location_id', registration: 'registration', manufacturer: 'manufacturer', model: 'model', serialNumber: 'serial_number',
    activationDate: 'activation_date', status: 'status', serviceabilityState: 'serviceability_state', missionReady: 'mission_ready',
    mtow: 'mtow', maxAltitude: 'max_altitude', maxWindSpeed: 'max_wind_speed', documentation: 'documentation', notes: 'notes',
  } },
  'fleet-assets': { required: ['operatingLocationId', 'assetType', 'assetIdentifier', 'status'], fields: {
    operatingLocationId: 'operating_location_id', assetType: 'asset_type', assetIdentifier: 'asset_identifier',
    registration: 'registration', vin: 'vin', serialNumber: 'serial_number', manufacturer: 'manufacturer',
    model: 'model', manufactureYear: 'manufacture_year', status: 'status', notes: 'notes',
  } },
  'equipment-kits': { required: ['operatingLocationId', 'name', 'type'], fields: {} },
};

function apiError(statusCode, code, message, meta) {
  const error = createHttpError(statusCode, message);
  error.code = code;
  error.meta = meta;
  return error;
}

const KMZ_CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    table[index] = value >>> 0;
  }
  return table;
})();

function updateKmzCrc32(current, bytes) {
  let value = current;
  for (let index = 0; index < bytes.length; index += 1) {
    value = KMZ_CRC32_TABLE[(value ^ bytes[index]) & 0xff] ^ (value >>> 8);
  }
  return value >>> 0;
}

function unsafeKmzEntryName(name) {
  const parts = name.split('/');
  const pathParts = name.endsWith('/') ? parts.slice(0, -1) : parts;
  return !name || name.length > 255 || /^[\\/]/.test(name) || /[\\:\0-\x1f\x7f]/.test(name)
    || pathParts.some((part) => !part || part === '.' || part === '..');
}

function readKmzCentralDirectory(bytes) {
  if (bytes.length < 22) throw new Error('ZIP end record is missing.');
  const minimumOffset = Math.max(0, bytes.length - 22 - 65535);
  let endOffset = -1;
  for (let offset = bytes.length - 22; offset >= minimumOffset; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50
      && offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error('ZIP end record is invalid.');

  const diskNumber = bytes.readUInt16LE(endOffset + 4);
  const centralDiskNumber = bytes.readUInt16LE(endOffset + 6);
  const diskEntryCount = bytes.readUInt16LE(endOffset + 8);
  const entryCount = bytes.readUInt16LE(endOffset + 10);
  const centralSize = bytes.readUInt32LE(endOffset + 12);
  const centralOffset = bytes.readUInt32LE(endOffset + 16);
  if (diskNumber !== 0 || centralDiskNumber !== 0 || diskEntryCount !== entryCount
    || entryCount === 0 || entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff
    || centralOffset + centralSize !== endOffset) {
    throw new Error('ZIP central directory is invalid.');
  }
  if (entryCount > MAX_KMZ_ENTRIES) {
    throw apiError(400, 'VALIDATION_ERROR', 'KMZ contains unsafe or unsupported entries.');
  }

  const entries = new Map();
  const localOffsets = new Set();
  let advertisedTotal = 0;
  let cursor = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > endOffset || bytes.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error('ZIP central entry is invalid.');
    }
    const flags = bytes.readUInt16LE(cursor + 8);
    const compression = bytes.readUInt16LE(cursor + 10);
    const crc32 = bytes.readUInt32LE(cursor + 16);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const uncompressedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const diskStart = bytes.readUInt16LE(cursor + 34);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const nextCursor = cursor + 46 + nameLength + extraLength + commentLength;
    if (nextCursor > endOffset || diskStart !== 0 || compressedSize === 0xffffffff
      || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new Error('ZIP central entry bounds are invalid.');
    }
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = Buffer.from(nameBytes).toString('utf8');
    if (name.includes('\ufffd') || unsafeKmzEntryName(name) || entries.has(name) || localOffsets.has(localOffset)
      || (flags & 0x2061) !== 0 || ![0, 8].includes(compression)) {
      throw apiError(400, 'VALIDATION_ERROR', 'KMZ contains unsafe or unsupported entries.');
    }
    advertisedTotal += uncompressedSize;
    if (uncompressedSize > MAX_IMPORT_SOURCE_BYTES || advertisedTotal > MAX_KMZ_EXPANDED_BYTES) {
      throw apiError(400, 'VALIDATION_ERROR', 'KMZ expanded content is too large.');
    }
    if (localOffset + 30 > centralOffset || bytes.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error('ZIP local entry is invalid.');
    }
    const localFlags = bytes.readUInt16LE(localOffset + 6);
    const localCompression = bytes.readUInt16LE(localOffset + 8);
    const localCrc32 = bytes.readUInt32LE(localOffset + 14);
    const localCompressedSize = bytes.readUInt32LE(localOffset + 18);
    const localUncompressedSize = bytes.readUInt32LE(localOffset + 22);
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    if (dataOffset + compressedSize > centralOffset
      || !Buffer.from(bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength)).equals(Buffer.from(nameBytes))
      || localFlags !== flags || localCompression !== compression
      || ((flags & 8) === 0 && (localCrc32 !== crc32 || localCompressedSize !== compressedSize
        || localUncompressedSize !== uncompressedSize))) {
      throw new Error('ZIP local and central entries do not agree.');
    }
    entries.set(name, { name, flags, compression, crc32, compressedSize, uncompressedSize, completed: false });
    localOffsets.add(localOffset);
    cursor = nextCursor;
  }
  if (cursor !== endOffset) throw new Error('ZIP central directory length is invalid.');
  return entries;
}

function extractBoundedKmzKml(bytes) {
  const centralEntries = readKmzCentralDirectory(bytes);
  const seenEntries = new Set();
  const kmlEntries = [];
  let expandedTotal = 0;
  let completedCount = 0;
  const unzip = new Unzip((file) => {
    const metadata = centralEntries.get(file.name);
    if (!metadata || seenEntries.has(file.name) || metadata.compression !== file.compression) {
      throw apiError(400, 'VALIDATION_ERROR', 'KMZ contains unsafe or unsupported entries.');
    }
    seenEntries.add(file.name);
    let expandedEntryBytes = 0;
    let crc32 = 0xffffffff;
    const chunks = !file.name.endsWith('/') && /\.kml$/i.test(file.name) ? [] : null;
    file.ondata = (error, chunk, final) => {
      if (error) throw error;
      const expanded = chunk || new Uint8Array(0);
      expandedEntryBytes += expanded.length;
      expandedTotal += expanded.length;
      if (expandedEntryBytes > MAX_IMPORT_SOURCE_BYTES || expandedTotal > MAX_KMZ_EXPANDED_BYTES) {
        throw apiError(400, 'VALIDATION_ERROR', 'KMZ expanded content is too large.');
      }
      crc32 = updateKmzCrc32(crc32, expanded);
      if (chunks && expanded.length) chunks.push(Buffer.from(expanded));
      if (final) {
        const actualCrc32 = (crc32 ^ 0xffffffff) >>> 0;
        if (expandedEntryBytes !== metadata.uncompressedSize || actualCrc32 !== metadata.crc32) {
          throw apiError(400, 'VALIDATION_ERROR', 'KMZ archive integrity validation failed.');
        }
        metadata.completed = true;
        completedCount += 1;
        if (chunks) kmlEntries.push(Buffer.concat(chunks, expandedEntryBytes));
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  for (let offset = 0; offset < bytes.length; offset += KMZ_STREAM_CHUNK_BYTES) {
    const end = Math.min(offset + KMZ_STREAM_CHUNK_BYTES, bytes.length);
    unzip.push(bytes.subarray(offset, end), end === bytes.length);
  }
  if (seenEntries.size !== centralEntries.size || completedCount !== centralEntries.size
    || [...centralEntries.values()].some((entry) => !entry.completed)) {
    throw new Error('ZIP entries are incomplete.');
  }
  return kmlEntries;
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
  const permissionResource = resource === 'equipment-kits' ? 'equipment_kits' : resource === 'fleet-assets' ? 'fleet_assets' : resource;
  return permissions.has('*') || permissions.has(`${permissionResource}.*`) || permissions.has(`${permissionResource}.${action}`);
}

function assertPermission(context, resource, action) {
  if (!hasPermission(context, resource, action)) throw apiError(403, 'FORBIDDEN', 'You do not have permission for this operation.');
}

function isAcceptanceActor(context) {
  return Array.isArray(context.roles) && context.roles.includes('production_beta_acceptance');
}

function assertAcceptanceCreateScope(context, resource, input) {
  if (!isAcceptanceActor(context)) return;
  const label = resource === 'jobs' ? input.scope : resource === 'missions' ? input.title : input.name;
  if (typeof label !== 'string' || !label.startsWith(ACCEPTANCE_PREFIX)) {
    throw apiError(403, 'ACCEPTANCE_RECORD_SCOPE_REQUIRED', 'The acceptance role may create only controlled acceptance records.');
  }
}

function assertDelegatedSupportWrite(context) {
  if (context.actorType !== 'PLATFORM_SUPPORT') return;
  if (!context.supportSession?.id || !context.platformUser?.id) throw apiError(403,'SUPPORT_SESSION_NOT_FOUND','An active delegated Support Session is required.');
  if (context.supportSession.accessMode !== 'READ_WRITE') throw apiError(403,'SUPPORT_READ_ONLY','This Support Session is read only.');
  if (!['ORGANISATION','MODULE'].includes(context.supportSession.scopeType)) throw apiError(403,'SUPPORT_SCOPE_MISMATCH','This scoped Support Session does not authorise the requested resource command.');
}

function assertDelegatedSupportResource(context,resource,req) {
  if(context.actorType!=='PLATFORM_SUPPORT')return;
  const scope=context.supportSession?.scopeType;
  if(scope==='ORGANISATION')return;
  if(scope==='MODULE'&&context.supportSession.moduleCode===resource)return;
  if(scope==='MISSION'&&resource==='missions'&&req.query?.id===context.supportSession.missionId)return;
  if(scope==='JOB'&&resource==='jobs'&&req.query?.id===context.supportSession.jobId)return;
  throw apiError(403,'SUPPORT_SCOPE_MISMATCH','This Support Session does not authorise the requested resource.');
}

function mapDatabaseRecord(resource, record) {
  if (!record) return null;
  if (resource === 'aircraft') {
    return {
      id: record.id, operatingLocationId: record.operating_location_id, registration: record.registration,
      manufacturer: record.manufacturer, model: record.model, serialNumber: record.serial_number,
      activationDate: record.activation_date, status: record.status, serviceabilityState: record.serviceability_state,
      missionReady: record.mission_ready, mtow: Number(record.mtow), maxAltitude: Number(record.max_altitude), maxWindSpeed: Number(record.max_wind_speed),
      maintenanceDates: {
        lastInspection: record.last_inspection, nextInspectionDue: record.next_inspection_due,
        lastMajorService: record.last_major_service, nextMajorServiceDue: record.next_major_service_due,
        totalFlightHours: Number(record.total_flight_hours), hoursSinceLastService: Number(record.hours_since_last_service),
      },
      insurance: {
        policyNumber: record.insurance_policy_number, provider: record.insurance_provider,
        expiryDate: record.insurance_expiry_date, coverageAmount: Number(record.insurance_coverage_amount), hullValue: Number(record.hull_value),
      },
      operationalLimits: {
        minOperatingTemp: Number(record.min_operating_temp), maxOperatingTemp: Number(record.max_operating_temp),
        maxPayloadWeight: Number(record.max_payload_weight), batteryCycles: record.battery_cycles === null ? undefined : Number(record.battery_cycles),
        maxFlightTime: Number(record.max_flight_time), serviceRange: Number(record.service_range), minimumCrewSize: Number(record.minimum_crew_size),
      },
      documentation: record.documentation, notes: record.notes || '', rowVersion: record.row_version,
      createdAt: record.created_at, updatedAt: record.updated_at,
    };
  }
  if (resource === 'equipment-kits') {
    return {
      id: record.id, operatingLocationId: record.operating_location_id, name: record.name,
      type: record.kit_type, description: record.description || '', status: record.status,
      specifications: record.specifications || {}, components: record.components || [],
      operationalData: record.operational_data || {}, financialData: record.financial_data || {},
      compatibleAircraft: record.compatible_aircraft_ids || [], notes: record.notes || '',
      activeAssignment: record.active_assignment || null,
      rowVersion: record.row_version, createdAt: record.created_at, updatedAt: record.updated_at,
    };
  }
  if (resource === 'fleet-assets') {
    return {
      id: record.id, operatingLocationId: record.operating_location_id, assetType: record.asset_type,
      assetIdentifier: record.asset_identifier, registration: record.registration || undefined,
      vin: record.vin || undefined, serialNumber: record.serial_number || undefined,
      manufacturer: record.manufacturer || undefined, model: record.model || undefined,
      manufactureYear: record.manufacture_year === null || record.manufacture_year === undefined ? undefined : Number(record.manufacture_year),
      status: record.status, notes: record.notes || '', rowVersion: record.row_version,
      createdAt: record.created_at, updatedAt: record.updated_at,
    };
  }
  const schema = SCHEMAS[resource];
  const result = { id: record.id };
  Object.entries(schema.fields).forEach(([apiField, databaseField]) => {
    if (record[databaseField] !== undefined) result[apiField] = record[databaseField];
  });
  if (resource === 'missions') {
    result.aircraftIds = Array.isArray(record.aircraft_ids) ? record.aircraft_ids : [];
    result.equipmentKitIds = Array.isArray(record.equipment_kit_ids) ? record.equipment_kit_ids : [];
  }
  if (resource === 'jobs') {
    result.propertyIds = Array.isArray(record.property_ids) && record.property_ids.length
      ? record.property_ids : (record.property_id ? [record.property_id] : []);
  }
  if (record.row_version !== undefined) result.rowVersion = record.row_version;
  if (record.created_at !== undefined) result.createdAt = record.created_at;
  if (record.updated_at !== undefined) result.updatedAt = record.updated_at;
  return result;
}

function mapInput(resource, body, existing) {
  if (resource === 'aircraft') return mapAircraftInput(body, existing);
  if (resource === 'equipment-kits') return mapEquipmentKitInput(body, existing);
  const schema = SCHEMAS[resource];
  const readOnly = new Set(schema.readOnly || []);
  const allowed = new Set([...Object.keys(schema.fields).filter((field) => !readOnly.has(field)), 'expectedVersion']);
  if (resource === 'operating_locations') allowed.add('locationConfirmed');
  if (!existing && ['jobs', 'missions'].includes(resource)) allowed.add('autoGenerateReference');
  Object.keys(body).forEach((key) => {
    if (allowed.has(key)) return;
    if (/financial|cost|margin|price|revenue|payload/i.test(key)) {
      throw apiError(403, 'FORBIDDEN_FIELD', 'Financial fields are not permitted by this endpoint.');
    }
    throw apiError(400, 'VALIDATION_ERROR', `Unexpected field: ${key}.`);
  });
  const baseline = existing ? mapDatabaseRecord(resource, existing) : {};
  const merged = { ...baseline, ...body };
  if (resource === 'fleet-assets') {
    const types = new Set(['truck', 'trailer', 'generator', 'crane', 'pump', 'compressor', 'other']);
    const statuses = new Set(['available', 'assigned', 'maintenance', 'retired']);
    if (!types.has(merged.assetType)) throw apiError(400, 'VALIDATION_ERROR', 'Select a valid Fleet asset type.');
    if (!statuses.has(merged.status)) throw apiError(400, 'VALIDATION_ERROR', 'Select a valid Fleet asset status.');
    if (!String(merged.assetIdentifier || '').trim()) throw apiError(400, 'VALIDATION_ERROR', 'Enter an asset identifier.');
    if (['truck', 'trailer'].includes(merged.assetType) && !String(merged.registration || '').trim()) {
      throw apiError(400, 'VALIDATION_ERROR', `Enter the ${merged.assetType} registration.`);
    }
    for (const field of ['assetIdentifier', 'registration', 'vin', 'serialNumber', 'manufacturer', 'model', 'notes']) {
      if (merged[field] !== undefined && merged[field] !== null && typeof merged[field] !== 'string') {
        throw apiError(400, 'VALIDATION_ERROR', `${field} must be text.`);
      }
    }
    if (merged.manufactureYear !== undefined && merged.manufactureYear !== null
      && (!Number.isInteger(Number(merged.manufactureYear)) || Number(merged.manufactureYear) < 1900 || Number(merged.manufactureYear) > 2200)) {
      throw apiError(400, 'VALIDATION_ERROR', 'manufactureYear is invalid.');
    }
  }
  const baseLocationFields = ['latitude', 'longitude', 'addressSource', 'locationConfirmedAt', 'locationConfirmed'];
  const hasNewBaseLocationEvidence = resource === 'operating_locations'
    && baseLocationFields.some((field) => body[field] !== undefined);
  const baseAddressChanged = resource === 'operating_locations' && Boolean(existing) && body.address !== undefined
    && String(body.address).trim() !== String(baseline.address || '').trim();
  if (baseAddressChanged && !hasNewBaseLocationEvidence) {
    merged.latitude = null;
    merged.longitude = null;
    merged.addressSource = null;
    merged.locationConfirmedAt = null;
  }
  if (hasNewBaseLocationEvidence) {
    const latitude = Number(merged.latitude);
    const longitude = Number(merged.longitude);
    if (!String(merged.address || '').trim()) throw apiError(400, 'BASE_ADDRESS_REQUIRED', 'Confirm a Base address before saving.');
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw apiError(400, 'BASE_LOCATION_REQUIRED', 'Confirm valid Base coordinates before saving.');
    }
    if (!['ADDRESS_SEARCH', 'MANUALLY_ADJUSTED'].includes(merged.addressSource)) {
      throw apiError(400, 'BASE_LOCATION_SOURCE_REQUIRED', 'Base location provenance is required.');
    }
    if (body.locationConfirmed !== true || !merged.locationConfirmedAt || Number.isNaN(Date.parse(merged.locationConfirmedAt))) {
      throw apiError(400, 'BASE_LOCATION_CONFIRMATION_REQUIRED', 'Confirm the final Base map location before saving.');
    }
  }
  if (resource === 'clients' && body.addresses !== undefined) {
    if (!Array.isArray(merged.addresses) || merged.addresses.length < 1 || merged.addresses.length > 20) {
      throw apiError(400, 'VALIDATION_ERROR', 'addresses must contain between 1 and 20 confirmed locations.');
    }
    merged.addresses = merged.addresses.map((location) => {
      if (!location || typeof location !== 'object' || Array.isArray(location)) throw apiError(400, 'VALIDATION_ERROR', 'Each client location must be an object.');
      const allowedLocation = new Set(['label','address','locality','state','postcode','lat','lng','coordinateSource','locationConfirmedAt']);
      Object.keys(location).forEach((key) => { if (!allowedLocation.has(key)) throw apiError(400, 'VALIDATION_ERROR', `Unexpected client location field: ${key}.`); });
      const label = String(location.label || '').trim();
      if (label.length < 2 || label.length > 80 || /^(other|custom)$/i.test(label)) throw apiError(400, 'VALIDATION_ERROR', 'Each client location requires a meaningful label.');
      const lat = Number(location.lat); const lng = Number(location.lng);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) throw apiError(400, 'VALIDATION_ERROR', 'Each client location requires valid coordinates.');
      if (!['GEOCODED','MANUALLY_ADJUSTED'].includes(location.coordinateSource)) throw apiError(400, 'VALIDATION_ERROR', 'Each client location requires valid coordinate provenance.');
      if (!location.locationConfirmedAt || Number.isNaN(Date.parse(location.locationConfirmedAt))) throw apiError(400, 'VALIDATION_ERROR', 'Each client location must be explicitly confirmed.');
      if (location.state && !AUSTRALIAN_STATES.has(location.state)) throw apiError(400, 'VALIDATION_ERROR', 'Client location state must be an Australian state or territory code.');
      return { label, address: String(location.address || ''), locality: String(location.locality || ''), state: String(location.state || ''), postcode: String(location.postcode || ''), lat, lng, coordinateSource: location.coordinateSource, locationConfirmedAt: location.locationConfirmedAt };
    });
  }
  const automaticReference = !existing && body.autoGenerateReference === true;
  schema.required.forEach((field) => {
    if (automaticReference && ((resource === 'jobs' && field === 'reference') || (resource === 'missions' && field === 'missionNumber'))) return;
    if (typeof merged[field] !== 'string' || merged[field].trim() === '') {
      throw apiError(400, 'VALIDATION_ERROR', `${field} is required.`);
    }
  });
  if (resource === 'properties' && merged.addressSource !== undefined && !['GEOCODED', 'MANUAL'].includes(merged.addressSource)) {
    throw apiError(400, 'VALIDATION_ERROR', 'addressSource must be GEOCODED or MANUAL.');
  }
  if (resource === 'properties') {
    const latitude = Number(merged.latitude);
    const longitude = Number(merged.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw apiError(400, 'PROPERTY_LOCATION_REQUIRED', 'Confirm a valid Property location before saving.');
    }
    if (!merged.locationConfirmedAt || Number.isNaN(Date.parse(merged.locationConfirmedAt))) {
      throw apiError(400, 'PROPERTY_LOCATION_CONFIRMATION_REQUIRED', 'Confirm the final map location before saving.');
    }
    if (!['GEOCODED', 'MANUAL'].includes(merged.addressSource)) {
      throw apiError(400, 'PROPERTY_LOCATION_SOURCE_REQUIRED', 'Property location provenance is required.');
    }
  }
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
  if (resource === 'missions') {
    ['aircraftIds', 'equipmentKitIds'].forEach((field) => {
      const source = merged[field] === undefined ? [] : merged[field];
      if (!Array.isArray(source)) throw apiError(400, 'VALIDATION_ERROR', `${field} must be an array.`);
      const ids = source.map((id) => assertUuid(id, field));
      if (new Set(ids).size !== ids.length) throw apiError(400, 'VALIDATION_ERROR', `${field} must not contain duplicates.`);
      merged[field] = ids;
    });
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
  if (resource === 'fleet-assets') {
    data.asset_type = merged.assetType;
    data.asset_identifier = merged.assetIdentifier.trim();
    data.registration = String(merged.registration || '').trim().toUpperCase() || null;
    data.vin = String(merged.vin || '').trim().toUpperCase() || null;
    data.serial_number = String(merged.serialNumber || '').trim().toUpperCase() || null;
    data.manufacturer = String(merged.manufacturer || '').trim() || null;
    data.model = String(merged.model || '').trim() || null;
    data.manufacture_year = merged.manufactureYear === undefined || merged.manufactureYear === null || merged.manufactureYear === '' ? null : Number(merged.manufactureYear);
    data.notes = String(merged.notes || '').trim();
  }
  if (automaticReference) data.auto_generate_reference = true;
  if (resource === 'missions' && !data.status) data.status = 'planning';
  return { data, merged };
}

function mapEquipmentKitInput(body, existing) {
  const allowed = new Set(['operatingLocationId','name','type','description','status','specifications','components','operationalData','financialData','compatibleAircraft','notes','expectedVersion']);
  Object.keys(body).forEach((key) => { if (!allowed.has(key)) throw apiError(400,'VALIDATION_ERROR',`Unexpected field: ${key}.`); });
  const baseline = existing ? mapDatabaseRecord('equipment-kits', existing) : {};
  const merged = { ...baseline, ...body };
  ['operatingLocationId','name','type'].forEach((field) => {
    if (typeof merged[field] !== 'string' || !merged[field].trim()) throw apiError(400,'VALIDATION_ERROR',`${field} is required.`);
  });
  assertUuid(merged.operatingLocationId,'operatingLocationId');
  ['specifications','operationalData','financialData'].forEach((field) => {
    if (!merged[field] || typeof merged[field] !== 'object' || Array.isArray(merged[field])) throw apiError(400,'VALIDATION_ERROR',`${field} must be an object.`);
  });
  if (!Array.isArray(merged.components)) throw apiError(400,'VALIDATION_ERROR','components must be an array.');
  if (!Array.isArray(merged.compatibleAircraft)) throw apiError(400,'VALIDATION_ERROR','compatibleAircraft must be an array.');
  const compatibleAircraft = merged.compatibleAircraft.map((id) => assertUuid(id,'compatibleAircraft'));
  if (new Set(compatibleAircraft).size !== compatibleAircraft.length) throw apiError(400,'VALIDATION_ERROR','compatibleAircraft must not contain duplicates.');
  const status = merged.status || merged.operationalData.status;
  if (!['available','assigned','maintenance','calibration','unavailable'].includes(status)) throw apiError(400,'VALIDATION_ERROR','status is invalid.');
  return { merged: { ...merged, compatibleAircraft }, data: {
    operating_location_id: merged.operatingLocationId, name: merged.name.trim(), kit_type: merged.type.trim(),
    description: typeof merged.description === 'string' ? merged.description : '', status,
    specifications: merged.specifications, components: merged.components, operational_data: merged.operationalData,
    financial_data: merged.financialData, compatible_aircraft_ids: compatibleAircraft,
    notes: typeof merged.notes === 'string' ? merged.notes : '',
  } };
}

function assertAircraftNumber(value, field, { minimum = Number.NEGATIVE_INFINITY, integer = false } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || (integer && !Number.isInteger(number))) {
    throw apiError(400, 'VALIDATION_ERROR', `${field} must be a ${integer ? 'whole ' : ''}number of at least ${minimum}.`);
  }
  return number;
}

function assertAircraftDate(value, field, required = true) {
  if ((value === undefined || value === null || value === '') && !required) return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw apiError(400, 'VALIDATION_ERROR', `${field} must be a valid date.`);
  return value.slice(0, 10);
}

function mapAircraftInput(body, existing) {
  const allowed = new Set(['operatingLocationId', 'registration', 'manufacturer', 'model', 'serialNumber', 'activationDate', 'status', 'serviceabilityState', 'missionReady', 'mtow', 'maxAltitude', 'maxWindSpeed', 'maintenanceDates', 'insurance', 'operationalLimits', 'documentation', 'notes', 'expectedVersion']);
  Object.keys(body).forEach((key) => { if (!allowed.has(key)) throw apiError(400, 'VALIDATION_ERROR', `Unexpected field: ${key}.`); });
  const baseline = existing ? mapDatabaseRecord('aircraft', existing) : {};
  const merged = { ...baseline, ...body };
  ['operatingLocationId', 'registration', 'manufacturer', 'model', 'serialNumber'].forEach((field) => {
    if (typeof merged[field] !== 'string' || !merged[field].trim()) throw apiError(400, 'VALIDATION_ERROR', `${field} is required.`);
  });
  assertUuid(merged.operatingLocationId, 'operatingLocationId');
  merged.registration = merged.registration.trim().toUpperCase();
  if (!/^[A-Z0-9-]+$/.test(merged.registration)) throw apiError(400, 'VALIDATION_ERROR', 'registration may only contain uppercase letters, numbers, and hyphens.');
  if (!['operational', 'maintenance', 'retired', 'inspection'].includes(merged.status)) throw apiError(400, 'VALIDATION_ERROR', 'status is invalid.');
  if (!['serviceable', 'unserviceable', 'inspection_required', 'maintenance_required'].includes(merged.serviceabilityState)) throw apiError(400, 'VALIDATION_ERROR', 'serviceabilityState is invalid.');
  if (typeof merged.missionReady !== 'boolean') throw apiError(400, 'VALIDATION_ERROR', 'missionReady must be a boolean.');
  if (merged.missionReady && (merged.status !== 'operational' || merged.serviceabilityState !== 'serviceable')) throw apiError(400, 'VALIDATION_ERROR', 'A mission-ready aircraft must be operational and serviceable.');
  const maintenance = merged.maintenanceDates;
  const insurance = merged.insurance;
  const limits = merged.operationalLimits;
  const documentation = merged.documentation;
  if (!maintenance || typeof maintenance !== 'object' || Array.isArray(maintenance)) throw apiError(400, 'VALIDATION_ERROR', 'maintenanceDates is required.');
  if (!insurance || typeof insurance !== 'object' || Array.isArray(insurance)) throw apiError(400, 'VALIDATION_ERROR', 'insurance is required.');
  if (!limits || typeof limits !== 'object' || Array.isArray(limits)) throw apiError(400, 'VALIDATION_ERROR', 'operationalLimits is required.');
  if (!documentation || typeof documentation !== 'object' || Array.isArray(documentation)
    || !['manuals', 'certificates', 'logbooks'].every((key) => Array.isArray(documentation[key]) && documentation[key].every((entry) => typeof entry === 'string'))
    || !documentation.complianceChecks || typeof documentation.complianceChecks.casaCompliant !== 'boolean') {
    throw apiError(400, 'VALIDATION_ERROR', 'documentation must contain controlled file ID arrays and compliance checks.');
  }
  if (typeof insurance.policyNumber !== 'string' || !insurance.policyNumber.trim() || typeof insurance.provider !== 'string' || !insurance.provider.trim()) throw apiError(400, 'VALIDATION_ERROR', 'Insurance policy number and provider are required.');
  const mtow = assertAircraftNumber(merged.mtow, 'mtow', { minimum: 0.001 });
  const maxPayloadWeight = assertAircraftNumber(limits.maxPayloadWeight, 'maxPayloadWeight', { minimum: 0.001 });
  if (maxPayloadWeight > mtow) throw apiError(400, 'VALIDATION_ERROR', 'maxPayloadWeight cannot exceed mtow.');
  const minOperatingTemp = assertAircraftNumber(limits.minOperatingTemp, 'minOperatingTemp');
  const maxOperatingTemp = assertAircraftNumber(limits.maxOperatingTemp, 'maxOperatingTemp');
  if (minOperatingTemp >= maxOperatingTemp) throw apiError(400, 'VALIDATION_ERROR', 'maxOperatingTemp must exceed minOperatingTemp.');
  const data = {
    operating_location_id: merged.operatingLocationId, registration: merged.registration, manufacturer: merged.manufacturer.trim(), model: merged.model.trim(), serial_number: merged.serialNumber.trim(),
    activation_date: assertAircraftDate(merged.activationDate, 'activationDate', false), status: merged.status, serviceability_state: merged.serviceabilityState, mission_ready: merged.missionReady,
    mtow, max_altitude: assertAircraftNumber(merged.maxAltitude, 'maxAltitude', { minimum: 0.001 }), max_wind_speed: assertAircraftNumber(merged.maxWindSpeed, 'maxWindSpeed', { minimum: 0.001 }),
    last_inspection: assertAircraftDate(maintenance.lastInspection, 'lastInspection', false), next_inspection_due: assertAircraftDate(maintenance.nextInspectionDue, 'nextInspectionDue', false),
    last_major_service: assertAircraftDate(maintenance.lastMajorService, 'lastMajorService', false), next_major_service_due: assertAircraftDate(maintenance.nextMajorServiceDue, 'nextMajorServiceDue', false),
    total_flight_hours: assertAircraftNumber(maintenance.totalFlightHours, 'totalFlightHours'), hours_since_last_service: assertAircraftNumber(maintenance.hoursSinceLastService, 'hoursSinceLastService'),
    insurance_policy_number: insurance.policyNumber.trim(), insurance_provider: insurance.provider.trim(), insurance_expiry_date: assertAircraftDate(insurance.expiryDate, 'insuranceExpiryDate'),
    insurance_coverage_amount: assertAircraftNumber(insurance.coverageAmount, 'coverageAmount'), hull_value: assertAircraftNumber(insurance.hullValue, 'hullValue'),
    min_operating_temp: minOperatingTemp, max_operating_temp: maxOperatingTemp, max_payload_weight: maxPayloadWeight,
    battery_cycles: limits.batteryCycles === undefined || limits.batteryCycles === null ? null : assertAircraftNumber(limits.batteryCycles, 'batteryCycles', { integer: true }),
    max_flight_time: assertAircraftNumber(limits.maxFlightTime, 'maxFlightTime', { minimum: 0.001 }), service_range: assertAircraftNumber(limits.serviceRange, 'serviceRange', { minimum: 0.001 }),
    minimum_crew_size: assertAircraftNumber(limits.minimumCrewSize, 'minimumCrewSize', { minimum: 1, integer: true }), documentation, notes: typeof merged.notes === 'string' ? merged.notes : '',
  };
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

function assertLocationAccess(context, operatingLocationId, resource = 'record') {
  if ((context.operatingLocationIds || []).includes(operatingLocationId)) return;
  throw apiError(403, 'LOCATION_FORBIDDEN', `This ${resource} operating location is not assigned to your membership.`);
}

function hasAssignedLocationReadAccess(resource, context, record) {
  if (!['missions', 'aircraft', 'equipment-kits', 'fleet-assets', 'operating_locations'].includes(resource)) return true;
  const operatingLocationId = resource === 'operating_locations'
    ? record?.id : record?.operating_location_id ?? record?.operatingLocationId;
  return typeof operatingLocationId === 'string'
    && (context.operatingLocationIds || []).includes(operatingLocationId);
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
    (values.aircraftIds || []).forEach((aircraftId) => required.push(['aircraft', aircraftId, {
      operating_location_id: values.operatingLocationId, status: 'operational', mission_ready: true,
    }]));
    (values.equipmentKitIds || []).forEach((kitId) => required.push(['equipment-kits', kitId, {
      operating_location_id: values.operatingLocationId, status: 'available',
    }]));
  }
  if (resource === 'fleet-assets') required.push(['operating_locations', values.operatingLocationId]);
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

function mapMissionMapRecord(record) {
  if (!record) return null;
  return { id: record.id, missionId: record.mission_id, version: record.version_number, notes: record.notes || '',
    sourceFieldBoundaryVersionId: record.source_field_boundary_version_id || null, geometries: record.geometries || [],
    createdAt: record.created_at, createdBy: record.created_by_internal_user_id };
}

function mapMissionMapSourceFileRecord(record) {
  if (!record) return null;
  return {
    id: record.id, missionId: record.mission_id, originalFilename: record.original_filename,
    sourceFormat: record.source_format, fileSizeBytes: Number(record.file_size_bytes), checksum: record.sha256_checksum,
    originalCrs: record.original_crs || null, transformationMetadata: record.transformation_metadata || {},
    validationResult: record.validation_result || {}, importedAt: record.imported_at,
    importedBy: record.imported_by_internal_user_id,
  };
}

function parseMissionMapSourceFile(body) {
  const allowed = new Set(['fileName','fileType','sizeBytes','dataUrl','sourceCrs','transformationMetadata','validationResult','importedAt']);
  Object.keys(body).forEach((key) => { if (!allowed.has(key)) throw apiError(400,'VALIDATION_ERROR',`Unexpected source-file field: ${key}.`); });
  if (typeof body.fileName !== 'string' || !body.fileName.trim() || body.fileName.length > 255 || /[\\/\0]/.test(body.fileName)) throw apiError(400,'VALIDATION_ERROR','fileName is invalid.');
  if (!['kml','kmz','shp'].includes(body.fileType)) throw apiError(400,'VALIDATION_ERROR','fileType must be kml, kmz, or shp.');
  const sourceFormat = body.fileType === 'shp' ? 'shapefile' : body.fileType;
  const expectedExtension = body.fileType === 'shp' ? /\.(zip|shp)$/i : new RegExp(`\\.${body.fileType}$`,'i');
  if (!expectedExtension.test(body.fileName)) throw apiError(400,'VALIDATION_ERROR','fileName extension does not match fileType.');
  const match = typeof body.dataUrl === 'string' && body.dataUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw apiError(400,'VALIDATION_ERROR','dataUrl must contain a base64-encoded source file.');
  const bytes = Buffer.from(match[2],'base64');
  if (!bytes.length || bytes.length > MAX_IMPORT_SOURCE_BYTES || Number(body.sizeBytes) !== bytes.length) throw apiError(400,'VALIDATION_ERROR','Source-file size is invalid.');
  if (body.sourceCrs !== null && body.sourceCrs !== undefined && (typeof body.sourceCrs !== 'string' || body.sourceCrs.length > 4096)) throw apiError(400,'VALIDATION_ERROR','sourceCrs is invalid.');
  if (!body.transformationMetadata || typeof body.transformationMetadata !== 'object' || Array.isArray(body.transformationMetadata)) throw apiError(400,'VALIDATION_ERROR','transformationMetadata must be an object.');
  if (!body.validationResult || typeof body.validationResult !== 'object' || Array.isArray(body.validationResult) || !['valid','requires_review'].includes(body.validationResult.state)) throw apiError(400,'VALIDATION_ERROR','validationResult is invalid.');
  return { fileName: body.fileName, fileType: sourceFormat, contentType: match[1], bytes,
    checksum: crypto.createHash('sha256').update(bytes).digest('hex'), sourceCrs: body.sourceCrs || null,
    transformationMetadata: body.transformationMetadata, validationResult: body.validationResult };
}

function parseOperationalImport(body) {
  const allowed = new Set(['expectedVersion', 'fileName', 'fileType', 'evidenceType', 'sizeBytes', 'dataUrl', 'attributions']);
  Object.keys(body).forEach((key) => {
    if (!allowed.has(key)) throw apiError(400, 'VALIDATION_ERROR', `Unexpected import field: ${key}.`);
  });
  if (typeof body.fileName !== 'string' || !body.fileName.trim() || body.fileName.length > 255 || /[\\/\0]/.test(body.fileName)) {
    throw apiError(400, 'VALIDATION_ERROR', 'fileName is invalid.');
  }
  const fileName = body.fileName.trim();
  const fileType = String(body.fileType || '').toLowerCase();
  const mimeByType = {
    kml: 'application/vnd.google-earth.kml+xml',
    kmz: 'application/vnd.google-earth.kmz',
    csv: 'text/csv',
    txt: 'text/plain',
    log: 'text/plain',
    bin: 'application/octet-stream',
  };
  if (!Object.prototype.hasOwnProperty.call(mimeByType, fileType)) {
    throw apiError(400, 'VALIDATION_ERROR', 'Unsupported Operational Evidence file type.');
  }
  const extension = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase() : '';
  if (extension !== fileType) throw apiError(400, 'VALIDATION_ERROR', 'Operational file extension does not match fileType.');
  if (!['FINAL_KML', 'FLIGHT_LINES', 'TELEMETRY', 'FLIGHT_LOG'].includes(body.evidenceType)) {
    throw apiError(400, 'VALIDATION_ERROR', 'evidenceType is invalid.');
  }
  const rawAttributions = body.attributions === undefined ? [] : body.attributions;
  if (!Array.isArray(rawAttributions) || rawAttributions.length > 100) {
    throw apiError(400, 'VALIDATION_ERROR', 'Operational Evidence attributions are invalid.');
  }
  const attributions = rawAttributions.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).length !== 3
      || !Object.prototype.hasOwnProperty.call(item, 'operatingDayId')
      || !Object.prototype.hasOwnProperty.call(item, 'aircraftId')
      || !Object.prototype.hasOwnProperty.call(item, 'confidence')) {
      throw apiError(400, 'VALIDATION_ERROR', 'Operational Evidence attribution is invalid.');
    }
    const operatingDayId = item.operatingDayId === null ? null : assertUuid(item.operatingDayId, 'operatingDayId');
    const aircraftId = item.aircraftId === null ? null : assertUuid(item.aircraftId, 'aircraftId');
    if (operatingDayId === null && aircraftId === null) {
      throw apiError(400, 'VALIDATION_ERROR', 'Operational Evidence attribution must link a day or Aircraft.');
    }
    if (!['OPERATOR_CONFIRMED', 'SOURCE_METADATA'].includes(item.confidence)) {
      throw apiError(400, 'VALIDATION_ERROR', 'Operational Evidence attribution confidence is invalid.');
    }
    return { operatingDayId, aircraftId, confidence: item.confidence };
  });
  const attributionKeys = attributions.map((item) => `${item.operatingDayId || ''}:${item.aircraftId || ''}`);
  if (new Set(attributionKeys).size !== attributionKeys.length) {
    throw apiError(400, 'VALIDATION_ERROR', 'Operational Evidence attributions contain duplicates.');
  }
  const match = typeof body.dataUrl === 'string' && body.dataUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match || match[1].toLowerCase() !== mimeByType[fileType] || match[2].length % 4 !== 0) {
    throw apiError(400, 'VALIDATION_ERROR', 'Operational file MIME type does not match fileType.');
  }
  const bytes = Buffer.from(match[2], 'base64');
  const canonicalBase64 = match[2].replace(/=+$/, '');
  if (bytes.toString('base64').replace(/=+$/, '') !== canonicalBase64
    || !bytes.length || bytes.length > MAX_IMPORT_SOURCE_BYTES || Number(body.sizeBytes) !== bytes.length) {
    throw apiError(400, 'VALIDATION_ERROR', 'Operational file size or encoding is invalid.');
  }

  let operationalGeometry = null;
  let derivedStatistics = {};
  let parseStatus = 'RETAINED';
  let validationResult = { state: 'retained' };
  if (fileType === 'kmz') {
    let kmlEntries;
    try {
      kmlEntries = extractBoundedKmzKml(bytes);
    } catch (error) {
      if (error?.code === 'VALIDATION_ERROR') throw error;
      throw apiError(400, 'VALIDATION_ERROR', 'KMZ is not a valid bounded ZIP archive.');
    }
    if (!kmlEntries.length || !kmlEntries.some((entry) => {
      const text = Buffer.from(entry).toString('utf8');
      return /<kml(?:\s[^>]*)?>/i.test(text) && (/<\/kml\s*>/i.test(text) || /<kml(?:\s[^>]*)?\/>/i.test(text));
    })) {
      throw apiError(400, 'VALIDATION_ERROR', 'KMZ must contain a valid KML entry.');
    }
    validationResult = { state: 'retained', parserVersion: 'operational-kmz-envelope-v2' };
  }
  if (fileType === 'kml') {
    const text = bytes.toString('utf8');
    if (!/<kml(?:\s[^>]*)?>/i.test(text) || !/<\/kml\s*>/i.test(text)) {
      throw apiError(400, 'VALIDATION_ERROR', 'KML document structure is invalid.');
    }
    const lines = [...text.matchAll(/<LineString\b[^>]*>[\s\S]*?<coordinates\b[^>]*>([\s\S]*?)<\/coordinates>[\s\S]*?<\/LineString>/gi)]
      .map((candidate) => parseCoordinateSequence(candidate[1])).filter((coordinates) => coordinates.length >= 2);
    const polygons = [...text.matchAll(/<Polygon\b[^>]*>[\s\S]*?<coordinates\b[^>]*>([\s\S]*?)<\/coordinates>[\s\S]*?<\/Polygon>/gi)]
      .map((candidate) => parseCoordinateSequence(candidate[1])).filter((coordinates) => coordinates.length >= 4);
    if (!lines.length && !polygons.length) {
      throw apiError(400, 'UNSUPPORTED_GEOMETRY', 'KML contains no supported flight lines or polygon geometry.');
    }
    const distanceMetres = lines.reduce((sum, line) => sum + line.slice(1).reduce((lineSum, point, index) => lineSum + haversine(line[index], point), 0), 0);
    operationalGeometry = {
      type: 'GeometryCollection',
      geometries: [
        ...(lines.length ? [{ type: 'MultiLineString', coordinates: lines }] : []),
        ...polygons.map((ring) => ({ type: 'Polygon', coordinates: [ring] })),
      ],
    };
    derivedStatistics = {
      flightLineCount: lines.length,
      totalFlightDistanceMetres: Math.round(distanceMetres),
      areaTreatedHa: polygons.reduce((sum, ring) => sum + ringAreaHa(ring), 0),
    };
    parseStatus = 'PARSED';
    validationResult = { state: 'valid', parserVersion: 'operational-kml-v1' };
  }
  return {
    expectedVersion: Number(body.expectedVersion),
    fileName,
    fileType,
    evidenceType: body.evidenceType,
    contentType: match[1].toLowerCase(),
    bytes,
    checksum: crypto.createHash('sha256').update(bytes).digest('hex'),
    operationalGeometry,
    derivedStatistics,
    parseStatus,
    validationResult,
    attributions,
  };
}
function parseCoordinateSequence(raw){return raw.trim().split(/\s+/).map(v=>v.split(',').slice(0,2).map(Number)).filter(p=>p.length===2&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&p[0]>=-180&&p[0]<=180&&p[1]>=-90&&p[1]<=90);}
function haversine(a,b){const r=6371000,rad=Math.PI/180,dLat=(b[1]-a[1])*rad,dLon=(b[0]-a[0])*rad,x=Math.sin(dLat/2)**2+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin(dLon/2)**2;return 2*r*Math.asin(Math.sqrt(x));}
function ringAreaHa(ring){if(ring.length<4)return 0;const lat=ring.reduce((s,p)=>s+p[1],0)/ring.length*Math.PI/180,m=111320,scaleX=m*Math.cos(lat);let area=0;for(let i=0,j=ring.length-1;i<ring.length;j=i++)area+=(ring[j][0]*scaleX)*(ring[i][1]*m)-(ring[i][0]*scaleX)*(ring[j][1]*m);return Math.round(Math.abs(area)/2/10000*100)/100;}

const MISSION_GEOMETRY_ROLES = new Set(['operational_boundary','treatment_area','exclusion_zone','no_fly_zone','obstacle','corridor','access_point','access_route','staging_area','launch_point','landing_point','water_point','point_annotation','line_annotation','polygon_annotation','imported_source_geometry','regulatory_overlay','safety_overlay']);
function validateMissionGeometries(value) {
  if (!Array.isArray(value) || value.length > 500) throw apiError(400,'VALIDATION_ERROR','geometries must be an array of at most 500 records.');
  const ids = new Set();
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw apiError(400,'VALIDATION_ERROR','Each geometry must be an object.');
    const allowed = new Set(['id','role','geometryType','geometry','sourceCrs','canonicalCrs','provenance','validationState','areaHectares','lengthMetres','label','notes','sourceFileId']);
    Object.keys(item).forEach((key)=>{if(!allowed.has(key))throw apiError(400,'VALIDATION_ERROR',`Unexpected geometry field: ${key}.`);});
    assertUuid(item.id,'geometry.id'); if(ids.has(item.id))throw apiError(400,'VALIDATION_ERROR','Geometry IDs must be unique.'); ids.add(item.id);
    if(!MISSION_GEOMETRY_ROLES.has(item.role))throw apiError(400,'VALIDATION_ERROR','Geometry role is invalid.');
    if(!['Point','LineString','Polygon','MultiPolygon'].includes(item.geometryType)||item.geometry?.type!==item.geometryType||!Array.isArray(item.geometry?.coordinates))throw apiError(400,'VALIDATION_ERROR','Geometry type and canonical GeoJSON must agree.');
    if(item.sourceCrs!=='EPSG:4326'||item.canonicalCrs!=='EPSG:4326')throw apiError(400,'VALIDATION_ERROR','Production Beta canonical geometry must use EPSG:4326.');
    if(!['valid','requires_review','invalid'].includes(item.validationState))throw apiError(400,'VALIDATION_ERROR','Geometry validationState is invalid.');
    if(item.sourceFileId!==null&&item.sourceFileId!==undefined)assertUuid(item.sourceFileId,'geometry.sourceFileId');
    return item;
  });
}

function createMissionMapHandler(dependencies = {}) {
  const repository = dependencies.repository || new OperationalRepository(); const getContext = dependencies.resolveContext || resolveRequestContext;
  return async function handler(req,res){res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
    try { const context=await getContext(req,res); const missionId=assertUuid(req.query?.missionId,'missionId');
      const mission=await repository.get('missions',context,missionId);
      if(!mission||mission.archived_at||!hasAssignedLocationReadAccess('missions',context,mission))throw apiError(404,'NOT_FOUND','Mission map not found.');
      if(req.method==='GET'){assertPermission(context,'mission_maps','read');const history=req.query?.history==='true';const record=await repository.getMissionMap(context,missionId,history);return res.status(200).json({data:history?(record||[]).map(mapMissionMapRecord):mapMissionMapRecord(record)});}
      if(req.method!=='POST'){res.setHeader('Allow','GET,POST,OPTIONS');return res.status(405).json({error:{code:'METHOD_NOT_ALLOWED',message:'Method not allowed.'}});}
      assertSameOrigin(req);assertPermission(context,'mission_maps','update');assertLocationAccess(context,mission.operating_location_id,'mission map');
      if(req.query?.action==='source-file'){
        const source=parseMissionMapSourceFile(parseBody(req,MAX_IMPORT_BODY_BYTES));
        const record=await repository.createMissionMapSourceFile(context,missionId,source);
        if(record?.notFound||record?.relationshipConflict)throw apiError(409,'RELATIONSHIP_CONFLICT','The Mission cannot accept imported source files.');
        return res.status(201).json({data:mapMissionMapSourceFileRecord(record)});
      }
      const body=parseBody(req,MAX_BOUNDARY_BODY_BYTES);const allowed=new Set(['expectedVersion','notes','sourceFieldBoundaryVersionId','geometries']);Object.keys(body).forEach((k)=>{if(!allowed.has(k))throw apiError(400,'VALIDATION_ERROR',`Unexpected field: ${k}.`);});
      const expectedVersion=Number(body.expectedVersion);if(!Number.isInteger(expectedVersion)||expectedVersion<0)throw apiError(400,'VALIDATION_ERROR','expectedVersion must be a non-negative integer.');
      const geometries=validateMissionGeometries(body.geometries);if(!geometries.some((g)=>['operational_boundary','treatment_area'].includes(g.role)&&g.validationState==='valid'))throw apiError(400,'VALIDATION_ERROR','A valid operational boundary or treatment area is required.');
      const sourceFieldBoundaryVersionId=body.sourceFieldBoundaryVersionId?assertUuid(body.sourceFieldBoundaryVersionId,'sourceFieldBoundaryVersionId'):null;
      const result=await repository.saveMissionMap(context,missionId,{expectedVersion,notes:typeof body.notes==='string'?body.notes:'',sourceFieldBoundaryVersionId,geometries});
      if(result.conflict)throw apiError(409,'VERSION_CONFLICT','This Mission map changed before your update.',{currentVersion:result.currentVersion});
      if(result.notFound)throw apiError(404,'NOT_FOUND','Mission map not found.');if(result.locationForbidden)throw apiError(403,'LOCATION_FORBIDDEN','Mission location is not assigned.');if(result.relationshipConflict)throw apiError(409,'RELATIONSHIP_CONFLICT','Source Field boundary is invalid.');
      return res.status(201).json({data:mapMissionMapRecord(result.record)});
    } catch(error){const {status,response}=errorEnvelope(error);return res.status(status).json(response);}
  };
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
  const status = error.statusCode || error.status || 500;
  const code = error.code || (status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : 'INTERNAL_ERROR');
  const response = { error: { code, message: error.publicMessage || 'Operational API request failed.' } };
  if (error.meta) response.error.meta = error.meta;
  return { status, response };
}

function mapPersonnelRecord(record) {
  if (!record) return null;
  return { id:record.id,arn:record.arn,internalUserId:record.internal_user_id,membershipId:record.membership_id,fullName:record.full_name,preferredName:record.preferred_name,email:record.email,phone:record.phone,engagementStatus:record.engagement_status,isActive:record.is_active,emergencyContact:record.emergency_contact,privateNotes:record.private_notes,notes:record.notes,startDate:record.start_date,endDate:record.end_date,operatingLocationIds:record.operating_location_ids||[],operationalRoles:record.operational_roles||[],credentials:record.credentials||[],rowVersion:record.row_version,createdAt:record.created_at,updatedAt:record.updated_at };
}

function validatePersonnelPayload(body) {
  const allowed=new Set(['expectedVersion','fullName','preferredName','email','phone','engagementStatus','isActive','emergencyContact','privateNotes','notes','startDate','endDate','operatingLocationIds','operationalRoles']);Object.keys(body).forEach(k=>{if(!allowed.has(k))throw apiError(400,'VALIDATION_ERROR',`Unexpected field: ${k}.`);});
  if(typeof body.fullName!=='string'||!body.fullName.trim())throw apiError(400,'VALIDATION_ERROR','fullName is required.');
  if(!Array.isArray(body.operatingLocationIds)||!body.operatingLocationIds.length)throw apiError(400,'VALIDATION_ERROR','At least one operating location is required.');body.operatingLocationIds.forEach(id=>assertUuid(id,'operatingLocationId'));
  if(!Array.isArray(body.operationalRoles))throw apiError(400,'VALIDATION_ERROR','operationalRoles must be an array.');return body;
}

function createPersonnelHandler(dependencies={}) { const repository=dependencies.repository||new OperationalRepository();const getContext=dependencies.resolveContext||resolveRequestContext;
 return async function(req,res){res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');try{const context=await getContext(req,res);
  if(req.method==='GET'){assertPermission(context,'personnel','read');const location=req.query?.operatingLocationId?assertUuid(req.query.operatingLocationId,'operatingLocationId'):null;if(location)assertLocationAccess(context,location,'Personnel');const includePrivate=hasPermission(context,'personnel','private.read');const records=await repository.listPersonnel(context,{operatingLocationId:location,includePrivate});const id=req.query?.id?assertUuid(req.query.id,'id'):null;const mapped=(records||[]).filter(r=>!id||r.id===id).map(mapPersonnelRecord);if(id&&!mapped.length)throw apiError(404,'NOT_FOUND','Personnel not found.');return res.status(200).json({data:id?mapped[0]:mapped});}
  if(!['POST','PATCH','DELETE'].includes(req.method))throw apiError(405,'METHOD_NOT_ALLOWED','Method not allowed.');assertSameOrigin(req);const body=parseBody(req);const action=req.query?.action;
  if(action){if(req.method!=='POST'||!['link','credential','evidence'].includes(action))throw apiError(400,'UNSUPPORTED_ACTION','Unsupported Personnel action.');const id=assertUuid(req.query?.id,'id');assertPermission(context,'personnel','update');let result;if(action==='link'){result=await repository.linkPersonnelMember(context,id,Number(body.expectedVersion),assertUuid(body.internalUserId,'internalUserId'),assertUuid(body.membershipId,'membershipId'));}else if(action==='credential'){result=await repository.addPersonnelCredential(context,id,body);}else result=await repository.addPersonnelEvidence(context,id,body);if(result.notFound)throw apiError(404,'NOT_FOUND','Personnel not found.');if(result.relationshipConflict)throw apiError(409,'RELATIONSHIP_CONFLICT','The requested member link is not available.');if(result.conflict)throw apiError(409,'VERSION_CONFLICT','This Personnel record changed before your update.',{currentVersion:result.currentVersion});return res.status(201).json({data:result.record});}
  if(req.method==='POST'){assertPermission(context,'personnel','create');const payload=validatePersonnelPayload(body);payload.operatingLocationIds.forEach(id=>assertLocationAccess(context,id,'Personnel'));const result=await repository.writePersonnel(context,'create',null,null,payload);return res.status(201).json({data:mapPersonnelRecord(result.record)});}
  const id=assertUuid(req.query?.id,'id'),expectedVersion=Number(body.expectedVersion);if(!Number.isInteger(expectedVersion)||expectedVersion<1)throw apiError(400,'VALIDATION_ERROR','expectedVersion must be a positive integer.');
  if(req.method==='PATCH'){assertPermission(context,'personnel','update');const payload=validatePersonnelPayload(body);payload.operatingLocationIds.forEach(loc=>assertLocationAccess(context,loc,'Personnel'));const result=await repository.writePersonnel(context,'update',id,expectedVersion,payload);if(result.notFound)throw apiError(404,'NOT_FOUND','Personnel not found.');if(result.conflict)throw apiError(409,'VERSION_CONFLICT','This Personnel record changed before your update.',{currentVersion:result.currentVersion});return res.status(200).json({data:mapPersonnelRecord(result.record)});}
  assertPermission(context,'personnel','archive');const result=await repository.writePersonnel(context,'archive',id,expectedVersion,{});if(result.notFound)throw apiError(404,'NOT_FOUND','Personnel not found.');if(result.conflict)throw apiError(409,'VERSION_CONFLICT','This Personnel record changed before your update.',{currentVersion:result.currentVersion});return res.status(200).json({data:mapPersonnelRecord(result.record)});
 }catch(error){const {status,response}=errorEnvelope(error);return res.status(status).json(response);}};
}

function createPersonnelIdentityHandler(dependencies={}){const repository=dependencies.repository||new OperationalRepository(),getContext=dependencies.resolveContext||resolveRequestContext;return async function(req,res){res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');try{const context=await getContext(req,res);assertPermission(context,'personnel.identity','manage');const personnelId=assertUuid(req.query?.personnelId,'personnelId');if(req.method==='GET'){const result=await repository.listPersonnelIdentityCandidates(context,personnelId);if(result?.not_found)throw apiError(404,'NOT_FOUND','Personnel not found.');return res.status(200).json({data:result});}if(req.method!=='POST')throw apiError(405,'METHOD_NOT_ALLOWED','Method not allowed.');assertSameOrigin(req);const body=parseBody(req),action=String(body.action||'').toUpperCase();if(!['LINK','UNLINK'].includes(action))throw apiError(400,'UNSUPPORTED_ACTION','Unsupported Personnel identity action.');const expectedVersion=Number(body.expectedVersion);if(!Number.isInteger(expectedVersion)||expectedVersion<1)throw apiError(400,'VALIDATION_ERROR','expectedVersion must be a positive integer.');if(typeof body.reason!=='string'||!body.reason.trim())throw apiError(400,'VALIDATION_ERROR','A reason is required.');const result=action==='LINK'?await repository.linkPersonnelIdentity(context,personnelId,expectedVersion,assertUuid(body.internalUserId,'internalUserId'),assertUuid(body.membershipId,'membershipId'),body.reason.trim()):await repository.unlinkPersonnelIdentity(context,personnelId,expectedVersion,body.reason.trim());if(result.notFound)throw apiError(404,'NOT_FOUND','Personnel not found.');if(result.relationshipConflict)throw apiError(409,'RELATIONSHIP_CONFLICT','The selected login identity is unavailable or already linked to another Personnel record.');if(result.conflict)throw apiError(409,'VERSION_CONFLICT','This Personnel record changed before identity resolution.',{currentVersion:result.currentVersion});return res.status(201).json({data:mapPersonnelRecord(result.record)});}catch(error){const{status,response}=errorEnvelope(error);return res.status(status).json(response);}};}

function createMissionPersonnelHandler(dependencies={}) {const repository=dependencies.repository||new OperationalRepository();const getContext=dependencies.resolveContext||resolveRequestContext;return async function(req,res){res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');try{const context=await getContext(req,res),missionId=assertUuid(req.query?.missionId,'missionId');const mission=await repository.get('missions',context,missionId);if(!mission||!hasAssignedLocationReadAccess('missions',context,mission))throw apiError(404,'NOT_FOUND','Mission not found.');
 if(req.method==='GET'){assertPermission(context,'personnel','read');const records=await repository.readMissionPersonnel(context,missionId,req.query?.history==='true');return res.status(200).json({data:req.query?.history==='true'?(records||[]):records?.[0]||null});}
 if(req.method!=='POST')throw apiError(405,'METHOD_NOT_ALLOWED','Method not allowed.');assertSameOrigin(req);assertPermission(context,'personnel','assign');assertLocationAccess(context,mission.operating_location_id,'Mission');const body=parseBody(req),expectedVersion=Number(body.expectedVersion);if(!Number.isInteger(expectedVersion)||expectedVersion<0||!Array.isArray(body.assignments))throw apiError(400,'VALIDATION_ERROR','expectedVersion and assignments are required.');const allowedRoles=new Set(['pilot_in_command','additional_pilot','observer','ground_crew','chemical_operator','loader','supervisor','maintenance_support','other']);body.assignments.forEach(a=>{assertUuid(a.personnelId,'personnelId');if(!allowedRoles.has(a.assignmentRole))throw apiError(400,'VALIDATION_ERROR','assignmentRole is invalid.');});const result=await repository.saveMissionPersonnel(context,missionId,expectedVersion,body.assignments);if(result.notFound)throw apiError(404,'NOT_FOUND','Mission not found.');if(result.conflict)throw apiError(409,'VERSION_CONFLICT','Mission Personnel changed before your update.',{currentVersion:result.currentVersion});if(result.qualificationBlockers)throw apiError(409,'QUALIFICATION_BLOCKED','Mission Personnel qualifications are not satisfied.',{blockers:result.qualificationBlockers});return res.status(201).json({data:result.record});
 }catch(error){const {status,response}=errorEnvelope(error);return res.status(status).json(response);}};}

function createMissionWeatherHandler(dependencies={}){const repository=dependencies.repository||new OperationalRepository(),getContext=dependencies.resolveContext||resolveRequestContext,fetchPlanningForecast=dependencies.fetchPlanningForecast||fetchOpenMeteoPlanningForecast;return async function(req,res){res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');try{const context=await getContext(req,res),missionId=assertUuid(req.query?.missionId,'missionId'),mission=await repository.get('missions',context,missionId);if(!mission||!hasAssignedLocationReadAccess('missions',context,mission))throw apiError(404,'NOT_FOUND','Mission not found.');
 if(req.method==='GET'){assertPermission(context,'weather','read');if(req.query?.action==='forecast')return res.status(200).json({data:await repository.readMissionWeatherForecasts(context,missionId)});if(req.query?.action&&req.query.action!=='readiness')throw apiError(400,'UNSUPPORTED_ACTION','Unsupported Mission Weather action.');return res.status(200).json({data:req.query?.action==='readiness'?await repository.evaluateMissionWeather(context,missionId):await repository.readMissionWeather(context,missionId)});}
 if(req.method!=='POST')throw apiError(405,'METHOD_NOT_ALLOWED','Method not allowed.');assertSameOrigin(req);assertLocationAccess(context,mission.operating_location_id,'Mission');const body=parseBody(req),action=req.query?.action;
 if(action==='select'){assertPermission(context,'weather','select');const expectedVersion=Number(body.expectedVersion);if(!Number.isInteger(expectedVersion)||expectedVersion<0)throw apiError(400,'VALIDATION_ERROR','expectedVersion is required.');const result=await repository.selectMissionWeather(context,missionId,assertUuid(body.observationId,'observationId'),expectedVersion);if(result.conflict)throw apiError(409,'VERSION_CONFLICT','Mission Weather selection changed.',{currentVersion:result.currentVersion});if(result.notFound)throw apiError(404,'NOT_FOUND','Weather observation not found.');if(result.locationForbidden)throw apiError(403,'LOCATION_FORBIDDEN','Mission location is not assigned.');return res.status(201).json({data:result.record});}
 if(action==='forecast'){assertPermission(context,'weather.forecast','create');const expectedVersion=Number(body.expectedVersion);if(!Number.isInteger(expectedVersion)||expectedVersion<0)throw apiError(400,'VALIDATION_ERROR','expectedVersion is required.');if(body.provider!=='OPEN_METEO')throw apiError(400,'VALIDATION_ERROR','provider is invalid.');for(const key of ['validFrom','validTo'])if(typeof body[key]!=='string'||Number.isNaN(Date.parse(body[key])))throw apiError(400,'VALIDATION_ERROR',`${key} must be a valid date and time.`);for(const[key,minimum,maximum]of [['latitude',-90,90],['longitude',-180,180]]){const numeric=Number(body[key]);if(!Number.isFinite(numeric)||numeric<minimum||numeric>maximum)throw apiError(400,'VALIDATION_ERROR',`${key} is outside the accepted range.`);}if(new Date(body.validTo)<=new Date(body.validFrom))throw apiError(400,'VALIDATION_ERROR','validTo must be after validFrom.');const providerEvidence=await fetchPlanningForecast({latitude:Number(body.latitude),longitude:Number(body.longitude),validFrom:body.validFrom,validTo:body.validTo});const result=await repository.createMissionWeatherForecast(context,missionId,expectedVersion,providerEvidence);if(result.conflict)throw apiError(409,'VERSION_CONFLICT','Mission forecast Weather changed.',{currentVersion:result.currentVersion});if(result.notFound)throw apiError(404,'NOT_FOUND','Mission not found.');if(result.locationForbidden)throw apiError(403,'LOCATION_FORBIDDEN','Mission location is not assigned.');return res.status(201).json({data:result.record});}
 if(action==='select-forecast'){assertPermission(context,'weather.forecast','select');const expectedVersion=Number(body.expectedVersion);if(!Number.isInteger(expectedVersion)||expectedVersion<0)throw apiError(400,'VALIDATION_ERROR','expectedVersion is required.');const forecastRevisionId=assertUuid(body.forecastRevisionId,'forecastRevisionId');const result=await repository.selectMissionWeatherForecast(context,missionId,forecastRevisionId,expectedVersion);if(result.conflict)throw apiError(409,'VERSION_CONFLICT','Mission forecast selection changed.',{currentVersion:result.currentVersion});if(result.notFound)throw apiError(404,'NOT_FOUND','Mission forecast revision not found.');if(result.locationForbidden)throw apiError(403,'LOCATION_FORBIDDEN','Mission location is not assigned.');return res.status(201).json({data:result.record});}
 if(action)throw apiError(400,'UNSUPPORTED_ACTION','Unsupported Mission Weather action.');if(body.source!=='MANUAL')throw apiError(400,'VALIDATION_ERROR','Only MANUAL weather is accepted by this endpoint.');assertPermission(context,'weather','observe.manual');const expectedVersion=Number(body.expectedVersion);if(!Number.isInteger(expectedVersion)||expectedVersion<0)throw apiError(400,'VALIDATION_ERROR','expectedVersion is required.');['observerPersonnelId'].forEach(k=>assertUuid(body[k],k));['observationLocation','observedAt','manualReason','inversionAssessment','locationCapturedAt'].forEach(k=>{if(typeof body[k]!=='string'||!body[k].trim())throw apiError(400,'VALIDATION_ERROR',`${k} is required.`);});if(Number.isNaN(Date.parse(body.observedAt))||Number.isNaN(Date.parse(body.locationCapturedAt)))throw apiError(400,'VALIDATION_ERROR','Weather timestamps must be valid dates and times.');if(!new Set(['DEVICE_GPS','MISSION_BOUNDARY']).has(body.locationSource))throw apiError(400,'VALIDATION_ERROR','locationSource is invalid.');if(body.locationSource==='DEVICE_GPS'&&body.locationAccuracyM!==undefined&&body.locationAccuracyM!==null&&(!Number.isFinite(Number(body.locationAccuracyM))||Number(body.locationAccuracyM)<0))throw apiError(400,'VALIDATION_ERROR','locationAccuracyM is invalid.');if(body.locationSource==='MISSION_BOUNDARY'){assertUuid(body.missionMapRevisionId,'missionMapRevisionId');assertUuid(body.missionBoundaryGeometryId,'missionBoundaryGeometryId');if(body.centroidCalculationVersion!=='POLYGON_CENTROID_V1')throw apiError(400,'VALIDATION_ERROR','centroidCalculationVersion is invalid.');}const measurements={latitude:[-90,90],longitude:[-180,180],temperatureC:[-60,70],relativeHumidity:[0,100],windSpeedKmh:[0,500],windDirectionDegrees:[0,359.999],precipitationMm:[0,10000]};for(const[key,[minimum,maximum]]of Object.entries(measurements)){if(key==='precipitationMm'&&(body[key]===undefined||body[key]===null))continue;const numeric=Number(body[key]);if(!Number.isFinite(numeric)||numeric<minimum||numeric>maximum)throw apiError(400,'VALIDATION_ERROR',`${key} is outside the accepted range.`);}if(!new Set(['NOT_ASSESSED','UNLIKELY','POSSIBLE','LIKELY','CONFIRMED','UNABLE_TO_DETERMINE']).has(body.inversionAssessment))throw apiError(400,'VALIDATION_ERROR','inversionAssessment is invalid.');if(!new Set(['CALCULATED','KESTREL_MEASURED']).has(body.deltaTMode))throw apiError(400,'VALIDATION_ERROR','deltaTMode is invalid.');if(body.deltaTMode==='KESTREL_MEASURED'){const deltaT=Number(body.deltaTC);if(!Number.isFinite(deltaT)||deltaT< -20||deltaT>40)throw apiError(400,'VALIDATION_ERROR','deltaTC is outside the accepted range.');}const result=await repository.createMissionWeather(context,missionId,expectedVersion,body);if(result.conflict)throw apiError(409,'VERSION_CONFLICT','Mission Weather changed.',{currentVersion:result.currentVersion});if(result.notFound)throw apiError(404,'NOT_FOUND','Mission not found.');if(result.locationForbidden)throw apiError(403,'LOCATION_FORBIDDEN','Mission location is not assigned.');if(result.boundaryInvalid)throw apiError(409,'MISSION_BOUNDARY_INVALID','The referenced authoritative Mission boundary is unavailable or invalid.');if(result.locationMismatch)throw apiError(409,'LOCATION_MISMATCH','The submitted Mission-boundary location does not match the authoritative centroid.');if(result.observerInvalid)throw apiError(409,'OBSERVER_INVALID','The Weather observer is not active at this location.');if(result.observerUnassigned)throw apiError(409,'OBSERVER_UNASSIGNED','The Weather observer must be assigned to this Mission.');return res.status(201).json({data:result.record});
 }catch(error){const{status,response}=errorEnvelope(error);return res.status(status).json(response);}};}

function createMissionChemicalsHandler(dependencies={}){const repository=dependencies.repository||new OperationalRepository(),getContext=dependencies.resolveContext||resolveRequestContext;return async function(req,res){res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');try{const context=await getContext(req,res);
  if(req.method==='GET'&&req.query?.action==='search'){assertPermission(context,'chemical.register','read');const query=typeof req.query?.q==='string'?req.query.q.trim():'';if(query.length<2)throw apiError(400,'VALIDATION_ERROR','Search requires at least two characters.');return res.status(200).json({data:await repository.searchChemicalIntelligence(context,query)});}
  const missionId=assertUuid(req.query?.missionId,'missionId'),mission=await repository.get('missions',context,missionId);if(!mission||!hasAssignedLocationReadAccess('missions',context,mission))throw apiError(404,'NOT_FOUND','Mission not found.');
  if(req.method==='GET'){assertPermission(context,'mission.chemicals','read');return res.status(200).json({data:await repository.readMissionChemicalPlan(context,missionId,req.query?.history==='true')});}
  if(req.method!=='POST')throw apiError(405,'METHOD_NOT_ALLOWED','Method not allowed.');assertSameOrigin(req);assertPermission(context,'mission.chemicals','plan');const body=parseBody(req),expectedVersion=Number(body.expectedVersion);if(!Number.isInteger(expectedVersion)||expectedVersion<0)throw apiError(400,'VALIDATION_ERROR','expectedVersion must be a non-negative integer.');for(const key of ['treatmentAreaHa','applicationVolumeLHa','tankCapacityL'])if(!Number.isFinite(Number(body[key]))||Number(body[key])<=0)throw apiError(400,'VALIDATION_ERROR',`${key} must be a positive number.`);if(!Array.isArray(body.lines)||body.lines.length<1||body.lines.length>20)throw apiError(400,'VALIDATION_ERROR','At least one and at most 20 chemical lines are required.');for(const line of body.lines){if(!line||typeof line.productName!=='string'||!line.productName.trim()||!Number.isFinite(Number(line.rate))||Number(line.rate)<=0||!['L_HA','ML_HA','KG_HA','G_HA'].includes(line.rateUnit)||!['VERIFIED','UNMATCHED'].includes(line.matchState))throw apiError(400,'VALIDATION_ERROR','Each chemical line requires a product, positive rate, supported unit and match state.');}
  const result=await repository.saveMissionChemicalPlan(context,missionId,expectedVersion,body);if(result.conflict)throw apiError(409,'VERSION_CONFLICT','Mission chemical plan changed.',{currentVersion:result.currentVersion});if(result.notFound)throw apiError(404,'NOT_FOUND','Mission not found.');if(result.locationForbidden)throw apiError(403,'LOCATION_FORBIDDEN','Mission location is not assigned.');return res.status(201).json({data:result.record,meta:{unmatchedReviewCreated:result.unmatchedReviewCreated}});
 }catch(error){const{status,response}=errorEnvelope(error);return res.status(status).json(response);}};}

function createMissionJsaHandler(dependencies={}){const repository=dependencies.repository||new OperationalRepository(),getContext=dependencies.resolveContext||resolveRequestContext;return async function(req,res){res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');try{const context=await getContext(req,res),missionId=assertUuid(req.query?.missionId,'missionId'),mission=await repository.get('missions',context,missionId);if(!mission||!hasAssignedLocationReadAccess('missions',context,mission))throw apiError(404,'NOT_FOUND','Mission not found.');const action=req.query?.action;
 if(req.method==='GET'){assertPermission(context,'mission.jsa','read');if(action&&action!=='readiness')throw apiError(400,'UNSUPPORTED_ACTION','Unsupported Mission JSA action.');const data=action==='readiness'?await repository.evaluateMissionJsa(context,missionId):await repository.readMissionJsa(context,missionId,req.query?.history==='true');return res.status(200).json({data});}
 if(req.method!=='POST')throw apiError(405,'METHOD_NOT_ALLOWED','Method not allowed.');assertSameOrigin(req);assertLocationAccess(context,mission.operating_location_id,'Mission');const body=parseBody(req),expectedVersion=Number(body.expectedVersion);if(!Number.isInteger(expectedVersion)||expectedVersion<0)throw apiError(400,'VALIDATION_ERROR','expectedVersion must be a non-negative integer.');
 if(action==='approve'){assertPermission(context,'mission.jsa','approve');const result=await repository.approveMissionJsa(context,missionId,assertUuid(body.revisionId,'revisionId'),expectedVersion);if(result.conflict)throw apiError(409,'VERSION_CONFLICT','Mission JSA changed.',{currentVersion:result.currentVersion});if(result.notFound)throw apiError(404,'NOT_FOUND','Mission JSA not found.');if(result.picRequired)throw apiError(409,'PIC_REQUIRED','Assign a Pilot in Command before JSA approval.');if(result.picForbidden)throw apiError(403,'PIC_FORBIDDEN','Only the assigned Pilot in Command may approve this JSA.');if(result.readinessBlocked)throw apiError(409,'READINESS_BLOCKED','Mission JSA requirements are incomplete.',{readiness:result.readiness});if(result.policyUnsatisfied)throw apiError(409,'APPROVAL_POLICY_UNSATISFIED','The organisation JSA approval policy is not satisfied.');return res.status(201).json({data:result.record,meta:{readiness:result.readiness}});}
 if(action)throw apiError(400,'UNSUPPORTED_ACTION','Unsupported Mission JSA action.');assertPermission(context,'mission.jsa','write');if(!Array.isArray(body.responses)||!Array.isArray(body.controls||[]))throw apiError(400,'VALIDATION_ERROR','responses and controls must be arrays.');for(const response of body.responses){if(!response||typeof response.questionId!=='string'||!response.questionId.trim()||!(response.answer===true||response.answer===false||response.answer===null))throw apiError(400,'VALIDATION_ERROR','Each response requires a questionId and boolean or null answer.');}const result=await repository.saveMissionJsa(context,missionId,expectedVersion,{responses:body.responses,controls:body.controls||[],attachments:body.attachments||[],generalComments:body.generalComments||'',missionFacts:body.missionFacts||{}});if(result.conflict)throw apiError(409,'VERSION_CONFLICT','Mission JSA changed.',{currentVersion:result.currentVersion});if(result.notFound)throw apiError(404,'NOT_FOUND','Mission not found.');if(result.locationForbidden)throw apiError(403,'LOCATION_FORBIDDEN','Mission location is not assigned.');if(result.lifecycleConflict)throw apiError(409,'LIFECYCLE_CONFLICT','Only a Planning Mission may receive a new JSA revision.');return res.status(201).json({data:result.record});
 }catch(error){const{status,response}=errorEnvelope(error);return res.status(status).json(response);}};}

function createChemicalReviewsHandler(dependencies={}){const repository=dependencies.repository||new OperationalRepository(),getContext=dependencies.resolveContext||resolveRequestContext;return async function(req,res){res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');try{const context=await getContext(req,res);if(req.method==='GET'){const queue=req.query?.queue==='approval'?'approval':'research';assertPermission(context,'chemical.review',queue==='approval'?'approve':'research');const statuses=queue==='approval'?['READY_FOR_APPROVAL']:['NEW','INVESTIGATING','RETURNED_FOR_RESEARCH'];const records=(await Promise.all(statuses.map(status=>repository.listChemicalReviews(context,status)))).flat();return res.status(200).json({data:records});}if(req.method!=='POST')throw apiError(405,'METHOD_NOT_ALLOWED','Method not allowed.');assertSameOrigin(req);const body=parseBody(req),reviewId=assertUuid(req.query?.id,'id'),action=String(body.action||'').toUpperCase(),expectedVersion=Number(body.expectedVersion);if(!Number.isInteger(expectedVersion)||expectedVersion<1)throw apiError(400,'VALIDATION_ERROR','expectedVersion must be a positive integer.');const approvalActions=new Set(['APPROVE','RETURN','DUPLICATE','REJECT']);assertPermission(context,'chemical.review',approvalActions.has(action)?'approve':'research');if(!new Set(['START_RESEARCH','READY_FOR_APPROVAL',...approvalActions]).has(action))throw apiError(400,'UNSUPPORTED_ACTION','Unsupported Chemical Intelligence review action.');const result=await repository.transitionChemicalReview(context,reviewId,expectedVersion,action,body);if(result.conflict)throw apiError(409,'VERSION_CONFLICT','Chemical Intelligence review changed.',{currentVersion:result.currentVersion});if(result.notFound)throw apiError(404,'NOT_FOUND','Chemical Intelligence review not found.');return res.status(200).json({data:result.record});}catch(error){const{status,response}=errorEnvelope(error);return res.status(status).json(response);}};}

function createOperationalHandler(resource, dependencies = {}) {
  const repository = dependencies.repository || new OperationalRepository();
  const getContext = dependencies.resolveContext || resolveOperationalActorContext;
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (req.method === 'OPTIONS') { res.setHeader('Allow', 'GET,POST,PATCH,DELETE,OPTIONS'); return res.status(204).end(); }
    try {
      const context = await getContext(req, res);
      assertDelegatedSupportResource(context,resource,req);
      if (req.method === 'GET') {
        assertPermission(context, resource, 'read');
        const id = req.query?.id;
        if (id) {
          assertUuid(id, 'id');
          const record = await repository.get(resource, context, id);
          if (!record || record.archived_at || !hasAssignedLocationReadAccess(resource, context, record)) {
            throw apiError(404, 'NOT_FOUND', 'Operational record not found.');
          }
          if(context.actorType==='PLATFORM_SUPPORT')await repository.recordDelegatedActivity(context,'READ',resource,id,'SUCCEEDED');
          return res.status(200).json({ data: mapDatabaseRecord(resource, record) });
        }
        const bounds = pagination(req.query);
        const records = await repository.list(resource, context, bounds);
        const scopedRecords = (records || []).filter((record) => hasAssignedLocationReadAccess(resource, context, record));
        if(context.actorType==='PLATFORM_SUPPORT')await repository.recordDelegatedActivity(context,'LIST',resource,null,'SUCCEEDED');
        return res.status(200).json({ data: scopedRecords.map((record) => mapDatabaseRecord(resource, record)), pagination: bounds });
      }
      if (!['POST', 'PATCH', 'DELETE'].includes(req.method)) {
        res.setHeader('Allow', 'GET,POST,PATCH,DELETE,OPTIONS');
        return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } });
      }
      assertSameOrigin(req);
      assertDelegatedSupportWrite(context);
      const body = parseBody(req);
      if (resource === 'equipment-kits' && req.query?.action === 'assign' && req.method === 'POST') {
        assertPermission(context, resource, 'assign');
        const kitId = assertUuid(req.query?.id, 'id');
        const aircraftId = assertUuid(body.aircraftId, 'aircraftId');
        const existing = await repository.get(resource, context, kitId);
        if (!existing || existing.archived_at || !hasAssignedLocationReadAccess(resource, context, existing)) throw apiError(404,'NOT_FOUND','Equipment Kit not found.');
        const result = await repository.assignEquipmentKit(context, kitId, aircraftId, body.configurationName, body.configurationData);
        if (result.incompatible) throw apiError(409,'INCOMPATIBLE','This Equipment Kit is not compatible with the selected aircraft.');
        if (result.unavailable) throw apiError(409,'UNAVAILABLE','This Equipment Kit is not available.');
        if (result.aircraftNotReady) throw apiError(409,'AIRCRAFT_NOT_READY','The selected aircraft is not mission ready.');
        if (result.relationshipConflict) throw apiError(409,'RELATIONSHIP_CONFLICT','The assignment relationship is invalid.');
        return res.status(201).json({ data: result.record });
      }
      if (resource === 'equipment-kits' && req.query?.action === 'unassign' && req.method === 'DELETE') {
        assertPermission(context, resource, 'assign');
        const assignmentId = assertUuid(req.query?.id, 'id');
        const expectedVersion = Number(body.expectedVersion);
        if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw apiError(400,'VALIDATION_ERROR','expectedVersion must be a positive integer.');
        const result = await repository.unassignEquipmentKit(context, assignmentId, expectedVersion);
        if (result.notFound) throw apiError(404,'NOT_FOUND','Equipment Kit assignment not found.');
        if (result.conflict) throw apiError(409,'VERSION_CONFLICT','This assignment changed before your update.',{currentVersion:result.currentVersion});
        return res.status(200).json({ data: result.record });
      }
      if (req.method === 'POST') {
        assertPermission(context, resource, 'create');
        const { data, merged } = mapInput(resource, body);
        assertAcceptanceCreateScope(context, resource, merged);
        if (['missions', 'aircraft', 'equipment-kits', 'fleet-assets'].includes(resource)) assertLocationAccess(context, merged.operatingLocationId, resource === 'missions' ? 'mission' : resource === 'aircraft' ? 'aircraft' : resource === 'fleet-assets' ? 'Fleet asset' : 'equipment kit');
        await assertRelationships(repository, resource, context, merged);
        const result = context.actorType === 'PLATFORM_SUPPORT' ? await repository.createDelegated(resource, context, data) : await repository.create(resource, context, data);
        if (result.relationshipConflict) throw apiError(409, 'RELATIONSHIP_CONFLICT', 'The related record is missing, archived, or belongs to another organisation.');
        if (result.identityConflict) throw apiError(409, 'IDENTITY_CONFLICT', 'A Fleet asset with this governed identity already exists.');
        if (result.locationForbidden) throw apiError(403, 'LOCATION_FORBIDDEN', 'This mission operating location is not assigned to your membership.');
        if (result.lifecycleConflict) throw apiError(409, 'LIFECYCLE_CONFLICT', 'Only Planning missions can be changed through this endpoint.');
        return res.status(201).json({ data: mapDatabaseRecord(resource, result.record) });
      }
      const id = assertUuid(req.query?.id, 'id');
      const expectedVersion = Number(body.expectedVersion);
      if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw apiError(400, 'VALIDATION_ERROR', 'expectedVersion must be a positive integer.');
      if (req.method === 'PATCH' && resource === 'jobs' && Object.prototype.hasOwnProperty.call(body, 'fieldIds')) {
        if (!hasPermission(context, 'jobs', 'write')) {
          throw apiError(403, 'FORBIDDEN', 'You do not have permission for this operation.');
        }
        const allowed = new Set(['expectedVersion', 'fieldIds']);
        Object.keys(body).forEach((key) => {
          if (!allowed.has(key)) throw apiError(400, 'VALIDATION_ERROR', `Unexpected field: ${key}.`);
        });
        if (!Array.isArray(body.fieldIds) || body.fieldIds.length < 1 || body.fieldIds.length > 100) {
          throw apiError(400, 'VALIDATION_ERROR', 'fieldIds must contain between 1 and 100 field IDs.');
        }
        const fieldIds = body.fieldIds.map((fieldId) => assertUuid(fieldId, 'fieldIds'));
        if (new Set(fieldIds).size !== fieldIds.length) {
          throw apiError(400, 'VALIDATION_ERROR', 'fieldIds must not contain duplicates.');
        }
        const result = await repository.writeJobScope(context, id, expectedVersion, fieldIds);
        if (result.forbidden) throw apiError(403, 'FORBIDDEN', 'You do not have permission for this operation.');
        if (result.notFound || result.error === 'JOB_SCOPE_NOT_FOUND') throw apiError(404, 'NOT_FOUND', 'Operational record not found.');
        if (result.error === 'JOB_SCOPE_VERSION_CONFLICT') {
          throw apiError(409, 'JOB_SCOPE_VERSION_CONFLICT', 'This Job scope changed before your update.', { currentVersion: result.currentVersion });
        }
        if (result.error) throw apiError(400, result.error, 'The requested Job scope is invalid.');
        return res.status(200).json({ data: mapDatabaseRecord('jobs', result.record) });
      }
      if (req.method === 'PATCH') {
        assertPermission(context, resource, 'update');
        const existing = await repository.get(resource, context, id);
        if (!existing || existing.archived_at || (resource === 'operating_locations' && !hasAssignedLocationReadAccess(resource, context, existing))) {
          throw apiError(404, 'NOT_FOUND', 'Operational record not found.');
        }
        const { data, merged } = mapInput(resource, body, existing);
        if (['missions', 'aircraft', 'equipment-kits', 'fleet-assets'].includes(resource)) assertLocationAccess(context, merged.operatingLocationId, resource === 'missions' ? 'mission' : resource === 'aircraft' ? 'aircraft' : resource === 'fleet-assets' ? 'Fleet asset' : 'equipment kit');
        if (resource === 'aircraft' && (merged.status !== existing.status || merged.serviceabilityState !== existing.serviceability_state || merged.missionReady !== existing.mission_ready)) {
          assertPermission(context, resource, 'serviceability');
        }
        await assertRelationships(repository, resource, context, merged);
        const result = context.actorType === 'PLATFORM_SUPPORT' ? await repository.updateDelegated(resource, context, id, expectedVersion, data) : await repository.update(resource, context, id, expectedVersion, data);
        if (result.notFound) throw apiError(404, 'NOT_FOUND', 'Operational record not found.');
        if (result.relationshipConflict) throw apiError(409, 'RELATIONSHIP_CONFLICT', 'The related record is missing, archived, or belongs to another organisation.');
        if (result.identityConflict) throw apiError(409, 'IDENTITY_CONFLICT', 'A Fleet asset with this governed identity already exists.');
        if (result.locationForbidden) throw apiError(403, 'LOCATION_FORBIDDEN', 'This mission operating location is not assigned to your membership.');
        if (result.lifecycleConflict) throw apiError(409, 'LIFECYCLE_CONFLICT', 'Only Planning missions can be changed through this endpoint.');
        if (result.conflict) throw apiError(409, 'VERSION_CONFLICT', 'This record changed before your update.', { currentVersion: result.currentVersion });
        return res.status(200).json({ data: mapDatabaseRecord(resource, result.record) });
      }
      assertPermission(context, resource, 'archive');
      if (isAcceptanceActor(context) && !await repository.isAcceptanceRecordOwnedByActor(resource, context, id)) {
        throw apiError(403, 'ACCEPTANCE_ARCHIVE_SCOPE_FORBIDDEN', 'The acceptance role may archive only records it created.');
      }
      if (['missions', 'aircraft', 'equipment-kits', 'fleet-assets'].includes(resource)) {
        const existing = await repository.get(resource, context, id);
        if (!existing || existing.archived_at || !hasAssignedLocationReadAccess(resource, context, existing)) {
          throw apiError(404, 'NOT_FOUND', 'Operational record not found.');
        }
      }
      if (await repository.hasActiveDependencies(resource, context, id)) {
        throw apiError(409, 'ARCHIVE_CONFLICT', 'Archive dependent active records before archiving this record.');
      }
      const result = context.actorType === 'PLATFORM_SUPPORT' ? await repository.archiveDelegated(resource, context, id, expectedVersion) : await repository.archive(resource, context, id, expectedVersion);
      if (result.notFound) throw apiError(404, 'NOT_FOUND', 'Operational record not found.');
      if (result.archiveConflict) throw apiError(409, 'ARCHIVE_CONFLICT', 'Archive dependent active records before archiving this record.');
      if (result.locationForbidden) throw apiError(403, 'LOCATION_FORBIDDEN', 'This record is outside the assigned Base scope.');
      if (result.conflict) throw apiError(409, 'VERSION_CONFLICT', 'This record changed before your update.', { currentVersion: result.currentVersion });
      return res.status(200).json({ data: mapDatabaseRecord(resource, result.record) });
    } catch (error) {
      const { status, response } = errorEnvelope(error);
      return res.status(status).json(response);
    }
  };
}

function mapMissionSetupDraft(record){return{id:record.id,operatingLocationId:record.operating_location_id,currentStep:record.current_step,furthestStep:record.furthest_step,clientId:record.client_id,propertyId:record.property_id,fieldId:record.field_id,jobId:record.job_id,missionId:record.mission_id,formState:record.form_state||{},rowVersion:record.row_version,createdAt:record.created_at,updatedAt:record.updated_at};}
function createMissionSetupDraftsHandler(dependencies={}){const repository=dependencies.repository||new OperationalRepository(),getContext=dependencies.resolveContext||resolveRequestContext;return async function(req,res){res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');try{const context=await getContext(req,res);if(req.method==='GET'){assertPermission(context,'missions','read');if(req.query?.id){const record=await repository.getMissionSetupDraft(context,assertUuid(req.query.id,'id'));if(!record)throw apiError(404,'NOT_FOUND','Mission setup draft not found.');if(record.operating_location_id)assertLocationAccess(context,record.operating_location_id,'Mission setup draft');return res.status(200).json({data:mapMissionSetupDraft(record)});}const records=await repository.listMissionSetupDrafts(context);return res.status(200).json({data:(records||[]).filter(x=>!x.operating_location_id||(context.operatingLocationIds||[]).includes(x.operating_location_id)).map(mapMissionSetupDraft)});}if(!['POST','PATCH','DELETE'].includes(req.method))throw apiError(405,'METHOD_NOT_ALLOWED','Method not allowed.');assertSameOrigin(req);assertPermission(context,'missions',req.method==='DELETE'?'archive':'create');const body=parseBody(req),operation=req.method==='POST'?'create':req.method==='PATCH'?'update':'archive';const id=req.method==='POST'?null:assertUuid(req.query?.id,'id'),expectedVersion=req.method==='POST'?null:Number(body.expectedVersion);if(req.method!=='POST'&&(!Number.isInteger(expectedVersion)||expectedVersion<1))throw apiError(400,'VALIDATION_ERROR','expectedVersion is required.');if(req.method!=='DELETE'){if(!Number.isInteger(Number(body.currentStep))||Number(body.currentStep)<0||Number(body.currentStep)>9)throw apiError(400,'VALIDATION_ERROR','currentStep is invalid.');if(body.operatingLocationId)assertLocationAccess(context,body.operatingLocationId,'Mission setup draft');}const result=await repository.writeMissionSetupDraft(context,operation,id,expectedVersion,body);if(result.conflict)throw apiError(409,'VERSION_CONFLICT','Mission setup draft changed.',{currentVersion:result.currentVersion});if(result.notFound)throw apiError(404,'NOT_FOUND','Mission setup draft not found.');if(result.locationForbidden)throw apiError(403,'LOCATION_FORBIDDEN','Mission setup draft location is not assigned.');if(result.relationshipConflict)throw apiError(409,'RELATIONSHIP_CONFLICT','Mission setup draft contains an unavailable or cross-organisation record.');return res.status(req.method==='POST'?201:200).json({data:mapMissionSetupDraft(result.record)});}catch(error){const{status,response}=errorEnvelope(error);return res.status(status).json(response);}};}

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

function createMissionAuthorisationHandler(dependencies={}){const repository=dependencies.repository||new OperationalRepository(),getContext=dependencies.resolveContext||resolveRequestContext;return async function(req,res){res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');try{const context=await getContext(req,res),missionId=assertUuid(req.query?.missionId,'missionId'),mission=await repository.get('missions',context,missionId);if(!mission||!hasAssignedLocationReadAccess('missions',context,mission))throw apiError(404,'NOT_FOUND','Mission not found.');const action=req.query?.action;
 if(req.method==='GET'){if(action==='pack'){assertPermission(context,'mission.pack','read');return res.status(200).json({data:await repository.readMissionPack(context,missionId,req.query?.history==='true')});}assertPermission(context,'mission.authorisation','read');if(action&&action!=='readiness')throw apiError(400,'UNSUPPORTED_ACTION','Unsupported Mission Authorisation action.');return res.status(200).json({data:action==='readiness'?await repository.evaluateMissionReadiness(context,missionId):await repository.readMissionAuthorisation(context,missionId,req.query?.history==='true')});}
 if(req.method!=='POST')throw apiError(405,'METHOD_NOT_ALLOWED','Method not allowed.');assertSameOrigin(req);assertLocationAccess(context,mission.operating_location_id,'Mission');const body=parseBody(req),expectedVersion=Number(body.expectedVersion);if(!Number.isInteger(expectedVersion)||expectedVersion<0)throw apiError(400,'VALIDATION_ERROR','expectedVersion is required.');
 if(action==='authorise'){assertPermission(context,'mission.authorisation','authorise');if(typeof body.declaration!=='string'||!body.declaration.trim())throw apiError(400,'VALIDATION_ERROR','An authorisation declaration is required.');const result=await repository.authoriseMission(context,missionId,expectedVersion,body.declaration.trim());if(result.conflict)throw apiError(409,'VERSION_CONFLICT','Mission Authorisation changed.',{currentVersion:result.currentVersion});if(result.readinessBlocked)throw apiError(409,'READINESS_BLOCKED','Mission evidence is not ready for authorisation.',{readiness:result.readiness});if(result.picForbidden)throw apiError(403,'PIC_FORBIDDEN','Only the assigned Pilot in Command may authorise this Mission.');if(result.locationForbidden)throw apiError(403,'LOCATION_FORBIDDEN','Mission location is not assigned.');if(result.notFound)throw apiError(404,'NOT_FOUND','Mission not found.');return res.status(201).json({data:result.record});}
 if(action==='generate-pack'){assertPermission(context,'mission.pack','generate');const result=await repository.generateMissionPack(context,missionId,assertUuid(body.authorisationRevisionId,'authorisationRevisionId'),expectedVersion);if(result.conflict)throw apiError(409,'VERSION_CONFLICT','Mission Pack changed.',{currentVersion:result.currentVersion});if(result.notFound)throw apiError(404,'NOT_FOUND','Authorised Mission evidence was not found.');if(result.locationForbidden)throw apiError(403,'LOCATION_FORBIDDEN','Mission location is not assigned.');return res.status(201).json({data:result.record});}
 throw apiError(400,'UNSUPPORTED_ACTION','Unsupported Mission Authorisation action.');}catch(error){const{status,response}=errorEnvelope(error);return res.status(status).json(response);}};}

function createMissionOperationalCloseoutHandler(dependencies={}){const repository=dependencies.repository||new OperationalRepository(),getContext=dependencies.resolveContext||resolveRequestContext;return async function(req,res){res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');try{const context=await getContext(req,res),missionId=assertUuid(req.query?.missionId,'missionId'),mission=await repository.get('missions',context,missionId);if(!mission||!hasAssignedLocationReadAccess('missions',context,mission))throw apiError(404,'NOT_FOUND','Mission not found.');if(req.method==='GET'){assertPermission(context,'mission.operational','read');return res.status(200).json({data:await repository.readMissionOperationalCloseout(context,missionId)});}if(req.method!=='POST')throw apiError(405,'METHOD_NOT_ALLOWED','Method not allowed.');assertSameOrigin(req);assertLocationAccess(context,mission.operating_location_id,'Mission');const action=req.query?.action,body=parseBody(req,action==='import'?MAX_IMPORT_BODY_BYTES:MAX_BOUNDARY_BODY_BYTES),expectedVersion=Number(body.expectedVersion);if(!Number.isInteger(expectedVersion)||expectedVersion<0)throw apiError(400,'VALIDATION_ERROR','expectedVersion is required.');let result;
 if(action==='import'){assertPermission(context,'mission.operational','write');result=await repository.createMissionOperationalImport(context,missionId,parseOperationalImport(body));}
 else if(action==='resources'){assertPermission(context,'mission.operational','write');for(const field of['aircraftIds','equipmentKitIds','personnelIds','batteries','reloads','refills'])if(!Array.isArray(body[field]))throw apiError(400,'VALIDATION_ERROR',`${field} must be an array.`);result=await repository.saveMissionActualResources(context,missionId,{...body,expectedVersion});}
 else if(action==='chemicals'){assertPermission(context,'mission.operational','write');if(typeof body.changedFromPlan!=='boolean'||!Array.isArray(body.products))throw apiError(400,'VALIDATION_ERROR','Actual chemical usage is incomplete.');result=await repository.saveMissionActualChemicals(context,missionId,{...body,expectedVersion});}
 else if(action==='events'){assertPermission(context,'mission.operational','write');if(!Array.isArray(body.events))throw apiError(400,'VALIDATION_ERROR','events must be an array.');result=await repository.saveMissionOperationalEvents(context,missionId,{events:body.events,expectedVersion});}
 else if(action==='submit'){assertPermission(context,'mission.operational','write');result=await repository.submitMissionOperationalEvidence(context,missionId,{...body,expectedVersion});}
 else if(action==='complete'){assertPermission(context,'mission.completion','complete');const operationalRevisionId=assertUuid(body.operationalRevisionId,'operationalRevisionId');if(typeof body.declaration!=='string'||!body.declaration.trim())throw apiError(400,'VALIDATION_ERROR','A completion declaration is required.');if(body.overrideReason){assertPermission(context,'mission.completion','override_flight_lines');}result=await repository.completeMission(context,missionId,{operationalRevisionId,expectedVersion,declaration:body.declaration.trim(),overrideReason:body.overrideReason});}
 else throw apiError(400,'UNSUPPORTED_ACTION','Unsupported Mission Operational Closeout action.');
 if(result.conflict)throw apiError(409,'VERSION_CONFLICT','Mission Operational Evidence changed.',{currentVersion:result.currentVersion});if(result.notAuthorised)throw apiError(409,'MISSION_NOT_AUTHORISED','Authorise the Mission before recording actuals.');if(result.evidenceIncomplete)throw apiError(409,'EVIDENCE_INCOMPLETE','Complete each Operational Closeout step before review.');if(result.aircraftDaysIncomplete)throw apiError(409,'AIRCRAFT_DAYS_INCOMPLETE','Sign off every operating day with exact aircraft totals before completing the Mission.');if(result.flightLinesRequired)throw apiError(409,'FLIGHT_LINES_REQUIRED','Import final flight-line evidence or provide an authorised exception.');if(result.personnelRequired)throw apiError(409,'PERSONNEL_REQUIRED','A linked authorised Personnel record is required.');if(result.attributionInvalid)throw apiError(400,'OPERATIONAL_ATTRIBUTION_INVALID','Operational Evidence attribution is invalid.');if(result.forbidden)throw apiError(403,'FORBIDDEN','You do not have permission to record Mission Operational Evidence.');if(result.locationForbidden)throw apiError(403,'LOCATION_FORBIDDEN','Mission location is not assigned.');if(result.notFound)throw apiError(404,'NOT_FOUND','Mission evidence was not found.');return res.status(201).json({data:result.record});}catch(error){const{status,response}=errorEnvelope(error);return res.status(status).json(response);}};}

function createMissionOutcomesHandler(dependencies={}){const repository=dependencies.repository||new OperationalRepository(),getContext=dependencies.resolveContext||resolveRequestContext;return async function(req,res){res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');try{const context=await getContext(req,res),missionId=assertUuid(req.query?.missionId,'missionId'),mission=await repository.get('missions',context,missionId);if(!mission||!hasAssignedLocationReadAccess('missions',context,mission))throw apiError(404,'NOT_FOUND','Mission not found.');if(req.method==='GET'){assertPermission(context,'mission.outcomes','read');return res.status(200).json({data:await repository.readMissionOutcomes(context,missionId)});}if(req.method!=='POST')throw apiError(405,'METHOD_NOT_ALLOWED','Method not allowed.');assertSameOrigin(req);assertLocationAccess(context,mission.operating_location_id,'Mission');const action=req.query?.action,body=parseBody(req,MAX_IMPORT_BODY_BYTES);let result;if(action==='observation'){assertPermission(context,'mission.outcomes','create');for(const field of['observerPersonnelId','observedAt','observationTypeCode','methodCode','confidenceCode'])if(typeof body[field]!=='string'||!body[field].trim())throw apiError(400,'VALIDATION_ERROR',`${field} is required.`);result=await repository.createMissionOutcomeObservation(context,missionId,body);}else if(action==='photo'){assertPermission(context,'mission.outcomes','photo.upload');result=await repository.stageMissionOutcomePhoto(context,missionId,body);}else if(action==='follow-up'){assertPermission(context,'mission.outcomes','follow_up.manage');const version=Number(body.expectedVersion);if(!Number.isInteger(version)||version<0)throw apiError(400,'VALIDATION_ERROR','expectedVersion is required.');result=await repository.writeMissionOutcomeFollowUp(context,missionId,body.actionId||null,version,body);}else throw apiError(400,'UNSUPPORTED_ACTION','Unsupported Mission Outcomes action.');if(result.completionRequired)throw apiError(409,'COMPLETION_REQUIRED','Complete the Mission before recording outcomes.');if(result.conflict)throw apiError(409,'VERSION_CONFLICT','The follow-up action changed.');return res.status(201).json({data:result.record});}catch(error){const{status,response}=errorEnvelope(error);return res.status(status).json(response);}};}

function createOrganisationBrandingHandler(dependencies={}){const repository=dependencies.repository||new OperationalRepository(),getContext=dependencies.resolveContext||resolveRequestContext;return async function(req,res){res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');try{const context=await getContext(req,res),action=req.query?.action||'profile';if(req.method==='GET'){assertPermission(context,'organisation.branding','read');return res.status(200).json({data:await repository.readOrganisationBranding(context)});}if(req.method!=='POST')throw apiError(405,'METHOD_NOT_ALLOWED','Method not allowed.');assertSameOrigin(req);assertPermission(context,'organisation.branding','manage');const body=parseBody(req,MAX_IMPORT_BODY_BYTES);let result;if(action==='profile'){const expectedVersion=Number(body.expectedVersion);if(!Number.isInteger(expectedVersion)||expectedVersion<1)throw apiError(400,'VALIDATION_ERROR','expectedVersion is required.');result=await repository.updateOrganisationBranding(context,expectedVersion,body);}else if(action==='logo'){if(typeof body.fileName!=='string'||typeof body.dataUrl!=='string')throw apiError(400,'VALIDATION_ERROR','Logo file is required.');result=await repository.storeOrganisationLogo(context,body);}else if(action==='activate-logo'){const internalFileId=assertUuid(body.internalFileId,'internalFileId'),fileVersion=Number(body.fileVersion),expectedVersion=Number(body.expectedVersion);if(!Number.isInteger(fileVersion)||fileVersion<1||!Number.isInteger(expectedVersion)||expectedVersion<1)throw apiError(400,'VALIDATION_ERROR','fileVersion and expectedVersion are required.');result=await repository.activateOrganisationLogo(context,internalFileId,fileVersion,expectedVersion);}else if(action==='remove-logo'){const expectedVersion=Number(body.expectedVersion);if(!Number.isInteger(expectedVersion)||expectedVersion<1)throw apiError(400,'VALIDATION_ERROR','expectedVersion is required.');result=await repository.removeOrganisationLogo(context,expectedVersion);}else throw apiError(400,'UNSUPPORTED_ACTION','Unsupported Organisation Branding action.');if(result?.conflict)throw apiError(409,'VERSION_CONFLICT','Organisation branding changed.',{currentVersion:result.currentVersion});if(result?.notFound)throw apiError(404,'NOT_FOUND','Organisation logo was not found.');if(result?.forbidden)throw apiError(403,'FORBIDDEN','You do not have permission for this operation.');return res.status(201).json({data:result.record});}catch(error){const{status,response}=errorEnvelope(error);if(error.message&&status<500)response.error.message=error.message;return res.status(status).json(response);}};}

function createReportsHandler(dependencies={}){const repository=dependencies.repository||new OperationalRepository(),getContext=dependencies.resolveContext||resolveRequestContext,types=['MISSION_PACK','MISSION_SUMMARY','MISSION_RECORD'];return async function(req,res){res.setHeader('Cache-Control','no-store');try{const context=await getContext(req,res),missionId=assertUuid(req.query?.missionId,'missionId'),mission=await repository.get('missions',context,missionId);if(!mission||!hasAssignedLocationReadAccess('missions',context,mission))throw apiError(404,'NOT_FOUND','Mission not found.');const action=req.query?.action||'history';if(req.method==='GET'){assertPermission(context,'reports','read');if(action==='download'){const output=await repository.readReportOutput(context,missionId,assertUuid(req.query?.artefactId,'artefactId'));if(!output)throw apiError(404,'NOT_FOUND','Ready report output was not found.');res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="${String(output.metadata.original_filename).replace(/["\r\n]/g,'_')}"`);res.setHeader('X-Content-Type-Options','nosniff');return res.status(200).send(output.bytes);}res.setHeader('Content-Type','application/json; charset=utf-8');const reportType=String(req.query?.reportType||'');if(!types.includes(reportType))throw apiError(400,'VALIDATION_ERROR','reportType is invalid.');return res.status(200).json({data:await repository.readReportArtefacts(context,missionId,reportType)});}if(req.method!=='POST')throw apiError(405,'METHOD_NOT_ALLOWED','Method not allowed.');res.setHeader('Content-Type','application/json; charset=utf-8');assertSameOrigin(req);assertLocationAccess(context,mission.operating_location_id,'Mission');if(action!=='request')throw apiError(400,'UNSUPPORTED_ACTION','Unsupported Reports action.');assertPermission(context,'reports','generate');const body=parseBody(req),reportType=String(body.reportType||'');if(!types.includes(reportType))throw apiError(400,'VALIDATION_ERROR','reportType is invalid.');assertPermission(context,reportType==='MISSION_PACK'?'mission.pack':reportType==='MISSION_SUMMARY'?'mission.summary':'mission.record','generate');if(typeof body.idempotencyKey!=='string'||body.idempotencyKey.length<4||body.idempotencyKey.length>128)throw apiError(400,'VALIDATION_ERROR','idempotencyKey is required.');const result=await repository.requestReportArtefact(context,missionId,reportType,body.idempotencyKey);if(result.completionRequired)throw apiError(409,'COMPLETION_REQUIRED',reportType==='MISSION_SUMMARY'?'Complete the Mission before generating a Mission Summary.':'Complete the Mission before generating a Mission Record.');if(result.operationStarted)throw apiError(409,'OPERATION_STARTED','Mission Packs cannot be regenerated after operations begin.');if(result.notFound)throw apiError(404,'NOT_FOUND','Report evidence was not found.');if(result.locationForbidden)throw apiError(403,'LOCATION_FORBIDDEN','Mission location is not assigned.');if(result.idempotencyConflict)throw apiError(409,'IDEMPOTENCY_SCOPE_MISMATCH','That report request key is already bound to another report scope.');return res.status(201).json({data:result});}catch(error){const{status,response}=errorEnvelope(error);res.setHeader('Content-Type','application/json; charset=utf-8');return res.status(status).json(response);}};}

function createCustomerAcceptanceHandler(dependencies={}){const repository=dependencies.repository||new OperationalRepository(),getContext=dependencies.resolveContext||resolveRequestContext;return async function(req,res){res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');try{const context=await getContext(req,res),missionId=assertUuid(req.query?.missionId,'missionId'),mission=await repository.get('missions',context,missionId);if(!mission||!hasAssignedLocationReadAccess('missions',context,mission))throw apiError(404,'NOT_FOUND','Mission not found.');if(req.method==='GET'){assertPermission(context,'mission.customer_acceptance','read');return res.status(200).json({data:await repository.readCustomerAcceptance(context,missionId)});}if(req.method!=='POST')throw apiError(405,'METHOD_NOT_ALLOWED','Method not allowed.');assertSameOrigin(req);assertLocationAccess(context,mission.operating_location_id,'Mission');const action=req.query?.action,body=parseBody(req,MAX_IMPORT_BODY_BYTES);let result;if(action==='record'){assertPermission(context,'mission.customer_acceptance','record');for(const field of['stateCode','methodCode','satisfactionCode','outcomeSummary','customerContactName','acknowledgedAt'])if(typeof body[field]!=='string'||!body[field].trim())throw apiError(400,'VALIDATION_ERROR',`${field} is required.`);if(body.followUpRequested===true&&(!body.followUpDate||typeof body.followUpDate!=='string'))throw apiError(400,'VALIDATION_ERROR','followUpDate is required.');result=await repository.createCustomerAcceptance(context,missionId,body);}else if(action==='file'){assertPermission(context,'mission.customer_acceptance','attachment.upload');const match=typeof body.dataUrl==='string'&&body.dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);const bytes=match?Buffer.from(match[2],'base64'):null;if(!match||!bytes?.length||bytes.length>3145728||Number(body.sizeBytes)!==bytes.length)throw apiError(400,'VALIDATION_ERROR','A valid Customer Outcome photo is required.');result=await repository.stageInternalCustomerOutcomeFile(context,missionId,{kind:body.kind==='SIGNATURE'?'SIGNATURE':'OUTCOME_PHOTO',fileName:String(body.fileName||'outcome-photo'),contentType:match[1],bytes,captureTimestamp:body.captureTimestamp||null,caption:body.caption||null});}else if(action==='link-issue'){assertPermission(context,'mission.customer_acceptance','link.issue');if(typeof body.contactName!=='string'||!body.contactName.trim())throw apiError(400,'VALIDATION_ERROR','contactName is required.');result=await repository.issueCustomerAcceptanceLink(context,missionId,body);}else if(action==='link-revoke'){assertPermission(context,'mission.customer_acceptance','link.revoke');result=await repository.revokeCustomerAcceptanceLink(context,missionId,body);}else throw apiError(400,'UNSUPPORTED_ACTION','Unsupported Customer Outcome action.');if(result?.completion_required)throw apiError(409,'COMPLETION_REQUIRED','Complete the Mission before recording a Customer Outcome.');if(result?.validation_error)throw apiError(400,'VALIDATION_ERROR','Customer Outcome evidence is incomplete.');if(result?.conflict)throw apiError(409,'VERSION_CONFLICT','The secure link changed.');return res.status(201).json({data:{...(result.record||result),...(result.token?{token:result.token}:{})}});}catch(error){const{status,response}=errorEnvelope(error);return res.status(status).json(response);}};}

function createCustomerAcceptancePublicHandler(dependencies={}){const repository=dependencies.repository||new OperationalRepository();return async function(req,res){res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');try{const token=typeof req.query?.token==='string'?req.query.token:'';if(token.length<6||token.length>256)throw apiError(404,'LINK_UNAVAILABLE','Customer Outcome link is unavailable.');const fingerprint=crypto.createHash('sha256').update(`${req.headers?.['x-forwarded-for']||''}|${req.headers?.['user-agent']||''}`).digest('hex');if(req.method==='GET'){const result=await repository.resolveCustomerAcceptanceLink(token,fingerprint);if(result?.invalid||result?.revoked||result?.expired||result?.consumed)throw apiError(410,'LINK_UNAVAILABLE','This Customer Outcome link is no longer available.');if(result?.rate_limited)throw apiError(429,'RATE_LIMITED','Too many link requests.');const{organisationName,missionReference,completedAt,customerName,intendedContactName,expiresAt,states,satisfactionLevels}=result;return res.status(200).json({data:{organisationName,missionReference,completedAt,customerName,intendedContactName,expiresAt,states,satisfactionLevels}});}if(req.method!=='POST')throw apiError(405,'METHOD_NOT_ALLOWED','Method not allowed.');assertSameOrigin(req);const action=req.query?.action,body=parseBody(req,MAX_IMPORT_BODY_BYTES);let result;if(action==='signature'||action==='file'){const match=typeof body.dataUrl==='string'&&body.dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);if(!match)throw apiError(400,'VALIDATION_ERROR','A PNG, JPEG or WebP file is required.');const bytes=Buffer.from(match[2],'base64');if(!bytes.length||bytes.length>3145728)throw apiError(400,'VALIDATION_ERROR','File size is invalid.');const link=await repository.resolveCustomerAcceptanceLink(token,fingerprint);if(!link?.linkId)throw apiError(410,'LINK_UNAVAILABLE','This Customer Outcome link is no longer available.');result=await repository.stageCustomerAcceptanceFile({organisationId:link.organisationId,missionId:link.missionId,token,kind:action==='signature'?'SIGNATURE':'OUTCOME_PHOTO',fileName:String(body.fileName||'customer-outcome-file.png'),contentType:match[1],bytes,captureTimestamp:body.captureTimestamp||null,caption:body.caption||null});}else if(action==='submit'){for(const field of['stateCode','satisfactionCode','outcomeSummary','customerContactName','consentDeclaration'])if(typeof body[field]!=='string'||!body[field].trim())throw apiError(400,'VALIDATION_ERROR',`${field} is required.`);if(body.consent!==true)throw apiError(400,'VALIDATION_ERROR','Explicit consent is required.');if(body.followUpRequested===true&&(!body.followUpDate||typeof body.followUpDate!=='string'))throw apiError(400,'VALIDATION_ERROR','followUpDate is required.');result=await repository.submitCustomerAcceptanceLink(token,fingerprint,body);}else throw apiError(400,'UNSUPPORTED_ACTION','Unsupported Customer Outcome link action.');if(result?.unavailable)throw apiError(410,'LINK_UNAVAILABLE','This Customer Outcome link is no longer available.');if(result?.validation_error)throw apiError(400,'VALIDATION_ERROR','Customer Outcome is incomplete.');return res.status(201).json({data:result.record||result});}catch(error){const{status,response}=errorEnvelope(error);return res.status(status).json(response);}};}

module.exports = { createMissionSetupDraftsHandler, createChemicalReviewsHandler, createCustomerAcceptanceHandler, createCustomerAcceptancePublicHandler, createFieldBoundaryVersionHandler, createMissionAuthorisationHandler, createMissionOperationalCloseoutHandler, createMissionOutcomesHandler, createMissionChemicalsHandler, createMissionJsaHandler, createMissionMapHandler, createMissionPersonnelHandler, createMissionWeatherHandler, createOperationalHandler, createOrganisationBrandingHandler, createReportsHandler, createPersonnelHandler, createPersonnelIdentityHandler, createSessionHandler, errorEnvelope, mapBoundaryRecord, mapDatabaseRecord, mapMissionMapSourceFileRecord, mapPersonnelRecord };
