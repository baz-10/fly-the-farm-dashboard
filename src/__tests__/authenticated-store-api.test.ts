const storeHandler = require('../../api/store');

interface MockResponse {
  statusCode: number;
  body: any;
  headers: Record<string, any>;
  status: (statusCode: number) => MockResponse;
  json: (body: any) => MockResponse;
  end: () => MockResponse;
  setHeader: (name: string, value: any) => void;
  getHeader: (name: string) => any;
}

function response(status: number, body: any) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body === null ? '' : JSON.stringify(body),
  };
}

function createResponse(): MockResponse {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    getHeader(name) {
      return this.headers[name.toLowerCase()];
    },
  };
}

function request(method: string, token?: string, body?: any) {
  return {
    method,
    body,
    query: { collection: 'ftf_missions' },
    headers: {
      cookie: token ? `ftf_access_token=${token}` : '',
      host: 'localhost:3001',
      origin: 'http://localhost:3001',
    },
  };
}

describe('authenticated persistent store API', () => {
  const originalEnvironment = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = {
      ...originalEnvironment,
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    };
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = originalEnvironment;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('rejects unauthenticated collection access', async () => {
    global.fetch = jest.fn() as any;
    const res = createResponse();

    await storeHandler(request('GET'), res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Authentication is required.' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('rejects malformed origins before handling a storage change', async () => {
    global.fetch = jest.fn() as any;
    const res = createResponse();
    const req = request('PUT', 'token-a', {
      collection: 'ftf_missions',
      records: [],
    }) as any;
    req.headers.origin = 'not a valid origin';

    await storeHandler(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Cross-origin storage changes are not allowed.' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('scopes reads to the authenticated user tenant', async () => {
    const requestedUrls: string[] = [];
    global.fetch = jest.fn(async (url: string, options: RequestInit = {}) => {
      requestedUrls.push(url);
      const authorization = String((options.headers as Record<string, string>)?.Authorization || '');

      if (url.endsWith('/auth/v1/user')) {
        const userId = authorization.endsWith('token-a') ? 'user-a' : 'user-b';
        return response(200, { id: userId, email: `${userId}@example.com`, user_metadata: {} });
      }
      if (url.includes('/rest/v1/ftf_profiles')) {
        const userId = url.includes('user-a') ? 'user-a' : 'user-b';
        return response(200, [{
          user_id: userId,
          tenant_id: userId === 'user-a' ? 'tenant-a' : 'tenant-b',
          role: 'contractor',
          name: userId,
          tier: 'free',
        }]);
      }
      if (url.includes('tenant_id=eq.tenant-a')) return response(200, [{ payload: { id: 'mission-a' } }]);
      if (url.includes('tenant_id=eq.tenant-b')) return response(200, [{ payload: { id: 'mission-b' } }]);
      return response(500, { message: 'unexpected request' });
    }) as any;

    const firstResponse = createResponse();
    const secondResponse = createResponse();
    await storeHandler(request('GET', 'token-a'), firstResponse);
    await storeHandler(request('GET', 'token-b'), secondResponse);

    expect(firstResponse.body).toEqual({ records: [{ id: 'mission-a' }] });
    expect(secondResponse.body).toEqual({ records: [{ id: 'mission-b' }] });
    expect(requestedUrls.some((url) => url.includes('tenant_id=eq.tenant-a'))).toBe(true);
    expect(requestedUrls.some((url) => url.includes('tenant_id=eq.tenant-b'))).toBe(true);
  });

  test('does not expose workflow storage to client accounts', async () => {
    const requestedUrls: string[] = [];
    global.fetch = jest.fn(async (url: string) => {
      requestedUrls.push(url);
      if (url.endsWith('/auth/v1/user')) {
        return response(200, { id: 'client-a', email: 'client@example.com', user_metadata: {} });
      }
      if (url.includes('/rest/v1/ftf_profiles')) {
        return response(200, [{
          user_id: 'client-a',
          tenant_id: 'tenant-a',
          role: 'client',
          name: 'Client A',
          tier: 'free',
        }]);
      }
      return response(500, { message: 'unexpected request' });
    }) as any;
    const res = createResponse();

    await storeHandler(request('GET', 'client-token'), res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'This account cannot access mission workflow storage.' });
    expect(requestedUrls.some((url) => url.includes('/rest/v1/ftf_store'))).toBe(false);
  });

  test('upserts records without deleting the tenant collection', async () => {
    const requests: Array<{ url: string; method: string }> = [];
    global.fetch = jest.fn(async (url: string, options: RequestInit = {}) => {
      requests.push({ url, method: options.method || 'GET' });
      if (url.endsWith('/auth/v1/user')) {
        return response(200, { id: 'user-a', email: 'user-a@example.com', user_metadata: {} });
      }
      if (url.includes('/rest/v1/ftf_profiles')) {
        return response(200, [{
          user_id: 'user-a',
          tenant_id: 'tenant-a',
          role: 'contractor',
          name: 'User A',
          tier: 'free',
        }]);
      }
      return response(204, null);
    }) as any;
    const res = createResponse();

    await storeHandler(request('PUT', 'token-a', {
      collection: 'ftf_missions',
      records: [{ id: 'mission-a', status: 'Approved' }],
    }), res);

    expect(res.statusCode).toBe(200);
    expect(requests.some((entry) => entry.method === 'DELETE')).toBe(false);
    expect(requests.some((entry) => entry.method === 'POST' && entry.url.includes('on_conflict=tenant_id,collection,record_id'))).toBe(true);
  });

  test('refreshes an expired access cookie before reading storage', async () => {
    global.fetch = jest.fn(async (url: string) => {
      if (url.includes('grant_type=refresh_token')) {
        return response(200, {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
          user: { id: 'user-a', email: 'user-a@example.com', user_metadata: {} },
        });
      }
      if (url.includes('/rest/v1/ftf_profiles')) {
        return response(200, [{
          user_id: 'user-a',
          tenant_id: 'tenant-a',
          role: 'contractor',
          name: 'User A',
          tier: 'free',
        }]);
      }
      if (url.includes('/rest/v1/ftf_store')) return response(200, []);
      return response(500, { message: 'unexpected request' });
    }) as any;
    const res = createResponse();
    const req = request('GET') as any;
    req.headers.cookie = 'ftf_refresh_token=refresh-token';

    await storeHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers['set-cookie']).toEqual(expect.arrayContaining([
      expect.stringContaining('ftf_access_token=new-access-token'),
      expect.stringContaining('ftf_refresh_token=new-refresh-token'),
    ]));
  });
});

export {};
