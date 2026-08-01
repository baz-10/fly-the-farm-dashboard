const { createFieldBoundaryVersionHandler, createOperationalHandler } = require('../../server/operational-api');
const { OperationalRepository } = require('../../server/operational-repository');
const { resolveRequestContext } = require('../../server/request-context');

function createResponse() {
  return {
    statusCode: 200, body: undefined, headers: {},
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; },
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
  };
}

function request(method, body = {}, query = {}) {
  return { method, body, query, headers: { host: 'localhost:3001', origin: 'http://localhost:3001' } };
}

function context(permissions) {
  return {
    user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    organisation: { id: '11111111-1111-4111-8111-111111111111', name: 'Farm A' },
    internalUser: { id: '22222222-2222-4222-8222-222222222222' },
    permissions,
    operatingLocationIds: [],
  };
}

describe('Task 4 review fixes at the API boundary', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  test('generic field writes cannot set the current boundary version pointer', async () => {
    const repository = { relationshipExists: jest.fn(), create: jest.fn() };
    const handler = createOperationalHandler('fields', {
      resolveContext: jest.fn().mockResolvedValue(context(['fields.create'])),
      repository,
    });
    const res = createResponse();

    await handler(request('POST', {
      propertyId: '33333333-3333-4333-8333-333333333333',
      fieldBoundaryVersionId: '44444444-4444-4444-8444-444444444444',
      name: 'Injected pointer',
    }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(repository.create).not.toHaveBeenCalled();
  });

  test.each(['2026-02-30', '2025-02-29', '2026-13-01'])('rejects impossible calendar date %s', async (requestedDate) => {
    const repository = { create: jest.fn() };
    const handler = createOperationalHandler('jobs', {
      resolveContext: jest.fn().mockResolvedValue(context(['jobs.create'])),
      repository,
    });
    const res = createResponse();

    await handler(request('POST', {
      clientId: '33333333-3333-4333-8333-333333333333',
      propertyId: '44444444-4444-4444-8444-444444444444',
      fieldIds: ['55555555-5555-4555-8555-555555555555'],
      reference: 'JOB-DATE', requestedDate,
    }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(repository.create).not.toHaveBeenCalled();
  });

  test('denies an active seat assignment ranked beyond the reduced allocation', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    global.fetch = jest.fn(async (url) => ({ ok: true, status: 200, text: async () => {
      if (url.endsWith('/auth/v1/user')) return JSON.stringify({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
      if (url.includes('/internal_users')) return JSON.stringify([{ id: '22222222-2222-4222-8222-222222222222', organisation_id: '11111111-1111-4111-8111-111111111111', display_name: 'Second seat' }]);
      if (url.includes('/memberships')) return JSON.stringify([{ id: '33333333-3333-4333-8333-333333333333', role_id: '44444444-4444-4444-8444-444444444444' }]);
      if (url.includes('/internal_user_seat_assignments') && url.includes('internal_user_id=eq.')) return JSON.stringify([{ id: '66666666-6666-4666-8666-666666666666', organisation_seat_allocation_id: '77777777-7777-4777-8777-777777777777', status: 'active', archived_at: null }]);
      if (url.includes('/internal_user_seat_assignments')) return JSON.stringify([
        { id: '55555555-5555-4555-8555-555555555555', internal_user_id: '99999999-9999-4999-8999-999999999999' },
        { id: '66666666-6666-4666-8666-666666666666', internal_user_id: '22222222-2222-4222-8222-222222222222' },
      ]);
      if (url.includes('/organisation_seat_allocations')) return JSON.stringify([{ id: '77777777-7777-4777-8777-777777777777', allocated_seats: 1 }]);
      if (url.includes('/roles')) return JSON.stringify([{ id: '44444444-4444-4444-8444-444444444444', code: 'operator' }]);
      if (url.includes('/role_permissions')) return JSON.stringify([]);
      if (url.includes('/organisations')) return JSON.stringify([{ id: '11111111-1111-4111-8111-111111111111', name: 'Farm A' }]);
      return JSON.stringify([]);
    } }));

    await expect(resolveRequestContext({ headers: { cookie: 'ftf_access_token=token' } }))
      .rejects.toMatchObject({ statusCode: 403, code: 'SEAT_CAP_EXCEEDED' });
  });

  test('boundary repository reads only through the trusted active-parent RPC', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => '[]' }));
    const repository = new OperationalRepository();

    await repository.getBoundaryVersion(context([]), '33333333-3333-4333-8333-333333333333');

    expect(global.fetch.mock.calls[0][0]).toContain('/rest/v1/rpc/ftf_read_field_boundary_versions');
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual(expect.objectContaining({
      p_organisation_id: '11111111-1111-4111-8111-111111111111',
      p_entity_id: '33333333-3333-4333-8333-333333333333',
    }));
  });

  test('a boundary hidden after context resolution is returned as not found', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => '[]' }));
    const handler = createFieldBoundaryVersionHandler({
      resolveContext: jest.fn().mockResolvedValue(context(['field_boundary_versions.read'])),
      repository: new OperationalRepository(),
    });
    const res = createResponse();

    await handler(request('GET', {}, { id: '33333333-3333-4333-8333-333333333333' }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
