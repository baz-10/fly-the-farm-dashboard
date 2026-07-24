import { vi } from 'vitest';

let authHandler: any;

function response(status: number, body: any) {
  return { ok: status >= 200 && status < 300, status, text: async () => body === null ? '' : JSON.stringify(body) };
}

function createResponse() {
  return {
    statusCode: 200,
    body: undefined as any,
    headers: {} as Record<string, any>,
    status(statusCode: number) { this.statusCode = statusCode; return this; },
    json(body: any) { this.body = body; return this; },
    end() { return this; },
    setHeader(name: string, value: any) { this.headers[name.toLowerCase()] = value; },
    getHeader(name: string) { return this.headers[name.toLowerCase()]; },
  };
}

describe('Safety Plan operational authority API', () => {
  const originalEnvironment = process.env;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    process.env = {
      ...originalEnvironment,
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    };
    vi.resetModules();
    const module = await import('../../api/auth');
    authHandler = module.default ?? module;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = originalEnvironment;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('allows a tenant administrator to nominate a contractor and records an audit event', async () => {
    const requests: Array<{ url: string; options: RequestInit }> = [];
    global.fetch = vi.fn(async (url: string, options: RequestInit = {}) => {
      requests.push({ url, options });
      if (url.includes('/auth/v1/user')) return response(200, { id: 'admin-a', email: 'admin@example.com' });
      if (url.includes('user_id=eq.admin-a')) {
        return response(200, [{ user_id: 'admin-a', tenant_id: 'tenant-a', role: 'admin', name: 'Admin' }]);
      }
      if (url.includes('user_id=eq.pilot-a')) {
        return response(200, [{
          user_id: 'pilot-a', tenant_id: 'tenant-a', role: 'contractor', name: 'Pilot', safety_plan_authority: false,
        }]);
      }
      if (url.includes('/rest/v1/rpc/ftf_set_safety_plan_authority')) {
        return response(200, {
          user_id: 'pilot-a', tenant_id: 'tenant-a', role: 'contractor', name: 'Pilot', safety_plan_authority: true,
        });
      }
      return response(500, { message: 'unexpected request' });
    }) as any;
    const res = createResponse();

    await authHandler({
      method: 'POST',
      headers: { host: 'localhost:3001', cookie: 'ftf_access_token=token' },
      body: { action: 'setSafetyPlanAuthority', userId: 'pilot-a', enabled: true },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.user).toMatchObject({ id: 'pilot-a', safetyPlanAuthority: true });
    expect(requests.some(({ url, options }) =>
      url.includes('/rest/v1/rpc/ftf_set_safety_plan_authority')
      && options.method === 'POST'
      && String(options.body).includes('authority_nominated')
    )).toBe(true);
    expect(requests.some(({ url }) => url.includes('/rest/v1/ftf_store'))).toBe(false);
  });

  it('rejects cross-tenant and client authority nominations', async () => {
    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('/auth/v1/user')) return response(200, { id: 'admin-a', email: 'admin@example.com' });
      if (url.includes('user_id=eq.admin-a')) {
        return response(200, [{ user_id: 'admin-a', tenant_id: 'tenant-a', role: 'admin', name: 'Admin' }]);
      }
      if (url.includes('user_id=eq.client-b')) {
        return response(200, [{ user_id: 'client-b', tenant_id: 'tenant-b', role: 'client', name: 'Other client' }]);
      }
      return response(500, { message: 'unexpected request' });
    }) as any;
    const res = createResponse();

    await authHandler({
      method: 'POST',
      headers: { host: 'localhost:3001', cookie: 'ftf_access_token=token' },
      body: { action: 'setSafetyPlanAuthority', userId: 'client-b', enabled: true },
    }, res);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/same company|clients/i);
  });
});
