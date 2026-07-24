import { getPersistenceModeFromEnvironment } from '../config/environment';
import type { SafetyPlanAuditEvent } from '../types/safetyPlan';

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
  safetyPlanTemplates: 'ftf_safety_plan_templates',
  safetyPlans: 'ftf_safety_plans',
  safetyPlanAudit: 'ftf_safety_plan_audit',
  session: 'ftf_session',
  users: 'ftf_users',
  workPacks: 'ftf_work_packs',
} as const;

export type PersistenceMode = 'local' | 'remote';

export class SharedStorageError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly currentRevision?: number;

  constructor(
    message: string,
    metadata: { status?: number; code?: string; currentRevision?: number } = {}
  ) {
    super(message);
    this.name = 'SharedStorageError';
    this.status = metadata.status;
    this.code = metadata.code;
    this.currentRevision = metadata.currentRevision;
  }
}

export interface SharedRecordMutationOptions {
  expectedRevision?: number;
  actor?: {
    userId: string;
    name: string;
    role: 'admin' | 'contractor';
    operationalAuthority: boolean;
  };
  signal?: AbortSignal;
}

export interface SharedRecordWriteOptions {
  audit?: Pick<SafetyPlanAuditEvent, 'id' | 'operationId' | 'planId' | 'versionId' | 'action'>;
  signal?: AbortSignal;
}

export interface SharedRequestOptions {
  signal?: AbortSignal;
}

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
const SAFETY_PLAN_SCOPED_KEYS = new Set<string>([
  PERSISTENCE_KEYS.safetyPlanTemplates,
  PERSISTENCE_KEYS.safetyPlans,
  PERSISTENCE_KEYS.safetyPlanAudit,
]);

function shouldUseRemote(): boolean {
  return getPersistenceMode() === 'remote' && typeof fetch === 'function';
}

function getSharedCacheKey(key: string): string {
  try {
    const session = JSON.parse(localStorage.getItem(PERSISTENCE_KEYS.session) || 'null');
    if (SAFETY_PLAN_SCOPED_KEYS.has(key)) {
      const userId = String(session?.id || '').trim();
      const tenantId = String(session?.tenantId || session?.contractorId || '').trim();
      if (!userId) throw new Error('An authenticated session is required for Safety Plan storage.');
      return tenantId ? `${key}:${tenantId}:${userId}` : `${key}:${userId}`;
    }
    if (!shouldUseRemote()) return key;
    if (session?.id) return `${key}:${session.id}`;
  } catch {
    // The authenticated providers will surface the missing session below.
  }

  throw new Error('An authenticated session is required for shared storage.');
}

async function requestRemoteAttempt<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const callerSignal = options.signal;
  const abortFromCaller = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) abortFromCaller();
  else callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
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
      throw new SharedStorageError(
        result?.error || `Shared storage request failed with HTTP ${response.status}.`,
        {
          status: response.status,
          code: typeof result?.code === 'string' ? result.code : undefined,
          currentRevision: Number.isSafeInteger(result?.currentRevision)
            ? result.currentRevision
            : undefined,
        }
      );
    }

    return result as T;
  } finally {
    window.clearTimeout(timeout);
    callerSignal?.removeEventListener('abort', abortFromCaller);
  }
}

async function requestRemote<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isRead = !options.method || options.method === 'GET';
  const attempts = isRead ? 2 : 1;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await requestRemoteAttempt<T>(path, options);
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError') {
        if (options.signal?.aborted) throw error;
        throw new Error('Shared storage timed out. Check the connection and try again.');
      }
      const status = (error as Error & { status?: number }).status;
      const retryable = status === undefined || status >= 500;
      if (attempt + 1 < attempts && retryable) continue;
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

function cacheRecord<T>(cacheKey: string, recordId: string, payload: T | null): void {
  const records = readCollection<T & { id?: string }>(cacheKey);
  const nextRecords = records.filter((record) => record?.id !== recordId);
  if (payload !== null) nextRecords.push(payload as T & { id?: string });
  writeCollection(cacheKey, nextRecords);
}

async function writeRemoteCollection<T>(key: string, data: T[]): Promise<void> {
  await requestRemote('/api/store', {
    method: 'PUT',
    body: JSON.stringify({ collection: key, records: data }),
  });
}

export async function readSharedCollection<T>(
  key: string,
  fallback: T[] = [],
  options: SharedRequestOptions = {}
): Promise<T[]> {
  const cacheKey = getSharedCacheKey(key);
  const localData = readCollection<T>(cacheKey);
  if (!shouldUseRemote()) return localData.length > 0 ? localData : fallback;

  const remote = await requestRemote<{ records: T[] }>(
    `/api/store?collection=${encodeURIComponent(key)}`,
    { signal: options.signal }
  );
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

export async function readSharedRecord<T>(
  key: string,
  recordId: string,
  options: SharedRequestOptions = {}
): Promise<T | null> {
  const cacheKey = getSharedCacheKey(key);
  const localRecord = readCollection<T & { id?: string }>(cacheKey)
    .find((record) => record?.id === recordId) as T | undefined;
  if (!shouldUseRemote()) return localRecord ?? null;

  const remote = await requestRemote<{ payload: T | null }>(
    `/api/store?collection=${encodeURIComponent(key)}&recordId=${encodeURIComponent(recordId)}`,
    { signal: options.signal }
  );
  const payload = remote.payload ?? null;
  tryWriteRemoteCache(() => cacheRecord(cacheKey, recordId, payload));
  return payload;
}

export async function writeSharedRecord<T>(
  key: string,
  recordId: string,
  payload: T,
  options: SharedRecordWriteOptions = {}
): Promise<T> {
  const cacheKey = getSharedCacheKey(key);
  if (!shouldUseRemote()) {
    const localPayload = key === PERSISTENCE_KEYS.safetyPlans
      ? {
        ...(payload as any),
        versions: ((payload as any)?.versions || []).map((version: any) => {
          const { sourceRefreshIntent: _sourceRefreshIntent, ...canonical } = version;
          return canonical;
        }),
      } as T
      : payload;
    if (key === PERSISTENCE_KEYS.safetyPlans) {
      const stored = readCollection<any>(cacheKey)
        .find((record) => record?.id === recordId);
      const incomingRevision = (localPayload as { revision?: number })?.revision;
      const expectedIncomingRevision = stored ? stored.revision + 1 : 1;
      if (
        stored?.deletedAt
        || !Number.isSafeInteger(incomingRevision)
        || incomingRevision !== expectedIncomingRevision
      ) {
        throw new SharedStorageError(
          'Safety Plan changed in another session. Refresh and try again.',
          {
            status: 409,
            code: 'SAFETY_PLAN_CONFLICT',
            currentRevision: stored?.revision,
          }
        );
      }
    }
    cacheRecord(cacheKey, recordId, localPayload);
    if (key === PERSISTENCE_KEYS.safetyPlans && options.audit) {
      const session = readLocalValue<any>(PERSISTENCE_KEYS.session, null);
      const occurredAt = new Date().toISOString();
      cacheRecord(getSharedCacheKey(PERSISTENCE_KEYS.safetyPlanAudit), options.audit.id, {
        ...options.audit,
        tenantId: (localPayload as any)?.tenantId,
        actor: {
          userId: session?.id || '',
          name: session?.name || '',
          role: session?.role,
          operationalAuthority: session?.safetyPlanAuthority === true,
        },
        occurredAt,
      });
    }
    return localPayload;
  }

  const result = await requestRemote<{ payload?: T }>('/api/store', {
    method: 'PUT',
    signal: options.signal,
    body: JSON.stringify({
      collection: key,
      recordId,
      payload,
      ...(options.audit ? { audit: options.audit } : {}),
    }),
  });
  const canonical = result?.payload ?? payload;
  tryWriteRemoteCache(() => cacheRecord(cacheKey, recordId, canonical));
  return canonical;
}

function localSafetyAuditEvent(
  plan: any,
  action: 'draft_deleted' | 'draft_restored',
  actor: NonNullable<SharedRecordMutationOptions['actor']>,
  occurredAt: string
) {
  return {
    id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `audit_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    tenantId: plan.tenantId,
    planId: plan.id,
    versionId: plan.currentVersionId,
    actor,
    action,
    occurredAt,
  };
}

function assertLocalSafetyMutation(
  plan: any,
  options: SharedRecordMutationOptions,
  operation: 'delete' | 'restore'
): void {
  if (options.actor?.role !== 'admin') {
    throw new SharedStorageError(
      `Only administrators may ${operation} draft Safety Plans.`,
      { status: 403, code: 'SAFETY_PLAN_FORBIDDEN' }
    );
  }
  if (plan?.revision !== options.expectedRevision) {
    throw new SharedStorageError(
      'Safety Plan changed in another session. Refresh and try again.',
      {
        status: 409,
        code: 'SAFETY_PLAN_CONFLICT',
        currentRevision: plan?.revision,
      }
    );
  }
}

export async function deleteSharedRecord<T = unknown>(
  key: string,
  recordId: string,
  options: SharedRecordMutationOptions = {}
): Promise<T | null> {
  const cacheKey = getSharedCacheKey(key);
  const localRecords = readCollection<any>(cacheKey);
  if (
    key === PERSISTENCE_KEYS.safetyPlans
    && (options.expectedRevision === undefined || !options.actor)
  ) {
    throw new SharedStorageError(
      'Safety Plan deletion requires an actor and expected revision.',
      { status: 400, code: 'SAFETY_PLAN_MUTATION_METADATA_REQUIRED' }
    );
  }
  if (!shouldUseRemote()) {
    const stored = localRecords.find((record) => record?.id === recordId);
    if (key === PERSISTENCE_KEYS.safetyPlans && options.expectedRevision !== undefined) {
      assertLocalSafetyMutation(stored, options, 'delete');
      if (!stored || stored.deletedAt || stored.status !== 'draft') {
        throw new SharedStorageError('Only active draft Safety Plans can be deleted.', {
          status: 403,
          code: 'SAFETY_PLAN_FORBIDDEN',
        });
      }
      const occurredAt = new Date().toISOString();
      const deleted = {
        ...stored,
        revision: stored.revision + 1,
        updatedAt: occurredAt,
        deletedAt: occurredAt,
        deletedBy: options.actor,
      };
      cacheRecord(cacheKey, recordId, deleted);
      const audit = localSafetyAuditEvent(
        deleted,
        'draft_deleted',
        options.actor!,
        occurredAt
      );
      cacheRecord(getSharedCacheKey(PERSISTENCE_KEYS.safetyPlanAudit), audit.id, audit);
      return deleted as T;
    }
    cacheRecord(cacheKey, recordId, null);
    return null;
  }

  const expectedRevision = options.expectedRevision === undefined
    ? ''
    : `&expectedRevision=${encodeURIComponent(String(options.expectedRevision))}`;
  const result = await requestRemote<{ payload?: T }>(
    `/api/store?collection=${encodeURIComponent(key)}&recordId=${encodeURIComponent(recordId)}${expectedRevision}`,
    { method: 'DELETE', signal: options.signal }
  );
  const payload = result?.payload ?? null;
  tryWriteRemoteCache(() => cacheRecord(cacheKey, recordId, payload));
  return payload;
}

export async function restoreSharedRecord<T = unknown>(
  key: string,
  recordId: string,
  options: SharedRecordMutationOptions
): Promise<T | null> {
  const cacheKey = getSharedCacheKey(key);
  if (!shouldUseRemote()) {
    const stored = readCollection<any>(cacheKey).find((record) => record?.id === recordId);
    assertLocalSafetyMutation(stored, options, 'restore');
    if (!stored?.deletedAt || stored.status !== 'draft') {
      throw new SharedStorageError('Only deleted draft Safety Plans can be restored.', {
        status: 409,
        code: 'SAFETY_PLAN_CONFLICT',
        currentRevision: stored?.revision,
      });
    }
    const occurredAt = new Date().toISOString();
    const { deletedAt: _deletedAt, deletedBy: _deletedBy, ...active } = stored;
    const restored = {
      ...active,
      revision: stored.revision + 1,
      updatedAt: occurredAt,
    };
    cacheRecord(cacheKey, recordId, restored);
    const audit = localSafetyAuditEvent(
      restored,
      'draft_restored',
      options.actor!,
      occurredAt
    );
    cacheRecord(getSharedCacheKey(PERSISTENCE_KEYS.safetyPlanAudit), audit.id, audit);
    return restored as T;
  }

  const result = await requestRemote<{ payload?: T }>('/api/store', {
    method: 'PUT',
    signal: options.signal,
    body: JSON.stringify({
      collection: key,
      recordId,
      action: 'restore',
      expectedRevision: options.expectedRevision,
    }),
  });
  const payload = result?.payload ?? null;
  tryWriteRemoteCache(() => cacheRecord(cacheKey, recordId, payload));
  return payload;
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
