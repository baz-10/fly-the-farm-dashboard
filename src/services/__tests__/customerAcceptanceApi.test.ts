import { createCustomerAcceptanceApi } from '../customerAcceptanceApi';

test('uses versioned internal Customer Acceptance commands', async () => {
  const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { records: [] } }) });
  const api = createCustomerAcceptanceApi(fetcher as any);
  await api.read('mission-1');
  await api.record('mission-1', { stateCode: 'ACCEPTED' });
  await api.issueLink('mission-1', { expiresInHours: 48 });
  expect(fetcher.mock.calls.map(call => call[0])).toEqual([
    '/api/v1/customer-acceptance?missionId=mission-1',
    '/api/v1/customer-acceptance?missionId=mission-1&action=record',
    '/api/v1/customer-acceptance?missionId=mission-1&action=link-issue',
  ]);
});

test('uses a bounded public API without authentication context', async () => {
  const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { missionReference: 'M-1' } }) });
  const api = createCustomerAcceptanceApi(fetcher as any);
  await api.resolvePublic('plain token');
  await api.stagePublicFile('plain token', { fileName: 'outcome.jpg' });
  await api.submitPublic('plain token', { consent: true });
  expect(fetcher.mock.calls[0][0]).toBe('/api/v1/customer-acceptance-public?token=plain%20token');
  expect(fetcher.mock.calls[1][0]).toBe('/api/v1/customer-acceptance-public?token=plain%20token&action=file');
  expect(fetcher.mock.calls[2][0]).toBe('/api/v1/customer-acceptance-public?token=plain%20token&action=submit');
});
