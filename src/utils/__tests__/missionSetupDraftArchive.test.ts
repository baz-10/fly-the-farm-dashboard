import { archiveSetupDraftAfterMissionCreation, shouldPersistMissionSetupDraft } from '../missionSetupDraftArchive';

describe('Mission setup Draft cleanup after authoritative Mission creation', () => {
  test('stops setup-Draft autosaves while the authoritative Mission is being finalised', () => {
    expect(shouldPersistMissionSetupDraft(false, false)).toBe(true);
    expect(shouldPersistMissionSetupDraft(true, false)).toBe(false);
    expect(shouldPersistMissionSetupDraft(false, true)).toBe(false);
  });

  test('reloads and archives through bounded concurrent Draft revisions after Mission creation', async () => {
    const api = {
      archive: jest.fn()
        .mockRejectedValueOnce(Object.assign(new Error('Draft changed'), { code: 'VERSION_CONFLICT' }))
        .mockRejectedValueOnce(Object.assign(new Error('Draft changed again'), { code: 'VERSION_CONFLICT' }))
        .mockResolvedValueOnce(undefined),
      get: jest.fn()
        .mockResolvedValueOnce({ id: 'draft-1', rowVersion: 4 })
        .mockResolvedValueOnce({ id: 'draft-1', rowVersion: 5 }),
    };

    await archiveSetupDraftAfterMissionCreation(api, { id: 'draft-1', rowVersion: 3 });

    expect(api.get).toHaveBeenNthCalledWith(1, 'draft-1');
    expect(api.get).toHaveBeenNthCalledWith(2, 'draft-1');
    expect(api.archive).toHaveBeenNthCalledWith(1, 'draft-1', 3);
    expect(api.archive).toHaveBeenNthCalledWith(2, 'draft-1', 4);
    expect(api.archive).toHaveBeenNthCalledWith(3, 'draft-1', 5);
  });

  test('does not hide non-concurrency archive failures', async () => {
    const denied = Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });
    const api = { archive: jest.fn().mockRejectedValue(denied), get: jest.fn() };

    await expect(archiveSetupDraftAfterMissionCreation(api, { id: 'draft-1', rowVersion: 3 }))
      .rejects.toBe(denied);
    expect(api.get).not.toHaveBeenCalled();
  });
});
