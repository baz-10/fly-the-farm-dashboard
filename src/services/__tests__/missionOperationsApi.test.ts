import {
  createMissionOperationsApi,
  decodeCrpDecision,
  decodeMissionPackageHistory,
  decodeMissionPackageRevision,
  decodeMissionOperatingDay,
  decodeMissionOperatingDays,
  decodeMissionAircraftDayActuals,
} from '../missionOperationsApi';

const MISSION_ID = '11111111-1111-4111-8111-111111111111';
const PACKAGE_ID = '22222222-2222-4222-8222-222222222222';
const JSA_ID = '33333333-3333-4333-8333-333333333333';
const FIELD_A = '44444444-4444-4444-8444-444444444444';
const FIELD_B = '55555555-5555-4555-8555-555555555555';
const DECISION_ID = '66666666-6666-4666-8666-666666666666';
const ACTOR_ID = '77777777-7777-4777-8777-777777777777';
const DIGEST = 'a'.repeat(64);
const DAY_ID = '88888888-8888-4888-8888-888888888888';
const REVIEW_ID = '99999999-9999-4999-8999-999999999999';
const ACTIVITY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AIRCRAFT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const AIRCRAFT_ACTUAL_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const FLIGHT_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const packageRevision = {
  id: PACKAGE_ID,
  missionId: MISSION_ID,
  revisionNumber: 4,
  fieldIds: [FIELD_A, FIELD_B],
  jsaRevisionId: JSA_ID,
  evidenceDigest: DIGEST,
  state: 'AWAITING_CRP_APPROVAL',
  createdAt: '2026-09-04T10:00:00.000Z',
};

const decision = {
  id: DECISION_ID,
  packageRevisionId: PACKAGE_ID,
  decision: 'AUTHORISED',
  decidedByInternalUserId: ACTOR_ID,
  decidedAt: '2026-09-04T11:00:00.000Z',
  declaration: 'I confirm this exact operational package.',
};

const jsaReview = {
  id: REVIEW_ID,
  operatingDayId: DAY_ID,
  missionId: MISSION_ID,
  jsaRevisionId: JSA_ID,
  outcome: 'CONDITIONS_COVERED',
  notes: 'Conditions unchanged.',
  reviewedByInternalUserId: ACTOR_ID,
  reviewedAt: '2026-09-04T15:20:00.000Z',
};

const fieldActivity = {
  id: ACTIVITY_ID,
  operatingDayId: DAY_ID,
  missionId: MISSION_ID,
  fieldId: FIELD_A,
  hectaresAttempted: '1.250000',
  hectaresCompleted: '1.000000',
  startedAt: '2026-09-04T15:45:00.000Z',
  finishedAt: null,
  status: 'IN_PROGRESS',
  notes: null,
  rowVersion: 1,
  createdAt: '2026-09-04T15:40:00.000Z',
  updatedAt: '2026-09-04T15:40:00.000Z',
};

const operatingDay = {
  id: DAY_ID,
  missionId: MISSION_ID,
  workDate: '2026-09-05',
  timezone: 'Australia/Brisbane',
  packageRevisionId: PACKAGE_ID,
  jsaRevisionId: JSA_ID,
  state: 'IN_PROGRESS',
  actualStartedAt: '2026-09-04T15:30:00.000Z',
  actualFinishedAt: null,
  notes: null,
  rowVersion: 3,
  createdAt: '2026-09-04T12:00:00.000Z',
  updatedAt: '2026-09-04T15:30:00.000Z',
  jsaReview,
  fieldActivities: [fieldActivity],
};

const aircraftActuals = {
  missionId: MISSION_ID,
  operatingDayId: DAY_ID,
  packageRevisionId: PACKAGE_ID,
  dayVersion: 4,
  totalAircraftHours: '10.0000',
  readyForSignOff: true,
  actuals: [{
    id: AIRCRAFT_ACTUAL_ID,
    missionId: MISSION_ID,
    operatingDayId: DAY_ID,
    packageRevisionId: PACKAGE_ID,
    aircraftId: AIRCRAFT_ID,
    missionAircraftAssignmentId: null,
    declaredTotalHours: null,
    totalFlightHours: '10.0000',
    flightsTotalHours: '10.0000',
    totalSource: 'DERIVED_FROM_FLIGHTS',
    reconciliationStatus: 'FLIGHTS_ONLY',
    rowVersion: 1,
    signedOffAt: null,
    signedOffByInternalUserId: null,
    flights: [{
      id: FLIGHT_ID,
      aircraftDayActualId: AIRCRAFT_ACTUAL_ID,
      missionId: MISSION_ID,
      operatingDayId: DAY_ID,
      aircraftId: AIRCRAFT_ID,
      flightIndex: 1,
      durationHours: '10.0000',
      startedAt: null,
      finishedAt: null,
      fieldId: null,
      sourceImportId: null,
    }],
  }],
};

function response(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'X-Correlation-ID': 'corr-12345678' }),
    json: async () => status >= 200 && status < 300 ? { data } : data,
  } as Response);
}

describe('Mission Operations strict contracts', () => {
  test('decodes the exact immutable package revision contract', () => {
    expect(decodeMissionPackageRevision(packageRevision)).toEqual(packageRevision);
  });

  test.each([
    [{ ...packageRevision, extra: true }],
    [{ ...packageRevision, id: 'not-a-uuid' }],
    [{ ...packageRevision, revisionNumber: 0 }],
    [{ ...packageRevision, fieldIds: [] }],
    [{ ...packageRevision, fieldIds: [FIELD_A, FIELD_A] }],
    [{ ...packageRevision, evidenceDigest: 'ABC' }],
    [{ ...packageRevision, state: 'APPROVED' }],
    [{ ...packageRevision, createdAt: 'yesterday' }],
  ])('rejects a malformed package revision %#', (value) => {
    expect(() => decodeMissionPackageRevision(value)).toThrow(expect.objectContaining({ code: 'MALFORMED_RESPONSE' }));
  });

  test('decodes only an exact CRP decision bound to a package revision', () => {
    expect(decodeCrpDecision(decision)).toEqual(decision);
    expect(() => decodeCrpDecision({ ...decision, packageRevisionId: 'foreign' })).toThrow(expect.objectContaining({ code: 'MALFORMED_RESPONSE' }));
    expect(() => decodeCrpDecision({ ...decision, decision: 'PENDING' })).toThrow(expect.objectContaining({ code: 'MALFORMED_RESPONSE' }));
    expect(() => decodeCrpDecision({ ...decision, crpPersonnelId: ACTOR_ID })).toThrow(expect.objectContaining({ code: 'MALFORMED_RESPONSE' }));
  });

  test('decodes bounded immutable package and decision history', () => {
    expect(decodeMissionPackageHistory({
      missionId: MISSION_ID,
      currentRevision: 5,
      packages: [packageRevision],
      decisions: [decision],
    })).toEqual({ missionId: MISSION_ID, currentRevision: 5, packages: [packageRevision], decisions: [decision] });
    expect(() => decodeMissionPackageHistory({
      missionId: MISSION_ID,
      currentRevision: 5,
      packages: [packageRevision],
      decisions: [{ ...decision, packageRevisionId: FIELD_A }],
    })).toThrow(expect.objectContaining({ code: 'MALFORMED_RESPONSE' }));
    expect(() => decodeMissionPackageHistory({
      missionId: MISSION_ID,
      currentRevision: 0,
      packages: [packageRevision],
      decisions: [decision],
    })).toThrow(expect.objectContaining({ code: 'MALFORMED_RESPONSE' }));
    expect(decodeMissionPackageHistory({
      missionId: MISSION_ID,
      currentRevision: 0,
      packages: [],
      decisions: [],
    })).toEqual({ missionId: MISSION_ID, currentRevision: 0, packages: [], decisions: [] });
  });

  test('preserves safe conflict revision and digest metadata', async () => {
    const fetcher = jest.fn(() => response({ error: {
      code: 'MISSION_PACKAGE_EVIDENCE_STALE',
      message: 'Mission package evidence changed.',
      currentVersion: 8,
      currentDigest: 'c'.repeat(64),
    } }, 409));
    const api = createMissionOperationsApi(fetcher as typeof fetch);
    await expect(api.submitForApproval(MISSION_ID, PACKAGE_ID, 7, DIGEST)).rejects.toEqual(expect.objectContaining({
      status: 409,
      code: 'MISSION_PACKAGE_EVIDENCE_STALE',
      currentVersion: 8,
      currentDigest: 'c'.repeat(64),
      correlationId: 'corr-12345678',
    }));
    const initialConflict = createMissionOperationsApi(jest.fn(() => response({ error: {
      code: 'MISSION_PACKAGE_VERSION_CONFLICT', message: 'Changed.', currentVersion: 0,
    } }, 409)) as typeof fetch);
    await expect(initialConflict.saveScope(MISSION_ID, 1, [FIELD_A])).rejects.toEqual(expect.objectContaining({ currentVersion: 0 }));
  });

  test('sends exact scope, submit, authorise, reject and history commands', async () => {
    const rejectedDecision = { ...decision, decision: 'REJECTED' };
    const fetcher = jest.fn()
      .mockImplementationOnce(() => response(packageRevision, 201))
      .mockImplementationOnce(() => response(packageRevision))
      .mockImplementationOnce(() => response(decision, 201))
      .mockImplementationOnce(() => response(rejectedDecision, 201))
      .mockImplementationOnce(() => response({ missionId: MISSION_ID, currentRevision: 4, packages: [packageRevision], decisions: [decision] }));
    const api = createMissionOperationsApi(fetcher as typeof fetch);

    await api.saveScope(MISSION_ID, 3, [FIELD_A, FIELD_B]);
    await api.submitForApproval(MISSION_ID, PACKAGE_ID, 4, DIGEST);
    await api.authorise(MISSION_ID, PACKAGE_ID, 4, DIGEST, decision.declaration);
    await api.reject(MISSION_ID, PACKAGE_ID, 4, DIGEST, 'Operational map requires correction.');
    await api.readPackageHistory(MISSION_ID);

    expect(fetcher.mock.calls).toEqual([
      ['/api/v1/mission-operations?action=scope', expect.objectContaining({ method: 'POST', credentials: 'same-origin', body: JSON.stringify({ missionId: MISSION_ID, expectedRevision: 3, fieldIds: [FIELD_A, FIELD_B] }) })],
      ['/api/v1/mission-operations?action=submit', expect.objectContaining({ method: 'POST', credentials: 'same-origin', body: JSON.stringify({ missionId: MISSION_ID, packageRevisionId: PACKAGE_ID, expectedRevision: 4, evidenceDigest: DIGEST }) })],
      ['/api/v1/mission-operations?action=authorise', expect.objectContaining({ method: 'POST', credentials: 'same-origin', body: JSON.stringify({ missionId: MISSION_ID, packageRevisionId: PACKAGE_ID, expectedRevision: 4, evidenceDigest: DIGEST, declaration: decision.declaration }) })],
      ['/api/v1/mission-operations?action=reject', expect.objectContaining({ method: 'POST', credentials: 'same-origin', body: JSON.stringify({ missionId: MISSION_ID, packageRevisionId: PACKAGE_ID, expectedRevision: 4, evidenceDigest: DIGEST, declaration: 'Operational map requires correction.' }) })],
      [`/api/v1/mission-operations?action=history&missionId=${MISSION_ID}`, expect.objectContaining({ method: 'GET', credentials: 'same-origin' })],
    ]);
  });

  test('decodes local dates and canonical numeric(18,6) hectares without conversion', () => {
    expect(decodeMissionOperatingDay(operatingDay)).toEqual(operatingDay);
    expect(decodeMissionOperatingDays({ missionId: MISSION_ID, days: [operatingDay] })).toEqual({ missionId: MISSION_ID, days: [operatingDay] });
    expect(() => decodeMissionOperatingDay({ ...operatingDay, workDate: '2026-02-30' })).toThrow(expect.objectContaining({ code: 'MALFORMED_RESPONSE' }));
    expect(() => decodeMissionOperatingDay({ ...operatingDay, actualStartedAt: '2026-02-30T01:00:00.000Z' })).toThrow(expect.objectContaining({ code: 'MALFORMED_RESPONSE' }));
    expect(() => decodeMissionOperatingDay({ ...operatingDay, fieldActivities: [{ ...fieldActivity, hectaresAttempted: 1.25 }] })).toThrow(expect.objectContaining({ code: 'MALFORMED_RESPONSE' }));
    expect(() => decodeMissionOperatingDay({ ...operatingDay, fieldActivities: [{ ...fieldActivity, hectaresAttempted: '1.25' }] })).toThrow(expect.objectContaining({ code: 'MALFORMED_RESPONSE' }));
    expect(() => decodeMissionOperatingDay({ ...operatingDay, secret: 'must fail closed' })).toThrow(expect.objectContaining({ code: 'MALFORMED_RESPONSE' }));
  });

  test('sends exact operating-day commands with local dates and decimal strings', async () => {
    const fetcher = jest.fn().mockImplementation((url: string) => response(
      url.includes('action=days') ? { missionId: MISSION_ID, days: [operatingDay] } : operatingDay,
    ));
    const api = createMissionOperationsApi(fetcher as typeof fetch);
    await api.createDay(MISSION_ID, '2026-09-05', null);
    await api.reviewJsa(MISSION_ID, DAY_ID, 1, 'CONDITIONS_COVERED', 'Conditions unchanged.');
    await api.startDay(MISSION_ID, DAY_ID, 2, '2026-09-04T15:30:00.000Z');
    await api.saveFieldActivity(MISSION_ID, DAY_ID, null, 0, {
      fieldId: FIELD_A,
      hectaresAttempted: '1.250000',
      hectaresCompleted: '1.000000',
      startedAt: '2026-09-04T15:45:00.000Z',
      finishedAt: null,
      status: 'IN_PROGRESS',
      notes: null,
    });
    await api.completeDay(MISSION_ID, DAY_ID, 4, '2026-09-05T17:00:00.000Z', 'Overnight operation.');
    await api.readDays(MISSION_ID);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/mission-operations?action=day-create',
      '/api/v1/mission-operations?action=day-jsa-review',
      '/api/v1/mission-operations?action=day-start',
      '/api/v1/mission-operations?action=field-activity-save',
      '/api/v1/mission-operations?action=day-complete',
      `/api/v1/mission-operations?action=days&missionId=${MISSION_ID}`,
    ]);
    expect(JSON.parse(String(fetcher.mock.calls[3][1]?.body))).toEqual({
      missionId: MISSION_ID,
      dayId: DAY_ID,
      activityId: null,
      expectedVersion: 0,
      fieldId: FIELD_A,
      hectaresAttempted: '1.250000',
      hectaresCompleted: '1.000000',
      startedAt: '2026-09-04T15:45:00.000Z',
      finishedAt: null,
      status: 'IN_PROGRESS',
      notes: null,
    });
  });

  test('decodes aircraft-day totals and optional flights without numeric conversion', () => {
    expect(decodeMissionAircraftDayActuals(aircraftActuals)).toEqual(aircraftActuals);
    expect(() => decodeMissionAircraftDayActuals({ ...aircraftActuals, totalAircraftHours: 10 })).toThrow(expect.objectContaining({ code: 'MALFORMED_RESPONSE' }));
    expect(() => decodeMissionAircraftDayActuals({ ...aircraftActuals, totalAircraftHours: '10.00001' })).toThrow(expect.objectContaining({ code: 'MALFORMED_RESPONSE' }));
    expect(() => decodeMissionAircraftDayActuals({ ...aircraftActuals, actuals: [{ ...aircraftActuals.actuals[0], reconciliationStatus: 'CLOSE_ENOUGH' }] })).toThrow(expect.objectContaining({ code: 'MALFORMED_RESPONSE' }));
    expect(() => decodeMissionAircraftDayActuals({ ...aircraftActuals, hiddenAuthority: true })).toThrow(expect.objectContaining({ code: 'MALFORMED_RESPONSE' }));
  });

  test('sends exact aircraft actual commands and preserves null declared totals for flights-only entry', async () => {
    const fetcher = jest.fn().mockImplementation(() => response(aircraftActuals));
    const api = createMissionOperationsApi(fetcher as typeof fetch);
    const input = {
      missionId: MISSION_ID,
      expectedVersion: 4,
      totalAircraftHours: '10.0000',
      aircraftTotals: [{ aircraftId: AIRCRAFT_ID, totalFlightHours: null }],
      flights: [{ aircraftId: AIRCRAFT_ID, durationHours: '10.0000', startedAt: null, finishedAt: null, fieldId: null, sourceImportId: null }],
    };
    await api.saveAircraftActuals(DAY_ID, input);
    await api.readAircraftActuals(MISSION_ID, DAY_ID);
    await api.reconcileAircraftActuals(MISSION_ID, DAY_ID);
    expect(fetcher.mock.calls).toEqual([
      ['/api/v1/mission-operations?action=aircraft-actuals-save', expect.objectContaining({ method: 'POST', body: JSON.stringify({ ...input, dayId: DAY_ID }) })],
      [`/api/v1/mission-operations?action=aircraft-actuals&missionId=${MISSION_ID}&dayId=${DAY_ID}`, expect.objectContaining({ method: 'GET' })],
      ['/api/v1/mission-operations?action=aircraft-actuals-reconcile', expect.objectContaining({ method: 'POST', body: JSON.stringify({ missionId: MISSION_ID, dayId: DAY_ID }) })],
    ]);
  });
});
