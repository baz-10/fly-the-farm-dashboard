import { loadMissionCollections } from '../missionDataLoading';

describe('loadMissionCollections', () => {
  test('starts mission and template requests together', async () => {
    let resolveMissions!: (value: string[]) => void;
    let resolveTemplates!: (value: string[]) => void;
    const loadMissions = jest.fn(() => new Promise<string[]>((resolve) => { resolveMissions = resolve; }));
    const loadTemplates = jest.fn(() => new Promise<string[]>((resolve) => { resolveTemplates = resolve; }));

    const resultPromise = loadMissionCollections(loadMissions, loadTemplates);

    expect(loadMissions).toHaveBeenCalledTimes(1);
    expect(loadTemplates).toHaveBeenCalledTimes(1);
    resolveMissions(['mission']);
    resolveTemplates(['template']);
    await expect(resultPromise).resolves.toEqual([
      ['mission'],
      ['template'],
    ]);
  });
});
