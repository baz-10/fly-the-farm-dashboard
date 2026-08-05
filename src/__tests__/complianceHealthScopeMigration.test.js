const fs = require('fs');
const path = require('path');

const migrationPath = path.join(__dirname, '../../supabase/migrations/20260805171000_compliance_health_scope.sql');

test('projection excludes aircraft outside the authorised operating locations', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  expect(sql).toContain('p_operating_location_ids uuid[]');
  expect(sql).toMatch(/a\.operating_location_id\s*=\s*any\(p_operating_location_ids\)/);
});

test('projection omits restricted personnel records and counts without authority', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  expect(sql).toContain('p_include_restricted boolean');
  expect(sql).toMatch(/where p_include_restricted and pc\.organisation_id=p_organisation_id/);
  expect(sql).toMatch(/case when p_include_restricted then jsonb_build_object\('restricted',false,[\s\S]*else jsonb_build_object\('restricted',true\) end/);
  expect(sql).toMatch(/'training',case when p_include_restricted/);
  expect(sql).toMatch(/'legalHolds',case when p_include_restricted/);
});
