import { archiveSetupDraftAfterMissionCreation } from '../missionSetupDraftArchive';

describe('Mission setup Draft cleanup after authoritative Mission creation', () => {
  test('reloads and archives the current Draft revision after a stale-version conflict', async () => {
    const api = {
      archive: jest.fn()
        .mockRejectedValueOnce(Object.assign(new Error('Draft changed'), { code: 'VERSION_CONFLICT' }))
        .mockResolvedValueOnce(undefined),
      get: jest.fn().mockResolvedValue({ id: 'draft-1', rowVersion: 4 }),
    };

    await archiveSetupDraftAfterMissionCreation(api, { id: 'draft-1', rowVersion: 3 });

    expect(api.get).toHaveBeenCalledWith('draft-1');
    expect(api.archive).toHaveBeenNthCalledWith(1, 'draft-1', 3);
    expect(api.archive).toHaveBeenNthCalledWith(2, 'draft-1', 4);
  });

  test('does not hide non-concurrency archive failures', async () => {
    const denied = Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });
    const api = { archive: jest.fn().mockRejectedValue(denied), get: jest.fn() };

    await expect(archiveSetupDraftAfterMissionCreation(api, { id: 'draft-1', rowVersion: 3 }))
      .rejects.toBe(denied);
    expect(api.get).not.toHaveBeenCalled();
  });
});
