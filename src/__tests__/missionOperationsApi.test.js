const { createMissionOperationsHandler } = require('../../server/mission-operations-api');
const { MissionOperationsRepository } = require('../../server/mission-operations-repository');
const { createDefaultHandlers } = require('../../server/operational-dispatcher');

const ORG = '11111111-1111-4111-8111-111111111111';
const ACTOR = '22222222-2222-4222-8222-222222222222';
const BASE = '33333333-3333-4333-8333-333333333333';
const MISSION = '44444444-4444-4444-8444-444444444444';
const PACKAGE = '55555555-5555-4555-8555-555555555555';
const JSA = '66666666-6666-4666-8666-666666666666';
const FIELD_A = '77777777-7777-4777-8777-777777777777';
const FIELD_B = '88888888-8888-4888-8888-888888888888';
const DECISION = '99999999-9999-4999-8999-999999999999';
const DIGEST = 'b'.repeat(64);

const context = (permissions) => ({
  organisation: { id: ORG }, internalUser: { id: ACTOR },
  operatingLocationIds: [BASE], permissions,
});
const response = () => ({
  statusCode: 200, body: null, headers: {},
  setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
  status(value) { this.statusCode = value; return this; },
  json(value) { this.body = value; return this; },
});
const request = (method, action, body = {}, query = {}) => ({
  method, body, query: { action, ...query }, correlationId: 'mission-ops-request-123',
  headers: { origin: 'https://spray.test', host: 'spray.test', 'x-forwarded-proto': 'https' },
});
const packageRevision = {
  id: PACKAGE, missionId: MISSION, revisionNumber: 4, fieldIds: [FIELD_A, FIELD_B],
  jsaRevisionId: JSA, evidenceDigest: DIGEST, state: 'AWAITING_CRP_APPROVAL',
  createdAt: '2026-09-04T10:00:00.000Z',
};
const crpDecision = {
  id: DECISION, packageRevisionId: PACKAGE, decision: 'AUTHORISED',
  decidedByInternalUserId: ACTOR, decidedAt: '2026-09-04T11:00:00.000Z', declaration: 'Reviewed.',
};
const repository = () => ({
  saveScope: jest.fn().mockResolvedValue(packageRevision),
  submitForApproval: jest.fn().mockResolvedValue(packageRevision),
  decide: jest.fn().mockResolvedValue(crpDecision),
  readPackageHistory: jest.fn().mockResolvedValue({ missionId: MISSION, currentRevision: 4, packages: [packageRevision], decisions: [crpDecision] }),
});

test('registers only the focused mission-operations resource name', () => {
  const handlers = createDefaultHandlers();
  expect(handlers['mission-operations']).toEqual(expect.any(Function));
  expect(handlers['mission-package-revisions']).toBeUndefined();
  expect(handlers['mission-crp-decisions']).toBeUndefined();
});

test('allows only the five focused actions with exact permissions and same-origin writes', async () => {
  const repo = repository();
  const handler = createMissionOperationsHandler({
    repository: repo,
    resolveContext: jest.fn().mockResolvedValue(context(['mission.pack.generate', 'mission.pack.read', 'mission.authorisation.authorise'])),
  });
  let res = response();
  await handler(request('POST', 'scope', { missionId: MISSION, expectedRevision: 3, fieldIds: [FIELD_A, FIELD_B] }), res);
  expect(res.statusCode).toBe(201);
  expect(repo.saveScope).toHaveBeenCalledWith(expect.anything(), { missionId: MISSION, expectedRevision: 3, fieldIds: [FIELD_A, FIELD_B] });
  res = response();
  await handler(request('POST', 'submit', { missionId: MISSION, packageRevisionId: PACKAGE, expectedRevision: 4, evidenceDigest: DIGEST }), res);
  expect(res.statusCode).toBe(201);
  res = response();
  await handler(request('GET', 'history', {}, { missionId: MISSION }), res);
  expect(res.statusCode).toBe(200);

  const unsupported = response();
  await handler(request('POST', 'rpc', { rpc: 'ftf_decide_mission_package' }), unsupported);
  expect(unsupported.statusCode).toBe(400);
  expect(JSON.stringify(unsupported.body)).not.toContain('ftf_decide');
  const crossOrigin = request('POST', 'scope', { missionId: MISSION, expectedRevision: 3, fieldIds: [FIELD_A] });
  crossOrigin.headers.origin = 'https://evil.test';
  const denied = response();
  await handler(crossOrigin, denied);
  expect(denied.statusCode).toBe(403);
  expect(repo.saveScope).toHaveBeenCalledTimes(1);
});

test('derives authorise and reject identity from context and sends no browser CRP identity', async () => {
  const repo = repository();
  const handler = createMissionOperationsHandler({ repository: repo, resolveContext: async () => context(['mission.authorisation.authorise']) });
  const common = { missionId: MISSION, packageRevisionId: PACKAGE, expectedRevision: 4, evidenceDigest: DIGEST };
  let res = response();
  await handler(request('POST', 'authorise', { ...common, declaration: 'Reviewed.' }), res);
  expect(res.statusCode).toBe(201);
  expect(repo.decide).toHaveBeenCalledWith(expect.anything(), { ...common, decision: 'AUTHORISED', declaration: 'Reviewed.' });
  res = response();
  await handler(request('POST', 'reject', { ...common, declaration: 'Map requires correction.' }), res);
  expect(repo.decide).toHaveBeenLastCalledWith(expect.anything(), { ...common, decision: 'REJECTED', declaration: 'Map requires correction.' });
  const spoofed = response();
  await handler(request('POST', 'authorise', { ...common, declaration: 'Reviewed.', crpPersonnelId: ACTOR }), spoofed);
  expect(spoofed.statusCode).toBe(400);
  expect(repo.decide).toHaveBeenCalledTimes(2);
});

test('rejects malformed, duplicate and empty authority inputs before repository access', async () => {
  const repo = repository();
  const handler = createMissionOperationsHandler({
    repository: repo,
    resolveContext: async () => context(['mission.pack.generate', 'mission.authorisation.authorise']),
  });
  for (const req of [
    request('POST', 'scope', { missionId: 'foreign', expectedRevision: 0, fieldIds: [FIELD_A] }),
    request('POST', 'scope', { missionId: MISSION, expectedRevision: -1, fieldIds: [FIELD_A] }),
    request('POST', 'scope', { missionId: MISSION, expectedRevision: 0, fieldIds: [] }),
    request('POST', 'scope', { missionId: MISSION, expectedRevision: 0, fieldIds: [FIELD_A, FIELD_A] }),
    request('POST', 'submit', { missionId: MISSION, packageRevisionId: PACKAGE, expectedRevision: 4, evidenceDigest: 'ABC' }),
    request('POST', 'reject', { missionId: MISSION, packageRevisionId: PACKAGE, expectedRevision: 4, evidenceDigest: DIGEST, declaration: ' ' }),
  ]) {
    const res = response();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  }
  expect(repo.saveScope).not.toHaveBeenCalled();
  expect(repo.submitForApproval).not.toHaveBeenCalled();
  expect(repo.decide).not.toHaveBeenCalled();
});

test('maps checked database failures to stable statuses with a correlation ID', async () => {
  const cases = [
    [{ error: 'MISSION_SCOPE_FIELD_NOT_IN_JOB' }, 400, 'MISSION_SCOPE_FIELD_NOT_IN_JOB'],
    [{ forbidden: true }, 403, 'FORBIDDEN'],
    [{ locationForbidden: true }, 403, 'FORBIDDEN'],
    [{ error: 'MISSION_CRP_INELIGIBLE' }, 403, 'CRP_INELIGIBLE'],
    [{ error: 'MISSION_PACKAGE_NOT_FOUND' }, 404, 'NOT_FOUND'],
    [{ error: 'MISSION_PACKAGE_EVIDENCE_STALE', currentVersion: 5 }, 409, 'MISSION_PACKAGE_EVIDENCE_STALE'],
    [{ error: 'MISSION_PACKAGE_DECISION_CONFLICT' }, 409, 'MISSION_PACKAGE_DECISION_CONFLICT'],
    [{ readinessBlocked: true }, 409, 'READINESS_BLOCKED'],
  ];
  for (const [result, status, code] of cases) {
    const repo = repository();
    repo.decide.mockResolvedValueOnce(result);
    const handler = createMissionOperationsHandler({ repository: repo, resolveContext: async () => context(['mission.authorisation.authorise']) });
    const res = response();
    await handler(request('POST', 'authorise', { missionId: MISSION, packageRevisionId: PACKAGE, expectedRevision: 4, evidenceDigest: DIGEST, declaration: 'Reviewed.' }), res);
    expect(res.statusCode).toBe(status);
    expect(res.body.error).toEqual(expect.objectContaining({ code, correlationId: 'mission-ops-request-123' }));
  }
});

test('maps only trusted organisation and actor identities to checked RPC parameters', async () => {
  const rpc = jest.fn()
    .mockResolvedValueOnce({ record: {
      id: PACKAGE, mission_id: MISSION, version_number: 4, jsa_revision_id: JSA,
      evidence_digest: DIGEST, generated_at: '2026-09-04T10:00:00.000Z',
    }, field_ids: [FIELD_A, FIELD_B], effective_state: 'PREPARING' })
    .mockResolvedValueOnce({ record: {
      id: DECISION, mission_pack_revision_id: PACKAGE, decision: 'AUTHORISED',
      authorised_by_internal_user_id: ACTOR, authorised_at: '2026-09-04T11:00:00.000Z', declaration: 'Reviewed.',
    } });
  const repo = new MissionOperationsRepository(rpc);
  await expect(repo.saveScope(context(['mission.pack.generate']), { missionId: MISSION, expectedRevision: 3, fieldIds: [FIELD_A, FIELD_B] }))
    .resolves.toEqual(expect.objectContaining({ id: PACKAGE, state: 'PREPARING', fieldIds: [FIELD_A, FIELD_B] }));
  await expect(repo.decide(context(['mission.authorisation.authorise']), {
    missionId: MISSION, packageRevisionId: PACKAGE, expectedRevision: 4,
    evidenceDigest: DIGEST, decision: 'AUTHORISED', declaration: 'Reviewed.',
  })).resolves.toEqual(crpDecision);
  expect(rpc.mock.calls.map(([url]) => url)).toEqual([
    'rest/v1/rpc/ftf_save_mission_package_scope',
    'rest/v1/rpc/ftf_decide_mission_package',
  ]);
  expect(JSON.parse(rpc.mock.calls[1][1].body)).toEqual({
    p_organisation_id: ORG, p_actor_internal_user_id: ACTOR, p_mission_id: MISSION,
    p_package_revision_id: PACKAGE, p_expected_revision: 4, p_evidence_digest: DIGEST,
    p_decision: 'AUTHORISED', p_declaration: 'Reviewed.',
  });
});

test('normalises immutable history from the canonical pack and authorisation streams', async () => {
  const rpc = jest.fn().mockResolvedValue({
    mission_id: MISSION,
    current_revision: 5,
    packages: [{ id: PACKAGE, mission_id: MISSION, revision_number: 4, field_ids: [FIELD_A], jsa_revision_id: JSA, evidence_digest: DIGEST, state: 'REJECTED', created_at: '2026-09-04T10:00:00.000Z' }],
    decisions: [{ id: DECISION, package_revision_id: PACKAGE, decision: 'REJECTED', decided_by_internal_user_id: ACTOR, decided_at: '2026-09-04T11:00:00.000Z', declaration: 'Map requires correction.' }],
  });
  const repo = new MissionOperationsRepository(rpc);
  await expect(repo.readPackageHistory(context(['mission.pack.read']), MISSION)).resolves.toEqual({
    missionId: MISSION,
    currentRevision: 5,
    packages: [expect.objectContaining({ id: PACKAGE, state: 'REJECTED', fieldIds: [FIELD_A] })],
    decisions: [expect.objectContaining({ id: DECISION, decision: 'REJECTED', packageRevisionId: PACKAGE })],
  });
  expect(JSON.parse(rpc.mock.calls[0][1].body)).toEqual({ p_organisation_id: ORG, p_actor_internal_user_id: ACTOR, p_mission_id: MISSION });
});
