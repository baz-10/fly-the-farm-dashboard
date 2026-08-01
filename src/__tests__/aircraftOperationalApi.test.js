const { createOperationalHandler } = require('../../server/operational-api');

const locationId = '33333333-3333-4333-8333-333333333333';
const aircraftId = '44444444-4444-4444-8444-444444444444';

function response() {
  return { statusCode: 200, body: undefined, headers: {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; }, setHeader(name, value) { this.headers[name.toLowerCase()] = value; } };
}

function request(method, body = {}, query = {}) {
  return { method, body, query, headers: { host: 'localhost:3001', origin: 'http://localhost:3001' } };
}

function context(permissions, locations = [locationId]) {
  return {
    user: { id: 'auth-a' }, organisation: { id: '11111111-1111-4111-8111-111111111111', name: 'FTF' },
    internalUser: { id: '22222222-2222-4222-8222-222222222222' }, roles: ['operator'], permissions,
    operatingLocationIds: locations, entitlement: { tier: 'beta', seatActive: true },
  };
}

function fixture(overrides = {}) {
  return {
    operatingLocationId: locationId, registration: 'VH-FTF1', manufacturer: 'DJI', model: 'Agras T100', serialNumber: 'T100-001',
    activationDate: '2026-08-02', status: 'operational', serviceabilityState: 'serviceable', missionReady: true,
    mtow: 149.9, maxAltitude: 120, maxWindSpeed: 28,
    maintenanceDates: { lastInspection: '2026-07-01', nextInspectionDue: '2026-10-01', lastMajorService: '2026-06-01', nextMajorServiceDue: '2026-12-01', totalFlightHours: 12.5, hoursSinceLastService: 2.5 },
    insurance: { policyNumber: 'FTF-001', provider: 'Aviation Cover', expiryDate: '2027-08-01', coverageAmount: 5000000, hullValue: 80000 },
    operationalLimits: { minOperatingTemp: -10, maxOperatingTemp: 45, maxPayloadWeight: 75, batteryCycles: 20, maxFlightTime: 18, serviceRange: 8, minimumCrewSize: 2 },
    documentation: { manuals: ['file-1'], certificates: ['file-2'], logbooks: [], complianceChecks: { casaCompliant: true, lastCasaInspection: '2026-07-01T00:00:00.000Z', nextCasaInspectionDue: '2027-07-01T00:00:00.000Z' } },
    notes: 'Primary spray aircraft', ...overrides,
  };
}

function databaseRecord() {
  return {
    id: aircraftId, operating_location_id: locationId, registration: 'VH-FTF1', manufacturer: 'DJI', model: 'Agras T100', serial_number: 'T100-001',
    activation_date: '2026-08-02', status: 'operational', serviceability_state: 'serviceable', mission_ready: true,
    mtow: 149.9, max_altitude: 120, max_wind_speed: 28, total_flight_hours: 12.5, hours_since_last_service: 2.5,
    last_inspection: '2026-07-01', next_inspection_due: '2026-10-01', last_major_service: '2026-06-01', next_major_service_due: '2026-12-01',
    insurance_policy_number: 'FTF-001', insurance_provider: 'Aviation Cover', insurance_expiry_date: '2027-08-01', insurance_coverage_amount: 5000000, hull_value: 80000,
    min_operating_temp: -10, max_operating_temp: 45, max_payload_weight: 75, battery_cycles: 20, max_flight_time: 18, service_range: 8, minimum_crew_size: 2,
    documentation: fixture().documentation, notes: 'Primary spray aircraft', row_version: 1, created_at: '2026-08-02T00:00:00Z', updated_at: '2026-08-02T00:00:00Z',
  };
}

function handler(repository, permissions = ['aircraft.read', 'aircraft.create', 'aircraft.update', 'aircraft.archive', 'aircraft.serviceability'], locations) {
  return createOperationalHandler('aircraft', { repository, resolveContext: jest.fn().mockResolvedValue(context(permissions, locations)) });
}

describe('authoritative Aircraft API', () => {
  test('creates and returns the complete existing Aircraft aggregate', async () => {
    const repository = { create: jest.fn().mockResolvedValue({ record: databaseRecord() }) };
    const res = response();
    await handler(repository)(request('POST', fixture()), res);
    expect(res.statusCode).toBe(201);
    expect(res.body.data).toEqual(expect.objectContaining({ id: aircraftId, registration: 'VH-FTF1', operatingLocationId: locationId, missionReady: true, maintenanceDates: fixture().maintenanceDates, insurance: fixture().insurance, operationalLimits: fixture().operationalLimits, documentation: fixture().documentation, rowVersion: 1 }));
    expect(repository.create).toHaveBeenCalledWith('aircraft', expect.anything(), expect.objectContaining({ registration: 'VH-FTF1', operating_location_id: locationId, serviceability_state: 'serviceable' }));
  });

  test('filters list reads and hides detail reads outside assigned locations', async () => {
    const other = { ...databaseRecord(), id: '55555555-5555-4555-8555-555555555555', operating_location_id: '66666666-6666-4666-8666-666666666666' };
    const repository = { list: jest.fn().mockResolvedValue([databaseRecord(), other]), get: jest.fn().mockResolvedValue(other) };
    const list = response();
    await handler(repository)(request('GET'), list);
    expect(list.body.data.map((record) => record.id)).toEqual([aircraftId]);
    const detail = response();
    await handler(repository)(request('GET', {}, { id: other.id }), detail);
    expect(detail.statusCode).toBe(404);
  });

  test('rejects unassigned locations, invalid readiness, and status changes without serviceability permission', async () => {
    const repository = { create: jest.fn(), get: jest.fn().mockResolvedValue(databaseRecord()), update: jest.fn() };
    const unassigned = response();
    await handler(repository)(request('POST', fixture({ operatingLocationId: '66666666-6666-4666-8666-666666666666' })), unassigned);
    expect(unassigned.body.error.code).toBe('LOCATION_FORBIDDEN');
    const invalid = response();
    await handler(repository)(request('POST', fixture({ status: 'maintenance', missionReady: true })), invalid);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
    const denied = response();
    await handler(repository, ['aircraft.update'])(request('PATCH', { ...fixture({ status: 'maintenance', serviceabilityState: 'maintenance_required', missionReady: false }), expectedVersion: 1 }, { id: aircraftId }), denied);
    expect(denied.statusCode).toBe(403);
    expect(repository.update).not.toHaveBeenCalled();
  });

  test('preserves optimistic concurrency and controlled archive outcomes', async () => {
    const repository = { get: jest.fn().mockResolvedValue(databaseRecord()), update: jest.fn().mockResolvedValue({ conflict: true, currentVersion: 2 }), hasActiveDependencies: jest.fn().mockResolvedValue(false), archive: jest.fn().mockResolvedValue({ record: { ...databaseRecord(), archived_at: '2026-08-02T01:00:00Z', row_version: 2 } }) };
    const stale = response();
    await handler(repository)(request('PATCH', { ...fixture(), expectedVersion: 1 }, { id: aircraftId }), stale);
    expect(stale.body.error).toEqual(expect.objectContaining({ code: 'VERSION_CONFLICT', meta: { currentVersion: 2 } }));
    const archived = response();
    await handler(repository)(request('DELETE', { expectedVersion: 1 }, { id: aircraftId }), archived);
    expect(archived.statusCode).toBe(200);
    expect(repository.archive).toHaveBeenCalledWith('aircraft', expect.anything(), aircraftId, 1);
  });
});
