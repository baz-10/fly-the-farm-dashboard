const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/defaultMaintainPrivilegeDiagnostic.sql'),
  'utf8',
);

test('reports exact default MAINTAIN provenance without mutation', () => {
  for (const token of [
    'pg_default_acl', 'aclexplode', 'defaclrole', 'defaclnamespace', 'defaclobjtype',
    'grantee', 'grantor', 'privilege_type', 'is_grantable', 'exact_acl',
    'pg_auth_members', 'serviceRoleEffectiveMaintain', 'targetExactAcl',
  ]) expect(sql).toContain(token);
  expect(sql).not.toMatch(/(?:^|\n)\s*(insert|update|delete|truncate\s+table|alter|create|drop|grant|revoke)\b/i);
});
