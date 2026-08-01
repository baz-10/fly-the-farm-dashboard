const {
  createFieldBoundaryVersionHandler,
  createOperationalHandler,
} = require('../../server/operational-api');
const { OperationalRepository } = require('../../server/operational-repository');

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(statusCode) { this.statusCode = statusCode; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
  };
}

function request(method, body = {}, query = {}, headers = {}) {
  return {
    method,
    body,
    query,
    headers: { host: 'localhost:3001', origin: 'http://localhost:3001', ...headers },
  };
}

function context(overrides = {}) {
  return {
    user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'a@example.test', name: 'A' },
    organisation: { id: '11111111-1111-4111-8111-111111111111', name: 'Farm A' },
    internalUser: { id: '22222222-2222-4222-8222-222222222222', name: 'A' },
    roles: ['operator'],
    permissions: ['field_boundary_versions.read', 'field_boundary_versions.create', 'jobs.read', 'jobs.create', 'jobs.update', 'missions.create', 'missions.update'],
    operatingLocationIds: ['33333333-3333-4333-8333-333333333333'],
    entitlement: { tier: 'beta', seatActive: true, seatStatus: 'active' },
    ...overrides,
  };
}

const FIELD_ONE = '44444444-4444-4444-8444-444444444444';
const FIELD_TWO = '55555555-5555-4555-8555-555555555555';
const PROPERTY = '66666666-6666-4666-8666-666666666666';
const CLIENT = '77777777-7777-4777-8777-777777777777';
const JOB = '88888888-8888-4888-8888-888888888888';

describe('live-chain boundary, job, and mission API prerequisites', () => {
  test.each([
    [{ type: 'Point', coordinates: [153, -27] }, 'type'],
    [{ type: 'Polygon', coordinates: [[[153, -27], [154, -27], [154, -28], [153, -28]]] }, 'closed'],
    [{ type: 'MultiPolygon', coordinates: [] }, 'coordinates'],
  ])('rejects malformed boundary GeoJSON before trusted writes', async (boundaryGeojson, messageFragment) => {
    const repository = { createBoundaryVersion: jest.fn() };
    const handler = createFieldBoundaryVersionHandler({
      resolveContext: jest.fn().mockResolvedValue(context()),
      repository,
    });
    const res = createResponse();

    await handler(request('POST', {
      fieldId: FIELD_ONE,
      propertyId: PROPERTY,
      expectedFieldVersion: 1,
      boundaryGeojson,
    }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message.toLowerCase()).toContain(messageFragment);
    expect(repository.createBoundaryVersion).not.toHaveBeenCalled();
  });

  test('enforces the boundary payload byte limit before trusted writes', async () => {
    const repository = { createBoundaryVersion: jest.fn() };
    const handler = createFieldBoundaryVersionHandler({
      resolveContext: jest.fn().mockResolvedValue(context()),
      repository,
    });
    const res = createResponse();

    await handler(request('POST', {}, {}, { 'content-length': String(300 * 1024) }), res);

    expect(res.statusCode).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(repository.createBoundaryVersion).not.toHaveBeenCalled();
  });

  test('creates an immutable Polygon boundary version and returns the updated field version', async () => {
    const boundaryGeojson = { type: 'Polygon', coordinates: [[[153, -27], [154, -27], [154, -28], [153, -27]]] };
    const repository = {
      relationshipExists: jest.fn().mockResolvedValue(true),
      createBoundaryVersion: jest.fn().mockResolvedValue({ record: {
        id: '99999999-9999-4999-8999-999999999999', field_id: FIELD_ONE, property_id: PROPERTY,
        version_number: 2, boundary_geojson: boundaryGeojson, row_version: 1,
        created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z',
      }, fieldVersion: 4 }),
    };
    const handler = createFieldBoundaryVersionHandler({
      resolveContext: jest.fn().mockResolvedValue(context()),
      repository,
    });
    const res = createResponse();

    await handler(request('POST', {
      fieldId: FIELD_ONE,
      propertyId: PROPERTY,
      expectedFieldVersion: 3,
      boundaryGeojson,
      capturedAt: '2026-08-01T00:00:00Z',
    }), res);

    expect(res.statusCode).toBe(201);
    expect(res.body.data).toEqual(expect.objectContaining({ fieldId: FIELD_ONE, propertyId: PROPERTY, versionNumber: 2, boundaryGeojson, fieldVersion: 4 }));
    expect(repository.createBoundaryVersion).toHaveBeenCalledWith(expect.anything(), {
      fieldId: FIELD_ONE,
      propertyId: PROPERTY,
      expectedFieldVersion: 3,
      boundaryGeojson,
      capturedAt: '2026-08-01T00:00:00Z',
    });
  });

  test('requires a field or property filter when listing boundary versions', async () => {
    const repository = { listBoundaryVersions: jest.fn() };
    const handler = createFieldBoundaryVersionHandler({
      resolveContext: jest.fn().mockResolvedValue(context()),
      repository,
    });
    const res = createResponse();

    await handler(request('GET'), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(repository.listBoundaryVersions).not.toHaveBeenCalled();
  });

  test('accepts multiple field IDs and all supported job workflow fields', async () => {
    const repository = {
      relationshipExists: jest.fn().mockResolvedValue(true),
      create: jest.fn().mockResolvedValue({ record: {
        id: JOB, client_id: CLIENT, property_id: PROPERTY, reference: 'JOB-42', scope: 'Spray two paddocks',
        status: 'draft', notes: 'Client requested morning', requested_date: '2026-08-08', scheduled_date: '2026-08-10',
        field_ids: [FIELD_ONE, FIELD_TWO], row_version: 1,
        created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z',
      } }),
    };
    const handler = createOperationalHandler('jobs', {
      resolveContext: jest.fn().mockResolvedValue(context()),
      repository,
    });
    const res = createResponse();

    await handler(request('POST', {
      clientId: CLIENT,
      propertyId: PROPERTY,
      fieldIds: [FIELD_ONE, FIELD_TWO],
      reference: 'JOB-42',
      scope: 'Spray two paddocks',
      status: 'draft',
      notes: 'Client requested morning',
      requestedDate: '2026-08-08',
      scheduledDate: '2026-08-10',
    }), res);

    expect(res.statusCode).toBe(201);
    expect(res.body.data).toEqual(expect.objectContaining({
      fieldIds: [FIELD_ONE, FIELD_TWO], scope: 'Spray two paddocks', notes: 'Client requested morning',
      requestedDate: '2026-08-08', scheduledDate: '2026-08-10',
    }));
    expect(repository.relationshipExists).toHaveBeenCalledWith('fields', expect.anything(), FIELD_ONE, { property_id: PROPERTY });
    expect(repository.relationshipExists).toHaveBeenCalledWith('fields', expect.anything(), FIELD_TWO, { property_id: PROPERTY });
  });

  test('rejects empty or duplicate job field selections', async () => {
    for (const fieldIds of [[], [FIELD_ONE, FIELD_ONE]]) {
      const repository = { create: jest.fn() };
      const handler = createOperationalHandler('jobs', {
        resolveContext: jest.fn().mockResolvedValue(context()),
        repository,
      });
      const res = createResponse();

      await handler(request('POST', { clientId: CLIENT, propertyId: PROPERTY, fieldIds, reference: 'JOB-42' }), res);

      expect(res.statusCode).toBe(400);
      expect(repository.create).not.toHaveBeenCalled();
    }
  });

  test('joins active job field IDs into repository read responses', async () => {
    const originalFetch = global.fetch;
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    global.fetch = jest.fn(async (url) => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(String(url).includes('/job_fields?')
        ? [{ job_id: JOB, field_id: FIELD_ONE }, { job_id: JOB, field_id: FIELD_TWO }]
        : [{ id: JOB, organisation_id: '11111111-1111-4111-8111-111111111111', reference: 'JOB-42' }]),
    }));
    const repository = new OperationalRepository();

    const record = await repository.get('jobs', context(), JOB);

    expect(record.field_ids).toEqual([FIELD_ONE, FIELD_TWO]);
    expect(global.fetch.mock.calls.every(([url]) => String(url).includes('organisation_id=eq.11111111-1111-4111-8111-111111111111'))).toBe(true);
    global.fetch = originalFetch;
  });

  test('returns planning mission title and description without permitting approval', async () => {
    const repository = {
      relationshipExists: jest.fn().mockResolvedValue(true),
      create: jest.fn().mockResolvedValue({ record: {
        id: '99999999-9999-4999-8999-999999999999', job_id: JOB,
        operating_location_id: '33333333-3333-4333-8333-333333333333', mission_number: 'M-42',
        title: 'North paddock spray', description: 'Planning brief', status: 'planning',
        scheduled_start_at: '2026-08-10T06:00:00Z', row_version: 1,
        created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z',
      } }),
    };
    const handler = createOperationalHandler('missions', {
      resolveContext: jest.fn().mockResolvedValue(context()),
      repository,
    });
    const res = createResponse();

    await handler(request('POST', {
      jobId: JOB,
      operatingLocationId: '33333333-3333-4333-8333-333333333333',
      missionNumber: 'M-42',
      title: 'North paddock spray',
      description: 'Planning brief',
      scheduledStartAt: '2026-08-10T06:00:00Z',
      status: 'planning',
    }), res);

    expect(res.statusCode).toBe(201);
    expect(res.body.data).toEqual(expect.objectContaining({ title: 'North paddock spray', description: 'Planning brief', status: 'planning' }));

    const denied = createResponse();
    await handler(request('POST', {
      jobId: JOB,
      operatingLocationId: '33333333-3333-4333-8333-333333333333',
      missionNumber: 'M-43',
      title: 'Approval attempt',
      status: 'approved',
    }), denied);
    expect(denied.statusCode).toBe(400);
    expect(repository.create).toHaveBeenCalledTimes(1);
  });
});
