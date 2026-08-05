import {
  OperationalApiError,
  createOperationalApi,
  mapApiClient,
  mapApiField,
  mapApiFieldBoundaryVersion,
  mapApiJob,
  mapApiMission,
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

  test('maps authoritative Client locations and provenance', () => {
    const record = mapApiClient({
      id: 'client-1', name: 'North Farm', row_version: 1,
      addresses: [{ label: 'Northern gate', address: '1 Farm Rd', locality: 'Roma', state: 'QLD', postcode: '4455', lat: -26.57, lng: 148.79, coordinateSource: 'MANUALLY_ADJUSTED', locationConfirmedAt: '2026-08-06T00:00:00Z' }],
      created_at: '2026-08-06T00:00:00Z', updated_at: '2026-08-06T00:00:00Z',
    });
    expect(record.addresses?.[0]).toEqual(expect.objectContaining({ label: 'Northern gate', coordinateSource: 'MANUALLY_ADJUSTED', lat: -26.57, lng: 148.79 }));
  });

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
      state: 'QLD', address_source: 'GEOCODED', latitude: '-27.4698', longitude: '153.0251',
      row_version: 2, created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-02T00:00:00Z',
    })).toEqual(expect.objectContaining({
      id: 'property-1', clientId: 'client-1', name: 'Home Block', address: '1 Farm Rd',
      state: 'QLD', locality: '', lotPlan: '', notes: '', addressSource: 'GEOCODED',
      lat: -27.4698, lng: 153.0251, rowVersion: 2,
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
        id: 'property-1', clientId: 'client-1', name: 'Home Block', address: '1 Farm Rd', state: 'QLD', addressSource: 'GEOCODED',
        rowVersion: 1, createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
      },
    }));
    const property = await createOperationalApi().properties.create({
      clientId: 'client-1', name: 'Home Block', address: '1 Farm Rd', state: 'QLD',
      locality: '', lotPlan: '', notes: '', addressSource: 'GEOCODED',
    });
    expect(property.state).toBe('QLD');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/properties', expect.objectContaining({
      body: JSON.stringify({ clientId: 'client-1', name: 'Home Block', address: '1 Farm Rd', state: 'QLD', addressSource: 'GEOCODED' }),
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

  test('sends server-authoritative automatic Job and Mission reference commands', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockImplementationOnce(() => jsonResponse(201, { data: {
        id: 'job-1', clientId: 'client-1', propertyId: 'property-1', fieldIds: ['field-1'], reference: 'FTF-JOB-000001',
        scope: 'Spray', status: 'open', notes: '', rowVersion: 1,
        createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
      } }))
      .mockImplementationOnce(() => jsonResponse(201, { data: {
        id: 'mission-1', jobId: 'job-1', operatingLocationId: 'location-1', missionNumber: 'FTF-MIS-000001',
        title: 'Spray', description: '', status: 'planning', scheduledStartAt: null, rowVersion: 1,
        createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
      } }));
    const api = createOperationalApi();
    await api.jobs.create({ clientId: 'client-1', propertyId: 'property-1', fieldIds: ['field-1'], autoGenerateReference: true, scope: 'Spray', status: 'open', notes: '' });
    await api.missions.create({ jobId: 'job-1', operatingLocationId: 'location-1', autoGenerateReference: true, title: 'Spray', description: '', status: 'Planning' });
    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({ body: expect.stringContaining('"autoGenerateReference":true') }));
    expect(fetchMock.mock.calls[1][1]).toEqual(expect.objectContaining({ body: expect.stringContaining('"autoGenerateReference":true') }));
  });

  test('maps complete authoritative mission metadata and normalises the only supported lifecycle state', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(() => jsonResponse(200, {
      data: [{
        id: 'mission-1', job_id: 'job-1', operating_location_id: 'location-1', mission_number: 'MSN-001',
        title: 'North block spray', description: 'Treat lantana along the creek', status: 'planning',
        scheduled_start_at: '2026-08-10T08:30:00Z', row_version: 3,
        created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-02T00:00:00Z',
      }],
      pagination: { page: 1, pageSize: 100 },
    }));

    await expect(createOperationalApi().missions.list()).resolves.toEqual(expect.objectContaining({
      records: [expect.objectContaining({
        id: 'mission-1', jobId: 'job-1', operatingLocationId: 'location-1', missionNumber: 'MSN-001',
        title: 'North block spray', description: 'Treat lantana along the creek', status: 'Planning',
        scheduledStartAt: '2026-08-10T08:30:00Z', rowVersion: 3,
      })],
    }));
  });

  test('maps completed Missions as read-only lifecycle records for historical review', () => {
    expect(mapApiMission({
      id: 'mission-1', job_id: 'job-1', operating_location_id: 'location-1', mission_number: 'MSN-001',
      title: 'Completed spray', description: 'Authoritative history', status: 'completed',
      scheduled_start_at: '2026-08-10T08:30:00Z', row_version: 4,
      created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-10T12:00:00Z',
    })).toEqual(expect.objectContaining({ id: 'mission-1', status: 'Completed', rowVersion: 4 }));
  });

  test('sends only supported mission metadata and forces the trusted Planning status spelling', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(() => jsonResponse(201, { data: {
      id: 'mission-1', jobId: 'job-1', operatingLocationId: 'location-1', missionNumber: 'MSN-001',
      title: 'North block spray', description: 'Treat lantana', status: 'planning',
      scheduledStartAt: '2026-08-10T08:30:00Z', rowVersion: 1,
      createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
    } }));

    await createOperationalApi().missions.create({
      jobId: 'job-1', operatingLocationId: 'location-1', missionNumber: 'MSN-001',
      title: 'North block spray', description: 'Treat lantana', status: 'Planning',
      scheduledStartAt: '2026-08-10T08:30:00Z',
    } as any);

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/missions', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        jobId: 'job-1', operatingLocationId: 'location-1', missionNumber: 'MSN-001',
        title: 'North block spray', description: 'Treat lantana', status: 'planning',
        scheduledStartAt: '2026-08-10T08:30:00Z',
      }),
    }));
  });

  test('rejects non-Planning mission responses and mutations before they enter frontend state', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(() => jsonResponse(200, { data: [{
      id: 'mission-1', jobId: 'job-1', operatingLocationId: 'location-1', missionNumber: 'MSN-001',
      title: 'Unsafe state', description: '', status: 'Approved', rowVersion: 1,
      createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
    }], pagination: { page: 1, pageSize: 100 } }));
    const api = createOperationalApi();

    await expect(api.missions.list()).rejects.toEqual(expect.objectContaining({ code: 'MALFORMED_RESPONSE' }));
    fetchMock.mockClear();
    await expect(api.missions.create({
      jobId: 'job-1', operatingLocationId: 'location-1', missionNumber: 'MSN-002',
      title: 'Unsafe create', description: '', status: 'Approved',
    } as any)).rejects.toEqual(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('preserves an unscheduled mission as null and sends null when the optional schedule is cleared', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockImplementationOnce(() => jsonResponse(200, { data: {
        id: 'mission-1', jobId: 'job-1', operatingLocationId: 'location-1', missionNumber: 'MSN-001',
        title: 'Unscheduled mission', description: '', status: 'planning', scheduledStartAt: null,
        rowVersion: 2, createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
      } }))
      .mockImplementationOnce(() => jsonResponse(200, { data: {
        id: 'mission-1', jobId: 'job-1', operatingLocationId: 'location-1', missionNumber: 'MSN-001',
        title: 'Unscheduled mission', description: '', status: 'planning', scheduledStartAt: null,
        rowVersion: 3, createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-02T00:00:00Z',
      } }));
    const api = createOperationalApi();

    await expect(api.missions.get('mission-1')).resolves.toEqual(expect.objectContaining({ scheduledStartAt: null }));
    await api.missions.update('mission-1', { scheduledStartAt: null }, 2);
    expect(fetchMock.mock.calls[1][1]).toEqual(expect.objectContaining({
      body: JSON.stringify({ scheduledStartAt: null, expectedVersion: 2 }),
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
      name: 'North Farm', contactName: 'Pat Smith', phone: '0400000000', email: 'ops@example.com', notes: 'private note',
      addresses: [], contractorUserId: 'browser-user-id',
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/clients', expect.objectContaining({
      method: 'POST', credentials: 'same-origin', body: JSON.stringify({
        name: 'North Farm', contactName: 'Pat Smith', contactEmail: 'ops@example.com', contactPhone: '0400000000', notes: 'private note',
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
