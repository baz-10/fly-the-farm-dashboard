const fs = require('fs');
const path = require('path');

const migration = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/20260802024000_authoritative_personnel.sql'), 'utf8');

test('Personnel migration defines tenant-owned identity, qualifications, evidence, and immutable Mission snapshots', () => {
  for (const table of ['personnel', 'personnel_operating_locations', 'personnel_operational_roles', 'personnel_credentials', 'personnel_evidence', 'mission_personnel_revisions', 'mission_personnel_assignments']) {
    expect(migration).toContain(`create table public.${table}`);
  }
  expect(migration).toContain('foreign key(organisation_id,personnel_id)');
  expect(migration).toContain('internal_file_id uuid not null');
  expect(migration).toContain('personnel_snapshot jsonb not null');
  expect(migration).toContain('force row level security');
});

test('Personnel writes and Mission assignment use permissions, versions, location checks, audit, and outbox', () => {
  for (const permission of ['personnel.read', 'personnel.create', 'personnel.update', 'personnel.archive', 'personnel.assign', 'personnel.private.read']) {
    expect(migration).toContain(`'${permission}'`);
  }
  expect(migration).toContain('p_expected_version');
  expect(migration).toContain('personnel_operating_locations');
  expect(migration).toContain('membership_operating_location_assignments');
  expect(migration).toContain('audit_events');
  expect(migration).toContain('transactional_outbox');
  expect(migration).toContain('PIC_CREDENTIAL_INVALID');
});

test('Personnel RPC surface is explicit and direct authenticated writes remain revoked', () => {
  for (const rpc of ['ftf_list_personnel', 'ftf_write_personnel', 'ftf_link_personnel_member', 'ftf_write_personnel_credential', 'ftf_write_personnel_evidence', 'ftf_read_mission_personnel', 'ftf_save_mission_personnel']) {
    expect(migration).toContain(`function public.${rpc}`);
  }
  expect(migration).toContain('revoke all on table public.%I from public,anon,authenticated');
});
