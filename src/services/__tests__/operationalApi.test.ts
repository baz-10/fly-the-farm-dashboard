import {
  OperationalApiError,
  createOperationalApi,
  mapApiClient,
  mapApiField,
  mapApiFieldBoundaryVersion,
  mapApiJob,
  mapApiOperatingLocation,
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

  test('maps the complete supported job, location and boundary contracts', () => {
    expect(mapApiOperatingLocation({
      id: 'location-1', name: 'Brisbane Base', address: '1 Airfield Rd', timezone: 'Australia/Brisbane',
      row_version: 2, created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-02T00:00:00Z',
    })).toEqual(expect.objectContaining({ id: 'location-1', name: 'Brisbane Base', timezone: 'Australia/Brisbane', rowVersion: 2 }));
    expect(mapApiJob({
      id: 'job-1', client_id: 'client-1', property_id: 'property-1', field_ids: ['field-1', 'field-2'],
      reference: 'JOB-42', scope: 'Spray lantana', status: 'scheduled', notes: 'Morning access',
      requested_date: '2026-08-08', scheduled_date: '2026-08-10', row_version: 3,
      created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-02T00:00:00Z',
    })).toEqual(expect.objectContaining({
      id: 'job-1', fieldIds: ['field-1', 'field-2'], reference: 'JOB-42', scope: 'Spray lantana',
      status: 'scheduled', notes: 'Morning access', requestedDate: '2026-08-08', scheduledDate: '2026-08-10', rowVersion: 3,
    }));
    expect(mapApiFieldBoundaryVersion({
      id: 'boundary-1', field_id: 'field-1', property_id: 'property-1', version_number: 2,
      boundary_geojson: { type: 'Polygon', coordinates: [[[153, -27], [154, -27], [154, -28], [153, -27]]] },
      field_version: 5, row_version: 1, created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z',
    })).toEqual(expect.objectContaining({ id: 'boundary-1', fieldId: 'field-1', versionNumber: 2, fieldVersion: 5 }));
  });

  test('sends every supported job value and boundary geometry to the trusted commands', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockImplementationOnce(() => jsonResponse(201, { data: {
        id: 'job-1', clientId: 'client-1', propertyId: 'property-1', fieldIds: ['field-1'], reference: 'JOB-42',
        scope: 'Spray lantana', status: 'scheduled', notes: 'Morning access', requestedDate: '2026-08-08', scheduledDate: '2026-08-10',
        rowVersion: 1, createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
      } }))
      .mockImplementationOnce(() => jsonResponse(201, { data: {
        id: 'boundary-1', fieldId: 'field-1', propertyId: 'property-1', versionNumber: 1,
        boundaryGeojson: { type: 'Polygon', coordinates: [[[153, -27], [154, -27], [154, -28], [153, -27]]] },
        fieldVersion: 4, rowVersion: 1, createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
      } }));
    const api = createOperationalApi();
    await api.jobs.create({
      clientId: 'client-1', propertyId: 'property-1', fieldIds: ['field-1'], reference: 'JOB-42', scope: 'Spray lantana',
      status: 'scheduled', notes: 'Morning access', requestedDate: '2026-08-08', scheduledDate: '2026-08-10',
    });
    await api.fieldBoundaryVersions.create({
      fieldId: 'field-1', propertyId: 'property-1', expectedFieldVersion: 3,
      boundaryGeojson: { type: 'Polygon', coordinates: [[[153, -27], [154, -27], [154, -28], [153, -27]]] },
    });
    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({ body: JSON.stringify({
      clientId: 'client-1', propertyId: 'property-1', fieldIds: ['field-1'], reference: 'JOB-42', scope: 'Spray lantana',
      status: 'scheduled', notes: 'Morning access', requestedDate: '2026-08-08', scheduledDate: '2026-08-10',
    }) }));
    expect(fetchMock.mock.calls[1]).toEqual(['/api/v1/field-boundary-versions', expect.objectContaining({
      method: 'POST', body: expect.stringContaining('"expectedFieldVersion":3'),
    })]);
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

  test('accepts a server-confirmed job archive record without the list-only fieldIds join', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(() => jsonResponse(200, { data: {
      id: 'job-1', clientId: 'client-1', propertyId: 'property-1', reference: 'JOB-42', scope: 'Spray lantana',
      status: 'archived', notes: '', rowVersion: 4,
      createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-02T00:00:00Z',
    } }));

    await expect(createOperationalApi().jobs.archive('job-1', 3)).resolves.toEqual(expect.objectContaining({
      id: 'job-1', reference: 'JOB-42', rowVersion: 4,
    }));
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
