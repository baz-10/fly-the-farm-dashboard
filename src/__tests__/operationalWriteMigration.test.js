const fs = require('fs');
const path = require('path');

const migrationPath = path.resolve(
  __dirname,
  '../../supabase/migrations/20260801001000_trusted_operational_api_writes.sql'
);

test('repository-owned operational write RPC atomically writes audit and outbox records', () => {
  const migration = fs.readFileSync(migrationPath, 'utf8').replace(/\s+/g, ' ').toLowerCase();

  expect(migration).toContain('create or replace function public.ftf_write_operational_resource');
  expect(migration).toContain('p_expected_version integer');
  expect(migration).toContain('insert into public.audit_events');
  expect(migration).toContain('insert into public.transactional_outbox');
  expect(migration).toContain('grant execute on function public.ftf_write_operational_resource');
  expect(migration).toContain('to service_role');
  expect(migration).not.toContain('to authenticated');
});
