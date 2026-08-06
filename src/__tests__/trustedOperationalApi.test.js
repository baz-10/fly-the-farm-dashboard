const { createHttpError } = require('../../server/supabase');
const {
  createOperationalHandler,
  mapDatabaseRecord,
} = require('../../server/operational-api');
const { resolveRequestContext } = require('../../server/request-context');
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
    getHeader(name) { return this.headers[name.toLowerCase()]; },
  };
}

function request(method, body = {}, query = {}) {
  return {
    method,
    body,
    query,
    headers: { host: 'localhost:3001', origin: 'http://localhost:3001' },
  };
}

function context(overrides = {}) {
  return {
    user: { id: 'auth-user-a', email: 'a@example.test', name: 'A' },
    organisation: { id: '11111111-1111-4111-8111-111111111111', name: 'Farm A' },
    internalUser: { id: '22222222-2222-4222-8222-222222222222', name: 'A' },
    roles: ['operator'],
    permissions: ['clients.read', 'clients.create', 'clients.update', 'clients.archive', 'missions.create'],
    operatingLocationIds: [],
    entitlement: { tier: 'beta', seatActive: true },
    ...overrides,
  };
}

function handlerFor(resource, repository, resolvedContext = context()) {
  return createOperationalHandler(resource, {
    resolveContext: jest.fn().mockResolvedValue(resolvedContext),
    repository,
  });
}

describe('trusted organisation operational API', () => {
  test('passes the response to trusted context resolution so expired sessions can refresh cookies', async () => {
    const resolveContext = jest.fn().mockResolvedValue(context());
    const repository = { list: jest.fn().mockResolvedValue([]) };
    const handler = createOperationalHandler('clients', { resolveContext, repository });
    const req = request('GET');
    const res = createResponse();

    await handler(req, res);

    expect(resolveContext).toHaveBeenCalledWith(req, res);
  });

  test('returns a no-store unauthenticated envelope before any resource access', async () => {
    const repository = { list: jest.fn() };
    const handler = createOperationalHandler('clients', {
      resolveContext: jest.fn().mockRejectedValue(createHttpError(401, 'Authentication is required.')),
      repository,
    });
    const res = createResponse();

    await handler(request('GET'), res);

    expect(res.statusCode).toBe(401);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({ error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.' } });
    expect(repository.list).not.toHaveBeenCalled();
  });

  test('derives the organisation context from trusted membership records, not request input', async () => {
    const originalFetch = global.fetch;
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    global.fetch = jest.fn(async (url) => ({
      ok: true,
      status: 200,
      text: async () => {
        if (url.includes('/auth/v1/token?grant_type=refresh_token')) return JSON.stringify({
          access_token: 'refreshed-token', refresh_token: 'rotated-token', expires_in: 3600,
          user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'a@example.test' },
        });
        if (url.endsWith('/auth/v1/user')) return JSON.stringify({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'a@example.test' });
        if (url.includes('/internal_users')) return JSON.stringify([{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', organisation_id: '11111111-1111-4111-8111-111111111111', display_name: 'A' }]);
        if (url.includes('/memberships')) return JSON.stringify([{ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', role_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }]);
        if (url.includes('/internal_user_seat_assignments')) return JSON.stringify([{ organisation_seat_allocation_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', status: 'active', archived_at: null }]);
        if (url.includes('/organisation_seat_allocations')) return JSON.stringify([{ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', allocated_seats: 1 }]);
        if (url.includes('/membership_operating_location_assignments')) return JSON.stringify([]);
        if (url.includes('/roles')) return JSON.stringify([{ code: 'operator' }]);
        if (url.includes('/role_permissions')) return JSON.stringify([]);
        if (url.includes('/operating_locations')) return JSON.stringify([]);
        if (url.includes('/organisations')) return JSON.stringify([{ id: '11111111-1111-4111-8111-111111111111', name: 'Farm A' }]);
        if (url.includes('/ftf_profiles')) return JSON.stringify([{ tier: 'beta' }]);
        return JSON.stringify([]);
      },
    }));

    const refreshResponse = createResponse();
    const resolved = await resolveRequestContext({
      headers: { cookie: 'ftf_refresh_token=trusted-refresh-token' },
      query: { organisationId: '99999999-9999-4999-8999-999999999999' },
      body: { organisationId: '99999999-9999-4999-8999-999999999999', role: 'admin' },
    }, refreshResponse);

    expect(resolved.organisation.id).toBe('11111111-1111-4111-8111-111111111111');
    expect(resolved.roles).toEqual(['operator']);
    expect(refreshResponse.headers['set-cookie']).toEqual(expect.arrayContaining([
      expect.stringContaining('ftf_access_token=refreshed-token'),
      expect.stringContaining('ftf_refresh_token=rotated-token'),
    ]));
    expect(global.fetch.mock.calls.some(([url]) => String(url).includes('99999999-9999-4999-8999-999999999999'))).toBe(false);
    global.fetch = originalFetch;
  });

  test('selects an internal-user organisation only when that organisation has an active membership', async () => {
    const originalFetch = global.fetch;
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    global.fetch = jest.fn(async (url) => ({
      ok: true,
      status: 200,
      text: async () => {
        if (url.endsWith('/auth/v1/user')) return JSON.stringify({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
        if (url.includes('/internal_users')) return JSON.stringify([
          { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', organisation_id: '11111111-1111-4111-8111-111111111111', display_name: 'No membership' },
          { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', organisation_id: '22222222-2222-4222-8222-222222222222', display_name: 'Active member' },
        ]);
        if (url.includes('/memberships') && url.includes('11111111-1111-4111-8111-111111111111')) return JSON.stringify([]);
        if (url.includes('/memberships')) return JSON.stringify([{ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', role_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }]);
        if (url.includes('/internal_user_seat_assignments')) return JSON.stringify([{ organisation_seat_allocation_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', status: 'active', archived_at: null }]);
        if (url.includes('/organisation_seat_allocations')) return JSON.stringify([{ id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', allocated_seats: 1 }]);
        if (url.includes('/membership_operating_location_assignments')) return JSON.stringify([]);
        if (url.includes('/roles')) return JSON.stringify([{ code: 'operator' }]);
        if (url.includes('/role_permissions')) return JSON.stringify([]);
        if (url.includes('/organisations')) return JSON.stringify([{ id: '22222222-2222-4222-8222-222222222222', name: 'Farm B' }]);
        return JSON.stringify([]);
      },
    }));

    const resolved = await resolveRequestContext({ headers: { cookie: 'ftf_access_token=trusted-token' } });

    expect(resolved.organisation).toEqual({ id: '22222222-2222-4222-8222-222222222222', name: 'Farm B' });
    global.fetch = originalFetch;
  });

  test('does not grant permissions from archived roles or archived permissions', async () => {
    const originalFetch = global.fetch;
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    global.fetch = jest.fn(async (url) => ({
      ok: true,
      status: 200,
      text: async () => {
        if (url.endsWith('/auth/v1/user')) return JSON.stringify({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
        if (url.includes('/internal_users')) return JSON.stringify([{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', organisation_id: '11111111-1111-4111-8111-111111111111', display_name: 'A' }]);
        if (url.includes('/memberships')) return JSON.stringify([{ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', role_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }]);
        if (url.includes('/internal_user_seat_assignments')) return JSON.stringify([{ organisation_seat_allocation_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', status: 'active', archived_at: null }]);
        if (url.includes('/organisation_seat_allocations')) return JSON.stringify([{ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', allocated_seats: 1 }]);
        if (url.includes('/membership_operating_location_assignments')) return JSON.stringify([]);
        if (url.includes('/roles')) return JSON.stringify([{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', code: 'operator' }]);
        if (url.includes('/role_permissions')) return JSON.stringify([{ permissions: { code: 'clients.create', archived_at: '2026-01-01T00:00:00Z' } }]);
        if (url.includes('/organisations')) return JSON.stringify([{ id: '11111111-1111-4111-8111-111111111111', name: 'Farm A' }]);
        return JSON.stringify([]);
      },
    }));

    const resolved = await resolveRequestContext({ headers: { cookie: 'ftf_access_token=trusted-token' } });

    expect(resolved.permissions).toEqual([]);
    global.fetch = originalFetch;
  });

  test('rejects a cross-tenant property assignment before creating a job', async () => {
    const repository = {
      relationshipExists: jest.fn().mockResolvedValue(false),
      create: jest.fn(),
    };
    const res = createResponse();

    await handlerFor('jobs', repository, context({ permissions: ['jobs.create'] }))(request('POST', {
      clientId: '33333333-3333-4333-8333-333333333333',
      propertyId: '44444444-4444-4444-8444-444444444444',
      fieldIds: ['55555555-5555-4555-8555-555555555555'],
      reference: 'JOB-1',
    }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.error.code).toBe('RELATIONSHIP_CONFLICT');
    expect(repository.create).not.toHaveBeenCalled();
  });

  test('maps an RPC parent relationship race to a conflict response', async () => {
    const repository = {
      relationshipExists: jest.fn().mockResolvedValue(true),
      create: jest.fn().mockResolvedValue({ relationshipConflict: true }),
    };
    const res = createResponse();

    await handlerFor('properties', repository, context({ permissions: ['properties.create'] }))(request('POST', {
      clientId: '33333333-3333-4333-8333-333333333333',
      name: 'Race-safe property',
      state: 'NSW',
      address: '1 Farm Road', latitude: -27, longitude: 153, addressSource: 'GEOCODED', locationConfirmedAt: '2026-08-06T01:00:00.000Z',
    }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.error.code).toBe('RELATIONSHIP_CONFLICT');
  });

  test('accepts and maps authoritative Property address provenance', async () => {
    const repository = {
      relationshipExists: jest.fn().mockResolvedValue(true),
      create: jest.fn().mockResolvedValue({ record: {
        id: '55555555-5555-4555-8555-555555555555', client_id: '33333333-3333-4333-8333-333333333333',
        name: 'Geocoded property', state: 'QLD', address: '1 Queen Street', address_source: 'GEOCODED', row_version: 1,
      } }),
    };
    const res = createResponse();

    await handlerFor('properties', repository, context({ permissions: ['properties.create'] }))(request('POST', {
      clientId: '33333333-3333-4333-8333-333333333333', name: 'Geocoded property', state: 'QLD',
      address: '1 Queen Street', addressSource: 'GEOCODED', latitude: -27.4698, longitude: 153.0251, locationConfirmedAt: '2026-08-06T01:00:00.000Z',
    }), res);

    expect(res.statusCode).toBe(201);
    expect(repository.create).toHaveBeenCalledWith('properties', expect.any(Object), expect.objectContaining({ address_source: 'GEOCODED' }));
    expect(res.body.data.addressSource).toBe('GEOCODED');
  });

  test('rejects an unknown Property address source', async () => {
    const repository = { relationshipExists: jest.fn().mockResolvedValue(true), create: jest.fn() };
    const res = createResponse();

    await handlerFor('properties', repository, context({ permissions: ['properties.create'] }))(request('POST', {
      clientId: '33333333-3333-4333-8333-333333333333', name: 'Invalid source', state: 'QLD', addressSource: 'GUESSED',
    }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(repository.create).not.toHaveBeenCalled();
  });

  test('rejects Property coordinates that were not explicitly confirmed', async () => {
    const repository = { relationshipExists: jest.fn().mockResolvedValue(true), create: jest.fn() };
    const res = createResponse();
    await handlerFor('properties', repository, context({ permissions: ['properties.create'] }))(request('POST', {
      clientId: '33333333-3333-4333-8333-333333333333', name: 'Unconfirmed property', state: 'QLD',
      address: '1 Farm Road', latitude: -27, longitude: 153, addressSource: 'GEOCODED',
    }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('PROPERTY_LOCATION_CONFIRMATION_REQUIRED');
    expect(repository.create).not.toHaveBeenCalled();
  });

  test('returns the current version when an update loses the optimistic concurrency race', async () => {
    const repository = { get: jest.fn().mockResolvedValue({ id: '33333333-3333-4333-8333-333333333333', name: 'Old', row_version: 4 }), update: jest.fn().mockResolvedValue({ conflict: true, currentVersion: 5 }) };
    const res = createResponse();

    await handlerFor('clients', repository)(request('PATCH', {
      expectedVersion: 4,
      name: 'New',
    }, { id: '33333333-3333-4333-8333-333333333333' }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: { code: 'VERSION_CONFLICT', message: 'This record changed before your update.', meta: { currentVersion: 5 } } });
  });

  test('returns 404 when the record disappears after the pre-update read', async () => {
    const repository = { get: jest.fn().mockResolvedValue({ id: '33333333-3333-4333-8333-333333333333', name: 'Old', row_version: 4 }), update: jest.fn().mockResolvedValue({ notFound: true }) };
    const res = createResponse();

    await handlerFor('clients', repository)(request('PATCH', {
      expectedVersion: 4,
      name: 'New',
    }, { id: '33333333-3333-4333-8333-333333333333' }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  test('rejects a write whose origin matches host but not the trusted HTTPS origin', async () => {
    const repository = { create: jest.fn() };
    const req = request('POST', { name: 'Client A' });
    req.headers = { host: 'farm.example', origin: 'http://farm.example' };
    const res = createResponse();

    await handlerFor('clients', repository)(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body.error.code).toBe('SAME_ORIGIN_REQUIRED');
    expect(repository.create).not.toHaveBeenCalled();
  });

  test('rejects typed-invalid resource input with a 400 envelope', async () => {
    const repository = { create: jest.fn() };
    const res = createResponse();

    await handlerFor('clients', repository)(request('POST', { name: { value: 'Client A' } }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(repository.create).not.toHaveBeenCalled();
  });

  test('accepts confirmed authoritative Client locations and preserves provenance', async () => {
    const repository = { create: jest.fn().mockResolvedValue({ record: { id: '33333333-3333-4333-8333-333333333333', name: 'Client A', addresses: [], row_version: 1 } }) };
    const res = createResponse();
    const location = { label: 'Primary address', address: '1 Farm Road', locality: 'Roma', state: 'QLD', postcode: '4455', lat: -26.57, lng: 148.79, coordinateSource: 'MANUALLY_ADJUSTED', locationConfirmedAt: '2026-08-06T01:00:00.000Z' };
    await handlerFor('clients', repository)(request('POST', { name: 'Client A', addresses: [location] }), res);
    expect(res.statusCode).toBe(201);
    expect(repository.create).toHaveBeenCalledWith('clients', expect.anything(), expect.objectContaining({ addresses: [location] }));
  });

  test('rejects unconfirmed or placeholder-labelled Client locations', async () => {
    const repository = { create: jest.fn() };
    const res = createResponse();
    await handlerFor('clients', repository)(request('POST', { name: 'Client A', addresses: [{ label: 'Custom', lat: -26.57, lng: 148.79, coordinateSource: 'GEOCODED' }] }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(repository.create).not.toHaveBeenCalled();
  });

  test('maps and validates Australian property state at the trusted API boundary', async () => {
    const repository = {
      relationshipExists: jest.fn().mockResolvedValue(true),
      create: jest.fn().mockResolvedValue({ record: {
        id: '44444444-4444-4444-8444-444444444444',
        client_id: '33333333-3333-4333-8333-333333333333', name: 'Home Block', state: 'QLD',
        row_version: 1, created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z',
      } }),
    };
    const validResponse = createResponse();
    await handlerFor('properties', repository, context({ permissions: ['properties.create'] }))(request('POST', {
      clientId: '33333333-3333-4333-8333-333333333333', name: 'Home Block', state: 'QLD', lotPlan: 'LOT-7',
      address: '1 Farm Road', latitude: -27, longitude: 153, addressSource: 'GEOCODED', locationConfirmedAt: '2026-08-06T01:00:00.000Z',
    }), validResponse);
    expect(validResponse.statusCode).toBe(201);
    expect(validResponse.body.data.state).toBe('QLD');
    expect(repository.create).toHaveBeenCalledWith('properties', expect.anything(), expect.objectContaining({ state: 'QLD', lot_plan: 'LOT-7' }));

    const invalidResponse = createResponse();
    await handlerFor('properties', repository, context({ permissions: ['properties.create'] }))(request('POST', {
      clientId: '33333333-3333-4333-8333-333333333333', name: 'Home Block', state: 'XX',
    }), invalidResponse);
    expect(invalidResponse.statusCode).toBe(400);
    expect(invalidResponse.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('rejects a client archive while active properties remain', async () => {
    const repository = { hasActiveDependencies: jest.fn().mockResolvedValue(true), archive: jest.fn() };
    const res = createResponse();

    await handlerFor('clients', repository)(request('DELETE', { expectedVersion: 2 }, { id: '33333333-3333-4333-8333-333333333333' }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.error.code).toBe('ARCHIVE_CONFLICT');
    expect(repository.archive).not.toHaveBeenCalled();
  });

  test('acceptance role may create only controlled acceptance records', async () => {
    const repository = { create: jest.fn() };
    const res = createResponse();
    await handlerFor('clients', repository, context({
      roles: ['production_beta_acceptance'], permissions: ['clients.create'],
    }))(request('POST', { name: 'Genuine Fly The Farm Client' }), res);

    expect(res.statusCode).toBe(403);
    expect(res.body.error.code).toBe('ACCEPTANCE_RECORD_SCOPE_REQUIRED');
    expect(repository.create).not.toHaveBeenCalled();
  });

  test('acceptance role cannot archive a record created by another actor', async () => {
    const repository = {
      isAcceptanceRecordOwnedByActor: jest.fn().mockResolvedValue(false),
      hasActiveDependencies: jest.fn(), archive: jest.fn(),
    };
    const res = createResponse();
    await handlerFor('clients', repository, context({
      roles: ['production_beta_acceptance'], permissions: ['clients.archive'],
    }))(request('DELETE', { expectedVersion: 1 }, { id: '33333333-3333-4333-8333-333333333333' }), res);

    expect(res.statusCode).toBe(403);
    expect(res.body.error.code).toBe('ACCEPTANCE_ARCHIVE_SCOPE_FORBIDDEN');
    expect(repository.hasActiveDependencies).not.toHaveBeenCalled();
    expect(repository.archive).not.toHaveBeenCalled();
  });

  test('acceptance role archives its own controlled record through normal guards', async () => {
    const repository = {
      isAcceptanceRecordOwnedByActor: jest.fn().mockResolvedValue(true),
      hasActiveDependencies: jest.fn().mockResolvedValue(false),
      archive: jest.fn().mockResolvedValue({ record: { id: '33333333-3333-4333-8333-333333333333', name: 'SC ACCEPTANCE — old', row_version: 2 } }),
    };
    const res = createResponse();
    const acceptanceContext = context({ roles: ['production_beta_acceptance'], permissions: ['clients.archive'] });
    await handlerFor('clients', repository, acceptanceContext)(request('DELETE', { expectedVersion: 1 }, { id: '33333333-3333-4333-8333-333333333333' }), res);

    expect(res.statusCode).toBe(200);
    expect(repository.isAcceptanceRecordOwnedByActor).toHaveBeenCalledWith('clients', acceptanceContext, '33333333-3333-4333-8333-333333333333');
    expect(repository.archive).toHaveBeenCalled();
  });

  test('rejects authorised mission lifecycle states during planning writes', async () => {
    const repository = { create: jest.fn() };
    const res = createResponse();

    await handlerFor('missions', repository)(request('POST', {
      jobId: '33333333-3333-4333-8333-333333333333',
      operatingLocationId: '44444444-4444-4444-8444-444444444444',
      missionNumber: 'M-1',
      status: 'Approved',
    }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(repository.create).not.toHaveBeenCalled();
  });

  test('does not expose arbitrary financial JSON and denies unauthorised financial fields', async () => {
    const repository = { create: jest.fn() };
    const res = createResponse();

    await handlerFor('clients', repository)(request('POST', { name: 'Client A', financialPayload: { margin: 50 } }), res);

    expect(res.statusCode).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_FIELD');
    expect(repository.create).not.toHaveBeenCalled();
    expect(mapDatabaseRecord('missions', {
      id: '33333333-3333-4333-8333-333333333333',
      mission_number: 'M-1',
      status: 'planning',
      financial_payload: { margin: 50 },
      row_version: 1,
    })).toEqual({
      id: '33333333-3333-4333-8333-333333333333', missionNumber: 'M-1', status: 'planning', rowVersion: 1,
      aircraftIds: [], equipmentKitIds: [],
    });
  });

  test('returns a validation envelope for malformed JSON request bodies', async () => {
    const repository = { create: jest.fn() };
    const res = createResponse();

    await handlerFor('clients', repository)(request('POST', '{bad json'), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: { code: 'VALIDATION_ERROR', message: 'Request body must be valid JSON.' } });
    expect(repository.create).not.toHaveBeenCalled();
  });

  test('repository query paths always include the authenticated organisation filter', async () => {
    const originalFetch = global.fetch;
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => '[]' }));
    const repository = new OperationalRepository();

    await repository.list('clients', context());

    expect(global.fetch.mock.calls[0][0]).toContain('organisation_id=eq.11111111-1111-4111-8111-111111111111');
    global.fetch = originalFetch;
  });

  test('uses tenant-filtered repository lookups for mission operating locations and field boundary versions', async () => {
    const originalFetch = global.fetch;
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => '[]' }));
    const repository = new OperationalRepository();

    await repository.relationshipExists('operating_locations', context(), '33333333-3333-4333-8333-333333333333');
    await repository.relationshipExists('field_boundary_versions', context(), '44444444-4444-4444-8444-444444444444');

    expect(global.fetch.mock.calls.every(([url]) => String(url).includes('organisation_id=eq.11111111-1111-4111-8111-111111111111'))).toBe(true);
    global.fetch = originalFetch;
  });
});
