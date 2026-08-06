import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readMigration = (name) => readFile(resolve(root, 'supabase/migrations', name), 'utf8');
const db = new PGlite();

const org = '81000000-0000-4000-8000-000000000001';
const authUser = '81000000-0000-4000-8000-000000000002';
const internalUser = '81000000-0000-4000-8000-000000000003';
const adminRole = '81000000-0000-4000-8000-000000000004';
const membership = '81000000-0000-4000-8000-000000000005';
const location = '81000000-0000-4000-8000-000000000006';
const allocation = '81000000-0000-4000-8000-000000000007';
const adminActor = '81000000-0000-4000-8000-000000000008';
const adminAuth = '81000000-0000-4000-8000-000000000009';

const expectedPermissions = [
  'operating_locations.read',
  'clients.read', 'clients.create', 'clients.archive',
  'properties.read', 'properties.create', 'properties.archive',
  'fields.read', 'fields.create', 'fields.archive',
  'field_boundary_versions.read', 'field_boundary_versions.create',
  'jobs.read', 'jobs.create', 'jobs.archive',
  'missions.read', 'missions.create', 'missions.archive',
];

async function expectDenied(label, operation) {
  try {
    await operation();
  } catch (error) {
    if (String(error).includes('ACCEPTANCE_')) return;
    throw error;
  }
  throw new Error(`${label} was accepted`);
}

try {
  await db.exec(`
    create schema auth;
    create table auth.users(id uuid primary key,email text unique);
    create function auth.uid()returns uuid language sql stable as $$select null::uuid$$;
    create role anon;create role authenticated;create role service_role;
  `);
  await db.exec(await readMigration('20260801000000_production_beta_foundation.sql'));
  await db.exec(await readMigration('20260801006000_live_chain_access_prerequisites.sql'));
  await db.exec(await readMigration('20260802024000_authoritative_personnel.sql'));
  await db.exec(await readMigration('20260804160000_platform_identity_assisted_support.sql'));

  await db.exec(`
    insert into auth.users(id,email) values
      ('${authUser}','info@flythefarm.com.au'),('${adminAuth}','ben@flythefarm.com.au');
    insert into public.organisations(id,organisation_id,name) values('${org}','${org}','Fly The Farm');
    insert into public.operating_locations(id,organisation_id,name) values('${location}','${org}','Fly The Farm Base');
    insert into public.roles(id,organisation_id,code,name) values('${adminRole}','${org}','admin','Administrator');
    insert into public.permissions(organisation_id,code,description)
      select '${org}',code,code from unnest(array[${[...expectedPermissions, 'organisations.manage'].map((code) => `'${code}'`).join(',')}]) code;
    insert into public.internal_users(id,organisation_id,auth_user_id,display_name) values
      ('${internalUser}','${org}','${authUser}','Existing acceptance account'),
      ('${adminActor}','${org}','${adminAuth}','Organisation administrator');
    insert into public.memberships(id,organisation_id,internal_user_id,role_id) values
      ('${membership}','${org}','${internalUser}','${adminRole}'),
      (gen_random_uuid(),'${org}','${adminActor}','${adminRole}');
    insert into public.organisation_seat_allocations(id,organisation_id,allocated_seats,allocation_source)
      values('${allocation}','${org}',2,'verified_fixture');
    insert into public.internal_user_seat_assignments(organisation_id,organisation_seat_allocation_id,internal_user_id,membership_id,status,assignment_source)
      values('${org}','${allocation}','${internalUser}','${membership}','active','verified_fixture');
    insert into public.membership_operating_location_assignments(organisation_id,membership_id,operating_location_id,assignment_source)
      values('${org}','${membership}','${location}','verified_fixture');
    create or replace function public.ftf_write_operational_resource(
      p_organisation_id uuid,p_actor_internal_user_id uuid,p_resource text,p_operation text,
      p_entity_id uuid default null,p_expected_version integer default null,p_data jsonb default'{}'::jsonb
    )returns jsonb language plpgsql security definer set search_path=public as $$
    declare v_record public.clients%rowtype;
    begin
      if p_resource<>'clients' then return jsonb_build_object('unsupported_resource',true);end if;
      if p_operation='create' then
        insert into public.clients(organisation_id,name)values(p_organisation_id,p_data->>'name')returning * into v_record;
        insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)
          values(p_organisation_id,p_actor_internal_user_id,'clients.create','clients',v_record.id,'{}');
        insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)
          values(p_organisation_id,'operational.clients.create','clients',v_record.id,'{}');
      elsif p_operation='archive' then
        update public.clients set archived_at=now(),archived_by_internal_user_id=p_actor_internal_user_id
          where organisation_id=p_organisation_id and id=p_entity_id and archived_at is null returning * into v_record;
        insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)
          values(p_organisation_id,p_actor_internal_user_id,'clients.archive','clients',v_record.id,'{}');
        insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)
          values(p_organisation_id,'operational.clients.archive','clients',v_record.id,'{}');
      end if;
      return jsonb_build_object('record',to_jsonb(v_record));
    end$$;
  `);

  await db.exec(await readMigration('20260806200000_production_beta_acceptance_identity.sql'));

  const identity = (await db.query(`select
    r.code role_code,
    array_agg(p.code order by p.code) filter(where rp.archived_at is null) permissions,
    (select count(*)::int from public.platform_users where auth_user_id='${authUser}') platform_users,
    (select count(*)::int from public.personnel where internal_user_id='${internalUser}') personnel,
    (select count(*)::int from public.internal_user_seat_assignments where internal_user_id='${internalUser}'and status='active'and archived_at is null) seats,
    (select count(*)::int from public.membership_operating_location_assignments where membership_id=m.id and operating_location_id='${location}'and is_active and archived_at is null) locations
    from public.memberships m join public.roles r on r.id=m.role_id
    join public.role_permissions rp on rp.role_id=r.id
    join public.permissions p on p.id=rp.permission_id
    where m.internal_user_id='${internalUser}'and m.archived_at is null
    group by r.code,m.id`)).rows[0];
  if (identity.role_code !== 'production_beta_acceptance') throw new Error('acceptance role was not authoritative');
  if (JSON.stringify(identity.permissions) !== JSON.stringify([...expectedPermissions].sort())) throw new Error(`permission set was not exact: ${JSON.stringify(identity.permissions)}`);
  if (identity.platform_users !== 0 || identity.personnel !== 0 || identity.seats !== 1 || identity.locations !== 1) throw new Error(`identity isolation invalid: ${JSON.stringify(identity)}`);

  await expectDenied('non-prefixed acceptance create', () => db.query(`select public.ftf_write_operational_resource('${org}','${internalUser}','clients','create',null,null,'{"name":"Genuine-looking client"}')`));
  const own = (await db.query(`select public.ftf_write_operational_resource('${org}','${internalUser}','clients','create',null,null,'{"name":"SC ACCEPTANCE — owned client"}') result`)).rows[0].result.record;
  const genuine = (await db.query(`select public.ftf_write_operational_resource('${org}','${adminActor}','clients','create',null,null,'{"name":"Genuine Fly The Farm client"}') result`)).rows[0].result.record;
  await expectDenied('archive of another actor record', () => db.query(`select public.ftf_write_operational_resource('${org}','${internalUser}','clients','archive','${genuine.id}',1,'{}')`));
  await db.query(`select public.ftf_write_operational_resource('${org}','${internalUser}','clients','archive','${own.id}',1,'{}')`);

  const evidence = (await db.query(`select
    (select archived_at is null from public.clients where id='${genuine.id}') genuine_untouched,
    (select archived_at is not null from public.clients where id='${own.id}') acceptance_archived,
    (select count(*)::int from public.audit_events where actor_internal_user_id='${internalUser}'and event_type in('clients.create','clients.archive')) acceptance_audits,
    (select count(*)::int from public.transactional_outbox where aggregate_id='${own.id}'and topic in('operational.clients.create','operational.clients.archive')) acceptance_outbox,
    (select count(*)::int from public.audit_events where event_type='production_beta_acceptance.reconciled') reconciliation_audits,
    (select count(*)::int from public.transactional_outbox where topic='organisation.production_beta_acceptance.reconciled') reconciliation_outbox
  `)).rows[0];
  if (!evidence.genuine_untouched || !evidence.acceptance_archived || evidence.acceptance_audits !== 2 || evidence.acceptance_outbox !== 2 || evidence.reconciliation_audits !== 1 || evidence.reconciliation_outbox !== 1) throw new Error(`acceptance evidence invalid: ${JSON.stringify(evidence)}`);
} finally {
  await db.close();
}
