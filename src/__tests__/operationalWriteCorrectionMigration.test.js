const fs = require('fs');
const path = require('path');

const migrationPath = path.resolve(
  __dirname,
  '../../supabase/migrations/20260801002000_trusted_operational_api_corrections.sql'
);

test('corrective migration revokes browser DML and makes write and archive checks authoritative', () => {
  const migration = fs.readFileSync(migrationPath, 'utf8').replace(/\s+/g, ' ').toLowerCase();

  ['clients', 'properties', 'field_boundary_versions', 'fields', 'jobs', 'job_fields', 'missions', 'mission_versions'].forEach((table) => {
    expect(migration).toContain(`revoke all on table public.${table} from anon, authenticated`);
  });
  expect(migration).toContain('row_version = p_expected_version');
  expect(migration).toContain('for update');
  expect(migration).toContain("p_resource = 'clients'");
  expect(migration).toContain("p_resource = 'missions'");
});
