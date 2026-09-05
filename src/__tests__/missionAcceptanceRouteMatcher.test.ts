import { isExactControlledScopeBody } from '../../e2e/mission/fixtures/missionScopeRequest';

const missionId = '10000000-0000-4000-8000-000000000001';
const fieldIds = [
  '20000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000003',
];

test('accepts only the exact controlled scope command body', () => {
  expect(isExactControlledScopeBody({ missionId, expectedRevision: 7, fieldIds }, {
    missionId, expectedRevision: 7, fieldIds,
  })).toBe(true);

  for (const body of [
    { missionId: '40000000-0000-4000-8000-000000000004', expectedRevision: 7, fieldIds },
    { missionId, expectedRevision: 8, fieldIds },
    { missionId, expectedRevision: 7, fieldIds: fieldIds.slice(0, 1) },
    { missionId, expectedRevision: 7, fieldIds: [...fieldIds].reverse() },
    { missionId, expectedRevision: 7, fieldIds, extra: true },
    { missionId, expectedRevision: 7 },
    null,
  ]) {
    expect(isExactControlledScopeBody(body, { missionId, expectedRevision: 7, fieldIds })).toBe(false);
  }
});
