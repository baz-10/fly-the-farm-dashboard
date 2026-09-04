const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { TextDecoder, TextEncoder } = require('util');

global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;

const { PGlite } = require('@electric-sql/pglite');

const root = path.resolve(__dirname, '../..');
// PGlite 0.5's CommonJS wildcard export appends a duplicate extension, so load
// the bundled extension by its repository-controlled absolute path.
const { pgcrypto } = require(path.join(root, 'node_modules/@electric-sql/pglite/dist/contrib/pgcrypto.cjs'));
const migrations = path.join(root, 'supabase/migrations');
const child = process.env.MISSION_SCOPE_REVISION_PGLITE_CHILD === '1';
const tests = [];

if (child) {
  global.jest = { setTimeout: () => {} };
  global.expect = require('expect');
  global.test = (name, run) => tests.push({ name, run });
}

jest.setTimeout(300000);

const ids = {
  authA: '10000000-0000-4000-8000-000000000001',
  authB: '10000000-0000-4000-8000-000000000002',
  client: '20000000-0000-4000-8000-000000000001',
  property: '30000000-0000-4000-8000-000000000001',
  fieldA: '40000000-0000-4000-8000-000000000001',
  fieldB: '40000000-0000-4000-8000-000000000002',
  foreignField: '40000000-0000-4000-8000-000000000003',
  job: '50000000-0000-4000-8000-000000000001',
  mission: '60000000-0000-4000-8000-000000000001',
  mission2: '60000000-0000-4000-8000-000000000002',
  personnel: '70000000-0000-4000-8000-000000000001',
  jsa1: '80000000-0000-4000-8000-000000000001',
  jsa2: '80000000-0000-4000-8000-000000000002',
};

const scalar = async (db, sql, params = []) => (await db.query(sql, params)).rows[0]?.value;

if (child) {
  let db;
  let orgA;
  let orgB;
  let actorA;
  let actorB;
  let baseA;
  let pack1;
  let pack2;
  let submitted1;
  let authorised;

  const call = async (name, args) => scalar(
    db,
    `select public.${name}(${args.map((_, index) => `$${index + 1}`).join(',')}) as value`,
    args,
  );

  test('executes the repository migration chain and exposes checked authority helpers', async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    await db.exec(`
      create schema auth;
      create table auth.users(id uuid primary key,email text unique);
      create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
      create role anon;
      create role authenticated;
      create role service_role;
      create extension if not exists pgcrypto;
    `);
    const excluded = new Set([
      '20260804162000_production_beta_platform_identity_reconciliation.sql',
      '20260805131000_personnel_compliance_evidence_storage.sql',
      '20260805144000_checklist_evidence_storage.sql',
    ]);
    for (const name of fs.readdirSync(migrations).filter(name => /^\d{14}_.+\.sql$/.test(name)).sort()) {
      if (!excluded.has(name)) await db.exec(fs.readFileSync(path.join(migrations, name), 'utf8'));
    }
    const result = await db.query(`select
      to_regprocedure('public.ftf_lock_mission_package_aggregate(uuid,uuid)') is not null lock_helper,
      to_regprocedure('public.ftf_resolve_effective_mission_authorisation(uuid,uuid)') is not null authority_helper,
      to_regprocedure('public.ftf_project_mission_pack(uuid,uuid,uuid)') is not null pack_projection`);
    expect(result.rows[0]).toEqual({ lock_helper: true, authority_helper: true, pack_projection: true });
  });

  test('bootstraps two tenants and seeds one multi-Field Mission with exact JSA revisions', async () => {
    await db.exec(`insert into auth.users(id,email) values('${ids.authA}','a@example.test'),('${ids.authB}','b@example.test')`);
    const a = await call('ftf_bootstrap_production_beta_organisation', [ids.authA, 'Organisation A', 'Admin A', 'Base A', null, 'Australia/Brisbane']);
    const b = await call('ftf_bootstrap_production_beta_organisation', [ids.authB, 'Organisation B', 'Admin B', 'Base B', null, 'Australia/Brisbane']);
    orgA = a.organisation_id; actorA = a.internal_user_id; baseA = a.operating_location_id;
    orgB = b.organisation_id; actorB = b.internal_user_id;
    await db.exec(`
      insert into public.clients(id,organisation_id,name) values('${ids.client}','${orgA}','Client A');
      insert into public.properties(id,organisation_id,client_id,name) values('${ids.property}','${orgA}','${ids.client}','Property A');
      insert into public.fields(id,organisation_id,property_id,name,area_hectares) values
        ('${ids.fieldA}','${orgA}','${ids.property}','Field A',10),
        ('${ids.fieldB}','${orgA}','${ids.property}','Field B',20),
        ('${ids.foreignField}','${orgA}','${ids.property}','Not in Job',30);
      insert into public.jobs(id,organisation_id,client_id,property_id,reference) values('${ids.job}','${orgA}','${ids.client}','${ids.property}','JOB-A');
      insert into public.job_fields(organisation_id,property_id,job_id,field_id,target_area_hectares) values
        ('${orgA}','${ids.property}','${ids.job}','${ids.fieldA}',9),
        ('${orgA}','${ids.property}','${ids.job}','${ids.fieldB}',19);
      insert into public.missions(id,organisation_id,job_id,operating_location_id,mission_number) values
        ('${ids.mission}','${orgA}','${ids.job}','${baseA}','MIS-A'),
        ('${ids.mission2}','${orgA}','${ids.job}','${baseA}','MIS-B');
      insert into public.mission_jsa_revisions(
        id,organisation_id,operating_location_id,mission_id,version_number,
        template_id,template_version_id,template_version,policy_id,policy_version_id,policy_version,
        policy_snapshot,template_snapshot,created_by_internal_user_id
      )
      select '${ids.jsa1}', '${orgA}', '${baseA}', '${ids.mission}', 1,
        'b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000101',1,
        p.id,pv.id,pv.version_number,to_jsonb(pv),to_jsonb(tv),'${actorA}'
      from public.organisation_jsa_policies p
      join public.organisation_jsa_policy_versions pv on pv.organisation_id=p.organisation_id and pv.policy_id=p.id
      join public.platform_jsa_template_versions tv on tv.id='b1000000-0000-4000-8000-000000000101'
      where p.organisation_id='${orgA}';
      insert into public.mission_chemical_plan_revisions(
        organisation_id,operating_location_id,mission_id,version_number,treatment_area_ha,
        application_volume_l_ha,tank_capacity_l,total_spray_volume_l,water_required_l,
        hectares_per_batch,batch_count,created_by_internal_user_id
      ) values('${orgA}','${baseA}','${ids.mission}',1,28,10,100,280,250,10,3,'${actorA}');
    `);
    await db.exec(`create or replace function public.ftf_evaluate_mission_readiness(p_organisation_id uuid,p_mission_id uuid,p_evaluated_at timestamptz default now()) returns jsonb language sql stable as $$select jsonb_build_object('ready',true,'overallState','READY','blockers','[]'::jsonb,'warnings','[]'::jsonb,'evidenceManifest',jsonb_build_object('planning',jsonb_build_object('chemicals',jsonb_build_object('revision',1),'aircraft','[]'::jsonb,'equipmentKits','[]'::jsonb,'personnel',jsonb_build_object('assignments','[]'::jsonb)),'preflight',jsonb_build_object('jsa',jsonb_build_object('id','${ids.jsa1}'),'observedWeather',null)))$$`);
  });

  test('enforces the exact Job Field subset and detects stale evidence written through an old table', async () => {
    expect(await call('ftf_save_mission_package_scope', [orgA, actorA, ids.mission, 0, JSON.stringify([ids.foreignField])]))
      .toMatchObject({ error: 'MISSION_SCOPE_FIELD_NOT_IN_JOB' });
    pack1 = await call('ftf_save_mission_package_scope', [orgA, actorA, ids.mission, 0, JSON.stringify([ids.fieldA, ids.fieldB])]);
    expect(pack1.record.version_number).toBe(1);
    await db.exec(`
      insert into public.mission_jsa_revisions(
        id,organisation_id,operating_location_id,mission_id,version_number,
        template_id,template_version_id,template_version,policy_id,policy_version_id,policy_version,
        policy_snapshot,template_snapshot,created_by_internal_user_id
      ) select '${ids.jsa2}',organisation_id,operating_location_id,mission_id,2,template_id,template_version_id,template_version,
        policy_id,policy_version_id,policy_version,policy_snapshot,template_snapshot,created_by_internal_user_id
      from public.mission_jsa_revisions where id='${ids.jsa1}';
    `);
    expect(await call('ftf_submit_mission_package', [orgA, actorA, ids.mission, pack1.record.id, 1, pack1.record.evidence_digest]))
      .toMatchObject({ error: 'MISSION_PACKAGE_EVIDENCE_STALE', current_version: 1 });
  });

  test('rejects an ineligible CRP, records one decision, and rejects duplicate decisions', async () => {
    pack2 = await call('ftf_save_mission_package_scope', [orgA, actorA, ids.mission, 1, JSON.stringify([ids.fieldA])]);
    submitted1 = await call('ftf_submit_mission_package', [orgA, actorA, ids.mission, pack2.record.id, 2, pack2.record.evidence_digest]);
    expect(submitted1.record.version_number).toBe(3);
    expect(await call('ftf_decide_mission_package', [orgA, actorA, ids.mission, submitted1.record.id, 3, submitted1.record.evidence_digest, 'AUTHORISED', 'Reviewed exact evidence.']))
      .toMatchObject({ error: 'MISSION_CRP_INELIGIBLE' });
    await db.exec(`
      insert into public.personnel(id,organisation_id,internal_user_id,full_name,created_by_internal_user_id,updated_by_internal_user_id)
      values('${ids.personnel}','${orgA}','${actorA}','Eligible CRP','${actorA}','${actorA}');
      insert into public.personnel_operating_locations(organisation_id,personnel_id,operating_location_id,created_by_internal_user_id)
      values('${orgA}','${ids.personnel}','${baseA}','${actorA}');
    `);
    authorised = await call('ftf_decide_mission_package', [orgA, actorA, ids.mission, submitted1.record.id, 3, submitted1.record.evidence_digest, 'AUTHORISED', 'Reviewed exact evidence.']);
    expect(authorised.record.decision).toBe('AUTHORISED');
    expect(await call('ftf_decide_mission_package', [orgA, actorA, ids.mission, submitted1.record.id, 3, submitted1.record.evidence_digest, 'REJECTED', 'Duplicate.']))
      .toMatchObject({ error: 'MISSION_PACKAGE_DECISION_CONFLICT' });
  });

  test('bounds decisions to returned packages, exposes current revision, and denies cross-tenant reads', async () => {
    const history = await call('ftf_read_mission_package_history', [orgA, actorA, ids.mission]);
    expect(history.current_revision).toBe(3);
    const packageIds = new Set(history.packages.map(row => row.id));
    expect(history.decisions.every(row => packageIds.has(row.package_revision_id))).toBe(true);
    expect(await call('ftf_read_mission_package_history', [orgB, actorB, ids.mission]))
      .toMatchObject({ error: 'MISSION_PACKAGE_NOT_FOUND' });
  });

  const heldAdvisoryLocks = () => scalar(db, `
    select count(*)::integer as value
    from pg_locks
    where pid=pg_backend_pid() and locktype='advisory' and granted
  `);

  test('preserves one aggregate scope for material evidence inserts and deletes', async () => {
    await db.exec(`
      create table public.mission_material_lock_probe(
        id uuid primary key,
        organisation_id uuid not null,
        mission_id uuid not null
      );
      create trigger mission_package_aggregate_lock
        before insert or update or delete on public.mission_material_lock_probe
        for each row execute function public.ftf_lock_mission_material_evidence();
    `);

    await db.exec('begin');
    await db.exec(`insert into public.mission_material_lock_probe values('90000000-0000-4000-8000-000000000001','${orgA}','${ids.mission}')`);
    expect(await heldAdvisoryLocks()).toBe(2);
    await db.exec('commit');

    await db.exec('begin');
    await db.exec(`delete from public.mission_material_lock_probe where id='90000000-0000-4000-8000-000000000001'`);
    expect(await heldAdvisoryLocks()).toBe(2);
    await db.exec('rollback');
  });

  test('locks both old and new Mission aggregates when material evidence is reparented', async () => {
    await db.exec('begin');
    await db.exec(`update public.mission_material_lock_probe set mission_id='${ids.mission2}' where id='90000000-0000-4000-8000-000000000001'`);
    expect(await heldAdvisoryLocks()).toBe(3);
    expect(await scalar(db, `select mission_id::text as value from public.mission_material_lock_probe where id='90000000-0000-4000-8000-000000000001'`)).toBe(ids.mission2);
    await db.exec('rollback');
  });

  test('makes the canonical revisions immutable and installs one shared lock trigger protocol', async () => {
    await expect(db.exec(`update public.mission_pack_revisions set generated_at=now() where id='${submitted1.record.id}'`)).rejects.toThrow(/append-only/);
    await expect(db.exec(`update public.mission_authorisation_revisions set declaration='changed' where id='${authorised.record.id}'`)).rejects.toThrow(/append-only/);
    const triggers = await db.query(`select c.relname table_name from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and t.tgname='mission_package_aggregate_lock' order by c.relname`);
    const names = triggers.rows.map(row => row.table_name);
    for (const table of ['missions','jobs','job_fields','fields','properties','mission_jsa_revisions','mission_weather_selections','mission_weather_forecast_selections','mission_aircraft_assignments','mission_equipment_kit_assignments','aircraft','equipment_kits','checklist_executions','checklist_corrective_actions']) {
      expect(names).toContain(table);
    }
    const triggerDefinition = await scalar(db, `select pg_get_functiondef('public.ftf_lock_mission_material_evidence()'::regprocedure) as value`);
    expect(triggerDefinition).toMatch(/to_jsonb\(old\)/i);
    expect(triggerDefinition).toMatch(/to_jsonb\(new\)/i);
    expect(triggerDefinition).toMatch(/order by[\s\S]*organisation_id[\s\S]*mission_id/i);
    const protectedFunctions = [
      'ftf_save_mission_package_scope','ftf_submit_mission_package','ftf_decide_mission_package',
      'ftf_authorise_mission','ftf_generate_mission_pack','ftf_save_mission_map',
      'ftf_create_mission_map_source_file','ftf_save_mission_personnel','ftf_save_mission_chemical_plan',
      'ftf_save_mission_jsa','ftf_approve_mission_jsa','ftf_create_mission_weather_observation',
      'ftf_select_mission_weather_observation','ftf_create_mission_weather_forecast',
      'ftf_select_mission_weather_forecast',
    ];
    const definitions = await db.query(`select proname,pg_get_functiondef(oid) definition from pg_proc where proname=any($1)`, [protectedFunctions]);
    expect(definitions.rows.map(row => row.proname).sort()).toEqual([...protectedFunctions].sort());
    for (const row of definitions.rows) expect(row.definition).toContain('ftf_lock_mission_package_aggregate');
  });

  test('keeps old consumers on the current authorised package after a later rejection', async () => {
    const preparing = await call('ftf_save_mission_package_scope', [orgA, actorA, ids.mission, 3, JSON.stringify([ids.fieldB])]);
    const awaiting = await call('ftf_submit_mission_package', [orgA, actorA, ids.mission, preparing.record.id, 4, preparing.record.evidence_digest]);
    const rejected = await call('ftf_decide_mission_package', [orgA, actorA, ids.mission, awaiting.record.id, 5, awaiting.record.evidence_digest, 'REJECTED', 'Map must change.']);
    expect(rejected.record.decision).toBe('REJECTED');
    const closeout = await call('ftf_read_mission_operational_closeout', [orgA, ids.mission]);
    expect(closeout.authorisation.id).toBe(authorised.record.id);
    expect(closeout.authorisation.decision).toBe('AUTHORISED');
    expect(closeout.authorisation.evidence_manifest.planning).toBeTruthy();
    const pack = await db.query(`select value from public.ftf_read_mission_pack($1,$2,false) value`, [orgA, ids.mission]);
    expect(pack.rows[0].value.id).toBe(submitted1.record.id);
    expect(pack.rows[0].value.pack_snapshot.evidence.planning).toBeTruthy();
    expect(pack.rows[0].value.pack_snapshot.sourceManifest).toBeTruthy();
    const report = await call('ftf_request_report_artefact', [orgA, actorA, ids.mission, 'MISSION_PACK', 'mission-pack-current-authority']);
    expect(report.artefact.evidence_manifest.missionPackRevision.id).toBe(submitted1.record.id);
  });

  test('keeps legacy operational writes compatible with the projected planning evidence', async () => {
    const resources = await call('ftf_save_mission_actual_resources', [orgA, actorA, ids.mission, 0, JSON.stringify({ aircraft: [] })]);
    const chemicals = await call('ftf_save_mission_actual_chemicals', [orgA, actorA, ids.mission, 0, JSON.stringify({ changedFromPlan: false })]);
    expect(resources.record.planned_resources_snapshot).toBeTruthy();
    expect(chemicals.record.planned_chemicals_snapshot).toBeTruthy();
  });

  test('lets the legacy authorise/generate route advance the canonical stream without hiding its version from the new API', async () => {
    await db.exec(`create or replace function public.ftf_evaluate_mission_readiness(p_organisation_id uuid,p_mission_id uuid,p_evaluated_at timestamptz default now()) returns jsonb language sql stable as $$select jsonb_build_object('ready',true,'overallState','READY','blockers','[]'::jsonb,'warnings','[]'::jsonb,'evidenceManifest',jsonb_build_object('planning',jsonb_build_object('chemicals',jsonb_build_object('revision',1),'aircraft','[]'::jsonb,'equipmentKits','[]'::jsonb,'personnel',jsonb_build_object('assignments',jsonb_build_array(jsonb_build_object('assignmentRole','pilot_in_command','personnelId','${ids.personnel}','snapshot',jsonb_build_object('id','${ids.personnel}'))))),'preflight',jsonb_build_object('jsa',jsonb_build_object('id','${ids.jsa2}'),'observedWeather',null)))$$`);
    const legacyAuthority = await call('ftf_authorise_mission', [orgA, actorA, ids.mission, 2, 'Legacy route authority.']);
    expect(legacyAuthority.record.decision).toBe('AUTHORISED');
    const legacyPack = await call('ftf_generate_mission_pack', [orgA, actorA, ids.mission, legacyAuthority.record.id, 5]);
    expect(legacyPack.record.version_number).toBe(6);
    const history = await call('ftf_read_mission_package_history', [orgA, actorA, ids.mission]);
    expect(history.current_revision).toBe(6);
    expect(history.packages.every(row => row.revision_number <= history.current_revision)).toBe(true);
    const current = await db.query(`select value from public.ftf_read_mission_pack($1,$2,false) value`, [orgA, ids.mission]);
    expect(current.rows[0].value.id).toBe(legacyPack.record.id);
    expect(current.rows[0].value.pack_snapshot.evidence.planning).toBeTruthy();
  });

  test('closes the database', async () => { await db.close(); });
} else {
  test('passes repeatable Mission scope/CRP authority behavior checks in PostgreSQL', () => {
    try {
      execFileSync(process.execPath, [__filename], {
        cwd: root,
        env: { ...process.env, MISSION_SCOPE_REVISION_PGLITE_CHILD: '1' },
        stdio: 'pipe',
      });
    } catch (error) {
      throw new Error(`${error.stdout || ''}${error.stderr || ''}` || error.message);
    }
  });
}

if (child) {
  (async () => {
    for (const { name, run } of tests) {
      await run();
      process.stdout.write(`PASS ${name}\n`);
    }
  })().catch(error => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
}
