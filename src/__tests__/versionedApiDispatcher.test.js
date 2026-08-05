const { createHttpError } = require('../../server/supabase');
const { createOperationalHandler } = require('../../server/operational-api');

function loadDispatcherModule() {
  return require('../../server/operational-dispatcher');
}

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

function request(resource, method = 'GET', body = {}, query = {}) {
  return {
    method,
    body,
    query: { ...query, resource },
    headers: { host: 'localhost:3001', origin: 'http://localhost:3001' },
  };
}

function context(overrides = {}) {
  return {
    user: { id: 'auth-user-a', email: 'a@example.test', name: 'A' },
    organisation: { id: '11111111-1111-4111-8111-111111111111', name: 'Farm A' },
    internalUser: { id: '22222222-2222-4222-8222-222222222222', name: 'A' },
    roles: ['operator'],
    permissions: ['clients.read', 'clients.create'],
    operatingLocationIds: [],
    entitlement: { tier: 'beta', seatActive: true },
    ...overrides,
  };
}

describe('v1 operational API dispatcher', () => {
  test('loads the dynamic v1 entrypoint without changing the public route contract', () => {
    expect(() => loadDispatcherModule()).not.toThrow();
    expect(() => require('../../api/v1/[resource].js')).not.toThrow();
  });

  test('retains a safe request reference as the response correlation ID', async () => {
    const { createVersionedApiDispatcher } = loadDispatcherModule();
    const dispatcher = createVersionedApiDispatcher({ clients: jest.fn(async (_req, res) => res.status(204).end()) });
    const req = request('clients');
    req.headers['x-request-id'] = 'property-save-reference';
    const res = createResponse();
    await dispatcher(req, res);
    expect(req.correlationId).toBe('property-save-reference');
    expect(res.headers['x-correlation-id']).toBe('property-save-reference');
  });

  test.each([
    'clients',
    'properties',
    'fields',
    'jobs',
    'missions',
    'aircraft',
    'operating-locations',
    'field-boundary-versions',
    'session',
  ])('dispatches /api/v1/%s to exactly its registered handler', async (resource) => {
    const { createVersionedApiDispatcher } = loadDispatcherModule();
    const expectedHandler = jest.fn(async (_req, res) => res.status(204).end());
    const otherHandler = jest.fn();
    const dispatcher = createVersionedApiDispatcher({
      [resource]: expectedHandler,
      other: otherHandler,
    });
    const req = request(resource);
    const res = createResponse();

    await dispatcher(req, res);

    expect(res.statusCode).toBe(204);
    expect(expectedHandler).toHaveBeenCalledWith(req, res);
    expect(otherHandler).not.toHaveBeenCalled();
  });

  test.each([undefined, '', 'unknown', ['clients', 'properties']])(
    'returns a no-store v1 not-found envelope for unsupported resource %p',
    async (resource) => {
      const { createVersionedApiDispatcher } = loadDispatcherModule();
      const registeredHandler = jest.fn();
      const dispatcher = createVersionedApiDispatcher({ clients: registeredHandler });
      const res = createResponse();

      await dispatcher(request(resource), res);

      expect(res.statusCode).toBe(404);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'API endpoint not found.' } });
      expect(registeredHandler).not.toHaveBeenCalled();
    }
  );

  test('preserves authentication errors from the existing domain handler', async () => {
    const { createVersionedApiDispatcher } = loadDispatcherModule();
    const repository = { list: jest.fn() };
    const clientsHandler = createOperationalHandler('clients', {
      resolveContext: jest.fn().mockRejectedValue(createHttpError(401, 'Authentication is required.')),
      repository,
    });
    const dispatcher = createVersionedApiDispatcher({ clients: clientsHandler });
    const res = createResponse();

    await dispatcher(request('clients'), res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.' } });
    expect(repository.list).not.toHaveBeenCalled();
  });

  test('preserves permission denial before repository access', async () => {
    const { createVersionedApiDispatcher } = loadDispatcherModule();
    const repository = { create: jest.fn() };
    const clientsHandler = createOperationalHandler('clients', {
      resolveContext: jest.fn().mockResolvedValue(context({ permissions: ['clients.read'] })),
      repository,
    });
    const dispatcher = createVersionedApiDispatcher({ clients: clientsHandler });
    const res = createResponse();

    await dispatcher(request('clients', 'POST', { name: 'Denied Client' }), res);

    expect(res.statusCode).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(repository.create).not.toHaveBeenCalled();
  });

  test('preserves server-derived tenant scope instead of request organisation input', async () => {
    const { createVersionedApiDispatcher } = loadDispatcherModule();
    const repository = {
      create: jest.fn().mockResolvedValue({
        record: { id: '33333333-3333-4333-8333-333333333333', name: 'Scoped Client', row_version: 1 },
      }),
    };
    const resolvedContext = context();
    const clientsHandler = createOperationalHandler('clients', {
      resolveContext: jest.fn().mockResolvedValue(resolvedContext),
      repository,
    });
    const dispatcher = createVersionedApiDispatcher({ clients: clientsHandler });
    const res = createResponse();

    await dispatcher(request(
      'clients',
      'POST',
      { name: 'Scoped Client' },
      { organisationId: '99999999-9999-4999-8999-999999999999' }
    ), res);

    expect(res.statusCode).toBe(201);
    expect(repository.create).toHaveBeenCalledWith(
      'clients',
      resolvedContext,
      { name: 'Scoped Client' }
    );
  });
});
