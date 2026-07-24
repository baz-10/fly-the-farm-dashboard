import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { getPersistenceModeFromEnvironment } from '../../config/environment';
import {
  deleteSharedRecord,
  PERSISTENCE_KEYS,
  readSharedRecord,
  restoreSharedRecord,
  writeSharedRecord,
} from '../persistence';

vi.mock('../../config/environment', () => ({
  getPersistenceModeFromEnvironment: vi.fn(),
}));

describe('Safety Plan record persistence', () => {
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

  test('reads and writes one shared record without replacing the collection', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ payload: { id: 'plan-a', revision: 3 } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      }) as any;

    await expect(
      readSharedRecord<{ id: string; revision: number }>(PERSISTENCE_KEYS.safetyPlans, 'plan-a')
    ).resolves.toEqual({ id: 'plan-a', revision: 3 });
    await writeSharedRecord(
      PERSISTENCE_KEYS.safetyPlans,
      'plan-a',
      { id: 'plan-a', revision: 4 }
    );

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      `/api/store?collection=${encodeURIComponent(PERSISTENCE_KEYS.safetyPlans)}&recordId=plan-a`,
      expect.objectContaining({ credentials: 'same-origin' })
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      '/api/store',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          collection: PERSISTENCE_KEYS.safetyPlans,
          recordId: 'plan-a',
          payload: { id: 'plan-a', revision: 4 },
        }),
      })
    );
  });

  test('preserves remote conflict metadata and does not cache the rejected record', async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 409,
      json: async () => ({
        error: 'Safety Plan changed in another session.',
        code: 'SAFETY_PLAN_CONFLICT',
        currentRevision: 4,
      }),
    })) as any;

    const write = writeSharedRecord(
      PERSISTENCE_KEYS.safetyPlans,
      'plan-a',
      { id: 'plan-a', revision: 4 }
    );

    await expect(write).rejects.toMatchObject({
      status: 409,
      code: 'SAFETY_PLAN_CONFLICT',
      currentRevision: 4,
    });
    expect(localStorage.getItem(`${PERSISTENCE_KEYS.safetyPlans}:user-a`)).toBeNull();
  });

  test('sends expected revisions for atomic draft deletion and restoration', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, payload: { id: 'plan-a', revision: 4, deletedAt: 'now' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, payload: { id: 'plan-a', revision: 5 } }),
      }) as any;

    await deleteSharedRecord(PERSISTENCE_KEYS.safetyPlans, 'plan-a', {
      expectedRevision: 3,
      actor: { userId: 'admin-a', name: 'Admin', role: 'admin', operationalAuthority: true },
    });
    await restoreSharedRecord(PERSISTENCE_KEYS.safetyPlans, 'plan-a', {
      expectedRevision: 4,
      actor: { userId: 'admin-a', name: 'Admin', role: 'admin', operationalAuthority: true },
    });

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      `/api/store?collection=${encodeURIComponent(PERSISTENCE_KEYS.safetyPlans)}&recordId=plan-a&expectedRevision=3`,
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      '/api/store',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          collection: PERSISTENCE_KEYS.safetyPlans,
          recordId: 'plan-a',
          action: 'restore',
          expectedRevision: 4,
        }),
      })
    );
  });

  test('rejects a stale local record write instead of replacing the newer draft', async () => {
    mockedGetPersistenceMode.mockReturnValue('local');
    localStorage.setItem(`${PERSISTENCE_KEYS.safetyPlans}:user-a`, JSON.stringify([
      { id: 'plan-a', revision: 4 },
    ]));

    await expect(writeSharedRecord(
      PERSISTENCE_KEYS.safetyPlans,
      'plan-a',
      { id: 'plan-a', revision: 4 }
    )).rejects.toMatchObject({
      status: 409,
      code: 'SAFETY_PLAN_CONFLICT',
      currentRevision: 4,
    });
    expect(JSON.parse(localStorage.getItem(`${PERSISTENCE_KEYS.safetyPlans}:user-a`) || '[]'))
      .toEqual([{ id: 'plan-a', revision: 4 }]);
  });

  test('sends audit linkage with a plan mutation and caches the canonical response', async () => {
    const canonical = {
      id: 'plan-a',
      revision: 2,
      updatedAt: '2026-07-24T04:00:00.000Z',
    };
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, payload: canonical }),
    })) as any;

    await writeSharedRecord(
      PERSISTENCE_KEYS.safetyPlans,
      'plan-a',
      { id: 'plan-a', revision: 2, updatedAt: 'client-time' },
      {
        audit: {
          id: 'audit-1',
          planId: 'plan-a',
          versionId: 'version-1',
          action: 'field_changed',
        },
      }
    );

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/store',
      expect.objectContaining({
        body: JSON.stringify({
          collection: PERSISTENCE_KEYS.safetyPlans,
          recordId: 'plan-a',
          payload: { id: 'plan-a', revision: 2, updatedAt: 'client-time' },
          audit: {
            id: 'audit-1',
            planId: 'plan-a',
            versionId: 'version-1',
            action: 'field_changed',
          },
        }),
      })
    );
    expect(JSON.parse(
      localStorage.getItem(`${PERSISTENCE_KEYS.safetyPlans}:user-a`) || '[]'
    )).toEqual([canonical]);
  });

  test('never hard deletes a local Safety Plan when mutation metadata is omitted', async () => {
    mockedGetPersistenceMode.mockReturnValue('local');
    localStorage.setItem(`${PERSISTENCE_KEYS.safetyPlans}:user-a`, JSON.stringify([
      { id: 'plan-a', status: 'draft', revision: 1 },
    ]));

    await expect(
      deleteSharedRecord(PERSISTENCE_KEYS.safetyPlans, 'plan-a')
    ).rejects.toMatchObject({
      status: 400,
      code: 'SAFETY_PLAN_MUTATION_METADATA_REQUIRED',
    });
    expect(JSON.parse(localStorage.getItem(`${PERSISTENCE_KEYS.safetyPlans}:user-a`) || '[]'))
      .toHaveLength(1);
  });

  test('scopes only local Safety Plan caches by authenticated tenant and user', async () => {
    mockedGetPersistenceMode.mockReturnValue('local');
    localStorage.setItem(PERSISTENCE_KEYS.session, JSON.stringify({
      id: 'user-a',
      tenantId: 'tenant-a',
    }));

    await writeSharedRecord(
      PERSISTENCE_KEYS.safetyPlanTemplates,
      'template-a',
      { id: 'template-a' }
    );
    await writeSharedRecord(
      PERSISTENCE_KEYS.safetyPlans,
      'plan-a',
      { id: 'plan-a', tenantId: 'tenant-a', revision: 1 }
    );
    await writeSharedRecord(
      PERSISTENCE_KEYS.safetyPlanAudit,
      'audit-a',
      { id: 'audit-a', tenantId: 'tenant-a', planId: 'plan-a' }
    );
    await writeSharedRecord(PERSISTENCE_KEYS.jobs, 'job-a', { id: 'job-a' });

    expect(localStorage.getItem(PERSISTENCE_KEYS.safetyPlans)).toBeNull();
    expect(localStorage.getItem(`${PERSISTENCE_KEYS.safetyPlans}:tenant-a:user-a`))
      .not.toBeNull();
    expect(localStorage.getItem(`${PERSISTENCE_KEYS.safetyPlanTemplates}:tenant-a:user-a`))
      .not.toBeNull();
    expect(localStorage.getItem(`${PERSISTENCE_KEYS.safetyPlanAudit}:tenant-a:user-a`))
      .not.toBeNull();
    expect(localStorage.getItem(PERSISTENCE_KEYS.jobs)).not.toBeNull();

    localStorage.setItem(PERSISTENCE_KEYS.session, JSON.stringify({
      id: 'user-b',
      tenantId: 'tenant-b',
    }));
    await expect(
      readSharedRecord(PERSISTENCE_KEYS.safetyPlans, 'plan-a')
    ).resolves.toBeNull();
    await expect(
      readSharedRecord(PERSISTENCE_KEYS.safetyPlanTemplates, 'template-a')
    ).resolves.toBeNull();
    await expect(
      readSharedRecord(PERSISTENCE_KEYS.safetyPlanAudit, 'audit-a')
    ).resolves.toBeNull();
    await expect(
      readSharedRecord(PERSISTENCE_KEYS.jobs, 'job-a')
    ).resolves.toEqual({ id: 'job-a' });
  });

  test('propagates caller cancellation through the remote fetch transport', async () => {
    let transportSignal: AbortSignal | undefined;
    global.fetch = vi.fn((_url: string, options?: RequestInit) => {
      transportSignal = options?.signal || undefined;
      return new Promise((_resolve, reject) => {
        transportSignal?.addEventListener('abort', () => {
          const abortError = new Error('cancelled');
          abortError.name = 'AbortError';
          reject(abortError);
        }, { once: true });
      });
    }) as any;
    const controller = new AbortController();

    const request = readSharedRecord(
      PERSISTENCE_KEYS.safetyPlans,
      'plan-a',
      { signal: controller.signal }
    ).catch((error) => error);
    await Promise.resolve();
    controller.abort();

    expect(transportSignal?.aborted).toBe(true);
    await expect(request).resolves.toMatchObject({ name: 'AbortError' });
  });

  test('propagates caller cancellation through write, delete, and restore transports', async () => {
    const transportSignals: AbortSignal[] = [];
    global.fetch = vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.signal) transportSignals.push(options.signal);
      throw new DOMException('cancelled', 'AbortError');
    }) as any;
    const controller = new AbortController();
    controller.abort();
    const admin = {
      userId: 'admin-a',
      name: 'Admin',
      role: 'admin' as const,
      operationalAuthority: true,
    };

    await expect(writeSharedRecord(
      PERSISTENCE_KEYS.safetyPlans,
      'plan-a',
      { id: 'plan-a', revision: 2 },
      { signal: controller.signal }
    )).rejects.toMatchObject({ name: 'AbortError' });
    await expect(deleteSharedRecord(
      PERSISTENCE_KEYS.safetyPlans,
      'plan-a',
      { expectedRevision: 2, actor: admin, signal: controller.signal }
    )).rejects.toMatchObject({ name: 'AbortError' });
    await expect(restoreSharedRecord(
      PERSISTENCE_KEYS.safetyPlans,
      'plan-a',
      { expectedRevision: 3, actor: admin, signal: controller.signal }
    )).rejects.toMatchObject({ name: 'AbortError' });

    expect(transportSignals).toHaveLength(3);
    expect(transportSignals.every((signal) => signal.aborted)).toBe(true);
  });
});
