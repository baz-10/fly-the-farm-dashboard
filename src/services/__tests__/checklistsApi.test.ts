import { createChecklistsApi } from '../checklistsApi';

const locationId = '11111111-1111-4111-8111-111111111111';
const missionId = '22222222-2222-4222-8222-222222222222';

test('requests checked applicability with exact Base and Mission scope', async () => {
  const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { records: [] } }) });
  await createChecklistsApi(fetcher as any).templates({ operatingLocationId: locationId, lifecycleStage: 'PRE_FLIGHT', missionId });
  expect(fetcher.mock.calls[0][0]).toContain(`operatingLocationId=${locationId}`);
  expect(fetcher.mock.calls[0][0]).toContain(`missionId=${missionId}`);
});

test('fails whole on malformed applicable-template authority', async () => {
  const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { records: [{ template: { id: 'not-a-uuid' } }] } }) });
  await expect(createChecklistsApi(fetcher as any).templates({ operatingLocationId: locationId, lifecycleStage: 'PRE_FLIGHT' }))
    .rejects.toThrow('Checklist response was invalid.');
});

test('does not expose arbitrary server diagnostics', async () => {
  const fetcher = jest.fn().mockResolvedValue({ ok: false, json: async () => ({ error: { message: 'Bearer secret-value' } }) });
  await expect(createChecklistsApi(fetcher as any).mission(missionId)).rejects.toThrow('Checklist request failed.');
});
