import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const migrationNames = [
  '20260801000000_production_beta_foundation.sql',
  '20260801001000_trusted_operational_api_writes.sql',
  '20260801002000_trusted_operational_api_corrections.sql',
  '20260801003000_trusted_operational_parent_guards.sql',
  '20260801004000_trusted_operational_lock_protocol.sql',
  '20260801005000_property_state.sql',
];
const accessMigrationPath = resolve(scriptDirectory, '../supabase/migrations/20260801006000_live_chain_access_prerequisites.sql');

async function expectRejected(db, label, sql) {
  try {
    await db.exec(sql);
  } catch {
    return;
  }
  throw new Error(`${label} was accepted`);
}

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
  for (const migrationName of migrationNames) {
    await db.exec(await readFile(resolve(scriptDirectory, `../supabase/migrations/${migrationName}`), 'utf8'));
  }

  // This member exists before the forward migration and must not be stranded.
  await db.exec(`
    insert into auth.users (id) values
      ('00000000-0000-0000-0000-000000000011'),
      ('00000000-0000-0000-0000-000000000022');
    insert into public.organisations (id, organisation_id, name) values
      ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Organisation one'),
      ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'Organisation two');
    insert into public.internal_users (id, organisation_id, auth_user_id, display_name) values
      ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'Operator one'),
      ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000022', 'Operator two');
    insert into public.roles (id, organisation_id, code, name) values
      ('00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-000000000001', 'operator', 'Operator'),
      ('00000000-0000-0000-0000-000000000222', '00000000-0000-0000-0000-000000000002', 'operator', 'Operator');
    insert into public.memberships (id, organisation_id, internal_user_id, role_id) values
      ('00000000-0000-0000-0000-000000000121', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000111'),
      ('00000000-0000-0000-0000-000000000232', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000222');
    insert into public.operating_locations (id, organisation_id, name) values
      ('00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000000001', 'Operations base'),
      ('00000000-0000-0000-0000-000000001002', '00000000-0000-0000-0000-000000000002', 'Other tenant base');
  `);

  await db.exec(await readFile(accessMigrationPath, 'utf8'));

  const migratedAccess = await db.query(`
    select
      (select allocated_seats from public.organisation_seat_allocations where organisation_id = '00000000-0000-0000-0000-000000000001') as allocated_seats,
      (select status from public.internal_user_seat_assignments where internal_user_id = '00000000-0000-0000-0000-000000000101') as seat_status,
      (select count(*)::integer from public.membership_operating_location_assignments where membership_id = '00000000-0000-0000-0000-000000000121' and operating_location_id = '00000000-0000-0000-0000-000000001001') as location_count,
      (select count(*)::integer from public.audit_events where organisation_id = '00000000-0000-0000-0000-000000000001' and event_type = 'beta_access.migrated') as audit_count,
      (select count(*)::integer from public.transactional_outbox where organisation_id = '00000000-0000-0000-0000-000000000001' and topic = 'operational.beta_access.migrated') as outbox_count;
  `);
  const migrated = migratedAccess.rows[0];
  if (migrated.allocated_seats !== 1 || migrated.seat_status !== 'active' || migrated.location_count !== 1 || migrated.audit_count !== 1 || migrated.outbox_count !== 1) {
    throw new Error('existing active beta member did not receive traceable seat and location access');
  }

  const locationWrite = await db.query(`select public.ftf_write_operational_resource(
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000101',
    'operating_locations', 'create', null, null,
    '{"name":"Northern base","address":"2 Airstrip Rd","timezone":"Australia/Brisbane"}'::jsonb
  ) as result;`);
  const createdLocationId = locationWrite.rows[0]?.result?.record?.id;
  if (!createdLocationId || locationWrite.rows[0]?.result?.record?.name !== 'Northern base') {
    throw new Error('trusted operating-location create did not return its record');
  }
  const locationAtomicity = await db.query(`
    select
      (select count(*)::integer from public.audit_events where event_type = 'operating_locations.create' and entity_id = '${createdLocationId}') as audit_count,
      (select count(*)::integer from public.transactional_outbox where topic = 'operational.operating_locations.create' and aggregate_id = '${createdLocationId}') as outbox_count;
  `);
  if (locationAtomicity.rows[0].audit_count !== 1 || locationAtomicity.rows[0].outbox_count !== 1) {
    throw new Error('operating-location write did not atomically create audit and outbox rows');
  }

  const crossOrganisationLocation = await db.query(`select public.ftf_write_operational_resource(
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101',
    'operating_locations', 'update', '00000000-0000-0000-0000-000000001002', 1,
    '{"name":"Tenant escape","timezone":"Australia/Brisbane"}'::jsonb
  ) as result;`);
  if (crossOrganisationLocation.rows[0]?.result?.not_found !== true) {
    throw new Error('cross-organisation operating-location update was not hidden');
  }

  // A member added after migration remains denied until the controlled seed.
  await db.exec(`
    insert into auth.users (id) values ('00000000-0000-0000-0000-000000000033');
    insert into public.internal_users (id, organisation_id, auth_user_id, display_name)
      values ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000033', 'Operator three');
    insert into public.memberships (id, organisation_id, internal_user_id, role_id)
      values ('00000000-0000-0000-0000-000000000343', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000111');
  `);
  await expectRejected(db, 'unseeded actor trusted write', `select public.ftf_write_operational_resource(
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000303',
    'clients', 'create', null, null, '{"name":"Denied"}'::jsonb
  );`);
  const controlledSeed = await db.query(`select public.ftf_seed_internal_beta_access(
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101'
  ) as result;`);
  if (controlledSeed.rows[0]?.result?.allocated_seats !== 2 || controlledSeed.rows[0]?.result?.seat_assignments !== 2) {
    throw new Error('controlled beta seed did not allocate explicit active seats');
  }
  const seededActorWrite = await db.query(`select public.ftf_write_operational_resource(
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000303',
    'clients', 'create', null, null, '{"name":"Seeded actor client"}'::jsonb
  ) as result;`);
  if (seededActorWrite.rows[0]?.result?.record?.name !== 'Seeded actor client') {
    throw new Error('controlled beta seed did not enable the new internal member');
  }

  await db.exec(`update public.internal_user_seat_assignments set status = 'revoked', revoked_at = now() where internal_user_id = '00000000-0000-0000-0000-000000000303';`);
  await expectRejected(db, 'revoked-seat actor trusted write', `select public.ftf_write_operational_resource(
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000303',
    'clients', 'create', null, null, '{"name":"Revoked actor"}'::jsonb
  );`);

  await db.exec(`
    insert into public.clients (id, organisation_id, name) values
      ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000001', 'Client');
    insert into public.properties (id, organisation_id, client_id, name, state) values
      ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000401', 'Property', 'QLD');
    insert into public.jobs (id, organisation_id, client_id, property_id, reference) values
      ('00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000501', 'JOB-ACCESS');
    insert into public.missions (id, organisation_id, job_id, operating_location_id, mission_number, status) values
      ('00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000001001', 'M-ACCESS', 'planning');
  `);
  const archiveDependency = await db.query(`select public.ftf_write_operational_resource(
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101',
    'operating_locations', 'archive', '00000000-0000-0000-0000-000000001001', 1, '{}'::jsonb
  ) as result;`);
  if (archiveDependency.rows[0]?.result?.archive_conflict !== true) {
    throw new Error('operating-location archive accepted an active mission dependency');
  }

  await db.exec('set role authenticated;');
  await expectRejected(db, 'authenticated seat assignment DML', `update public.internal_user_seat_assignments set status = 'active';`);
  await expectRejected(db, 'authenticated operating-location DML', `insert into public.operating_locations (organisation_id, name) values ('00000000-0000-0000-0000-000000000001', 'Browser location');`);
  await db.exec('reset role;');
} finally {
  await db.close();
}
