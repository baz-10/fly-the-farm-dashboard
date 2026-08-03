import { createMissionOutcomesApi } from '../missionOutcomesApi';

test('uses one versioned Mission Outcomes resource for reads and append-only commands', async () => {
  const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { id: 'record' } }) });
  const api = createMissionOutcomesApi(fetcher as any);
  await api.read('m1');
  await api.createObservation('m1', { observationTypeCode: 'INITIAL' } as any);
  await api.writeFollowUp('m1', null, 0, { description: 'Inspect again' } as any);
  expect(fetcher).toHaveBeenNthCalledWith(1, '/api/v1/mission-outcomes?missionId=m1', expect.objectContaining({ credentials: 'same-origin' }));
  expect(fetcher).toHaveBeenNthCalledWith(2, '/api/v1/mission-outcomes?missionId=m1&action=observation', expect.objectContaining({ method: 'POST' }));
  expect(fetcher).toHaveBeenNthCalledWith(3, '/api/v1/mission-outcomes?missionId=m1&action=follow-up', expect.objectContaining({ body: JSON.stringify({ actionId: null, expectedVersion: 0, description: 'Inspect again' }) }));
});

test('surfaces the trusted API error without falling back locally', async () => {
  const api = createMissionOutcomesApi(jest.fn().mockResolvedValue({ ok: false, json: async () => ({ error: { code: 'COMPLETION_REQUIRED', message: 'Complete the Mission first.' } }) }) as any);
  await expect(api.read('m1')).rejects.toMatchObject({ code: 'COMPLETION_REQUIRED', message: 'Complete the Mission first.' });
});
