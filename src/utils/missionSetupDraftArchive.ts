type DraftReference = { id: string; rowVersion: number };
type DraftArchiveApi = {
  archive: (id: string, rowVersion: number) => Promise<unknown>;
  get: (id: string) => Promise<DraftReference>;
};

export async function archiveSetupDraftAfterMissionCreation(
  api: DraftArchiveApi,
  draft: DraftReference,
): Promise<void> {
  try {
    await api.archive(draft.id, draft.rowVersion);
  } catch (error) {
    if ((error as { code?: string })?.code !== 'VERSION_CONFLICT') throw error;
    const current = await api.get(draft.id);
    await api.archive(current.id, current.rowVersion);
  }
}
