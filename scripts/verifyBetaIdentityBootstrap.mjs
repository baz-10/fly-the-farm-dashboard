import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const migrationNames = [
  '20260801000000_production_beta_foundation.sql',
  '20260801006000_live_chain_access_prerequisites.sql',
  '20260801012000_legacy_runtime_dependencies.sql',
  '20260801013000_production_beta_identity_bootstrap.sql',
];
const migrations = await Promise.all(migrationNames.map((name) =>
  readFile(resolve(scriptDirectory, `../supabase/migrations/${name}`), 'utf8')
));
const db = new PGlite();

try {
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid; $$;
    create role anon;
    create role authenticated;
    create role service_role;
  `);
  for (const migration of migrations) await db.exec(migration);
  await db.exec(`insert into auth.users (id) values ('00000000-0000-0000-0000-000000000011');`);

  const first = await db.query(`select public.ftf_bootstrap_production_beta_organisation(
    '00000000-0000-0000-0000-000000000011',
    'Fly The Farm', 'Product Owner', 'Fly The Farm Base', 'Queensland', 'Australia/Brisbane'
  ) as result;`);
  const second = await db.query(`select public.ftf_bootstrap_production_beta_organisation(
    '00000000-0000-0000-0000-000000000011',
    'Fly The Farm', 'Product Owner', 'Fly The Farm Base', 'Queensland', 'Australia/Brisbane'
  ) as result;`);
  if (first.rows[0]?.result?.already_provisioned !== false
      || second.rows[0]?.result?.already_provisioned !== true
      || first.rows[0]?.result?.organisation_id !== second.rows[0]?.result?.organisation_id) {
    throw new Error('identity bootstrap is not idempotent');
  }

  const counts = await db.query(`
    select
      (select count(*)::int from public.organisations) as organisations,
      (select count(*)::int from public.operating_locations) as locations,
      (select count(*)::int from public.internal_users) as internal_users,
      (select count(*)::int from public.memberships) as memberships,
      (select count(*)::int from public.organisation_seat_allocations where allocated_seats = 1) as allocations,
      (select count(*)::int from public.internal_user_seat_assignments where status = 'active') as seats,
      (select count(*)::int from public.membership_operating_location_assignments where is_active = true) as location_assignments,
      (select count(*)::int from public.ftf_profiles where role = 'admin' and tier = 'beta') as profiles,
      (select count(*)::int from public.audit_events where event_type = 'beta_identity.provisioned') as audits,
      (select count(*)::int from public.transactional_outbox where topic = 'platform.beta_identity.provisioned') as outbox;
  `);
  const expectedCounts = Object.fromEntries(Object.keys(counts.rows[0]).map((key) => [key, 1]));
  if (JSON.stringify(counts.rows[0]) !== JSON.stringify(expectedCounts)) {
    throw new Error(`identity bootstrap counts invalid: ${JSON.stringify(counts.rows[0])}`);
  }

  const permissionCount = await db.query(`
    select count(*)::int as count
    from public.role_permissions rp
    join public.permissions p on p.organisation_id = rp.organisation_id and p.id = rp.permission_id
    where p.code in (
      'operating_locations.read', 'operating_locations.create', 'operating_locations.update', 'operating_locations.archive',
      'clients.read', 'clients.create', 'clients.update', 'clients.archive',
      'properties.read', 'properties.create', 'properties.update', 'properties.archive',
      'fields.read', 'fields.create', 'fields.update', 'fields.archive',
      'jobs.read', 'jobs.create', 'jobs.update', 'jobs.archive',
      'missions.read', 'missions.create', 'missions.update', 'missions.archive',
      'field_boundary_versions.read', 'field_boundary_versions.create'
    );
  `);
  if (permissionCount.rows[0]?.count !== 26) throw new Error('bootstrap role lacks required operational permissions');
} finally {
  await db.close();
}
