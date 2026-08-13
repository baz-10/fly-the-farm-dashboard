const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/controlledEvidenceDiagnostic.sql'),
  'utf8',
);

test('reports only bounded controlled-evidence counts and status sequences read-only', () => {
  for (const token of [
    'archiveAuditCount', 'archiveOutboxCount', 'controlledStoreRecordCount',
    'applicationStatuses', 'invitationStatuses', 'acceptanceAuditCount',
    'replacementApplicationCount', 'replacementInvitationCount',
    'replacementOrganisationCount',
  ]) expect(sql).toContain(token);
  expect(sql).not.toMatch(/(?:^|\n)\s*(insert|update|delete|truncate|alter|create|drop|grant|revoke)\b/i);
  expect(sql).not.toMatch(/email|phone|payload/i);
});
