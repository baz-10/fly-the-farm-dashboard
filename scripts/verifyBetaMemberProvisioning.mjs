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
  '20260801014000_production_beta_member_provisioning.sql',
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
  await db.exec(`insert into auth.users (id) values
    ('00000000-0000-0000-0000-000000000011'),
    ('00000000-0000-0000-0000-000000000012');`);
  const bootstrap = await db.query(`select public.ftf_bootstrap_production_beta_organisation(
    '00000000-0000-0000-0000-000000000011',
    'Fly The Farm', 'Product Owner', 'Fly The Farm Base', 'Queensland', 'Australia/Brisbane'
  ) as result;`);
  const organisationId = bootstrap.rows[0].result.organisation_id;
  const locationId = bootstrap.rows[0].result.operating_location_id;

  const first = await db.query(`select public.ftf_provision_production_beta_member(
    '00000000-0000-0000-0000-000000000012', $1, 'Operations User', $2
  ) as result;`, [organisationId, locationId]);
  const second = await db.query(`select public.ftf_provision_production_beta_member(
    '00000000-0000-0000-0000-000000000012', $1, 'Operations User', $2
  ) as result;`, [organisationId, locationId]);

  if (first.rows[0]?.result?.already_provisioned !== false
      || second.rows[0]?.result?.already_provisioned !== true
      || first.rows[0]?.result?.internal_user_id !== second.rows[0]?.result?.internal_user_id) {
    throw new Error('member provisioning is not idempotent');
  }

  const counts = await db.query(`
    select
      (select count(*)::int from public.internal_users) as internal_users,
      (select count(*)::int from public.memberships) as memberships,
      (select allocated_seats from public.organisation_seat_allocations where organisation_id = $1) as allocated_seats,
      (select count(*)::int from public.internal_user_seat_assignments where status = 'active') as seats,
      (select count(*)::int from public.membership_operating_location_assignments where is_active = true) as location_assignments,
      (select count(*)::int from public.ftf_profiles where tenant_id = $1 and role = 'admin' and tier = 'beta') as profiles,
      (select count(*)::int from public.audit_events where event_type = 'beta_member.provisioned') as audits,
      (select count(*)::int from public.transactional_outbox where topic = 'platform.beta_member.provisioned') as outbox;
  `, [organisationId]);
  const expected = {
    internal_users: 2, memberships: 2, allocated_seats: 2, seats: 2,
    location_assignments: 2, profiles: 2, audits: 1, outbox: 1,
  };
  if (JSON.stringify(counts.rows[0]) !== JSON.stringify(expected)) {
    throw new Error(`member provisioning counts invalid: ${JSON.stringify(counts.rows[0])}`);
  }
} finally {
  await db.close();
}
