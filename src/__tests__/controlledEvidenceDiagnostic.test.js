const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/controlledEvidenceDiagnostic.sql'),
  'utf8',
);

test('reports the bounded record-level controlled-evidence inventory read-only', () => {
  for (const token of [
    'SC_ACCEPTANCE_INVENTORY_V1', 'applicationId', 'applicationReference',
    'invitationId', 'resultingOrganisationId', 'acceptedByAuthUserId',
    'resultingInternalUserId', 'resultingMembershipId',
    'resultingOperatingLocationId', 'organisationId', 'archivedAt',
    'internalUsers', 'memberships', 'operatingLocations', 'seatAllocations',
    'seatAssignments', 'locationAssignments', 'auditEvents', 'outboxEvents',
    'operationalCounts', 'payloadKeys',
  ]) expect(sql).toContain(token);
  expect(sql).not.toMatch(/(?:^|\n)\s*(insert|update|delete|truncate|alter|create|drop|grant|revoke)\b/i);
  expect(sql).not.toMatch(/intended_administrator_(?:email|phone|name)|token_hash|event_payload\s+as|submitted_payload\s+as/i);
  expect(sql).toMatch(/jsonb_object_keys\(application\.submitted_payload\)/);
  expect(sql).toMatch(/where application\.business_name like 'SC ACCEPTANCE — %'/);
});
