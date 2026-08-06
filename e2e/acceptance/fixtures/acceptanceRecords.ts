import { APIRequestContext, expect, Page } from '@playwright/test';
import { ACCEPTANCE_PREFIX } from '../environment';

type Resource = 'clients' | 'properties' | 'fields' | 'jobs' | 'missions';
type ApiRecord = { id: string; rowVersion: number; name?: string; title?: string; scope?: string };

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

export async function archiveAcceptanceRecord(request: APIRequestContext, resource: Resource, record?: ApiRecord): Promise<void> {
  if (!record) return;
  const response = await request.delete(`/api/v1/${resource}?id=${encodeURIComponent(record.id)}`, {
    data: { expectedVersion: record.rowVersion },
  });
  expect(response.ok(), `${resource} acceptance record should archive`).toBeTruthy();
}

export async function assertNoLegacyEntityPersistence(page: Page): Promise<void> {
  const legacyKeys = await page.evaluate(() => Object.keys(localStorage).filter((key) => [
    'ftf_clients', 'ftf_properties', 'ftf_fields', 'ftf_jobs', 'ftf_missions',
  ].includes(key)));
  expect(legacyKeys).toEqual([]);
}
