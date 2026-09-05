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
const DAY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACTIVITY = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const AIRCRAFT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PLAN_LINE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const WEATHER_REPORT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

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
  createAmendment: jest.fn().mockResolvedValue({ classification: 'MATERIAL', reasons: ['FIELD_SCOPE_CHANGED'], changedKeys: ['fieldIds'], packageRevision }),
  readAmendmentHistory: jest.fn().mockResolvedValue([]),
  saveScope: jest.fn().mockResolvedValue(packageRevision),
  submitForApproval: jest.fn().mockResolvedValue(packageRevision),
  decide: jest.fn().mockResolvedValue(crpDecision),
  readPackageHistory: jest.fn().mockResolvedValue({ missionId: MISSION, currentRevision: 4, packages: [packageRevision], decisions: [crpDecision] }),
  createDay: jest.fn().mockResolvedValue({ id: DAY }),
  reviewJsa: jest.fn().mockResolvedValue({ id: DAY }),
  startDay: jest.fn().mockResolvedValue({ id: DAY }),
  saveFieldActivity: jest.fn().mockResolvedValue({ id: DAY }),
  completeDay: jest.fn().mockResolvedValue({ id: DAY }),
  readDays: jest.fn().mockResolvedValue({ missionId: MISSION, days: [] }),
  saveAircraftActuals: jest.fn().mockResolvedValue({ missionId: MISSION, operatingDayId: DAY, actuals: [] }),
  readAircraftActuals: jest.fn().mockResolvedValue({ missionId: MISSION, operatingDayId: DAY, actuals: [] }),
  reconcileAircraftActuals: jest.fn().mockResolvedValue({ missionId: MISSION, operatingDayId: DAY, actuals: [] }),
  readChemicalActuals: jest.fn().mockResolvedValue({ missionId: MISSION, operatingDayId: DAY, currentRevision: 0, proposals: [], actual: null }),
  confirmChemicalActuals: jest.fn().mockResolvedValue({ missionId: MISSION, operatingDayId: DAY, currentRevision: 1, proposals: [], actual: {} }),
  prepareWeatherCapture: jest.fn().mockResolvedValue({ missionId: MISSION, operatingDayId: DAY, dayVersion: 4, contextDigest: 'c'.repeat(64), coverage: 'ACTUAL_INTERVAL', intervalStartAt: '2026-09-04T21:30:00.000Z', intervalEndAt: '2026-09-05T03:15:00.000Z', timezone: 'Australia/Brisbane', latitude: '-27.500000', longitude: '153.100000' }),
  freezeWeatherReport: jest.fn().mockResolvedValue({ id: WEATHER_REPORT, missionId: MISSION, operatingDayId: DAY, sourceDigest: DIGEST }),
  readWeatherReport: jest.fn().mockResolvedValue(null),
  readFinalSignoffReadiness: jest.fn().mockResolvedValue({ missionId: MISSION, operationalWorkCompleted: true, finalSignedOff: false, readyForFinalSignoff: true, currentCompletionRevision: 0, blockers: [] }),
  readFrozenReportDocument: jest.fn().mockResolvedValue({ status: 'AVAILABLE', completionRevisionId: DECISION, documentText: '{"value":1.0}', documentDigest: DIGEST }),
  finalSignoffMission: jest.fn().mockResolvedValue({ id: DECISION, missionId: MISSION, versionNumber: 1, dailyEvidenceDigest: DIGEST, completedAt: '2026-09-06T10:00:00.000Z' }),
  closeJob: jest.fn().mockResolvedValue({ id: FIELD_B, status: 'closed', rowVersion: 5 }),
});

test('routes checked final readiness, canonical final sign-off and Job close commands', async () => {
  const repo = repository();
  const handler = createMissionOperationsHandler({
    repository: repo,
    resolveContext: async () => context(['mission.completion.complete', 'mission.operational.read', 'jobs.write']),
  });
  let res = response();
  await handler(request('GET', 'final-signoff-readiness', {}, { missionId: MISSION }), res);
  expect(res.statusCode).toBe(200);
  expect(repo.readFinalSignoffReadiness).toHaveBeenCalledWith(expect.anything(), MISSION);
  res = response();
  await handler(request('POST', 'final-signoff', { missionId: MISSION, expectedRevision: 0, declaration: 'Evidence reviewed and complete.' }), res);
  expect(res.statusCode).toBe(201);
  expect(repo.finalSignoffMission).toHaveBeenCalledWith(expect.anything(), { missionId: MISSION, expectedRevision: 0, declaration: 'Evidence reviewed and complete.' });
  res = response();
  await handler(request('POST', 'job-close', { jobId: FIELD_B, expectedVersion: 4 }), res);
  expect(res.statusCode).toBe(200);
  expect(repo.closeJob).toHaveBeenCalledWith(expect.anything(), { jobId: FIELD_B, expectedVersion: 4 });
});

test('routes exact frozen report text and digest through the trusted read boundary', async () => {
  const repo = repository();
  const handler = createMissionOperationsHandler({ repository: repo, resolveContext: async () => context(['mission.operational.read']) });
  const res = response();
  await handler(request('GET', 'frozen-report-document', {}, { missionId: MISSION, completionRevisionId: DECISION }), res);
  expect(res.statusCode).toBe(200);
  expect(repo.readFrozenReportDocument).toHaveBeenCalledWith(expect.anything(), MISSION, DECISION);
  expect(res.body.data).toEqual({ status: 'AVAILABLE', completionRevisionId: DECISION, documentText: '{"value":1.0}', documentDigest: DIGEST });
});

test('maps frozen report RPC envelope without parsing or reserializing document text', async () => {
  const rpc = jest.fn().mockResolvedValue({ status: 'AVAILABLE', completionRevisionId: DECISION,
    documentText: '{"value":1.0}', documentDigest: DIGEST });
  const repo = new MissionOperationsRepository(rpc);
  await expect(repo.readFrozenReportDocument(context(['mission.operational.read']), MISSION, DECISION))
    .resolves.toEqual({ status: 'AVAILABLE', completionRevisionId: DECISION, documentText: '{"value":1.0}', documentDigest: DIGEST });
  expect(JSON.parse(rpc.mock.calls[0][1].body)).toEqual({ p_organisation_id: ORG, p_actor_internal_user_id: ACTOR,
    p_mission_id: MISSION, p_completion_revision_id: DECISION });
});

test('maps only the recognized thrown PostgREST finality guard to a safe conflict', async () => {
  const postgrestError = (message) => Object.assign(new Error(`500 ${JSON.stringify({ code: '55000', details: 'private detail', hint: null, message })}`), {
    statusCode: 500,
    publicMessage: 'Supabase request failed.',
  });
  let repo = repository();
  repo.finalSignoffMission.mockRejectedValueOnce(postgrestError('MISSION_FINAL_SIGNOFF_IMMUTABLE'));
  let handler = createMissionOperationsHandler({ repository: repo, resolveContext: async () => context(['mission.completion.complete']) });
  let res = response();
  await handler(request('POST', 'final-signoff', { missionId: MISSION, expectedRevision: 1, declaration: 'Retry.' }), res);
  expect(res.statusCode).toBe(409);
  expect(res.body.error.code).toBe('MISSION_FINAL_SIGNOFF_IMMUTABLE');
  expect(JSON.stringify(res.body)).not.toContain('private detail');

  repo = repository();
  repo.finalSignoffMission.mockRejectedValueOnce(postgrestError('ANOTHER_TERMINAL_ERROR'));
  handler = createMissionOperationsHandler({ repository: repo, resolveContext: async () => context(['mission.completion.complete']) });
  res = response();
  await handler(request('POST', 'final-signoff', { missionId: MISSION, expectedRevision: 1, declaration: 'Retry.' }), res);
  expect(res.statusCode).toBe(500);
  expect(res.body.error.code).toBe('MISSION_OPERATIONS_UNAVAILABLE');
  expect(JSON.stringify(res.body)).not.toContain('ANOTHER_TERMINAL_ERROR');
});

test('routes a strictly decoded amendment through checked package authority', async () => {
  const repo = repository();
  const handler = createMissionOperationsHandler({
    repository: repo,
    resolveContext: async () => context(['mission.pack.generate']),
  });
  const body = {
    missionId: MISSION,
    expectedRevision: 4,
    before: { fieldIds: [FIELD_A] },
    after: { fieldIds: [FIELD_A, FIELD_B] },
    reason: 'Second Field added after site review.',
  };
  const res = response();
  await handler(request('POST', 'amend', body), res);
  expect(res.statusCode).toBe(201);
  expect(repo.createAmendment).toHaveBeenCalledWith(expect.anything(), body);

  const invalid = response();
  await handler(request('POST', 'amend', { ...body, before: [], injected: true }), invalid);
  expect(invalid.statusCode).toBe(400);
  expect(repo.createAmendment).toHaveBeenCalledTimes(1);
});

test('rejects a combined amendment key union above 64 before repository access', async () => {
  const repo = repository();
  const handler = createMissionOperationsHandler({ repository: repo, resolveContext: async () => context(['mission.pack.generate']) });
  const before = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`before${index}`, index]));
  const after = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`after${index}`, index]));
  const res = response();
  await handler(request('POST', 'amend', { missionId: MISSION, expectedRevision: 4, before, after, reason: 'Bound check.' }), res);
  expect(res.statusCode).toBe(400);
  expect(repo.createAmendment).not.toHaveBeenCalled();
});

test('reads bounded amendment history through package-read authority', async () => {
  const repo = repository();
  const handler = createMissionOperationsHandler({ repository: repo, resolveContext: async () => context(['mission.pack.read']) });
  const res = response();
  await handler(request('GET', 'amendment-history', {}, { missionId: MISSION }), res);
  expect(res.statusCode).toBe(200);
  expect(repo.readAmendmentHistory).toHaveBeenCalledWith(expect.anything(), MISSION);
});

const chemicalInput = {
  missionId: MISSION, dayId: DAY, expectedDayVersion: 4, expectedRevision: 0,
  lines: [{ fieldId: FIELD_A, plannedLineId: PLAN_LINE, platformProductId: null, platformProductVersionId: null,
    registerEntryId: null, productName: 'Test Product', rate: '2.000000', rateUnit: 'L_HA',
    appliedQuantity: '20.000000', quantityUnit: 'L', batchLot: 'LOT-001', aircraftId: AIRCRAFT }],
  notes: null,
};

const manualEvidence = {
  source: 'MANUAL', providerIdentifier: null, providerRetrievedAt: null,
  hourlyObservations: [{ observedAt: '2026-09-04T22:00:00.000Z', temperatureC: 24, relativeHumidity: 60, dewPointC: 16, windSpeedKmh: 10, windDirectionDegrees: 90, precipitationMm: 0 }],
  inversionInputs: { method: 'ON_SITE_LOG' }, inversionResults: { assessment: 'UNLIKELY' }, coverageGaps: [],
  manualReason: 'Provider unavailable; copied from the station log.', sourceMetadata: { source: 'station log' },
};

test('registers only the focused mission-operations resource name', () => {
  const handlers = createDefaultHandlers();
  expect(handlers['mission-operations']).toEqual(expect.any(Function));
  expect(handlers['mission-package-revisions']).toBeUndefined();
  expect(handlers['mission-crp-decisions']).toBeUndefined();
});

test('allows the focused package actions with exact permissions and same-origin writes', async () => {
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

test('routes exact operating-day commands and derives all authority identities from context', async () => {
  const repo = repository();
  const handler = createMissionOperationsHandler({
    repository: repo,
    resolveContext: async () => context(['mission.operational.read', 'mission.operational.write', 'mission.completion.complete', 'asset_meters.manage']),
  });
  const calls = [
    ['day-create', { missionId: MISSION, workDate: '2026-09-05', notes: null }],
    ['day-jsa-review', { missionId: MISSION, dayId: DAY, expectedVersion: 1, outcome: 'CONDITIONS_COVERED', notes: 'Conditions unchanged.' }],
    ['day-start', { missionId: MISSION, dayId: DAY, expectedVersion: 2, startedAt: '2026-09-04T15:30:00.000Z' }],
    ['field-activity-save', {
      missionId: MISSION, dayId: DAY, activityId: null, expectedVersion: 0,
      fieldId: FIELD_A, hectaresAttempted: '1.250000', hectaresCompleted: '1.000000',
      startedAt: '2026-09-04T15:45:00.000Z', finishedAt: null,
      status: 'IN_PROGRESS', notes: null,
    }],
    ['day-complete', { missionId: MISSION, dayId: DAY, expectedVersion: 4, finishedAt: '2026-09-05T17:00:00.000Z', notes: 'Overnight operation.' }],
  ];
  for (const [action, body] of calls) {
    const res = response();
    await handler(request('POST', action, body), res);
    expect(res.statusCode).toBe(200);
  }
  const days = response();
  await handler(request('GET', 'days', {}, { missionId: MISSION }), days);
  expect(days.statusCode).toBe(200);
  expect(repo.createDay).toHaveBeenCalledWith(expect.anything(), calls[0][1]);
  expect(repo.reviewJsa).toHaveBeenCalledWith(expect.anything(), calls[1][1]);
  expect(repo.startDay).toHaveBeenCalledWith(expect.anything(), calls[2][1]);
  expect(repo.saveFieldActivity).toHaveBeenCalledWith(expect.anything(), calls[3][1]);
  expect(repo.completeDay).toHaveBeenCalledWith(expect.anything(), calls[4][1]);
  expect(repo.readDays).toHaveBeenCalledWith(expect.anything(), MISSION);
});

test('keeps operating-day read and write permissions distinct', async () => {
  const repo = repository();
  let res = response();
  await createMissionOperationsHandler({ repository: repo, resolveContext: async () => context(['mission.operational.read']) })(
    request('POST', 'day-create', { missionId: MISSION, workDate: '2026-09-05', notes: null }),
    res,
  );
  expect(res.statusCode).toBe(403);
  res = response();
  await createMissionOperationsHandler({ repository: repo, resolveContext: async () => context(['mission.operational.write']) })(
    request('GET', 'days', {}, { missionId: MISSION }),
    res,
  );
  expect(res.statusCode).toBe(403);
  expect(repo.createDay).not.toHaveBeenCalled();
  expect(repo.readDays).not.toHaveBeenCalled();
});

test('requires completion and Fleet meter permissions at the atomic day sign-off boundary', async () => {
  const repo = repository();
  const res = response();
  await createMissionOperationsHandler({ repository: repo, resolveContext: async () => context(['mission.operational.write']) })(
    request('POST', 'day-complete', { missionId: MISSION, dayId: DAY, expectedVersion: 4, finishedAt: '2026-09-05T17:00:00.000Z', notes: null }),
    res,
  );
  expect(res.statusCode).toBe(403);
  expect(repo.completeDay).not.toHaveBeenCalled();
});

test('rejects invalid calendar dates, local timestamps and decimal hectare values before repository access', async () => {
  const repo = repository();
  const handler = createMissionOperationsHandler({ repository: repo, resolveContext: async () => context(['mission.operational.write']) });
  const invalid = [
    request('POST', 'day-create', { missionId: MISSION, workDate: '2026-02-30', notes: null }),
    request('POST', 'day-start', { missionId: MISSION, dayId: DAY, expectedVersion: 2, startedAt: '2026-09-05T01:00:00' }),
    request('POST', 'day-start', { missionId: MISSION, dayId: DAY, expectedVersion: 2, startedAt: '2026-02-30T01:00:00.000Z' }),
    request('POST', 'field-activity-save', { missionId: MISSION, dayId: DAY, activityId: null, expectedVersion: 0, fieldId: FIELD_A, hectaresAttempted: 1.25, hectaresCompleted: null, startedAt: null, finishedAt: null, status: 'PLANNED', notes: null }),
    request('POST', 'field-activity-save', { missionId: MISSION, dayId: DAY, activityId: ACTIVITY, expectedVersion: 1, fieldId: FIELD_A, hectaresAttempted: '1.25', hectaresCompleted: null, startedAt: null, finishedAt: null, status: 'PLANNED', notes: null }),
  ];
  for (const req of invalid) {
    const res = response();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  }
  expect(repo.createDay).not.toHaveBeenCalled();
  expect(repo.startDay).not.toHaveBeenCalled();
  expect(repo.saveFieldActivity).not.toHaveBeenCalled();
});

test('maps operating-day authority and concurrency failures to stable statuses', async () => {
  const cases = [
    ['MISSION_OPERATING_DAY_NOT_FOUND', 404, 'NOT_FOUND'],
    ['MISSION_NOT_AUTHORISED', 409, 'MISSION_NOT_AUTHORISED'],
    ['JSA_DAY_REVIEW_REQUIRED', 409, 'JSA_DAY_REVIEW_REQUIRED'],
    ['MISSION_PACKAGE_STALE', 409, 'MISSION_PACKAGE_STALE'],
    ['MISSION_OPERATING_DAY_VERSION_CONFLICT', 409, 'MISSION_OPERATING_DAY_VERSION_CONFLICT'],
    ['MISSION_OPERATING_DATE_CONFLICT', 409, 'MISSION_OPERATING_DATE_CONFLICT'],
    ['MISSION_AMENDMENT_BEFORE_MISMATCH', 409, 'MISSION_AMENDMENT_BEFORE_MISMATCH'],
    ['MISSION_AMENDMENT_KEY_SET_MISMATCH', 409, 'MISSION_AMENDMENT_KEY_SET_MISMATCH'],
    ['MISSION_DAY_FIELD_NOT_AUTHORISED', 400, 'MISSION_DAY_FIELD_NOT_AUTHORISED'],
  ];
  for (const [error, status, code] of cases) {
    const repo = repository();
    repo.startDay.mockResolvedValueOnce({ error, currentVersion: 3 });
    const handler = createMissionOperationsHandler({ repository: repo, resolveContext: async () => context(['mission.operational.write']) });
    const res = response();
    await handler(request('POST', 'day-start', { missionId: MISSION, dayId: DAY, expectedVersion: 2, startedAt: '2026-09-04T15:30:00.000Z' }), res);
    expect(res.statusCode).toBe(status);
    expect(res.body.error).toEqual(expect.objectContaining({ code, correlationId: 'mission-ops-request-123' }));
  }
});

test('rejects an amendment after-scope mismatch as safe invalid input', async () => {
  const repo = repository();
  repo.createAmendment.mockResolvedValueOnce({ error: 'MISSION_AMENDMENT_AFTER_MISMATCH' });
  const handler = createMissionOperationsHandler({ repository: repo, resolveContext: async () => context(['mission.pack.generate']) });
  const res = response();
  await handler(request('POST', 'amend', {
    missionId: MISSION, expectedRevision: 4, before: { fieldIds: [FIELD_A] }, after: { fieldIds: ['not-a-uuid'] }, reason: 'Field scope changed.',
  }), res);
  expect(res.statusCode).toBe(400);
  expect(res.body.error.code).toBe('MISSION_AMENDMENT_AFTER_MISMATCH');
});

test('routes exact aircraft-day save, read and reconcile commands with canonical hour strings', async () => {
  const repo = repository();
  const handler = createMissionOperationsHandler({
    repository: repo,
    resolveContext: async () => context(['mission.operational.read', 'mission.operational.write']),
  });
  const payload = {
    missionId: MISSION,
    dayId: DAY,
    expectedVersion: 4,
    totalAircraftHours: '10.0000',
    aircraftTotals: [{ aircraftId: AIRCRAFT, totalFlightHours: null }],
    flights: [{ aircraftId: AIRCRAFT, durationHours: '10.0000', startedAt: null, finishedAt: null, fieldId: null, sourceImportId: null }],
  };
  let res = response();
  await handler(request('POST', 'aircraft-actuals-save', payload), res);
  expect(res.statusCode).toBe(200);
  expect(repo.saveAircraftActuals).toHaveBeenCalledWith(expect.anything(), payload);
  res = response();
  await handler(request('GET', 'aircraft-actuals', {}, { missionId: MISSION, dayId: DAY }), res);
  expect(res.statusCode).toBe(200);
  expect(repo.readAircraftActuals).toHaveBeenCalledWith(expect.anything(), MISSION, DAY);
  res = response();
  await handler(request('POST', 'aircraft-actuals-reconcile', { missionId: MISSION, dayId: DAY }), res);
  expect(res.statusCode).toBe(200);
  expect(repo.reconcileAircraftActuals).toHaveBeenCalledWith(expect.anything(), MISSION, DAY);
});

test('rejects excess aircraft-hour precision and duplicate aircraft before repository access', async () => {
  const repo = repository();
  const handler = createMissionOperationsHandler({ repository: repo, resolveContext: async () => context(['mission.operational.write']) });
  const base = {
    missionId: MISSION, dayId: DAY, expectedVersion: 4, totalAircraftHours: '1.0000',
    aircraftTotals: [{ aircraftId: AIRCRAFT, totalFlightHours: '1.0000' }], flights: [],
  };
  for (const body of [
    { ...base, totalAircraftHours: '1.00001' },
    { ...base, aircraftTotals: [{ aircraftId: AIRCRAFT, totalFlightHours: '1.00001' }] },
    { ...base, aircraftTotals: [...base.aircraftTotals, ...base.aircraftTotals] },
    { ...base, flights: [{ aircraftId: AIRCRAFT, durationHours: 1, startedAt: null, finishedAt: null, fieldId: null, sourceImportId: null }] },
  ]) {
    const res = response();
    await handler(request('POST', 'aircraft-actuals-save', body), res);
    expect(res.statusCode).toBe(400);
  }
  expect(repo.saveAircraftActuals).not.toHaveBeenCalled();
});

test('maps aircraft reconciliation and scope failures without broadening authority', async () => {
  const cases = [
    ['AIRCRAFT_FLIGHT_TOTAL_MISMATCH', 409],
    ['AIRCRAFT_DAY_TOTAL_MISMATCH', 409],
    ['MISSION_DAY_AIRCRAFT_NOT_AUTHORISED', 400],
    ['MISSION_OPERATING_DAY_SIGNED_OFF', 409],
  ];
  for (const [error, status] of cases) {
    const repo = repository();
    repo.reconcileAircraftActuals.mockResolvedValueOnce({ error });
    const handler = createMissionOperationsHandler({ repository: repo, resolveContext: async () => context(['mission.operational.write']) });
    const res = response();
    await handler(request('POST', 'aircraft-actuals-reconcile', { missionId: MISSION, dayId: DAY }), res);
    expect(res.statusCode).toBe(status);
    expect(res.body.error).toEqual(expect.objectContaining({ code: error }));
  }
});

test('routes exact daily chemical proposal reads and explicit confirmation commands', async () => {
  const repo = repository();
  const handler = createMissionOperationsHandler({ repository: repo, resolveContext: async () => context(['mission.operational.read', 'mission.operational.write']) });
  let res = response();
  await handler(request('GET', 'chemical-actuals', {}, { missionId: MISSION, dayId: DAY }), res);
  expect(res.statusCode).toBe(200);
  expect(repo.readChemicalActuals).toHaveBeenCalledWith(expect.anything(), MISSION, DAY);
  res = response();
  await handler(request('POST', 'chemical-actuals-confirm', chemicalInput), res);
  expect(res.statusCode).toBe(201);
  expect(repo.confirmChemicalActuals).toHaveBeenCalledWith(expect.anything(), chemicalInput);
});

test('keeps batch or lot optional while trimming and bounding supplied provenance', async () => {
  const repo = repository();
  const handler = createMissionOperationsHandler({ repository: repo, resolveContext: async () => context(['mission.operational.write']) });
  let res = response();
  await handler(request('POST', 'chemical-actuals-confirm', {
    ...chemicalInput,
    lines: [{ ...chemicalInput.lines[0], batchLot: '  LOT-TRIMMED  ' }],
  }), res);
  expect(res.statusCode).toBe(201);
  expect(repo.confirmChemicalActuals).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({
    lines: [expect.objectContaining({ batchLot: 'LOT-TRIMMED' })],
  }));
  res = response();
  await handler(request('POST', 'chemical-actuals-confirm', {
    ...chemicalInput,
    lines: [{ ...chemicalInput.lines[0], batchLot: null }],
  }), res);
  expect(res.statusCode).toBe(201);
  res = response();
  await handler(request('POST', 'chemical-actuals-confirm', {
    ...chemicalInput,
    lines: [{ ...chemicalInput.lines[0], batchLot: 'x'.repeat(201) }],
  }), res);
  expect(res.statusCode).toBe(400);
  expect(repo.confirmChemicalActuals).toHaveBeenCalledTimes(2);
});

test('captures provider weather for the database-resolved interval and freezes its evidence', async () => {
  const repo = repository();
  const weatherProvider = { fetchHistoricalWeather: jest.fn().mockResolvedValue({
    source: 'OPEN_METEO', providerIdentifier: 'OPEN_METEO_ARCHIVE_V1', providerRetrievedAt: '2026-09-06T00:00:00.000Z',
    hourlyObservations: [{ observedAt: '2026-09-04T22:00:00.000Z' }], inversionInputs: {}, inversionResults: {},
    coverageGaps: [], manualReason: null, sourceMetadata: {
      requestedLatitude: -27.5, requestedLongitude: 153.1,
      requestedIntervalStart: '2026-09-04T21:30:00.000Z', requestedIntervalEnd: '2026-09-05T03:15:00.000Z',
    },
  }) };
  const handler = createMissionOperationsHandler({ repository: repo, weatherProvider, resolveContext: async () => context(['mission.operational.write']) });
  const res = response();
  await handler(request('POST', 'day-weather-capture', { missionId: MISSION, dayId: DAY, coverage: 'ACTUAL_INTERVAL' }), res);
  expect(res.statusCode).toBe(201);
  expect(weatherProvider.fetchHistoricalWeather).toHaveBeenCalledWith({
    latitude: -27.5, longitude: 153.1,
    intervalStart: '2026-09-04T21:30:00.000Z', intervalEnd: '2026-09-05T03:15:00.000Z',
  });
  expect(repo.freezeWeatherReport).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    missionId: MISSION, dayId: DAY, expectedDayVersion: 4, expectedContextDigest: 'c'.repeat(64),
    coverage: 'ACTUAL_INTERVAL', evidence: expect.objectContaining({ source: 'OPEN_METEO' }),
  }));
});

test('binds a provider result to the exact prepared context so a concurrent context change fails closed', async () => {
  const repo = repository();
  repo.freezeWeatherReport.mockResolvedValueOnce({ error: 'MISSION_DAY_WEATHER_CONTEXT_CONFLICT' });
  const weatherProvider = { fetchHistoricalWeather: jest.fn().mockResolvedValue({
    source: 'OPEN_METEO', providerIdentifier: 'OPEN_METEO_ARCHIVE_V1', providerRetrievedAt: '2026-09-06T00:00:00.000Z',
    hourlyObservations: [{ observedAt: '2026-09-04T22:00:00.000Z' }], inversionInputs: {}, inversionResults: {},
    coverageGaps: [], manualReason: null, sourceMetadata: {
      requestedLatitude: -27.5, requestedLongitude: 153.1,
      requestedIntervalStart: '2026-09-04T21:30:00.000Z', requestedIntervalEnd: '2026-09-05T03:15:00.000Z',
    },
  }) };
  const handler = createMissionOperationsHandler({ repository: repo, weatherProvider, resolveContext: async () => context(['mission.operational.write']) });
  const res = response();
  await handler(request('POST', 'day-weather-capture', { missionId: MISSION, dayId: DAY, coverage: 'ACTUAL_INTERVAL' }), res);
  expect(res.statusCode).toBe(409);
  expect(res.body.error.code).toBe('MISSION_DAY_WEATHER_CONTEXT_CONFLICT');
  expect(repo.freezeWeatherReport).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    expectedContextDigest: 'c'.repeat(64),
  }));
});

test('does not freeze a provider result that does not attest the prepared coordinates and interval', async () => {
  const repo = repository();
  const weatherProvider = { fetchHistoricalWeather: jest.fn().mockResolvedValue({
    source: 'OPEN_METEO', providerIdentifier: 'OPEN_METEO_ARCHIVE_V1', providerRetrievedAt: '2026-09-06T00:00:00.000Z',
    hourlyObservations: [{ observedAt: '2026-09-04T22:00:00.000Z' }], inversionInputs: {}, inversionResults: {},
    coverageGaps: [], manualReason: null, sourceMetadata: {
      requestedLatitude: -28, requestedLongitude: 153.1,
      requestedIntervalStart: '2026-09-04T21:30:00.000Z', requestedIntervalEnd: '2026-09-05T03:15:00.000Z',
    },
  }) };
  const handler = createMissionOperationsHandler({ repository: repo, weatherProvider, resolveContext: async () => context(['mission.operational.write']) });
  const res = response();
  await handler(request('POST', 'day-weather-capture', { missionId: MISSION, dayId: DAY, coverage: 'ACTUAL_INTERVAL' }), res);
  expect(res.statusCode).toBe(503);
  expect(res.body.error.code).toBe('MISSION_DAY_WEATHER_PROVIDER_UNAVAILABLE');
  expect(repo.freezeWeatherReport).not.toHaveBeenCalled();
});

test('rejects all-null manual observations before asking the database to freeze evidence', async () => {
  const repo = repository();
  const handler = createMissionOperationsHandler({ repository: repo, resolveContext: async () => context(['mission.operational.write']) });
  const res = response();
  await handler(request('POST', 'day-weather-manual', {
    missionId: MISSION, dayId: DAY, coverage: 'ACTUAL_INTERVAL', evidence: {
      ...manualEvidence,
      hourlyObservations: [{ observedAt: '2026-09-04T22:00:00.000Z', temperatureC: null, relativeHumidity: null,
        dewPointC: null, windSpeedKmh: null, windDirectionDegrees: null, precipitationMm: null }],
      coverageGaps: [{ observedAt: '2026-09-04T23:00:00.000Z', reason: 'Logger offline.' }],
    },
  }), res);
  expect(res.statusCode).toBe(400);
  expect(repo.freezeWeatherReport).not.toHaveBeenCalled();
});

test('fails provider capture safely and accepts explicit manual evidence fallback', async () => {
  const repo = repository();
  const weatherProvider = { fetchHistoricalWeather: jest.fn().mockRejectedValue(new Error('provider secret')) };
  const handler = createMissionOperationsHandler({ repository: repo, weatherProvider, resolveContext: async () => context(['mission.operational.write']) });
  let res = response();
  await handler(request('POST', 'day-weather-capture', { missionId: MISSION, dayId: DAY, coverage: 'ACTUAL_INTERVAL' }), res);
  expect(res.statusCode).toBe(503);
  expect(res.body.error.code).toBe('MISSION_DAY_WEATHER_PROVIDER_UNAVAILABLE');
  expect(JSON.stringify(res.body)).not.toContain('provider secret');
  expect(repo.freezeWeatherReport).not.toHaveBeenCalled();
  res = response();
  await handler(request('POST', 'day-weather-manual', { missionId: MISSION, dayId: DAY, coverage: 'ACTUAL_INTERVAL', evidence: manualEvidence }), res);
  expect(res.statusCode).toBe(201);
  expect(weatherProvider.fetchHistoricalWeather).toHaveBeenCalledTimes(1);
  expect(repo.freezeWeatherReport).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ evidence: manualEvidence }));
});

test('maps daily chemical and frozen weather authority failures without broadening scope', async () => {
  const cases = [
    ['MISSION_REAUTHORISATION_REQUIRED', 409], ['MISSION_DAY_CHEMICAL_REVISION_CONFLICT', 409],
    ['MISSION_DAY_CHEMICAL_RECONCILIATION_REQUIRED', 409], ['MISSION_FINAL_SIGNOFF_IMMUTABLE', 409],
    ['MISSION_DAY_WEATHER_ALREADY_FROZEN', 409], ['MISSION_DAY_ACTUAL_INTERVAL_REQUIRED', 409],
    ['MISSION_DAY_CHEMICAL_PLAN_NOT_FOUND', 409], ['MISSION_DAY_WEATHER_LOCATION_REQUIRED', 409],
    ['JOB_MISSION_AUTHORITY_UNRESOLVED', 409],
    ['MISSION_DAY_FIELD_INVALID', 400], ['MISSION_DAY_AIRCRAFT_INVALID', 400],
    ['MISSION_DAY_WEATHER_INPUT_INVALID', 400], ['MISSION_DAY_WEATHER_OBSERVATION_OUTSIDE_INTERVAL', 400],
    ['MISSION_DAY_WEATHER_CONTEXT_CONFLICT', 409],
  ];
  for (const [error, status] of cases) {
    const repo = repository();
    repo.confirmChemicalActuals.mockResolvedValueOnce({ error, currentVersion: 1 });
    const handler = createMissionOperationsHandler({ repository: repo, resolveContext: async () => context(['mission.operational.write']) });
    const res = response();
    await handler(request('POST', 'chemical-actuals-confirm', chemicalInput), res);
    expect(res.statusCode).toBe(status);
    expect(res.body.error.code).toBe(error);
  }
});

test('maps trusted daily actual and weather RPC parameters and projections', async () => {
  const rawChemical = { mission_id: MISSION, operating_day_id: DAY, package_revision_id: PACKAGE,
    planned_chemical_revision_id: PACKAGE, day_version: 4, current_revision: 0,
    proposals: [{ planned_line_id: PLAN_LINE, product_name: 'Test Product', platform_product_id: null, platform_product_version_id: null,
      register_entry_id: null, rate: '2.000000', rate_unit: 'L_HA', planned_quantity: '20.000000', quantity_unit: 'L', product_snapshot: {} }], actual: null };
  const rawWeatherContext = { mission_id: MISSION, operating_day_id: DAY, package_revision_id: PACKAGE, day_version: 4,
    context_digest: 'c'.repeat(64),
    coverage: 'ACTUAL_INTERVAL', interval_start_at: '2026-09-04T21:30:00.000Z', interval_end_at: '2026-09-05T03:15:00.000Z',
    timezone: 'Australia/Brisbane', source_weather_observation_id: PLAN_LINE, latitude: '-27.500000', longitude: '153.100000' };
  const rpc = jest.fn().mockResolvedValueOnce(rawChemical).mockResolvedValueOnce(rawWeatherContext).mockResolvedValueOnce({ report: null });
  const repo = new MissionOperationsRepository(rpc);
  await expect(repo.readChemicalActuals(context(['mission.operational.read']), MISSION, DAY)).resolves.toMatchObject({ plannedChemicalRevisionId: PACKAGE, proposals: [{ plannedLineId: PLAN_LINE }] });
  await expect(repo.prepareWeatherCapture(context(['mission.operational.write']), { missionId: MISSION, dayId: DAY, coverage: 'ACTUAL_INTERVAL' })).resolves.toMatchObject({ intervalStartAt: '2026-09-04T21:30:00.000Z', latitude: '-27.500000', contextDigest: 'c'.repeat(64) });
  await expect(repo.readWeatherReport(context(['mission.operational.read']), MISSION, DAY)).resolves.toBeNull();
  expect(rpc.mock.calls.map(([url]) => url)).toEqual([
    'rest/v1/rpc/ftf_read_mission_day_chemical_actuals',
    'rest/v1/rpc/ftf_prepare_mission_day_weather_capture',
    'rest/v1/rpc/ftf_read_mission_day_weather_report',
  ]);
  expect(JSON.parse(rpc.mock.calls[1][1].body)).toEqual({ p_organisation_id: ORG, p_actor_internal_user_id: ACTOR, p_mission_id: MISSION, p_operating_day_id: DAY, p_coverage: 'ACTUAL_INTERVAL' });
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

test('maps operating-day RPCs with trusted organisation and actor identities only', async () => {
  const rawDay = {
    id: DAY, mission_id: MISSION, work_date: '2026-09-05', timezone: 'Australia/Brisbane',
    package_revision_id: PACKAGE, jsa_revision_id: JSA, state: 'DRAFT',
    actual_started_at: null, actual_finished_at: null, notes: null, row_version: 1,
    created_at: '2026-09-04T12:00:00.000Z', updated_at: '2026-09-04T12:00:00.000Z',
    jsa_review: null, field_activities: [],
  };
  const rpc = jest.fn((url) => Promise.resolve(url.endsWith('ftf_read_mission_operating_days')
    ? { mission_id: MISSION, days: [rawDay] }
    : { day: rawDay }));
  const repo = new MissionOperationsRepository(rpc);
  await repo.createDay(context(['mission.operational.write']), { missionId: MISSION, workDate: '2026-09-05', notes: null });
  await repo.reviewJsa(context(['mission.operational.write']), { missionId: MISSION, dayId: DAY, expectedVersion: 1, outcome: 'CONDITIONS_COVERED', notes: null });
  await repo.startDay(context(['mission.operational.write']), { missionId: MISSION, dayId: DAY, expectedVersion: 2, startedAt: '2026-09-04T15:30:00.000Z' });
  await repo.saveFieldActivity(context(['mission.operational.write']), {
    missionId: MISSION, dayId: DAY, activityId: null, expectedVersion: 0, fieldId: FIELD_A,
    hectaresAttempted: '1.250000', hectaresCompleted: null, startedAt: null, finishedAt: null,
    status: 'PLANNED', notes: null,
  });
  await repo.completeDay(context(['mission.operational.write', 'mission.completion.complete', 'asset_meters.manage']), { missionId: MISSION, dayId: DAY, expectedVersion: 4, finishedAt: '2026-09-05T17:00:00.000Z', notes: null });
  await expect(repo.readDays(context(['mission.operational.read']), MISSION)).resolves.toEqual({
    missionId: MISSION,
    days: [expect.objectContaining({ id: DAY, workDate: '2026-09-05', fieldActivities: [] })],
  });
  expect(rpc.mock.calls.map(([url]) => url)).toEqual([
    'rest/v1/rpc/ftf_create_mission_operating_day',
    'rest/v1/rpc/ftf_review_mission_day_jsa',
    'rest/v1/rpc/ftf_start_mission_operating_day',
    'rest/v1/rpc/ftf_save_mission_day_field_activity',
    'rest/v1/rpc/ftf_complete_and_sign_off_mission_operating_day',
    'rest/v1/rpc/ftf_read_mission_operating_days',
  ]);
  expect(JSON.parse(rpc.mock.calls[0][1].body)).toEqual({
    p_organisation_id: ORG,
    p_actor_internal_user_id: ACTOR,
    p_mission_id: MISSION,
    p_work_date: '2026-09-05',
    p_notes: null,
  });
  expect(JSON.parse(rpc.mock.calls[3][1].body)).toEqual({
    p_organisation_id: ORG,
    p_actor_internal_user_id: ACTOR,
    p_mission_id: MISSION,
    p_operating_day_id: DAY,
    p_activity_id: null,
    p_expected_version: 0,
    p_field_id: FIELD_A,
    p_hectares_attempted: '1.250000',
    p_hectares_completed: null,
    p_started_at: null,
    p_finished_at: null,
    p_status: 'PLANNED',
    p_notes: null,
  });
});

test('maps amendment RPC authority without accepting organisation or actor identities from the browser', async () => {
  const rpc = jest.fn().mockResolvedValue({
    classification: 'MATERIAL', reasons: ['FIELD_SCOPE_CHANGED'], changed_keys: ['fieldIds'],
    package_revision: { record: {
      id: PACKAGE, mission_id: MISSION, version_number: 5, jsa_revision_id: JSA,
      evidence_digest: DIGEST, package_state: 'PREPARING', created_at: '2026-09-04T12:00:00.000Z',
    }, field_ids: [FIELD_A, FIELD_B], effective_state: 'PREPARING' },
  });
  const repo = new MissionOperationsRepository(rpc);
  await expect(repo.createAmendment(context(['mission.pack.generate']), {
    missionId: MISSION, expectedRevision: 4,
    before: { fieldIds: [FIELD_A] }, after: { fieldIds: [FIELD_A, FIELD_B] },
    reason: 'Second Field added after site review.',
  })).resolves.toMatchObject({
    classification: 'MATERIAL', reasons: ['FIELD_SCOPE_CHANGED'], changedKeys: ['fieldIds'],
    packageRevision: { id: PACKAGE, revisionNumber: 5, fieldIds: [FIELD_A, FIELD_B], state: 'PREPARING' },
  });
  expect(rpc).toHaveBeenCalledWith('rest/v1/rpc/ftf_create_mission_amendment', expect.objectContaining({
    method: 'POST',
    body: JSON.stringify({
      p_organisation_id: ORG, p_actor_internal_user_id: ACTOR, p_mission_id: MISSION,
      p_expected_revision: 4, p_before: { fieldIds: [FIELD_A] }, p_after: { fieldIds: [FIELD_A, FIELD_B] },
      p_reason: 'Second Field added after site review.',
    }),
  }));
});
