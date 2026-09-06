const { createOperationalHandler } = require('../../server/operational-api');
const { OperationalRepository } = require('../../server/operational-repository');

const ORGANISATION = '11111111-1111-4111-8111-111111111111';
const ACTOR = '22222222-2222-4222-8222-222222222222';
const JOB = '33333333-3333-4333-8333-333333333333';
const FIELD_A = '44444444-4444-4444-8444-444444444444';
const FIELD_B = '55555555-5555-4555-8555-555555555555';
const PROPERTY_A = '66666666-6666-4666-8666-666666666666';
const PROPERTY_B = '77777777-7777-4777-8777-777777777777';
const CLIENT = '88888888-8888-4888-8888-888888888888';

function response() {
  return {
    statusCode: 200,
    body: undefined,
    status(statusCode) { this.statusCode = statusCode; return this; },
    json(body) { this.body = body; return this; },
    setHeader() {},
  };
}

function request(method, body) {
  return {
    method,
    body,
    query: { id: JOB },
    headers: { host: 'localhost:3001', origin: 'http://localhost:3001' },
  };
}

function createRequest(body) {
  return {
    method: 'POST',
    body,
    query: {},
    headers: { host: 'localhost:3001', origin: 'http://localhost:3001' },
  };
}

function context(permissions = ['jobs.write']) {
  return {
    organisation: { id: ORGANISATION, name: 'Farm A' },
    internalUser: { id: ACTOR, name: 'Operator' },
    permissions,
    operatingLocationIds: [],
    entitlement: { tier: 'beta', seatActive: true },
  };
}

function job() {
  return {
    id: JOB, client_id: CLIENT, property_id: PROPERTY_A, property_ids: [PROPERTY_A, PROPERTY_B],
    field_ids: [FIELD_A, FIELD_B], reference: 'JOB-42', scope: 'Spray', status: 'draft', notes: '',
    row_version: 4, created_at: '2026-09-04T00:00:00.000Z', updated_at: '2026-09-04T00:00:00.000Z',
  };
}

describe('checked multi-property Job scope API', () => {
  test('creates a Job from Fields across two Properties of the same Client', async () => {
    const created = job();
    const repository = {
      createJobWithScope: jest.fn().mockResolvedValue({ record: created }),
    };
    const handler = createOperationalHandler('jobs', {
      repository,
      resolveContext: jest.fn().mockResolvedValue(context(['jobs.create'])),
    });
    const res = response();

    await handler(createRequest({
      clientId: CLIENT,
      propertyId: PROPERTY_A,
      fieldIds: [FIELD_A, FIELD_B],
      reference: 'JOB-42',
      scope: 'Two Properties',
      status: 'open',
    }), res);

    expect(res.statusCode).toBe(201);
    expect(repository.createJobWithScope).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      client_id: CLIENT,
      property_id: PROPERTY_A,
      field_ids: [FIELD_A, FIELD_B],
    }));
    expect(res.body.data).toEqual(expect.objectContaining({
      fieldIds: [FIELD_A, FIELD_B], propertyIds: [PROPERTY_A, PROPERTY_B], propertyId: PROPERTY_A,
    }));
  });

  test('rejects a cross-Client Job scope without falling back to the generic writer', async () => {
    const repository = {
      createJobWithScope: jest.fn().mockResolvedValue({ error: 'JOB_SCOPE_CLIENT_MISMATCH' }),
      create: jest.fn(),
    };
    const handler = createOperationalHandler('jobs', {
      repository,
      resolveContext: jest.fn().mockResolvedValue(context(['jobs.create'])),
    });
    const res = response();

    await handler(createRequest({
      clientId: CLIENT, propertyId: PROPERTY_A, fieldIds: [FIELD_A, FIELD_B],
      reference: 'JOB-42', scope: 'Invalid scope', status: 'open',
    }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.error.code).toBe('JOB_SCOPE_CLIENT_MISMATCH');
    expect(repository.create).not.toHaveBeenCalled();
  });

  test('updates a Job with Fields from two Properties of one Client', async () => {
    const repository = { writeJobScope: jest.fn().mockResolvedValue({ record: job() }) };
    const handler = createOperationalHandler('jobs', { repository, resolveContext: jest.fn().mockResolvedValue(context()) });
    const res = response();

    await handler(request('PATCH', { expectedVersion: 3, fieldIds: [FIELD_A, FIELD_B] }), res);

    expect(repository.writeJobScope).toHaveBeenCalledWith(expect.anything(), JOB, 3, [FIELD_A, FIELD_B]);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual(expect.objectContaining({
      fieldIds: [FIELD_A, FIELD_B], propertyIds: [PROPERTY_A, PROPERTY_B], propertyId: PROPERTY_A,
    }));
  });

  test('accepts the dedicated jobs.write scope permission', async () => {
    const repository = { writeJobScope: jest.fn().mockResolvedValue({ record: job() }) };
    const handler = createOperationalHandler('jobs', {
      repository, resolveContext: jest.fn().mockResolvedValue(context(['jobs.write'])),
    });
    const res = response();

    await handler(request('PATCH', { expectedVersion: 3, fieldIds: [FIELD_A, FIELD_B] }), res);

    expect(res.statusCode).toBe(200);
    expect(repository.writeJobScope).toHaveBeenCalled();
  });

  test('rejects legacy jobs.update without calling the checked command', async () => {
    const repository = { writeJobScope: jest.fn() };
    const handler = createOperationalHandler('jobs', {
      repository, resolveContext: jest.fn().mockResolvedValue(context(['jobs.update'])),
    });
    const res = response();

    await handler(request('PATCH', { expectedVersion: 3, fieldIds: [FIELD_A, FIELD_B] }), res);

    expect(res.statusCode).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(repository.writeJobScope).not.toHaveBeenCalled();
  });

  test('fails closed when the checked RPC denies jobs.write', async () => {
    const repository = { writeJobScope: jest.fn().mockResolvedValue({ forbidden: true }) };
    const handler = createOperationalHandler('jobs', {
      repository, resolveContext: jest.fn().mockResolvedValue(context(['jobs.write'])),
    });
    const res = response();

    await handler(request('PATCH', { expectedVersion: 3, fieldIds: [FIELD_A, FIELD_B] }), res);

    expect(res.statusCode).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test.each([
    ['JOB_SCOPE_CLIENT_MISMATCH', 400],
    ['JOB_SCOPE_FIELD_DUPLICATE', 400],
    ['JOB_SCOPE_VERSION_CONFLICT', 409],
  ])('%s fails closed without partial mutation', async (error, statusCode) => {
    const repository = { writeJobScope: jest.fn().mockResolvedValue({ error }) };
    const handler = createOperationalHandler('jobs', { repository, resolveContext: jest.fn().mockResolvedValue(context()) });
    const res = response();

    await handler(request('PATCH', { expectedVersion: 3, fieldIds: [FIELD_A, FIELD_B] }), res);

    expect(res.statusCode).toBe(statusCode);
    expect(res.body.error.code).toBe(error);
    expect(repository.update).toBeUndefined();
  });

  test.each([
    [[], 'fieldIds must contain between 1 and 100 field IDs.'],
    [[FIELD_A, FIELD_A], 'fieldIds must not contain duplicates.'],
    [['not-a-uuid'], 'fieldIds must be a UUID.'],
  ])('rejects invalid browser scope input before the checked command', async (fieldIds, message) => {
    const repository = { writeJobScope: jest.fn() };
    const handler = createOperationalHandler('jobs', { repository, resolveContext: jest.fn().mockResolvedValue(context()) });
    const res = response();

    await handler(request('PATCH', { expectedVersion: 3, fieldIds }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error.message).toBe(message);
    expect(repository.writeJobScope).not.toHaveBeenCalled();
  });

  test('maps the checked RPC result from authoritative Field parents', async () => {
    const originalFetch = global.fetch;
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify({
      record: { ...job(), field_ids: [FIELD_A, FIELD_B] },
      fields: [{ id: FIELD_A, property_id: PROPERTY_A }, { id: FIELD_B, property_id: PROPERTY_B }],
    }) });

    const result = await new OperationalRepository().writeJobScope(context(), JOB, 3, [FIELD_A, FIELD_B]);

    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
      p_organisation_id: ORGANISATION, p_actor_internal_user_id: ACTOR, p_job_id: JOB,
      p_expected_version: 3, p_field_ids: [FIELD_A, FIELD_B],
    });
    expect(result.record).toEqual(expect.objectContaining({
      field_ids: [FIELD_A, FIELD_B], property_ids: [PROPERTY_A, PROPERTY_B], property_id: PROPERTY_A,
    }));
    global.fetch = originalFetch;
  });
});
