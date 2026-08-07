type DraftReference = { id: string; rowVersion: number };
type DraftArchiveApi = {
  archive: (id: string, rowVersion: number) => Promise<unknown>;
  get: (id: string) => Promise<DraftReference>;
};

export async function archiveSetupDraftAfterMissionCreation(
  api: DraftArchiveApi,
  draft: DraftReference,
): Promise<void> {
  let current = draft;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await api.archive(current.id, current.rowVersion);
      return;
    } catch (error) {
      if ((error as { code?: string })?.code !== 'VERSION_CONFLICT' || attempt === 2) throw error;
      current = await api.get(draft.id);
    }
  }
}
