import { getPersistenceModeFromEnvironment } from '../config/environment';

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
  maintenance: 'ftf_maintenance',
  outcomes: 'ftf_outcomes',
  pmavChecks: 'ftf_pmav_checks',
  properties: 'ftf_properties',
  quoteConfig: 'ftf_quote_config',
  quotes: 'ftf_quotes',
  savedChemicals: 'ftf_saved_chemicals',
  session: 'ftf_session',
  users: 'ftf_users',
  workPacks: 'ftf_work_packs',
} as const;

export type PersistenceMode = 'local' | 'remote';

export function getPersistenceMode(): PersistenceMode {
  return getPersistenceModeFromEnvironment();
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

function getSharedCacheKey(key: string): string {
  if (!shouldUseRemote()) return key;

  try {
    const session = JSON.parse(localStorage.getItem(PERSISTENCE_KEYS.session) || 'null');
    if (session?.id) return `${key}:${session.id}`;
  } catch {
    // The authenticated providers will surface the missing session below.
  }

  throw new Error('An authenticated session is required for shared storage.');
}

async function requestRemoteAttempt<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);

  try {
    const response = await fetch(path, {
      ...options,
      credentials: 'same-origin',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const result = await response.json().catch(() => null);

    if (!response.ok) {
      const error = new Error(result?.error || `Shared storage request failed with HTTP ${response.status}.`);
      (error as Error & { status?: number }).status = response.status;
      throw error;
    }

    return result as T;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function requestRemote<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isRead = !options.method || options.method === 'GET';
  const attempts = isRead ? 2 : 1;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await requestRemoteAttempt<T>(path, options);
    } catch (error) {
      const status = (error as Error & { status?: number }).status;
      const retryable = status === undefined || status >= 500;
      if (attempt + 1 < attempts && retryable) continue;
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('Shared storage timed out. Check the connection and try again.');
      }
      throw error;
    }
  }

  throw new Error('Shared storage request failed.');
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

function tryWriteRemoteCache(write: () => void): void {
  try {
    write();
  } catch {
    // Remote storage is authoritative. A full or unavailable browser cache
    // must not turn a successful server read/write into an application error.
  }
}

async function writeRemoteCollection<T>(key: string, data: T[]): Promise<void> {
  await requestRemote('/api/store', {
    method: 'PUT',
    body: JSON.stringify({ collection: key, records: data }),
  });
}

export async function readSharedCollection<T>(key: string, fallback: T[] = []): Promise<T[]> {
  const cacheKey = getSharedCacheKey(key);
  const localData = readCollection<T>(cacheKey);
  if (!shouldUseRemote()) return localData.length > 0 ? localData : fallback;

  const remote = await requestRemote<{ records: T[] }>(`/api/store?collection=${encodeURIComponent(key)}`);
  const records = Array.isArray(remote.records) ? remote.records : [];
  tryWriteRemoteCache(() => writeCollection(cacheKey, records));
  return records;
}

export async function writeSharedCollection<T>(key: string, data: T[]): Promise<void> {
  const cacheKey = getSharedCacheKey(key);
  if (!shouldUseRemote()) {
    writeCollection(cacheKey, data);
    return;
  }
  tryWriteRemoteCache(() => writeCollection(cacheKey, data));
  await writeRemoteCollection(key, data);
}

export async function deleteSharedRecord(key: string, recordId: string): Promise<void> {
  const cacheKey = getSharedCacheKey(key);
  const localRecords = readCollection<any>(cacheKey);
  const nextRecords = localRecords.filter((record) => record?.id !== recordId);
  if (!shouldUseRemote()) {
    writeCollection(cacheKey, nextRecords);
    return;
  }
  tryWriteRemoteCache(() => writeCollection(cacheKey, nextRecords));
  await requestRemote(
    `/api/store?collection=${encodeURIComponent(key)}&recordId=${encodeURIComponent(recordId)}`,
    { method: 'DELETE' }
  );
}

export async function clearSharedCollection(key: string): Promise<void> {
  localStorage.removeItem(getSharedCacheKey(key));
  if (!shouldUseRemote()) return;
  await requestRemote(`/api/store?collection=${encodeURIComponent(key)}`, { method: 'DELETE' });
}

async function writeRemoteValue<T>(key: string, data: T): Promise<void> {
  await requestRemote('/api/store', {
    method: 'PUT',
    body: JSON.stringify({ collection: key, recordId: SINGLETON_RECORD_ID, payload: data }),
  });
}

export async function readSharedValue<T>(key: string, fallback: T): Promise<T> {
  const cacheKey = getSharedCacheKey(key);
  const localData = readLocalValue<T>(cacheKey, fallback);
  const hasLocalData = localStorage.getItem(cacheKey) !== null;
  if (!shouldUseRemote()) return localData;

  const remote = await requestRemote<{ payload: T | null }>(
    `/api/store?collection=${encodeURIComponent(key)}&recordId=${encodeURIComponent(SINGLETON_RECORD_ID)}`
  );

  if (remote.payload === null || remote.payload === undefined) {
    if (hasLocalData) localStorage.removeItem(cacheKey);
    return fallback;
  }

  tryWriteRemoteCache(() => writeLocalValue(cacheKey, remote.payload));
  return remote.payload;
}

export async function writeSharedValue<T>(key: string, data: T): Promise<void> {
  const cacheKey = getSharedCacheKey(key);
  if (!shouldUseRemote()) {
    writeLocalValue(cacheKey, data);
    return;
  }
  tryWriteRemoteCache(() => writeLocalValue(cacheKey, data));
  await writeRemoteValue(key, data);
}

export async function clearSharedValue(key: string): Promise<void> {
  localStorage.removeItem(getSharedCacheKey(key));
  if (!shouldUseRemote()) return;
  await requestRemote(
    `/api/store?collection=${encodeURIComponent(key)}&recordId=${encodeURIComponent(SINGLETON_RECORD_ID)}`,
    { method: 'DELETE' }
  );
}
