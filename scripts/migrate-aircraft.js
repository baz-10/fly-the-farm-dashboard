#!/usr/bin/env node

function date(value, field, required = false) {
  if (!value && !required) return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new Error(`${field} must be a valid date`);
  return value.slice(0, 10);
}

function number(value, field, minimum = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum) throw new Error(`${field} must be at least ${minimum}`);
  return parsed;
}

function text(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}

function mapLegacyAircraft(record, defaultLocationId) {
  if (!record || typeof record !== 'object') throw new Error('Aircraft source record must be an object');
  const status = record.status;
  if (!['operational', 'maintenance', 'retired', 'inspection'].includes(status)) throw new Error('status is invalid');
  const maintenance = record.maintenanceDates || {};
  const insurance = record.insurance || {};
  const limits = record.operationalLimits || {};
  const documentation = record.documentation || {};
  const complianceChecks = documentation.complianceChecks || {};
  const serviceabilityState = status === 'operational' ? 'serviceable'
    : status === 'maintenance' ? 'maintenance_required'
      : status === 'inspection' ? 'inspection_required' : 'unserviceable';
  const mtow = number(record.mtow, 'mtow', 0.001);
  const maxPayloadWeight = number(limits.maxPayloadWeight, 'maxPayloadWeight', 0.001);
  if (maxPayloadWeight > mtow) throw new Error('maxPayloadWeight cannot exceed mtow');
  const minOperatingTemp = number(limits.minOperatingTemp, 'minOperatingTemp', Number.NEGATIVE_INFINITY);
  const maxOperatingTemp = number(limits.maxOperatingTemp, 'maxOperatingTemp', Number.NEGATIVE_INFINITY);
  if (minOperatingTemp >= maxOperatingTemp) throw new Error('operating temperature range is invalid');
  if (![documentation.manuals, documentation.certificates, documentation.logbooks].every(Array.isArray)) throw new Error('documentation file lists are invalid');
  return {
    operating_location_id: text(record.operatingLocationId || defaultLocationId, 'operatingLocationId'),
    registration: text(record.registration, 'registration').toUpperCase(), manufacturer: text(record.manufacturer, 'manufacturer'),
    model: text(record.model, 'model'), serial_number: text(record.serialNumber, 'serialNumber'),
    activation_date: date(record.activationDate, 'activationDate'), status, serviceability_state: serviceabilityState,
    mission_ready: status === 'operational', mtow, max_altitude: number(record.maxAltitude, 'maxAltitude', 0.001),
    max_wind_speed: number(record.maxWindSpeed, 'maxWindSpeed', 0.001),
    last_inspection: date(maintenance.lastInspection, 'lastInspection'), next_inspection_due: date(maintenance.nextInspectionDue, 'nextInspectionDue'),
    last_major_service: date(maintenance.lastMajorService, 'lastMajorService'), next_major_service_due: date(maintenance.nextMajorServiceDue, 'nextMajorServiceDue'),
    total_flight_hours: number(maintenance.totalFlightHours, 'totalFlightHours'), hours_since_last_service: number(maintenance.hoursSinceLastService, 'hoursSinceLastService'),
    insurance_policy_number: text(insurance.policyNumber, 'insurancePolicyNumber'), insurance_provider: text(insurance.provider, 'insuranceProvider'),
    insurance_expiry_date: date(insurance.expiryDate, 'insuranceExpiryDate', true), insurance_coverage_amount: number(insurance.coverageAmount, 'coverageAmount'),
    hull_value: number(insurance.hullValue, 'hullValue'), min_operating_temp: minOperatingTemp, max_operating_temp: maxOperatingTemp,
    max_payload_weight: maxPayloadWeight, battery_cycles: limits.batteryCycles == null ? null : number(limits.batteryCycles, 'batteryCycles'),
    max_flight_time: number(limits.maxFlightTime, 'maxFlightTime', 0.001), service_range: number(limits.serviceRange, 'serviceRange', 0.001),
    minimum_crew_size: number(limits.minimumCrewSize, 'minimumCrewSize', 1),
    documentation: { manuals: documentation.manuals, certificates: documentation.certificates, logbooks: documentation.logbooks, complianceChecks },
    notes: typeof record.notes === 'string' ? record.notes : '', source_system: 'ftf_aircraft_data', source_record_id: text(record.id, 'id'),
  };
}

async function migrateAircraftRecords(sourceRecords, options) {
  const existingIds = new Set((options.existing || []).map((record) => record.source_record_id).filter(Boolean));
  const registrations = new Set();
  const serialNumbers = new Set();
  const errors = [];
  const duplicates = [];
  const valid = [];
  let skippedCount = 0;
  for (const source of sourceRecords) {
    try {
      const mapped = mapLegacyAircraft(source, options.defaultLocationId);
      if (existingIds.has(mapped.source_record_id)) { skippedCount += 1; continue; }
      if (registrations.has(mapped.registration) || serialNumbers.has(mapped.serial_number)) {
        duplicates.push({ sourceRecordId: mapped.source_record_id, registration: mapped.registration, serialNumber: mapped.serial_number });
        continue;
      }
      registrations.add(mapped.registration);
      serialNumbers.add(mapped.serial_number);
      valid.push(mapped);
    } catch (error) {
      errors.push({ sourceRecordId: source?.id || null, message: error instanceof Error ? error.message : String(error) });
    }
  }
  const created = [];
  if (options.apply) {
    for (const mapped of valid) {
      try { created.push(await options.write(mapped)); }
      catch (error) { errors.push({ sourceRecordId: mapped.source_record_id, message: error instanceof Error ? error.message : String(error) }); }
    }
  }
  const confirmed = new Set([...existingIds, ...created.map((record) => record?.source_record_id).filter(Boolean)]);
  return {
    mode: options.apply ? 'apply' : 'dry-run', sourceCount: sourceRecords.length, validCount: valid.length,
    createdCount: created.length, skippedCount, duplicateCount: duplicates.length, errorCount: errors.length,
    reconciled: Boolean(options.apply && errors.length === 0 && valid.every((record) => confirmed.has(record.source_record_id))),
    duplicates, errors, mappedSourceIds: valid.map((record) => record.source_record_id),
  };
}

async function supabaseRequest(path, options = {}) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  const response = await fetch(`${base.replace(/\/$/, '')}/${path}`, {
    ...options, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message || `Supabase request failed with HTTP ${response.status}`);
  return body;
}

function readLegacyAircraftSource(sourceRows) {
  const records = Array.isArray(sourceRows) && Array.isArray(sourceRows[0]?.payload?.aircraft)
    ? sourceRows[0].payload.aircraft
    : [];
  return { records, sourcePresent: records.length > 0 };
}

async function run() {
  const apply = process.argv.includes('--apply');
  const organisationId = text(process.env.FTF_ORGANISATION_ID, 'FTF_ORGANISATION_ID');
  const actorId = text(process.env.FTF_ACTOR_INTERNAL_USER_ID, 'FTF_ACTOR_INTERNAL_USER_ID');
  const defaultLocationId = text(process.env.FTF_DEFAULT_OPERATING_LOCATION_ID, 'FTF_DEFAULT_OPERATING_LOCATION_ID');
  const sourceRows = await supabaseRequest(`rest/v1/ftf_store?tenant_id=eq.${encodeURIComponent(organisationId)}&collection=eq.ftf_aircraft_data&record_id=eq.__value__&select=payload`);
  const { records: sourceRecords, sourcePresent } = readLegacyAircraftSource(sourceRows);
  const existing = await supabaseRequest(`rest/v1/aircraft?organisation_id=eq.${encodeURIComponent(organisationId)}&source_system=eq.ftf_aircraft_data&select=source_record_id`);
  const report = await migrateAircraftRecords(sourceRecords, {
    defaultLocationId, existing, apply,
    write: async (data) => {
      const result = await supabaseRequest('rest/v1/rpc/ftf_write_operational_resource', {
        method: 'POST', body: JSON.stringify({ p_organisation_id: organisationId, p_actor_internal_user_id: actorId, p_resource: 'aircraft', p_operation: 'create', p_entity_id: null, p_expected_version: null, p_data: data }),
      });
      return result?.record || result;
    },
  });
  report.sourcePresent = sourcePresent;
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.errorCount > 0 || (apply && !report.reconciled)) process.exitCode = 1;
}

module.exports = { mapLegacyAircraft, migrateAircraftRecords, readLegacyAircraftSource };
if (require.main === module) run().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
