const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { TextDecoder, TextEncoder } = require('util');

global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;

const { PGlite } = require('@electric-sql/pglite');
const child = process.env.MAINTENANCE_REQUIREMENTS_PGLITE_CHILD === '1';
const nodeTests = [];
const nodeBeforeAll = [];

if (child) {
  global.jest = { setTimeout: () => {} };
  global.expect = require('expect');
  global.test = (name, run) => nodeTests.push({ name, run });
  global.beforeAll = (run) => nodeBeforeAll.push(run);
  global.describe = (_name, define) => define();
}

const root = path.resolve(__dirname, '../..');
const migration = (name) => fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8');
const ids = {
  org1: '11111111-1111-4111-8111-111111111111', org2: '22222222-2222-4222-8222-222222222222',
  actor1: '11111111-1111-4111-8111-111111110101', actor2: '22222222-2222-4222-8222-222222220101',
  auth1: '11111111-1111-4111-8111-111111110001', auth2: '22222222-2222-4222-8222-222222220001',
  location1: '11111111-1111-4111-8111-111111111001', location1b: '11111111-1111-4111-8111-111111111002', location2: '22222222-2222-4222-8222-222222222001',
  asset1: '11111111-1111-4111-8111-111111112001', asset1b: '11111111-1111-4111-8111-111111112002', asset2: '22222222-2222-4222-8222-222222222001',
  fleet1: '11111111-1111-4111-8111-111111113001', fleet1b: '11111111-1111-4111-8111-111111113002', fleet2: '22222222-2222-4222-8222-222222223001',
  meter1: '11111111-1111-4111-8111-111111114001', platformAuth: '99999999-9999-4999-8999-999999990001', platformUser: '99999999-9999-4999-8999-999999990101',
};

jest.setTimeout(120000);

if (child) describe('maintenance requirements PostgreSQL behavior', () => {
  let db;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create schema auth; create table auth.users(id uuid primary key,email text unique);
      create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
      create role anon; create role authenticated; create role service_role;
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
      create function public.ftf_operational_location_allowed(p_org uuid,p_actor uuid,p_location uuid) returns boolean language sql stable as $$select (p_org='${ids.org1}' and p_actor='${ids.actor1}' and p_location='${ids.location1}') or (p_org='${ids.org2}' and p_actor='${ids.actor2}' and p_location='${ids.location2}')$$;
      create function public.ftf_lock_active_organisation(uuid) returns void language plpgsql as $$begin return; end$$;
      insert into public.platform_roles(code,name) values('PLATFORM_SUPER_ADMIN','Platform Super Administrator');
    `);
    for (const name of [
      '20260802000000_authoritative_aircraft.sql', '20260802010000_authoritative_equipment_kits.sql',
      '20260820090000_authoritative_fleet_assets.sql', '20260820100000_asset_relationships_meters_and_systems.sql',
      '20260820110000_maintenance_technical_catalogue.sql', '20260821100000_maintenance_requirements_due_state.sql',
    ]) await db.exec(migration(name));
    await db.exec(`
      insert into auth.users(id,email) values('${ids.auth1}','one@example.com'),('${ids.auth2}','two@example.com'),('${ids.platformAuth}','platform@example.com');
      insert into public.organisations(id,organisation_id,name) values('${ids.org1}','${ids.org1}','One'),('${ids.org2}','${ids.org2}','Two');
      insert into public.operating_locations(id,organisation_id,name,timezone) values('${ids.location1}','${ids.org1}','Brisbane','Australia/Brisbane'),('${ids.location1b}','${ids.org1}','Denied','Australia/Brisbane'),('${ids.location2}','${ids.org2}','Other','Australia/Brisbane');
      insert into public.internal_users(id,organisation_id,auth_user_id,display_name) values('${ids.actor1}','${ids.org1}','${ids.auth1}','One Admin'),('${ids.actor2}','${ids.org2}','${ids.auth2}','Two Admin');
      insert into public.platform_users(id,auth_user_id,email,display_name) values('${ids.platformUser}','${ids.platformAuth}','platform@example.com','Platform Curator');
      insert into public.platform_user_roles(platform_user_id,role_id) select '${ids.platformUser}',id from public.platform_roles where code='PLATFORM_SUPER_ADMIN';
      insert into public.fleet_assets(id,organisation_id,operating_location_id,asset_type,asset_identifier,manufacturer,model,status,created_by_internal_user_id,updated_by_internal_user_id) values
        ('${ids.fleet1}','${ids.org1}','${ids.location1}','other','FTF-11','Isuzu','FSS550','available','${ids.actor1}','${ids.actor1}'),
        ('${ids.fleet1b}','${ids.org1}','${ids.location1b}','other','DENIED','Isuzu','FSS550','available','${ids.actor1}','${ids.actor1}'),
        ('${ids.fleet2}','${ids.org2}','${ids.location2}','other','OTHER','Isuzu','FSS550','available','${ids.actor2}','${ids.actor2}');
      insert into public.maintainable_asset_registry(id,organisation_id,fleet_asset_id,created_by_internal_user_id,updated_by_internal_user_id) values
        ('${ids.asset1}','${ids.org1}','${ids.fleet1}','${ids.actor1}','${ids.actor1}'),('${ids.asset1b}','${ids.org1}','${ids.fleet1b}','${ids.actor1}','${ids.actor1}'),('${ids.asset2}','${ids.org2}','${ids.fleet2}','${ids.actor2}','${ids.actor2}');
      insert into public.asset_attachment_periods(organisation_id,parent_asset_id,child_asset_id,position_label,attached_at,attached_by_internal_user_id)
        values('${ids.org1}','${ids.asset1}','${ids.asset1b}','Denied child','2025-01-01','${ids.actor1}');
      insert into public.asset_meter_definitions(id,organisation_id,maintainable_asset_id,meter_type,name,unit,source_policy,created_by_internal_user_id)
        values('${ids.meter1}','${ids.org1}','${ids.asset1}','odometer','Odometer','km','MANUAL','${ids.actor1}');
    `);
  });

  const propose = (code, thresholds, extra = {}) => db.query(`select public.ftf_propose_organisation_maintenance_requirement(
    '${ids.org1}','${ids.actor1}',$definition$${JSON.stringify({
      requirementCode: code, requirementName: code, requirementKind: 'SERVICE', authorityType: 'ORGANISATION_STANDARD',
      scopeType: 'ASSET', maintainableAssetId: ids.asset1, thresholdPolicy: 'ANY', evidence: { source: 'approved programme' },
      thresholds, ...extra,
    })}$definition$::jsonb) result`);

  test('rejects ambiguous threshold combination policy and manufacturer authority in the tenant plane', async () => {
    await expect(propose('BAD-ALL', [{ thresholdType: 'METER', meterType: 'odometer', intervalValue: 100, unitCode: 'km' }], { thresholdPolicy: 'ALL' }))
      .rejects.toThrow(/REQUIREMENT_THRESHOLD_POLICY_UNSUPPORTED/);
    await expect(propose('BAD-MFR', [{ thresholdType: 'METER', meterType: 'odometer', intervalValue: 100, unitCode: 'km' }], { authorityType: 'MANUFACTURER' }))
      .rejects.toThrow(/MANUFACTURER_REQUIREMENT_REQUIRES_PLATFORM_AUTHORITY/);
  });

  test('requires evidenced ordered lifecycle transitions, optimistic concurrency and emits audit/outbox atomically', async () => {
    const proposed = (await propose('FTF-10K', [{ thresholdType: 'METER', meterType: 'odometer', meterDefinitionId: ids.meter1, intervalValue: 10000, unitCode: 'km', dueSoonValue: 500 }])).rows[0].result.record;
    const versionId = proposed.version.id;
    await expect(db.query(`select public.ftf_review_organisation_maintenance_requirement_version('${ids.org1}','${ids.actor1}','${versionId}',1,'{}')`))
      .rejects.toThrow(/REQUIREMENT_REVIEW_EVIDENCE_REQUIRED/);
    const reviewed = (await db.query(`select public.ftf_review_organisation_maintenance_requirement_version('${ids.org1}','${ids.actor1}','${versionId}',1,'{"review":"checked"}') result`)).rows[0].result.record;
    expect(reviewed.lifecycle_state).toBe('REVIEWED');
    expect((await db.query(`select public.ftf_approve_organisation_maintenance_requirement_version('${ids.org1}','${ids.actor1}','${versionId}',1,'{"approval":"stale"}') result`)).rows[0].result).toMatchObject({ conflict: true, current_version: 2 });
    const approved = (await db.query(`select public.ftf_approve_organisation_maintenance_requirement_version('${ids.org1}','${ids.actor1}','${versionId}',2,'{"approval":"authorised"}') result`)).rows[0].result.record;
    expect(approved.lifecycle_state).toBe('APPROVED');
    const effective = (await db.query(`select public.ftf_make_organisation_maintenance_requirement_effective('${ids.org1}','${ids.actor1}','${versionId}',3,'2025-01-01') result`)).rows[0].result.record;
    expect(effective.lifecycle_state).toBe('EFFECTIVE');
    const sideEffects = await db.query(`select (select count(*) from public.audit_events where entity_id='${versionId}') audits,(select count(*) from public.transactional_outbox where aggregate_id='${versionId}') outbox`);
    expect(sideEffects.rows[0]).toEqual({ audits: 4, outbox: 4 });
    await expect(db.exec(`update public.maintenance_requirement_versions set requirement_name='changed' where id='${versionId}'`)).rejects.toThrow(/MAINTENANCE_REQUIREMENT_VERSION_IMMUTABLE/);
  });

  test('projects corrected meter boundaries, explicit due-soon, missing evidence and no availability mutation', async () => {
    const version = (await db.query(`select id from public.maintenance_requirement_versions where requirement_name='FTF-10K'`)).rows[0].id;
    const threshold = (await db.query(`select id from public.maintenance_requirement_thresholds where maintenance_requirement_version_id='${version}'`)).rows[0].id;
    await db.query(`select public.ftf_record_asset_maintenance_requirement_baseline('${ids.org1}','${ids.actor1}','${ids.asset1}','${threshold}','METER',0,null,'{"source":"commissioning"}')`);
    await db.exec(`insert into public.asset_meter_readings(id,organisation_id,meter_definition_id,recorded_at,value,source,source_system,source_record_id,evidence,recorded_by_internal_user_id,supersedes_reading_id,correction_reason) values
      ('11111111-1111-4111-8111-111111115001','${ids.org1}','${ids.meter1}','2026-09-01 00:00+00',9999,'MANUAL','test','r1','{}','${ids.actor1}',null,null),
      ('11111111-1111-4111-8111-111111115002','${ids.org1}','${ids.meter1}','2026-09-02 00:00+00',10000,'MANUAL','test','r2','{}','${ids.actor1}',null,null),
      ('11111111-1111-4111-8111-111111115003','${ids.org1}','${ids.meter1}','2026-09-03 00:00+00',10001,'MANUAL','test','r3','{}','${ids.actor1}',null,null),
      ('11111111-1111-4111-8111-111111115004','${ids.org1}','${ids.meter1}','2026-09-04 00:00+00',9990,'CORRECTION','test','r4','{"corrects":"r3"}','${ids.actor1}','11111111-1111-4111-8111-111111115003','entry error');`);
    const statuses = [];
    for (const asOf of ['2026-09-01 12:00+00','2026-09-02 12:00+00','2026-09-03 12:00+00','2026-09-04 12:00+00']) {
      const result = (await db.query(`select public.ftf_read_asset_maintenance_due_state('${ids.org1}','${ids.actor1}','${ids.asset1}','${asOf}') result`)).rows[0].result;
      statuses.push(result.requirements.find((row) => row.requirementCode === 'FTF-10K').state);
    }
    expect(statuses).toEqual(['DUE_SOON','DUE','OVERDUE','DUE_SOON']);
    expect((await db.query(`select status from public.fleet_assets where id='${ids.fleet1}'`)).rows[0].status).toBe('available');
    await propose('MISSING', [{ thresholdType: 'METER', meterType: 'odometer', meterDefinitionId: ids.meter1, intervalValue: 20000, unitCode: 'km' }]);
    await db.exec(`update public.maintenance_requirement_versions set lifecycle_state='EFFECTIVE',approved_by_internal_user_id='${ids.actor1}',approved_at=now(),effective_from='2025-01-01' where requirement_name='MISSING'`);
    const missing = (await db.query(`select public.ftf_read_asset_maintenance_due_state('${ids.org1}','${ids.actor1}','${ids.asset1}','2026-09-04') result`)).rows[0].result.requirements.find((row) => row.requirementCode === 'MISSING');
    expect(missing.state).toBe('INSUFFICIENT_DATA');
  });

  test('uses Australia/Brisbane local calendar dates and denies cross-tenant and narrowed Base reads', async () => {
    const proposed = (await propose('ANNUAL', [{ thresholdType: 'CALENDAR', intervalValue: 3, unitCode: 'YEAR', dueSoonValue: 7 }])).rows[0].result.record;
    await db.exec(`update public.maintenance_requirement_versions set lifecycle_state='EFFECTIVE',approved_by_internal_user_id='${ids.actor1}',approved_at=now(),effective_from='2025-01-01' where id='${proposed.version.id}'`);
    const threshold = proposed.thresholds[0].id;
    await db.query(`select public.ftf_record_asset_maintenance_requirement_baseline('${ids.org1}','${ids.actor1}','${ids.asset1}','${threshold}','COMMISSIONING',null,'2024-02-29','{"source":"commissioning certificate"}')`);
    const before = (await db.query(`select public.ftf_read_asset_maintenance_due_state('${ids.org1}','${ids.actor1}','${ids.asset1}','2027-02-27 13:59:59+00') result`)).rows[0].result;
    const due = (await db.query(`select public.ftf_read_asset_maintenance_due_state('${ids.org1}','${ids.actor1}','${ids.asset1}','2027-02-27 14:00:00+00') result`)).rows[0].result;
    expect(before.requirements.find((row) => row.requirementCode === 'ANNUAL').state).toBe('DUE_SOON');
    expect(due.requirements.find((row) => row.requirementCode === 'ANNUAL').state).toBe('DUE');
    expect((await db.query(`select public.ftf_read_asset_maintenance_due_state('${ids.org1}','${ids.actor2}','${ids.asset1}',now()) result`)).rows[0].result).toEqual({ not_found: true });
    expect((await db.query(`select public.ftf_read_asset_maintenance_due_state('${ids.org1}','${ids.actor1}','${ids.asset1b}',now()) result`)).rows[0].result).toEqual({ not_found: true });
    expect((await db.query(`select public.ftf_read_asset_maintenance_due_state('${ids.org1}','${ids.actor1}','${ids.asset1}',now()) result`)).rows[0].result.attachedAssetSummaries).toEqual([]);
  });

  test('fails closed before projecting an eligible attached child with an alias timezone or archived Base', async () => {
    const restoreLocationAuthority = `create or replace function public.ftf_operational_location_allowed(p_org uuid,p_actor uuid,p_location uuid) returns boolean language sql stable as $$select (p_org='${ids.org1}' and p_actor='${ids.actor1}' and p_location='${ids.location1}') or (p_org='${ids.org2}' and p_actor='${ids.actor2}' and p_location='${ids.location2}')$$`;
    await db.exec(`update public.operating_locations set timezone='EST' where id='${ids.location1b}'`);
    try {
      const denied = (await db.query(`select public.ftf_read_asset_maintenance_due_state('${ids.org1}','${ids.actor1}','${ids.asset1}','2026-09-04 12:00+00') result`)).rows[0].result;
      expect(denied.attachedAssetSummaries).toEqual([]);
      await db.exec(`create or replace function public.ftf_operational_location_allowed(p_org uuid,p_actor uuid,p_location uuid) returns boolean language sql stable as $$select (p_org='${ids.org1}' and p_actor='${ids.actor1}' and p_location in ('${ids.location1}','${ids.location1b}')) or (p_org='${ids.org2}' and p_actor='${ids.actor2}' and p_location='${ids.location2}')$$`);
      await expect(db.query(`select public.ftf_read_asset_maintenance_due_state('${ids.org1}','${ids.actor1}','${ids.asset1}','2026-09-04 12:00+00')`))
        .rejects.toThrow(/MAINTENANCE_REQUIREMENT_IANA_TIMEZONE_REQUIRED/);
      await db.exec(`update public.operating_locations set timezone='Australia/Brisbane',archived_at='2026-09-01 00:00+00' where id='${ids.location1b}'`);
      await expect(db.query(`select public.ftf_read_asset_maintenance_due_state('${ids.org1}','${ids.actor1}','${ids.asset1}','2026-09-04 12:00+00')`))
        .rejects.toThrow(/MAINTENANCE_REQUIREMENT_IANA_TIMEZONE_REQUIRED/);
    } finally {
      await db.exec(`update public.operating_locations set timezone='Australia/Brisbane',archived_at=null where id='${ids.location1b}'; ${restoreLocationAuthority};`);
    }
  });

  test('does not expose the actorless projection helper to the trusted server role', async () => {
    await db.exec('set role service_role');
    try {
      await expect(db.query(`select public.ftf_project_asset_maintenance_due_state('${ids.org1}','${ids.asset1}',now(),'Australia/Brisbane')`))
        .rejects.toThrow(/permission denied for function ftf_project_asset_maintenance_due_state/i);
      const checked = (await db.query(`select public.ftf_read_asset_maintenance_due_state('${ids.org1}','${ids.actor1}','${ids.asset1}',now()) result`)).rows[0].result;
      expect(checked).toMatchObject({ assetId: ids.asset1, timezone: 'Australia/Brisbane' });
    } finally {
      await db.exec('reset role');
    }
  });

  test('enforces typed units and exact asset/system scope coherence', async () => {
    await expect(propose('BAD-UNIT', [{ thresholdType: 'METER', meterType: 'odometer', intervalValue: 100, unitCode: 'h' }]))
      .rejects.toThrow(/MAINTENANCE_REQUIREMENT_THRESHOLD_TYPED_INVALID/);
    const foreignSystem = '11111111-1111-4111-8111-111111116001';
    await db.exec(`insert into public.asset_systems(id,organisation_id,maintainable_asset_id,system_code,name,created_by_internal_user_id) values('${foreignSystem}','${ids.org1}','${ids.asset1b}','ENGINE','Engine','${ids.actor1}')`);
    await expect(propose('BAD-SCOPE', [{ thresholdType: 'METER', meterType: 'odometer', intervalValue: 100, unitCode: 'km' }], { scopeType: 'SYSTEM', maintainableAssetId: ids.asset1, systemId: foreignSystem }))
      .rejects.toThrow(/MAINTENANCE_REQUIREMENT_SCOPE_CONTRADICTION/);
  });

  test('applies SYSTEM scope only while the exact referenced system belongs to the asset at asOf', async () => {
    const systemId = '11111111-1111-4111-8111-111111116101';
    await db.exec(`insert into public.asset_systems(id,organisation_id,maintainable_asset_id,system_code,name,created_by_internal_user_id) values('${systemId}','${ids.org1}','${ids.asset1}','SYS-LIVE','System live','${ids.actor1}')`);
    const proposed = (await propose('SYS-LIVE', [{ thresholdType: 'METER', meterType: 'odometer', meterDefinitionId: ids.meter1, intervalValue: 100, unitCode: 'km' }], {
      scopeType: 'SYSTEM', maintainableAssetId: ids.asset1, systemId,
    })).rows[0].result.record;
    await db.exec(`update public.maintenance_requirement_versions set lifecycle_state='EFFECTIVE',approved_by_internal_user_id='${ids.actor1}',approved_at='2025-01-01',effective_from='2025-01-01' where id='${proposed.version.id}'`);
    const codesAt = async (asOf) => (await db.query(`select public.ftf_read_asset_maintenance_due_state('${ids.org1}','${ids.actor1}','${ids.asset1}','${asOf}') result`)).rows[0].result.requirements.map((row) => row.requirementCode);
    try {
      expect(await codesAt('2026-12-31 00:00+00')).toContain('SYS-LIVE');
      await db.exec(`update public.asset_systems set maintainable_asset_id='${ids.asset1b}' where id='${systemId}'`);
      const rejectedBaseline = (await db.query(`select public.ftf_record_asset_maintenance_requirement_baseline('${ids.org1}','${ids.actor1}','${ids.asset1}','${proposed.thresholds[0].id}','METER',0,null,'{"source":"system evidence"}') result`)).rows[0].result;
      expect(rejectedBaseline).toEqual({ not_found: true });
      expect(await codesAt('2026-12-31 00:00+00')).not.toContain('SYS-LIVE');
      await db.exec(`update public.asset_systems set maintainable_asset_id='${ids.asset1}',archived_at='2027-01-01 00:00+00' where id='${systemId}'`);
      expect(await codesAt('2026-12-31 23:59:59+00')).toContain('SYS-LIVE');
      expect(await codesAt('2027-01-01 00:00:01+00')).not.toContain('SYS-LIVE');
    } finally {
      await db.exec(`delete from public.asset_maintenance_requirement_baselines where maintenance_requirement_threshold_id='${proposed.thresholds[0].id}'; update public.asset_systems set maintainable_asset_id='${ids.asset1}',archived_at=null where id='${systemId}'`);
    }
  });

  test('applies COMPONENT_POSITION scope only through its exact live system and position at asOf', async () => {
    const systemId = '11111111-1111-4111-8111-111111116201';
    const alternateSystemId = '11111111-1111-4111-8111-111111116202';
    const positionId = '11111111-1111-4111-8111-111111116203';
    await db.exec(`
      insert into public.asset_systems(id,organisation_id,maintainable_asset_id,system_code,name,created_by_internal_user_id) values
        ('${systemId}','${ids.org1}','${ids.asset1}','POS-SYS','Position system','${ids.actor1}'),
        ('${alternateSystemId}','${ids.org1}','${ids.asset1}','ALT-SYS','Alternate system','${ids.actor1}');
      insert into public.component_positions(id,organisation_id,system_id,position_code,name,created_by_internal_user_id) values('${positionId}','${ids.org1}','${systemId}','FILTER','Filter','${ids.actor1}');
    `);
    const proposed = (await propose('POS-LIVE', [{ thresholdType: 'METER', meterType: 'odometer', meterDefinitionId: ids.meter1, intervalValue: 100, unitCode: 'km' }], {
      scopeType: 'COMPONENT_POSITION', maintainableAssetId: ids.asset1, systemId, componentPositionId: positionId,
    })).rows[0].result.record;
    await db.exec(`update public.maintenance_requirement_versions set lifecycle_state='EFFECTIVE',approved_by_internal_user_id='${ids.actor1}',approved_at='2025-01-01',effective_from='2025-01-01' where id='${proposed.version.id}'`);
    const codesAt = async (asOf) => (await db.query(`select public.ftf_read_asset_maintenance_due_state('${ids.org1}','${ids.actor1}','${ids.asset1}','${asOf}') result`)).rows[0].result.requirements.map((row) => row.requirementCode);
    try {
      expect(await codesAt('2026-12-31 00:00+00')).toContain('POS-LIVE');
      await db.exec(`update public.component_positions set system_id='${alternateSystemId}' where id='${positionId}'`);
      const rejectedBaseline = (await db.query(`select public.ftf_record_asset_maintenance_requirement_baseline('${ids.org1}','${ids.actor1}','${ids.asset1}','${proposed.thresholds[0].id}','METER',0,null,'{"source":"position evidence"}') result`)).rows[0].result;
      expect(rejectedBaseline).toEqual({ not_found: true });
      expect(await codesAt('2026-12-31 00:00+00')).not.toContain('POS-LIVE');
      await db.exec(`update public.component_positions set system_id='${systemId}',archived_at='2027-01-01 00:00+00' where id='${positionId}'`);
      expect(await codesAt('2026-12-31 23:59:59+00')).toContain('POS-LIVE');
      expect(await codesAt('2027-01-01 00:00:01+00')).not.toContain('POS-LIVE');
      await db.exec(`update public.component_positions set archived_at=null where id='${positionId}'; update public.asset_systems set archived_at='2027-01-01 00:00+00' where id='${systemId}'`);
      expect(await codesAt('2027-01-01 00:00:01+00')).not.toContain('POS-LIVE');
    } finally {
      await db.exec(`delete from public.asset_maintenance_requirement_baselines where maintenance_requirement_threshold_id='${proposed.thresholds[0].id}'; update public.component_positions set system_id='${systemId}',archived_at=null where id='${positionId}'; update public.asset_systems set archived_at=null where id='${systemId}'`);
    }
  });

  test('links an exact Service Kit version and supersedes immutable requirement history', async () => {
    const template = '11111111-1111-4111-8111-111111117001';
    const kitVersion = '11111111-1111-4111-8111-111111117002';
    await db.exec(`
      insert into public.service_templates(id,owner_scope,organisation_id,template_code,template_name,created_by_internal_user_id,updated_by_internal_user_id)
        values('${template}','ORGANISATION','${ids.org1}','KIT-100','10K Service Kit','${ids.actor1}','${ids.actor1}');
      insert into public.service_template_versions(id,service_template_id,version_number,description,authority_type,lifecycle_state,evidence)
        values('${kitVersion}','${template}',1,'Exact kit','ORGANISATION_STANDARD','REVIEWED','{"source":"programme"}');
    `);
    const first = (await propose('VERSIONED', [{ thresholdType: 'METER', meterType: 'odometer', meterDefinitionId: ids.meter1, intervalValue: 100, unitCode: 'km' }], { serviceKitVersionId: kitVersion })).rows[0].result.record;
    await db.query(`select public.ftf_review_organisation_maintenance_requirement_version('${ids.org1}','${ids.actor1}','${first.version.id}',1,'{"review":"v1"}')`);
    await db.query(`select public.ftf_approve_organisation_maintenance_requirement_version('${ids.org1}','${ids.actor1}','${first.version.id}',2,'{"approval":"v1"}')`);
    await expect(db.query(`select public.ftf_make_organisation_maintenance_requirement_effective('${ids.org1}','${ids.actor1}','${first.version.id}',3,'2026-01-01 00:00+00')`)).rejects.toThrow(/SERVICE_KIT_VERSION_NOT_EFFECTIVE/);
    await db.exec(`update public.service_template_versions set lifecycle_state='EFFECTIVE',approved_by_internal_user_id='${ids.actor1}',approved_at='2025-01-01',effective_from='2025-01-01' where id='${kitVersion}'`);
    await db.query(`select public.ftf_make_organisation_maintenance_requirement_effective('${ids.org1}','${ids.actor1}','${first.version.id}',3,'2026-01-01 00:00+00')`);
    expect((await db.query(`select service_template_version_id from public.service_template_requirement_links where maintenance_requirement_version_id='${first.version.id}'`)).rows[0].service_template_version_id).toBe(kitVersion);

    const second = (await propose('VERSIONED', [{ thresholdType: 'METER', meterType: 'odometer', meterDefinitionId: ids.meter1, intervalValue: 120, unitCode: 'km' }], { supersedesVersionId: first.version.id })).rows[0].result.record;
    expect(second.requirement.id).toBe(first.requirement.id);
    expect(second.version.version_number).toBe(2);
    await db.query(`select public.ftf_review_organisation_maintenance_requirement_version('${ids.org1}','${ids.actor1}','${second.version.id}',1,'{"review":"v2"}')`);
    await db.query(`select public.ftf_approve_organisation_maintenance_requirement_version('${ids.org1}','${ids.actor1}','${second.version.id}',2,'{"approval":"v2"}')`);
    await db.query(`select public.ftf_make_organisation_maintenance_requirement_effective('${ids.org1}','${ids.actor1}','${second.version.id}',3,'2027-01-01 00:00+00')`);
    const history = await db.query(`select id,lifecycle_state,effective_to from public.maintenance_requirement_versions where maintenance_requirement_id='${first.requirement.id}' order by version_number`);
    expect(history.rows.map((row) => row.lifecycle_state)).toEqual(['SUPERSEDED','EFFECTIVE']);
    expect(new Date(history.rows[0].effective_to).toISOString()).toBe('2027-01-01T00:00:00.000Z');
    await expect(db.exec(`update public.maintenance_requirement_versions set requirement_name='rewrite' where id='${first.version.id}'`)).rejects.toThrow(/MAINTENANCE_REQUIREMENT_VERSION_IMMUTABLE/);
  });

  test('reserves manufacturer authority for evidenced Platform lifecycle commands', async () => {
    const proposed = (await db.query(`select public.ftf_propose_platform_maintenance_requirement('${ids.platformUser}',$definition$${JSON.stringify({
      requirementCode: 'MFR-FSS550', requirementName: 'Manufacturer annual inspection', requirementKind: 'INSPECTION', authorityType: 'MANUFACTURER',
      scopeType: 'MODEL', manufacturerScope: 'Isuzu', modelScope: 'FSS550', thresholdPolicy: 'ANY', evidence: { source: 'manufacturer manual', revision: '7' },
      thresholds: [{ thresholdType: 'CALENDAR', intervalValue: 1, unitCode: 'YEAR', dueSoonValue: 30 }],
    })}$definition$::jsonb) result`)).rows[0].result.record;
    await db.query(`select public.ftf_review_platform_maintenance_requirement_version('${ids.platformUser}','${proposed.version.id}',1,'{"review":"qualified curator"}')`);
    await db.query(`select public.ftf_approve_platform_maintenance_requirement_version('${ids.platformUser}','${proposed.version.id}',2,'{"approval":"manual verified"}')`);
    const effective = (await db.query(`select public.ftf_make_platform_maintenance_requirement_effective('${ids.platformUser}','${proposed.version.id}',3,'2026-01-01') result`)).rows[0].result.record;
    expect(effective).toMatchObject({ authority_type: 'MANUFACTURER', lifecycle_state: 'EFFECTIVE', approved_by_platform_user_id: ids.platformUser });
    expect((await db.query(`select count(*) count from public.platform_audit_events where entity_id='${proposed.version.id}'`)).rows[0].count).toBe(4);
  });

  test('evaluates an explicit one-time due date without inventing recurring cadence', async () => {
    const proposed = (await propose('ONE-TIME', [{ thresholdType: 'ONE_TIME' }], { requirementKind: 'ONE_TIME' })).rows[0].result.record;
    await db.exec(`update public.maintenance_requirement_versions set lifecycle_state='EFFECTIVE',approved_by_internal_user_id='${ids.actor1}',approved_at=now(),effective_from='2026-01-01' where id='${proposed.version.id}'`);
    await db.query(`select public.ftf_record_asset_maintenance_requirement_baseline('${ids.org1}','${ids.actor1}','${ids.asset1}','${proposed.thresholds[0].id}','ONE_TIME',null,'2026-10-02','{"source":"approved one-time directive"}')`);
    const states = [];
    for (const asOf of ['2026-09-30 14:00+00','2026-10-01 14:00+00','2026-10-02 14:00+00']) {
      const result = (await db.query(`select public.ftf_read_asset_maintenance_due_state('${ids.org1}','${ids.actor1}','${ids.asset1}','${asOf}') result`)).rows[0].result;
      states.push(result.requirements.find((row) => row.requirementCode === 'ONE-TIME').state);
    }
    expect(states).toEqual(['CURRENT','DUE','OVERDUE']);
  });
});

if (!child) test('passes maintenance requirements PGlite behavior', () => {
  try {
    execFileSync(process.execPath, [__filename], { cwd: root, env: { ...process.env, MAINTENANCE_REQUIREMENTS_PGLITE_CHILD: '1' }, stdio: 'pipe' });
  } catch (error) {
    throw new Error(`${error.stdout || ''}${error.stderr || ''}` || error.message);
  }
});

if (child) (async () => {
  try {
    for (const setup of nodeBeforeAll) await setup();
    for (const { name, run } of nodeTests) { await run(); process.stdout.write(`PASS ${name}\n`); }
  } catch (error) {
    process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1;
  }
})();
