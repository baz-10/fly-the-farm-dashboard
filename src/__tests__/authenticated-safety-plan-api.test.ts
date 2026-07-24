import { vi } from 'vitest';
import { makeSafetyPlan, makeSafetyPlanVersion } from '../test/safetyPlanFixtures';
import type { SafetyPlan, SafetyPlanAuditEvent } from '../types/safetyPlan';
import { AU_REOC_SAFETY_PLAN_STANDARD } from '../data/safetyPlanStandard';

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
  recordId?: string,
  queryOverrides: Record<string, string> = {}
) {
  return {
    method,
    body,
    query: { collection, ...(recordId ? { recordId } : {}), ...queryOverrides },
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

function mutationAudit(
  plan: SafetyPlan,
  action: SafetyPlanAuditEvent['action'],
  id: string
) {
  return {
    id,
    planId: plan.id,
    ...(plan.currentVersionId ? { versionId: plan.currentVersionId } : {}),
    action,
  };
}

function mockApi({
  role = 'admin',
  safetyPlanAuthority = false,
  stored = [],
  onPost,
  onRpc,
  onInsertRpc,
  onMasterRpc,
  onTemplateDraftRpc,
}: {
  role?: 'admin' | 'contractor' | 'client';
  safetyPlanAuthority?: boolean;
  stored?: Array<{
    tenant_id?: string | null;
    collection?: string;
    record_id?: string;
    payload: any;
  }>;
  onPost?: (rows: any[], url: string, options: RequestInit) => void;
  onRpc?: (
    body: Record<string, unknown>,
    url: string,
    options: RequestInit
  ) => { succeeded: boolean; new_payload?: any };
  onInsertRpc?: (
    body: Record<string, unknown>,
    url: string,
    options: RequestInit
  ) => { succeeded: boolean; new_payload?: any };
  onMasterRpc?: (
    body: Record<string, unknown>,
    url: string,
    options: RequestInit
  ) => any;
  onTemplateDraftRpc?: (
    operation: 'init' | 'update',
    body: Record<string, unknown>,
    url: string,
    options: RequestInit
  ) => any;
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
    if (url.includes('/rest/v1/rpc/ftf_compare_and_swap_store_payload')) {
      const body = JSON.parse(String(options.body));
      const result = onRpc?.(body, url, options)
        ?? { succeeded: true, new_payload: body.p_payload };
      return response(200, [result]);
    }
    if (url.includes('/rest/v1/rpc/ftf_insert_safety_plan_with_audit')) {
      const body = JSON.parse(String(options.body));
      const result = onInsertRpc?.(body, url, options)
        ?? { succeeded: true, new_payload: body.p_plan_payload };
      return response(200, [result]);
    }
    if (url.includes('/rest/v1/rpc/ftf_publish_safety_plan_master')) {
      const body = JSON.parse(String(options.body));
      return response(200, onMasterRpc?.(body, url, options) ?? null);
    }
    if (url.includes('/rest/v1/rpc/ftf_init_safety_plan_template_draft')) {
      const body = JSON.parse(String(options.body));
      return response(200, onTemplateDraftRpc?.('init', body, url, options) ?? null);
    }
    if (url.includes('/rest/v1/rpc/ftf_update_safety_plan_template_draft')) {
      const body = JSON.parse(String(options.body));
      return response(200, onTemplateDraftRpc?.('update', body, url, options) ?? null);
    }
    if (url.includes('/rest/v1/ftf_store') && options.method === 'POST') {
      onPost?.(JSON.parse(String(options.body)), url, options);
      return response(204, null);
    }
    if (url.includes('/rest/v1/ftf_store') && options.method === 'DELETE') {
      return response(204, null);
    }
    if (url.includes('/rest/v1/ftf_store')) {
      const collection = /collection=eq\.([^&]+)/.exec(url)?.[1];
      const recordId = /record_id=eq\.([^&]+)/.exec(url)?.[1];
      const rows = stored.filter((row) =>
        (!collection || !row.collection || row.collection === decodeURIComponent(collection))
        && (!recordId || row.record_id === decodeURIComponent(recordId))
      );
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
    vi.useRealTimers();
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

  it('returns only list rows with the exact authenticated tenant id', async () => {
    const visible = makeSafetyPlan({ id: 'visible', tenantId: 'tenant-a' });
    mockApi({
      stored: [
        {
          tenant_id: 'tenant-a',
          record_id: visible.id,
          payload: visible,
        },
        {
          record_id: 'missing-tenant',
          payload: makeSafetyPlan({ id: 'missing-tenant', tenantId: 'tenant-a' }),
        },
        {
          tenant_id: null,
          record_id: 'null-tenant',
          payload: makeSafetyPlan({ id: 'null-tenant', tenantId: 'tenant-a' }),
        },
        {
          tenant_id: 'tenant-b',
          record_id: 'other-tenant',
          payload: makeSafetyPlan({ id: 'other-tenant', tenantId: 'tenant-b' }),
        },
      ],
    });
    const res = createResponse();

    await storeHandler(request('GET', 'ftf_safety_plans'), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.records).toEqual([visible]);
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['cross-tenant', 'tenant-b'],
  ])('fails closed for a singleton row with %s tenant ownership', async (recordId, tenantId) => {
    mockApi({
      stored: [{
        tenant_id: tenantId,
        record_id: recordId,
        payload: makeSafetyPlan({ id: recordId, tenantId: tenantId || 'tenant-a' }),
      }],
    });
    const res = createResponse();

    await storeHandler(request('GET', 'ftf_safety_plans', undefined, recordId), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.payload).toBeNull();
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
      revision: 2,
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
      audit: mutationAudit(approved, 'approved', 'audit-approved-authority'),
    }), res);

    expect(res.statusCode).toBe(403);
  });

  it('allows a nominated contractor to approve a submitted plan', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T03:00:00.000Z'));
    const storedPlan = makeSafetyPlan({
      tenantId: 'tenant-a',
      status: 'submitted',
      versions: [makeSafetyPlanVersion({ status: 'submitted', revision: 2 })],
    });
    const approved = makeSafetyPlan({
      ...storedPlan,
      revision: 2,
      status: 'approved',
      versions: [makeSafetyPlanVersion({
        status: 'approved',
        revision: 3,
        approvedAt: '2026-07-24T01:00:00.000Z',
      })],
    });
    let rpcBody: Record<string, unknown> | undefined;
    mockApi({
      role: 'contractor',
      safetyPlanAuthority: true,
      stored: [{ tenant_id: 'tenant-a', record_id: storedPlan.id, payload: storedPlan }],
      onRpc: (body) => {
        rpcBody = body;
        return { succeeded: true, new_payload: body.p_payload };
      },
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plans', {
      collection: 'ftf_safety_plans',
      recordId: storedPlan.id,
      payload: approved,
      audit: mutationAudit(approved, 'field_changed', 'audit-approved-valid'),
    }), res);

    expect(res.statusCode).toBe(200);
    expect((rpcBody?.p_payload as SafetyPlan).status).toBe('approved');
    expect((rpcBody?.p_audit_payload as SafetyPlanAuditEvent).action).toBe('approved');
    expect((rpcBody?.p_payload as SafetyPlan).versions[0]).toMatchObject({
      approvedAt: '2026-07-24T03:00:00.000Z',
      approvedBy: {
        userId: 'user-a',
        name: 'User A',
        role: 'contractor',
        operationalAuthority: true,
      },
    });
  });

  it('derives superseded when an approved version is superseded', async () => {
    const approvedVersion = makeSafetyPlanVersion({ status: 'approved', revision: 2 });
    const storedPlan = makeSafetyPlan({
      tenantId: 'tenant-a',
      revision: 2,
      status: 'approved',
      versions: [approvedVersion],
    });
    const supersededVersion = {
      ...approvedVersion,
      status: 'superseded' as const,
      revision: 3,
    };
    const incoming = {
      ...storedPlan,
      revision: 3,
      status: 'superseded' as const,
      versions: [supersededVersion],
    };
    let rpcBody: Record<string, any> | undefined;
    mockApi({
      safetyPlanAuthority: true,
      stored: [{ tenant_id: 'tenant-a', record_id: storedPlan.id, payload: storedPlan }],
      onRpc: (body) => {
        rpcBody = body;
        return { succeeded: true, new_payload: body.p_payload };
      },
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plans', {
      collection: 'ftf_safety_plans',
      recordId: storedPlan.id,
      payload: incoming,
      audit: mutationAudit(incoming, 'created', 'audit-forged-superseded'),
    }), res);

    expect(res.statusCode).toBe(200);
    expect(rpcBody?.p_audit_payload).toMatchObject({
      action: 'superseded',
      versionId: supersededVersion.id,
    });
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
    expect(res.body).toMatchObject({
      code: 'SAFETY_PLAN_CONFLICT',
      currentRevision: storedPlan.revision,
    });
  });

  it('accepts a draft edit with the next revision', async () => {
    const storedPlan = makeSafetyPlan({
      tenantId: 'tenant-a',
      versions: [makeSafetyPlanVersion({ revision: 4 })],
    });
    const updatedPlan = makeSafetyPlan({
      ...storedPlan,
      revision: 2,
      updatedAt: '2026-07-24T02:00:00.000Z',
      versions: [makeSafetyPlanVersion({ revision: 5, updatedAt: '2026-07-24T02:00:00.000Z' })],
    });
    let rpcBody: Record<string, unknown> | undefined;
    mockApi({
      role: 'contractor',
      stored: [{ tenant_id: 'tenant-a', record_id: storedPlan.id, payload: storedPlan }],
      onRpc: (body) => {
        rpcBody = body;
        return { succeeded: true, new_payload: body.p_payload };
      },
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plans', {
      collection: 'ftf_safety_plans',
      recordId: storedPlan.id,
      payload: updatedPlan,
      audit: mutationAudit(updatedPlan, 'field_changed', 'audit-draft-edit'),
    }), res);

    expect(res.statusCode).toBe(200);
    expect((rpcBody?.p_payload as SafetyPlan).versions[0].revision).toBe(5);
    expect(rpcBody?.p_expected_revision).toBe(1);
  });

  it('rejects multi-record Safety Plan list writes before transition validation', async () => {
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
      revision: 2,
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
      revision: 1,
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

    expect(res.statusCode).toBe(400);
  });

  it('rejects duplicate version IDs inside a Safety Plan', async () => {
    const storedPlan = makeSafetyPlan({
      tenantId: 'tenant-a',
      versions: [makeSafetyPlanVersion({ revision: 1 })],
    });
    const nextVersion = makeSafetyPlanVersion({ revision: 2 });
    const incoming = makeSafetyPlan({
      ...storedPlan,
      revision: 2,
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
      audit: mutationAudit(incoming, 'field_changed', 'audit-cas-update'),
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
        revision: 2,
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

      await storeHandler(
        request(
          'DELETE',
          'ftf_safety_plans',
          undefined,
          storedPlan.id,
          { expectedRevision: String(storedPlan.revision) }
        ),
        res
      );

      expect(res.statusCode).toBe(403);
    }
  );

  it('does not permit collection-wide Safety Plan deletion', async () => {
    mockApi();
    const res = createResponse();

    await storeHandler(request('DELETE', 'ftf_safety_plans'), res);

    expect(res.statusCode).toBe(403);
  });

  it('uses database compare-and-swap for every existing Safety Plan update', async () => {
    const storedPlan = makeSafetyPlan({
      tenantId: 'tenant-a',
      revision: 8,
      versions: [makeSafetyPlanVersion({ revision: 4 })],
    });
    const incoming = makeSafetyPlan({
      ...storedPlan,
      revision: 9,
      updatedAt: '2026-07-24T02:00:00.000Z',
      versions: [makeSafetyPlanVersion({
        revision: 5,
        updatedAt: '2026-07-24T02:00:00.000Z',
      })],
    });
    const postUrls: string[] = [];
    let rpcBody: Record<string, unknown> | undefined;
    mockApi({
      stored: [{ tenant_id: 'tenant-a', record_id: storedPlan.id, payload: storedPlan }],
      onPost: (_rows, url) => { postUrls.push(url); },
      onRpc: (body) => {
        rpcBody = body;
        return { succeeded: true, new_payload: body.p_payload };
      },
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plans', {
      collection: 'ftf_safety_plans',
      recordId: storedPlan.id,
      payload: incoming,
      audit: mutationAudit(incoming, 'field_changed', 'audit-concurrent-update'),
    }), res);

    expect(res.statusCode).toBe(200);
    expect(rpcBody).toMatchObject({
      p_tenant_id: 'tenant-a',
      p_collection: 'ftf_safety_plans',
      p_record_id: storedPlan.id,
      p_expected_revision: 8,
    });
    expect(postUrls).toEqual([]);
  });

  it('atomically stores server-derived audit metadata with an existing plan write', async () => {
    const storedPlan = makeSafetyPlan({
      tenantId: 'tenant-a',
      revision: 2,
      versions: [makeSafetyPlanVersion({ revision: 2 })],
    });
    const incoming = makeSafetyPlan({
      ...storedPlan,
      revision: 3,
      versions: [makeSafetyPlanVersion({ revision: 3 })],
    });
    let rpcBody: Record<string, any> | undefined;
    mockApi({
      stored: [{ tenant_id: 'tenant-a', record_id: storedPlan.id, payload: storedPlan }],
      onRpc: (body) => {
        rpcBody = body;
        return { succeeded: true, new_payload: body.p_payload };
      },
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plans', {
      collection: 'ftf_safety_plans',
      recordId: storedPlan.id,
      payload: incoming,
      audit: {
        id: 'audit-save-1',
        planId: storedPlan.id,
        versionId: storedPlan.currentVersionId,
        action: 'field_changed',
        tenantId: 'forged',
        actor: { userId: 'forged' },
        occurredAt: '1900-01-01T00:00:00.000Z',
      },
    }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.payload).toMatchObject({
      id: incoming.id,
      revision: incoming.revision,
      updatedAt: expect.any(String),
    });
    expect(rpcBody?.p_audit_record_id).toBe('audit-save-1');
    expect(rpcBody?.p_audit_payload).toMatchObject({
      id: 'audit-save-1',
      tenantId: 'tenant-a',
      planId: storedPlan.id,
      actor: {
        userId: 'user-a',
        name: 'User A',
        role: 'admin',
      },
      action: 'field_changed',
    });
    expect(rpcBody?.p_audit_payload.occurredAt).not.toBe('1900-01-01T00:00:00.000Z');
  });

  it('atomically inserts a new plan and its server-derived audit event', async () => {
    const plan = makeSafetyPlan({ tenantId: 'tenant-a', revision: 1 });
    let insertBody: Record<string, any> | undefined;
    mockApi({
      onInsertRpc: (body) => {
        insertBody = body;
        return { succeeded: true, new_payload: body.p_plan_payload };
      },
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plans', {
      collection: 'ftf_safety_plans',
      recordId: plan.id,
      payload: plan,
      audit: {
        id: 'audit-created-1',
        planId: plan.id,
        versionId: plan.currentVersionId,
        action: 'created',
      },
    }), res);

    expect(res.statusCode).toBe(200);
    expect(insertBody).toMatchObject({
      p_plan_record_id: plan.id,
      p_audit_record_id: 'audit-created-1',
    });
    expect(insertBody?.p_audit_payload).toMatchObject({
      tenantId: 'tenant-a',
      actor: { userId: 'user-a' },
      action: 'created',
    });
  });

  it('derives created for a new plan when the client forges revised', async () => {
    const plan = makeSafetyPlan({ tenantId: 'tenant-a', revision: 1 });
    let insertBody: Record<string, any> | undefined;
    mockApi({
      onInsertRpc: (body) => {
        insertBody = body;
        return { succeeded: true, new_payload: body.p_plan_payload };
      },
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plans', {
      collection: 'ftf_safety_plans',
      recordId: plan.id,
      payload: plan,
      audit: mutationAudit(plan, 'revised', 'audit-forged-revised'),
    }), res);

    expect(res.statusCode).toBe(200);
    expect(insertBody?.p_audit_payload).toMatchObject({
      action: 'created',
      versionId: plan.currentVersionId,
    });
  });

  it('derives field_changed for draft content when the client forges source_refreshed', async () => {
    const storedPlan = makeSafetyPlan({
      tenantId: 'tenant-a',
      revision: 2,
      versions: [makeSafetyPlanVersion({ revision: 2 })],
    });
    const incoming = makeSafetyPlan({
      ...storedPlan,
      revision: 3,
      versions: [makeSafetyPlanVersion({ revision: 3 })],
    });
    let rpcBody: Record<string, any> | undefined;
    mockApi({
      stored: [{ tenant_id: 'tenant-a', record_id: storedPlan.id, payload: storedPlan }],
      onRpc: (body) => {
        rpcBody = body;
        return { succeeded: true, new_payload: body.p_payload };
      },
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plans', {
      collection: 'ftf_safety_plans',
      recordId: incoming.id,
      payload: incoming,
      audit: mutationAudit(incoming, 'source_refreshed', 'audit-forged-source'),
    }), res);

    expect(res.statusCode).toBe(200);
    expect(rpcBody?.p_audit_payload.action).toBe('field_changed');
  });

  it('atomically derives source_refreshed from a valid one-shot intent and clears it canonically', async () => {
    const storedVersion = makeSafetyPlanVersion({ revision: 2 });
    const storedPlan = makeSafetyPlan({
      tenantId: 'tenant-a',
      revision: 2,
      versions: [storedVersion],
    });
    const incomingVersion = {
      ...storedVersion,
      revision: 3,
      sourceSnapshot: {
        ...storedVersion.sourceSnapshot,
        capturedAt: '2026-07-25T00:00:00.000Z',
      },
      sourceRefreshIntent: {
        kind: 'source_refresh' as const,
        before: {
          capturedAt: storedVersion.sourceSnapshot.capturedAt,
          sourceItemCount: 0,
        },
        after: {
          capturedAt: '2026-07-25T00:00:00.000Z',
          sourceItemCount: 0,
          decisions: [{
            itemId: 'context:job',
            action: 'keep_company_value',
          }],
        },
      },
    };
    const incoming = {
      ...storedPlan,
      revision: 3,
      versions: [incomingVersion],
    };
    let rpcBody: Record<string, any> | undefined;
    mockApi({
      stored: [{ tenant_id: 'tenant-a', record_id: storedPlan.id, payload: storedPlan }],
      onRpc: (body) => {
        rpcBody = body;
        return { succeeded: true, new_payload: body.p_payload };
      },
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plans', {
      collection: 'ftf_safety_plans',
      recordId: incoming.id,
      payload: incoming,
      audit: mutationAudit(incoming, 'field_changed', 'audit-source-intent'),
    }), res);

    expect(res.statusCode).toBe(200);
    expect(rpcBody?.p_payload.versions[0].sourceRefreshIntent).toBeUndefined();
    expect(rpcBody?.p_payload.versions[0].revision).toBe(3);
    expect(rpcBody?.p_audit_payload).toMatchObject({
      action: 'source_refreshed',
      actor: { userId: 'user-a' },
      before: {
        capturedAt: storedVersion.sourceSnapshot.capturedAt,
        sourceItemCount: 0,
      },
      after: {
        capturedAt: '2026-07-25T00:00:00.000Z',
        sourceItemCount: 0,
        decisions: [{
          itemId: 'context:job',
          action: 'keep_company_value',
        }],
      },
    });
    expect(rpcBody?.p_audit_payload.occurredAt).toEqual(expect.any(String));
  });

  it('rejects forged source refresh counts before the atomic write', async () => {
    const storedVersion = makeSafetyPlanVersion({ revision: 2 });
    const storedPlan = makeSafetyPlan({
      tenantId: 'tenant-a',
      revision: 2,
      versions: [storedVersion],
    });
    const incomingVersion = {
      ...storedVersion,
      revision: 3,
      sourceSnapshot: {
        ...storedVersion.sourceSnapshot,
        capturedAt: '2026-07-25T00:00:00.000Z',
      },
      sourceRefreshIntent: {
        kind: 'source_refresh' as const,
        before: {
          capturedAt: storedVersion.sourceSnapshot.capturedAt,
          sourceItemCount: 99,
        },
        after: {
          capturedAt: '2026-07-25T00:00:00.000Z',
          sourceItemCount: 42,
          decisions: [],
        },
      },
    };
    const incoming = {
      ...storedPlan,
      revision: 3,
      versions: [incomingVersion],
    };
    let rpcCalls = 0;
    mockApi({
      stored: [{ tenant_id: 'tenant-a', record_id: storedPlan.id, payload: storedPlan }],
      onRpc: () => {
        rpcCalls += 1;
        return { succeeded: true };
      },
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plans', {
      collection: 'ftf_safety_plans',
      recordId: incoming.id,
      payload: incoming,
      audit: mutationAudit(incoming, 'field_changed', 'audit-forged-source-metadata'),
    }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/source refresh metadata/i);
    expect(rpcCalls).toBe(0);
  });

  it('rejects forged source refresh decision IDs and actions before the atomic write', async () => {
    const storedVersion = makeSafetyPlanVersion({ revision: 2 });
    const storedPlan = makeSafetyPlan({
      tenantId: 'tenant-a',
      revision: 2,
      versions: [storedVersion],
    });
    const incomingVersion = {
      ...storedVersion,
      revision: 3,
      sourceSnapshot: {
        ...storedVersion.sourceSnapshot,
        capturedAt: '2026-07-25T00:00:00.000Z',
      },
      sourceRefreshIntent: {
        kind: 'source_refresh' as const,
        before: {
          capturedAt: storedVersion.sourceSnapshot.capturedAt,
          sourceItemCount: 0,
        },
        after: {
          capturedAt: '2026-07-25T00:00:00.000Z',
          sourceItemCount: 0,
          decisions: [{
            itemId: 'context:totally_forged',
            action: 'approve_everything',
          }],
        },
      },
    };
    const incoming = {
      ...storedPlan,
      revision: 3,
      versions: [incomingVersion],
    };
    let rpcCalls = 0;
    mockApi({
      stored: [{ tenant_id: 'tenant-a', record_id: storedPlan.id, payload: storedPlan }],
      onRpc: () => {
        rpcCalls += 1;
        return { succeeded: true };
      },
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plans', {
      collection: 'ftf_safety_plans',
      recordId: incoming.id,
      payload: incoming,
      audit: mutationAudit(incoming, 'field_changed', 'audit-forged-source-decision'),
    }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/invalid decision/i);
    expect(rpcCalls).toBe(0);
  });

  it('derives submitted from the transition when the client forges created', async () => {
    const storedVersion = makeSafetyPlanVersion({ status: 'draft', revision: 2 });
    const storedPlan = makeSafetyPlan({
      tenantId: 'tenant-a',
      revision: 2,
      status: 'draft',
      versions: [storedVersion],
    });
    const submittedVersion = { ...storedVersion, status: 'submitted' as const, revision: 3 };
    const incoming = {
      ...storedPlan,
      revision: 3,
      status: 'submitted' as const,
      versions: [submittedVersion],
    };
    let rpcBody: Record<string, any> | undefined;
    mockApi({
      stored: [{ tenant_id: 'tenant-a', record_id: storedPlan.id, payload: storedPlan }],
      onRpc: (body) => {
        rpcBody = body;
        return { succeeded: true, new_payload: body.p_payload };
      },
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plans', {
      collection: 'ftf_safety_plans',
      recordId: incoming.id,
      payload: incoming,
      audit: mutationAudit(incoming, 'created', 'audit-forged-created'),
    }), res);

    expect(res.statusCode).toBe(200);
    expect(rpcBody?.p_audit_payload.action).toBe('submitted');
  });

  it('derives revised when a controlled plan gains a new draft version', async () => {
    const approvedVersion = makeSafetyPlanVersion({ status: 'approved', revision: 2 });
    const storedPlan = makeSafetyPlan({
      tenantId: 'tenant-a',
      revision: 2,
      status: 'approved',
      versions: [approvedVersion],
    });
    const revisedVersion = makeSafetyPlanVersion({
      id: 'safety-plan-version-2',
      planId: storedPlan.id,
      status: 'draft',
      revision: 1,
      version: '2.0',
    });
    const incoming = {
      ...storedPlan,
      revision: 3,
      status: 'draft' as const,
      currentVersionId: revisedVersion.id,
      versions: [approvedVersion, revisedVersion],
    };
    let rpcBody: Record<string, any> | undefined;
    mockApi({
      safetyPlanAuthority: true,
      stored: [{ tenant_id: 'tenant-a', record_id: storedPlan.id, payload: storedPlan }],
      onRpc: (body) => {
        rpcBody = body;
        return { succeeded: true, new_payload: body.p_payload };
      },
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plans', {
      collection: 'ftf_safety_plans',
      recordId: incoming.id,
      payload: incoming,
      audit: mutationAudit(incoming, 'submitted', 'audit-forged-submitted'),
    }), res);

    expect(res.statusCode).toBe(200);
    expect(rpcBody?.p_audit_payload).toMatchObject({
      action: 'revised',
      versionId: revisedVersion.id,
    });
  });

  it('maps a racing new-plan insert to a typed conflict', async () => {
    const plan = makeSafetyPlan({ tenantId: 'tenant-a', revision: 1 });
    mockApi({
      onInsertRpc: () => ({ succeeded: false }),
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plans', {
      collection: 'ftf_safety_plans',
      recordId: plan.id,
      payload: plan,
      audit: {
        id: 'audit-created-1',
        planId: plan.id,
        versionId: plan.currentVersionId,
        action: 'created',
      },
    }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: 'SAFETY_PLAN_CONFLICT' });
  });

  it('allows only one of two concurrent writes with the same expected revision', async () => {
    const storedPlan = makeSafetyPlan({
      tenantId: 'tenant-a',
      revision: 4,
      versions: [makeSafetyPlanVersion({ revision: 2 })],
    });
    const incoming = makeSafetyPlan({
      ...storedPlan,
      revision: 5,
      updatedAt: '2026-07-24T02:00:00.000Z',
      versions: [makeSafetyPlanVersion({
        revision: 3,
        updatedAt: '2026-07-24T02:00:00.000Z',
      })],
    });
    let calls = 0;
    mockApi({
      stored: [{ tenant_id: 'tenant-a', record_id: storedPlan.id, payload: storedPlan }],
      onRpc: (body) => {
        calls += 1;
        return calls === 1
          ? { succeeded: true, new_payload: body.p_payload }
          : { succeeded: false };
      },
    });
    const first = createResponse();
    const second = createResponse();
    const body = {
      collection: 'ftf_safety_plans',
      recordId: storedPlan.id,
      payload: incoming,
      audit: mutationAudit(incoming, 'field_changed', 'audit-concurrent-write'),
    };

    await Promise.all([
      storeHandler(request('PUT', 'ftf_safety_plans', body), first),
      storeHandler(request('PUT', 'ftf_safety_plans', body), second),
    ]);

    expect([first.statusCode, second.statusCode].sort()).toEqual([200, 409]);
    expect(calls).toBe(2);
  });

  it('rejects submitted-to-submitted content edits', async () => {
    const storedVersion = makeSafetyPlanVersion({ status: 'submitted', revision: 2 });
    const storedPlan = makeSafetyPlan({
      tenantId: 'tenant-a',
      revision: 2,
      status: 'submitted',
      versions: [storedVersion],
    });
    const incoming = makeSafetyPlan({
      ...storedPlan,
      revision: 3,
      versions: [{
        ...storedVersion,
        revision: 3,
        sections: [{ ...storedVersion.sections[0], title: 'Changed while submitted' }],
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
      audit: mutationAudit(incoming, 'returned_to_draft', 'audit-returned-draft'),
    }), res);

    expect(res.statusCode).toBe(403);
  });

  it('rejects a normal contractor returning a submitted plan to draft', async () => {
    const storedVersion = makeSafetyPlanVersion({ status: 'submitted', revision: 2 });
    const storedPlan = makeSafetyPlan({
      tenantId: 'tenant-a',
      revision: 2,
      status: 'submitted',
      versions: [storedVersion],
    });
    const incoming = makeSafetyPlan({
      ...storedPlan,
      revision: 3,
      status: 'draft',
      versions: [{ ...storedVersion, status: 'draft', revision: 3 }],
    });
    mockApi({
      role: 'contractor',
      stored: [{ tenant_id: 'tenant-a', record_id: storedPlan.id, payload: storedPlan }],
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plans', {
      collection: 'ftf_safety_plans',
      recordId: storedPlan.id,
      payload: incoming,
    }), res);

    expect(res.statusCode).toBe(403);
  });

  it('rejects adding a dormant draft version while a plan remains submitted', async () => {
    const submitted = makeSafetyPlanVersion({ status: 'submitted', revision: 2 });
    const storedPlan = makeSafetyPlan({
      tenantId: 'tenant-a',
      revision: 2,
      status: 'submitted',
      versions: [submitted],
    });
    const incoming = makeSafetyPlan({
      ...storedPlan,
      revision: 3,
      versions: [
        submitted,
        makeSafetyPlanVersion({
          id: 'dormant-draft',
          status: 'draft',
          revision: 1,
        }),
      ],
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

    expect(res.statusCode).toBe(409);
  });

  it('rejects singleton replacement of a stored draft version without writing', async () => {
    const storedVersion = makeSafetyPlanVersion({ id: 'stored-draft', revision: 2 });
    const storedPlan = makeSafetyPlan({
      tenantId: 'tenant-a',
      revision: 2,
      currentVersionId: storedVersion.id,
      versions: [storedVersion],
    });
    const replacement = makeSafetyPlanVersion({
      id: 'replacement-draft',
      revision: 1,
    });
    const incoming = makeSafetyPlan({
      ...storedPlan,
      revision: 3,
      currentVersionId: replacement.id,
      versions: [replacement],
    });
    let rpcCalls = 0;
    let inserts = 0;
    mockApi({
      stored: [{ tenant_id: 'tenant-a', record_id: storedPlan.id, payload: storedPlan }],
      onRpc: (body) => {
        rpcCalls += 1;
        return { succeeded: true, new_payload: body.p_payload };
      },
      onPost: () => { inserts += 1; },
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plans', {
      collection: 'ftf_safety_plans',
      recordId: storedPlan.id,
      payload: incoming,
    }), res);

    expect(res.statusCode).toBe(409);
    expect(rpcCalls).toBe(0);
    expect(inserts).toBe(0);
    expect(storedPlan.versions.map((version) => version.id)).toEqual(['stored-draft']);
  });

  it('rejects admin replacement of a submitted version instead of returning it to draft', async () => {
    const submitted = makeSafetyPlanVersion({
      id: 'submitted-version',
      status: 'submitted',
      revision: 2,
    });
    const storedPlan = makeSafetyPlan({
      tenantId: 'tenant-a',
      revision: 2,
      status: 'submitted',
      currentVersionId: submitted.id,
      versions: [submitted],
    });
    const replacement = makeSafetyPlanVersion({
      id: 'replacement-version',
      status: 'draft',
      revision: 1,
    });
    const incoming = makeSafetyPlan({
      ...storedPlan,
      revision: 3,
      status: 'draft',
      currentVersionId: replacement.id,
      versions: [replacement],
    });
    let rpcCalls = 0;
    let inserts = 0;
    mockApi({
      stored: [{ tenant_id: 'tenant-a', record_id: storedPlan.id, payload: storedPlan }],
      onRpc: (body) => {
        rpcCalls += 1;
        return { succeeded: true, new_payload: body.p_payload };
      },
      onPost: () => { inserts += 1; },
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plans', {
      collection: 'ftf_safety_plans',
      recordId: storedPlan.id,
      payload: incoming,
    }), res);

    expect(res.statusCode).toBe(409);
    expect(rpcCalls).toBe(0);
    expect(inserts).toBe(0);
    expect(storedPlan.versions[0]).toMatchObject({
      id: 'submitted-version',
      status: 'submitted',
    });
  });

  it('returns a submitted version to draft without changing its identity', async () => {
    const submitted = makeSafetyPlanVersion({
      id: 'submitted-version',
      status: 'submitted',
      revision: 2,
    });
    const storedPlan = makeSafetyPlan({
      tenantId: 'tenant-a',
      revision: 2,
      status: 'submitted',
      currentVersionId: submitted.id,
      versions: [submitted],
    });
    const incoming = makeSafetyPlan({
      ...storedPlan,
      revision: 3,
      status: 'draft',
      versions: [{ ...submitted, status: 'draft', revision: 3 }],
    });
    let saved: SafetyPlan | undefined;
    mockApi({
      stored: [{ tenant_id: 'tenant-a', record_id: storedPlan.id, payload: storedPlan }],
      onRpc: (body) => {
        saved = body.p_payload as SafetyPlan;
        return { succeeded: true, new_payload: body.p_payload };
      },
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plans', {
      collection: 'ftf_safety_plans',
      recordId: storedPlan.id,
      payload: incoming,
      audit: mutationAudit(incoming, 'returned_to_draft', 'audit-returned-valid'),
    }), res);

    expect(res.statusCode).toBe(200);
    expect(saved?.currentVersionId).toBe('submitted-version');
    expect(saved?.versions).toEqual([
      expect.objectContaining({
        id: 'submitted-version',
        status: 'draft',
        revision: 3,
      }),
    ]);
  });

  it('rejects a contractor retaining submitted history while switching current to a new draft', async () => {
    const submitted = makeSafetyPlanVersion({
      id: 'submitted-version',
      status: 'submitted',
      revision: 2,
    });
    const storedPlan = makeSafetyPlan({
      tenantId: 'tenant-a',
      revision: 2,
      status: 'submitted',
      currentVersionId: submitted.id,
      versions: [submitted],
    });
    const newDraft = makeSafetyPlanVersion({
      id: 'new-draft',
      status: 'draft',
      revision: 1,
    });
    const incoming = makeSafetyPlan({
      ...storedPlan,
      revision: 3,
      status: 'draft',
      currentVersionId: newDraft.id,
      versions: [submitted, newDraft],
    });
    let rpcCalls = 0;
    let inserts = 0;
    mockApi({
      role: 'contractor',
      stored: [{ tenant_id: 'tenant-a', record_id: storedPlan.id, payload: storedPlan }],
      onRpc: (body) => {
        rpcCalls += 1;
        return { succeeded: true, new_payload: body.p_payload };
      },
      onPost: () => { inserts += 1; },
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plans', {
      collection: 'ftf_safety_plans',
      recordId: storedPlan.id,
      payload: incoming,
    }), res);

    expect(res.statusCode).toBe(409);
    expect(rpcCalls).toBe(0);
    expect(inserts).toBe(0);
  });

  it('rejects an administrator switching submitted current in a one-record list write', async () => {
    const submitted = makeSafetyPlanVersion({
      id: 'submitted-version',
      status: 'submitted',
      revision: 2,
    });
    const storedPlan = makeSafetyPlan({
      tenantId: 'tenant-a',
      revision: 2,
      status: 'submitted',
      currentVersionId: submitted.id,
      versions: [submitted],
    });
    const newDraft = makeSafetyPlanVersion({
      id: 'new-draft',
      status: 'draft',
      revision: 1,
    });
    const incoming = makeSafetyPlan({
      ...storedPlan,
      revision: 3,
      status: 'draft',
      currentVersionId: newDraft.id,
      versions: [submitted, newDraft],
    });
    let rpcCalls = 0;
    let inserts = 0;
    mockApi({
      role: 'admin',
      stored: [{ tenant_id: 'tenant-a', record_id: storedPlan.id, payload: storedPlan }],
      onRpc: (body) => {
        rpcCalls += 1;
        return { succeeded: true, new_payload: body.p_payload };
      },
      onPost: () => { inserts += 1; },
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plans', {
      collection: 'ftf_safety_plans',
      records: [incoming],
    }), res);

    expect(res.statusCode).toBe(400);
    expect(rpcCalls).toBe(0);
    expect(inserts).toBe(0);
  });

  it('rejects even an authorised one-record Safety Plan list write', async () => {
    const submitted = makeSafetyPlanVersion({
      id: 'submitted-version',
      status: 'submitted',
      revision: 2,
    });
    const storedPlan = makeSafetyPlan({
      tenantId: 'tenant-a',
      revision: 2,
      status: 'submitted',
      currentVersionId: submitted.id,
      versions: [submitted],
    });
    const incoming = makeSafetyPlan({
      ...storedPlan,
      revision: 3,
      status: 'draft',
      versions: [{ ...submitted, status: 'draft', revision: 3 }],
    });
    let saved: SafetyPlan | undefined;
    mockApi({
      role: 'contractor',
      safetyPlanAuthority: true,
      stored: [{ tenant_id: 'tenant-a', record_id: storedPlan.id, payload: storedPlan }],
      onRpc: (body) => {
        saved = body.p_payload as SafetyPlan;
        return { succeeded: true, new_payload: body.p_payload };
      },
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plans', {
      collection: 'ftf_safety_plans',
      records: [incoming],
    }), res);

    expect(res.statusCode).toBe(400);
    expect(saved).toBeUndefined();
  });

  it('rejects a single-record list replacement that omits a stored version', async () => {
    const storedVersion = makeSafetyPlanVersion({ id: 'stored-draft', revision: 2 });
    const storedPlan = makeSafetyPlan({
      tenantId: 'tenant-a',
      revision: 2,
      currentVersionId: storedVersion.id,
      versions: [storedVersion],
    });
    const replacement = makeSafetyPlanVersion({ id: 'replacement-draft', revision: 1 });
    const incoming = makeSafetyPlan({
      ...storedPlan,
      revision: 3,
      currentVersionId: replacement.id,
      versions: [replacement],
    });
    let rpcCalls = 0;
    mockApi({
      stored: [{ tenant_id: 'tenant-a', record_id: storedPlan.id, payload: storedPlan }],
      onRpc: (body) => {
        rpcCalls += 1;
        return { succeeded: true, new_payload: body.p_payload };
      },
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plans', {
      collection: 'ftf_safety_plans',
      records: [incoming],
    }), res);

    expect(res.statusCode).toBe(400);
    expect(rpcCalls).toBe(0);
  });

  it('rejects multi-record Safety Plan writes before a later conflict can partially commit', async () => {
    const firstStored = makeSafetyPlan({
      id: 'plan-first',
      tenantId: 'tenant-a',
      revision: 2,
      currentVersionId: 'version-first',
      versions: [makeSafetyPlanVersion({
        id: 'version-first',
        planId: 'plan-first',
        revision: 2,
      })],
    });
    const secondStored = makeSafetyPlan({
      id: 'plan-second',
      tenantId: 'tenant-a',
      revision: 2,
      currentVersionId: 'version-second',
      versions: [makeSafetyPlanVersion({
        id: 'version-second',
        planId: 'plan-second',
        revision: 2,
      })],
    });
    const firstIncoming = makeSafetyPlan({
      ...firstStored,
      revision: 3,
      versions: [makeSafetyPlanVersion({
        id: 'version-first',
        planId: 'plan-first',
        revision: 3,
      })],
    });
    const conflictingSecond = makeSafetyPlan({
      ...secondStored,
      revision: 3,
      versions: [makeSafetyPlanVersion({
        id: 'version-second',
        planId: 'plan-second',
        revision: 3,
      })],
    });
    let rpcCalls = 0;
    let inserts = 0;
    mockApi({
      stored: [
        { tenant_id: 'tenant-a', record_id: firstStored.id, payload: firstStored },
        { tenant_id: 'tenant-a', record_id: secondStored.id, payload: secondStored },
      ],
      onRpc: (body) => {
        rpcCalls += 1;
        return rpcCalls === 1
          ? { succeeded: true, new_payload: body.p_payload }
          : { succeeded: false };
      },
      onPost: () => { inserts += 1; },
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plans', {
      collection: 'ftf_safety_plans',
      records: [firstIncoming, conflictingSecond],
    }), res);

    expect(res.statusCode).toBe(400);
    expect(rpcCalls).toBe(0);
    expect(inserts).toBe(0);
    expect(firstStored.revision).toBe(2);
    expect(firstStored.versions[0].revision).toBe(2);
  });

  it('soft deletes a draft with server-derived metadata and audit', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T04:00:00.000Z'));
    const storedPlan = makeSafetyPlan({ tenantId: 'tenant-a', revision: 3 });
    let deletedPayload: SafetyPlan | undefined;
    let rpcBody: Record<string, any> | undefined;
    const auditRows: any[] = [];
    mockApi({
      stored: [{ tenant_id: 'tenant-a', record_id: storedPlan.id, payload: storedPlan }],
      onRpc: (body) => {
        rpcBody = body;
        deletedPayload = body.p_payload as SafetyPlan;
        return { succeeded: true, new_payload: body.p_payload };
      },
      onPost: (rows) => { auditRows.push(...rows); },
    });
    const res = createResponse();

    await storeHandler(
      request(
        'DELETE',
        'ftf_safety_plans',
        undefined,
        storedPlan.id,
        { expectedRevision: String(storedPlan.revision) }
      ),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(deletedPayload).toMatchObject({
      id: storedPlan.id,
      revision: 4,
      deletedAt: '2026-07-24T04:00:00.000Z',
      deletedBy: {
        userId: 'user-a',
        name: 'User A',
        role: 'admin',
        operationalAuthority: true,
      },
    });
    expect(rpcBody?.p_audit_payload).toMatchObject({
      tenantId: 'tenant-a',
      planId: storedPlan.id,
      action: 'draft_deleted',
      occurredAt: '2026-07-24T04:00:00.000Z',
    });
    expect(rpcBody?.p_audit_record_id).toBe(rpcBody?.p_audit_payload.id);
    expect(auditRows).toEqual([]);
    vi.useRealTimers();
  });

  it('rejects stale draft deletion with the current revision', async () => {
    const storedPlan = makeSafetyPlan({ tenantId: 'tenant-a', revision: 4 });
    let rpcCalls = 0;
    mockApi({
      stored: [{ tenant_id: 'tenant-a', record_id: storedPlan.id, payload: storedPlan }],
      onRpc: () => {
        rpcCalls += 1;
        return { succeeded: true };
      },
    });
    const res = createResponse();

    await storeHandler(
      request(
        'DELETE',
        'ftf_safety_plans',
        undefined,
        storedPlan.id,
        { expectedRevision: '3' }
      ),
      res
    );

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({
      code: 'SAFETY_PLAN_CONFLICT',
      currentRevision: 4,
    });
    expect(rpcCalls).toBe(0);
  });

  it('reports revision conflict before lifecycle rejection for stale deletion', async () => {
    const submittedVersion = makeSafetyPlanVersion({ status: 'submitted', revision: 4 });
    const submitted = makeSafetyPlan({
      tenantId: 'tenant-a',
      revision: 4,
      status: 'submitted',
      versions: [submittedVersion],
    });
    mockApi({
      stored: [{ tenant_id: 'tenant-a', record_id: submitted.id, payload: submitted }],
    });
    const res = createResponse();

    await storeHandler(
      request('DELETE', 'ftf_safety_plans', undefined, submitted.id, { expectedRevision: '3' }),
      res
    );

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({
      code: 'SAFETY_PLAN_CONFLICT',
      currentRevision: 4,
    });
  });

  it('hides deleted drafts unless an administrator explicitly includes them', async () => {
    const deleted = makeSafetyPlan({
      tenantId: 'tenant-a',
      deletedAt: '2026-07-24T04:00:00.000Z',
    });
    const rows = [{ tenant_id: 'tenant-a', record_id: deleted.id, payload: deleted }];
    mockApi({ stored: rows });
    const defaultResponse = createResponse();
    const includedResponse = createResponse();

    await storeHandler(request('GET', 'ftf_safety_plans'), defaultResponse);
    await storeHandler(
      request('GET', 'ftf_safety_plans', undefined, undefined, { includeDeleted: 'true' }),
      includedResponse
    );

    expect(defaultResponse.body.records).toEqual([]);
    expect(includedResponse.body.records).toEqual([deleted]);
  });

  it('requires explicit administrator recovery access for a deleted singleton', async () => {
    const deleted = makeSafetyPlan({
      tenantId: 'tenant-a',
      deletedAt: '2026-07-24T04:00:00.000Z',
    });
    mockApi({
      stored: [{ tenant_id: 'tenant-a', record_id: deleted.id, payload: deleted }],
    });
    const defaultResponse = createResponse();
    const includedResponse = createResponse();

    await storeHandler(
      request('GET', 'ftf_safety_plans', undefined, deleted.id),
      defaultResponse
    );
    await storeHandler(
      request(
        'GET',
        'ftf_safety_plans',
        undefined,
        deleted.id,
        { includeDeleted: 'true' }
      ),
      includedResponse
    );

    expect(defaultResponse.body.payload).toBeNull();
    expect(includedResponse.body.payload).toEqual(deleted);
  });

  it('never exposes deleted drafts to contractors even with includeDeleted', async () => {
    const deleted = makeSafetyPlan({
      tenantId: 'tenant-a',
      deletedAt: '2026-07-24T04:00:00.000Z',
    });
    mockApi({
      role: 'contractor',
      stored: [{ tenant_id: 'tenant-a', record_id: deleted.id, payload: deleted }],
    });
    const res = createResponse();

    await storeHandler(
      request('GET', 'ftf_safety_plans', undefined, undefined, { includeDeleted: 'true' }),
      res
    );

    expect(res.statusCode).toBe(403);
  });

  it('restores a deleted draft only for administrators', async () => {
    const deleted = makeSafetyPlan({
      tenantId: 'tenant-a',
      revision: 5,
      deletedAt: '2026-07-24T04:00:00.000Z',
      deletedBy: {
        userId: 'user-a',
        name: 'User A',
        role: 'admin',
        operationalAuthority: true,
      },
    });
    let restored: SafetyPlan | undefined;
    mockApi({
      stored: [{ tenant_id: 'tenant-a', record_id: deleted.id, payload: deleted }],
      onRpc: (body) => {
        restored = body.p_payload as SafetyPlan;
        return { succeeded: true, new_payload: body.p_payload };
      },
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plans', {
      collection: 'ftf_safety_plans',
      recordId: deleted.id,
      action: 'restore',
      expectedRevision: deleted.revision,
    }), res);

    expect(res.statusCode).toBe(200);
    expect(restored?.revision).toBe(6);
    expect(restored).not.toHaveProperty('deletedAt');
    expect(restored).not.toHaveProperty('deletedBy');
  });

  it('rejects stale draft restoration with the current revision', async () => {
    const deleted = makeSafetyPlan({
      tenantId: 'tenant-a',
      revision: 5,
      deletedAt: '2026-07-24T04:00:00.000Z',
    });
    let rpcCalls = 0;
    mockApi({
      stored: [{ tenant_id: 'tenant-a', record_id: deleted.id, payload: deleted }],
      onRpc: () => {
        rpcCalls += 1;
        return { succeeded: true };
      },
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plans', {
      collection: 'ftf_safety_plans',
      recordId: deleted.id,
      action: 'restore',
      expectedRevision: 4,
    }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({
      code: 'SAFETY_PLAN_CONFLICT',
      currentRevision: 5,
    });
    expect(rpcCalls).toBe(0);
  });

  it('reports revision conflict when a stale restore targets an already restored draft', async () => {
    const active = makeSafetyPlan({ tenantId: 'tenant-a', revision: 6 });
    mockApi({
      stored: [{ tenant_id: 'tenant-a', record_id: active.id, payload: active }],
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plans', {
      collection: 'ftf_safety_plans',
      recordId: active.id,
      action: 'restore',
      expectedRevision: 5,
    }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({
      code: 'SAFETY_PLAN_CONFLICT',
      currentRevision: 6,
    });
  });

  it('rejects contractor restore attempts', async () => {
    const deleted = makeSafetyPlan({
      tenantId: 'tenant-a',
      revision: 5,
      deletedAt: '2026-07-24T04:00:00.000Z',
    });
    mockApi({
      role: 'contractor',
      safetyPlanAuthority: true,
      stored: [{ tenant_id: 'tenant-a', record_id: deleted.id, payload: deleted }],
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plans', {
      collection: 'ftf_safety_plans',
      recordId: deleted.id,
      action: 'restore',
      expectedRevision: deleted.revision,
    }), res);

    expect(res.statusCode).toBe(403);
  });

  it('rejects not-required plans that retain nested versions', async () => {
    const malformed = makeSafetyPlan({
      tenantId: 'tenant-a',
      status: 'not_required',
      currentVersionId: undefined,
      versions: [makeSafetyPlanVersion()],
      notRequiredReason: 'Covered by client process',
    });
    mockApi();
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plans', {
      collection: 'ftf_safety_plans',
      recordId: malformed.id,
      payload: malformed,
    }), res);

    expect(res.statusCode).toBe(400);
  });

  it('derives not-required provenance and validates its plan revision', async () => {
    const incoming = makeSafetyPlan({
      tenantId: 'tenant-a',
      revision: 1,
      status: 'not_required',
      currentVersionId: undefined,
      versions: [],
      notRequiredReason: 'Covered by client process',
      notRequiredSelectedAt: '2000-01-01T00:00:00.000Z',
      notRequiredActor: {
        userId: 'forged-user',
        name: 'Forged actor',
        role: 'admin',
        operationalAuthority: true,
      },
    });
    let inserted: SafetyPlan | undefined;
    mockApi({
      role: 'contractor',
      onInsertRpc: (body) => {
        inserted = body.p_plan_payload as SafetyPlan;
        return { succeeded: true, new_payload: body.p_plan_payload };
      },
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plans', {
      collection: 'ftf_safety_plans',
      recordId: incoming.id,
      payload: incoming,
      audit: mutationAudit(incoming, 'not_required_selected', 'audit-not-required'),
    }), res);

    expect(res.statusCode).toBe(200);
    expect(inserted?.revision).toBe(1);
    expect(inserted?.notRequiredActor).toMatchObject({
      userId: 'user-a',
      name: 'User A',
      role: 'contractor',
      operationalAuthority: false,
    });
    expect(inserted?.notRequiredSelectedAt).not.toBe('2000-01-01T00:00:00.000Z');
  });

  it('derives audit provenance and ignores forged actor and time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T05:00:00.000Z'));
    const version = makeSafetyPlanVersion({ status: 'approved' });
    const plan = makeSafetyPlan({
      tenantId: 'tenant-a',
      status: 'approved',
      versions: [version],
    });
    const event = {
      ...makeAuditEvent('audit-new'),
      tenantId: 'tenant-b',
      action: 'acknowledged' as const,
      actor: {
        userId: 'forged-user',
        name: 'Forged actor',
        role: 'admin' as const,
        operationalAuthority: true,
      },
      occurredAt: '2000-01-01T00:00:00.000Z',
    };
    let postedRows: any[] = [];
    let postUrl = '';
    let prefer = '';
    mockApi({
      role: 'contractor',
      stored: [{
        tenant_id: 'tenant-a',
        collection: 'ftf_safety_plans',
        record_id: plan.id,
        payload: plan,
      }],
      onPost: (rows, url, options) => {
        postedRows = rows;
        postUrl = url;
        prefer = String((options.headers as Record<string, string>)?.Prefer || '');
      },
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plan_audit', {
      collection: 'ftf_safety_plan_audit',
      recordId: event.id,
      payload: event,
    }), res);

    expect(res.statusCode).toBe(200);
    expect(postedRows[0].payload).toEqual({
      ...event,
      tenantId: 'tenant-a',
      actor: {
        userId: 'user-a',
        name: 'User A',
        role: 'contractor',
        operationalAuthority: false,
      },
      occurredAt: '2026-07-24T05:00:00.000Z',
    });
    expect(postUrl).not.toContain('on_conflict=');
    expect(prefer).not.toContain('resolution=merge-duplicates');
    vi.useRealTimers();
  });

  it.each([
    ['created', 'draft'],
    ['revised', 'draft'],
    ['source_refreshed', 'draft'],
    ['submitted', 'submitted'],
  ] as const)(
    'rejects standalone %s because mutation actions require an atomic plan transition',
    async (action, status) => {
      const version = makeSafetyPlanVersion({ status });
      const plan = makeSafetyPlan({ tenantId: 'tenant-a', status, versions: [version] });
      mockApi({
        safetyPlanAuthority: true,
        stored: [{
          tenant_id: 'tenant-a',
          collection: 'ftf_safety_plans',
          record_id: plan.id,
          payload: plan,
        }],
      });
      const res = createResponse();

      await storeHandler(request('PUT', 'ftf_safety_plan_audit', {
        collection: 'ftf_safety_plan_audit',
        recordId: `audit-standalone-${action}`,
        payload: {
          ...makeAuditEvent(`audit-standalone-${action}`),
          action,
        },
      }), res);

      expect(res.statusCode).toBe(403);
    }
  );

  it('rejects a forged approved audit action from a normal contractor', async () => {
    const version = makeSafetyPlanVersion({ status: 'approved' });
    const plan = makeSafetyPlan({
      tenantId: 'tenant-a',
      status: 'approved',
      versions: [version],
    });
    mockApi({
      role: 'contractor',
      stored: [{
        tenant_id: 'tenant-a',
        collection: 'ftf_safety_plans',
        record_id: plan.id,
        payload: plan,
      }],
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plan_audit', {
      collection: 'ftf_safety_plan_audit',
      recordId: 'audit-approved',
      payload: { ...makeAuditEvent('audit-approved'), action: 'approved' },
    }), res);

    expect(res.statusCode).toBe(403);
  });

  it('rejects standalone approved because approval requires an atomic transition', async () => {
    const plan = makeSafetyPlan({ tenantId: 'tenant-a' });
    mockApi({
      safetyPlanAuthority: true,
      stored: [{
        tenant_id: 'tenant-a',
        collection: 'ftf_safety_plans',
        record_id: plan.id,
        payload: plan,
      }],
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plan_audit', {
      collection: 'ftf_safety_plan_audit',
      recordId: 'audit-approved',
      payload: { ...makeAuditEvent('audit-approved'), action: 'approved' },
    }), res);

    expect(res.statusCode).toBe(403);
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

  it('freezes an existing published company Safety Plan master', async () => {
    const master = {
      id: 'master-tenant-a-2',
      tenantId: 'tenant-a',
      masterVersion: 2,
      version: '2.0',
      isPlatformStandard: false,
      sections: [],
    };
    mockApi({
      stored: [{
        tenant_id: 'tenant-a',
        collection: 'ftf_safety_plan_templates',
        record_id: master.id,
        payload: master,
      }],
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plan_templates', {
      collection: 'ftf_safety_plan_templates',
      recordId: master.id,
      payload: { ...master, version: 'rewritten' },
    }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/controlled publication/i);
  });

  it('rejects a company master carrying a forged tenant identity', async () => {
    mockApi();
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plan_templates', {
      collection: 'ftf_safety_plan_templates',
      recordId: 'master-tenant-b-1',
      payload: {
        id: 'master-tenant-b-1',
        tenantId: 'tenant-b',
        masterVersion: 1,
        version: '1.0',
        isPlatformStandard: false,
        sections: AU_REOC_SAFETY_PLAN_STANDARD.sections,
      },
    }), res);

    expect(res.statusCode).toBe(400);
  });

  it('shows a normal contractor only Safety Plans they created or are assigned to', async () => {
    const own = makeSafetyPlan({
      id: 'own-plan',
      tenantId: 'tenant-a',
      versions: [makeSafetyPlanVersion({
        id: 'own-version',
        planId: 'own-plan',
        createdBy: {
          userId: 'user-a',
          name: 'User A',
          role: 'contractor',
          operationalAuthority: false,
        },
      })],
      currentVersionId: 'own-version',
    });
    const assigned = makeSafetyPlan({
      id: 'assigned-plan',
      tenantId: 'tenant-a',
      versions: [makeSafetyPlanVersion({
        id: 'assigned-version',
        planId: 'assigned-plan',
        createdBy: {
          userId: 'user-b',
          name: 'User B',
          role: 'contractor',
          operationalAuthority: false,
        },
        sourceSnapshot: {
          capturedAt: '2026-07-24T00:00:00.000Z',
          job: { id: 'job-assigned', name: 'Assigned job' },
          missions: [],
          crew: [{ id: 'user-a', name: 'User A', role: 'PIC' }],
          sourceLinks: [],
        },
      })],
      currentVersionId: 'assigned-version',
    });
    const other = makeSafetyPlan({
      id: 'other-plan',
      tenantId: 'tenant-a',
      versions: [makeSafetyPlanVersion({
        id: 'other-version',
        planId: 'other-plan',
        createdBy: {
          userId: 'user-b',
          name: 'User B',
          role: 'contractor',
          operationalAuthority: false,
        },
      })],
      currentVersionId: 'other-version',
    });
    mockApi({
      role: 'contractor',
      stored: [own, assigned, other].map((payload) => ({
        tenant_id: 'tenant-a',
        collection: 'ftf_safety_plans',
        record_id: payload.id,
        payload,
      })),
    });
    const listResponse = createResponse();
    const singletonResponse = createResponse();

    await storeHandler(request('GET', 'ftf_safety_plans'), listResponse);
    await storeHandler(request('GET', 'ftf_safety_plans', undefined, other.id), singletonResponse);

    expect(listResponse.body.records.map((plan: SafetyPlan) => plan.id).sort())
      .toEqual(['assigned-plan', 'own-plan']);
    expect(singletonResponse.body).toEqual({ payload: null });
  });

  it('allows a nominated operational authority to review all tenant Safety Plans', async () => {
    const other = makeSafetyPlan({
      id: 'other-plan',
      tenantId: 'tenant-a',
      versions: [makeSafetyPlanVersion({
        createdBy: {
          userId: 'user-b',
          name: 'User B',
          role: 'contractor',
          operationalAuthority: false,
        },
      })],
    });
    mockApi({
      role: 'contractor',
      safetyPlanAuthority: true,
      stored: [{
        tenant_id: 'tenant-a',
        collection: 'ftf_safety_plans',
        record_id: other.id,
        payload: other,
      }],
    });
    const res = createResponse();

    await storeHandler(request('GET', 'ftf_safety_plans'), res);

    expect(res.body.records).toHaveLength(1);
    expect(res.body.records[0].id).toBe(other.id);
  });

  it('removes contractor access when the current revision no longer assigns them', async () => {
    const oldVersion = makeSafetyPlanVersion({
      id: 'version-1',
      planId: 'revised-plan',
      version: '1.0',
      status: 'superseded',
      sourceSnapshot: {
        capturedAt: '2026-07-24T00:00:00.000Z',
        job: { id: 'job-1', name: 'Revised job' },
        missions: [],
        crew: [{ id: 'user-a', name: 'Removed Pilot', role: 'PIC' }],
        sourceLinks: [],
      },
    });
    const currentVersion = makeSafetyPlanVersion({
      id: 'version-2',
      planId: 'revised-plan',
      version: '1.1',
      sourceSnapshot: {
        capturedAt: '2026-07-25T00:00:00.000Z',
        job: { id: 'job-1', name: 'Revised job' },
        missions: [],
        crew: [{ id: 'user-b', name: 'Current Pilot', role: 'PIC' }],
        sourceLinks: [],
      },
      createdBy: {
        userId: 'user-b',
        name: 'User B',
        role: 'contractor',
        operationalAuthority: false,
      },
    });
    const revised = makeSafetyPlan({
      id: 'revised-plan',
      tenantId: 'tenant-a',
      currentVersionId: currentVersion.id,
      versions: [oldVersion, currentVersion],
    });
    mockApi({
      role: 'contractor',
      stored: [{
        tenant_id: 'tenant-a',
        collection: 'ftf_safety_plans',
        record_id: revised.id,
        payload: revised,
      }],
    });
    const listResponse = createResponse();
    const singletonResponse = createResponse();

    await storeHandler(request('GET', 'ftf_safety_plans'), listResponse);
    await storeHandler(request('GET', 'ftf_safety_plans', undefined, revised.id), singletonResponse);

    expect(listResponse.body.records).toEqual([]);
    expect(singletonResponse.body).toEqual({ payload: null });
  });

  it('publishes company masters with server-controlled identity and provenance', async () => {
    let rpcBody: Record<string, unknown> | undefined;
    mockApi({
      onMasterRpc: (body) => {
        rpcBody = body;
        return {
          id: 'safety-plan-master-tenant-a-1',
          tenantId: 'tenant-a',
          masterVersion: 1,
          version: '1.0',
          standardVersion: 'AU-REOC-0.9',
          publishedAt: '2026-07-24T01:00:00.000Z',
          publishedBy: { userId: 'user-a', name: 'User A' },
          isPlatformStandard: false,
          sections: [],
        };
      },
    });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plan_templates', {
      collection: 'ftf_safety_plan_templates',
      action: 'publish_company_master',
      payload: {
        id: 'forged-id',
        tenantId: 'tenant-b',
        masterVersion: 99,
        version: '99.0',
        standardVersion: 'AU-REOC-0.9',
        publishedAt: '2000-01-01T00:00:00.000Z',
        publishedBy: { userId: 'attacker', name: 'Attacker' },
        name: 'Company Safety Plan',
        jurisdiction: 'AU',
        notice: 'CASA/ReOC aligned.',
        isPlatformStandard: false,
        sections: AU_REOC_SAFETY_PLAN_STANDARD.sections,
      },
    }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.payload).toMatchObject({
      id: 'safety-plan-master-tenant-a-1',
      tenantId: 'tenant-a',
      masterVersion: 1,
      version: '1.0',
      publishedBy: { userId: 'user-a' },
    });
    expect(rpcBody).toBeDefined();
    const content = rpcBody?.p_template_content as Record<string, unknown>;
    expect(content).not.toHaveProperty('id');
    expect(content).not.toHaveProperty('tenantId');
    expect(content).not.toHaveProperty('masterVersion');
    expect(content).not.toHaveProperty('publishedAt');
    expect(content).not.toHaveProperty('publishedBy');
  });

  it('rejects malformed company-master content before publication', async () => {
    let called = false;
    mockApi({ onMasterRpc: () => { called = true; return null; } });
    const res = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plan_templates', {
      collection: 'ftf_safety_plan_templates',
      action: 'publish_company_master',
      payload: {
        name: 'Broken',
        standardVersion: 'AU-REOC-1.0',
        sections: [{ id: 'duplicate', fields: [] }, { id: 'duplicate', fields: [] }],
      },
    }), res);

    expect(res.statusCode).toBe(400);
    expect(called).toBe(false);
  });

  it('initialises and updates an editable company draft through controlled operations', async () => {
    const operations: string[] = [];
    mockApi({
      onTemplateDraftRpc: (operation, body) => {
        operations.push(operation);
        return {
          ...(body.p_template_content as object),
          id: 'safety-plan-template-draft',
          tenantId: 'tenant-a',
          recordType: 'draft',
          masterVersion: 0,
          version: 'draft',
          draftRevision: operation === 'init' ? 1 : 2,
        };
      },
    });
    const standardDraft = {
      ...AU_REOC_SAFETY_PLAN_STANDARD,
      isPlatformStandard: false,
      standardVersion: AU_REOC_SAFETY_PLAN_STANDARD.version,
      sectionStandardVersions: Object.fromEntries(
        AU_REOC_SAFETY_PLAN_STANDARD.sections.map((section) => [
          section.id,
          AU_REOC_SAFETY_PLAN_STANDARD.version,
        ])
      ),
    };
    const initialised = createResponse();
    const updated = createResponse();

    await storeHandler(request('PUT', 'ftf_safety_plan_templates', {
      collection: 'ftf_safety_plan_templates',
      action: 'init_company_template_draft',
      payload: standardDraft,
    }), initialised);
    await storeHandler(request('PUT', 'ftf_safety_plan_templates', {
      collection: 'ftf_safety_plan_templates',
      action: 'update_company_template_draft',
      expectedRevision: 1,
      payload: {
        ...standardDraft,
        sections: standardDraft.sections.map((section, index) => index === 0
          ? { ...section, title: 'Company controlled title' }
          : section),
      },
    }), updated);

    expect(initialised.statusCode).toBe(200);
    expect(updated.statusCode).toBe(200);
    expect(operations).toEqual(['init', 'update']);
    expect(updated.body.payload).toMatchObject({
      id: 'safety-plan-template-draft',
      tenantId: 'tenant-a',
      recordType: 'draft',
      draftRevision: 2,
    });
  });
});

export {};
