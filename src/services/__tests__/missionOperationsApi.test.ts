import {
  createMissionOperationsApi,
  decodeCrpDecision,
  decodeMissionPackageHistory,
  decodeMissionPackageRevision,
} from '../missionOperationsApi';

const MISSION_ID = '11111111-1111-4111-8111-111111111111';
const PACKAGE_ID = '22222222-2222-4222-8222-222222222222';
const JSA_ID = '33333333-3333-4333-8333-333333333333';
const FIELD_A = '44444444-4444-4444-8444-444444444444';
const FIELD_B = '55555555-5555-4555-8555-555555555555';
const DECISION_ID = '66666666-6666-4666-8666-666666666666';
const ACTOR_ID = '77777777-7777-4777-8777-777777777777';
const DIGEST = 'a'.repeat(64);

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
});
