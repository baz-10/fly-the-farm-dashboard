import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const directory = dirname(fileURLToPath(import.meta.url));
const migrationNames = [
  '20260801000000_production_beta_foundation.sql',
  '20260801001000_trusted_operational_api_writes.sql',
  '20260801002000_trusted_operational_api_corrections.sql',
  '20260801003000_trusted_operational_parent_guards.sql',
  '20260801004000_trusted_operational_lock_protocol.sql',
  '20260801005000_property_state.sql',
  '20260806180000_archive_parent_with_historical_boundaries.sql',
];
const migrations = await Promise.all(migrationNames.map((name) => readFile(resolve(directory, '../supabase/migrations', name), 'utf8')));
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
  await db.exec(`
    insert into auth.users(id) values ('00000000-0000-0000-0000-000000000011');
    insert into public.organisations(id,organisation_id,name) values ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Acceptance org');
    insert into public.internal_users(id,organisation_id,auth_user_id,display_name) values ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011','Operator');
    insert into public.roles(id,organisation_id,code,name) values ('00000000-0000-0000-0000-000000000111','00000000-0000-0000-0000-000000000001','operator','Operator');
    insert into public.memberships(organisation_id,internal_user_id,role_id) values ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000111');
    insert into public.clients(id,organisation_id,name) values ('00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-000000000001','Client');
    insert into public.properties(id,organisation_id,client_id,name,state) values
      ('00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000301','Historical boundary only','QLD'),
      ('00000000-0000-0000-0000-000000000402','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000301','Active field','QLD');
    insert into public.field_boundary_versions(id,organisation_id,property_id,version_number,boundary_geojson) values
      ('00000000-0000-0000-0000-000000000501','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000401',1,'{}'::jsonb);
    insert into public.fields(id,organisation_id,property_id,name) values
      ('00000000-0000-0000-0000-000000000601','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000402','Active field');
  `);

  const archived = (await db.query(`select public.ftf_write_operational_resource(
    '00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000101',
    'properties','archive','00000000-0000-0000-0000-000000000401',1,'{}'::jsonb
  ) result`)).rows[0].result;
  if (!archived.record?.archived_at) throw new Error('Property with historical boundary evidence was not archived');

  const retained = (await db.query(`select count(*)::int count from public.field_boundary_versions where property_id='00000000-0000-0000-0000-000000000401'`)).rows[0].count;
  if (retained !== 1) throw new Error('Historical boundary evidence was not retained');

  const blocked = (await db.query(`select public.ftf_write_operational_resource(
    '00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000101',
    'properties','archive','00000000-0000-0000-0000-000000000402',1,'{}'::jsonb
  ) result`)).rows[0].result;
  if (!blocked.archive_conflict) throw new Error('Property with an active Field was not blocked');

  const evidence = (await db.query(`select
    (select count(*)::int from public.audit_events where entity_id='00000000-0000-0000-0000-000000000401' and event_type='properties.archive') audit_count,
    (select count(*)::int from public.transactional_outbox where aggregate_id='00000000-0000-0000-0000-000000000401' and topic='operational.properties.archive') outbox_count`)).rows[0];
  if (evidence.audit_count !== 1 || evidence.outbox_count !== 1) throw new Error('Archive audit/outbox evidence was not atomic');
} finally {
  await db.close();
}
