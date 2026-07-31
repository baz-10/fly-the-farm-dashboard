import { vi } from 'vitest';

let authHandler: any;

function response(status: number, body: any) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body === null ? '' : JSON.stringify(body),
  };
}

function createResponse() {
  return {
    statusCode: 200,
    body: undefined as any,
    headers: {} as Record<string, any>,
    status(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
    json(body: any) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
    setHeader(name: string, value: any) {
      this.headers[name.toLowerCase()] = value;
    },
    getHeader(name: string) {
      return this.headers[name.toLowerCase()];
    },
  };
}

describe('Supabase authentication API', () => {
  const originalEnvironment = process.env;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    process.env = {
      ...originalEnvironment,
      NODE_ENV: 'test',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    };
    vi.resetModules();
    const authModule = await import('../../api/auth');
    authHandler = authModule.default ?? authModule;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = originalEnvironment;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('returns a null session when no signed cookie exists', async () => {
    global.fetch = vi.fn() as any;
    const res = createResponse();

    await authHandler({ method: 'GET', headers: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ user: null });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('rejects cross-origin authentication changes', async () => {
    global.fetch = vi.fn() as any;
    const res = createResponse();

    await authHandler({
      method: 'POST',
      headers: { host: 'flythefarm.example', origin: 'https://attacker.example' },
      body: { action: 'logout' },
    }, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Cross-origin authentication requests are not allowed.' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('sets HttpOnly cookies after verified password login', async () => {
    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('/auth/v1/token?grant_type=password')) {
        return response(200, {
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expires_in: 3600,
          user: { id: 'user-a', email: 'pilot@example.com', user_metadata: { name: 'Pilot' } },
        });
      }
      if (url.includes('/rest/v1/ftf_profiles')) {
        return response(200, [{
          user_id: 'user-a',
          tenant_id: 'tenant-a',
          role: 'contractor',
          name: 'Pilot',
          invite_code: 'PILOT1',
          tier: 'free',
          safety_plan_authority: true,
        }]);
      }
      return response(500, { message: 'unexpected request' });
    }) as any;
    const res = createResponse();

    await authHandler({
      method: 'POST',
      headers: { host: 'localhost:3001' },
      body: { action: 'login', email: 'pilot@example.com', password: 'password' },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.user).toMatchObject({
      id: 'user-a',
      tenantId: 'tenant-a',
      role: 'contractor',
      safetyPlanAuthority: true,
    });
    expect(res.headers['set-cookie']).toEqual(expect.arrayContaining([
      expect.stringContaining('ftf_access_token=access-token'),
      expect.stringContaining('ftf_refresh_token=refresh-token'),
    ]));
    expect(res.headers['set-cookie'].every((cookie: string) => cookie.includes('HttpOnly'))).toBe(true);
  });

  test('does not send publishable or secret API keys as bearer JWTs', async () => {
    process.env.SUPABASE_ANON_KEY = 'sb_publishable_test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test';
    const requests: Array<{ url: string; headers: Record<string, string> }> = [];
    global.fetch = vi.fn(async (url: string, options: RequestInit = {}) => {
      requests.push({ url, headers: options.headers as Record<string, string> });
      if (url.includes('/auth/v1/token?grant_type=password')) {
        return response(200, {
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expires_in: 3600,
          user: { id: 'user-a', email: 'pilot@example.com', user_metadata: {} },
        });
      }
      if (url.includes('/rest/v1/ftf_profiles')) {
        return response(200, [{
          user_id: 'user-a',
          tenant_id: 'tenant-a',
          role: 'contractor',
          name: 'Pilot',
          tier: 'free',
        }]);
      }
      return response(500, { message: 'unexpected request' });
    }) as any;
    const res = createResponse();

    await authHandler({
      method: 'POST',
      headers: { host: 'localhost:3001' },
      body: { action: 'login', email: 'pilot@example.com', password: 'password' },
    }, res);

    const loginRequest = requests.find(({ url }) => url.includes('/auth/v1/token'));
    const profileRequest = requests.find(({ url }) => url.includes('/rest/v1/ftf_profiles'));
    expect(loginRequest?.headers.apikey).toBe('sb_publishable_test');
    expect(loginRequest?.headers.Authorization).toBeUndefined();
    expect(profileRequest?.headers.apikey).toBe('sb_secret_test');
    expect(profileRequest?.headers.Authorization).toBeUndefined();
    expect(res.body.user.safetyPlanAuthority).toBe(false);
  });

  test('requests a password recovery email without disclosing account existence', async () => {
    process.env.APP_URL = 'https://fly-the-farm-dashboard-sable.vercel.app/';
    const requests: Array<{ url: string; options: RequestInit }> = [];
    global.fetch = vi.fn(async (url: string, options: RequestInit = {}) => {
      requests.push({ url, options });
      return response(200, {});
    }) as any;

    const knownUserResponse = createResponse();
    await authHandler({
      method: 'POST',
      headers: { host: 'fly-the-farm-dashboard-sable.vercel.app' },
      body: { action: 'request-password-reset', email: '  Pilot@Example.com ' },
    }, knownUserResponse);

    const unknownUserResponse = createResponse();
    await authHandler({
      method: 'POST',
      headers: { host: 'fly-the-farm-dashboard-sable.vercel.app' },
      body: { action: 'request-password-reset', email: 'unknown@example.com' },
    }, unknownUserResponse);

    const recoveryRequest = requests[0];
    expect(recoveryRequest.url).toContain('/auth/v1/recover?redirect_to=');
    expect(decodeURIComponent(recoveryRequest.url)).toContain(
      'redirect_to=https://fly-the-farm-dashboard-sable.vercel.app/reset-password',
    );
    expect(recoveryRequest.options.method).toBe('POST');
    expect(recoveryRequest.options.headers).toMatchObject({ apikey: 'anon-key' });
    expect(JSON.parse(String(recoveryRequest.options.body))).toEqual({ email: 'pilot@example.com' });
    expect(knownUserResponse.body).toEqual({ ok: true });
    expect(unknownUserResponse.body).toEqual({ ok: true });
  });

  test('rejects malformed password recovery email before contacting Supabase', async () => {
    global.fetch = vi.fn() as any;
    const res = createResponse();

    await authHandler({
      method: 'POST',
      headers: { host: 'localhost:3001' },
      body: { action: 'request-password-reset', email: 'not-an-email' },
    }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Enter a valid email address.' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('updates a password with the short-lived recovery token and anonymous key', async () => {
    const requests: Array<{ url: string; options: RequestInit }> = [];
    global.fetch = vi.fn(async (url: string, options: RequestInit = {}) => {
      requests.push({ url, options });
      return response(200, { id: 'user-a' });
    }) as any;
    const res = createResponse();

    await authHandler({
      method: 'POST',
      headers: { host: 'localhost:3001' },
      body: { action: 'update-password', accessToken: 'recovery-token', password: 'newpass' },
    }, res);

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain('/auth/v1/user');
    expect(requests[0].options.method).toBe('PUT');
    expect(requests[0].options.headers).toMatchObject({
      apikey: 'anon-key',
      Authorization: 'Bearer recovery-token',
    });
    expect(JSON.parse(String(requests[0].options.body))).toEqual({ password: 'newpass' });
    expect(res.body).toEqual({ ok: true });
  });

  test.each([
    [{ accessToken: '', password: 'newpass' }, 'This password recovery link is invalid or has expired.'],
    [{ accessToken: 'recovery-token', password: 'short' }, 'Password must be at least 6 characters.'],
  ])('rejects invalid password updates before contacting Supabase', async (body, message) => {
    global.fetch = vi.fn() as any;
    const res = createResponse();

    await authHandler({
      method: 'POST',
      headers: { host: 'localhost:3001' },
      body: { action: 'update-password', ...body },
    }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: message });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

export {};
