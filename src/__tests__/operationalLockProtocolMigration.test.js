const fs = require('fs');
const path = require('path');

const migrationPath = path.resolve(
  __dirname,
  '../../supabase/migrations/20260801004000_trusted_operational_lock_protocol.sql'
);

test('lock-protocol migration acquires one transaction-scoped organisation lock before row locks', () => {
  const migration = fs.readFileSync(migrationPath, 'utf8').replace(/\s+/g, ' ').toLowerCase();

  expect(migration).toContain('create function public.ftf_write_operational_resource');
  expect(migration).toContain('pg_advisory_xact_lock');
  expect(migration).toContain('p_organisation_id');
  expect(migration).toContain('before row-level target and parent locks');
});
