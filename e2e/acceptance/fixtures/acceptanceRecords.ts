import { APIRequestContext, expect, Page } from '@playwright/test';
import { ACCEPTANCE_PREFIX } from '../environment';

type Resource = 'clients' | 'properties' | 'fields' | 'jobs' | 'missions';
export type ApiRecord = { id: string; rowVersion: number; name?: string; title?: string; scope?: string };
export type AcceptanceRecords = Partial<Record<'client' | 'property' | 'field' | 'job' | 'mission', ApiRecord>>;

export const cleanupOrder = ['missions', 'jobs', 'fields', 'properties', 'clients'] as const;
const recordKey: Record<Resource, keyof AcceptanceRecords> = {
  missions: 'mission', jobs: 'job', fields: 'field', properties: 'property', clients: 'client',
};
const CLEANUP_REQUEST_TIMEOUT_MS = 15_000;

type CleanupOptions = { log?: (event: string) => void };

function safeId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : 'redacted';
}

function correlationId(response: any): string {
  const value = String(response.headers()?.['x-correlation-id'] || 'unavailable');
  return /^[A-Za-z0-9-]{1,80}$/.test(value) ? value : 'unavailable';
}

function cleanupError(error: unknown, resource: Resource): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/timeout|timed out/i.test(message)) return new Error(`CLEANUP_TIMEOUT resource=${resource}`);
  return error instanceof Error ? error : new Error(`CLEANUP_REQUEST_FAILED resource=${resource}`);
}

export const acceptanceRunLabel = () => `${ACCEPTANCE_PREFIX} ${new Date().toISOString().replace(/[:.]/g, '-')}`;

export async function allRecords(request: APIRequestContext, resource: Resource): Promise<ApiRecord[]> {
  const records: ApiRecord[] = [];
  for (let page = 1; ; page += 1) {
    const response = await request.get(`/api/v1/${resource}?page=${page}&pageSize=100`);
    expect(response.ok(), `${resource} page ${page} should load`).toBeTruthy();
    const envelope = await response.json();
    expect(Array.isArray(envelope.data)).toBeTruthy();
    records.push(...envelope.data);
    if (envelope.data.length < 100) return records;
  }
}

export async function findAcceptanceRecord(request: APIRequestContext, resource: Resource, label: string): Promise<ApiRecord> {
  const record = (await allRecords(request, resource)).find((candidate) =>
    [candidate.name, candidate.title, candidate.scope].some((value) => value === label));
  expect(record, `${resource} record ${label} should persist`).toBeTruthy();
  return record!;
}

export async function archiveAcceptanceRecord(request: APIRequestContext, resource: Resource, record?: ApiRecord, options: CleanupOptions = {}): Promise<void> {
  if (!record) return;
  await archiveAcceptanceChain(request, { [recordKey[resource]]: record }, options);
}

export async function archiveAcceptanceChain(
  request: APIRequestContext,
  records: AcceptanceRecords,
  options: CleanupOptions = {},
): Promise<void> {
  const log = options.log || ((event: string) => console.log(`[acceptance-cleanup] ${event}`));
  for (const resource of cleanupOrder) {
    const record = records[recordKey[resource]];
    if (!record) continue;
    const id = safeId(record.id);
    const startedAt = new Date();
    const startedMs = Date.now();
    log(`phase=request resource=${resource} id=${id} started=${startedAt.toISOString()}`);
    let response: any;
    try {
      response = await request.delete(`/api/v1/${resource}?id=${encodeURIComponent(record.id)}`, {
        data: { expectedVersion: record.rowVersion },
        timeout: CLEANUP_REQUEST_TIMEOUT_MS,
      });
    } catch (error) {
      throw cleanupError(error, resource);
    }
    const status = response.status();
    const correlation = correlationId(response);
    log(`phase=response resource=${resource} id=${id} status=${status} correlation=${correlation} durationMs=${Date.now() - startedMs}`);
    if (!response.ok() && status !== 404) {
      throw new Error(`CLEANUP_API_REJECTED resource=${resource} status=${status} correlation=${correlation}`);
    }

    let verification: any;
    try {
      verification = await request.get(`/api/v1/${resource}?id=${encodeURIComponent(record.id)}`, {
        timeout: CLEANUP_REQUEST_TIMEOUT_MS,
      });
    } catch (error) {
      throw cleanupError(error, resource);
    }
    const verificationStatus = verification.status();
    log(`phase=verify resource=${resource} id=${id} status=${verificationStatus} correlation=${correlationId(verification)}`);
    if (verificationStatus !== 404) {
      throw new Error(`CLEANUP_ACTIVE_RECORD_REMAINS resource=${resource} status=${verificationStatus}`);
    }
  }
}

export async function cleanupAcceptanceRecordsByPrefix(
  request: APIRequestContext,
  options: CleanupOptions = {},
): Promise<void> {
  for (const resource of cleanupOrder) {
    const records = (await allRecords(request, resource)).filter((record) =>
      [record.name, record.title, record.scope].some((value) => value?.startsWith(ACCEPTANCE_PREFIX)));
    for (const record of records) {
      await archiveAcceptanceRecord(request, resource, record, options);
    }
  }
}

export async function assertNoLegacyEntityPersistence(page: Page): Promise<void> {
  const legacyKeys = await page.evaluate(() => Object.keys(localStorage).filter((key) => [
    'ftf_clients', 'ftf_properties', 'ftf_fields', 'ftf_jobs', 'ftf_missions',
  ].includes(key)));
  expect(legacyKeys).toEqual([]);
}
