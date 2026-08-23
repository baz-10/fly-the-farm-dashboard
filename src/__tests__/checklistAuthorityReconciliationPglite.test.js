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
};

jest.setTimeout(120000);

if (child) describe('Checklist authority reconciliation PostgreSQL behavior', () => {
  let db;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create schema auth;create table auth.users(id uuid primary key,email text unique);create function auth.uid()returns uuid language sql stable as $$select null::uuid$$;create role anon;create role authenticated;create role service_role;`);
    await db.exec(migration('20260801000000_production_beta_foundation.sql'));
    await db.exec(`
      create table public.platform_users(id uuid primary key,display_name text not null);
      create table public.personnel(id uuid primary key,organisation_id uuid not null,internal_user_id uuid,full_name text not null,is_active boolean not null default true,archived_at timestamptz,unique(organisation_id,id));
      create table public.aircraft(id uuid primary key,organisation_id uuid not null,operating_location_id uuid not null,manufacturer text,model text,archived_at timestamptz,unique(organisation_id,id));
      create table public.equipment_kits(id uuid primary key,organisation_id uuid not null,operating_location_id uuid not null,archived_at timestamptz);
      create table public.fleet_assets(id uuid primary key,organisation_id uuid not null,operating_location_id uuid not null,archived_at timestamptz);
      create table public.maintainable_asset_registry(id uuid primary key,organisation_id uuid not null,aircraft_id uuid,equipment_kit_id uuid,fleet_asset_id uuid,tracking_state text not null default 'ACTIVE',unique(organisation_id,id));
      create table public.asset_systems(id uuid primary key,organisation_id uuid not null,maintainable_asset_id uuid not null,archived_at timestamptz,unique(organisation_id,id));
      create table public.component_positions(id uuid primary key,organisation_id uuid not null,system_id uuid not null,archived_at timestamptz,unique(organisation_id,id));
      create table public.mission_aircraft_assignments(id uuid primary key default gen_random_uuid(),organisation_id uuid not null,operating_location_id uuid not null,mission_id uuid not null,aircraft_id uuid not null,unassigned_at timestamptz);
      create table public.mission_equipment_kit_assignments(id uuid primary key default gen_random_uuid(),organisation_id uuid not null,operating_location_id uuid not null,mission_id uuid not null,equipment_kit_id uuid not null,unassigned_at timestamptz);
      create table public.test_actor_permissions(organisation_id uuid,actor_id uuid,code text,primary key(organisation_id,actor_id,code));
      create function public.ftf_actor_has_permission(p_org uuid,p_actor uuid,p_code text)returns boolean language sql stable as $$select exists(select 1 from public.test_actor_permissions where organisation_id=p_org and actor_id=p_actor and code=p_code)$$;
      create function public.ftf_operational_location_allowed(p_org uuid,p_actor uuid,p_location uuid)returns boolean language sql stable as $$select(p_org='${ids.org1}'and p_actor='${ids.actor1}'and p_location='${ids.location1}')or(p_org='${ids.org2}'and p_actor='${ids.actor2}'and p_location='${ids.location2}')$$;
      create function public.ftf_maintenance_asset_location_allowed(p_org uuid,p_actor uuid,p_asset uuid)returns boolean language sql stable as $$select(p_org='${ids.org1}'and p_actor='${ids.actor1}'and p_asset='${ids.asset1}')or(p_org='${ids.org2}'and p_actor='${ids.actor2}'and p_asset='${ids.asset2}')$$;
      insert into auth.users values('${ids.auth1}','one@example.com'),('${ids.auth2}','two@example.com');
      insert into public.organisations(id,organisation_id,name)values('${ids.org1}','${ids.org1}','One'),('${ids.org2}','${ids.org2}','Two');
      insert into public.operating_locations(id,organisation_id,name)values('${ids.location1}','${ids.org1}','Allowed'),('${ids.location1b}','${ids.org1}','Denied'),('${ids.location2}','${ids.org2}','Other');
      insert into public.internal_users(id,organisation_id,auth_user_id,display_name)values('${ids.actor1}','${ids.org1}','${ids.auth1}','One'),('${ids.actor2}','${ids.org2}','${ids.auth2}','Two');
      insert into public.personnel values('${ids.person1}','${ids.org1}','${ids.actor1}','One Pilot',true,null),('${ids.person2}','${ids.org2}','${ids.actor2}','Two Pilot',true,null);
      insert into public.aircraft values('${ids.aircraft1}','${ids.org1}','${ids.location1}','DJI','T100',null),('${ids.aircraft1b}','${ids.org1}','${ids.location1b}','DJI','T100',null),('${ids.aircraft2}','${ids.org2}','${ids.location2}','DJI','T100',null);
      insert into public.maintainable_asset_registry values('${ids.asset1}','${ids.org1}','${ids.aircraft1}',null,null,'ACTIVE'),('${ids.asset1b}','${ids.org1}','${ids.aircraft1b}',null,null,'ACTIVE'),('${ids.asset2}','${ids.org2}','${ids.aircraft2}',null,null,'ACTIVE');
      insert into public.platform_users values('${ids.platformUser}','Platform Curator');
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
    const after = (await db.query(`select responses::text responses,failure_summary::text failures,signoff_snapshot::text signoff from public.checklist_executions where id='${ids.execution}'`)).rows[0];
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('HISTORICAL_EXECUTION_REWRITTEN');
    await db.exec(`insert into public.test_actor_permissions values
      ('${ids.org1}','${ids.actor1}','checklist_templates.read'),('${ids.org1}','${ids.actor1}','checklist_templates.author'),('${ids.org1}','${ids.actor1}','checklist_templates.publish'),('${ids.org1}','${ids.actor1}','checklists.execute'),('${ids.org1}','${ids.actor1}','checklists.read_completed'),('${ids.org1}','${ids.actor1}','checklist_findings.manage');`);
  });

  test('maps historical templates to organisation authority and supports customer-immutable platform records', async () => {
    expect((await db.query(`select authority_scope from public.checklist_templates where id='${ids.template}'`)).rows[0].authority_scope).toBe('ORGANISATION');
    await db.exec(`insert into public.checklist_templates(authority_scope,organisation_id,stable_code,name,category,status,created_by_platform_user_id,updated_by_platform_user_id)values('PLATFORM_SYSTEM',null,'DJI-T100','T100 System','PRE_FLIGHT','PUBLISHED','${ids.platformUser}','${ids.platformUser}')`);
    const result = (await db.query(`select public.ftf_write_checklist_template('${ids.org1}','${ids.actor1}','UPDATE',(select id from public.checklist_templates where stable_code='DJI-T100'),1,'{"name":"forged","category":"PRE_FLIGHT"}') result`)).rows[0].result;
    expect(result).toEqual({ conflict: true });
  });

  test('rejects unauthorised Base and exact asset mismatches', async () => {
    const denied = (await db.query(`select public.ftf_read_applicable_checklist_templates('${ids.org1}','${ids.actor1}','${ids.location1b}','PRE_FLIGHT',null,'${ids.aircraft1b}','${ids.asset1b}',null) result`)).rows[0].result;
    expect(denied).toEqual({ not_found: true });
    const foreign = (await db.query(`select public.ftf_read_applicable_checklist_templates('${ids.org1}','${ids.actor1}','${ids.location1}','PRE_FLIGHT',null,'${ids.aircraft1}','${ids.asset2}',null) result`)).rows[0].result;
    expect(foreign).toEqual({ not_found: true });
  });

  test('keeps a started v1 instance completable after v2 publication and validates N/A', async () => {
    await db.exec(`
      insert into public.checklist_template_applicability(id,template_version_id,authority_scope,organisation_id,operating_location_id,lifecycle_stage,readiness_required,aircraft_id,maintainable_asset_id)values('${ids.applicability}','${ids.version1}','ORGANISATION','${ids.org1}','${ids.location1}','PRE_FLIGHT',true,'${ids.aircraft1}','${ids.asset1}');
    `);
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
