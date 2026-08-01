import {
  OperationalApiError,
  createOperationalApi,
  mapApiClient,
  mapApiField,
  mapApiProperty,
} from '../operationalApi';

const jsonResponse = (status: number, body: unknown) => Promise.resolve({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
} as Response);

describe('operational API adapter', () => {
  afterEach(() => jest.restoreAllMocks());

  test('maps relational API records explicitly into the existing workflow types', () => {
    expect(mapApiClient({
      id: 'client-1', name: 'North Farm', contact_email: 'ops@example.com',
      contact_phone: '0400000000', row_version: 3,
      created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-02T00:00:00Z',
    })).toEqual({
      id: 'client-1', contractorUserId: '', name: 'North Farm', phone: '0400000000',
      email: 'ops@example.com', notes: '', createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-02T00:00:00Z', rowVersion: 3,
    });
    expect(mapApiProperty({
      id: 'property-1', client_id: 'client-1', name: 'Home Block', address: '1 Farm Rd',
      state: 'QLD',
      row_version: 2, created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-02T00:00:00Z',
    })).toEqual(expect.objectContaining({
      id: 'property-1', clientId: 'client-1', name: 'Home Block', address: '1 Farm Rd',
      state: 'QLD', locality: '', lotPlan: '', notes: '', rowVersion: 2,
    }));
    expect(mapApiField({
      id: 'field-1', property_id: 'property-1', name: 'North Paddock', area_hectares: '12.5',
      boundary_coords: [[-27.1, 153.1], [-27.2, 153.2], [-27.3, 153.1]], row_version: 4,
      created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-02T00:00:00Z',
    })).toEqual(expect.objectContaining({
      id: 'field-1', propertyId: 'property-1', name: 'North Paddock', sizeHa: 12.5,
      boundary: null, boundaryCoords: [[-27.1, 153.1], [-27.2, 153.2], [-27.3, 153.1]], rowVersion: 4,
    }));
  });

  test('preserves Australian property state in trusted create payloads and responses', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(() => jsonResponse(201, {
      data: {
        id: 'property-1', clientId: 'client-1', name: 'Home Block', address: '1 Farm Rd', state: 'QLD',
        rowVersion: 1, createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
      },
    }));
    const property = await createOperationalApi().properties.create({
      clientId: 'client-1', name: 'Home Block', address: '1 Farm Rd', state: 'QLD',
      locality: '', lotPlan: '', notes: '',
    });
    expect(property.state).toBe('QLD');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/properties', expect.objectContaining({
      body: JSON.stringify({ clientId: 'client-1', name: 'Home Block', address: '1 Farm Rd', state: 'QLD' }),
    }));
  });

  test.each([
    ['clients', { id: '', name: 'Farm', rowVersion: 1, createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' }],
    ['properties', { id: 'property-1', clientId: '', name: 'Farm', state: 'QLD', rowVersion: 1, createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' }],
    ['fields', { id: 'field-1', propertyId: 'property-1', name: '', rowVersion: 1, createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' }],
    ['jobs', { id: 'job-1', clientId: 'client-1', propertyId: 'property-1', reference: 'J-1', rowVersion: 0, createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' }],
    ['missions', { id: 'mission-1', jobId: 'job-1', operatingLocationId: 'location-1', missionNumber: 'M-1', rowVersion: 1, createdAt: 'not-a-date', updatedAt: '2026-08-01T00:00:00Z' }],
  ])('rejects a malformed %s record inside a successful list', async (resource, record) => {
    jest.spyOn(global, 'fetch').mockImplementation(() => jsonResponse(200, {
      data: [record], pagination: { page: 1, pageSize: 100 },
    }));
    await expect((createOperationalApi() as any)[resource].list()).rejects.toEqual(expect.objectContaining({
      code: 'MALFORMED_RESPONSE',
    }));
  });

  test('rejects malformed detail and session envelopes instead of normalising empty identity', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockImplementationOnce(() => jsonResponse(200, { data: {
        id: 'client-1', name: 'Farm', rowVersion: 1,
        createdAt: '', updatedAt: '2026-08-01T00:00:00Z',
      } }))
      .mockImplementationOnce(() => jsonResponse(200, { data: { user: { id: 'user-1' }, organisation: { id: '' } } }));
    const api = createOperationalApi();
    await expect(api.clients.get('client-1')).rejects.toEqual(expect.objectContaining({ code: 'MALFORMED_RESPONSE' }));
    await expect(api.session()).rejects.toEqual(expect.objectContaining({ code: 'MALFORMED_RESPONSE' }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('uses same-origin credentials and only sends writable resource fields', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(() => jsonResponse(201, {
      data: {
        id: 'client-1', name: 'North Farm', contactEmail: 'ops@example.com', contactPhone: '0400000000', rowVersion: 1,
        createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
      },
    }));
    const api = createOperationalApi({ timeoutMs: 1000 });

    await api.clients.create({
      name: 'North Farm', phone: '0400000000', email: 'ops@example.com', notes: 'private note',
      addresses: [], contractorUserId: 'browser-user-id',
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/clients', expect.objectContaining({
      method: 'POST', credentials: 'same-origin', body: JSON.stringify({
        name: 'North Farm', contactEmail: 'ops@example.com', contactPhone: '0400000000',
      }),
    }));
  });

  test('exposes structured optimistic conflict metadata', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(() => jsonResponse(409, {
      error: { code: 'VERSION_CONFLICT', message: 'This record changed.', meta: { currentVersion: 8 } },
    }));

    await expect(createOperationalApi().clients.update('client-1', { name: 'Changed' }, 7))
      .rejects.toEqual(expect.objectContaining<Partial<OperationalApiError>>({
        name: 'OperationalApiError', status: 409, code: 'VERSION_CONFLICT',
        details: { currentVersion: 8 }, currentVersion: 8,
      }));
  });

  test('exposes archive and unauthorised failures without converting them to empty data', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockImplementationOnce(() => jsonResponse(409, { error: { code: 'ARCHIVE_CONFLICT', message: 'Archive dependants first.' } }))
      .mockImplementationOnce(() => jsonResponse(403, { error: { code: 'FORBIDDEN', message: 'No access.' } }));
    const api = createOperationalApi();

    await expect(api.properties.archive('property-1', 2)).rejects.toEqual(expect.objectContaining({ code: 'ARCHIVE_CONFLICT', status: 409 }));
    await expect(api.fields.list()).rejects.toEqual(expect.objectContaining({ code: 'FORBIDDEN', status: 403 }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('rejects a malformed successful list envelope instead of treating it as a valid empty list', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(() => jsonResponse(200, { pagination: { page: 1, pageSize: 100 } }));
    await expect(createOperationalApi().clients.list()).rejects.toEqual(expect.objectContaining({
      status: 0, code: 'MALFORMED_RESPONSE',
    }));
  });

  test('exposes typed job and mission methods for the next workflow without using them here', () => {
    const api = createOperationalApi();
    expect(api.jobs.list).toEqual(expect.any(Function));
    expect(api.jobs.create).toEqual(expect.any(Function));
    expect(api.missions.get).toEqual(expect.any(Function));
    expect(api.missions.archive).toEqual(expect.any(Function));
  });
});
