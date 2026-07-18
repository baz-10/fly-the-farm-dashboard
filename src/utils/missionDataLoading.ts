export function loadMissionCollections<TMission, TTemplate>(
  loadMissions: () => Promise<TMission[]>,
  loadTemplates: () => Promise<TTemplate[]>
): Promise<[TMission[], TTemplate[]]> {
  return Promise.all([loadMissions(), loadTemplates()]);
}
