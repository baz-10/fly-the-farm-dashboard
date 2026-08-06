const fs = require('fs');
const path = require('path');

const migrationPath = path.join(__dirname, '../../supabase/migrations/20260806200000_production_beta_acceptance_identity.sql');

function migration() {
  return fs.readFileSync(migrationPath, 'utf8');
}

test('provisions one fail-closed Fly The Farm acceptance identity with an exact permission allowlist', () => {
  const sql = migration();
  expect(sql).toContain("'production_beta_acceptance'");
  expect(sql).toContain("'info@flythefarm.com.au'");
  for (const permission of [
    'operating_locations.read',
    'clients.read', 'clients.create', 'clients.archive',
    'properties.read', 'properties.create', 'properties.archive',
    'fields.read', 'fields.create', 'fields.archive',
    'field_boundary_versions.read', 'field_boundary_versions.create',
    'jobs.read', 'jobs.create', 'jobs.archive',
    'missions.read', 'missions.create', 'missions.archive',
  ]) expect(sql).toContain(`'${permission}'`);
  expect(sql).toContain('ACCEPTANCE_IDENTITY_NOT_UNIQUE');
  expect(sql).toContain('ACCEPTANCE_ORGANISATION_NOT_UNIQUE');
  expect(sql).toContain('ACCEPTANCE_LOCATION_REQUIRED');
});

test('removes unrelated role grants and creates no Platform, Personnel or administrator assignment', () => {
  const sql = migration();
  expect(sql).toContain('delete from public.role_permissions');
  expect(sql).not.toMatch(/insert\s+into\s+public\.platform_users/i);
  expect(sql).not.toMatch(/insert\s+into\s+public\.platform_user_roles/i);
  expect(sql).not.toMatch(/insert\s+into\s+public\.personnel/i);
  expect(sql).not.toMatch(/role[^;]+admin/i);
});

test('reconciliation is idempotent and retains normal membership, seat, location, audit and outbox attribution', () => {
  const sql = migration();
  expect(sql).toContain('on conflict (organisation_id, internal_user_id)');
  expect(sql).toContain('on conflict (organisation_id, membership_id, operating_location_id)');
  expect(sql).toContain("'production_beta_acceptance.reconciled'");
  expect(sql).toContain("'organisation.production_beta_acceptance.reconciled'");
});
