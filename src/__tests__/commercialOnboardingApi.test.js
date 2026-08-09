jest.mock('../../server/supabase', () => ({ supabaseRequest: jest.fn() }));
const { supabaseRequest } = require('../../server/supabase');
const { CommercialOnboardingRepository, createCommercialOnboardingHandler } = require('../../server/commercial-onboarding-api');

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

function repository() {
  return {
    submitApplication: jest.fn().mockResolvedValue({ submitted: true, application_id: 'application-1', application_reference: 'SC-APP-A1B2C3D4E5F6', status: 'SUBMITTED', row_version: 1 }),
    listApplications: jest.fn().mockResolvedValue([]),
    reviewApplication: jest.fn().mockResolvedValue({ reviewed: true, application_id: 'application-1', status: 'APPROVED', row_version: 3 }),
    issueInvitation: jest.fn().mockResolvedValue({ issued: true, invitation_id: 'invitation-1', status: 'SENT', row_version: 1, expires_at: '2026-08-16T00:00:00.000Z' }),
    revokeInvitation: jest.fn().mockResolvedValue({ revoked: true, invitation_id: 'invitation-1', status: 'REVOKED', row_version: 2 }),
  };
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

test('enforces the exact permission for each platform transition', async () => {
  const repo = repository();
  const handler = createCommercialOnboardingHandler({ repository: repo, resolvePlatformContext: async () => platformContext(['platform.onboarding.application.read']) });

  const listRes = response();
  await handler(req('GET', 'list'), listRes);
  expect(listRes.statusCode).toBe(200);

  const issueRes = response();
  await handler(req('POST', 'issue', { applicationId: 'application-1', expectedVersion: 3, notes: 'Approved for onboarding.' }), issueRes);
  expect(issueRes.statusCode).toBe(403);
  expect(issueRes.body.error.code).toBe('FORBIDDEN');
  expect(repo.issueInvitation).not.toHaveBeenCalled();
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
  repo.listApplications.mockResolvedValue([{
    id: 'application-1', application_reference: 'SC-APP-A1B2C3D4E5F6', business_name: 'Western Downs Aerial Application',
    intended_administrator_name: 'Alex Morgan', intended_administrator_email: 'alex@example.com', intended_administrator_phone: '07 4000 0000',
    submitted_payload: validApplication, application_notes: validApplication.notes, status: 'APPROVED', row_version: 3,
    submitted_at: '2026-08-09T00:00:00.000Z', reviewed_at: '2026-08-09T01:00:00.000Z', decision_notes: 'Evidence checked.',
    reviewer: { display_name: 'Platform Reviewer' }, application_events: [], invitations: [],
    missions: [{ id: 'customer-mission' }], clients: [{ id: 'customer-client' }], financials: { revenue: 1000 },
  }]);
  const handler = createCommercialOnboardingHandler({ repository: repo, resolvePlatformContext: async () => platformContext(['platform.onboarding.application.read']) });
  const res = response();
  await handler(req('GET', 'list'), res);

  expect(res.statusCode).toBe(200);
  expect(res.body.data[0]).toEqual(expect.objectContaining({ applicationReference: 'SC-APP-A1B2C3D4E5F6', businessName: 'Western Downs Aerial Application' }));
  expect(JSON.stringify(res.body)).not.toMatch(/customer-mission|customer-client|revenue/);
});

test('repository scopes current application and invitation evidence instead of using global history caps', async () => {
  supabaseRequest.mockImplementation(async (path) => {
    if (path.startsWith('rest/v1/commercial_onboarding_applications?')) return [{
      id: 'application-1', application_reference: 'SC-APP-A1B2C3D4E5F6', business_name: 'Western Downs',
      intended_administrator_name: 'Alex', intended_administrator_email: 'alex@example.com', intended_administrator_phone: '0700000000',
      submitted_payload: validApplication, consent_version: validApplication.consentVersion, application_notes: validApplication.notes,
      status: 'APPROVED', row_version: 3, submitted_at: '2026-08-09T00:00:00Z', updated_at: '2026-08-09T01:00:00Z',
      reviewed_by_platform_user_id: 'platform-1', reviewed_at: '2026-08-09T01:00:00Z', decision_notes: 'Approved.',
    }];
    if (path.startsWith('rest/v1/commercial_onboarding_application_events?')) return [];
    if (path.startsWith('rest/v1/commercial_onboarding_invitations?')) return [{ id: 'invitation-1', application_id: 'application-1', status: 'SENT', row_version: 1 }];
    if (path.startsWith('rest/v1/commercial_onboarding_invitation_events?')) return [];
    if (path.startsWith('rest/v1/platform_users?')) return [{ id: 'platform-1', display_name: 'Reviewer' }];
    return [];
  });
  await new CommercialOnboardingRepository().listApplications();
  const paths = supabaseRequest.mock.calls.map(([path]) => path);
  expect(paths).toEqual(expect.arrayContaining([
    expect.stringContaining('commercial_onboarding_application_events?application_id=in.(application-1)'),
    expect.stringContaining('commercial_onboarding_invitations?application_id=in.(application-1)'),
    expect.stringContaining('commercial_onboarding_invitation_events?invitation_id=in.(invitation-1)'),
  ]));
  expect(paths.join('\n')).not.toMatch(/commercial_onboarding_(?:application|invitation)_events[^\n]*limit=/);
});
