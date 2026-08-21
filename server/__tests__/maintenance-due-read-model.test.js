jest.mock('../supabase', () => ({
  ...jest.requireActual('../supabase'),
  supabaseRequest: jest.fn(),
}));

const { supabaseRequest } = require('../supabase');
const { FleetMaintenanceRepository } = require('../fleet-maintenance-repository');
const { createFleetMaintenanceHandler } = require('../fleet-maintenance-api');
const { createDefaultHandlers } = require('../operational-dispatcher');

const ORG = '11111111-1111-4111-8111-111111111111';
const ACTOR = '22222222-2222-4222-8222-222222222222';
const ASSET = '33333333-3333-4333-8333-333333333333';
const BASE = '44444444-4444-4444-8444-444444444444';
const AS_OF = '2026-08-21T01:30:00.000Z';

function stableUuid(prefix, index) {
  return `${prefix.repeat(8).slice(0, 8)}-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function cursorPayload(overrides = {}) {
  return Buffer.from(JSON.stringify({
    v: 1,
    lastRegistryId: ASSET,
    asOf: AS_OF,
    baseId: BASE,
    assetType: 'fleet-asset',
    state: 'DUE_SOON',
    pageSize: 5,
    ...overrides,
  })).toString('base64url');
}

function context(permissions = ['maintenance_requirements.read']) {
  return {
    organisation: { id: ORG, name: 'Farm A' },
    internalUser: { id: ACTOR, name: 'Maintainer' },
    operatingLocationIds: [BASE],
    permissions,
  };
}

function dueResult(assetId = ASSET, state = 'DUE_SOON', attachedAssetSummaries = []) {
  return {
    assetId,
    asOf: AS_OF,
    timezone: 'Australia/Brisbane',
    requirements: [{
      requirementId: 'requirement-1', requirementVersionId: 'version-1', requirementCode: 'FTF-10K',
      requirementName: '10K service', requirementKind: 'SERVICE', authorityType: 'ORGANISATION_STANDARD',
      authorityScope: 'ORGANISATION', lifecycleState: 'EFFECTIVE', effectiveFrom: '2026-01-01T00:00:00.000Z',
      effectiveTo: null, thresholdPolicy: 'ANY', state, controllingThresholdId: 'threshold-1', thresholds: [],
      evidence: { source: 'programme' }, serviceKitVersionId: null,
    }],
    attachedAssetSummaries,
  };
}

function response() {
  const res = { headers: {}, statusCode: 200, body: undefined };
  res.setHeader = jest.fn((name, value) => { res.headers[String(name).toLowerCase()] = value; });
  res.status = jest.fn((statusCode) => { res.statusCode = statusCode; return res; });
  res.json = jest.fn((body) => { res.body = body; return res; });
  return res;
}

function request(action, query = {}) {
  return {
    method: 'GET',
    query: { action, ...query },
    correlationId: 'maintenance-due-request-123',
    headers: { host: 'app.example.test', 'x-forwarded-proto': 'https' },
  };
}

describe('maintenance due-state repository authority contract', () => {
  beforeEach(() => supabaseRequest.mockReset());

  test('calls only the checked SQL RPC with trusted organisation, actor, registry and exact asOf', async () => {
    supabaseRequest.mockResolvedValue(dueResult());
    const result = await new FleetMaintenanceRepository().readDueState(context(), ASSET, AS_OF);

    expect(result.currentMarker).toBeUndefined();
    expect(supabaseRequest).toHaveBeenCalledWith('rest/v1/rpc/ftf_read_asset_maintenance_due_state', {
      method: 'POST',
      body: JSON.stringify({
        p_organisation_id: ORG,
        p_actor_internal_user_id: ACTOR,
        p_maintainable_asset_id: ASSET,
        p_as_of: AS_OF,
      }),
      publicMessage: 'Maintenance due state could not be loaded.',
    });
    expect(supabaseRequest.mock.calls.map(([path]) => path)).not.toEqual(expect.arrayContaining([
      expect.stringContaining('ftf_project_asset_maintenance_due_state'),
      expect.stringContaining('audit_events'),
      expect.stringContaining('transactional_outbox'),
    ]));
  });

  test('builds a bounded deterministic Fleet page from trusted tenant, assigned Base and active sources, then reuses one asOf', async () => {
    supabaseRequest.mockImplementation(async (path) => {
      if (path.startsWith('rest/v1/maintainable_asset_registry?')) return [{ id: ASSET, aircraft_id: 'aircraft-1', equipment_kit_id: null, fleet_asset_id: null }];
      if (path.startsWith('rest/v1/aircraft?')) return [{ id: 'aircraft-1', registration: 'T100-002', operating_location_id: BASE }];
      if (path === 'rest/v1/rpc/ftf_read_asset_maintenance_due_state') return dueResult();
      throw new Error(`unexpected path ${path}`);
    });

    const result = await new FleetMaintenanceRepository().readFleetDueSummary(context(), AS_OF, {
      baseId: BASE, assetType: 'aircraft', state: null, afterRegistryId: null, pageSize: 5,
    });

    expect(result).toEqual({
      candidates: [expect.objectContaining({ registryId: ASSET, source: 'aircraft', identity: 'T100-002', dueState: expect.objectContaining({ asOf: AS_OF }) })],
      rowRegistryIds: [ASSET],
      hasMore: false,
      lastScannedRegistryId: ASSET,
      scannedCount: 1,
    });
    const registryPath = supabaseRequest.mock.calls.map(([path]) => path).find((path) => path.startsWith('rest/v1/maintainable_asset_registry?'));
    expect(registryPath).toContain(`organisation_id=eq.${ORG}`);
    expect(registryPath).toContain('tracking_state=eq.ACTIVE');
    expect(registryPath).toContain('order=id.asc');
    expect(registryPath).not.toContain('offset=');
    expect(registryPath).not.toContain('id=gt.');
    expect(registryPath).toContain('limit=6');
    const sourcePaths = supabaseRequest.mock.calls.map(([path]) => path).filter((path) => /^rest\/v1\/(aircraft|equipment_kits|fleet_assets)\?/.test(path));
    sourcePaths.forEach((path) => {
      expect(path).toContain(`organisation_id=eq.${ORG}`);
      expect(path).toContain('archived_at=is.null');
    });
    expect(sourcePaths.find((path) => path.startsWith('rest/v1/aircraft?'))).toContain('id=eq.aircraft-1');
    expect(supabaseRequest).toHaveBeenLastCalledWith('rest/v1/rpc/ftf_read_asset_maintenance_due_state', expect.objectContaining({
      body: expect.stringContaining(`"p_as_of":"${AS_OF}"`),
    }));
  });

  test('bounds per-record source URLs and source/RPC concurrency independently of many assigned Bases', async () => {
    const registryRows = Array.from({ length: 6 }, (_, index) => ({
      id: stableUuid('a', index + 1),
      aircraft_id: stableUuid('b', index + 1),
      equipment_kit_id: null,
      fleet_asset_id: null,
    }));
    const manyBases = Array.from({ length: 120 }, (_, index) => stableUuid('c', index + 1));
    manyBases[73] = BASE;
    let active = 0;
    let maximumActive = 0;
    supabaseRequest.mockImplementation(async (path, options = {}) => {
      if (path.startsWith('rest/v1/maintainable_asset_registry?')) return registryRows;
      if (path.startsWith('rest/v1/aircraft?')) {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        const id = decodeURIComponent(path.match(/[?&]id=eq\.([^&]+)/)[1]);
        return [{ id, registration: `T100-${id.slice(-2)}`, operating_location_id: BASE }];
      }
      if (path === 'rest/v1/rpc/ftf_read_asset_maintenance_due_state') {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        const assetId = JSON.parse(options.body).p_maintainable_asset_id;
        return dueResult(assetId);
      }
      throw new Error(`unexpected path ${path}`);
    });

    const wideContext = { ...context(), operatingLocationIds: manyBases };
    const result = await new FleetMaintenanceRepository().readFleetDueSummary(wideContext, AS_OF, {
      baseId: null, assetType: 'aircraft', state: null, afterRegistryId: null, pageSize: 5,
    });

    expect(result).toMatchObject({ hasMore: true, scannedCount: 5 });
    expect(result.candidates).toHaveLength(5);
    expect(maximumActive).toBeLessThanOrEqual(4);
    expect(supabaseRequest.mock.calls.filter(([path]) => path === 'rest/v1/rpc/ftf_read_asset_maintenance_due_state')).toHaveLength(5);
    const sourcePaths = supabaseRequest.mock.calls.map(([path]) => path).filter((path) => path.startsWith('rest/v1/aircraft?'));
    expect(sourcePaths).toHaveLength(5);
    sourcePaths.forEach((path) => {
      expect(path).toMatch(/id=eq.[0-9a-f-]{36}/);
      expect(path).toContain('limit=2');
      expect(path).not.toContain('operating_location_id=in.');
      expect(path.length).toBeLessThan(512);
    });
  });

  test('keyset continuation does not skip or repeat existing rows when a lower registry ID is inserted between pages', async () => {
    const [inserted, second, third, fourth, fifth] = [1, 2, 3, 4, 5].map((index) => stableUuid('d', index));
    const registry = (id) => ({ id, aircraft_id: id.replace(/^d/, 'e'), equipment_kit_id: null, fleet_asset_id: null });
    const visibleRegistryIds = [second, third, fourth, fifth];
    supabaseRequest.mockImplementation(async (path, options = {}) => {
      if (path.startsWith('rest/v1/maintainable_asset_registry?')) {
        const after = path.match(/[?&]id=gt\.([^&]+)/)?.[1];
        const limit = Number(path.match(/[?&]limit=(\d+)/)?.[1]);
        return visibleRegistryIds.slice().sort()
          .filter((id) => !after || id > decodeURIComponent(after))
          .slice(0, limit)
          .map(registry);
      }
      if (path.startsWith('rest/v1/aircraft?')) {
        const id = decodeURIComponent(path.match(/[?&]id=eq\.([^&]+)/)[1]);
        return [{ id, registration: id, operating_location_id: BASE }];
      }
      if (path === 'rest/v1/rpc/ftf_read_asset_maintenance_due_state') {
        return dueResult(JSON.parse(options.body).p_maintainable_asset_id);
      }
      throw new Error(`unexpected path ${path}`);
    });
    const repository = new FleetMaintenanceRepository();
    const first = await repository.readFleetDueSummary(context(), AS_OF, {
      baseId: BASE, assetType: 'aircraft', state: null, afterRegistryId: null, pageSize: 2,
    });
    visibleRegistryIds.push(inserted);
    const secondPage = await repository.readFleetDueSummary(context(), AS_OF, {
      baseId: BASE, assetType: 'aircraft', state: null, afterRegistryId: first.lastScannedRegistryId, pageSize: 2,
    });

    expect(first.rowRegistryIds).toEqual([second, third]);
    expect(secondPage.rowRegistryIds).toEqual([fourth, fifth]);
    expect(new Set([...first.rowRegistryIds, ...secondPage.rowRegistryIds]).size).toBe(4);
  });

  test('continues bounded registry scans until a state-filtered page fills or the registry is exhausted', async () => {
    const ids = [1, 2, 3, 4, 5].map((index) => stableUuid('f', index));
    const registry = (id) => ({ id, aircraft_id: id.replace(/^f/, '9'), equipment_kit_id: null, fleet_asset_id: null });
    const registryPages = [[registry(ids[0]), registry(ids[1]), registry(ids[2])], [registry(ids[2]), registry(ids[3]), registry(ids[4])], [registry(ids[4])]];
    let registryRead = 0;
    supabaseRequest.mockImplementation(async (path, options = {}) => {
      if (path.startsWith('rest/v1/maintainable_asset_registry?')) return registryPages[registryRead++];
      if (path.startsWith('rest/v1/aircraft?')) {
        const id = decodeURIComponent(path.match(/[?&]id=eq\.([^&]+)/)[1]);
        return [{ id, registration: id, operating_location_id: BASE }];
      }
      if (path === 'rest/v1/rpc/ftf_read_asset_maintenance_due_state') {
        const id = JSON.parse(options.body).p_maintainable_asset_id;
        return dueResult(id, [ids[2], ids[4]].includes(id) ? 'DUE' : 'CURRENT');
      }
      throw new Error(`unexpected path ${path}`);
    });

    const result = await new FleetMaintenanceRepository().readFleetDueSummary(context(), AS_OF, {
      baseId: BASE, assetType: 'aircraft', state: 'DUE', afterRegistryId: null, pageSize: 2,
    });

    expect(result.rowRegistryIds).toEqual([ids[2], ids[4]]);
    expect(result).toMatchObject({ scannedCount: 5, hasMore: false, lastScannedRegistryId: ids[4] });
    expect(result.candidates).toHaveLength(5);
  });

  test('stops a sparse filtered read at the 100-row scan cap and preserves continuation', async () => {
    const ids = Array.from({ length: 104 }, (_, index) => stableUuid('7', index + 1));
    let registryRead = 0;
    supabaseRequest.mockImplementation(async (path, options = {}) => {
      if (path.startsWith('rest/v1/maintainable_asset_registry?')) {
        const start = registryRead * 25;
        registryRead += 1;
        return ids.slice(start, start + 26).map((id) => ({ id, aircraft_id: id.replace(/^7/, '8'), equipment_kit_id: null, fleet_asset_id: null }));
      }
      if (path.startsWith('rest/v1/aircraft?')) {
        const id = decodeURIComponent(path.match(/[?&]id=eq\.([^&]+)/)[1]);
        return [{ id, registration: id, operating_location_id: BASE }];
      }
      if (path === 'rest/v1/rpc/ftf_read_asset_maintenance_due_state') {
        return dueResult(JSON.parse(options.body).p_maintainable_asset_id, 'CURRENT');
      }
      throw new Error(`unexpected path ${path}`);
    });

    const result = await new FleetMaintenanceRepository().readFleetDueSummary(context(), AS_OF, {
      baseId: BASE, assetType: 'aircraft', state: 'OVERDUE', afterRegistryId: null, pageSize: 25,
    });

    expect(result).toMatchObject({ rowRegistryIds: [], scannedCount: 100, hasMore: true, lastScannedRegistryId: ids[99] });
    expect(registryRead).toBe(4);
  });
});

describe('maintenance due-state trusted API', () => {
  let repository;
  let resolveContext;
  beforeEach(() => {
    repository = { readDueState: jest.fn(), readFleetDueSummary: jest.fn(), readWorkspace: jest.fn(), command: jest.fn() };
    resolveContext = jest.fn().mockResolvedValue(context());
  });
  const handler = () => createFleetMaintenanceHandler({ repository, resolveContext });

  test('registers asset-maintenance in the versioned dispatcher', () => {
    expect(createDefaultHandlers()['asset-maintenance']).toEqual(expect.any(Function));
  });

  test('reads due state with its independent permission and preserves corrected-meter and attached evidence', async () => {
    const attached = [{ registryId: 'child-registry', dueState: { ...dueResult('child-registry', 'OVERDUE'), attachedAssetSummaries: undefined } }];
    const result = dueResult(ASSET, 'DUE_SOON', attached);
    result.requirements[0].thresholds = [{ currentValue: 8600, currentAuthoritySource: 'AUTHORITATIVE_METER' }];
    repository.readDueState.mockResolvedValue(result);
    const res = response();

    await handler()(request('due-state', { assetId: ASSET, asOf: AS_OF }), res);

    expect(res.statusCode).toBe(200);
    expect(repository.readDueState).toHaveBeenCalledWith(expect.objectContaining({ permissions: ['maintenance_requirements.read'] }), ASSET, AS_OF);
    expect(res.body.data.requirements[0].thresholds[0]).toEqual({ currentValue: 8600, currentAuthoritySource: 'AUTHORITATIVE_METER' });
    expect(res.body.data.attachedAssetSummaries).toEqual(attached);
  });

  test.each(['', '2026-08-21', '2026-08-21T01:30:00', 'not-a-date'])('rejects a missing or offset-free asOf before repository access: %s', async (asOf) => {
    const res = response();
    await handler()(request('due-state', { assetId: ASSET, asOf }), res);
    expect(res.statusCode).toBe(400);
    expect(repository.readDueState).not.toHaveBeenCalled();
  });

  test('maps checked-RPC tenant, Base and archived denial to not found', async () => {
    repository.readDueState.mockResolvedValue({ not_found: true });
    const res = response();
    await handler()(request('due-state', { assetId: ASSET, asOf: AS_OF, organisationId: 'browser-tenant', baseId: BASE }), res);
    expect(res.statusCode).toBe(404);
    expect(repository.readDueState).toHaveBeenCalledWith(expect.objectContaining({ organisation: { id: ORG, name: 'Farm A' } }), ASSET, AS_OF);
  });

  test('fails closed when the checked projection drifts from requested asset or asOf', async () => {
    repository.readDueState.mockResolvedValue({ ...dueResult('other-asset'), asOf: '2026-08-22T01:30:00.000Z' });
    const res = response();
    await handler()(request('due-state', { assetId: ASSET, asOf: AS_OF }), res);
    expect(res.statusCode).toBe(502);
    expect(res.body.error.code).toBe('MAINTENANCE_DUE_RESPONSE_INVALID');
  });

  test('returns compact Fleet pageCounts and an opaque continuation bound to exact filters', async () => {
    const childDueState = dueResult('child', 'OVERDUE');
    delete childDueState.attachedAssetSummaries;
    const secondRegistryId = '55555555-5555-4555-8555-555555555555';
    repository.readFleetDueSummary.mockResolvedValue({
      candidates: [
        { registryId: ASSET, source: 'fleet-asset', sourceRecordId: 'fleet-1', identity: 'FTF-11', operatingLocationId: BASE, dueState: dueResult(ASSET, 'DUE_SOON', [{ registryId: 'child', dueState: childDueState }]) },
        { registryId: secondRegistryId, source: 'aircraft', sourceRecordId: 'aircraft-1', identity: 'T100-002', operatingLocationId: BASE, dueState: dueResult(secondRegistryId, 'OVERDUE') },
      ],
      rowRegistryIds: [ASSET],
      hasMore: true,
      lastScannedRegistryId: secondRegistryId,
      scannedCount: 2,
    });
    const res = response();

    const query = { asOf: AS_OF, baseId: BASE, assetType: 'fleet-asset', state: 'DUE_SOON', pageSize: '5' };
    await handler()(request('fleet-due-summary', query), res);

    expect(repository.readFleetDueSummary).toHaveBeenCalledWith(expect.any(Object), AS_OF, { baseId: BASE, assetType: 'fleet-asset', state: 'DUE_SOON', afterRegistryId: null, pageSize: 5 });
    expect(res.body.data.pageCounts).toMatchObject({ DUE_SOON: 1, OVERDUE: 1 });
    expect(res.body.data).not.toHaveProperty('counts');
    expect(res.body.data.rows).toHaveLength(1);
    expect(res.body.data.rows[0]).toMatchObject({ registryId: ASSET, highestState: 'DUE_SOON', attachedAssetCount: 1 });
    expect(res.body.data.rows[0]).not.toHaveProperty('dueState');
    expect(res.body.data.rows[0]).not.toHaveProperty('requirements');
    expect(res.body.data.page).toEqual({ pageSize: 5, hasMore: true, nextCursor: expect.stringMatching(/^[A-Za-z0-9_-]+$/), scannedCount: 2, returnedCount: 1 });

    const continuation = response();
    await handler()(request('fleet-due-summary', { ...query, cursor: res.body.data.page.nextCursor }), continuation);
    expect(continuation.statusCode).toBe(200);
    expect(repository.readFleetDueSummary).toHaveBeenLastCalledWith(expect.any(Object), AS_OF, {
      baseId: BASE, assetType: 'fleet-asset', state: 'DUE_SOON', afterRegistryId: secondRegistryId, pageSize: 5,
    });
  });

  test.each([
    { page: '2', pageSize: '5' },
    { cursor: 'not-base64!', pageSize: '5' },
    { cursor: cursorPayload({ asOf: '2026-08-21T01:30:00.001Z' }), pageSize: '5' },
    { cursor: cursorPayload({ baseId: null }), pageSize: '5' },
    { cursor: cursorPayload({ assetType: 'aircraft' }), pageSize: '5' },
    { cursor: cursorPayload({ state: 'OVERDUE' }), pageSize: '5' },
    { cursor: cursorPayload({ pageSize: 6 }), pageSize: '5' },
    { pageSize: '0' },
    { pageSize: '26' },
  ])('rejects malformed or request-mismatched Fleet continuation before repository access: %j', async (pagination) => {
    const res = response();
    await handler()(request('fleet-due-summary', { asOf: AS_OF, baseId: BASE, assetType: 'fleet-asset', state: 'DUE_SOON', ...pagination }), res);
    expect(res.statusCode).toBe(400);
    expect(repository.readFleetDueSummary).not.toHaveBeenCalled();
  });

  test('returns a null cursor only when the bounded scan is exhausted', async () => {
    repository.readFleetDueSummary.mockResolvedValue({
      candidates: [], rowRegistryIds: [], hasMore: false, lastScannedRegistryId: null, scannedCount: 0,
    });
    const res = response();
    await handler()(request('fleet-due-summary', { asOf: AS_OF, pageSize: '5' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.page).toEqual({ pageSize: 5, hasMore: false, nextCursor: null, scannedCount: 0, returnedCount: 0 });
    expect(res.body.data.pageCounts).toEqual({ CURRENT: 0, DUE_SOON: 0, DUE: 0, OVERDUE: 0, INSUFFICIENT_DATA: 0 });
  });

  test('denies Fleet summary for an unassigned Base and requires maintenance read permission', async () => {
    resolveContext.mockResolvedValue(context(['asset_meters.read']));
    let res = response();
    await handler()(request('fleet-due-summary', { asOf: AS_OF }), res);
    expect(res.statusCode).toBe(403);
    resolveContext.mockResolvedValue(context());
    res = response();
    await handler()(request('fleet-due-summary', { asOf: AS_OF, baseId: '66666666-6666-4666-8666-666666666666' }), res);
    expect(res.statusCode).toBe(403);
    expect(repository.readFleetDueSummary).not.toHaveBeenCalled();
  });

  test('uses bounded public diagnostics for malicious read failures', async () => {
    repository.readDueState.mockRejectedValue(Object.assign(new Error('Authorization: Bearer secret-value'), { status: 409, code: 'VERSION_CONFLICT' }));
    const req = request('due-state', { assetId: ASSET, asOf: AS_OF });
    req.correlationId = 'ghp_AbCdEf1234567890';
    const res = response();
    await handler()(req, res);
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toEqual({ code: 'MAINTENANCE_API_ERROR', message: 'Maintenance request failed.' });
  });
});
