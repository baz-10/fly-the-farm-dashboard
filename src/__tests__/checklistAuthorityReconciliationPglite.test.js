const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { TextDecoder, TextEncoder } = require('util');

global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;

const { PGlite } = require('@electric-sql/pglite');
const child = process.env.CHECKLIST_RECONCILIATION_PGLITE_CHILD === '1';
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
  auth1: '11111111-1111-4111-8111-111111110001', auth2: '22222222-2222-4222-8222-222222220001',
  actor1: '11111111-1111-4111-8111-111111110101', actor2: '22222222-2222-4222-8222-222222220101',
  location1: '11111111-1111-4111-8111-111111111001', location1b: '11111111-1111-4111-8111-111111111002', location2: '22222222-2222-4222-8222-222222222001',
  person1: '11111111-1111-4111-8111-111111110201', person2: '22222222-2222-4222-8222-222222220201',
  aircraft1: '11111111-1111-4111-8111-111111112001', aircraft1b: '11111111-1111-4111-8111-111111112002', aircraft2: '22222222-2222-4222-8222-222222222001',
  asset1: '11111111-1111-4111-8111-111111113001', asset1b: '11111111-1111-4111-8111-111111113002', asset2: '22222222-2222-4222-8222-222222223001',
  platformUser: '99999999-9999-4999-8999-999999990001',
  template: '11111111-1111-4111-8111-111111114001', version1: '11111111-1111-4111-8111-111111114101', version2: '11111111-1111-4111-8111-111111114102',
  applicability: '11111111-1111-4111-8111-111111114201', execution: '11111111-1111-4111-8111-111111115001',
  action: '11111111-1111-4111-8111-111111116001',
  client: '11111111-1111-4111-8111-111111117001', property: '11111111-1111-4111-8111-111111117002', job: '11111111-1111-4111-8111-111111117003', mission: '11111111-1111-4111-8111-111111117004',
  kit: '11111111-1111-4111-8111-111111117005', profile: '11111111-1111-4111-8111-111111117006', profileVersion: '11111111-1111-4111-8111-111111117007',
  kit2: '11111111-1111-4111-8111-111111117008', profile2: '11111111-1111-4111-8111-111111117009', profileVersion2: '11111111-1111-4111-8111-111111117010',
};

jest.setTimeout(120000);

if (child) describe('Checklist authority reconciliation PostgreSQL behavior', () => {
  let db;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create schema auth;create table auth.users(id uuid primary key,email text unique);create function auth.uid()returns uuid language sql stable as $$select null::uuid$$;create function public.digest(value bytea,algorithm text)returns bytea language sql immutable as $$select decode(md5(convert_from(value,'UTF8'))||md5(convert_from(value,'UTF8')||algorithm),'hex')$$;create role anon;create role authenticated;create role service_role;`);
    await db.exec(migration('20260801000000_production_beta_foundation.sql'));
    await db.exec(`
      create table public.platform_users(id uuid primary key,auth_user_id uuid,display_name text not null);
      create table public.platform_roles(id uuid primary key default gen_random_uuid(),code text not null unique);
      create table public.platform_permissions(id uuid primary key default gen_random_uuid(),code text not null unique,description text not null,enabled boolean not null default true);
      create table public.platform_role_permissions(role_id uuid not null,permission_id uuid not null,primary key(role_id,permission_id));
      create table public.platform_user_roles(platform_user_id uuid not null,role_id uuid not null,primary key(platform_user_id,role_id));
      create table public.platform_audit_events(id uuid primary key default gen_random_uuid(),actor_auth_user_id uuid,event_type text not null,entity_type text not null,entity_id uuid,event_payload jsonb not null default'{}',created_at timestamptz not null default now());
      create table public.platform_transactional_outbox(id uuid primary key default gen_random_uuid(),topic text not null,aggregate_type text not null,aggregate_id uuid not null,payload jsonb not null,created_at timestamptz not null default now());
      create table public.personnel(id uuid primary key,organisation_id uuid not null,internal_user_id uuid,full_name text not null,is_active boolean not null default true,archived_at timestamptz,unique(organisation_id,id));
      create table public.aircraft(id uuid primary key,organisation_id uuid not null,operating_location_id uuid not null,manufacturer text,model text,archived_at timestamptz,unique(organisation_id,id));
      create table public.equipment_kits(id uuid primary key,organisation_id uuid not null,operating_location_id uuid not null,kit_type text not null default 'spray',status text not null default 'available',archived_at timestamptz);
      create table public.aircraft_equipment_kit_assignments(id uuid primary key default gen_random_uuid(),organisation_id uuid not null,operating_location_id uuid not null,aircraft_id uuid not null,equipment_kit_id uuid not null,unassigned_at timestamptz,archived_at timestamptz);
      create table public.fleet_assets(id uuid primary key,organisation_id uuid not null,operating_location_id uuid not null,archived_at timestamptz);
      create table public.maintainable_asset_registry(id uuid primary key,organisation_id uuid not null,aircraft_id uuid,equipment_kit_id uuid,fleet_asset_id uuid,tracking_state text not null default 'ACTIVE',unique(organisation_id,id));
      create table public.asset_systems(id uuid primary key,organisation_id uuid not null,maintainable_asset_id uuid not null,archived_at timestamptz,unique(organisation_id,id));
      create table public.component_positions(id uuid primary key,organisation_id uuid not null,system_id uuid not null,archived_at timestamptz,unique(organisation_id,id));
      create table public.mission_aircraft_assignments(id uuid primary key default gen_random_uuid(),organisation_id uuid not null,operating_location_id uuid not null,mission_id uuid not null,aircraft_id uuid not null,unassigned_at timestamptz);
      create table public.mission_equipment_kit_assignments(id uuid primary key default gen_random_uuid(),organisation_id uuid not null,operating_location_id uuid not null,mission_id uuid not null,equipment_kit_id uuid not null,unassigned_at timestamptz);
      create table public.test_actor_permissions(organisation_id uuid,actor_id uuid,code text,primary key(organisation_id,actor_id,code));
      create function public.ftf_actor_has_permission(p_org uuid,p_actor uuid,p_code text)returns boolean language sql stable as $$select exists(select 1 from public.test_actor_permissions where organisation_id=p_org and actor_id=p_actor and code=p_code)$$;
      create function public.ftf_platform_actor_has_permission(p_actor uuid,p_code text)returns boolean language sql stable as $$select exists(select 1 from public.platform_user_roles ur join public.platform_role_permissions rp on rp.role_id=ur.role_id join public.platform_permissions p on p.id=rp.permission_id where ur.platform_user_id=p_actor and p.code=p_code and p.enabled)$$;
      create function public.ftf_operational_location_allowed(p_org uuid,p_actor uuid,p_location uuid)returns boolean language sql stable as $$select(p_org='${ids.org1}'and p_actor='${ids.actor1}'and p_location='${ids.location1}')or(p_org='${ids.org2}'and p_actor='${ids.actor2}'and p_location='${ids.location2}')$$;
      create function public.ftf_maintenance_asset_location_allowed(p_org uuid,p_actor uuid,p_asset uuid)returns boolean language sql stable as $$select(p_org='${ids.org1}'and p_actor='${ids.actor1}'and p_asset='${ids.asset1}')or(p_org='${ids.org2}'and p_actor='${ids.actor2}'and p_asset='${ids.asset2}')$$;
      insert into auth.users values('${ids.auth1}','one@example.com'),('${ids.auth2}','two@example.com');
      insert into public.organisations(id,organisation_id,name)values('${ids.org1}','${ids.org1}','One'),('${ids.org2}','${ids.org2}','Two');
      insert into public.operating_locations(id,organisation_id,name)values('${ids.location1}','${ids.org1}','Allowed'),('${ids.location1b}','${ids.org1}','Denied'),('${ids.location2}','${ids.org2}','Other');
      insert into public.internal_users(id,organisation_id,auth_user_id,display_name)values('${ids.actor1}','${ids.org1}','${ids.auth1}','One'),('${ids.actor2}','${ids.org2}','${ids.auth2}','Two');
      insert into public.personnel values('${ids.person1}','${ids.org1}','${ids.actor1}','One Pilot',true,null),('${ids.person2}','${ids.org2}','${ids.actor2}','Two Pilot',true,null);
      insert into public.aircraft values('${ids.aircraft1}','${ids.org1}','${ids.location1}','DJI','T100',null),('${ids.aircraft1b}','${ids.org1}','${ids.location1b}','DJI','T100',null),('${ids.aircraft2}','${ids.org2}','${ids.location2}','DJI','T100',null);
      insert into public.maintainable_asset_registry values('${ids.asset1}','${ids.org1}','${ids.aircraft1}',null,null,'ACTIVE'),('${ids.asset1b}','${ids.org1}','${ids.aircraft1b}',null,null,'ACTIVE'),('${ids.asset2}','${ids.org2}','${ids.aircraft2}',null,null,'ACTIVE');
      insert into public.platform_users values('${ids.platformUser}','${ids.auth1}','Platform Curator');
      insert into public.platform_roles(id,code)values('99999999-9999-4999-8999-999999990011','PLATFORM_SUPER_ADMIN');
      insert into public.platform_user_roles values('${ids.platformUser}','99999999-9999-4999-8999-999999990011');
    `);
    await db.exec(migration('20260805140000_controlled_operational_checklists.sql'));
    await db.exec(`
      insert into public.checklist_templates(id,organisation_id,stable_code,name,category,status,applicable_lifecycle_stages)values('${ids.template}','${ids.org1}','ORG-PREFLIGHT','Org preflight','PRE_FLIGHT','PUBLISHED',array['PRE_FLIGHT']);
      insert into public.checklist_template_versions(id,organisation_id,template_id,version_number,status,sections,created_by_internal_user_id)values('${ids.version1}','${ids.org1}','${ids.template}',1,'PUBLISHED','[{"id":"aircraft","items":[{"id":"propeller","prompt":"Inspect propellers","responseType":"PASS_DEFECT_NA","required":true,"allowNA":false,"criticality":"CRITICAL","authorityClass":"ORGANISATION_STANDARD"}]}]','${ids.actor1}');
      insert into public.checklist_executions(id,organisation_id,operating_location_id,template_id,template_version_id,lifecycle_stage,completing_personnel_id,completing_personnel_snapshot,status,responses,failure_summary,signoff_snapshot,created_by_internal_user_id)
        values('${ids.execution}','${ids.org1}','${ids.location1}','${ids.template}','${ids.version1}','PRE_FLIGHT','${ids.person1}','{"id":"${ids.person1}"}','SUBMITTED','{"propeller":"PASS"}','[]','{"personnelId":"${ids.person1}"}','${ids.actor1}');
    `);
    const before = (await db.query(`select responses::text responses,failure_summary::text failures,signoff_snapshot::text signoff from public.checklist_executions where id='${ids.execution}'`)).rows[0];
    await db.exec(migration('20260823100000_checklist_authority_reconciliation.sql'));
    await db.exec(migration('20260824100000_preprepared_checklist_composition.sql'));
    const after = (await db.query(`select responses::text responses,failure_summary::text failures,signoff_snapshot::text signoff from public.checklist_executions where id='${ids.execution}'`)).rows[0];
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('HISTORICAL_EXECUTION_REWRITTEN');
    await db.exec(`insert into public.test_actor_permissions values
      ('${ids.org1}','${ids.actor1}','checklist_templates.read'),('${ids.org1}','${ids.actor1}','checklist_templates.author'),('${ids.org1}','${ids.actor1}','checklist_templates.publish'),('${ids.org1}','${ids.actor1}','checklists.execute'),('${ids.org1}','${ids.actor1}','checklists.read_completed'),('${ids.org1}','${ids.actor1}','checklist_findings.manage');`);
    for(const statement of `
      insert into public.clients(id,organisation_id,name)values('${ids.client}','${ids.org1}','Controlled client');
      insert into public.properties(id,organisation_id,client_id,name)values('${ids.property}','${ids.org1}','${ids.client}','Controlled property');
      insert into public.jobs(id,organisation_id,client_id,property_id,reference)values('${ids.job}','${ids.org1}','${ids.client}','${ids.property}','CONTROLLED-JOB');
      insert into public.missions(id,organisation_id,job_id,operating_location_id,mission_number)values('${ids.mission}','${ids.org1}','${ids.job}','${ids.location1}','CONTROLLED-MISSION');
      insert into public.equipment_kits(id,organisation_id,operating_location_id,kit_type)values('${ids.kit}','${ids.org1}','${ids.location1}','spray');
      insert into public.mission_aircraft_assignments(organisation_id,operating_location_id,mission_id,aircraft_id)values('${ids.org1}','${ids.location1}','${ids.mission}','${ids.aircraft1}');
      insert into public.mission_equipment_kit_assignments(organisation_id,operating_location_id,mission_id,equipment_kit_id)values('${ids.org1}','${ids.location1}','${ids.mission}','${ids.kit}');
      insert into public.aircraft_equipment_kit_assignments(organisation_id,operating_location_id,aircraft_id,equipment_kit_id)values('${ids.org1}','${ids.location1}','${ids.aircraft1}','${ids.kit}');
      insert into public.checklist_composition_profiles(id,authority_scope,organisation_id,stable_code,name,lifecycle_stage,status,created_by_internal_user_id)
        values('${ids.profile}','ORGANISATION','${ids.org1}','CONTROLLED-SPRAY','Controlled spray','PRE_FLIGHT','DRAFT','${ids.actor1}');
      insert into public.checklist_composition_profile_versions(id,profile_id,authority_scope,organisation_id,version_number,status,effective_at,change_summary,applicability,source_provenance,created_by_internal_user_id)
        values('${ids.profileVersion}','${ids.profile}','ORGANISATION','${ids.org1}',1,'DRAFT',now(),'Initial fixture','{"requiresMission":true,"manufacturer":"DJI","models":["T100"],"configurations":["SPRAY"]}','{"authority":"ORGANISATION_FIXTURE"}','${ids.actor1}');
      insert into public.checklist_template_applicability(id,template_version_id,authority_scope,organisation_id,operating_location_id,lifecycle_stage,readiness_required,aircraft_id,maintainable_asset_id)values('${ids.applicability}','${ids.version1}','ORGANISATION','${ids.org1}','${ids.location1}','PRE_FLIGHT',true,'${ids.aircraft1}','${ids.asset1}');
    `.split(';').map(value=>value.trim()).filter(Boolean)){try{await db.exec(statement)}catch(error){throw new Error(`${statement}\n${error.message}`)}}
    const published=(await db.query(`select public.ftf_publish_checklist_composition('${ids.org1}','${ids.actor1}','${ids.profileVersion}',1,'{"modules":[{"ordinal":1,"templateVersionId":"${ids.version1}","stableSectionCode":"aircraft","required":true}]}') result`)).rows[0].result;
    if(!published.record)throw new Error(`COMPOSITION_FIXTURE_PUBLICATION_FAILED ${JSON.stringify(published)}`);
  });

  test('maps historical templates to organisation authority and supports customer-immutable platform records', async () => {
    expect((await db.query(`select authority_scope from public.checklist_templates where id='${ids.template}'`)).rows[0].authority_scope).toBe('ORGANISATION');
    await db.exec(`insert into public.checklist_templates(authority_scope,organisation_id,stable_code,name,category,status,created_by_platform_user_id,updated_by_platform_user_id)values('PLATFORM_SYSTEM',null,'DJI-T100','T100 System','PRE_FLIGHT','PUBLISHED','${ids.platformUser}','${ids.platformUser}')`);
    const result = (await db.query(`select public.ftf_write_checklist_template('${ids.org1}','${ids.actor1}','UPDATE',(select id from public.checklist_templates where stable_code='DJI-T100'),1,'{"name":"forged","category":"PRE_FLIGHT"}') result`)).rows[0].result;
    expect(result).toEqual({ conflict: true });
  });

  test('adds one immutable composition aggregate to the reconciled Checklist authority', async () => {
    const relations = (await db.query(`select to_regclass('public.checklist_composition_profiles') profile,to_regclass('public.checklist_composition_profile_versions') version,to_regclass('public.checklist_composition_profile_modules') modules`)).rows[0];
    expect(relations).toEqual({
      profile: 'checklist_composition_profiles',
      version: 'checklist_composition_profile_versions',
      modules: 'checklist_composition_profile_modules',
    });
    const commands = (await db.query(`select to_regprocedure('public.ftf_preview_checklist_composition(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,text)') preview,to_regprocedure('public.ftf_start_composed_checklist_execution(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,text,text)') start,to_regprocedure('public.ftf_publish_checklist_composition(uuid,uuid,uuid,integer,jsonb)') publish,to_regprocedure('public.ftf_publish_platform_checklist_composition(uuid,uuid,integer,jsonb)') platform_publish`)).rows[0];
    expect(commands).toEqual({
      preview: 'ftf_preview_checklist_composition(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,text)',
      start: 'ftf_start_composed_checklist_execution(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,text,text)',
      publish: 'ftf_publish_checklist_composition(uuid,uuid,uuid,integer,jsonb)',
      platform_publish: 'ftf_publish_platform_checklist_composition(uuid,uuid,integer,jsonb)',
    });
  });

  test('denies every authority-relevant mutation of a published composition',async()=>{
    const movedVersion='11111111-1111-4111-8111-111111114199';
    await expect(db.exec(`update public.checklist_composition_profiles set lifecycle_stage='POST_FLIGHT' where id='${ids.profile}'`)).rejects.toThrow(/append-only/);
    await expect(db.exec(`insert into public.checklist_composition_profile_modules(profile_version_id,ordinal,module_template_version_id,stable_section_code)values('${ids.profileVersion}',2,'${ids.version2}','late')`)).rejects.toThrow(/append-only/);
    await expect(db.exec(`delete from public.checklist_composition_profile_modules where profile_version_id='${ids.profileVersion}'`)).rejects.toThrow(/append-only/);
    await expect(db.exec(`update public.checklist_template_applicability set model_scope='T50' where id='${ids.applicability}'`)).rejects.toThrow(/append-only/);
    await db.exec(`insert into public.checklist_template_versions(id,organisation_id,template_id,version_number,status,sections,authority_scope,created_by_internal_user_id)values('${movedVersion}','${ids.org1}','${ids.template}',99,'DRAFT','[{"id":"other","items":[{"id":"other-item","prompt":"Other","responseType":"CHECK","required":true,"authorityClass":"ORGANISATION_STANDARD"}]}]','ORGANISATION','${ids.actor1}')`);
    await expect(db.exec(`update public.checklist_template_applicability set template_version_id='${movedVersion}' where id='${ids.applicability}'`)).rejects.toThrow(/append-only/);
  });

  test('requires Aircraft identity for aircraft-specific applicability',async()=>{
    const result=(await db.query(`select public.ftf_preview_checklist_composition('${ids.org1}','${ids.actor1}','${ids.profileVersion}','${ids.location1}','PRE_FLIGHT','${ids.mission}',null,null,null) result`)).rows[0].result;
    expect(result).toEqual({applicability_unresolved:true,reason:'AIRCRAFT_REQUIRED'});
  });

  test('rejects multiple exact active configuration candidates as ambiguous',async()=>{
    await db.exec(`insert into public.equipment_kits(id,organisation_id,operating_location_id,kit_type)values('${ids.kit2}','${ids.org1}','${ids.location1}','spray');insert into public.mission_equipment_kit_assignments(organisation_id,operating_location_id,mission_id,equipment_kit_id)values('${ids.org1}','${ids.location1}','${ids.mission}','${ids.kit2}');insert into public.aircraft_equipment_kit_assignments(organisation_id,operating_location_id,aircraft_id,equipment_kit_id)values('${ids.org1}','${ids.location1}','${ids.aircraft1}','${ids.kit2}');`);
    const result=(await db.query(`select public.ftf_preview_checklist_composition('${ids.org1}','${ids.actor1}','${ids.profileVersion}','${ids.location1}','PRE_FLIGHT','${ids.mission}','${ids.aircraft1}','${ids.asset1}',null) result`)).rows[0].result;
    expect(result).toEqual({configuration_ambiguous:true});
    await db.exec(`delete from public.aircraft_equipment_kit_assignments where equipment_kit_id='${ids.kit2}';delete from public.mission_equipment_kit_assignments where equipment_kit_id='${ids.kit2}';delete from public.equipment_kits where id='${ids.kit2}'`);
  });

  test('requires the exact preview digest and creates zero execution when stale',async()=>{
    const preview=(await db.query(`select public.ftf_preview_checklist_composition('${ids.org1}','${ids.actor1}','${ids.profileVersion}','${ids.location1}','PRE_FLIGHT','${ids.mission}','${ids.aircraft1}','${ids.asset1}','SPRAY') result`)).rows[0].result;
    expect(preview.compositionDigest).toMatch(/^[a-f0-9]{64}$/);
    const before=Number((await db.query(`select count(*) count from public.checklist_executions where composition_profile_version_id='${ids.profileVersion}'`)).rows[0].count);
    const stale=(await db.query(`select public.ftf_start_composed_checklist_execution('${ids.org1}','${ids.actor1}','${ids.profileVersion}','${ids.location1}','PRE_FLIGHT','${ids.mission}','${ids.aircraft1}','${ids.asset1}','SPRAY','${'0'.repeat(64)}') result`)).rows[0].result;
    expect(stale).toEqual(expect.objectContaining({stale_composition:true,currentDigest:preview.compositionDigest}));
    const after=Number((await db.query(`select count(*) count from public.checklist_executions where composition_profile_version_id='${ids.profileVersion}'`)).rows[0].count);
    expect(after).toBe(before);
  });

  test('publishes one coherent organisation composition or rolls back completely',async()=>{
    const foreignTemplate='22222222-2222-4222-8222-222222224001',foreignVersion='22222222-2222-4222-8222-222222224101';
    await db.exec(`insert into public.checklist_templates(id,organisation_id,stable_code,name,category,status,applicable_lifecycle_stages,authority_scope)values('${foreignTemplate}','${ids.org2}','FOREIGN','Foreign','PRE_FLIGHT','PUBLISHED',array['PRE_FLIGHT'],'ORGANISATION');insert into public.checklist_template_versions(id,organisation_id,template_id,version_number,status,sections,authority_scope,created_by_internal_user_id)values('${foreignVersion}','${ids.org2}','${foreignTemplate}',1,'PUBLISHED','[{"id":"foreign","title":"Foreign","items":[{"id":"foreign-item","prompt":"Foreign","responseType":"CHECK","required":true,"authorityClass":"ORGANISATION_STANDARD"}]}]','ORGANISATION','${ids.actor2}');insert into public.checklist_composition_profiles(id,authority_scope,organisation_id,stable_code,name,lifecycle_stage,status,created_by_internal_user_id)values('${ids.profile2}','ORGANISATION','${ids.org1}','CONTROLLED-DRAFT','Draft','PRE_FLIGHT','DRAFT','${ids.actor1}');insert into public.checklist_composition_profile_versions(id,profile_id,authority_scope,organisation_id,version_number,status,change_summary,applicability,source_provenance,created_by_internal_user_id)values('${ids.profileVersion2}','${ids.profile2}','ORGANISATION','${ids.org1}',1,'DRAFT','Invalid cross tenant','{}','{}','${ids.actor1}')`);
    const result=(await db.query(`select public.ftf_publish_checklist_composition('${ids.org1}','${ids.actor1}','${ids.profileVersion2}',1,'{"modules":[{"ordinal":1,"templateVersionId":"${foreignVersion}","stableSectionCode":"aircraft","required":true}]}') result`)).rows[0].result;
    expect(result).toEqual({composition_invalid:true,reason:'MODULE_AUTHORITY'});
    expect((await db.query(`select status from public.checklist_composition_profile_versions where id='${ids.profileVersion2}'`)).rows[0].status).toBe('DRAFT');
    expect(Number((await db.query(`select count(*) count from public.checklist_composition_profile_modules where profile_version_id='${ids.profileVersion2}'`)).rows[0].count)).toBe(0);
  });

  test('rolls back earlier valid membership when a later publication module is incoherent',async()=>{
    const profile='11111111-1111-4111-8111-111111117011',version='11111111-1111-4111-8111-111111117012',foreignVersion='22222222-2222-4222-8222-222222224101';
    await db.exec(`insert into public.checklist_composition_profiles(id,authority_scope,organisation_id,stable_code,name,lifecycle_stage,status,created_by_internal_user_id)values('${profile}','ORGANISATION','${ids.org1}','ATOMIC-DRAFT','Atomic draft','PRE_FLIGHT','DRAFT','${ids.actor1}');insert into public.checklist_composition_profile_versions(id,profile_id,authority_scope,organisation_id,version_number,status,change_summary,applicability,source_provenance,created_by_internal_user_id)values('${version}','${profile}','ORGANISATION','${ids.org1}',1,'DRAFT','Atomicity','{}','{}','${ids.actor1}')`);
    const result=(await db.query(`select public.ftf_publish_checklist_composition('${ids.org1}','${ids.actor1}','${version}',1,'{"modules":[{"ordinal":1,"templateVersionId":"${ids.version1}","stableSectionCode":"valid","required":true},{"ordinal":2,"templateVersionId":"${foreignVersion}","stableSectionCode":"foreign","required":true}]}') result`)).rows[0].result;
    expect(result).toEqual({composition_invalid:true,reason:'MODULE_AUTHORITY'});
    expect(Number((await db.query(`select count(*) count from public.checklist_composition_profile_modules where profile_version_id='${version}'`)).rows[0].count)).toBe(0);
    expect((await db.query(`select status from public.checklist_composition_profile_versions where id='${version}'`)).rows[0].status).toBe('DRAFT');
  });

  test('serializes simultaneous publication and preserves one immutable result',async()=>{
    const payload=`{"modules":[{"ordinal":1,"templateVersionId":"${ids.version1}","stableSectionCode":"aircraft","required":true}]}`;
    const results=await Promise.all([db.query(`select public.ftf_publish_checklist_composition('${ids.org1}','${ids.actor1}','${ids.profileVersion2}',1,'${payload}') result`),db.query(`select public.ftf_publish_checklist_composition('${ids.org1}','${ids.actor1}','${ids.profileVersion2}',1,'${payload}') result`)]);
    const values=results.map(result=>result.rows[0].result);
    expect(values.filter(value=>value.record)).toHaveLength(1);
    expect(values.filter(value=>value.conflict)).toHaveLength(1);
    expect(Number((await db.query(`select count(*) count from public.checklist_composition_profile_modules where profile_version_id='${ids.profileVersion2}'`)).rows[0].count)).toBe(1);
  });

  test('serializes publication against membership mutation and never leaves post-publication membership',async()=>{
    const profile='11111111-1111-4111-8111-111111117031',version='11111111-1111-4111-8111-111111117032';
    await db.exec(`insert into public.checklist_composition_profiles(id,authority_scope,organisation_id,stable_code,name,lifecycle_stage,status,created_by_internal_user_id)values('${profile}','ORGANISATION','${ids.org1}','PUBLICATION-RACE','Publication race','PRE_FLIGHT','DRAFT','${ids.actor1}');insert into public.checklist_composition_profile_versions(id,profile_id,authority_scope,organisation_id,version_number,status,change_summary,applicability,source_provenance,created_by_internal_user_id)values('${version}','${profile}','ORGANISATION','${ids.org1}',1,'DRAFT','Race fixture','{}','{}','${ids.actor1}')`);
    const publication=db.query(`select public.ftf_publish_checklist_composition('${ids.org1}','${ids.actor1}','${version}',1,'{"modules":[{"ordinal":1,"templateVersionId":"${ids.version1}","stableSectionCode":"aircraft","required":true}]}') result`);
    const mutation=db.exec(`insert into public.checklist_composition_profile_modules(profile_version_id,ordinal,module_template_version_id,stable_section_code)values('${version}',2,'${ids.version2}','late')`);
    const [published,mutated]=await Promise.allSettled([publication,mutation]);
    expect(published.status).toBe('fulfilled');
    expect(published.value.rows[0].result.record).toBeDefined();
    expect(mutated.status).toBe('rejected');
    expect(String(mutated.reason)).toMatch(/append-only/);
    expect((await db.query(`select array_agg(ordinal order by ordinal) ordinals from public.checklist_composition_profile_modules where profile_version_id='${version}'`)).rows[0].ordinals).toEqual([1]);
  });

  test('changes the digest for an authority-relevant applicability change',async()=>{
    const profile='11111111-1111-4111-8111-111111117041',v1='11111111-1111-4111-8111-111111117042',v2='11111111-1111-4111-8111-111111117043';
    await db.exec(`insert into public.checklist_composition_profiles(id,authority_scope,organisation_id,stable_code,name,lifecycle_stage,status,created_by_internal_user_id)values('${profile}','ORGANISATION','${ids.org1}','DIGEST-CONTRACT','Digest contract','PRE_FLIGHT','DRAFT','${ids.actor1}');insert into public.checklist_composition_profile_versions(id,profile_id,authority_scope,organisation_id,version_number,status,change_summary,applicability,source_provenance,created_by_internal_user_id)values('${v1}','${profile}','ORGANISATION','${ids.org1}',1,'DRAFT','Spray','{"configurations":["SPRAY"]}','{}','${ids.actor1}')`);
    const first=(await db.query(`select public.ftf_publish_checklist_composition('${ids.org1}','${ids.actor1}','${v1}',1,'{"modules":[{"ordinal":1,"templateVersionId":"${ids.version1}","stableSectionCode":"aircraft","required":true}]}') result`)).rows[0].result.record;
    await db.exec(`insert into public.checklist_composition_profile_versions(id,profile_id,authority_scope,organisation_id,version_number,status,change_summary,applicability,source_provenance,supersedes_version_id,created_by_internal_user_id)values('${v2}','${profile}','ORGANISATION','${ids.org1}',2,'DRAFT','Spread','{"configurations":["SPREAD"]}','{}','${v1}','${ids.actor1}')`);
    const second=(await db.query(`select public.ftf_publish_checklist_composition('${ids.org1}','${ids.actor1}','${v2}',1,'{"modules":[{"ordinal":1,"templateVersionId":"${ids.version1}","stableSectionCode":"aircraft","required":true}]}') result`)).rows[0].result.record;
    expect(second.compositionDigest).not.toBe(first.compositionDigest);
  });

  test('publishes PLATFORM_SYSTEM composition only from coherent platform modules',async()=>{
    const template='99999999-9999-4999-8999-999999994001',moduleVersion='99999999-9999-4999-8999-999999994101',profile='99999999-9999-4999-8999-999999997001',profileVersion='99999999-9999-4999-8999-999999997002';
    await db.exec(`insert into public.checklist_templates(id,authority_scope,organisation_id,stable_code,name,category,status,created_by_platform_user_id,updated_by_platform_user_id,applicable_lifecycle_stages)values('${template}','PLATFORM_SYSTEM',null,'SYSTEM-FIXTURE','System fixture','PRE_FLIGHT','PUBLISHED','${ids.platformUser}','${ids.platformUser}',array['PRE_FLIGHT']);insert into public.checklist_template_versions(id,authority_scope,organisation_id,template_id,version_number,status,sections,source_provenance,created_by_platform_user_id)values('${moduleVersion}','PLATFORM_SYSTEM',null,'${template}',1,'PUBLISHED','[{"id":"system","items":[{"id":"system-check","prompt":"System check","responseType":"CHECK","required":true,"authorityClass":"DJI_MANUFACTURER","sourceReferences":[{"authorityClass":"DJI_MANUFACTURER","sourceIdentity":"DJI-FIXTURE","sourceLocator":"section-1","sourceOutcome":"System check required"}]}]}]','{"authority":"PLATFORM_FIXTURE"}','${ids.platformUser}');insert into public.checklist_composition_profiles(id,authority_scope,organisation_id,stable_code,name,lifecycle_stage,status,created_by_platform_user_id)values('${profile}','PLATFORM_SYSTEM',null,'SYSTEM-COMPOSITION','System composition','PRE_FLIGHT','DRAFT','${ids.platformUser}');insert into public.checklist_composition_profile_versions(id,profile_id,authority_scope,organisation_id,version_number,status,change_summary,applicability,source_provenance,created_by_platform_user_id)values('${profileVersion}','${profile}','PLATFORM_SYSTEM',null,1,'DRAFT','Fixture only','{}','{"authority":"PLATFORM_FIXTURE"}','${ids.platformUser}')`);
    const result=(await db.query(`select public.ftf_publish_platform_checklist_composition('${ids.platformUser}','${profileVersion}',1,'{"modules":[{"ordinal":1,"templateVersionId":"${moduleVersion}","stableSectionCode":"system","required":true}]}') result`)).rows[0].result;
    expect(result.record).toEqual(expect.objectContaining({id:profileVersion,status:'PUBLISHED'}));
    expect(Number((await db.query(`select count(*) count from public.platform_audit_events where entity_id='${profileVersion}'`)).rows[0].count)).toBe(1);
  });

  test('provisions platform publication authority through the governed role matrix',async()=>{
    expect((await db.query(`select public.ftf_platform_actor_has_permission('${ids.platformUser}','platform.checklist_system.publish') allowed`)).rows[0].allowed).toBe(true);
  });

  test('adopts an exact immutable system profile version and reports update state through checked reads',async()=>{
    const sourceVersion='99999999-9999-4999-8999-999999997002';
    const adopted=(await db.query(`select public.ftf_adopt_system_checklist_composition('${ids.org1}','${ids.actor1}','${sourceVersion}','ADOPTED-SYSTEM','Adopted system') result`)).rows[0].result;
    expect(adopted.record).toEqual(expect.objectContaining({sourceSystemProfileVersionId:sourceVersion,status:'DRAFT'}));
    const stored=(await db.query(`select source_system_profile_version_id,source_provenance from public.checklist_composition_profile_versions where id='${adopted.record.profileVersionId}'`)).rows[0];
    expect(stored.source_system_profile_version_id).toBe(sourceVersion);
    expect(stored.source_provenance.sourceCompositionDigest).toBe(adopted.record.sourceCompositionDigest);
    expect(adopted.record.proposedModules).toHaveLength(1);
    const counterfeit=(await db.query(`select public.ftf_publish_checklist_composition('${ids.org1}','${ids.actor1}','${adopted.record.profileVersionId}',1,'{"modules":[{"ordinal":1,"templateVersionId":"${ids.version1}","stableSectionCode":"counterfeit","required":true}]}') result`)).rows[0].result;
    expect(counterfeit).toEqual({composition_invalid:true,reason:'ADOPTED_SOURCE_MISMATCH'});
    const library=(await db.query(`select public.ftf_read_checklist_composition_library('${ids.org1}','${ids.actor1}') result`)).rows[0].result;
    expect(library.records).toEqual(expect.arrayContaining([expect.objectContaining({profileVersionId:sourceVersion})]));
  });

  test('rejects tenant-private PLATFORM_SYSTEM metadata and malformed module payloads safely',async()=>{
    const profile='99999999-9999-4999-8999-999999997021',privateVersion='99999999-9999-4999-8999-999999997022';
    await db.exec(`insert into public.checklist_composition_profiles(id,authority_scope,organisation_id,stable_code,name,lifecycle_stage,status,created_by_platform_user_id)values('${profile}','PLATFORM_SYSTEM',null,'PRIVATE-SYSTEM','Private system','PRE_FLIGHT','DRAFT','${ids.platformUser}');insert into public.checklist_composition_profile_versions(id,profile_id,authority_scope,organisation_id,version_number,status,change_summary,applicability,source_provenance,created_by_platform_user_id)values('${privateVersion}','${profile}','PLATFORM_SYSTEM',null,1,'DRAFT','Private fixture','{"organisationId":"${ids.org1}"}','{}','${ids.platformUser}')`);
    expect((await db.query(`select public.ftf_publish_platform_checklist_composition('${ids.platformUser}','${privateVersion}',1,'{"modules":[{"ordinal":1,"templateVersionId":"not-a-uuid","stableSectionCode":"system"}]}') result`)).rows[0].result).toEqual({composition_invalid:true,reason:'PLATFORM_METADATA_INVALID'});
    await db.exec(`update public.checklist_composition_profile_versions set applicability='{"contactEmail":"private@example.test"}' where id='${privateVersion}'`);
    expect((await db.query(`select public.ftf_publish_platform_checklist_composition('${ids.platformUser}','${privateVersion}',1,'{"modules":[{"ordinal":1,"templateVersionId":"not-a-uuid","stableSectionCode":"system"}]}') result`)).rows[0].result).toEqual({composition_invalid:true,reason:'PLATFORM_METADATA_INVALID'});
  });

  test('returns a bounded domain failure for malformed publication fields before casting',async()=>{
    const profile='11111111-1111-4111-8111-111111117071',version='11111111-1111-4111-8111-111111117072';
    await db.exec(`insert into public.checklist_composition_profiles(id,authority_scope,organisation_id,stable_code,name,lifecycle_stage,status,created_by_internal_user_id)values('${profile}','ORGANISATION','${ids.org1}','MALFORMED-PUBLICATION','Malformed publication','PRE_FLIGHT','DRAFT','${ids.actor1}');insert into public.checklist_composition_profile_versions(id,profile_id,authority_scope,organisation_id,version_number,status,change_summary,applicability,source_provenance,created_by_internal_user_id)values('${version}','${profile}','ORGANISATION','${ids.org1}',1,'DRAFT','Fixture','{}','{}','${ids.actor1}')`);
    expect((await db.query(`select public.ftf_publish_checklist_composition('${ids.org1}','${ids.actor1}','${version}',1,'{"modules":[{"ordinal":"one","templateVersionId":"not-a-uuid","stableSectionCode":"x","required":"yes"}]}') result`)).rows[0].result).toEqual({composition_invalid:true,reason:'MODULES_INVALID'});
  });

  test('rejects incoherent module applicability during composition publication',async()=>{
    const profile='11111111-1111-4111-8111-111111117051',version='11111111-1111-4111-8111-111111117052',application='11111111-1111-4111-8111-111111117053',template='11111111-1111-4111-8111-111111117054',moduleVersion='11111111-1111-4111-8111-111111117055';
    await db.exec(`insert into public.checklist_templates(id,organisation_id,stable_code,name,category,status,applicable_lifecycle_stages,authority_scope)values('${template}','${ids.org1}','MODULE-APP','Module app','PRE_FLIGHT','PUBLISHED',array['PRE_FLIGHT'],'ORGANISATION');insert into public.checklist_template_versions(id,organisation_id,template_id,version_number,status,sections,authority_scope,created_by_internal_user_id)values('${moduleVersion}','${ids.org1}','${template}',1,'PUBLISHED','[{"id":"module","items":[{"id":"module-check","prompt":"Module check","responseType":"CHECK","required":true,"authorityClass":"ORGANISATION_STANDARD"}]}]','ORGANISATION','${ids.actor1}');insert into public.checklist_template_applicability(id,template_version_id,authority_scope,organisation_id,operating_location_id,lifecycle_stage,model_scope)values('${application}','${moduleVersion}','ORGANISATION','${ids.org1}','${ids.location1}','POST_FLIGHT','T50');insert into public.checklist_composition_profiles(id,authority_scope,organisation_id,stable_code,name,lifecycle_stage,status,created_by_internal_user_id)values('${profile}','ORGANISATION','${ids.org1}','MODULE-APPLICABILITY','Module applicability','PRE_FLIGHT','DRAFT','${ids.actor1}');insert into public.checklist_composition_profile_versions(id,profile_id,authority_scope,organisation_id,version_number,status,change_summary,applicability,source_provenance,created_by_internal_user_id)values('${version}','${profile}','ORGANISATION','${ids.org1}',1,'DRAFT','Fixture','{"models":["T100"]}','{}','${ids.actor1}')`);
    const result=(await db.query(`select public.ftf_publish_checklist_composition('${ids.org1}','${ids.actor1}','${version}',1,'{"modules":[{"ordinal":1,"templateVersionId":"${moduleVersion}","stableSectionCode":"aircraft"}]}') result`)).rows[0].result;
    expect(result).toEqual({composition_invalid:true,reason:'MODULE_APPLICABILITY'});
    await db.exec(`delete from public.checklist_template_applicability where id='${application}'`);
  });

  test('requires exact published source profile-version lineage and coherent supersession',async()=>{
    const sourceProfile='99999999-9999-4999-8999-999999997031',sourceVersion='99999999-9999-4999-8999-999999997032',orgProfile='11111111-1111-4111-8111-111111117061',orgVersion='11111111-1111-4111-8111-111111117062';
    await db.exec(`insert into public.checklist_composition_profiles(id,authority_scope,organisation_id,stable_code,name,lifecycle_stage,status,created_by_platform_user_id)values('${sourceProfile}','PLATFORM_SYSTEM',null,'SOURCE-PROFILE','Source profile','PRE_FLIGHT','PUBLISHED','${ids.platformUser}');insert into public.checklist_composition_profile_versions(id,profile_id,authority_scope,organisation_id,version_number,status,change_summary,applicability,source_provenance,composition_digest,created_by_platform_user_id)values('${sourceVersion}','${sourceProfile}','PLATFORM_SYSTEM',null,1,'PUBLISHED','Source','{}','{}','${'1'.repeat(64)}','${ids.platformUser}');insert into public.checklist_composition_profiles(id,authority_scope,organisation_id,stable_code,name,lifecycle_stage,status,source_system_profile_id,created_by_internal_user_id)values('${orgProfile}','ORGANISATION','${ids.org1}','ADOPTED','Adopted','PRE_FLIGHT','DRAFT','${sourceProfile}','${ids.actor1}')`);
    await expect(db.exec(`insert into public.checklist_composition_profile_versions(id,profile_id,authority_scope,organisation_id,version_number,status,change_summary,applicability,source_provenance,created_by_internal_user_id)values('${orgVersion}','${orgProfile}','ORGANISATION','${ids.org1}',1,'DRAFT','Missing exact lineage','{}','{}','${ids.actor1}')`)).rejects.toThrow(/INHERITANCE_INVALID/);
  });

  test('rejects tenant-private modules from PLATFORM_SYSTEM publication without partial membership',async()=>{
    const profile='99999999-9999-4999-8999-999999997011',profileVersion='99999999-9999-4999-8999-999999997012';
    await db.exec(`insert into public.checklist_composition_profiles(id,authority_scope,organisation_id,stable_code,name,lifecycle_stage,status,created_by_platform_user_id)values('${profile}','PLATFORM_SYSTEM',null,'INVALID-SYSTEM','Invalid system','PRE_FLIGHT','DRAFT','${ids.platformUser}');insert into public.checklist_composition_profile_versions(id,profile_id,authority_scope,organisation_id,version_number,status,change_summary,applicability,source_provenance,created_by_platform_user_id)values('${profileVersion}','${profile}','PLATFORM_SYSTEM',null,1,'DRAFT','Fixture only','{}','{}','${ids.platformUser}')`);
    const result=(await db.query(`select public.ftf_publish_platform_checklist_composition('${ids.platformUser}','${profileVersion}',1,'{"modules":[{"ordinal":1,"templateVersionId":"${ids.version1}","stableSectionCode":"tenant","required":true}]}') result`)).rows[0].result;
    expect(result).toEqual({composition_invalid:true,reason:'MODULE_AUTHORITY'});
    expect(Number((await db.query(`select count(*) count from public.checklist_composition_profile_modules where profile_version_id='${profileVersion}'`)).rows[0].count)).toBe(0);
  });

  test('keeps an exact immutable preview startable after a newer profile version is published',async()=>{
    const preview=(await db.query(`select public.ftf_preview_checklist_composition('${ids.org1}','${ids.actor1}','${ids.profileVersion}','${ids.location1}','PRE_FLIGHT','${ids.mission}','${ids.aircraft1}','${ids.asset1}','SPRAY') result`)).rows[0].result;
    const next='11111111-1111-4111-8111-111111117021';
    await db.exec(`insert into public.checklist_composition_profile_versions(id,profile_id,authority_scope,organisation_id,version_number,status,change_summary,applicability,source_provenance,supersedes_version_id,created_by_internal_user_id)values('${next}','${ids.profile}','ORGANISATION','${ids.org1}',2,'DRAFT','Superseding fixture','{"requiresMission":true,"manufacturer":"DJI","models":["T100"],"configurations":["SPRAY"]}','{"authority":"ORGANISATION_FIXTURE"}','${ids.profileVersion}','${ids.actor1}')`);
    const published=(await db.query(`select public.ftf_publish_checklist_composition('${ids.org1}','${ids.actor1}','${next}',1,'{"modules":[{"ordinal":1,"templateVersionId":"${ids.version1}","stableSectionCode":"aircraft","required":true}]}') result`)).rows[0].result;
    expect(published.record).toBeDefined();
    const started=(await db.query(`select public.ftf_start_composed_checklist_execution('${ids.org1}','${ids.actor1}','${ids.profileVersion}','${ids.location1}','PRE_FLIGHT','${ids.mission}','${ids.aircraft1}','${ids.asset1}','SPRAY','${preview.compositionDigest}') result`)).rows[0].result;
    expect(started.record).toEqual(expect.objectContaining({composition_profile_version_id:ids.profileVersion}));
    expect(started.composition.compositionDigest).toBe(preview.compositionDigest);
  });

  test('rejects start after authoritative fitted configuration changes since preview',async()=>{
    const preview=(await db.query(`select public.ftf_preview_checklist_composition('${ids.org1}','${ids.actor1}','${ids.profileVersion}','${ids.location1}','PRE_FLIGHT','${ids.mission}','${ids.aircraft1}','${ids.asset1}','SPRAY') result`)).rows[0].result;
    await db.exec(`update public.aircraft_equipment_kit_assignments set unassigned_at=now() where equipment_kit_id='${ids.kit}'`);
    const before=Number((await db.query(`select count(*) count from public.checklist_executions where composition_profile_version_id='${ids.profileVersion}'`)).rows[0].count);
    const result=(await db.query(`select public.ftf_start_composed_checklist_execution('${ids.org1}','${ids.actor1}','${ids.profileVersion}','${ids.location1}','PRE_FLIGHT','${ids.mission}','${ids.aircraft1}','${ids.asset1}','SPRAY','${preview.compositionDigest}') result`)).rows[0].result;
    expect(result).toEqual({configuration_mismatch:true});
    expect(Number((await db.query(`select count(*) count from public.checklist_executions where composition_profile_version_id='${ids.profileVersion}'`)).rows[0].count)).toBe(before);
    await db.exec(`update public.aircraft_equipment_kit_assignments set unassigned_at=null where equipment_kit_id='${ids.kit}'`);
  });

  test('derives exact configuration and freezes the selected module versions on start', async () => {
    const preview=(await db.query(`select public.ftf_preview_checklist_composition('${ids.org1}','${ids.actor1}','${ids.profileVersion}','${ids.location1}','PRE_FLIGHT','${ids.mission}','${ids.aircraft1}','${ids.asset1}','SPRAY') result`)).rows[0].result;
    expect(preview.assetContext.configurationCode).toBe('SPRAY');
    expect(preview.modules).toEqual([expect.objectContaining({templateVersionId:ids.version1,stableSectionCode:'aircraft'})]);
    const mismatch=(await db.query(`select public.ftf_preview_checklist_composition('${ids.org1}','${ids.actor1}','${ids.profileVersion}','${ids.location1}','PRE_FLIGHT','${ids.mission}','${ids.aircraft1}','${ids.asset1}','SPREAD') result`)).rows[0].result;
    expect(mismatch).toEqual({configuration_mismatch:true});
    const started=(await db.query(`select public.ftf_start_composed_checklist_execution('${ids.org1}','${ids.actor1}','${ids.profileVersion}','${ids.location1}','PRE_FLIGHT','${ids.mission}','${ids.aircraft1}','${ids.asset1}','SPRAY','${preview.compositionDigest}') result`)).rows[0].result;
    expect(started.record).toMatchObject({composition_profile_version_id:ids.profileVersion,template_version_id:ids.version1,status:'DRAFT'});
    expect(started.record.frozen_composition_snapshot.modules[0].templateVersionId).toBe(ids.version1);
    await expect(db.exec(`update public.checklist_composition_profile_modules set stable_section_code='changed' where profile_version_id='${ids.profileVersion}'`)).rejects.toThrow(/append-only/);
  });

  test('fails closed for another Base, tenant, unresolved configuration and duplicate item identity', async () => {
    const denied=(await db.query(`select public.ftf_preview_checklist_composition('${ids.org1}','${ids.actor1}','${ids.profileVersion}','${ids.location1b}','PRE_FLIGHT','${ids.mission}','${ids.aircraft1b}','${ids.asset1b}','SPRAY') result`)).rows[0].result;
    expect(denied).toEqual({not_found:true});
    const foreign=(await db.query(`select public.ftf_preview_checklist_composition('${ids.org2}','${ids.actor2}','${ids.profileVersion}','${ids.location2}','PRE_FLIGHT',null,'${ids.aircraft2}','${ids.asset2}',null) result`)).rows[0].result;
    expect(foreign).toEqual({forbidden:true});
    await db.exec(`update public.aircraft_equipment_kit_assignments set unassigned_at=now() where equipment_kit_id='${ids.kit}'`);
    const unresolved=(await db.query(`select public.ftf_preview_checklist_composition('${ids.org1}','${ids.actor1}','${ids.profileVersion}','${ids.location1}','PRE_FLIGHT','${ids.mission}','${ids.aircraft1}','${ids.asset1}',null) result`)).rows[0].result;
    expect(unresolved).toEqual({applicability_unresolved:true,reason:'CONFIGURATION_UNRESOLVED'});
  });

  test('rejects unauthorised Base and exact asset mismatches', async () => {
    const denied = (await db.query(`select public.ftf_read_applicable_checklist_templates('${ids.org1}','${ids.actor1}','${ids.location1b}','PRE_FLIGHT',null,'${ids.aircraft1b}','${ids.asset1b}',null) result`)).rows[0].result;
    expect(denied).toEqual({ not_found: true });
    const foreign = (await db.query(`select public.ftf_read_applicable_checklist_templates('${ids.org1}','${ids.actor1}','${ids.location1}','PRE_FLIGHT',null,'${ids.aircraft1}','${ids.asset2}',null) result`)).rows[0].result;
    expect(foreign).toEqual({ not_found: true });
  });

  test('keeps a started v1 instance completable after v2 publication and validates N/A', async () => {
    const started = (await db.query(`select public.ftf_start_checklist_execution('${ids.org1}','${ids.actor1}','${ids.version1}','${ids.location1}',null,'${ids.aircraft1}','${ids.asset1}',null,null,'{"lifecycleStage":"PRE_FLIGHT"}') result`)).rows[0].result.record;
    await db.exec(`insert into public.checklist_template_versions(id,organisation_id,template_id,version_number,status,effective_at,sections,authority_scope,created_by_internal_user_id)values('${ids.version2}','${ids.org1}','${ids.template}',2,'PUBLISHED',now()+interval '1 day','[{"id":"aircraft","items":[{"id":"arms","prompt":"Inspect arms","responseType":"CHECK","required":true,"authorityClass":"ORGANISATION_STANDARD"}]}]','ORGANISATION','${ids.actor1}')`);
    await expect(db.query(`select public.ftf_complete_checklist_execution('${ids.org1}','${ids.actor1}','${started.id}',1,'{"propeller":"N_A"}','{"internalUserId":"${ids.actor1}"}')`)).rejects.toThrow(/CHECKLIST_NA_NOT_ALLOWED/);
    const completed = (await db.query(`select public.ftf_complete_checklist_execution('${ids.org1}','${ids.actor1}','${started.id}',1,'{"propeller":"PASS"}','{"internalUserId":"${ids.actor1}"}') result`)).rows[0].result.record;
    expect(completed).toMatchObject({ status: 'SUBMITTED', template_version_id: ids.version1 });
  });

  test('creates an immutable pending finding without changing Aircraft or Fleet authority', async () => {
    const started = (await db.query(`select public.ftf_start_checklist_execution('${ids.org1}','${ids.actor1}','${ids.version1}','${ids.location1}',null,'${ids.aircraft1}','${ids.asset1}',null,null,'{"lifecycleStage":"PRE_FLIGHT"}') result`)).rows[0].result.record;
    const completed = (await db.query(`select public.ftf_complete_checklist_execution('${ids.org1}','${ids.actor1}','${started.id}',1,'{"propeller":"DEFECT"}','{"internalUserId":"${ids.actor1}"}') result`)).rows[0].result;
    expect(completed).toMatchObject({ findingCount: 1, handoffState: 'DEFECT_HANDOFF_PENDING' });
    const finding = (await db.query(`select * from public.checklist_findings where execution_id='${started.id}'`)).rows[0];
    expect(finding).toMatchObject({ aircraft_id: ids.aircraft1, maintainable_asset_id: ids.asset1, handoff_state: 'DEFECT_HANDOFF_PENDING' });
    await db.exec(`insert into public.checklist_corrective_actions(id,organisation_id,execution_id,item_id,title,status,row_version,created_by_internal_user_id,updated_by_internal_user_id)values('${ids.action}','${ids.org1}','${started.id}','propeller','Repair propeller','OPEN',1,'${ids.actor1}','${ids.actor1}')`);
    const resolved=(await db.query(`select public.ftf_update_checklist_corrective_action('${ids.org1}','${ids.actor1}','${ids.action}',1,'RESOLVED','Propeller replaced and inspected.','${ids.person1}') result`)).rows[0].result.record;
    expect(resolved).toMatchObject({status:'RESOLVED',row_version:2,resolved_by_personnel_id:ids.person1});
    await db.exec('set role service_role');
    await expect(db.query(`select public.ftf_write_checklist_corrective_action('${ids.org1}','${ids.actor1}','CREATE',null,0,'{"executionId":"${ids.execution}","itemId":"forged","title":"forged"}')`)).rejects.toThrow(/permission denied/);
    await db.exec('reset role');
    await expect(db.exec(`update public.checklist_findings set handoff_state='DEFECT_CREATED' where id='${finding.id}'`)).rejects.toThrow(/append-only/);
    expect((await db.query(`select manufacturer,model from public.aircraft where id='${ids.aircraft1}'`)).rows[0]).toEqual({ manufacturer: 'DJI', model: 'T100' });
  });

  test('does not let an unrelated PRE_FLIGHT template block Mission readiness', async () => {
    const readiness = (await db.query(`select public.ftf_evaluate_mission_checklist_readiness('${ids.org1}','99999999-9999-4999-8999-999999999999','PRE_FLIGHT') result`)).rows[0].result;
    expect(readiness).toEqual({ ready: true, blockers: [] });
  });

  test('presents and starts only the latest effective applicable version', async () => {
    const version3='11111111-1111-4111-8111-111111114103',app3='11111111-1111-4111-8111-111111114203';
    await db.exec(`insert into public.checklist_template_versions(id,organisation_id,template_id,version_number,status,effective_at,sections,authority_scope,created_by_internal_user_id)values('${version3}','${ids.org1}','${ids.template}',3,'PUBLISHED',now(),'[{"id":"aircraft","items":[{"id":"arms","prompt":"Inspect arms","responseType":"CHECK","required":true,"authorityClass":"ORGANISATION_STANDARD"}]}]','ORGANISATION','${ids.actor1}');insert into public.checklist_template_applicability(id,template_version_id,authority_scope,organisation_id,operating_location_id,lifecycle_stage,readiness_required,aircraft_id,maintainable_asset_id)values('${app3}','${version3}','ORGANISATION','${ids.org1}','${ids.location1}','PRE_FLIGHT',true,'${ids.aircraft1}','${ids.asset1}');`);
    const applicable=(await db.query(`select public.ftf_read_applicable_checklist_templates('${ids.org1}','${ids.actor1}','${ids.location1}','PRE_FLIGHT',null,'${ids.aircraft1}','${ids.asset1}',null,null,null) result`)).rows[0].result.records;
    expect(applicable.map(row=>row.version.id)).toEqual([version3]);
    const oldStart=(await db.query(`select public.ftf_start_checklist_execution('${ids.org1}','${ids.actor1}','${ids.version1}','${ids.location1}',null,'${ids.aircraft1}','${ids.asset1}',null,null,'{"lifecycleStage":"PRE_FLIGHT"}') result`)).rows[0].result;
    expect(oldStart).toEqual({not_found:true});
  });
});

if (!child) test('passes Checklist authority reconciliation PGlite behavior', () => {
  try {
    execFileSync(process.execPath, [__filename], { cwd: root, env: { ...process.env, CHECKLIST_RECONCILIATION_PGLITE_CHILD: '1' }, stdio: 'pipe' });
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
