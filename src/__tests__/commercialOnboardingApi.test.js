jest.mock('../../server/supabase', () => ({ supabaseRequest: jest.fn() }));
const { supabaseRequest } = require('../../server/supabase');
const { CommercialOnboardingRepository, SupabaseInvitationDelivery, createCommercialOnboardingHandler } = require('../../server/commercial-onboarding-api');

const validApplication = {
  businessName: 'Western Downs Aerial Application',
  administratorName: 'Alex Morgan',
  administratorEmail: 'alex@example.com',
  administratorPhone: '07 4000 0000',
  base: {
    name: 'Dalby Base',
    address: '1 Farm Road, Dalby QLD 4405',
    latitude: -27.1817,
    longitude: 151.2621,
    timezone: 'Australia/Brisbane',
    addressSource: 'GEOCODED',
    locationConfirmedAt: '2026-08-09T00:00:00.000Z',
  },
  consentVersion: 'commercial-application-2026-08-09',
  notes: 'We operate across the Western Downs and need a controlled onboarding path.',
};

function response() {
  return {
    statusCode: 200, body: null, headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    getHeader(name) { return this.headers[name]; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

function req(method, action, body, headers = {}) {
  return {
    method, query: { action }, body,
    headers: { origin: 'https://spray-command.test', host: 'spray-command.test', 'x-forwarded-proto': 'https', ...headers },
  };
}

const platformContext = (permissions) => ({
  authUser: { id: 'auth-platform-1', email: 'reviewer@spray-command.test' },
  platformUser: { id: 'platform-1', name: 'Platform Reviewer' },
  roles: ['platform-administrator'], permissions,
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.COMMERCIAL_ONBOARDING_FINGERPRINT_SECRET = 'test-only-fingerprint-secret-with-enough-entropy';
  process.env.COMMERCIAL_ONBOARDING_APP_ORIGIN = 'https://spray-command.test';
  process.env.COMMERCIAL_ONBOARDING_TRUSTED_IP_HEADER = 'x-forwarded-for';
});

function repository() {
  return {
    submitApplication: jest.fn().mockResolvedValue({ submitted: true, application_id: 'application-1', application_reference: 'SC-APP-A1B2C3D4E5F6', status: 'SUBMITTED', row_version: 1 }),
    listApplications: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    reviewApplication: jest.fn().mockResolvedValue({ reviewed: true, application_id: 'application-1', status: 'APPROVED', row_version: 3 }),
    issueInvitation: jest.fn().mockResolvedValue({ issued: true, invitation_id: 'invitation-1', intended_administrator_email: 'alex@example.com', status: 'PENDING', row_version: 1, expires_at: '2026-08-16T00:00:00.000Z' }),
    markInvitationDelivery: jest.fn().mockResolvedValue({ delivered: true, invitation_id: 'invitation-1', status: 'SENT', row_version: 2, sent_at: '2026-08-09T00:00:00.000Z' }),
    revokeInvitation: jest.fn().mockResolvedValue({ revoked: true, invitation_id: 'invitation-1', status: 'REVOKED', row_version: 2 }),
  };
}

function delivery() {
  return { sendInvitation: jest.fn().mockResolvedValue({ providerReference: 'supabase-user-1' }) };
}

test('an unauthenticated applicant may submit but cannot review an application', async () => {
  const repo = repository();
  const unauthenticated = Object.assign(new Error('Sign in required.'), { statusCode: 401, code: 'UNAUTHENTICATED' });
  const handler = createCommercialOnboardingHandler({ repository: repo, resolvePlatformContext: jest.fn().mockRejectedValue(unauthenticated) });
  const applyResponse = response();
  await handler(req('POST', 'apply', validApplication), applyResponse);
  expect(applyResponse.statusCode).toBe(201);
  expect(applyResponse.body).toEqual({ data: { submitted: true, applicationReference: 'SC-APP-A1B2C3D4E5F6' }, meta: { correlationId: expect.any(String) } });
  expect(applyResponse.body.data.applicationId).toBeUndefined();
  expect(repo.submitApplication).toHaveBeenCalledWith(
    expect.objectContaining({ administratorEmail: 'alex@example.com' }),
    expect.stringMatching(/^[0-9a-f]{64}$/),
  );

  const approveResponse = response();
  await handler(req('POST', 'approve', { applicationId: 'application-1', expectedVersion: 2, notes: 'Evidence checked.' }), approveResponse);
  expect(approveResponse.statusCode).toBe(401);
  expect(approveResponse.body.error.code).toBe('UNAUTHENTICATED');
});

test('approval records a decision but does not create an invitation', async () => {
  const repo = repository();
  const handler = createCommercialOnboardingHandler({
    repository: repo,
    resolvePlatformContext: async () => platformContext(['platform.onboarding.application.review']),
  });
  const res = response();
  await handler(req('POST', 'approve', { applicationId: 'application-1', expectedVersion: 2, notes: 'Business and Base evidence verified.' }), res);

  expect(res.statusCode).toBe(200);
  expect(repo.reviewApplication).toHaveBeenCalledWith('application-1', 'platform-1', 2, 'APPROVE', 'Business and Base evidence verified.');
  expect(repo.issueInvitation).not.toHaveBeenCalled();
});

test.each([
  ['list', 'GET', undefined, 'platform.onboarding.application.read', 'listApplications'],
  ['review', 'POST', { applicationId: 'application-1', expectedVersion: 1, notes: 'Review evidence.' }, 'platform.onboarding.application.review', 'reviewApplication'],
  ['approve', 'POST', { applicationId: 'application-1', expectedVersion: 2, notes: 'Approval evidence.' }, 'platform.onboarding.application.review', 'reviewApplication'],
  ['decline', 'POST', { applicationId: 'application-1', expectedVersion: 2, notes: 'Decline evidence.' }, 'platform.onboarding.application.review', 'reviewApplication'],
  ['issue', 'POST', { applicationId: 'application-1', expectedVersion: 3, notes: 'Issue evidence.' }, 'platform.onboarding.invitation.issue', 'issueInvitation'],
  ['resend', 'POST', { applicationId: 'application-1', expectedVersion: 3, notes: 'Resend evidence.' }, 'platform.onboarding.invitation.issue', 'issueInvitation'],
  ['revoke', 'POST', { invitationId: 'invitation-1', expectedVersion: 2, reason: 'Revoke evidence.' }, 'platform.onboarding.invitation.revoke', 'revokeInvitation'],
])('enforces only the exact permission for %s', async (action, method, body, exactPermission, repositoryMethod) => {
  const deniedRepository = repository();
  const denied = createCommercialOnboardingHandler({ repository: deniedRepository, invitationDelivery: delivery(), resolvePlatformContext: async () => platformContext(['platform.onboarding.application.read'].filter((permission) => permission !== exactPermission)) });
  const deniedResponse = response();
  await denied(req(method, action, body), deniedResponse);
  expect(deniedResponse.statusCode).toBe(403);
  expect(deniedResponse.body.error.code).toBe('FORBIDDEN');
  expect(deniedRepository[repositoryMethod]).not.toHaveBeenCalled();

  const allowedRepository = repository();
  const allowed = createCommercialOnboardingHandler({ repository: allowedRepository, invitationDelivery: delivery(), resolvePlatformContext: async () => platformContext([exactPermission]), randomToken: () => 'raw-token-with-enough-entropy-for-provider-only-0001', now: () => new Date('2026-08-09T00:00:00.000Z') });
  const allowedResponse = response();
  await allowed(req(method, action, body), allowedResponse);
  expect(allowedResponse.statusCode).toBeLessThan(300);
  expect(allowedRepository[repositoryMethod]).toHaveBeenCalled();
});

test('rejects cross-origin, oversized, and incomplete public applications before persistence', async () => {
  const repo = repository();
  const handler = createCommercialOnboardingHandler({ repository: repo });

  const crossOrigin = response();
  await handler(req('POST', 'apply', validApplication, { origin: 'https://attacker.test' }), crossOrigin);
  expect(crossOrigin.statusCode).toBe(403);

  const oversized = response();
  await handler(req('POST', 'apply', validApplication, { 'content-length': '25000' }), oversized);
  expect(oversized.statusCode).toBe(413);

  const invalid = response();
  await handler(req('POST', 'apply', { ...validApplication, base: { ...validApplication.base, locationConfirmedAt: '' } }), invalid);
  expect(invalid.statusCode).toBe(400);
  expect(invalid.body.error).toEqual(expect.objectContaining({ code: 'APPLICATION_INVALID' }));
  expect(repo.submitApplication).not.toHaveBeenCalled();
});

test.each([
  ['apply', validApplication],
  ['approve', { applicationId: 'application-1', expectedVersion: 2, notes: 'Evidence checked.' }],
  ['issue', { applicationId: 'application-1', expectedVersion: 3, notes: 'Approved invitation.' }],
  ['revoke', { invitationId: 'invitation-1', expectedVersion: 1, reason: 'Invitation replaced.' }],
])('rejects an originless %s mutation before authentication or persistence', async (action, body) => {
  const repo = repository();
  const resolvePlatformContext = jest.fn().mockResolvedValue(platformContext([
    'platform.onboarding.application.review', 'platform.onboarding.invitation.issue', 'platform.onboarding.invitation.revoke',
  ]));
  const handler = createCommercialOnboardingHandler({ repository: repo, resolvePlatformContext });
  const res = response();
  await handler(req('POST', action, body, { origin: undefined }), res);
  expect(res.statusCode).toBe(403);
  expect(res.body.error.code).toBe('CROSS_ORIGIN_REQUEST');
  expect(resolvePlatformContext).not.toHaveBeenCalled();
  expect(repo.submitApplication).not.toHaveBeenCalled();
  expect(repo.reviewApplication).not.toHaveBeenCalled();
  expect(repo.issueInvitation).not.toHaveBeenCalled();
  expect(repo.revokeInvitation).not.toHaveBeenCalled();
});

test('list responses expose application evidence but never unrelated customer operational data', async () => {
  const repo = repository();
  repo.listApplications.mockResolvedValue({ items: [{
    id: 'application-1', application_reference: 'SC-APP-A1B2C3D4E5F6', business_name: 'Western Downs Aerial Application',
    intended_administrator_name: 'Alex Morgan', intended_administrator_email: 'alex@example.com', intended_administrator_phone: '07 4000 0000',
    submitted_payload: { ...validApplication, base: { ...validApplication.base, locationConfirmedAt: undefined } },
    location_evidence: { application_id: 'application-1', location_confirmed_at: '2026-08-09T00:00:00.000Z', address_source: 'GEOCODED' },
    application_notes: validApplication.notes, status: 'APPROVED', row_version: 3,
    submitted_at: '2026-08-09T00:00:00.000Z', reviewed_at: '2026-08-09T01:00:00.000Z', decision_notes: 'Evidence checked.',
    reviewer: { display_name: 'Platform Reviewer' }, application_events: [], invitations: [],
    missions: [{ id: 'customer-mission' }], clients: [{ id: 'customer-client' }], financials: { revenue: 1000 },
  }], nextCursor: 'next-opaque-cursor' });
  const handler = createCommercialOnboardingHandler({ repository: repo, resolvePlatformContext: async () => platformContext(['platform.onboarding.application.read']) });
  const res = response();
  await handler(req('GET', 'list'), res);

  expect(res.statusCode).toBe(200);
  expect(res.body.data[0]).toEqual(expect.objectContaining({ applicationReference: 'SC-APP-A1B2C3D4E5F6', businessName: 'Western Downs Aerial Application' }));
  expect(res.body.data[0].base).toEqual(expect.objectContaining({ locationConfirmedAt: '2026-08-09T00:00:00.000Z', addressSource: 'GEOCODED' }));
  expect(res.body.meta.nextCursor).toBe('next-opaque-cursor');
  expect(JSON.stringify(res.body)).not.toMatch(/customer-mission|customer-client|revenue/);
});

test('repository uses stable cursor pagination and scopes evidence to the current page', async () => {
  supabaseRequest.mockImplementation(async (path) => {
    if (path.startsWith('rest/v1/commercial_onboarding_applications?')) return [{
      id: 'application-1', application_reference: 'SC-APP-A1B2C3D4E5F6', business_name: 'Western Downs',
      intended_administrator_name: 'Alex', intended_administrator_email: 'alex@example.com', intended_administrator_phone: '0700000000',
      submitted_payload: validApplication, consent_version: validApplication.consentVersion, application_notes: validApplication.notes,
      status: 'APPROVED', row_version: 3, submitted_at: '2026-08-09T00:00:00Z', updated_at: '2026-08-09T01:00:00Z',
      reviewed_by_platform_user_id: 'platform-1', reviewed_at: '2026-08-09T01:00:00Z', decision_notes: 'Approved.',
    }, {
      id: 'application-2', application_reference: 'SC-APP-F6E5D4C3B2A1', business_name: 'Overflow page marker',
      intended_administrator_name: 'Casey', intended_administrator_email: 'casey@example.com', intended_administrator_phone: '0700000001',
      submitted_payload: validApplication, consent_version: validApplication.consentVersion, application_notes: '',
      status: 'SUBMITTED', row_version: 1, submitted_at: '2026-08-08T00:00:00Z', updated_at: '2026-08-08T00:00:00Z',
    }];
    if (path.startsWith('rest/v1/commercial_onboarding_application_events?')) return [];
    if (path.startsWith('rest/v1/commercial_onboarding_invitations?')) return [{ id: 'invitation-1', application_id: 'application-1', status: 'SENT', row_version: 1 }];
    if (path.startsWith('rest/v1/commercial_onboarding_application_location_evidence?')) return [{ application_id: 'application-1', location_confirmed_at: '2026-08-09T00:00:00Z', address_source: 'GEOCODED' }];
    if (path.startsWith('rest/v1/commercial_onboarding_invitation_events?')) return [];
    if (path.startsWith('rest/v1/platform_users?')) return [{ id: 'platform-1', display_name: 'Reviewer' }];
    return [];
  });
  const firstPage = await new CommercialOnboardingRepository({ pageSize: 1 }).listApplications();
  expect(firstPage.items).toHaveLength(1);
  expect(firstPage.nextCursor).toEqual(expect.any(String));
  const paths = supabaseRequest.mock.calls.map(([path]) => path);
  expect(paths).toEqual(expect.arrayContaining([
    expect.stringContaining('commercial_onboarding_application_events?application_id=in.(application-1)'),
    expect.stringContaining('commercial_onboarding_invitations?application_id=in.(application-1)'),
    expect.stringContaining('commercial_onboarding_application_location_evidence?application_id=in.(application-1)'),
    expect.stringContaining('commercial_onboarding_invitation_events?invitation_id=in.(invitation-1)'),
  ]));
  expect(paths[0]).toContain('order=submitted_at.desc%2Cid.desc');
  expect(paths[0]).toContain('limit=2');
  expect(paths.join('\n')).not.toMatch(/commercial_onboarding_(?:application|invitation)_events[^\n]*limit=/);

  supabaseRequest.mockClear();
  supabaseRequest.mockResolvedValue([]);
  await new CommercialOnboardingRepository({ pageSize: 1 }).listApplications(firstPage.nextCursor);
  expect(supabaseRequest.mock.calls[0][0]).toContain('or=');
});

test('delivers invitations through Supabase Auth and never returns the raw token', async () => {
  const repo = repository();
  const provider = delivery();
  const handler = createCommercialOnboardingHandler({
    repository: repo, invitationDelivery: provider,
    resolvePlatformContext: async () => platformContext(['platform.onboarding.invitation.issue']),
    randomToken: () => 'raw-token-with-enough-entropy-for-provider-only-0001',
    now: () => new Date('2026-08-09T00:00:00.000Z'),
  });
  const res = response();
  await handler(req('POST', 'issue', { applicationId: 'application-1', expectedVersion: 3, notes: 'Approved invitation.' }), res);

  expect(provider.sendInvitation).toHaveBeenCalledWith('alex@example.com', 'https://spray-command.test/onboarding/accept?token=raw-token-with-enough-entropy-for-provider-only-0001', { resend: false });
  expect(repo.markInvitationDelivery).toHaveBeenCalledWith('invitation-1', 'platform-1', 1, 'SENT', 'supabase-user-1', 'Supabase Auth invitation delivered.');
  expect(res.statusCode).toBe(201);
  expect(res.body.data).toMatchObject({ delivered: true, status: 'SENT' });
  expect(JSON.stringify(res.body)).not.toMatch(/raw-token|invitationPath|token=/);
});

test('fails closed and revokes prepared evidence when Supabase Auth delivery fails', async () => {
  const repo = repository();
  repo.markInvitationDelivery.mockResolvedValue({ failed: true, invitation_id: 'invitation-1', status: 'REVOKED', row_version: 2 });
  const provider = delivery();
  provider.sendInvitation.mockRejectedValue(new Error('provider details must remain private'));
  const handler = createCommercialOnboardingHandler({
    repository: repo, invitationDelivery: provider,
    resolvePlatformContext: async () => platformContext(['platform.onboarding.invitation.issue']),
    randomToken: () => 'raw-token-with-enough-entropy-for-provider-only-0001',
    now: () => new Date('2026-08-09T00:00:00.000Z'),
  });
  const res = response();
  await handler(req('POST', 'resend', { applicationId: 'application-1', expectedVersion: 3, notes: 'Replacement invitation.' }), res);

  expect(repo.markInvitationDelivery).toHaveBeenCalledWith('invitation-1', 'platform-1', 1, 'FAILED', null, 'Supabase Auth invitation delivery failed.');
  expect(res.statusCode).toBe(502);
  expect(res.body.error).toEqual(expect.objectContaining({ code: 'INVITATION_DELIVERY_FAILED' }));
  expect(JSON.stringify(res.body)).not.toMatch(/provider details|raw-token|token=/);
});

test('maps durable public rate limiting to one generic non-enumerating response', async () => {
  const repo = repository();
  repo.submitApplication.mockResolvedValue({ submitted: false, code: 'APPLICATION_RATE_LIMITED' });
  const handler = createCommercialOnboardingHandler({ repository: repo });
  const res = response();
  await handler(req('POST', 'apply', validApplication, { 'x-forwarded-for': '203.0.113.5, 10.0.0.1', 'user-agent': 'bounded test browser' }), res);
  expect(res.statusCode).toBe(429);
  expect(res.body.error).toEqual(expect.objectContaining({ code: 'APPLICATION_UNAVAILABLE', message: 'Application could not be accepted at this time.' }));
  expect(JSON.stringify(res.body)).not.toMatch(/email|fingerprint|rate.limit/i);
});

test('Supabase invitation delivery uses the server Auth endpoint and redirect URL', async () => {
  supabaseRequest.mockResolvedValue({ id: 'supabase-user-1' });
  const result = await new SupabaseInvitationDelivery().sendInvitation(
    'alex@example.com',
    'https://spray-command.test/onboarding/accept?token=server-only-token',
  );
  expect(result).toEqual({ providerReference: 'supabase-user-1' });
  expect(supabaseRequest).toHaveBeenCalledWith(
    expect.stringContaining('auth/v1/invite?redirect_to=https%3A%2F%2Fspray-command.test%2Fonboarding%2Faccept%3Ftoken%3Dserver-only-token'),
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'alex@example.com' }) }),
  );

  supabaseRequest.mockClear();
  await new SupabaseInvitationDelivery().sendInvitation(
    'alex@example.com',
    'https://spray-command.test/onboarding/accept?token=server-only-token',
    { resend: true },
  );
  expect(supabaseRequest).toHaveBeenCalledWith(
    expect.stringContaining('auth/v1/otp?redirect_to='),
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'alex@example.com', create_user: true }) }),
  );
});

test('fingerprints a trusted bounded address independently of caller-controlled User-Agent', async () => {
  const repo = repository();
  const handler = createCommercialOnboardingHandler({ repository: repo });
  await handler(req('POST', 'apply', validApplication, { 'x-forwarded-for': '203.0.113.5', 'user-agent': 'attacker-variant-a' }), response());
  await handler(req('POST', 'apply', validApplication, { 'x-forwarded-for': '203.0.113.5', 'user-agent': 'attacker-variant-b' }), response());
  const fingerprints = repo.submitApplication.mock.calls.map((call) => call[1]);
  expect(fingerprints[0]).toBe(fingerprints[1]);
  expect(fingerprints[0]).toMatch(/^[0-9a-f]{64}$/);
});
