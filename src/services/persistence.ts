export const PERSISTENCE_KEYS = {
  actuals: 'ftf_actuals',
  aircraft: 'ftf_aircraft_data',
  askFtfReports: 'ftf-askftf-reports',
  clients: 'ftf_clients',
  fields: 'ftf_fields',
  jobs: 'ftf_jobs',
  kits: 'ftf_kits',
  missionTemplates: 'ftf_mission_templates',
  missions: 'ftf_missions',
  outcomes: 'ftf_outcomes',
  pmavChecks: 'ftf_pmav_checks',
  properties: 'ftf_properties',
  quoteConfig: 'ftf_quote_config',
  quotes: 'ftf_quotes',
  savedChemicals: 'ftf_saved_chemicals',
  session: 'ftf_session',
  users: 'ftf_users',
} as const;

export type PersistenceMode = 'local' | 'remote';

export function getPersistenceMode(): PersistenceMode {
  return process.env.REACT_APP_PERSISTENCE_MODE === 'remote' ? 'remote' : 'local';
}

export function readCollection<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function writeCollection<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
}

export function readRecordMap<T>(key: string): Record<string, T> {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}');
  } catch {
    return {};
  }
}

export function writeRecordMap<T>(key: string, data: Record<string, T>): void {
  localStorage.setItem(key, JSON.stringify(data));
}

const REMOTE_TIMEOUT_MS = 12000;
const SINGLETON_RECORD_ID = '__value__';

function shouldUseRemote(): boolean {
  return getPersistenceMode() === 'remote' && typeof fetch === 'function';
}

async function requestRemote<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);

  try {
    const response = await fetch(path, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(body || `Request failed with HTTP ${response.status}`);
    }

    return await response.json();
  } finally {
    window.clearTimeout(timeout);
  }
}

function readLocalValue<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalValue<T>(key: string, data: T): void {
  localStorage.setItem(key, JSON.stringify(data));
}

function warnRemoteFallback(key: string, error: unknown): void {
  console.warn(`[persistence] Remote store unavailable for ${key}; using localStorage fallback.`, error);
}

export async function readSharedCollection<T>(key: string, fallback: T[] = []): Promise<T[]> {
  const localData = readCollection<T>(key);

  if (!shouldUseRemote()) {
    return localData.length > 0 ? localData : fallback;
  }

  try {
    const remote = await requestRemote<{ records: T[] }>(`/api/store?collection=${encodeURIComponent(key)}`);
    const records = Array.isArray(remote.records) ? remote.records : [];

    if (records.length === 0 && localData.length > 0) {
      await writeRemoteCollection(key, localData);
      return localData;
    }

    writeCollection(key, records);
    return records;
  } catch (error) {
    warnRemoteFallback(key, error);
    return localData.length > 0 ? localData : fallback;
  }
}

async function writeRemoteCollection<T>(key: string, data: T[]): Promise<void> {
  await requestRemote('/api/store', {
    method: 'PUT',
    body: JSON.stringify({ collection: key, records: data }),
  });
}

export async function writeSharedCollection<T>(key: string, data: T[]): Promise<void> {
  writeCollection(key, data);

  if (!shouldUseRemote()) return;

  try {
    await writeRemoteCollection(key, data);
  } catch (error) {
    warnRemoteFallback(key, error);
  }
}

export async function clearSharedCollection(key: string): Promise<void> {
  localStorage.removeItem(key);

  if (!shouldUseRemote()) return;

  try {
    await requestRemote(`/api/store?collection=${encodeURIComponent(key)}`, { method: 'DELETE' });
  } catch (error) {
    warnRemoteFallback(key, error);
  }
}

export async function readSharedValue<T>(key: string, fallback: T): Promise<T> {
  const localData = readLocalValue<T>(key, fallback);
  const hasLocalData = localStorage.getItem(key) !== null;

  if (!shouldUseRemote()) {
    return localData;
  }

  try {
    const remote = await requestRemote<{ payload: T | null }>(
      `/api/store?collection=${encodeURIComponent(key)}&recordId=${encodeURIComponent(SINGLETON_RECORD_ID)}`
    );

    if (remote.payload === null || remote.payload === undefined) {
      if (hasLocalData) {
        await writeRemoteValue(key, localData);
      }
      return localData;
    }

    writeLocalValue(key, remote.payload);
    return remote.payload;
  } catch (error) {
    warnRemoteFallback(key, error);
    return localData;
  }
}

async function writeRemoteValue<T>(key: string, data: T): Promise<void> {
  await requestRemote('/api/store', {
    method: 'PUT',
    body: JSON.stringify({ collection: key, recordId: SINGLETON_RECORD_ID, payload: data }),
  });
}

export async function writeSharedValue<T>(key: string, data: T): Promise<void> {
  writeLocalValue(key, data);

  if (!shouldUseRemote()) return;

  try {
    await writeRemoteValue(key, data);
  } catch (error) {
    warnRemoteFallback(key, error);
  }
}

export async function clearSharedValue(key: string): Promise<void> {
  localStorage.removeItem(key);

  if (!shouldUseRemote()) return;

  try {
    await requestRemote(
      `/api/store?collection=${encodeURIComponent(key)}&recordId=${encodeURIComponent(SINGLETON_RECORD_ID)}`,
      { method: 'DELETE' }
    );
  } catch (error) {
    warnRemoteFallback(key, error);
  }
}
