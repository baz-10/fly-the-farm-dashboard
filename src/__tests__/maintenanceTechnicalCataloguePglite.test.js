const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { TextDecoder, TextEncoder } = require('util');

global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;

const { PGlite } = require('@electric-sql/pglite');
const runPgliteInThisProcess = process.env.MAINTENANCE_CATALOGUE_PGLITE_CHILD === '1';
const nodeTests = [];
const nodeBeforeAll = [];
const nodeAfterAll = [];

if (runPgliteInThisProcess) {
  global.jest = { setTimeout: () => {} };
  global.expect = require('expect');
  global.test = (name, run) => nodeTests.push({ name, run });
  global.beforeAll = (run) => nodeBeforeAll.push(run);
  global.afterAll = (run) => nodeAfterAll.push(run);
  global.describe = (_name, define) => define();
}

const root = path.resolve(__dirname, '../..');
const migration = (name) => fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8');

const ids = {
  org1: '11111111-1111-4111-8111-111111111111',
  org2: '22222222-2222-4222-8222-222222222222',
  actor1: '11111111-1111-4111-8111-111111110101',
  actor2: '22222222-2222-4222-8222-222222220101',
  auth1: '11111111-1111-4111-8111-111111110001',
  auth2: '22222222-2222-4222-8222-222222220001',
  location1: '11111111-1111-4111-8111-111111111001',
  location1b: '11111111-1111-4111-8111-111111111002',
  location2: '22222222-2222-4222-8222-222222222001',
  asset1: '11111111-1111-4111-8111-111111112001',
  asset1b: '11111111-1111-4111-8111-111111112002',
  asset1c: '11111111-1111-4111-8111-111111112003',
  asset2: '22222222-2222-4222-8222-222222222001',
  fleet1: '11111111-1111-4111-8111-111111113001',
  fleet1b: '11111111-1111-4111-8111-111111113002',
  fleet1c: '11111111-1111-4111-8111-111111113003',
  fleet2: '22222222-2222-4222-8222-222222223001',
  system1: '11111111-1111-4111-8111-111111114001',
  system1b: '11111111-1111-4111-8111-111111114002',
  system2: '22222222-2222-4222-8222-222222224001',
  position1: '11111111-1111-4111-8111-111111115001',
  platformAuth: '99999999-9999-4999-8999-999999990001',
  platformUser: '99999999-9999-4999-8999-999999990101',
  partA: 'a1000000-0000-4000-8000-000000000001',
  versionA: 'a1100000-0000-4000-8000-000000000001',
  partB: 'b1000000-0000-4000-8000-000000000001',
  versionB: 'b1100000-0000-4000-8000-000000000001',
  partHistory: 'c1000000-0000-4000-8000-000000000001',
  versionHistory: 'c1100000-0000-4000-8000-000000000001',
  partGlobal: 'd1000000-0000-4000-8000-000000000001',
  versionGlobal: 'd1100000-0000-4000-8000-000000000001',
};

jest.setTimeout(120000);

if (runPgliteInThisProcess) describe('maintenance technical catalogue PostgreSQL behavior', () => {
  let db;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create schema auth;
      create table auth.users(id uuid primary key,email text unique);
      create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
      create role anon;
      create role authenticated;
      create role service_role;
    `);
    await db.exec(migration('20260801000000_production_beta_foundation.sql'));
    await db.exec(`
      create table public.platform_users(id uuid primary key,auth_user_id uuid not null references auth.users(id),email text not null,display_name text not null,is_active boolean not null default true,archived_at timestamptz,row_version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(auth_user_id));
      create table public.platform_roles(id uuid primary key default gen_random_uuid(),code text not null unique,name text not null,is_active boolean not null default true,created_at timestamptz not null default now());
      create table public.platform_permissions(id uuid primary key default gen_random_uuid(),code text not null unique,description text not null,enabled boolean not null default true,created_at timestamptz not null default now());
      create table public.platform_role_permissions(role_id uuid not null references public.platform_roles(id),permission_id uuid not null references public.platform_permissions(id),created_at timestamptz not null default now(),primary key(role_id,permission_id));
      create table public.platform_user_roles(platform_user_id uuid not null references public.platform_users(id),role_id uuid not null references public.platform_roles(id),assigned_at timestamptz not null default now(),assigned_by_platform_user_id uuid references public.platform_users(id),primary key(platform_user_id,role_id));
      create table public.platform_audit_events(id uuid primary key default gen_random_uuid(),actor_auth_user_id uuid references auth.users(id),event_type text not null,entity_type text not null,entity_id uuid,event_payload jsonb not null default '{}'::jsonb,created_at timestamptz not null default now());
      create table public.platform_transactional_outbox(id uuid primary key default gen_random_uuid(),topic text not null,aggregate_type text not null,aggregate_id uuid not null,payload jsonb not null,available_at timestamptz not null default now(),processed_at timestamptz,created_at timestamptz not null default now());
      create table public.ftf_store(tenant_id uuid not null references public.organisations(id),collection text not null,record_id text not null,payload jsonb not null,created_at timestamptz default now(),updated_at timestamptz default now(),primary key(tenant_id,collection,record_id));
      create function public.ftf_write_operational_resource(uuid,uuid,text,text,uuid,integer,jsonb) returns jsonb language sql as $$select '{}'::jsonb$$;
      create function public.ftf_actor_has_permission(p_org uuid,p_actor uuid,p_code text) returns boolean language sql stable as $$select exists(select 1 from public.internal_users where organisation_id=p_org and id=p_actor and is_active and archived_at is null)$$;
      create function public.ftf_actor_has_active_beta_seat(p_org uuid,p_actor uuid) returns boolean language sql stable as $$select exists(select 1 from public.internal_users where organisation_id=p_org and id=p_actor and is_active and archived_at is null)$$;
      create function public.ftf_operational_location_allowed(p_org uuid,p_actor uuid,p_location uuid) returns boolean language sql stable as $$
        select public.ftf_actor_has_active_beta_seat(p_org,p_actor) and (
          (p_org='${ids.org1}' and p_actor='${ids.actor1}' and p_location='${ids.location1}') or
          (p_org='${ids.org2}' and p_actor='${ids.actor2}' and p_location='${ids.location2}')
        )
      $$;
      create function public.ftf_lock_active_organisation(uuid) returns void language plpgsql as $$begin return; end$$;
      insert into public.platform_roles(code,name) values('PLATFORM_SUPER_ADMIN','Platform Super Administrator');
    `);
    await db.exec(migration('20260802000000_authoritative_aircraft.sql'));
    await db.exec(migration('20260802010000_authoritative_equipment_kits.sql'));
    await db.exec(migration('20260820090000_authoritative_fleet_assets.sql'));
    await db.exec(migration('20260820100000_asset_relationships_meters_and_systems.sql'));
    await db.exec(migration('20260820110000_maintenance_technical_catalogue.sql'));

    await db.exec(`
      insert into auth.users(id,email) values
        ('${ids.auth1}','one@example.com'),('${ids.auth2}','two@example.com'),('${ids.platformAuth}','platform@example.com');
      insert into public.organisations(id,organisation_id,name) values
        ('${ids.org1}','${ids.org1}','One'),('${ids.org2}','${ids.org2}','Two');
      insert into public.operating_locations(id,organisation_id,name) values
        ('${ids.location1}','${ids.org1}','One Base'),('${ids.location1b}','${ids.org1}','Restricted Base'),
        ('${ids.location2}','${ids.org2}','Two Base');
      insert into public.internal_users(id,organisation_id,auth_user_id,display_name) values
        ('${ids.actor1}','${ids.org1}','${ids.auth1}','One Admin'),('${ids.actor2}','${ids.org2}','${ids.auth2}','Two Admin');
      insert into public.platform_users(id,auth_user_id,email,display_name) values
        ('${ids.platformUser}','${ids.platformAuth}','platform@example.com','Platform Curator');
      insert into public.platform_user_roles(platform_user_id,role_id)
        select '${ids.platformUser}',id from public.platform_roles where code='PLATFORM_SUPER_ADMIN';

      insert into public.fleet_assets(id,organisation_id,operating_location_id,asset_type,asset_identifier,manufacturer,model,created_by_internal_user_id,updated_by_internal_user_id) values
        ('${ids.fleet1}','${ids.org1}','${ids.location1}','other','FTF-11','Isuzu','FSS550','${ids.actor1}','${ids.actor1}'),
        ('${ids.fleet1b}','${ids.org1}','${ids.location1}','other','FTF-12','Hino','FSS550','${ids.actor1}','${ids.actor1}'),
        ('${ids.fleet1c}','${ids.org1}','${ids.location1b}','other','RESTRICTED-13','Isuzu','FSS550','${ids.actor1}','${ids.actor1}'),
        ('${ids.fleet2}','${ids.org2}','${ids.location2}','other','OTHER-11','Isuzu','FSS550','${ids.actor2}','${ids.actor2}');
      insert into public.maintainable_asset_registry(id,organisation_id,fleet_asset_id,created_by_internal_user_id,updated_by_internal_user_id) values
        ('${ids.asset1}','${ids.org1}','${ids.fleet1}','${ids.actor1}','${ids.actor1}'),
        ('${ids.asset1b}','${ids.org1}','${ids.fleet1b}','${ids.actor1}','${ids.actor1}'),
        ('${ids.asset1c}','${ids.org1}','${ids.fleet1c}','${ids.actor1}','${ids.actor1}'),
        ('${ids.asset2}','${ids.org2}','${ids.fleet2}','${ids.actor2}','${ids.actor2}');
      insert into public.asset_attachment_periods(organisation_id,parent_asset_id,child_asset_id,position_label,attached_at,attached_by_internal_user_id)
        values
          ('${ids.org1}','${ids.asset1}','${ids.asset1b}','Attached generator','2025-01-01','${ids.actor1}'),
          ('${ids.org1}','${ids.asset1}','${ids.asset1c}','Restricted attached asset','2025-01-01','${ids.actor1}');
      insert into public.asset_systems(id,organisation_id,maintainable_asset_id,system_code,name,created_by_internal_user_id) values
        ('${ids.system1}','${ids.org1}','${ids.asset1}','ENGINE','Engine','${ids.actor1}'),
        ('${ids.system1b}','${ids.org1}','${ids.asset1b}','ENGINE','Engine','${ids.actor1}'),
        ('${ids.system2}','${ids.org2}','${ids.asset2}','ENGINE','Engine','${ids.actor2}');
      insert into public.component_positions(id,organisation_id,system_id,position_code,name,created_by_internal_user_id)
        values('${ids.position1}','${ids.org1}','${ids.system1}','FILTER','Filter','${ids.actor1}');

      insert into public.technical_parts(id,manufacturer,manufacturer_part_number) values
        ('${ids.partA}','Maker','A-1'),('${ids.partB}','Maker','B-1'),
        ('${ids.partHistory}','Maker','H-1'),('${ids.partGlobal}','Maker','G-1');
      insert into public.technical_part_versions(id,technical_part_id,version_number,manufacturer,manufacturer_part_number,technical_description,part_category,authority_type,lifecycle_state,evidence,approved_by_platform_user_id,approved_at,effective_from,effective_to) values
        ('${ids.versionA}','${ids.partA}',1,'Maker','A-1','Part A','FILTER','MANUFACTURER','EFFECTIVE','{"source":"manual"}','${ids.platformUser}','2025-01-01','2025-01-01',null),
        ('${ids.versionB}','${ids.partB}',1,'Maker','B-1','Part B','FILTER','MANUFACTURER','EFFECTIVE','{"source":"manual"}','${ids.platformUser}','2025-01-01','2025-01-01',null),
        ('${ids.versionHistory}','${ids.partHistory}',1,'Maker','H-1','Historical','FILTER','MANUFACTURER','EFFECTIVE','{"source":"manual"}','${ids.platformUser}','2025-01-01','2025-01-01','2026-01-01'),
        ('${ids.versionGlobal}','${ids.partGlobal}',1,'Maker','G-1','Global model part','FILTER','MANUFACTURER','EFFECTIVE','{"source":"manual"}','${ids.platformUser}','2025-01-01','2025-01-01',null);
      insert into public.technical_part_equivalences(left_part_version_id,right_part_version_id,directionality,equivalence_scope,authority_type,lifecycle_state,evidence,verified_by_platform_user_id,verified_at,effective_from)
        values('${ids.versionA}','${ids.versionB}','LEFT_TO_RIGHT','full replacement','VERIFIED_TECHNICAL_SOURCE','EFFECTIVE','{"source":"cross-reference"}','${ids.platformUser}','2025-01-01','2025-01-01');

      insert into public.asset_part_requirements(organisation_id,technical_part_version_id,maintainable_asset_id,system_id,application_code,quantity,unit_code,authority_type,lifecycle_state,evidence,effective_from,approved_by_internal_user_id,approved_at)
        values('${ids.org1}','${ids.versionHistory}','${ids.asset1}','${ids.system1}','HISTORICAL_FILTER',1,'EA','ORGANISATION_STANDARD','EFFECTIVE','{"source":"org-standard"}','2025-01-01','${ids.actor1}','2025-01-01');
      insert into public.technical_part_applicability(technical_part_version_id,manufacturer_scope,model_scope,system_code,application_code,quantity,unit_code,authority_type,lifecycle_state,evidence,effective_from,approved_by_platform_user_id,approved_at)
        values('${ids.versionGlobal}','Isuzu','FSS550','ENGINE','GLOBAL_FILTER',1,'EA','MANUFACTURER','EFFECTIVE','{"source":"manual"}','2025-01-01','${ids.platformUser}','2025-01-01');
      update public.technical_part_versions set lifecycle_state='SUPERSEDED',row_version=row_version+1 where id='${ids.versionHistory}';
    `);
  });

  afterAll(async () => { if (db) await db.close(); });

  test('denies cross-tenant preference reads and does not leak private purchasing data', async () => {
    await db.query(`select public.ftf_write_organisation_technical_preference('${ids.org1}','${ids.actor1}','PART',null,null,$1::jsonb)`, [{
      technical_part_id: ids.partA, preferred_part_version_id: ids.versionB, preferred_supplier: 'Tenant One Supplier', internal_sku: 'PRIVATE-ONE',
    }]);
    const denied = await db.query(`select public.ftf_read_organisation_technical_preferences('${ids.org1}','${ids.actor2}') result`);
    expect(denied.rows[0].result).toEqual({ forbidden: true });
    const allowed = await db.query(`select public.ftf_read_organisation_technical_preferences('${ids.org1}','${ids.actor1}') result`);
    expect(JSON.stringify(allowed.rows[0].result)).toContain('Tenant One Supplier');
    expect(JSON.stringify(allowed.rows[0].result)).toContain('PRIVATE-ONE');
  });

  test('backfills only assessed current templates and preserves archived templates and snapshots byte-equivalently', async () => {
    const sourceId = 'controlled-source-truck';
    await db.exec(`create or replace function public.digest(value bytea, algorithm text) returns bytea
      language sql immutable as $$ select decode(repeat(md5(encode(value, 'hex')), 2), 'hex') $$`);
    await db.query(`insert into public.ftf_store(tenant_id,collection,record_id,payload) values($1,'ftf_work_packs','__value__',$2::jsonb)
      on conflict(tenant_id,collection,record_id) do update set payload=excluded.payload`, [ids.org1, JSON.stringify({
      assets: [{ id: sourceId, assetType: 'truck', name: 'FTF-ARCHIVE-PROOF', registration: 'FTF-ARCHIVE-PROOF', vin: 'VIN-ARCHIVE-PROOF', manufacturer: 'Isuzu', model: 'FSS550', status: 'available' }],
      templates: [
        { id: 'current', status: 'active', assetIds: [sourceId], truckId: sourceId },
        { id: 'archived-asset-ids', status: 'archived', assetIds: [sourceId], historical: { untouched: true } },
        { id: 'archived-truck-id', status: 'archived', truckId: sourceId, notes: ['preserve', 'exactly'] },
        { id: 'archived-both', status: 'archived', assetIds: [sourceId], truckId: sourceId, nested: { source: { id: sourceId } } },
        { id: 'archived-unrelated', status: 'archived', unrelated: { arbitrary: ['historical', 7, false] } },
      ],
      snapshots: [{ id: 'historical-snapshot', templates: [{ truckId: sourceId }], unrelated: { preserve: true } }],
    })]);

    const before = await db.query(`select
      (select jsonb_agg(template order by template->>'id')::text from jsonb_array_elements(payload->'templates') template where template->>'status'='archived') archived,
      (payload->'snapshots')::text snapshots
      from public.ftf_store where tenant_id=$1 and collection='ftf_work_packs' and record_id='__value__'`, [ids.org1]);
    const dryRun = (await db.query(`select public.ftf_backfill_fleet_assets_from_work_pack($1,$2,$3,null,false) result`, [ids.org1, ids.actor1, ids.location1])).rows[0].result;
    expect(dryRun).toMatchObject({ currentTemplateMutations: 1, archivedTemplateMutations: 0, historicalSnapshotMutations: 0 });

    const applied = (await db.query(`select public.ftf_backfill_fleet_assets_from_work_pack($1,$2,$3,$4,true) result`, [ids.org1, ids.actor1, ids.location1, dryRun.snapshotDigest])).rows[0].result;
    expect(applied).toMatchObject({ currentTemplateMutations: 1, archivedTemplateMutations: 0, historicalSnapshotMutations: 0 });
    const canonical = (await db.query(`select id::text id from public.fleet_assets where organisation_id=$1 and source_system='ftf_work_packs' and source_record_id=$2`, [ids.org1, sourceId])).rows[0].id;
    const after = await db.query(`select
      (select jsonb_agg(template order by template->>'id')::text from jsonb_array_elements(payload->'templates') template where template->>'status'='archived') archived,
      (payload->'snapshots')::text snapshots,
      (select template from jsonb_array_elements(payload->'templates') template where template->>'id'='current') current
      from public.ftf_store where tenant_id=$1 and collection='ftf_work_packs' and record_id='__value__'`, [ids.org1]);
    expect(after.rows[0].archived).toBe(before.rows[0].archived);
    expect(after.rows[0].snapshots).toBe(before.rows[0].snapshots);
    expect(after.rows[0].current).toMatchObject({ assetIds: [canonical], truckId: canonical });
  });

  test('fails contradictory asset/system/position applicability closed', async () => {
    await expect(db.exec(`insert into public.asset_part_requirements(organisation_id,technical_part_version_id,maintainable_asset_id,system_id,application_code,quantity,unit_code,authority_type,lifecycle_state,evidence,effective_from) values('${ids.org1}','${ids.versionA}','${ids.asset1}','${ids.system1b}','CONTRADICTORY',1,'EA','ORGANISATION_STANDARD','DRAFT','{"source":"test"}','2025-01-01')`))
      .rejects.toThrow(/ASSET_TECHNICAL_SCOPE_CONTRADICTION/);
    await expect(db.exec(`insert into public.asset_part_requirements(organisation_id,technical_part_version_id,maintainable_asset_id,system_id,component_position_id,application_code,quantity,unit_code,authority_type,lifecycle_state,evidence,effective_from) values('${ids.org1}','${ids.versionA}','${ids.asset1b}','${ids.system1b}','${ids.position1}','CONTRADICTORY_POSITION',1,'EA','ORGANISATION_STANDARD','DRAFT','{"source":"test"}','2025-01-01')`))
      .rejects.toThrow(/ASSET_TECHNICAL_SCOPE_CONTRADICTION/);
  });

  test('enforces directional equivalents and immutable effective versions', async () => {
    expect(await db.query(`select public.ftf_part_preference_version_allowed('${ids.partA}','${ids.versionB}') allowed`)).toMatchObject({ rows: [{ allowed: true }] });
    expect(await db.query(`select public.ftf_part_preference_version_allowed('${ids.partB}','${ids.versionA}') allowed`)).toMatchObject({ rows: [{ allowed: false }] });
    await expect(db.exec(`update public.technical_part_versions set technical_description='mutated' where id='${ids.versionA}'`))
      .rejects.toThrow(/TECHNICAL_PART_VERSION_IMMUTABLE/);
    await expect(db.exec(`update public.technical_part_equivalences set equivalence_scope='mutated' where left_part_version_id='${ids.versionA}' and right_part_version_id='${ids.versionB}'`))
      .rejects.toThrow(/TECHNICAL_PART_EQUIVALENCE_IMMUTABLE/);
  });

  test('publishes an already-approved canonical version without rewriting approval evidence', async () => {
    const part = 'e2000000-0000-4000-8000-000000000001';
    const version = 'e2100000-0000-4000-8000-000000000001';
    await db.exec(`insert into public.technical_parts(id,manufacturer,manufacturer_part_number) values('${part}','Maker','E-2'); insert into public.technical_part_versions(id,technical_part_id,version_number,manufacturer,manufacturer_part_number,technical_description,part_category,authority_type,lifecycle_state,evidence,approved_by_platform_user_id,approved_at) values('${version}','${part}',1,'Maker','E-2','Part E2','FILTER','MANUFACTURER','APPROVED','{"source":"manual"}','${ids.platformUser}','2025-02-01')`);
    const before = await db.query(`select approved_at::text approved_at from public.technical_part_versions where id='${version}'`);
    const published = await db.query(`select public.ftf_publish_technical_version('${ids.platformUser}','PART','${version}',1,'2025-03-01') result`);
    expect(published.rows[0].result.record.lifecycle_state).toBe('EFFECTIVE');
    const after = await db.query(`select approved_at::text approved_at from public.technical_part_versions where id='${version}'`);
    expect(after.rows[0].approved_at).toBe(before.rows[0].approved_at);
  });

  test('honours explicit historical as-of and separates global model applicability from tenant rows', async () => {
    const historical = await db.query(`select public.ftf_read_asset_technical_catalogue('${ids.org1}','${ids.actor1}','${ids.asset1}','2025-06-01') result`);
    const future = await db.query(`select public.ftf_read_asset_technical_catalogue('${ids.org1}','${ids.actor1}','${ids.asset1}','2026-06-01') result`);
    expect(JSON.stringify(historical.rows[0].result)).toContain('HISTORICAL_FILTER');
    expect(JSON.stringify(future.rows[0].result)).not.toContain('HISTORICAL_FILTER');
    expect(JSON.stringify(historical.rows[0].result)).toContain('GLOBAL_FILTER');
    const otherTenant = await db.query(`select public.ftf_read_asset_technical_catalogue('${ids.org2}','${ids.actor2}','${ids.asset2}','2025-06-01') result`);
    expect(JSON.stringify(otherTenant.rows[0].result)).toContain('GLOBAL_FILTER');
    expect(JSON.stringify(otherTenant.rows[0].result)).not.toContain('HISTORICAL_FILTER');
  });

  test('resolves workspace route identities only inside the trusted tenant and Base', async () => {
    const allowed = await db.query(`select public.ftf_resolve_maintainable_asset_route('${ids.org1}','${ids.actor1}','fleet-asset','${ids.fleet1}') result`);
    expect(allowed.rows[0].result).toEqual({
      registryId: ids.asset1,
      source: 'fleet-asset',
      sourceRecordId: ids.fleet1,
      identity: 'FTF-11',
    });

    const crossTenant = await db.query(`select public.ftf_resolve_maintainable_asset_route('${ids.org1}','${ids.actor2}','fleet-asset','${ids.fleet1}') result`);
    expect(crossTenant.rows[0].result).toEqual({ not_found: true });
    const foreignRecord = await db.query(`select public.ftf_resolve_maintainable_asset_route('${ids.org2}','${ids.actor2}','fleet-asset','${ids.fleet1}') result`);
    expect(foreignRecord.rows[0].result).toEqual({ not_found: true });
    const deniedBase = await db.query(`select public.ftf_resolve_maintainable_asset_route('${ids.org1}','${ids.actor1}','fleet-asset','${ids.fleet1c}') result`);
    expect(deniedBase.rows[0].result).toEqual({ not_found: true });
  });

  test('returns authoritative attached links and factual part/fluid grouping identities', async () => {
    const fluid = 'd2000000-0000-4000-8000-000000000001';
    const fluidVersion = 'd2100000-0000-4000-8000-000000000001';
    await db.exec(`
      insert into public.technical_fluid_specifications(id,specification_code,display_name)
        values('${fluid}','ENGINE-OIL','Engine oil');
      insert into public.technical_fluid_specification_versions(id,technical_fluid_specification_id,version_number,fluid_type,viscosity_or_grade,authority_type,lifecycle_state,evidence,approved_by_platform_user_id,approved_at,effective_from)
        values('${fluidVersion}','${fluid}',1,'ENGINE_OIL','15W-40','MANUFACTURER','EFFECTIVE','{"source":"manual"}','${ids.platformUser}','2025-01-01','2025-01-01');
      insert into public.asset_fluid_requirements(organisation_id,fluid_specification_version_id,maintainable_asset_id,system_id,component_position_id,service_point,capacity_semantics,quantity,unit_code,authority_type,lifecycle_state,evidence,effective_from,approved_by_internal_user_id,approved_at)
        values('${ids.org1}','${fluidVersion}','${ids.asset1}','${ids.system1}','${ids.position1}','Engine sump','SERVICE_FILL',12,'L','ORGANISATION_STANDARD','EFFECTIVE','{"source":"org-standard"}','2025-01-01','${ids.actor1}','2025-01-01');
      insert into public.technical_part_applicability(technical_part_version_id,manufacturer_scope,model_scope,application_code,quantity,unit_code,authority_type,lifecycle_state,evidence,effective_from,approved_by_platform_user_id,approved_at)
        values('${ids.versionGlobal}','Isuzu','FSS550','MODEL_LEVEL_FILTER',1,'EA','MANUFACTURER','EFFECTIVE','{"source":"manual"}','2025-01-01','${ids.platformUser}','2025-01-01');
    `);

    const lookup = await db.query(`select public.ftf_read_asset_technical_catalogue('${ids.org1}','${ids.actor1}','${ids.asset1}','2025-06-01') result`);
    const catalogue = lookup.rows[0].result;
    expect(catalogue.attachedAssets).toEqual([{
      registryId: ids.asset1b,
      source: 'fleet-asset',
      sourceRecordId: ids.fleet1b,
      identity: 'FTF-12',
    }]);
    expect(catalogue.parts.find((row) => row.applicationCode === 'HISTORICAL_FILTER')).toMatchObject({
      systemId: ids.system1, systemCode: 'ENGINE', systemName: 'Engine',
      componentPositionId: null, componentPositionCode: null, componentPositionName: null,
    });
    expect(catalogue.parts.find((row) => row.applicationCode === 'GLOBAL_FILTER')).toMatchObject({
      systemId: ids.system1, systemCode: 'ENGINE', systemName: 'Engine',
    });
    expect(catalogue.parts.find((row) => row.applicationCode === 'MODEL_LEVEL_FILTER')).toMatchObject({
      systemId: null, systemCode: 'MODEL_LEVEL', systemName: 'Model-level applicability',
    });
    expect(catalogue.fluids.find((row) => row.servicePoint === 'Engine sump')).toMatchObject({
      systemId: ids.system1, systemCode: 'ENGINE', systemName: 'Engine',
      componentPositionId: ids.position1, componentPositionCode: 'FILTER', componentPositionName: 'Filter',
    });
  });

  test('keeps global publication on Platform authority with optimistic and atomic evidence', async () => {
    const part = 'e1000000-0000-4000-8000-000000000001';
    const version = 'e1100000-0000-4000-8000-000000000001';
    await db.exec(`insert into public.technical_parts(id,manufacturer,manufacturer_part_number) values('${part}','Maker','E-1'); insert into public.technical_part_versions(id,technical_part_id,version_number,manufacturer,manufacturer_part_number,technical_description,part_category,authority_type,lifecycle_state,evidence) values('${version}','${part}',1,'Maker','E-1','Part E','FILTER','MANUFACTURER','REVIEWED','{"source":"manual"}')`);
    const before = await db.query(`select (select count(*)::int from public.platform_audit_events) audits,(select count(*)::int from public.platform_transactional_outbox) outbox`);
    const denied = await db.query(`select public.ftf_publish_technical_version('${ids.actor1}','PART','${version}',1,'2025-01-01') result`);
    expect(denied.rows[0].result).toEqual({ forbidden: true });
    const afterDenied = await db.query(`select (select count(*)::int from public.platform_audit_events) audits,(select count(*)::int from public.platform_transactional_outbox) outbox`);
    expect(afterDenied.rows[0]).toEqual(before.rows[0]);
    const published = await db.query(`select public.ftf_publish_technical_version('${ids.platformUser}','PART','${version}',1,'2025-01-01') result`);
    expect(published.rows[0].result.record.lifecycle_state).toBe('EFFECTIVE');
    const conflict = await db.query(`select public.ftf_publish_technical_version('${ids.platformUser}','PART','${version}',1,'2025-01-01') result`);
    expect(conflict.rows[0].result).toMatchObject({ conflict: true, current_version: 2 });
    const after = await db.query(`select (select count(*)::int from public.platform_audit_events) audits,(select count(*)::int from public.platform_transactional_outbox) outbox`);
    expect(after.rows[0]).toEqual({ audits: before.rows[0].audits + 1, outbox: before.rows[0].outbox + 1 });
  });

  test('keeps tenant proposals non-authoritative through evidenced human review', async () => {
    const before = await db.query(`select
      (select count(*)::int from public.technical_part_equivalences) equivalences,
      (select count(*)::int from public.technical_part_applicability) applicability,
      (select count(*)::int from public.audit_events) audits,
      (select count(*)::int from public.transactional_outbox) outbox`);
    const created = await db.query(`select public.ftf_create_organisation_technical_proposal(
      '${ids.org1}','${ids.actor1}','PART_EQUIVALENCE',$1::jsonb,$2::jsonb,'AI_EXTRACTION') result`, [
      { leftPartVersionId: ids.versionA, rightPartVersionId: ids.versionB },
      { source: 'manual extraction' },
    ]);
    const proposal = created.rows[0].result.record;
    expect(proposal).toMatchObject({ organisation_id: ids.org1, proposal_state: 'PROPOSED', proposed_by_type: 'AI_EXTRACTION', has_technical_authority: false, row_version: 1 });
    expect(proposal.published_entity_id).toBeNull();

    const emptyEvidence = await expect(db.query(`select public.ftf_review_organisation_technical_proposal(
      '${ids.org1}','${ids.actor1}','${proposal.id}',1,'REVIEW','{}'::jsonb,'Checked') result`));
    await emptyEvidence.rejects.toThrow(/PROPOSAL_REVIEW_EVIDENCE_REQUIRED/);
    const reviewed = await db.query(`select public.ftf_review_organisation_technical_proposal(
      '${ids.org1}','${ids.actor1}','${proposal.id}',1,'REVIEW','{"document":"cross-reference"}'::jsonb,'Checked') result`);
    expect(reviewed.rows[0].result.record).toMatchObject({ proposal_state: 'REVIEWED', reviewed_by_internal_user_id: ids.actor1, has_technical_authority: false, row_version: 2 });
    const conflict = await db.query(`select public.ftf_review_organisation_technical_proposal(
      '${ids.org1}','${ids.actor1}','${proposal.id}',1,'APPROVE','{"document":"cross-reference"}'::jsonb,'Approved') result`);
    expect(conflict.rows[0].result).toMatchObject({ conflict: true, current_version: 2 });
    const approved = await db.query(`select public.ftf_review_organisation_technical_proposal(
      '${ids.org1}','${ids.actor1}','${proposal.id}',2,'APPROVE','{"document":"cross-reference","verified":true}'::jsonb,'Approved') result`);
    expect(approved.rows[0].result.record).toMatchObject({ proposal_state: 'APPROVED', has_technical_authority: false, row_version: 3 });
    expect(approved.rows[0].result.record.published_entity_id).toBeNull();

    const after = await db.query(`select
      (select count(*)::int from public.technical_part_equivalences) equivalences,
      (select count(*)::int from public.technical_part_applicability) applicability,
      (select count(*)::int from public.audit_events) audits,
      (select count(*)::int from public.transactional_outbox) outbox`);
    expect(after.rows[0]).toEqual({
      equivalences: before.rows[0].equivalences,
      applicability: before.rows[0].applicability,
      audits: before.rows[0].audits + 3,
      outbox: before.rows[0].outbox + 3,
    });
  });

  test('keeps Platform proposals on qualified human authority without publishing them', async () => {
    const created = await db.query(`select public.ftf_create_platform_technical_proposal(
      '${ids.platformUser}','FLUID_SPECIFICATION',$1::jsonb,$2::jsonb,'IMPORT') result`, [
      { specificationCode: 'ISO-TEST' }, { source: 'import batch' },
    ]);
    const proposal = created.rows[0].result.record;
    expect(proposal).toMatchObject({ organisation_id: null, proposed_by_platform_user_id: ids.platformUser, proposal_state: 'PROPOSED', has_technical_authority: false });
    await db.exec(`delete from public.platform_user_roles where platform_user_id='${ids.platformUser}'`);
    const denied = await db.query(`select public.ftf_review_platform_technical_proposal(
      '${ids.platformUser}','${proposal.id}',1,'REVIEW','{"source":"human-check"}'::jsonb,'Checked') result`);
    expect(denied.rows[0].result).toEqual({ forbidden: true });
    await db.exec(`insert into public.platform_user_roles(platform_user_id,role_id) select '${ids.platformUser}',id from public.platform_roles where code='PLATFORM_SUPER_ADMIN'`);
    const reviewed = await db.query(`select public.ftf_review_platform_technical_proposal(
      '${ids.platformUser}','${proposal.id}',1,'REVIEW','{"source":"human-check"}'::jsonb,'Checked') result`);
    expect(reviewed.rows[0].result.record).toMatchObject({ proposal_state: 'REVIEWED', reviewed_by_platform_user_id: ids.platformUser, has_technical_authority: false, row_version: 2 });
    const crossPlane = await db.query(`select public.ftf_review_organisation_technical_proposal(
      '${ids.org1}','${ids.actor1}','${proposal.id}',2,'APPROVE','{"source":"wrong-plane"}'::jsonb,'No') result`);
    expect(crossPlane.rows[0].result).toEqual({ not_found: true });
  });

  test('keeps manufacturer applicability publication on Platform authority', async () => {
    const applicability = 'd2000000-0000-4000-8000-000000000001';
    await db.exec(`insert into public.technical_part_applicability(id,technical_part_version_id,manufacturer_scope,model_scope,application_code,quantity,unit_code,authority_type,lifecycle_state,evidence) values('${applicability}','${ids.versionA}','Isuzu','FSS550','PLATFORM_ONLY',1,'EA','MANUFACTURER','REVIEWED','{"source":"manual"}')`);
    const denied = await db.query(`select public.ftf_publish_technical_applicability('${ids.actor1}','PART','${applicability}',1,'2025-01-01') result`);
    expect(denied.rows[0].result).toEqual({ forbidden: true });
    const published = await db.query(`select public.ftf_publish_technical_applicability('${ids.platformUser}','PART','${applicability}',1,'2025-01-01') result`);
    expect(published.rows[0].result.record).toMatchObject({ lifecycle_state: 'EFFECTIVE', approved_by_platform_user_id: ids.platformUser });
  });

  test('rolls publication and audit back atomically when outbox insertion fails', async () => {
    const part = 'e3000000-0000-4000-8000-000000000001';
    const version = 'e3100000-0000-4000-8000-000000000001';
    await db.exec(`insert into public.technical_parts(id,manufacturer,manufacturer_part_number) values('${part}','Maker','E-3'); insert into public.technical_part_versions(id,technical_part_id,version_number,manufacturer,manufacturer_part_number,technical_description,part_category,authority_type,lifecycle_state,evidence) values('${version}','${part}',1,'Maker','E-3','Part E3','FILTER','MANUFACTURER','REVIEWED','{"source":"manual"}')`);
    const before = await db.query(`select (select count(*)::int from public.platform_audit_events) audits,(select count(*)::int from public.platform_transactional_outbox) outbox`);
    await db.exec(`create function public.reject_catalogue_outbox() returns trigger language plpgsql as $$begin raise exception 'OUTBOX_REJECTED'; end$$; create trigger reject_catalogue_outbox before insert on public.platform_transactional_outbox for each row when (new.topic='platform.technical_catalogue.version_published') execute function public.reject_catalogue_outbox()`);
    try {
      await expect(db.query(`select public.ftf_publish_technical_version('${ids.platformUser}','PART','${version}',1,'2025-01-01')`)).rejects.toThrow(/OUTBOX_REJECTED/);
    } finally {
      await db.exec('drop trigger reject_catalogue_outbox on public.platform_transactional_outbox; drop function public.reject_catalogue_outbox()');
    }
    const record = await db.query(`select lifecycle_state,row_version from public.technical_part_versions where id='${version}'`);
    expect(record.rows[0]).toEqual({ lifecycle_state: 'REVIEWED', row_version: 1 });
    const after = await db.query(`select (select count(*)::int from public.platform_audit_events) audits,(select count(*)::int from public.platform_transactional_outbox) outbox`);
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  test('serializes Service Template child mutation against publication', async () => {
    const template = 'f2000000-0000-4000-8000-000000000001';
    const version = 'f2100000-0000-4000-8000-000000000001';
    const action = 'f2200000-0000-4000-8000-000000000001';
    await db.exec(`insert into public.service_templates(id,owner_scope,organisation_id,template_code,template_name,created_by_internal_user_id,updated_by_internal_user_id) values('${template}','ORGANISATION','${ids.org1}','ORG-SERIAL','Org Serialized','${ids.actor1}','${ids.actor1}'); insert into public.service_template_versions(id,service_template_id,version_number,description,authority_type,lifecycle_state,evidence) values('${version}','${template}',1,'Service','ORGANISATION_STANDARD','REVIEWED','{"source":"org"}')`);
    const results = await Promise.allSettled([
      db.query(`select public.ftf_publish_service_template_version('${ids.org1}','${ids.actor1}','${version}',1,'2025-01-01') result`),
      db.exec(`insert into public.service_template_actions(id,service_template_version_id,sequence_number,action_type,disposition,action_description) values('${action}','${version}',1,'INSPECT','REQUIRED','Serialized inspect')`),
    ]);
    expect(results[0].status).toBe('fulfilled');
    const final = await db.query(`select lifecycle_state from public.service_template_versions where id='${version}'`);
    expect(final.rows[0].lifecycle_state).toBe('EFFECTIVE');
    if (results[1].status === 'rejected') expect(String(results[1].reason)).toMatch(/SERVICE_TEMPLATE_AGGREGATE_IMMUTABLE/);
    else expect((await db.query(`select count(*)::int count from public.service_template_actions where id='${action}'`)).rows[0].count).toBe(1);
  });

  test('allows only Platform authority to publish manufacturer Service Templates', async () => {
    const template = 'f3000000-0000-4000-8000-000000000001';
    const version = 'f3100000-0000-4000-8000-000000000001';
    await db.exec(`insert into public.service_templates(id,owner_scope,template_code,template_name,created_by_platform_user_id,updated_by_platform_user_id) values('${template}','PLATFORM','PLATFORM-SERVICE','Platform Service','${ids.platformUser}','${ids.platformUser}'); insert into public.service_template_versions(id,service_template_id,version_number,description,authority_type,lifecycle_state,evidence) values('${version}','${template}',1,'Manufacturer Service','MANUFACTURER','REVIEWED','{"source":"manual"}')`);
    const denied = await db.query(`select public.ftf_publish_service_template_version('${ids.org1}','${ids.actor1}','${version}',1,'2025-01-01') result`);
    expect(denied.rows[0].result).toEqual({ forbidden: true });
    const published = await db.query(`select public.ftf_publish_platform_service_template_version('${ids.platformUser}','${version}',1,'2025-01-01') result`);
    expect(published.rows[0].result.record).toMatchObject({ lifecycle_state: 'EFFECTIVE', approved_by_platform_user_id: ids.platformUser });
  });

  test('does not apply a Platform Service Template to the same model from another manufacturer', async () => {
    const template = 'f4000000-0000-4000-8000-000000000001';
    const version = 'f4100000-0000-4000-8000-000000000001';
    await db.exec(`
      insert into public.service_templates(id,owner_scope,template_code,template_name,created_by_platform_user_id,updated_by_platform_user_id)
        values('${template}','PLATFORM','ISUZU-FSS550','Isuzu FSS550 Service','${ids.platformUser}','${ids.platformUser}');
      insert into public.service_template_versions(id,service_template_id,version_number,description,authority_type,lifecycle_state,evidence)
        values('${version}','${template}',1,'Manufacturer Service','MANUFACTURER','REVIEWED','{"source":"manual"}');
      insert into public.service_template_applicability(service_template_version_id,manufacturer_scope,model_scope,evidence)
        values('${version}','Isuzu','FSS550','{"source":"manual"}');
    `);
    await db.query(`select public.ftf_publish_platform_service_template_version('${ids.platformUser}','${version}',1,'2025-01-01')`);
    const isuzu = await db.query(`select public.ftf_read_asset_technical_catalogue('${ids.org1}','${ids.actor1}','${ids.asset1}','2025-06-01') result`);
    const hino = await db.query(`select public.ftf_read_asset_technical_catalogue('${ids.org1}','${ids.actor1}','${ids.asset1b}','2025-06-01') result`);
    expect(JSON.stringify(isuzu.rows[0].result)).toContain('Isuzu FSS550 Service');
    expect(JSON.stringify(hino.rows[0].result)).not.toContain('Isuzu FSS550 Service');
  });

  test('reads one exact applicable Service Template aggregate without preferences or unrelated templates', async () => {
    const template = 'f5000000-0000-4000-8000-000000000001';
    const version = 'f5100000-0000-4000-8000-000000000001';
    const applicability = 'f5200000-0000-4000-8000-000000000001';
    const action = 'f5300000-0000-4000-8000-000000000001';
    const fluid = 'f5400000-0000-4000-8000-000000000001';
    const fluidVersion = 'f5500000-0000-4000-8000-000000000001';
    const requirementVersion = 'f5600000-0000-4000-8000-000000000001';
    await db.exec(`
      insert into public.technical_fluid_specifications(id,specification_code,display_name) values('${fluid}','ISO-FLUID','Test fluid');
      insert into public.technical_fluid_specification_versions(id,technical_fluid_specification_id,version_number,fluid_type,viscosity_or_grade,authority_type,lifecycle_state,evidence,approved_by_platform_user_id,approved_at,effective_from)
        values('${fluidVersion}','${fluid}',1,'HYDRAULIC','ISO 46','MANUFACTURER','EFFECTIVE','{"source":"manual"}','${ids.platformUser}','2025-01-01','2025-01-01');
      insert into public.service_templates(id,owner_scope,organisation_id,template_code,template_name,created_by_internal_user_id,updated_by_internal_user_id)
        values('${template}','ORGANISATION','${ids.org1}','ORG-AGGREGATE','Organisation Aggregate','${ids.actor1}','${ids.actor1}');
      insert into public.service_template_versions(id,service_template_id,version_number,description,authority_type,lifecycle_state,evidence)
        values('${version}','${template}',1,'Exact aggregate read','ORGANISATION_STANDARD','REVIEWED','{"source":"org-manual"}');
      insert into public.service_template_applicability(id,service_template_version_id,organisation_id,maintainable_asset_id,system_id,evidence)
        values('${applicability}','${version}','${ids.org1}','${ids.asset1}','${ids.system1}','{"source":"asset-scope"}');
      insert into public.service_template_actions(id,service_template_version_id,sequence_number,action_type,disposition,action_description,expected_evidence)
        values('${action}','${version}',1,'SERVICE','REQUIRED','Service exact asset','{"photo":true}');
      insert into public.service_template_part_lines(service_template_version_id,action_id,technical_part_version_id,quantity,unit_code,disposition,line_notes)
        values('${version}','${action}','${ids.versionA}',2,'EA','REQUIRED','Exact part');
      insert into public.service_template_fluid_lines(service_template_version_id,action_id,fluid_specification_version_id,quantity,unit_code,disposition,line_notes)
        values('${version}','${action}','${fluidVersion}',4.5,'L','REQUIRED','Exact fluid');
      insert into public.service_template_inspections(service_template_version_id,action_id,inspection_description,disposition,expected_evidence)
        values('${version}','${action}','Inspect seals','REQUIRED','{"photo":true}');
      insert into public.service_template_replacement_actions(service_template_version_id,action_id,replacement_part_version_id,replacement_expectation,authority_type,disposition,evidence)
        values('${version}','${action}','${ids.versionB}','Replace if worn','ORGANISATION_STANDARD','REQUIRED','{"source":"org"}');
      insert into public.service_template_requirement_links(service_template_version_id,maintenance_requirement_version_id,disposition)
        values('${version}','${requirementVersion}','OPTIONAL');
    `);
    await db.query(`select public.ftf_publish_service_template_version('${ids.org1}','${ids.actor1}','${version}',1,'2025-01-01')`);

    await db.exec(`create or replace function public.ftf_actor_has_permission(p_org uuid,p_actor uuid,p_code text) returns boolean language sql stable as $$select p_code='service_templates.read' and exists(select 1 from public.internal_users where organisation_id=p_org and id=p_actor and is_active and archived_at is null)$$`);
    let allowed;
    try {
      allowed = await db.query(`select public.ftf_read_applicable_service_template_version(
        '${ids.org1}','${ids.actor1}','${ids.asset1}','${version}','2025-06-01') result`);
    } finally {
      await db.exec(`create or replace function public.ftf_actor_has_permission(p_org uuid,p_actor uuid,p_code text) returns boolean language sql stable as $$select exists(select 1 from public.internal_users where organisation_id=p_org and id=p_actor and is_active and archived_at is null)$$`);
    }
    const aggregate = allowed.rows[0].result;
    expect(aggregate.template).toMatchObject({ id: template, ownerScope: 'ORGANISATION', name: 'Organisation Aggregate' });
    expect(aggregate.version).toMatchObject({ id: version, authorityType: 'ORGANISATION_STANDARD', evidence: { source: 'org-manual' } });
    expect(aggregate.applicability).toHaveLength(1);
    expect(aggregate.actions).toHaveLength(1);
    expect(aggregate.partLines[0]).toMatchObject({ technicalPartVersionId: ids.versionA, quantity: 2 });
    expect(aggregate.fluidLines[0]).toMatchObject({ fluidSpecificationVersionId: fluidVersion, quantity: 4.5 });
    expect(aggregate.inspections).toHaveLength(1);
    expect(aggregate.replacements[0]).toMatchObject({ replacementPartVersionId: ids.versionB });
    expect(aggregate.requirementLinks[0]).toMatchObject({ maintenanceRequirementVersionId: requirementVersion });
    expect(JSON.stringify(aggregate)).not.toContain('Tenant One Supplier');
    expect(JSON.stringify(aggregate)).not.toContain('PRIVATE-ONE');

    const wrongAsset = await db.query(`select public.ftf_read_applicable_service_template_version(
      '${ids.org1}','${ids.actor1}','${ids.asset1b}','${version}','2025-06-01') result`);
    expect(wrongAsset.rows[0].result).toEqual({ not_found: true });
    const crossTenant = await db.query(`select public.ftf_read_applicable_service_template_version(
      '${ids.org1}','${ids.actor2}','${ids.asset1}','${version}','2025-06-01') result`);
    expect(crossTenant.rows[0].result).toEqual({ not_found: true });
  });

  test('freezes Service Template children after publication boundary', async () => {
    const template = 'f1000000-0000-4000-8000-000000000001';
    const version = 'f1100000-0000-4000-8000-000000000001';
    const action = 'f1200000-0000-4000-8000-000000000001';
    await db.exec(`
      insert into public.service_templates(id,owner_scope,organisation_id,template_code,template_name,created_by_internal_user_id,updated_by_internal_user_id) values('${template}','ORGANISATION','${ids.org1}','ORG-SERVICE','Org Service','${ids.actor1}','${ids.actor1}');
      insert into public.service_template_versions(id,service_template_id,version_number,description,authority_type,lifecycle_state,evidence) values('${version}','${template}',1,'Service','ORGANISATION_STANDARD','DRAFT','{"source":"org"}');
      insert into public.service_template_actions(id,service_template_version_id,sequence_number,action_type,disposition,action_description) values('${action}','${version}',1,'INSPECT','REQUIRED','Inspect');
      update public.service_template_versions set lifecycle_state='EFFECTIVE',approved_by_internal_user_id='${ids.actor1}',approved_at=now(),effective_from='2025-01-01' where id='${version}';
    `);
    await expect(db.exec(`update public.service_template_actions set action_description='changed' where id='${action}'`))
      .rejects.toThrow(/SERVICE_TEMPLATE_AGGREGATE_IMMUTABLE/);
  });
});

if (!runPgliteInThisProcess) {
  test('passes authoritative maintenance catalogue PGlite behavior', () => {
    try {
      execFileSync(process.execPath, [__filename], {
        cwd: root,
        env: { ...process.env, MAINTENANCE_CATALOGUE_PGLITE_CHILD: '1' },
        stdio: 'pipe',
      });
    } catch (error) {
      throw new Error(`${error.stdout || ''}${error.stderr || ''}` || error.message);
    }
  });
}

if (runPgliteInThisProcess) {
  (async () => {
    try {
      for (const setup of nodeBeforeAll) await setup();
      for (const { name, run } of nodeTests) {
        await run();
        process.stdout.write(`PASS ${name}\n`);
      }
    } finally {
      for (const cleanup of nodeAfterAll) await cleanup();
    }
  })().catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
}
