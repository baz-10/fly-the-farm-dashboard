const fs = require('fs');
const path = require('path');

const migrationPath = path.resolve(
  __dirname,
  '../../supabase/migrations/20260801003000_trusted_operational_parent_guards.sql'
);

test('parent-guard migration locks active tenant parents inside the operational write RPC', () => {
  const migration = fs.readFileSync(migrationPath, 'utf8').replace(/\s+/g, ' ').toLowerCase();

  expect(migration).toContain('create or replace function public.ftf_write_operational_resource');
  expect(migration).toContain("p_resource = 'properties'");
  expect(migration).toContain("p_resource = 'fields'");
  expect(migration).toContain("p_resource = 'jobs'");
  expect(migration).toContain("p_resource = 'missions'");
  expect(migration).toContain('archived_at is null for update');
  expect(migration).toContain("relationship_conflict");
});
