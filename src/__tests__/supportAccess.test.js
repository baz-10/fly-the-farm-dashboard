const { evaluateSupportAccess } = require('../../server/support-access');

const active = {
  id: 'session-1', organisationId: 'org-1', state: 'ACTIVE', accessMode: 'READ_ONLY',
  scopeType: 'MISSION', missionId: 'mission-1', expiresAt: '2026-08-04T05:00:00.000Z',
};

test('allows only the approved mode and scope before expiry', () => {
  expect(evaluateSupportAccess({ session: active, operation: 'READ', organisationId: 'org-1', missionId: 'mission-1', now: '2026-08-04T04:00:00.000Z' })).toEqual({ allowed: true, denialCode: null });
  expect(evaluateSupportAccess({ session: active, operation: 'WRITE', organisationId: 'org-1', missionId: 'mission-1', now: '2026-08-04T04:00:00.000Z' })).toEqual({ allowed: false, denialCode: 'SUPPORT_READ_ONLY' });
  expect(evaluateSupportAccess({ session: active, operation: 'READ', organisationId: 'org-1', missionId: 'mission-2', now: '2026-08-04T04:00:00.000Z' })).toEqual({ allowed: false, denialCode: 'SUPPORT_SCOPE_MISMATCH' });
  expect(evaluateSupportAccess({ session: active, operation: 'READ', organisationId: 'org-1', missionId: 'mission-1', now: '2026-08-04T05:00:00.000Z' })).toEqual({ allowed: false, denialCode: 'SUPPORT_SESSION_EXPIRED' });
});

test('never treats break glass as ordinary support', () => {
  expect(evaluateSupportAccess({ session: { ...active, scopeType: 'BREAK_GLASS' }, operation: 'READ', organisationId: 'org-1', now: '2026-08-04T04:00:00.000Z' })).toEqual({ allowed: false, denialCode: 'SUPPORT_SCOPE_MISMATCH' });
});
