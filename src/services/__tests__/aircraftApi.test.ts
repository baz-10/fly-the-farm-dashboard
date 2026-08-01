import { createAircraftApiGateway, AircraftApiError } from '../aircraftApi';

const record = {
  id: '44444444-4444-4444-8444-444444444444', operatingLocationId: '33333333-3333-4333-8333-333333333333',
  registration: 'VH-FTF1', manufacturer: 'DJI', model: 'Agras T100', serialNumber: 'T100-001', activationDate: '2026-08-02',
  status: 'operational', serviceabilityState: 'serviceable', missionReady: true, mtow: 149.9, maxAltitude: 120, maxWindSpeed: 28,
  maintenanceDates: { lastInspection: '2026-07-01', nextInspectionDue: '2026-10-01', lastMajorService: '2026-06-01', nextMajorServiceDue: '2026-12-01', totalFlightHours: 12.5, hoursSinceLastService: 2.5 },
  insurance: { policyNumber: 'FTF-001', provider: 'Aviation Cover', expiryDate: '2027-08-01', coverageAmount: 5000000, hullValue: 80000 },
  operationalLimits: { minOperatingTemp: -10, maxOperatingTemp: 45, maxPayloadWeight: 75, batteryCycles: 20, maxFlightTime: 18, serviceRange: 8, minimumCrewSize: 2 },
  documentation: { manuals: ['file-1'], certificates: [], logbooks: [], complianceChecks: { casaCompliant: true, lastCasaInspection: '2026-07-01T00:00:00.000Z', nextCasaInspectionDue: '2027-07-01T00:00:00.000Z' } },
  notes: '', rowVersion: 1, createdAt: '2026-08-02T00:00:00Z', updatedAt: '2026-08-02T00:00:00Z',
};

describe('Aircraft API gateway', () => {
  afterEach(() => jest.restoreAllMocks());

  test('maps complete authoritative records and never calls a legacy path', async () => {
    const fetcher = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [record] }) });
    const gateway = createAircraftApiGateway(fetcher as unknown as typeof fetch);
    await expect(gateway.list()).resolves.toEqual([{ ...record, assignedKits: [] }]);
    expect(fetcher).toHaveBeenCalledWith('/api/v1/aircraft?page=1&pageSize=100', expect.objectContaining({ credentials: 'same-origin' }));
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('/api/store') || String(url).includes('ftf_aircraft_data'))).toBe(false);
  });

  test('sends expectedVersion and returns the confirmed update', async () => {
    const fetcher = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: { ...record, rowVersion: 2 } }) });
    const gateway = createAircraftApiGateway(fetcher as unknown as typeof fetch);
    await expect(gateway.update(record.id, record, 1)).resolves.toEqual(expect.objectContaining({ id: record.id, rowVersion: 2 }));
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(expect.objectContaining({ expectedVersion: 1, registration: 'VH-FTF1' }));
  });

  test('surfaces conflict metadata and rejects malformed confirmations', async () => {
    const conflictFetch = jest.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: { code: 'VERSION_CONFLICT', message: 'Changed', meta: { currentVersion: 3 } } }) });
    await expect(createAircraftApiGateway(conflictFetch as unknown as typeof fetch).archive(record.id, 1)).rejects.toMatchObject({ code: 'VERSION_CONFLICT', currentVersion: 3 });
    const malformedFetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: { id: record.id } }) });
    await expect(createAircraftApiGateway(malformedFetch as unknown as typeof fetch).list()).rejects.toBeInstanceOf(AircraftApiError);
  });
});
