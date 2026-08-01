import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const migrationPath = resolve(
  scriptDirectory,
  '../supabase/migrations/20260801000000_production_beta_foundation.sql'
);
const operationalWriteMigrationPath = resolve(
  scriptDirectory,
  '../supabase/migrations/20260801001000_trusted_operational_api_writes.sql'
);

async function expectRejected(db, label, sql) {
  try {
    await db.exec(sql);
  } catch {
    return;
  }
  throw new Error(`${label} was accepted`);
}

const migration = await readFile(migrationPath, 'utf8');
const operationalWriteMigration = await readFile(operationalWriteMigrationPath, 'utf8');
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
  await db.exec(migration);
  await db.exec(operationalWriteMigration);

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
    insert into public.memberships (organisation_id, internal_user_id, role_id) values
      ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000111'),
      ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000222');
    insert into public.clients (id, organisation_id, name) values
      ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000001', 'Client one'),
      ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000001', 'Client two'),
      ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000002', 'Client three');
    insert into public.properties (id, organisation_id, client_id, name) values
      ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000301', 'Property one'),
      ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000302', 'Property two');
    insert into public.field_boundary_versions (id, organisation_id, property_id, version_number, boundary_geojson) values
      ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000401', 1, '{}'::jsonb),
      ('00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000402', 1, '{}'::jsonb);
    insert into public.fields (id, organisation_id, property_id, field_boundary_version_id, name) values
      ('00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000501', 'Field one'),
      ('00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000502', 'Field two');
    insert into public.jobs (id, organisation_id, client_id, property_id, reference) values
      ('00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000401', 'JOB-001');
  `);

  await expectRejected(
    db,
    'cross-tenant client assignment',
    `insert into public.properties (id, organisation_id, client_id, name) values ('00000000-0000-0000-0000-000000000403', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000303', 'Invalid property');`
  );
  await expectRejected(
    db,
    'job client/property mismatch',
    `insert into public.jobs (id, organisation_id, client_id, property_id, reference) values ('00000000-0000-0000-0000-000000000702', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000402', 'JOB-002');`
  );
  await expectRejected(
    db,
    'field boundary/property mismatch',
    `insert into public.fields (id, organisation_id, property_id, field_boundary_version_id, name) values ('00000000-0000-0000-0000-000000000603', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000502', 'Invalid field');`
  );
  await expectRejected(
    db,
    'job field/property mismatch',
    `insert into public.job_fields (id, organisation_id, property_id, job_id, field_id) values ('00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000602');`
  );
  await expectRejected(
    db,
    'cross-tenant archive actor',
    `update public.clients set archived_at = now(), archived_by_internal_user_id = '00000000-0000-0000-0000-000000000202' where id = '00000000-0000-0000-0000-000000000301';`
  );

  await db.exec(`
    insert into public.audit_events (id, organisation_id, actor_internal_user_id, event_type, entity_type) values
      ('00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101', 'created', 'job');
    insert into public.transactional_outbox (id, organisation_id, topic, aggregate_type, aggregate_id, payload) values
      ('00000000-0000-0000-0000-000000000902', '00000000-0000-0000-0000-000000000001', 'job.created', 'job', '00000000-0000-0000-0000-000000000701', '{}'::jsonb);
  `);
  await expectRejected(
    db,
    'audit event update',
    `update public.audit_events set event_type = 'changed' where id = '00000000-0000-0000-0000-000000000901';`
  );
  await expectRejected(
    db,
    'transactional outbox delete',
    `delete from public.transactional_outbox where id = '00000000-0000-0000-0000-000000000902';`
  );

  const writeResult = await db.query(
    `select public.ftf_write_operational_resource(
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000101',
      'clients', 'create', null, null,
      '{"name":"Atomic client"}'::jsonb
    ) as result;`
  );
  if (writeResult.rows[0]?.result?.record?.name !== 'Atomic client') {
    throw new Error('trusted operational write did not return its record');
  }
  const atomicRows = await db.query(`
    select
      (select count(*)::int from public.audit_events where event_type = 'clients.create') as audit_count,
      (select count(*)::int from public.transactional_outbox where topic = 'operational.clients.create') as outbox_count;
  `);
  if (atomicRows.rows[0].audit_count !== 1 || atomicRows.rows[0].outbox_count !== 1) {
    throw new Error('trusted operational write did not atomically create audit and outbox rows');
  }
} finally {
  await db.close();
}
