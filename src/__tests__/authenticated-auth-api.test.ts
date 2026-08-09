const authHandler = require('../../api/auth');

function response(status: number, body: any) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body === null ? '' : JSON.stringify(body),
  };
}

function createResponse(events?: string[]) {
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
      if (name.toLowerCase() === 'set-cookie') events?.push('trusted-cookie');
    },
    getHeader(name: string) {
      return this.headers[name.toLowerCase()];
    },
  };
}

const commercialInvitationId = '91000000-0000-4000-8000-000000000001';
const acceptanceHeaders = {
  host: 'spray-command-production-beta.vercel.app',
  origin: 'https://spray-command-production-beta.vercel.app',
  'content-type': 'application/json',
  'sec-fetch-site': 'same-origin',
};

describe('Supabase authentication API', () => {
  const originalEnvironment = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = {
      ...originalEnvironment,
      NODE_ENV: 'test',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'service-key',
      PRODUCTION_BETA_URL: 'https://spray-command-production-beta.vercel.app',
      PRODUCTION_BETA_OWNER_EMAILS: 'ben@flythefarm.com.au',
      FTF_ORGANISATION_ID: '92e3a0f6-5892-4bcc-a736-ffaee7d3c23d',
      FTF_DEFAULT_OPERATING_LOCATION_ID: '5918401f-d099-4876-bbe3-13a332ffba43',
    };
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = originalEnvironment;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('returns a null session when no signed cookie exists', async () => {
    global.fetch = jest.fn() as any;
    const res = createResponse();

    await authHandler({ method: 'GET', headers: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ user: null });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('grants legacy Ask FTF only to the authenticated Production Beta owner', async () => {
    global.fetch = jest.fn(async (url: string) => {
      if (url.includes('/auth/v1/user')) {
        return response(200, { id: 'owner-auth-id', email: 'ben@flythefarm.com.au', user_metadata: {} });
      }
      if (url.includes('/rest/v1/ftf_profiles')) {
        return response(200, [{
          user_id: 'owner-auth-id', tenant_id: 'tenant-a', role: 'contractor', name: 'Ben', tier: 'free',
        }]);
      }
      return response(500, { message: 'unexpected request' });
    }) as any;

    const ownerResponse = createResponse();
    await authHandler({ method: 'GET', headers: { cookie: 'ftf_access_token=owner-token' } }, ownerResponse);

    expect(ownerResponse.body.user.entitlements).toEqual(['legacyAskFtf']);

    process.env.PRODUCTION_BETA_OWNER_EMAILS = 'someone-else@flythefarm.com.au';
    const ordinaryResponse = createResponse();
    await authHandler({ method: 'GET', headers: { cookie: 'ftf_access_token=ordinary-token' } }, ordinaryResponse);

    expect(ordinaryResponse.body.user.entitlements).toEqual([]);
  });

  test('rejects cross-origin authentication changes', async () => {
    global.fetch = jest.fn() as any;
    const res = createResponse();

    await authHandler({
      method: 'POST',
      headers: { host: 'flythefarm.example', origin: 'https://attacker.example' },
      body: { action: 'logout' },
    }, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ error: 'Cross-origin authentication requests are not allowed.' });
    expect(res.body.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('sets HttpOnly cookies after verified password login', async () => {
    global.fetch = jest.fn(async (url: string) => {
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
    expect(res.body.user).toMatchObject({ id: 'user-a', tenantId: 'tenant-a', role: 'contractor' });
    expect(res.headers['set-cookie']).toEqual(expect.arrayContaining([
      expect.stringContaining('ftf_access_token=access-token'),
      expect.stringContaining('ftf_refresh_token=refresh-token'),
    ]));
    expect(res.headers['set-cookie'].every((cookie: string) => cookie.includes('HttpOnly'))).toBe(true);
  });

  test('signs an authoritative organisation identity in without a legacy profile', async () => {
    global.fetch = jest.fn(async (url: string) => {
      if (url.includes('/auth/v1/token?grant_type=password')) {
        return response(200, {
          access_token: 'acceptance-access-token',
          refresh_token: 'acceptance-refresh-token',
          expires_in: 3600,
          user: { id: 'acceptance-auth-id', email: 'acceptance@example.com', user_metadata: {} },
        });
      }
      if (url.includes('/rest/v1/ftf_profiles')) return response(200, []);
      if (url.includes('/rest/v1/internal_users')) {
        return response(200, [{
          id: 'acceptance-internal-id',
          organisation_id: 'organisation-a',
          display_name: 'Production Beta Acceptance',
        }]);
      }
      if (url.includes('/rest/v1/memberships')) {
        return response(200, [{ id: 'acceptance-membership-id', role_id: 'acceptance-role-id' }]);
      }
      if (url.includes('/rest/v1/roles')) {
        return response(200, [{ id: 'acceptance-role-id', code: 'production_beta_acceptance' }]);
      }
      if (url.includes('/rest/v1/organisations')) {
        return response(200, [{ id: 'organisation-a', name: 'Fly The Farm' }]);
      }
      if (url.includes('/rest/v1/platform_users')) return response(200, []);
      return response(500, { message: `unexpected request: ${url}` });
    }) as any;
    const res = createResponse();

    await authHandler({
      method: 'POST', headers: { host: 'localhost:3001' },
      body: { action: 'login', email: 'acceptance@example.com', password: 'password' },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.user).toMatchObject({
      id: 'acceptance-auth-id',
      tenantId: 'organisation-a',
      role: 'production_beta_acceptance',
      name: 'Production Beta Acceptance',
    });
    expect(res.body.user.identityPlane).toBeUndefined();
    expect(res.headers['set-cookie']).toEqual(expect.arrayContaining([
      expect.stringContaining('ftf_access_token=acceptance-access-token'),
      expect.stringContaining('ftf_refresh_token=acceptance-refresh-token'),
    ]));
  });

  test('signs a platform identity into the platform plane without tenant context', async () => {
    let platformIdentityRequest = '';
    global.fetch = jest.fn(async (url: string) => {
      if (url.includes('/auth/v1/token?grant_type=password')) {
        return response(200, {
          access_token: 'platform-access-token', refresh_token: 'platform-refresh-token', expires_in: 3600,
          user: { id: 'platform-auth-id', email: 'ben@trollope.com.au', user_metadata: { name: 'Ben Trollope' } },
        });
      }
      if (url.includes('/rest/v1/ftf_profiles')) return response(200, []);
      if (url.includes('/rest/v1/internal_users')) return response(200, []);
      if (url.includes('/rest/v1/platform_users')) {
        platformIdentityRequest = url;
        return response(200, [{
        id: 'platform-user-id', auth_user_id: 'platform-auth-id', email: 'ben@trollope.com.au', display_name: 'Ben Trollope',
        platform_user_roles: [{ platform_roles: { code: 'PLATFORM_SUPER_ADMIN', platform_role_permissions: [
          { platform_permissions: { code: 'platform.super_admin', enabled: true } },
        ] } }],
        }]);
      }
      return response(500, { message: 'unexpected request' });
    }) as any;
    const res = createResponse();

    await authHandler({
      method: 'POST', headers: { host: 'localhost:3001' },
      body: { action: 'login', email: 'ben@trollope.com.au', password: 'password' },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.user).toMatchObject({
      id: 'platform-auth-id', role: 'platform', identityPlane: 'platform', platformUserId: 'platform-user-id',
    });
    expect(res.body.user.tenantId).toBeUndefined();
    expect(res.body.user.permissions).toEqual(['platform.super_admin']);
    const decodedRequest = decodeURIComponent(platformIdentityRequest);
    expect(decodedRequest).toContain('platform_user_roles!platform_user_roles_platform_user_id_fkey(');
    expect(decodedRequest).not.toContain('platform_user_roles!platform_user_roles_assigned_by_platform_user_id_fkey(');
    expect(res.headers['set-cookie']).toEqual(expect.arrayContaining([
      expect.stringContaining('ftf_access_token=platform-access-token'),
      expect.stringContaining('ftf_refresh_token=platform-refresh-token'),
    ]));
  });

  test('fails closed without setting trusted cookies when the platform identity is missing or inactive', async () => {
    global.fetch = jest.fn(async (url: string) => {
      if (url.includes('/auth/v1/token?grant_type=password')) {
        return response(200, {
          access_token: 'untrusted-access-token', refresh_token: 'untrusted-refresh-token', expires_in: 3600,
          user: { id: 'inactive-platform-auth-id', email: 'inactive@example.com', user_metadata: {} },
        });
      }
      if (url.includes('/rest/v1/ftf_profiles')) return response(200, []);
      if (url.includes('/rest/v1/internal_users')) return response(200, []);
      if (url.includes('/rest/v1/platform_users')) return response(200, []);
      return response(500, { message: 'unexpected request' });
    }) as any;
    const res = createResponse();

    await authHandler({
      method: 'POST', headers: { host: 'localhost:3001' },
      body: { action: 'login', email: 'inactive@example.com', password: 'password' },
    }, res);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('Your account is not configured for Spray Command.');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  test('does not send publishable or secret API keys as bearer JWTs', async () => {
    process.env.SUPABASE_ANON_KEY = 'sb_publishable_test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test';
    const requests: Array<{ url: string; headers: Record<string, string> }> = [];
    global.fetch = jest.fn(async (url: string, options: RequestInit = {}) => {
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
  });

  test('registers an allow-listed Production Beta owner with an atomic existing-tenant provision', async () => {
    const requests: Array<{ url: string; options: RequestInit }> = [];
    global.fetch = jest.fn(async (url: string, options: RequestInit = {}) => {
      requests.push({ url, options });
      if (url.includes('/auth/v1/signup?redirect_to=')) {
        return response(200, {
          user: { id: 'owner-auth-id', email: 'ben@flythefarm.com.au', identities: [{ id: 'identity-id' }] },
        });
      }
      if (url.includes('/rest/v1/rpc/ftf_provision_production_beta_member')) {
        return response(200, {
          organisation_id: '92e3a0f6-5892-4bcc-a736-ffaee7d3c23d',
          operating_location_id: '5918401f-d099-4876-bbe3-13a332ffba43',
          internal_user_id: 'owner-internal-id',
          membership_id: 'owner-membership-id',
          already_provisioned: false,
        });
      }
      if (url.includes('/rest/v1/ftf_profiles')) {
        return response(200, [{
          user_id: 'owner-auth-id', tenant_id: '92e3a0f6-5892-4bcc-a736-ffaee7d3c23d',
          role: 'admin', name: 'Ben', tier: 'beta',
        }]);
      }
      return response(500, { message: 'unexpected request' });
    }) as any;
    const res = createResponse();

    await authHandler({
      method: 'POST',
      headers: { host: 'spray-command-production-beta.vercel.app', 'x-forwarded-proto': 'https' },
      body: { action: 'register', email: 'ben@flythefarm.com.au', name: 'Ben', password: 'password', role: 'contractor' },
    }, res);

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ user: null, requiresEmailConfirmation: true });
    const signup = requests.find(({ url }) => url.includes('/auth/v1/signup'));
    expect(signup?.url).toContain(encodeURIComponent('https://spray-command-production-beta.vercel.app/auth/callback'));
    const provision = requests.find(({ url }) => url.includes('/rpc/ftf_provision_production_beta_member'));
    expect(JSON.parse(String(provision?.options.body))).toEqual({
      p_auth_user_id: 'owner-auth-id',
      p_organisation_id: '92e3a0f6-5892-4bcc-a736-ffaee7d3c23d',
      p_display_name: 'Ben',
      p_operating_location_id: '5918401f-d099-4876-bbe3-13a332ffba43',
    });
  });

  test('compensates Auth identity and returns a correlation ID when tenant bootstrap fails', async () => {
    global.fetch = jest.fn(async (url: string) => {
      if (url.includes('/auth/v1/signup')) {
        return response(200, { user: { id: 'partial-user', email: 'new@example.com', identities: [{ id: 'new' }] } });
      }
      if (url.includes('/rest/v1/rpc/ftf_bootstrap_production_beta_organisation')) {
        return response(409, { message: 'database detail must remain server-side' });
      }
      if (url.includes('/auth/v1/admin/users/partial-user')) return response(204, null);
      return response(500, { message: 'unexpected request' });
    }) as any;
    const res = createResponse();

    await authHandler({
      method: 'POST', headers: { host: 'localhost:3001' },
      body: { action: 'register', email: 'new@example.com', name: 'New Operator', password: 'password', role: 'contractor' },
    }, res);

    expect(res.statusCode).toBe(503);
    expect(res.body.error).toBe('Your account could not be fully configured. Please try again or contact support.');
    expect(res.body.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers['x-correlation-id']).toBe(res.body.correlationId);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/v1/admin/users/partial-user'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  test('treats an existing signup as confirmation required without provisioning a duplicate tenant', async () => {
    global.fetch = jest.fn(async (url: string) => {
      if (url.includes('/auth/v1/signup')) {
        return response(200, { user: { id: 'existing-user', email: 'existing@example.com', identities: [] } });
      }
      return response(500, { message: 'duplicate provisioning must not run' });
    }) as any;
    const res = createResponse();

    await authHandler({
      method: 'POST', headers: { host: 'localhost:3001' },
      body: { action: 'register', email: 'existing@example.com', name: 'Existing', password: 'password', role: 'contractor' },
    }, res);

    expect(res.statusCode).toBe(202);
    expect(res.body).toEqual({ user: null, requiresEmailConfirmation: true });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('completes a confirmed session only after the internal profile resolves', async () => {
    global.fetch = jest.fn(async (url: string) => {
      if (url.includes('/auth/v1/user')) {
        return response(200, { id: 'owner-auth-id', email: 'ben@flythefarm.com.au', user_metadata: { name: 'Ben' } });
      }
      if (url.includes('/rest/v1/ftf_profiles')) {
        return response(200, [{ user_id: 'owner-auth-id', tenant_id: 'tenant-a', role: 'admin', name: 'Ben', tier: 'beta' }]);
      }
      return response(500, { message: 'unexpected request' });
    }) as any;
    const res = createResponse();

    await authHandler({
      method: 'POST', headers: { host: 'localhost:3001' },
      body: { action: 'complete-session', accessToken: 'confirmed-access', refreshToken: 'confirmed-refresh', expiresIn: 3600 },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.user).toMatchObject({ id: 'owner-auth-id', role: 'admin', tenantId: 'tenant-a' });
    expect(res.headers['set-cookie']).toEqual(expect.arrayContaining([
      expect.stringContaining('ftf_access_token=confirmed-access'),
      expect.stringContaining('ftf_refresh_token=confirmed-refresh'),
    ]));
  });

  test('uses a fresh password session only after preflight and before organisation acceptance', async () => {
    const events: string[] = [];
    const requests: Array<{ url: string; options: RequestInit }> = [];
    let passwordUpdated = false;
    global.fetch = jest.fn(async (url: string, options: RequestInit = {}) => {
      requests.push({ url, options });
      if (url.includes('/auth/v1/user') && options.method === 'PUT') {
        events.push('password-update');
        passwordUpdated = true;
        return response(200, { id: 'invited-auth-id', email: 'admin@example.com', user_metadata: { name: 'Alex Admin' } });
      }
      if (url.includes('/auth/v1/user')) {
        events.push('authentication');
        return response(200, { id: 'invited-auth-id', email: 'admin@example.com', user_metadata: { name: 'Alex Admin' } });
      }
      if (url.includes('/auth/v1/token?grant_type=password')) {
        events.push(passwordUpdated ? 'fresh-password-sign-in' : 'current-password-sign-in');
        if (!passwordUpdated) return response(400, { message: 'invalid credentials' });
        return response(200, {
          access_token: 'fresh-access', refresh_token: 'fresh-refresh', expires_in: 1800,
          user: { id: 'invited-auth-id', email: 'admin@example.com', user_metadata: { name: 'Alex Admin' } },
        });
      }
      if (url.includes('/rest/v1/rpc/ftf_preflight_commercial_invitation')) {
        events.push('invitation-preflight');
        return response(200, { eligible: true, invitation_id: commercialInvitationId });
      }
      if (url.includes('/rest/v1/rpc/ftf_accept_commercial_invitation_by_id')) {
        events.push('invitation-acceptance');
        return response(200, {
          accepted: true,
          already_provisioned: false,
          invitation_id: commercialInvitationId,
          organisation_id: 'organisation-id',
          organisation_reference: 'ALEX',
          internal_user_id: 'internal-user-id',
          membership_id: 'membership-id',
          operating_location_id: 'location-id',
        });
      }
      if (url.includes('/rest/v1/ftf_profiles')) {
        events.push('profile-resolution');
        return response(200, [{
          user_id: 'invited-auth-id', tenant_id: 'organisation-id', role: 'admin', name: 'Alex Admin', tier: 'free',
        }]);
      }
      return response(500, { message: `unexpected request: ${url}` });
    }) as any;
    const res = createResponse(events);

    await authHandler({
      method: 'POST', headers: acceptanceHeaders,
      body: {
        action: 'accept-organisation-invitation',
        invitationId: commercialInvitationId,
        password: 'new-password', accessToken: 'provider-access', refreshToken: 'provider-refresh', expiresIn: 999999,
        authUserId: 'browser-user', organisationId: 'browser-org', role: 'platform', seatId: 'browser-seat', locationId: 'browser-location',
      },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.user).toMatchObject({ id: 'invited-auth-id', tenantId: 'organisation-id', role: 'admin' });
    expect(res.body.provisioning).toEqual({
      invitationId: commercialInvitationId,
      organisationId: 'organisation-id',
      operatingLocationId: 'location-id',
    });
    const acceptanceRpc = requests.find(({ url }) => url.includes('/rpc/ftf_accept_commercial_invitation_by_id'));
    expect(JSON.parse(String(acceptanceRpc?.options.body))).toEqual({
      p_invitation_id: commercialInvitationId,
      p_auth_user_id: 'invited-auth-id',
    });
    const preflightRpc = requests.find(({ url }) => url.includes('/rpc/ftf_preflight_commercial_invitation'));
    expect(JSON.parse(String(preflightRpc?.options.body))).toEqual({
      p_invitation_id: commercialInvitationId,
      p_auth_user_id: 'invited-auth-id',
    });
    expect(events.indexOf('authentication')).toBeLessThan(events.indexOf('invitation-preflight'));
    expect(events.indexOf('invitation-preflight')).toBeLessThan(events.indexOf('password-update'));
    expect(events.indexOf('password-update')).toBeLessThan(events.indexOf('fresh-password-sign-in'));
    expect(events.indexOf('password-update')).toBeLessThan(events.indexOf('invitation-acceptance'));
    expect(events.indexOf('fresh-password-sign-in')).toBeLessThan(events.indexOf('invitation-acceptance'));
    expect(events.indexOf('invitation-acceptance')).toBeLessThan(events.indexOf('profile-resolution'));
    expect(events.indexOf('profile-resolution')).toBeLessThan(events.indexOf('trusted-cookie'));
    expect(res.headers['set-cookie']).toEqual(expect.arrayContaining([
      expect.stringContaining('ftf_access_token=fresh-access'),
      expect.stringContaining('ftf_refresh_token=fresh-refresh'),
    ]));
    expect(JSON.stringify(res.headers['set-cookie'])).not.toMatch(/provider-access|provider-refresh/);
    expect(res.headers['set-cookie'].find((cookie: string) => cookie.startsWith('ftf_access_token='))).toContain('Max-Age=1800');
  });

  test.each([
    ['INVITATION_EXPIRED', 410, 'This invitation has expired. Ask your reviewer to send a new invitation.'],
    ['INVITATION_REVOKED', 410, 'This invitation has been revoked. Ask your reviewer to send a new invitation.'],
    ['INVITATION_ALREADY_ACCEPTED', 409, 'This invitation has already been accepted.'],
    ['INVITATION_EMAIL_MISMATCH', 403, 'Sign in with the email address that received this invitation.'],
    ['PLATFORM_IDENTITY_FORBIDDEN', 403, 'Platform accounts cannot accept organisation invitations.'],
    ['ORGANISATION_IDENTITY_CONFLICT', 409, 'This account already belongs to another organisation.'],
  ])('fails closed for the %s onboarding outcome', async (code, expectedStatus, expectedMessage) => {
    global.fetch = jest.fn(async (url: string, options: RequestInit = {}) => {
      if (url.includes('/auth/v1/user')) {
        return response(200, { id: 'invited-auth-id', email: 'admin@example.com', user_metadata: {} });
      }
      if (url.includes('/rest/v1/rpc/ftf_preflight_commercial_invitation')) {
        return response(200, { eligible: false, code });
      }
      return response(500, { message: `unexpected request: ${url}`, method: options.method });
    }) as any;
    const res = createResponse();

    await authHandler({
      method: 'POST', headers: acceptanceHeaders,
      body: {
        action: 'accept-organisation-invitation',
        invitationId: commercialInvitationId,
        password: 'new-password', accessToken: 'provider-access',
      },
    }, res);

    expect(res.statusCode).toBe(expectedStatus);
    expect(res.body).toMatchObject({ error: expectedMessage, errorKind: 'onboarding' });
    expect(res.headers['set-cookie']).toBeUndefined();
    expect((global.fetch as jest.Mock).mock.calls.some(([url, options]) => url.includes('/auth/v1/user') && options?.method === 'PUT')).toBe(false);
    expect((global.fetch as jest.Mock).mock.calls.some(([url]) => url.includes('/auth/v1/token?grant_type=password'))).toBe(false);
    expect((global.fetch as jest.Mock).mock.calls.some(([url]) => url.includes('/ftf_accept_commercial_invitation_by_id'))).toBe(false);
  });

  test.each([
    ['database failure', 500, { message: 'provisioning failed' }],
    ['transactional recheck denial', 200, { accepted: false, code: 'INVITATION_REVOKED' }],
  ])('%s after password change provides recovery guidance and no trusted session', async (_scenario, acceptanceStatus, acceptanceBody) => {
    let passwordUpdated = false;
    global.fetch = jest.fn(async (url: string, options: RequestInit = {}) => {
      if (url.includes('/auth/v1/user') && options.method === 'PUT') {
        passwordUpdated = true;
        return response(200, { id: 'invited-auth-id', email: 'admin@example.com', user_metadata: {} });
      }
      if (url.includes('/auth/v1/user')) {
        return response(200, { id: 'invited-auth-id', email: 'admin@example.com', user_metadata: {} });
      }
      if (url.includes('/auth/v1/token?grant_type=password')) {
        if (!passwordUpdated) return response(400, { message: 'invalid credentials' });
        return response(200, {
          access_token: 'fresh-access', refresh_token: 'fresh-refresh', expires_in: 3600,
          user: { id: 'invited-auth-id', email: 'admin@example.com', user_metadata: {} },
        });
      }
      if (url.includes('/rest/v1/rpc/ftf_preflight_commercial_invitation')) {
        return response(200, { eligible: true, invitation_id: commercialInvitationId });
      }
      if (url.includes('/rest/v1/rpc/ftf_accept_commercial_invitation_by_id')) {
        return response(acceptanceStatus, acceptanceBody);
      }
      return response(500, { message: `unexpected request: ${url}` });
    }) as any;
    const res = createResponse();

    await authHandler({
      method: 'POST', headers: acceptanceHeaders,
      body: {
        action: 'accept-organisation-invitation',
        invitationId: commercialInvitationId,
        password: 'new-password', accessToken: 'provider-access',
      },
    }, res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({
      errorKind: 'onboarding',
      error: 'Your password was updated, but organisation activation could not be completed. Use password recovery or contact support.',
    });
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  test('failed tenant resolution after password change provides recovery guidance and no trusted session', async () => {
    let passwordUpdated = false;
    global.fetch = jest.fn(async (url: string, options: RequestInit = {}) => {
      if (url.includes('/auth/v1/user') && options.method === 'PUT') {
        passwordUpdated = true;
        return response(200, { id: 'invited-auth-id', email: 'admin@example.com', user_metadata: {} });
      }
      if (url.includes('/auth/v1/user')) {
        return response(200, { id: 'invited-auth-id', email: 'admin@example.com', user_metadata: {} });
      }
      if (url.includes('/auth/v1/token?grant_type=password')) {
        if (!passwordUpdated) return response(400, { message: 'invalid credentials' });
        return response(200, {
          access_token: 'fresh-access', refresh_token: 'fresh-refresh', expires_in: 3600,
          user: { id: 'invited-auth-id', email: 'admin@example.com', user_metadata: {} },
        });
      }
      if (url.includes('/rest/v1/rpc/ftf_preflight_commercial_invitation')) {
        return response(200, { eligible: true, invitation_id: commercialInvitationId });
      }
      if (url.includes('/rest/v1/rpc/ftf_accept_commercial_invitation_by_id')) {
        return response(200, { accepted: true, organisation_id: 'organisation-id' });
      }
      if (url.includes('/rest/v1/ftf_profiles')) return response(200, []);
      if (url.includes('/rest/v1/internal_users')) return response(200, []);
      return response(500, { message: `unexpected request: ${url}` });
    }) as any;
    const res = createResponse();

    await authHandler({
      method: 'POST', headers: acceptanceHeaders,
      body: {
        action: 'accept-organisation-invitation', invitationId: commercialInvitationId,
        password: 'new-password', accessToken: 'provider-access',
      },
    }, res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({
      errorKind: 'onboarding',
      error: 'Your password was updated, but organisation activation could not be completed. Use password recovery or contact support.',
    });
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  test.each([
    ['password update response', true],
    ['fresh session', false],
  ])('rejects a mismatched %s after password change with recovery guidance', async (_stage, mismatchOnUpdate) => {
    let passwordUpdated = false;
    global.fetch = jest.fn(async (url: string, options: RequestInit = {}) => {
      if (url.includes('/auth/v1/user') && options.method === 'PUT') {
        passwordUpdated = true;
        return response(200, { id: mismatchOnUpdate ? 'different-auth-id' : 'invited-auth-id', email: 'admin@example.com', user_metadata: {} });
      }
      if (url.includes('/auth/v1/user')) {
        return response(200, { id: 'invited-auth-id', email: 'admin@example.com', user_metadata: {} });
      }
      if (url.includes('/auth/v1/token?grant_type=password')) {
        if (!passwordUpdated) return response(400, { message: 'invalid credentials' });
        return response(200, {
          access_token: 'wrong-user-access', refresh_token: 'wrong-user-refresh', expires_in: 3600,
          user: { id: 'different-auth-id', email: 'admin@example.com', user_metadata: {} },
        });
      }
      if (url.includes('/rest/v1/rpc/ftf_preflight_commercial_invitation')) {
        return response(200, { eligible: true, invitation_id: commercialInvitationId });
      }
      return response(500, { message: `unexpected request: ${url}` });
    }) as any;
    const res = createResponse();

    await authHandler({
      method: 'POST', headers: acceptanceHeaders,
      body: {
        action: 'accept-organisation-invitation', invitationId: commercialInvitationId,
        password: 'new-password', accessToken: 'provider-access',
      },
    }, res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({
      errorKind: 'authentication',
      error: 'Your password was updated, but a fresh session could not be verified. Use password recovery or contact support.',
    });
    expect((global.fetch as jest.Mock).mock.calls.some(([url]) => url.includes('/ftf_accept_commercial_invitation_by_id'))).toBe(false);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  test('uses the current-password sign-in path for same-password same-user replay', async () => {
    global.fetch = jest.fn(async (url: string, options: RequestInit = {}) => {
      if (url.includes('/auth/v1/user') && options.method === 'PUT') {
        return response(500, { message: 'same password must not be mutated' });
      }
      if (url.includes('/auth/v1/user')) {
        return response(200, { id: 'existing-confirmed-user', email: 'admin@example.com', user_metadata: { name: 'Alex Admin' } });
      }
      if (url.includes('/auth/v1/token?grant_type=password')) {
        return response(200, {
          access_token: 'current-password-access', refresh_token: 'current-password-refresh', expires_in: 3600,
          user: { id: 'existing-confirmed-user', email: 'admin@example.com', user_metadata: { name: 'Alex Admin' } },
        });
      }
      if (url.includes('/rest/v1/rpc/ftf_preflight_commercial_invitation')) {
        return response(200, { eligible: true, already_provisioned: true, invitation_id: commercialInvitationId, organisation_id: 'organisation-id' });
      }
      if (url.includes('/rest/v1/rpc/ftf_accept_commercial_invitation_by_id')) {
        return response(200, {
          accepted: true, already_provisioned: true, invitation_id: commercialInvitationId, organisation_id: 'organisation-id',
        });
      }
      if (url.includes('/rest/v1/ftf_profiles')) {
        return response(200, [{ user_id: 'existing-confirmed-user', tenant_id: 'organisation-id', role: 'admin', name: 'Alex Admin', tier: 'free' }]);
      }
      return response(500, { message: `unexpected request: ${url}` });
    }) as any;
    const res = createResponse();

    await authHandler({
      method: 'POST', headers: acceptanceHeaders,
      body: {
        action: 'accept-organisation-invitation',
        invitationId: commercialInvitationId,
        password: 'current-password', accessToken: 'magic-link-access',
      },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.user).toMatchObject({ id: 'existing-confirmed-user', tenantId: 'organisation-id' });
    expect((global.fetch as jest.Mock).mock.calls.some(([url, options]) => url.includes('/auth/v1/user') && options?.method === 'PUT')).toBe(false);
    expect(res.headers['set-cookie']).toEqual(expect.arrayContaining([
      expect.stringContaining('ftf_access_token=current-password-access'),
      expect.stringContaining('ftf_refresh_token=current-password-refresh'),
    ]));
  });

  test.each([
    ['missing Origin', { ...acceptanceHeaders, origin: undefined }, 403],
    ['wrong Origin', { ...acceptanceHeaders, origin: 'https://attacker.example' }, 403],
    ['non-JSON content', { ...acceptanceHeaders, 'content-type': 'text/plain' }, 415],
    ['same-site fetch metadata', { ...acceptanceHeaders, 'sec-fetch-site': 'same-site' }, 403],
  ])('rejects %s before provider or database calls', async (_label, headers, status) => {
    global.fetch = jest.fn() as any;
    const res = createResponse();

    await authHandler({
      method: 'POST', headers,
      body: { action: 'accept-organisation-invitation', invitationId: commercialInvitationId, password: 'new-password', accessToken: 'provider-access' },
    }, res);

    expect(res.statusCode).toBe(status);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  test('rejects an authentication failure without presenting it as an onboarding decision', async () => {
    global.fetch = jest.fn(async (url: string) => {
      if (url.includes('/auth/v1/user')) return response(401, { message: 'expired provider token' });
      return response(500, { message: `unexpected request: ${url}` });
    }) as any;
    const res = createResponse();

    await authHandler({
      method: 'POST', headers: acceptanceHeaders,
      body: {
        action: 'accept-organisation-invitation',
        invitationId: commercialInvitationId,
        password: 'new-password', accessToken: 'expired-access',
      },
    }, res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ error: 'This authentication link is invalid or expired.', errorKind: 'authentication' });
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  test('returns a non-enumerating response and production reset callback for forgot password', async () => {
    let recoveryUrl = '';
    global.fetch = jest.fn(async (url: string) => {
      recoveryUrl = url;
      return response(200, {});
    }) as any;
    const res = createResponse();

    await authHandler({
      method: 'POST', headers: { host: 'localhost:3001' },
      body: { action: 'forgot-password', email: 'unknown@example.com' },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ message: 'If an account exists for that email, a password reset link has been sent.' });
    expect(recoveryUrl).toContain('/auth/v1/recover?redirect_to=');
    expect(recoveryUrl).toContain(encodeURIComponent('https://spray-command-production-beta.vercel.app/reset-password'));
  });

  test('updates a recovery-session password and preserves the existing tenant profile', async () => {
    const requests: Array<{ url: string; options: RequestInit }> = [];
    global.fetch = jest.fn(async (url: string, options: RequestInit = {}) => {
      requests.push({ url, options });
      if (url.includes('/auth/v1/user')) {
        return response(200, { id: 'owner-auth-id', email: 'ben@flythefarm.com.au', user_metadata: { name: 'Ben' } });
      }
      if (url.includes('/rest/v1/ftf_profiles')) {
        return response(200, [{ user_id: 'owner-auth-id', tenant_id: 'tenant-a', role: 'admin', name: 'Ben', tier: 'beta' }]);
      }
      return response(500, { message: 'unexpected request' });
    }) as any;
    const res = createResponse();

    await authHandler({
      method: 'POST', headers: { host: 'localhost:3001' },
      body: {
        action: 'reset-password', accessToken: 'recovery-access', refreshToken: 'recovery-refresh',
        expiresIn: 3600, password: 'new-password',
      },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.user).toMatchObject({ id: 'owner-auth-id', tenantId: 'tenant-a' });
    const update = requests.find(({ url, options }) => url.includes('/auth/v1/user') && options.method === 'PUT');
    expect(JSON.parse(String(update?.options.body))).toEqual({ password: 'new-password' });
    const passwordUpdateIndex = requests.findIndex(({ url, options }) => url.includes('/auth/v1/user') && options.method === 'PUT');
    const identityLookupIndex = requests.findIndex(({ url }) => url.includes('/rest/v1/ftf_profiles'));
    expect(passwordUpdateIndex).toBeGreaterThanOrEqual(0);
    expect(identityLookupIndex).toBeGreaterThan(passwordUpdateIndex);
  });
});

export {};
