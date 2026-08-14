const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/productionPrivilegeProvenance.sql'),
  'utf8',
);

test('captures direct, inherited, default and effective ftf_store privilege provenance read-only', () => {
  for (const token of [
    'public.ftf_store', 'service_role', 'anon', 'authenticated',
    'with recursive', 'pg_auth_members', 'pg_default_acl', 'aclexplode', 'has_table_privilege',
    'rolinherit', 'rolsuper', 'direct ACL mismatch', 'effective privilege mismatch',
    'acl.grantee=0', 'PUBLIC direct privilege present',
    'PRE_CORRECTION', 'POST_CORRECTION', 'partial privilege reconciliation',
    "defaclobjtype='r'", "nspname='public'", "defaclrole",
    'maintain', 'truncate', 'references', 'trigger',
  ]) expect(sql.toLowerCase()).toContain(token.toLowerCase());
  expect(sql.toLowerCase()).not.toContain("has_table_privilege('public'");
  expect(sql).toMatch(/v_direct_maintain\s+is\s+distinct\s+from\s+v_default_maintain/i);
  expect(sql).not.toMatch(/(?:^|\n)\s*(insert|update|delete|truncate\s+table|alter|create|drop|grant|revoke)\b/i);
});
