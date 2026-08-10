const { createHttpError } = require('../../server/supabase');
const { createOperationalHandler } = require('../../server/operational-api');
const { resolveRequestContext } = require('../../server/request-context');

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
    user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'a@example.test', name: 'A' },
    organisation: { id: '11111111-1111-4111-8111-111111111111', name: 'Farm A' },
    internalUser: { id: '22222222-2222-4222-8222-222222222222', name: 'A' },
    roles: ['operator'],
    permissions: ['operating_locations.read', 'operating_locations.create', 'missions.read', 'missions.create'],
    operatingLocationIds: ['33333333-3333-4333-8333-333333333333'],
    entitlement: { tier: 'beta', seatActive: true, seatStatus: 'active' },
    ...overrides,
  };
}

function installContextFetch({ seatStatus = 'active', includeSeat = true, locationArchived = false } = {}) {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  global.fetch = jest.fn(async (url) => ({
    ok: true,
    status: 200,
    text: async () => {
      if (url.endsWith('/auth/v1/user')) return JSON.stringify({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'a@example.test' });
      if (url.includes('/internal_users')) return JSON.stringify([{ id: '22222222-2222-4222-8222-222222222222', organisation_id: '11111111-1111-4111-8111-111111111111', display_name: 'A' }]);
      if (url.includes('/memberships')) return JSON.stringify([{ id: '44444444-4444-4444-8444-444444444444', role_id: '55555555-5555-4555-8555-555555555555' }]);
      if (url.includes('/internal_user_seat_assignments')) return JSON.stringify(includeSeat ? [{ id: '66666666-6666-4666-8666-666666666666', organisation_seat_allocation_id: '77777777-7777-4777-8777-777777777777', status: seatStatus, archived_at: seatStatus === 'revoked' ? '2026-08-01T00:00:00Z' : null }] : []);
      if (url.includes('/organisation_seat_allocations')) return JSON.stringify([{ id: '77777777-7777-4777-8777-777777777777', allocated_seats: 1 }]);
      if (url.includes('/membership_operating_location_assignments')) return JSON.stringify([{ operating_location_id: '33333333-3333-4333-8333-333333333333' }]);
      if (url.includes('/operating_locations')) return JSON.stringify(locationArchived ? [] : [{ id: '33333333-3333-4333-8333-333333333333' }]);
      if (url.includes('/roles')) return JSON.stringify([{ id: '55555555-5555-4555-8555-555555555555', code: 'operator' }]);
      if (url.includes('/role_permissions')) return JSON.stringify([]);
      if (url.includes('/organisations')) return JSON.stringify([{ id: '11111111-1111-4111-8111-111111111111', name: 'Farm A' }]);
      if (url.includes('/ftf_profiles')) return JSON.stringify([{ tier: 'beta' }]);
      return JSON.stringify([]);
    },
  }));
}

describe('live-chain access prerequisites', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('returns active assigned operating locations and seat state from trusted session context', async () => {
    installContextFetch();

    const resolved = await resolveRequestContext({ headers: { cookie: 'ftf_access_token=trusted-token' } });

    expect(resolved.operatingLocationIds).toEqual(['33333333-3333-4333-8333-333333333333']);
    expect(resolved.entitlement).toEqual({ tier: 'beta', seatActive: true, seatStatus: 'active' });
  });

  test.each([
    ['inactive', true, 'Your Fly the Farm seat is inactive.'],
    ['revoked', true, 'Your Fly the Farm seat is revoked.'],
    ['migration-required', false, 'Your Fly the Farm seat assignment requires migration.'],
  ])('default-denies operational context for %s seat state', async (seatStatus, includeSeat, message) => {
    installContextFetch({ seatStatus, includeSeat });

    await expect(resolveRequestContext({ headers: { cookie: 'ftf_access_token=trusted-token' } }))
      .rejects.toMatchObject({ statusCode: 403, code: includeSeat ? 'SEAT_INACTIVE' : 'SEAT_MIGRATION_REQUIRED', publicMessage: message });
  });

  test('filters archived locations out of assigned session scope', async () => {
    installContextFetch({ locationArchived: true });

    const resolved = await resolveRequestContext({ headers: { cookie: 'ftf_access_token=trusted-token' } });

    expect(resolved.operatingLocationIds).toEqual([]);
  });

  test('lists and creates operating locations in the server-derived organisation', async () => {
    const repository = {
      list: jest.fn().mockResolvedValue([{ id: '33333333-3333-4333-8333-333333333333', name: 'Base', address: '1 Airstrip Rd', timezone: 'Australia/Brisbane', row_version: 1 }]),
      create: jest.fn().mockResolvedValue({ record: { id: '33333333-3333-4333-8333-333333333333', name: 'Base', address: '1 Airstrip Rd', timezone: 'Australia/Brisbane', row_version: 1 } }),
    };
    const handler = createOperationalHandler('operating_locations', {
      resolveContext: jest.fn().mockResolvedValue(context()),
      repository,
    });
    const listResponse = createResponse();
    const createResponseValue = createResponse();

    await handler(request('GET', {}, { organisationId: '99999999-9999-4999-8999-999999999999' }), listResponse);
    await handler(request('POST', { name: 'Base', address: '1 Airstrip Rd', timezone: 'Australia/Brisbane' }), createResponseValue);

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.body.data[0]).toEqual(expect.objectContaining({ name: 'Base', timezone: 'Australia/Brisbane', rowVersion: 1 }));
    expect(createResponseValue.statusCode).toBe(201);
    expect(repository.create).toHaveBeenCalledWith('operating_locations', expect.objectContaining({ organisation: { id: '11111111-1111-4111-8111-111111111111', name: 'Farm A' } }), {
      name: 'Base', address: '1 Airstrip Rd', timezone: 'Australia/Brisbane',
    });
  });

  test('updates only an assigned Base with confirmed location evidence and optimistic concurrency', async () => {
    const repository = {
      get: jest.fn().mockResolvedValue({
        id: '33333333-3333-4333-8333-333333333333', organisation_id: '11111111-1111-4111-8111-111111111111',
        name: 'Base', address: '', timezone: 'Australia/Brisbane', row_version: 2,
      }),
      update: jest.fn().mockResolvedValue({ record: {
        id: '33333333-3333-4333-8333-333333333333', name: 'Base', address: '1 Airstrip Road',
        timezone: 'Australia/Brisbane', latitude: -27.1817, longitude: 151.2621,
        address_source: 'ADDRESS_SEARCH', location_confirmed_at: '2026-08-09T00:00:00.000Z', row_version: 3,
      } }),
    };
    const handler = createOperationalHandler('operating_locations', {
      resolveContext: jest.fn().mockResolvedValue(context({
        permissions: ['operating_locations.update'],
      })),
      repository,
    });
    const res = createResponse();

    await handler(request('PATCH', {
      expectedVersion: 2,
      name: 'Base', address: '1 Airstrip Road', timezone: 'Australia/Brisbane',
      latitude: -27.1817, longitude: 151.2621, addressSource: 'ADDRESS_SEARCH',
      locationConfirmed: true, locationConfirmedAt: '2026-08-09T00:00:00.000Z',
    }, { id: '33333333-3333-4333-8333-333333333333' }), res);

    expect(res.statusCode).toBe(200);
    expect(repository.update).toHaveBeenCalledWith('operating_locations', expect.any(Object),
      '33333333-3333-4333-8333-333333333333', 2, expect.objectContaining({
        address: '1 Airstrip Road', latitude: -27.1817, longitude: 151.2621,
        address_source: 'ADDRESS_SEARCH', location_confirmed_at: '2026-08-09T00:00:00.000Z',
      }));
    expect(res.body.data).toEqual(expect.objectContaining({
      latitude: -27.1817, longitude: 151.2621, addressSource: 'ADDRESS_SEARCH', rowVersion: 3,
    }));
  });

  test('fails closed before updating an unassigned Base', async () => {
    const repository = {
      get: jest.fn().mockResolvedValue({
        id: '99999999-9999-4999-8999-999999999999', organisation_id: '11111111-1111-4111-8111-111111111111',
        name: 'Other Base', address: '', timezone: 'Australia/Brisbane', row_version: 1,
      }),
      update: jest.fn(),
    };
    const handler = createOperationalHandler('operating_locations', {
      resolveContext: jest.fn().mockResolvedValue(context({ permissions: ['operating_locations.update'] })), repository,
    });
    const res = createResponse();

    await handler(request('PATCH', {
      expectedVersion: 1, name: 'Other Base', address: '2 Airstrip Road', timezone: 'Australia/Brisbane',
      latitude: -27, longitude: 151, addressSource: 'ADDRESS_SEARCH', locationConfirmed: true,
      locationConfirmedAt: '2026-08-09T00:00:00.000Z',
    }, { id: '99999999-9999-4999-8999-999999999999' }), res);

    expect(res.statusCode).toBe(404);
    expect(repository.update).not.toHaveBeenCalled();
  });

  test('invalidates stale Base coordinates when an authoritative address changes without new location evidence', async () => {
    const repository = {
      get: jest.fn().mockResolvedValue({
        id: '33333333-3333-4333-8333-333333333333', organisation_id: '11111111-1111-4111-8111-111111111111',
        name: 'Base', address: '1 Old Airstrip Road', timezone: 'Australia/Brisbane', latitude: -27.1817,
        longitude: 151.2621, address_source: 'ADDRESS_SEARCH', location_confirmed_at: '2026-08-09T00:00:00.000Z', row_version: 3,
      }),
      update: jest.fn().mockResolvedValue({ record: {
        id: '33333333-3333-4333-8333-333333333333', name: 'Base', address: '2 New Airstrip Road',
        timezone: 'Australia/Brisbane', latitude: null, longitude: null, address_source: null,
        location_confirmed_at: null, row_version: 4,
      } }),
    };
    const handler = createOperationalHandler('operating_locations', {
      resolveContext: jest.fn().mockResolvedValue(context({ permissions: ['operating_locations.update'] })), repository,
    });
    const res = createResponse();

    await handler(request('PATCH', {
      expectedVersion: 3, address: '2 New Airstrip Road',
    }, { id: '33333333-3333-4333-8333-333333333333' }), res);

    expect(res.statusCode).toBe(200);
    expect(repository.update).toHaveBeenCalledWith('operating_locations', expect.any(Object),
      '33333333-3333-4333-8333-333333333333', 3, expect.objectContaining({
        address: '2 New Airstrip Road', latitude: null, longitude: null,
        address_source: null, location_confirmed_at: null,
      }));
  });

  test('rejects a mission outside the actor assigned location before repository access', async () => {
    const repository = { relationshipExists: jest.fn(), create: jest.fn() };
    const handler = createOperationalHandler('missions', {
      resolveContext: jest.fn().mockResolvedValue(context()),
      repository,
    });
    const res = createResponse();

    await handler(request('POST', {
      jobId: '88888888-8888-4888-8888-888888888888',
      operatingLocationId: '99999999-9999-4999-8999-999999999999',
      missionNumber: 'M-1',
    }), res);

    expect(res.statusCode).toBe(403);
    expect(res.body.error.code).toBe('LOCATION_FORBIDDEN');
    expect(repository.relationshipExists).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  test.each([
    ['operating_locations',
      [{ id: '33333333-3333-4333-8333-333333333333', name: 'Assigned' }, { id: '99999999-9999-4999-8999-999999999999', name: 'Other' }]],
    ['missions', [
      { id: '77777777-7777-4777-8777-777777777777', operating_location_id: '33333333-3333-4333-8333-333333333333' },
      { id: '88888888-8888-4888-8888-888888888888', operating_location_id: '99999999-9999-4999-8999-999999999999' },
    ]],
  ])('filters %s list reads to assigned operating locations', async (resource, records) => {
    const repository = { list: jest.fn().mockResolvedValue(records) };
    const handler = createOperationalHandler(resource, {
      resolveContext: jest.fn().mockResolvedValue(context()), repository,
    });
    const res = createResponse();

    await handler(request('GET'), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(records[0].id);
  });

  test.each([
    ['operating_locations', { id: '99999999-9999-4999-8999-999999999999', name: 'Other' }],
    ['missions', { id: '88888888-8888-4888-8888-888888888888', operating_location_id: '99999999-9999-4999-8999-999999999999' }],
  ])('returns 404 for a cross-location %s detail read', async (resource, record) => {
    const repository = { get: jest.fn().mockResolvedValue(record) };
    const handler = createOperationalHandler(resource, {
      resolveContext: jest.fn().mockResolvedValue(context()), repository,
    });
    const res = createResponse();

    await handler(request('GET', {}, { id: record.id }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  test('archives a mission only after loading it through assigned-location scope', async () => {
    const missionId = '77777777-7777-4777-8777-777777777777';
    const repository = {
      get: jest.fn().mockResolvedValue({
        id: missionId,
        operating_location_id: '33333333-3333-4333-8333-333333333333',
        mission_number: 'M-ASSIGNED',
        status: 'planning',
        row_version: 1,
      }),
      hasActiveDependencies: jest.fn().mockResolvedValue(false),
      archive: jest.fn().mockResolvedValue({ record: {
        id: missionId,
        operating_location_id: '33333333-3333-4333-8333-333333333333',
        mission_number: 'M-ASSIGNED',
        status: 'planning',
        row_version: 2,
      } }),
    };
    const handler = createOperationalHandler('missions', {
      resolveContext: jest.fn().mockResolvedValue(context({
        permissions: ['missions.archive'],
      })),
      repository,
    });
    const res = createResponse();

    await handler(request('DELETE', { expectedVersion: 1 }, { id: missionId }), res);

    expect(res.statusCode).toBe(200);
    expect(repository.get).toHaveBeenCalledWith('missions', expect.any(Object), missionId);
    expect(repository.hasActiveDependencies).toHaveBeenCalledWith('missions', expect.any(Object), missionId);
    expect(repository.archive).toHaveBeenCalledWith('missions', expect.any(Object), missionId, 1);
  });

  test('returns 404 before dependency or archive writes for an unassigned mission', async () => {
    const missionId = '88888888-8888-4888-8888-888888888888';
    const repository = {
      get: jest.fn().mockResolvedValue(null),
      hasActiveDependencies: jest.fn(),
      archive: jest.fn(),
    };
    const handler = createOperationalHandler('missions', {
      resolveContext: jest.fn().mockResolvedValue(context({
        permissions: ['missions.archive'],
      })),
      repository,
    });
    const res = createResponse();

    await handler(request('DELETE', { expectedVersion: 1 }, { id: missionId }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(repository.get).toHaveBeenCalledWith('missions', expect.any(Object), missionId);
    expect(repository.hasActiveDependencies).not.toHaveBeenCalled();
    expect(repository.archive).not.toHaveBeenCalled();
  });

  test('keeps seat-denied errors distinct in API envelopes', async () => {
    const handler = createOperationalHandler('operating_locations', {
      resolveContext: jest.fn().mockRejectedValue(Object.assign(createHttpError(403, 'Your Fly the Farm seat is revoked.'), { code: 'SEAT_INACTIVE' })),
      repository: { list: jest.fn() },
    });
    const res = createResponse();

    await handler(request('GET'), res);

    expect(res.body).toEqual({ error: { code: 'SEAT_INACTIVE', message: 'Your Fly the Farm seat is revoked.' } });
  });
});
