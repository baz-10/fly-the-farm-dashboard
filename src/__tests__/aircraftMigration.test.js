const { mapLegacyAircraft, migrateAircraftRecords } = require('../../scripts/migrate-aircraft');

const legacy = (overrides = {}) => ({
  id: 'aircraft_legacy_1', registration: 'vh-ftf1', manufacturer: 'DJI', model: 'Agras T100', serialNumber: 'T100-001', activationDate: '2026-08-02T00:00:00.000Z',
  status: 'operational', mtow: 149.9, maxAltitude: 120, maxWindSpeed: 28,
  maintenanceDates: { lastInspection: '2026-07-01T00:00:00.000Z', nextInspectionDue: '2026-10-01T00:00:00.000Z', lastMajorService: '2026-06-01T00:00:00.000Z', nextMajorServiceDue: '2026-12-01T00:00:00.000Z', totalFlightHours: 12.5, hoursSinceLastService: 2.5 },
  insurance: { policyNumber: 'FTF-001', provider: 'Aviation Cover', expiryDate: '2027-08-01T00:00:00.000Z', coverageAmount: 5000000, hullValue: 80000 },
  operationalLimits: { minOperatingTemp: -10, maxOperatingTemp: 45, maxPayloadWeight: 75, batteryCycles: 20, maxFlightTime: 18, serviceRange: 8, minimumCrewSize: 2 },
  documentation: { manuals: [], certificates: [], logbooks: [], complianceChecks: { casaCompliant: true, lastCasaInspection: '2026-07-01T00:00:00.000Z', nextCasaInspectionDue: '2027-07-01T00:00:00.000Z' } },
  ...overrides,
});

test('maps a useful legacy Aircraft record with source traceability and readiness', () => {
  expect(mapLegacyAircraft(legacy(), '33333333-3333-4333-8333-333333333333')).toEqual(expect.objectContaining({
    operating_location_id: '33333333-3333-4333-8333-333333333333', registration: 'VH-FTF1',
    serviceability_state: 'serviceable', mission_ready: true, source_system: 'ftf_aircraft_data', source_record_id: 'aircraft_legacy_1',
  }));
});

test('dry-run reports invalid and duplicate source records without writing', async () => {
  const write = jest.fn();
  const report = await migrateAircraftRecords([
    legacy(), legacy({ id: 'aircraft_legacy_2', serialNumber: 'T100-002' }), legacy({ id: 'bad', registration: '' }),
  ], { defaultLocationId: '33333333-3333-4333-8333-333333333333', existing: [], write, apply: false });
  expect(report).toEqual(expect.objectContaining({ sourceCount: 3, validCount: 1, createdCount: 0, duplicateCount: 1, errorCount: 1, reconciled: false }));
  expect(write).not.toHaveBeenCalled();
});

test('apply is idempotent and reconciles confirmed source IDs', async () => {
  const write = jest.fn().mockResolvedValue({ id: '44444444-4444-4444-8444-444444444444', source_record_id: 'aircraft_legacy_1' });
  const first = await migrateAircraftRecords([legacy()], { defaultLocationId: '33333333-3333-4333-8333-333333333333', existing: [], write, apply: true });
  expect(first).toEqual(expect.objectContaining({ createdCount: 1, reconciled: true }));
  const second = await migrateAircraftRecords([legacy()], { defaultLocationId: '33333333-3333-4333-8333-333333333333', existing: [{ source_record_id: 'aircraft_legacy_1' }], write, apply: true });
  expect(second).toEqual(expect.objectContaining({ createdCount: 0, skippedCount: 1, reconciled: true }));
  expect(write).toHaveBeenCalledTimes(1);
});
