import { PERSISTENCE_KEYS, readSharedCollection, writeSharedCollection } from '../persistence';

describe('remote persistence failures', () => {
  const originalMode = process.env.REACT_APP_PERSISTENCE_MODE;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.REACT_APP_PERSISTENCE_MODE = 'remote';
    localStorage.clear();
    localStorage.setItem(PERSISTENCE_KEYS.session, JSON.stringify({ id: 'user-a' }));
  });

  afterEach(() => {
    process.env.REACT_APP_PERSISTENCE_MODE = originalMode;
    global.fetch = originalFetch;
    localStorage.clear();
  });

  test('scopes the browser cache to the authenticated user', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    })) as any;

    await writeSharedCollection(PERSISTENCE_KEYS.missions, [{ id: 'mission-a' }]);

    expect(localStorage.getItem(`${PERSISTENCE_KEYS.missions}:user-a`)).toContain('mission-a');
    expect(localStorage.getItem(PERSISTENCE_KEYS.missions)).toBeNull();
  });

  test('rejects instead of reporting success when the remote write fails', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({ error: 'Persistent storage is unavailable.' }),
    })) as any;

    await expect(
      writeSharedCollection(PERSISTENCE_KEYS.missions, [{ id: 'mission-a' }])
    ).rejects.toThrow('Persistent storage is unavailable.');
  });

  test('does not resurrect a cached record after the server deletes it', async () => {
    localStorage.setItem(`${PERSISTENCE_KEYS.missions}:user-a`, JSON.stringify([{ id: 'deleted-mission' }]));
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ records: [] }),
    })) as any;

    const missions = await readSharedCollection(PERSISTENCE_KEYS.missions);

    expect(missions).toEqual([]);
    expect(localStorage.getItem(`${PERSISTENCE_KEYS.missions}:user-a`)).toBe('[]');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
