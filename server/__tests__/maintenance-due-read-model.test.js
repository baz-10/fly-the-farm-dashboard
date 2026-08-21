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

  test('builds Fleet candidates only from trusted tenant, assigned Base and active sources, then reuses one asOf', async () => {
    supabaseRequest.mockImplementation(async (path) => {
      if (path.startsWith('rest/v1/aircraft?')) return [{ id: 'aircraft-1', registration: 'T100-002', operating_location_id: BASE }];
      if (path.startsWith('rest/v1/equipment_kits?')) return [];
      if (path.startsWith('rest/v1/fleet_assets?')) return [];
      if (path.startsWith('rest/v1/maintainable_asset_registry?')) return [{ id: ASSET, aircraft_id: 'aircraft-1', equipment_kit_id: null, fleet_asset_id: null }];
      if (path === 'rest/v1/rpc/ftf_read_asset_maintenance_due_state') return dueResult();
      throw new Error(`unexpected path ${path}`);
    });

    const rows = await new FleetMaintenanceRepository().readFleetDueSummary(context(), AS_OF, { baseId: BASE, assetType: 'aircraft' });

    expect(rows).toEqual([expect.objectContaining({ registryId: ASSET, source: 'aircraft', identity: 'T100-002', dueState: expect.objectContaining({ asOf: AS_OF }) })]);
    const sourcePaths = supabaseRequest.mock.calls.map(([path]) => path).filter((path) => /^rest\/v1\/(aircraft|equipment_kits|fleet_assets)\?/.test(path));
    sourcePaths.forEach((path) => {
      expect(path).toContain(`organisation_id=eq.${ORG}`);
      expect(path).toContain('archived_at=is.null');
    });
    expect(sourcePaths.find((path) => path.startsWith('rest/v1/aircraft?'))).toContain(`operating_location_id=eq.${BASE}`);
    expect(supabaseRequest).toHaveBeenLastCalledWith('rest/v1/rpc/ftf_read_asset_maintenance_due_state', expect.objectContaining({
      body: expect.stringContaining(`"p_as_of":"${AS_OF}"`),
    }));
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

  test('returns compact Fleet counts and rows without mixing attached-child state into the parent', async () => {
    const childDueState = dueResult('child', 'OVERDUE');
    delete childDueState.attachedAssetSummaries;
    repository.readFleetDueSummary.mockResolvedValue([
      { registryId: ASSET, source: 'fleet-asset', sourceRecordId: 'fleet-1', identity: 'FTF-11', operatingLocationId: BASE, dueState: dueResult(ASSET, 'DUE_SOON', [{ registryId: 'child', dueState: childDueState }]) },
      { registryId: '55555555-5555-4555-8555-555555555555', source: 'aircraft', sourceRecordId: 'aircraft-1', identity: 'T100-002', operatingLocationId: BASE, dueState: dueResult('55555555-5555-4555-8555-555555555555', 'OVERDUE') },
    ]);
    const res = response();

    await handler()(request('fleet-due-summary', { asOf: AS_OF, baseId: BASE, assetType: 'fleet-asset', state: 'DUE_SOON' }), res);

    expect(repository.readFleetDueSummary).toHaveBeenCalledWith(expect.any(Object), AS_OF, { baseId: BASE, assetType: 'fleet-asset' });
    expect(res.body.data.counts).toMatchObject({ DUE_SOON: 1, OVERDUE: 1 });
    expect(res.body.data.rows).toHaveLength(1);
    expect(res.body.data.rows[0]).toMatchObject({ registryId: ASSET, highestState: 'DUE_SOON', attachedAssetCount: 1 });
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
