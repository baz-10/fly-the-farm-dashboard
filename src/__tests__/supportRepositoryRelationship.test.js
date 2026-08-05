jest.mock('../../server/supabase', () => ({
  supabaseRequest: jest.fn(),
}));

const { supabaseRequest } = require('../../server/supabase');
const { SupportRepository } = require('../../server/support-repository');

describe('SupportRepository delegated-session relationship', () => {
  beforeEach(() => jest.clearAllMocks());

  test('loads organisation identity through the owning support request', async () => {
    supabaseRequest.mockResolvedValue([{
      id: 'session-1',
      organisation_id: 'organisation-1',
      platform_user_id: 'platform-1',
      access_mode: 'READ_ONLY',
      scope_type: 'ORGANISATION',
      reason: 'Production acceptance',
      state: 'ACTIVE',
      started_at: '2026-08-05T00:00:00.000Z',
      expires_at: '2026-08-05T02:00:00.000Z',
      support_requests: {
        organisations: { name: 'Fly The Farm' },
        support_approval_events: [{
          approved_by_internal_user_id: 'approver-1',
          decision: 'APPROVE',
          approval_timestamp: '2026-08-04T23:59:00.000Z',
        }],
      },
    }]);

    const result = await new SupportRepository().resolveSession('session-1', 'platform-1');

    const requestedPath = supabaseRequest.mock.calls[0][0];
    const select = decodeURIComponent(new URLSearchParams(requestedPath.split('?')[1]).get('select'));
    expect(select).toContain('support_requests(support_approval_events(');
    expect(select).toContain('organisations(name)');
    expect(select).not.toMatch(/(?:^|,)organisations\(name\)$/);
    expect(result).toMatchObject({
      id: 'session-1',
      organisationId: 'organisation-1',
      organisationName: 'Fly The Farm',
      approvedByInternalUserId: 'approver-1',
    });
  });
});
