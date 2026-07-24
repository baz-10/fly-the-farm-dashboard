import { vi } from 'vitest';
import { makeSafetyPlan, makeSafetyPlanVersion } from '../test/safetyPlanFixtures';
import type { SafetyPlan, SafetyPlanAuditEvent } from '../types/safetyPlan';

let storeHandler: any;

function response(status: number, body: any) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body === null ? '' : JSON.stringify(body),
  };
}

function createResponse() {
  return {
    statusCode: 200,
    body: undefined as any,
    headers: {} as Record<string, any>,
    status(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
    json(body: any) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
    setHeader(name: string, value: any) {
      this.headers[name.toLowerCase()] = value;
    },
    getHeader(name: string) {
      return this.headers[name.toLowerCase()];
    },
  };
}

function request(
  method: string,
  collection: string,
  body?: Record<string, unknown>,
  recordId?: string
) {
  return {
    method,
    body,
    query: { collection, ...(recordId ? { recordId } : {}) },
    headers: {
      cookie: 'ftf_access_token=token-a',
      host: 'localhost:3001',
      origin: 'http://localhost:3001',
    },
  };
}

function makeAuditEvent(id = 'audit-1'): SafetyPlanAuditEvent {
  return {
    id,
    tenantId: 'tenant-a',
    planId: 'safety-plan-1',
    versionId: 'safety-plan-version-1',
    actor: {
      userId: 'user-a',
      name: 'User A',
      role: 'contractor',
      operationalAuthority: false,
    },
    action: 'created',
    occurredAt: '2026-07-24T00:00:00.000Z',
  };
}

function mockApi({
  role = 'admin',
  safetyPlanAuthority = false,
  stored = [],
  onPost,
}: {
  role?: 'admin' | 'contractor' | 'client';
  safetyPlanAuthority?: boolean;
  stored?: Array<{ tenant_id?: string; record_id?: string; payload: any }>;
  onPost?: (rows: any[]) => void;
} = {}) {
  global.fetch = vi.fn(async (url: string, options: RequestInit = {}) => {
    if (url.endsWith('/auth/v1/user')) {
      return response(200, { id: 'user-a', email: 'user-a@example.com', user_metadata: {} });
    }
    if (url.includes('/rest/v1/ftf_profiles')) {
      return response(200, [{
        user_id: 'user-a',
        tenant_id: 'tenant-a',
        role,
        name: 'User A',
        tier: 'free',
        safety_plan_authority: safetyPlanAuthority,
      }]);
    }
    if (url.includes('/rest/v1/ftf_store') && options.method === 'POST') {
      onPost?.(JSON.parse(String(options.body)));
      return response(204, null);
    }
    if (url.includes('/rest/v1/ftf_store') && options.method === 'DELETE') {
      return response(204, null);
    }
    if (url.includes('/rest/v1/ftf_store')) {
      const recordId = /record_id=eq\.([^&]+)/.exec(url)?.[1];
      const rows = recordId
        ? stored.filter((row) => row.record_id === decodeURIComponent(recordId))
        : stored;
      return response(200, rows);
    }
    return response(500, { message: `unexpected request ${url}` });
  }) as any;
}

describe('Safety Plan persistent store security', () => {
  const originalEnvironment = process.env;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    process.env = {
      ...originalEnvironment,
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    };
    vi.resetModules();
    const storeModule = await import('../../api/store');
    storeHandler = storeModule.default ?? storeModule;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = originalEnvironment;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it.each([
    'ftf_safety_plan_templates',
    'ftf_safety_plans',
    'ftf_safety_plan_audit',
  ])('rejects clients from %s', async (collection) => {
    mockApi({ role: 'client' });
    const res = createResponse();

    await storeHandler(request('GET', collection), res);

    expect(res.statusCode).toBe(403);
  });

  it('allows contractors to read templates but only administrators to write them', async () => {
    mockApi({ role: 'contractor' });
    const readResponse = createResponse();
    const writeResponse = createResponse();

    await storeHandler(request('GET', 'ftf_safety_plan_templates'), readResponse);
    await storeHandler(request('PUT', 'ftf_safety_plan_templates', {
      collection: 'ftf_safety_plan_templates',
      recordId: 'template-1',
      payload: { id: 'template-1' },
    }), writeResponse);

    expect(readResponse.statusCode).toBe(200);
    expect(writeResponse.statusCode).toBe(403);
  });

  it('never returns a Safety Plan row from another tenant', async () => {
    mockApi({
      stored: [{
        tenant_id: 'tenant-b',
        record_id: 'safety-plan-1',
        payload: makeSafetyPlan({ tenantId: 'tenant-b' }),
      }],
    });
    const res = createResponse();

    await storeHandler(request('GET', 'ftf_safety_plans'), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.records).toEqual([]);
  });

  it('rejects a Safety Plan tenant change', async () => {
    const storedPlan = makeSafetyPlan({ tenantId: 'tenant-a' });
    mockApi({
      stored: [{ tenant_id: 'tenant-a', record_id: storedPlan.id, payload: storedPlan }],
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plans', {
      collection: 'ftf_safety_plans',
      recordId: storedPlan.id,
      payload: makeSafetyPlan({ tenantId: 'tenant-b' }),
    }), res);

    expect(res.statusCode).toBe(403);
  });

  it('does not allow a non-authority contractor to approve a plan', async () => {
    const storedPlan = makeSafetyPlan({
      tenantId: 'tenant-a',
      status: 'submitted',
      versions: [makeSafetyPlanVersion({ status: 'submitted', revision: 2 })],
    });
    const approved = makeSafetyPlan({
      ...storedPlan,
      status: 'approved',
      versions: [makeSafetyPlanVersion({ status: 'approved', revision: 3 })],
    });
    mockApi({
      role: 'contractor',
      stored: [{ tenant_id: 'tenant-a', record_id: storedPlan.id, payload: storedPlan }],
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plans', {
      collection: 'ftf_safety_plans',
      recordId: storedPlan.id,
      payload: approved,
    }), res);

    expect(res.statusCode).toBe(403);
  });

  it('allows a nominated contractor to approve a submitted plan', async () => {
    const storedPlan = makeSafetyPlan({
      tenantId: 'tenant-a',
      status: 'submitted',
      versions: [makeSafetyPlanVersion({ status: 'submitted', revision: 2 })],
    });
    const approved = makeSafetyPlan({
      ...storedPlan,
      status: 'approved',
      versions: [makeSafetyPlanVersion({
        status: 'approved',
        revision: 3,
        approvedAt: '2026-07-24T01:00:00.000Z',
      })],
    });
    let postedRows: any[] = [];
    mockApi({
      role: 'contractor',
      safetyPlanAuthority: true,
      stored: [{ tenant_id: 'tenant-a', record_id: storedPlan.id, payload: storedPlan }],
      onPost: (rows) => { postedRows = rows; },
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plans', {
      collection: 'ftf_safety_plans',
      recordId: storedPlan.id,
      payload: approved,
    }), res);

    expect(res.statusCode).toBe(200);
    expect(postedRows[0].payload.status).toBe('approved');
  });

  it('rejects stale Safety Plan revisions', async () => {
    const storedPlan = makeSafetyPlan({
      tenantId: 'tenant-a',
      versions: [makeSafetyPlanVersion({ revision: 4 })],
    });
    const stalePlan = makeSafetyPlan({
      ...storedPlan,
      updatedAt: '2026-07-24T02:00:00.000Z',
      versions: [makeSafetyPlanVersion({ revision: 4, updatedAt: '2026-07-24T02:00:00.000Z' })],
    });
    mockApi({
      stored: [{ tenant_id: 'tenant-a', record_id: storedPlan.id, payload: storedPlan }],
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plans', {
      collection: 'ftf_safety_plans',
      recordId: storedPlan.id,
      payload: stalePlan,
    }), res);

    expect(res.statusCode).toBe(409);
  });

  it('accepts a draft edit with the next revision', async () => {
    const storedPlan = makeSafetyPlan({
      tenantId: 'tenant-a',
      versions: [makeSafetyPlanVersion({ revision: 4 })],
    });
    const updatedPlan = makeSafetyPlan({
      ...storedPlan,
      updatedAt: '2026-07-24T02:00:00.000Z',
      versions: [makeSafetyPlanVersion({ revision: 5, updatedAt: '2026-07-24T02:00:00.000Z' })],
    });
    let postedRows: any[] = [];
    mockApi({
      role: 'contractor',
      stored: [{ tenant_id: 'tenant-a', record_id: storedPlan.id, payload: storedPlan }],
      onPost: (rows) => { postedRows = rows; },
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plans', {
      collection: 'ftf_safety_plans',
      recordId: storedPlan.id,
      payload: updatedPlan,
    }), res);

    expect(res.statusCode).toBe(200);
    expect(postedRows[0].payload.versions[0].revision).toBe(5);
  });

  it('validates every Safety Plan in a list write against its stored ID', async () => {
    const firstStored = makeSafetyPlan({
      id: 'plan-1',
      tenantId: 'tenant-a',
      currentVersionId: 'version-1',
      versions: [makeSafetyPlanVersion({ id: 'version-1', planId: 'plan-1', revision: 1 })],
    });
    const secondStored = makeSafetyPlan({
      id: 'plan-2',
      tenantId: 'tenant-a',
      currentVersionId: 'version-2',
      versions: [makeSafetyPlanVersion({ id: 'version-2', planId: 'plan-2', revision: 7 })],
    });
    const firstIncoming = makeSafetyPlan({
      ...firstStored,
      updatedAt: '2026-07-24T02:00:00.000Z',
      versions: [makeSafetyPlanVersion({
        id: 'version-1',
        planId: 'plan-1',
        revision: 2,
        updatedAt: '2026-07-24T02:00:00.000Z',
      })],
    });
    const staleSecond = makeSafetyPlan({
      ...secondStored,
      updatedAt: '2026-07-24T02:00:00.000Z',
      versions: [makeSafetyPlanVersion({
        id: 'version-2',
        planId: 'plan-2',
        revision: 7,
        updatedAt: '2026-07-24T02:00:00.000Z',
      })],
    });
    mockApi({
      stored: [
        { tenant_id: 'tenant-a', record_id: firstStored.id, payload: firstStored },
        { tenant_id: 'tenant-a', record_id: secondStored.id, payload: secondStored },
      ],
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plans', {
      collection: 'ftf_safety_plans',
      records: [firstIncoming, staleSecond],
    }), res);

    expect(res.statusCode).toBe(409);
  });

  it('rejects duplicate version IDs inside a Safety Plan', async () => {
    const storedPlan = makeSafetyPlan({
      tenantId: 'tenant-a',
      versions: [makeSafetyPlanVersion({ revision: 1 })],
    });
    const nextVersion = makeSafetyPlanVersion({ revision: 2 });
    const incoming = makeSafetyPlan({
      ...storedPlan,
      versions: [nextVersion, { ...nextVersion }],
    });
    mockApi({
      stored: [{ tenant_id: 'tenant-a', record_id: storedPlan.id, payload: storedPlan }],
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plans', {
      collection: 'ftf_safety_plans',
      recordId: storedPlan.id,
      payload: incoming,
    }), res);

    expect(res.statusCode).toBe(400);
  });

  it.each(['approved', 'superseded'] as const)(
    'rejects edits to a %s snapshot',
    async (status) => {
      const storedVersion = makeSafetyPlanVersion({ status, revision: 3 });
      const storedPlan = makeSafetyPlan({
        tenantId: 'tenant-a',
        status,
        versions: [storedVersion],
      });
      const incoming = makeSafetyPlan({
        ...storedPlan,
        updatedAt: '2026-07-24T02:00:00.000Z',
        versions: [{
          ...storedVersion,
          revision: 4,
          sections: [{ ...storedVersion.sections[0], title: 'Tampered title' }],
        }],
      });
      mockApi({
        stored: [{ tenant_id: 'tenant-a', record_id: storedPlan.id, payload: storedPlan }],
      });
      const res = createResponse();

      await storeHandler(request('PUT', 'ftf_safety_plans', {
        collection: 'ftf_safety_plans',
        recordId: storedPlan.id,
        payload: incoming,
      }), res);

      expect(res.statusCode).toBe(403);
    }
  );

  it.each(['approved', 'superseded'] as const)(
    'rejects deletion of a plan containing a %s version even for administrators',
    async (status) => {
      const storedPlan = makeSafetyPlan({
        tenantId: 'tenant-a',
        status,
        versions: [makeSafetyPlanVersion({ status })],
      });
      mockApi({
        stored: [{ tenant_id: 'tenant-a', record_id: storedPlan.id, payload: storedPlan }],
      });
      const res = createResponse();

      await storeHandler(request('DELETE', 'ftf_safety_plans', undefined, storedPlan.id), res);

      expect(res.statusCode).toBe(403);
    }
  );

  it('does not permit collection-wide Safety Plan deletion', async () => {
    mockApi();
    const res = createResponse();

    await storeHandler(request('DELETE', 'ftf_safety_plans'), res);

    expect(res.statusCode).toBe(403);
  });

  it('allows new audit IDs to be appended', async () => {
    const event = makeAuditEvent('audit-new');
    let postedRows: any[] = [];
    mockApi({ role: 'contractor', onPost: (rows) => { postedRows = rows; } });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plan_audit', {
      collection: 'ftf_safety_plan_audit',
      recordId: event.id,
      payload: event,
    }), res);

    expect(res.statusCode).toBe(200);
    expect(postedRows[0].payload).toEqual(event);
  });

  it('rejects replacement of an existing audit ID', async () => {
    const event = makeAuditEvent();
    mockApi({
      stored: [{ tenant_id: 'tenant-a', record_id: event.id, payload: event }],
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plan_audit', {
      collection: 'ftf_safety_plan_audit',
      recordId: event.id,
      payload: { ...event, action: 'approved' },
    }), res);

    expect(res.statusCode).toBe(409);
  });

  it('rejects an audit list write if any incoming ID already exists', async () => {
    const existing = makeAuditEvent('audit-existing');
    mockApi({
      stored: [{ tenant_id: 'tenant-a', record_id: existing.id, payload: existing }],
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plan_audit', {
      collection: 'ftf_safety_plan_audit',
      records: [makeAuditEvent('audit-new'), { ...existing, action: 'approved' }],
    }), res);

    expect(res.statusCode).toBe(409);
  });

  it('rejects duplicate audit IDs in the same append request', async () => {
    mockApi();
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plan_audit', {
      collection: 'ftf_safety_plan_audit',
      records: [makeAuditEvent('audit-new'), makeAuditEvent('audit-new')],
    }), res);

    expect(res.statusCode).toBe(400);
  });

  it('rejects record and collection-wide audit deletion', async () => {
    mockApi();
    const recordResponse = createResponse();
    const collectionResponse = createResponse();

    await storeHandler(
      request('DELETE', 'ftf_safety_plan_audit', undefined, 'audit-1'),
      recordResponse
    );
    await storeHandler(request('DELETE', 'ftf_safety_plan_audit'), collectionResponse);

    expect(recordResponse.statusCode).toBe(403);
    expect(collectionResponse.statusCode).toBe(403);
  });
});

export {};
