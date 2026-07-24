import { afterEach, beforeEach, describe, expect, it, test, vi } from 'vitest';

import { getPersistenceModeFromEnvironment } from '../../config/environment';
import {
  PERSISTENCE_KEYS,
  readSharedCollection,
  readSharedValue,
  writeSharedCollection,
} from '../persistence';

vi.mock('../../config/environment', () => ({
  getPersistenceModeFromEnvironment: vi.fn(),
}));

describe('remote persistence failures', () => {
  const originalFetch = global.fetch;
  const mockedGetPersistenceMode = vi.mocked(getPersistenceModeFromEnvironment);

  beforeEach(() => {
    mockedGetPersistenceMode.mockReturnValue('remote');
    localStorage.clear();
    localStorage.setItem(PERSISTENCE_KEYS.session, JSON.stringify({ id: 'user-a' }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
    localStorage.clear();
  });

  test('scopes the browser cache to the authenticated user', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    })) as any;

    await writeSharedCollection(PERSISTENCE_KEYS.missions, [{ id: 'mission-a' }]);

    expect(localStorage.getItem(`${PERSISTENCE_KEYS.missions}:user-a`)).toContain('mission-a');
    expect(localStorage.getItem(PERSISTENCE_KEYS.missions)).toBeNull();
  });

  test('rejects instead of reporting success when the remote write fails', async () => {
    global.fetch = vi.fn(async () => ({
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
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ records: [] }),
    })) as any;

    const missions = await readSharedCollection(PERSISTENCE_KEYS.missions, [{ id: 'fallback-mission' }]);

    expect(missions).toEqual([]);
    expect(localStorage.getItem(`${PERSISTENCE_KEYS.missions}:user-a`)).toBe('[]');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('returns remote collections when the browser cache quota is exceeded', async () => {
    const nativeSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key.startsWith(`${PERSISTENCE_KEYS.missions}:`)) {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      }
      return nativeSetItem.call(this, key, value);
    });
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ records: [{ id: 'mission-from-server' }] }),
    })) as any;

    await expect(readSharedCollection(PERSISTENCE_KEYS.missions)).resolves.toEqual([
      { id: 'mission-from-server' },
    ]);
  });

  test('returns remote singleton values when the browser cache quota is exceeded', async () => {
    const nativeSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key.startsWith(`${PERSISTENCE_KEYS.workPacks}:`)) {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      }
      return nativeSetItem.call(this, key, value);
    });
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ payload: { assets: [{ id: 'trailer-1' }] } }),
    })) as any;

    await expect(readSharedValue(PERSISTENCE_KEYS.workPacks, { assets: [] })).resolves.toEqual({
      assets: [{ id: 'trailer-1' }],
    });
  });

  test('still saves remotely when the browser cache quota is exceeded', async () => {
    const nativeSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key.startsWith(`${PERSISTENCE_KEYS.missions}:`)) {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      }
      return nativeSetItem.call(this, key, value);
    });
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    })) as any;

    await expect(
      writeSharedCollection(PERSISTENCE_KEYS.missions, [{ id: 'mission-a' }])
    ).resolves.toBeUndefined();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('retries one transient remote read', async () => {
    global.fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError('temporary network failure'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ records: [{ id: 'mission-after-retry' }] }),
      }) as any;

    await expect(readSharedCollection(PERSISTENCE_KEYS.missions)).resolves.toEqual([
      { id: 'mission-after-retry' },
    ]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
