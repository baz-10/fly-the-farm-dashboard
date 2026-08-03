const fs = require('fs');
const path = require('path');

const migrationPath = path.join(__dirname, '../../supabase/migrations/20260803020000_personnel_identity_resolution.sql');

test('identity resolution migration defines explicit permission and authoritative RPCs', () => {
  const migration = fs.readFileSync(migrationPath, 'utf8');
  expect(migration).toContain("'personnel.identity.manage'");
  for (const rpc of ['ftf_list_personnel_identity_candidates', 'ftf_link_personnel_identity', 'ftf_unlink_personnel_identity']) {
    expect(migration).toContain(`function public.${rpc}`);
  }
  expect(migration).toContain('ftf_actor_has_permission');
});

test('identity changes require reason, version, administrator permission, audit and outbox', () => {
  const migration = fs.readFileSync(migrationPath, 'utf8');
  expect(migration).toContain('p_expected_version integer');
  expect(migration).toContain('p_reason text');
  expect(migration).toContain("PERSONNEL_IDENTITY_FORBIDDEN");
  expect(migration).toContain("PERSONNEL_IDENTITY_REASON_REQUIRED");
  expect(migration).toContain("'personnel.identity_linked'");
  expect(migration).toContain("'personnel.identity_unlinked'");
  expect(migration).toContain("'operational.personnel.identity_linked'");
  expect(migration).toContain("'operational.personnel.identity_unlinked'");
  expect(migration).toContain("'previous_state'");
  expect(migration).toContain("'new_state'");
});

test('candidate comparison includes duplicate indicators and never mutates mission history', () => {
  const migration = fs.readFileSync(migrationPath, 'utf8');
  for (const signal of ['NAME', 'EMAIL', 'PHONE', 'LICENCE_NUMBER', 'ARN', 'EMPLOYEE_NUMBER']) {
    expect(migration).toContain(`'${signal}'`);
  }
  expect(migration).not.toMatch(/update public\.mission_(personnel|jsa)/);
  expect(migration).not.toMatch(/delete from public\.mission_(personnel|jsa)/);
  expect(migration).toContain('force row level security');
});
