jest.mock('../../server/supabase', () => ({ supabaseRequest: jest.fn() }));

const { supabaseRequest } = require('../../server/supabase');
const { ComplianceRepository } = require('../../server/compliance-repository');

test('compliance projection receives the caller location scope and restricted-record authority', async () => {
  supabaseRequest.mockResolvedValue({ healthScore: { percentage: 80 } });
  const context = {
    organisation: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    operatingLocationIds: ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
    permissions: ['compliance.read'],
  };

  await new ComplianceRepository().readOverview(context);

  expect(JSON.parse(supabaseRequest.mock.calls[0][1].body)).toEqual({
    p_organisation_id: context.organisation.id,
    p_operating_location_ids: context.operatingLocationIds,
    p_include_restricted: false,
  });
});

test('restricted compliance permission is explicit in the projection contract', async () => {
  supabaseRequest.mockResolvedValue({});
  const context = {
    organisation: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    operatingLocationIds: [],
    permissions: ['compliance.read', 'compliance.restricted.read'],
  };

  await new ComplianceRepository().readOverview(context);

  expect(JSON.parse(supabaseRequest.mock.calls[0][1].body).p_include_restricted).toBe(true);
});
