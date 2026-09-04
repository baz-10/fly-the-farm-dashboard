const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { TextDecoder, TextEncoder } = require('util');

global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;

const { PGlite } = require('@electric-sql/pglite');

const root = path.join(__dirname, '../..');
const file = path.join(root, 'supabase/migrations/20260905120000_mission_aircraft_day_actuals.sql');
const migrations = path.join(root, 'supabase/migrations');
const migration = () => fs.readFileSync(file, 'utf8').toLowerCase();
const child = process.env.MISSION_AIRCRAFT_ACTUALS_PGLITE_CHILD === '1';
const tests = [];

if (child) {
  global.jest = { setTimeout: () => {} };
  global.expect = require('expect');
  global.test = (name, run) => tests.push({ name, run });
}

jest.setTimeout(300000);

test('daily totals remain authoritative while flights are optional', () => {
  const sql = migration();
  expect(sql).toContain('numeric(10,4)');
  expect(sql).toContain('mission_aircraft_day_actuals');
  expect(sql).toContain('mission_flight_actuals');
  expect(sql).toContain('aircraft_flight_total_mismatch');
});

test('signed-off projection is idempotent by source identity', () => {
  const sql = migration();
  expect(sql).toContain("'mission_aircraft_day_actual'");
  expect(sql).toContain('source_record_id');
  expect(sql).toContain('flight_hours');
  expect(sql).toContain('ftf_write_asset_maintenance_command');
});

test('flight-line evidence keeps one immutable artefact with bounded explicit attributions', () => {
  const sql = migration();
  expect(sql).toContain('mission_operational_import_attributions');
  expect(sql).toContain('attribution_confidence');
  expect(sql).toContain('mission_operational_imports');
  expect(sql).toContain('application/vnd.google-earth.kmz');
  expect(sql).not.toMatch(/derived_statistics[^;]*(flight_hours|duration_hours)/i);
});

const ids = {
  authA: '10000000-0000-4000-8000-000000000001',
  authB: '10000000-0000-4000-8000-000000000002',
  baseAlt: '10000000-0000-4000-8000-000000000003',
  client: '20000000-0000-4000-8000-000000000001',
  property: '30000000-0000-4000-8000-000000000001',
  field: '40000000-0000-4000-8000-000000000001',
  job: '50000000-0000-4000-8000-000000000001',
  mission: '60000000-0000-4000-8000-000000000001',
  missionOther: '60000000-0000-4000-8000-000000000002',
  personnel: '70000000-0000-4000-8000-000000000001',
  jsa: '80000000-0000-4000-8000-000000000001',
  pack: '90000000-0000-4000-8000-000000000001',
  dayEarly: 'a0000000-0000-4000-8000-000000000000',
  dayA: 'a0000000-0000-4000-8000-000000000001',
  dayB: 'a0000000-0000-4000-8000-000000000002',
  dayC: 'a0000000-0000-4000-8000-000000000003',
  dayD: 'a0000000-0000-4000-8000-000000000004',
  dayE: 'a0000000-0000-4000-8000-000000000005',
  dayLater: 'a0000000-0000-4000-8000-000000000006',
  aircraftA: 'b0000000-0000-4000-8000-000000000001',
  aircraftB: 'b0000000-0000-4000-8000-000000000002',
  aircraftC: 'b0000000-0000-4000-8000-000000000003',
  assignmentA: 'c0000000-0000-4000-8000-000000000001',
  assignmentB: 'c0000000-0000-4000-8000-000000000002',
  assignmentC: 'c0000000-0000-4000-8000-000000000003',
  meterA: 'd0000000-0000-4000-8000-000000000001',
  meterB: 'd0000000-0000-4000-8000-000000000002',
  meterC: 'd0000000-0000-4000-8000-000000000003',
};

const scalar = async (db, sql, params = []) => (await db.query(sql, params)).rows[0]?.value;

if (child) {
  let db;
  let orgA;
  let orgB;
  let actorA;
  let actorB;
  let baseA;

  const call = async (name, args) => scalar(
    db,
    `select public.${name}(${args.map((_, index) => `$${index + 1}`).join(',')}) as value`,
    args,
  );

  test('executes the migration chain and seeds exact Mission, Base, package and aircraft scope', async () => {
    const { pgcrypto } = require(path.join(root, 'node_modules/@electric-sql/pglite/dist/contrib/pgcrypto.cjs'));
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
    for (const name of fs.readdirSync(migrations).filter((name) => /^\d{14}_.+\.sql$/.test(name)).sort()) {
      if (!excluded.has(name)) await db.exec(fs.readFileSync(path.join(migrations, name), 'utf8'));
    }
    await db.exec(`insert into auth.users(id,email) values('${ids.authA}','a@example.test'),('${ids.authB}','b@example.test')`);
    const a = await call('ftf_bootstrap_production_beta_organisation', [ids.authA, 'Organisation A', 'Admin A', 'Base A', null, 'Australia/Brisbane']);
    const b = await call('ftf_bootstrap_production_beta_organisation', [ids.authB, 'Organisation B', 'Admin B', 'Base B', null, 'Australia/Brisbane']);
    orgA = a.organisation_id; actorA = a.internal_user_id; baseA = a.operating_location_id;
    orgB = b.organisation_id; actorB = b.internal_user_id;
    await db.exec(`
      insert into public.operating_locations(id,organisation_id,name,timezone)
        values('${ids.baseAlt}','${orgA}','Base A alternate','Australia/Brisbane');
      insert into public.clients(id,organisation_id,name) values('${ids.client}','${orgA}','Client A');
      insert into public.properties(id,organisation_id,client_id,name) values('${ids.property}','${orgA}','${ids.client}','Property A');
      insert into public.fields(id,organisation_id,property_id,name,area_hectares) values('${ids.field}','${orgA}','${ids.property}','Field A',10);
      insert into public.jobs(id,organisation_id,client_id,property_id,reference) values('${ids.job}','${orgA}','${ids.client}','${ids.property}','JOB-A');
      insert into public.job_fields(organisation_id,property_id,job_id,field_id,target_area_hectares) values('${orgA}','${ids.property}','${ids.job}','${ids.field}',10);
      insert into public.missions(id,organisation_id,job_id,operating_location_id,mission_number) values('${ids.mission}','${orgA}','${ids.job}','${baseA}','MIS-A');
      insert into public.personnel(id,organisation_id,internal_user_id,full_name,created_by_internal_user_id,updated_by_internal_user_id)
        values('${ids.personnel}','${orgA}','${actorA}','Operator A','${actorA}','${actorA}');
      insert into public.mission_jsa_revisions(
        id,organisation_id,operating_location_id,mission_id,version_number,
        template_id,template_version_id,template_version,policy_id,policy_version_id,policy_version,
        policy_snapshot,template_snapshot,created_by_internal_user_id
      ) select '${ids.jsa}','${orgA}','${baseA}','${ids.mission}',1,
        'b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000101',1,
        p.id,pv.id,pv.version_number,to_jsonb(pv),to_jsonb(tv),'${actorA}'
      from public.organisation_jsa_policies p
      join public.organisation_jsa_policy_versions pv on pv.organisation_id=p.organisation_id and pv.policy_id=p.id
      join public.platform_jsa_template_versions tv on tv.id='b1000000-0000-4000-8000-000000000101'
      where p.organisation_id='${orgA}';
      insert into public.mission_pack_revisions(
        id,organisation_id,operating_location_id,mission_id,version_number,pack_snapshot,generated_by_internal_user_id,
        job_id,package_state,jsa_revision_id,evidence_digest,source_manifest
      ) values('${ids.pack}','${orgA}','${baseA}','${ids.mission}',1,'{}','${actorA}','${ids.job}','PREPARING','${ids.jsa}','${'a'.repeat(64)}',
        '${JSON.stringify({ aircraftAssignments: [
          { id: ids.assignmentA, aircraftId: ids.aircraftA, aircraftRowVersion: 1 },
          { id: ids.assignmentB, aircraftId: ids.aircraftB, aircraftRowVersion: 1 },
        ] })}');
      insert into public.mission_pack_fields(organisation_id,operating_location_id,mission_id,job_id,pack_revision_id,property_id,field_id,field_order)
        values('${orgA}','${baseA}','${ids.mission}','${ids.job}','${ids.pack}','${ids.property}','${ids.field}',1);
      insert into public.aircraft(
        id,organisation_id,operating_location_id,registration,manufacturer,model,serial_number,status,serviceability_state,mission_ready,
        mtow,max_altitude,max_wind_speed,total_flight_hours,hours_since_last_service,insurance_policy_number,insurance_provider,
        insurance_expiry_date,insurance_coverage_amount,hull_value,min_operating_temp,max_operating_temp,max_payload_weight,
        max_flight_time,service_range,minimum_crew_size,created_by_internal_user_id,updated_by_internal_user_id
      ) values
        ('${ids.aircraftA}','${orgA}','${baseA}','FTF-T100-001','DJI','T100','SER-001','operational','serviceable',true,100,120,30,0,0,'POL-1','Insurer','2030-01-01',100000,50000,-10,50,50,60,10,1,'${actorA}','${actorA}'),
        ('${ids.aircraftB}','${orgA}','${baseA}','FTF-T100-002','DJI','T100','SER-002','operational','serviceable',true,100,120,30,0,0,'POL-2','Insurer','2030-01-01',100000,50000,-10,50,50,60,10,1,'${actorA}','${actorA}'),
        ('${ids.aircraftC}','${orgA}','${baseA}','FTF-T100-003','DJI','T100','SER-003','operational','serviceable',true,100,120,30,0,0,'POL-3','Insurer','2030-01-01',100000,50000,-10,50,50,60,10,1,'${actorA}','${actorA}');
      insert into public.mission_aircraft_assignments(id,organisation_id,operating_location_id,mission_id,aircraft_id,assigned_by_internal_user_id) values
        ('${ids.assignmentA}','${orgA}','${baseA}','${ids.mission}','${ids.aircraftA}','${actorA}'),
        ('${ids.assignmentB}','${orgA}','${baseA}','${ids.mission}','${ids.aircraftB}','${actorA}'),
        ('${ids.assignmentC}','${orgA}','${baseA}','${ids.mission}','${ids.aircraftC}','${actorA}');
      insert into public.maintainable_asset_registry(organisation_id,aircraft_id,created_by_internal_user_id,updated_by_internal_user_id)
        select organisation_id,id,'${actorA}','${actorA}' from public.aircraft where organisation_id='${orgA}';
      insert into public.asset_meter_definitions(id,organisation_id,maintainable_asset_id,meter_type,name,unit,precision_scale,source_policy,created_by_internal_user_id)
        select '${ids.meterA}','${orgA}',id,'flight_hours','Flight hours','h',4,'MISSION_DERIVED','${actorA}' from public.maintainable_asset_registry where aircraft_id='${ids.aircraftA}';
      insert into public.asset_meter_definitions(id,organisation_id,maintainable_asset_id,meter_type,name,unit,precision_scale,source_policy,created_by_internal_user_id)
        select '${ids.meterB}','${orgA}',id,'flight_hours','Flight hours','h',4,'MISSION_DERIVED','${actorA}' from public.maintainable_asset_registry where aircraft_id='${ids.aircraftB}';
      insert into public.asset_meter_definitions(id,organisation_id,maintainable_asset_id,meter_type,name,unit,precision_scale,source_policy,created_by_internal_user_id)
        select '${ids.meterC}','${orgA}',id,'flight_hours','Flight hours','h',4,'MISSION_DERIVED','${actorA}' from public.maintainable_asset_registry where aircraft_id='${ids.aircraftC}';
      insert into public.mission_operating_days(
        id,organisation_id,operating_location_id,mission_id,work_date,timezone,mission_pack_revision_id,jsa_revision_id,state,
        actual_started_at,created_by_internal_user_id,updated_by_internal_user_id
      ) values
        ('${ids.dayEarly}','${orgA}','${baseA}','${ids.mission}','2026-09-04','Australia/Brisbane','${ids.pack}','${ids.jsa}','IN_PROGRESS','2026-09-03T15:00:00Z','${actorA}','${actorA}'),
        ('${ids.dayA}','${orgA}','${baseA}','${ids.mission}','2026-09-05','Australia/Brisbane','${ids.pack}','${ids.jsa}','IN_PROGRESS','2026-09-04T15:00:00Z','${actorA}','${actorA}'),
        ('${ids.dayB}','${orgA}','${baseA}','${ids.mission}','2026-09-10','Australia/Brisbane','${ids.pack}','${ids.jsa}','IN_PROGRESS','2026-09-09T15:00:00Z','${actorA}','${actorA}');
    `);
  });

  test('saves two authoritative totals as twenty aircraft hours without flights', async () => {
    const result = await call('ftf_save_mission_aircraft_day_actuals', [
      orgA, actorA, ids.mission, ids.dayA, 1, '20.0000',
      JSON.stringify([{ aircraftId: ids.aircraftA, totalFlightHours: '10.0000' }, { aircraftId: ids.aircraftB, totalFlightHours: '10.0000' }]),
      JSON.stringify([]),
    ]);
    expect(result).toMatchObject({ total_aircraft_hours: '20.0000', ready_for_sign_off: true });
    expect(result.actuals).toHaveLength(2);
    expect(result.actuals.every((actual) => actual.reconciliation_status === 'TOTAL_ONLY')).toBe(true);
  });

  test('derives a flights-only aircraft total from authoritative durations', async () => {
    const result = await call('ftf_save_mission_aircraft_day_actuals', [
      orgA, actorA, ids.mission, ids.dayB, 1, '10.0000',
      JSON.stringify([
        { aircraftId: ids.aircraftA, totalFlightHours: null },
        { aircraftId: ids.aircraftB, totalFlightHours: '0.0000' },
      ]),
      JSON.stringify([
        { aircraftId: ids.aircraftA, durationHours: '4.0000', startedAt: null, finishedAt: null, fieldId: null, sourceImportId: null },
        { aircraftId: ids.aircraftA, durationHours: '6.0000', startedAt: null, finishedAt: null, fieldId: null, sourceImportId: null },
      ]),
    ]);
    expect(result.actuals[0]).toMatchObject({ declared_total_hours: null, total_flight_hours: '10.0000', flights_total_hours: '10.0000', total_source: 'DERIVED_FROM_FLIGHTS', reconciliation_status: 'FLIGHTS_ONLY' });
  });

  test('retains a mismatched declaration but fails reconciliation closed', async () => {
    const current = await scalar(db, `select row_version as value from public.mission_operating_days where id='${ids.dayB}'`);
    const saved = await call('ftf_save_mission_aircraft_day_actuals', [
      orgA, actorA, ids.mission, ids.dayB, current, '9.0000',
      JSON.stringify([
        { aircraftId: ids.aircraftA, totalFlightHours: '9.0000' },
        { aircraftId: ids.aircraftB, totalFlightHours: '0.0000' },
      ]),
      JSON.stringify([{ aircraftId: ids.aircraftA, durationHours: '10.0000', startedAt: null, finishedAt: null, fieldId: null, sourceImportId: null }]),
    ]);
    expect(saved).toMatchObject({ ready_for_sign_off: false });
    expect(saved.actuals[0].reconciliation_status).toBe('MISMATCH');
    expect(await call('ftf_reconcile_mission_aircraft_day_actuals', [orgA, actorA, ids.mission, ids.dayB])).toMatchObject({ error: 'AIRCRAFT_FLIGHT_TOTAL_MISMATCH' });
    await db.exec(`update public.mission_operating_days set state='COMPLETED',actual_finished_at='2026-09-10T03:00:00Z' where id='${ids.dayB}'`);
    await db.exec("select set_config('app.mission_operating_day_signoff','allowed',false)");
    await expect(db.exec(`update public.mission_operating_days set state='SIGNED_OFF' where id='${ids.dayB}'`)).rejects.toThrow(/AIRCRAFT_FLIGHT_TOTAL_MISMATCH/);
    await db.exec("select set_config('app.mission_operating_day_signoff','',false)");
  });

  test('rejects excess precision and foreign-tenant identities without partial mutation', async () => {
    await db.exec(`insert into public.mission_operating_days(id,organisation_id,operating_location_id,mission_id,work_date,timezone,mission_pack_revision_id,jsa_revision_id,state,actual_started_at,created_by_internal_user_id,updated_by_internal_user_id) values('${ids.dayC}','${orgA}','${baseA}','${ids.mission}','2026-09-07','Australia/Brisbane','${ids.pack}','${ids.jsa}','IN_PROGRESS','2026-09-06T15:00:00Z','${actorA}','${actorA}')`);
    expect(await call('ftf_save_mission_aircraft_day_actuals', [orgA, actorA, ids.mission, ids.dayC, 1, '1.00001', JSON.stringify([{ aircraftId: ids.aircraftA, totalFlightHours: '1.00001' }]), '[]'])).toMatchObject({ error: 'MISSION_AIRCRAFT_DAY_INPUT_INVALID' });
    expect(await call('ftf_save_mission_aircraft_day_actuals', [orgB, actorB, ids.mission, ids.dayC, 1, '1.0000', JSON.stringify([{ aircraftId: ids.aircraftA, totalFlightHours: '1.0000' }]), '[]'])).toMatchObject({ error: 'MISSION_OPERATING_DAY_NOT_FOUND' });
    expect(await scalar(db, `select count(*)::integer as value from public.mission_aircraft_day_actuals where operating_day_id='${ids.dayC}'`)).toBe(0);
  });

  test('requires the exact day-bound package aircraft set even when another assignment is active', async () => {
    const omitted = await call('ftf_save_mission_aircraft_day_actuals', [
      orgA, actorA, ids.mission, ids.dayC, 1, '1.0000',
      JSON.stringify([{ aircraftId: ids.aircraftA, totalFlightHours: '1.0000' }]), '[]',
    ]);
    expect(omitted).toMatchObject({ error: 'MISSION_AIRCRAFT_DAY_SET_MISMATCH' });
    const extraneous = await call('ftf_save_mission_aircraft_day_actuals', [
      orgA, actorA, ids.mission, ids.dayC, 1, '1.0000',
      JSON.stringify([
        { aircraftId: ids.aircraftA, totalFlightHours: '1.0000' },
        { aircraftId: ids.aircraftB, totalFlightHours: '0.0000' },
        { aircraftId: ids.aircraftC, totalFlightHours: '0.0000' },
      ]), '[]',
    ]);
    expect(extraneous).toMatchObject({ error: 'MISSION_AIRCRAFT_DAY_SET_MISMATCH' });
    expect(await scalar(db, `select count(*)::integer as value from public.mission_aircraft_day_actuals where operating_day_id='${ids.dayC}'`)).toBe(0);
  });

  test('signs off and projects atomically in chronological order with independent aircraft baselines', async () => {
    expect(await call('ftf_save_mission_aircraft_day_actuals', [
      orgA, actorA, ids.mission, ids.dayEarly, 1, '2.0000',
      JSON.stringify([
        { aircraftId: ids.aircraftA, totalFlightHours: '1.0000' },
        { aircraftId: ids.aircraftB, totalFlightHours: '1.0000' },
      ]), '[]',
    ])).toMatchObject({ ready_for_sign_off: true });
    await db.exec(`
      insert into public.asset_meter_readings(organisation_id,meter_definition_id,recorded_at,value,source,source_system,source_record_id,evidence,recorded_by_internal_user_id) values
        ('${orgA}','${ids.meterA}','2026-09-01T00:00:00Z',100,'MANUAL','test-baseline','aircraft-a','{}','${actorA}'),
        ('${orgA}','${ids.meterB}','2026-09-01T00:00:00Z',200,'MANUAL','test-baseline','aircraft-b','{}','${actorA}');
      insert into public.mission_day_field_activity(organisation_id,operating_location_id,mission_id,operating_day_id,field_id,status,created_by_internal_user_id,updated_by_internal_user_id) values
        ('${orgA}','${baseA}','${ids.mission}','${ids.dayEarly}','${ids.field}','COMPLETED','${actorA}','${actorA}'),
        ('${orgA}','${baseA}','${ids.mission}','${ids.dayA}','${ids.field}','COMPLETED','${actorA}','${actorA}');
    `);
    const dayAVersion = await scalar(db, `select row_version as value from public.mission_operating_days where id='${ids.dayA}'`);
    expect(await call('ftf_complete_and_sign_off_mission_operating_day', [orgA, actorA, ids.mission, ids.dayA, dayAVersion, '2026-09-05T03:00:00Z', null]))
      .toMatchObject({ error: 'AIRCRAFT_DAY_PROJECTION_OUT_OF_ORDER' });
    expect(await scalar(db, `select state as value from public.mission_operating_days where id='${ids.dayA}'`)).toBe('IN_PROGRESS');
    expect(await scalar(db, `select count(*)::integer as value from public.asset_meter_readings where source_system='mission_aircraft_day_actual'`)).toBe(0);

    const earlyVersion = await scalar(db, `select row_version as value from public.mission_operating_days where id='${ids.dayEarly}'`);
    const early = await call('ftf_complete_and_sign_off_mission_operating_day', [orgA, actorA, ids.mission, ids.dayEarly, earlyVersion, '2026-09-04T03:00:00Z', null]);
    expect(early).toMatchObject({ day: { state: 'SIGNED_OFF' }, fleet_projection: { projected_count: 2 } });
    const completedA = await call('ftf_complete_and_sign_off_mission_operating_day', [orgA, actorA, ids.mission, ids.dayA, dayAVersion, '2026-09-05T03:00:00Z', null]);
    expect(completedA).toMatchObject({ day: { state: 'SIGNED_OFF' }, fleet_projection: { projected_count: 2 } });
    const retriedA = await call('ftf_complete_and_sign_off_mission_operating_day', [orgA, actorA, ids.mission, ids.dayA, completedA.day.row_version, '2026-09-05T03:00:00Z', null]);
    expect(retriedA).toMatchObject({ day: { state: 'SIGNED_OFF' }, fleet_projection: { projected_count: 0, idempotent_count: 2 } });
    const retriedEarly = await call('ftf_complete_and_sign_off_mission_operating_day', [orgA, actorA, ids.mission, ids.dayEarly, early.day.row_version, '2026-09-04T03:00:00Z', null]);
    expect(retriedEarly).toMatchObject({ day: { state: 'SIGNED_OFF' }, fleet_projection: { projected_count: 0, idempotent_count: 2 } });
    expect(await scalar(db, `select count(*)::integer as value from public.asset_meter_readings where organisation_id='${orgA}' and source_system='mission_aircraft_day_actual'`)).toBe(4);
    expect(await scalar(db, `select value::text as value from public.asset_meter_readings where meter_definition_id='${ids.meterA}' and source_system='mission_aircraft_day_actual' order by recorded_at desc limit 1`)).toBe('111.000000');
    expect(await scalar(db, `select value::text as value from public.asset_meter_readings where meter_definition_id='${ids.meterB}' and source_system='mission_aircraft_day_actual' order by recorded_at desc limit 1`)).toBe('211.000000');
    await expect(db.exec(`update public.mission_operating_days set notes='changed' where id='${ids.dayA}'`)).rejects.toThrow(/SIGNED_OFF_IMMUTABLE/);
    await expect(db.exec(`update public.mission_day_field_activity set notes='changed' where operating_day_id='${ids.dayA}'`)).rejects.toThrow(/SIGNED_OFF_IMMUTABLE/);
  });

  test('legacy Mission completion fails closed while any operating-day aircraft totals are incomplete', async () => {
    const result = await call('ftf_complete_mission', [
      orgA, actorA, ids.mission, 'f0000000-0000-4000-8000-000000000001', 0, 'Checked.', null,
    ]);
    expect(result).toMatchObject({ aircraft_days_incomplete: true });
    expect(await scalar(db, `select count(*)::integer as value from public.mission_completion_revisions where mission_id='${ids.mission}'`)).toBe(0);
  });

  test('later resource revisions do not retroactively add aircraft to signed-day projection authority', async () => {
    await db.exec(`
      insert into public.mission_operational_resource_revisions(
        organisation_id,operating_location_id,mission_id,version_number,actual_resources,planned_resources_snapshot,recorded_by_internal_user_id
      ) values('${orgA}','${baseA}','${ids.mission}',1,'{"aircraftIds":["${ids.aircraftA}","${ids.aircraftB}","${ids.aircraftC}"],"changedFromPlan":true}','{}','${actorA}');
      insert into public.mission_operating_days(
        id,organisation_id,operating_location_id,mission_id,work_date,timezone,mission_pack_revision_id,jsa_revision_id,state,
        actual_started_at,created_by_internal_user_id,updated_by_internal_user_id
      ) values('${ids.dayLater}','${orgA}','${baseA}','${ids.mission}','2026-09-06','Australia/Brisbane','${ids.pack}','${ids.jsa}','IN_PROGRESS','2026-09-05T15:00:00Z','${actorA}','${actorA}');
      insert into public.asset_meter_readings(
        organisation_id,meter_definition_id,recorded_at,value,source,source_system,source_record_id,evidence,recorded_by_internal_user_id
      ) values('${orgA}','${ids.meterC}','2026-09-01T00:00:00Z',300,'MANUAL','test-baseline','aircraft-c','{}','${actorA}');
      insert into public.mission_day_field_activity(
        organisation_id,operating_location_id,mission_id,operating_day_id,field_id,status,created_by_internal_user_id,updated_by_internal_user_id
      ) values('${orgA}','${baseA}','${ids.mission}','${ids.dayLater}','${ids.field}','COMPLETED','${actorA}','${actorA}');
    `);
    expect(await scalar(db, `select count(*)::integer as value from public.mission_aircraft_day_actuals where operating_day_id='${ids.dayA}' and aircraft_id='${ids.aircraftC}'`)).toBe(0);
    expect(await call('ftf_save_mission_aircraft_day_actuals', [
      orgA, actorA, ids.mission, ids.dayLater, 1, '3.0000',
      JSON.stringify([
        { aircraftId: ids.aircraftA, totalFlightHours: '1.0000' },
        { aircraftId: ids.aircraftB, totalFlightHours: '1.0000' },
        { aircraftId: ids.aircraftC, totalFlightHours: '1.0000' },
      ]), '[]',
    ])).toMatchObject({ ready_for_sign_off: true });
    const version = await scalar(db, `select row_version as value from public.mission_operating_days where id='${ids.dayLater}'`);
    expect(await call('ftf_complete_and_sign_off_mission_operating_day', [orgA, actorA, ids.mission, ids.dayLater, version, '2026-09-06T03:00:00Z', null]))
      .toMatchObject({ day: { state: 'SIGNED_OFF' }, fleet_projection: { projected_count: 3 } });
    expect(await scalar(db, `select value::text as value from public.asset_meter_readings where meter_definition_id='${ids.meterC}' order by recorded_at desc limit 1`)).toBe('301.000000');
    await db.exec(`
      insert into public.mission_operational_resource_revisions(
        organisation_id,operating_location_id,mission_id,version_number,actual_resources,planned_resources_snapshot,recorded_by_internal_user_id
      ) values('${orgA}','${baseA}','${ids.mission}',2,'{"aircraftIds":["${ids.aircraftA}","${ids.aircraftB}"],"changedFromPlan":false}','{}','${actorA}')
    `);
  });

  test('stores one immutable import and separate bounded attribution links', async () => {
    const payload = {
      storageProvider: 'supabase', storageBucket: 'mission-operational-evidence', storageObjectKey: 'original/multi.kml',
      originalFilename: 'multi.kml', sourceFormat: 'KML', contentType: 'application/vnd.google-earth.kml+xml',
      fileSizeBytes: 100, checksum: 'b'.repeat(64), evidenceType: 'FLIGHT_LINES', parseStatus: 'PARSED',
      validationResult: { state: 'valid' }, derivedStatistics: { flightLineCount: 2 }, operationalGeometry: null,
      sourceMetadata: { parser: 'server' }, attributions: [
        { operatingDayId: ids.dayA, aircraftId: ids.aircraftA, confidence: 'OPERATOR_CONFIRMED' },
        { operatingDayId: ids.dayB, aircraftId: ids.aircraftB, confidence: 'SOURCE_METADATA' },
        { operatingDayId: ids.dayC, aircraftId: ids.aircraftA, confidence: 'OPERATOR_CONFIRMED' },
      ],
    };
    expect(await call('ftf_create_mission_operational_import', [orgA, actorB, ids.mission, 0, JSON.stringify(payload)])).toMatchObject({ forbidden: true });
    expect(await scalar(db, `select count(*)::integer as value from public.mission_operational_imports where mission_id='${ids.mission}'`)).toBe(0);
    const result = await call('ftf_create_mission_operational_import', [orgA, actorA, ids.mission, 0, JSON.stringify(payload)]);
    expect(result.record.id).toBeTruthy();
    expect(await scalar(db, `select count(*)::integer as value from public.mission_operational_imports where id='${result.record.id}'`)).toBe(1);
    expect(await scalar(db, `select count(*)::integer as value from public.mission_operational_import_attributions where operational_import_id='${result.record.id}'`)).toBe(3);
    expect(await call('ftf_save_mission_aircraft_day_actuals', [
      orgA, actorA, ids.mission, ids.dayC, 1, '1.0000',
      JSON.stringify([
        { aircraftId: ids.aircraftA, totalFlightHours: '0.0000' },
        { aircraftId: ids.aircraftB, totalFlightHours: null },
      ]),
      JSON.stringify([{ aircraftId: ids.aircraftB, durationHours: '1.0000', startedAt: null, finishedAt: null, fieldId: null, sourceImportId: result.record.id }]),
    ])).toMatchObject({ error: 'MISSION_FLIGHT_IMPORT_NOT_FOUND' });
    expect(await scalar(db, `select count(*)::integer as value from public.mission_aircraft_day_actuals where operating_day_id='${ids.dayC}'`)).toBe(0);
    expect(await call('ftf_save_mission_aircraft_day_actuals', [
      orgA, actorA, ids.mission, ids.dayC, 1, '1.0000',
      JSON.stringify([
        { aircraftId: ids.aircraftA, totalFlightHours: null },
        { aircraftId: ids.aircraftB, totalFlightHours: '0.0000' },
      ]),
      JSON.stringify([{ aircraftId: ids.aircraftA, durationHours: '1.0000', startedAt: null, finishedAt: null, fieldId: null, sourceImportId: result.record.id }]),
    ])).toMatchObject({ total_aircraft_hours: '1.0000', ready_for_sign_off: true });
    await expect(db.exec(`update public.mission_operational_imports set original_filename='changed.kml' where id='${result.record.id}'`)).rejects.toThrow();
  });

  test('latest authoritative changed actual-resource revision overrides the package aircraft set', async () => {
    await db.exec(`
      insert into public.mission_operational_resource_revisions(
        organisation_id,operating_location_id,mission_id,version_number,actual_resources,planned_resources_snapshot,recorded_by_internal_user_id
      ) values('${orgA}','${baseA}','${ids.mission}',3,'{"aircraftIds":["${ids.aircraftA}"],"changedFromPlan":true}','{}','${actorA}');
      insert into public.mission_operating_days(
        id,organisation_id,operating_location_id,mission_id,work_date,timezone,mission_pack_revision_id,jsa_revision_id,state,
        actual_started_at,created_by_internal_user_id,updated_by_internal_user_id
      ) values('${ids.dayD}','${orgA}','${baseA}','${ids.mission}','2026-09-08','Australia/Brisbane','${ids.pack}','${ids.jsa}','IN_PROGRESS','2026-09-07T15:00:00Z','${actorA}','${actorA}');
    `);
    const dayCVersion = await scalar(db, `select row_version as value from public.mission_operating_days where id='${ids.dayC}'`);
    const corrected = await call('ftf_save_mission_aircraft_day_actuals', [
      orgA, actorA, ids.mission, ids.dayC, dayCVersion, '1.0000',
      JSON.stringify([{ aircraftId: ids.aircraftA, totalFlightHours: '1.0000' }]), '[]',
    ]);
    expect(corrected.actuals).toHaveLength(1);
    expect(corrected.actuals[0].aircraft_id).toBe(ids.aircraftA);
    await expect(db.exec(`delete from public.mission_aircraft_day_actuals where operating_day_id='${ids.dayC}'`)).rejects.toThrow(/MISSION_AIRCRAFT_DAY_DELETE_FORBIDDEN/);
    expect(await call('ftf_save_mission_aircraft_day_actuals', [
      orgA, actorA, ids.mission, ids.dayD, 1, '1.0000',
      JSON.stringify([{ aircraftId: ids.aircraftA, totalFlightHours: '1.0000' }]), '[]',
    ])).toMatchObject({ total_aircraft_hours: '1.0000', ready_for_sign_off: true });
  });

  test('a newer unchanged resource revision restores the day-bound package set', async () => {
    await db.exec(`
      insert into public.mission_operational_resource_revisions(
        organisation_id,operating_location_id,mission_id,version_number,actual_resources,planned_resources_snapshot,recorded_by_internal_user_id
      ) values('${orgA}','${baseA}','${ids.mission}',4,'{"aircraftIds":["${ids.aircraftA}","${ids.aircraftB}"],"changedFromPlan":false}','{}','${actorA}');
      insert into public.mission_operating_days(
        id,organisation_id,operating_location_id,mission_id,work_date,timezone,mission_pack_revision_id,jsa_revision_id,state,
        actual_started_at,created_by_internal_user_id,updated_by_internal_user_id
      ) values('${ids.dayE}','${orgA}','${baseA}','${ids.mission}','2026-09-09','Australia/Brisbane','${ids.pack}','${ids.jsa}','IN_PROGRESS','2026-09-08T15:00:00Z','${actorA}','${actorA}');
    `);
    expect(await call('ftf_save_mission_aircraft_day_actuals', [
      orgA, actorA, ids.mission, ids.dayE, 1, '1.0000',
      JSON.stringify([{ aircraftId: ids.aircraftA, totalFlightHours: '1.0000' }]), '[]',
    ])).toMatchObject({ error: 'MISSION_AIRCRAFT_DAY_SET_MISMATCH' });
    expect(await call('ftf_save_mission_aircraft_day_actuals', [
      orgA, actorA, ids.mission, ids.dayE, 1, '1.0000',
      JSON.stringify([
        { aircraftId: ids.aircraftA, totalFlightHours: '1.0000' },
        { aircraftId: ids.aircraftB, totalFlightHours: '0.0000' },
      ]), '[]',
    ])).toMatchObject({ total_aircraft_hours: '1.0000', ready_for_sign_off: true });
  });

  test('fails reconciliation closed when an expected aircraft assignment is no longer active', async () => {
    await db.exec(`update public.mission_aircraft_assignments set unassigned_at=now(),unassigned_by_internal_user_id='${actorA}' where id='${ids.assignmentB}'`);
    expect(await call('ftf_reconcile_mission_aircraft_day_actuals', [orgA, actorA, ids.mission, ids.dayE]))
      .toMatchObject({ error: 'MISSION_DAY_AIRCRAFT_NOT_AUTHORISED' });
    expect(await call('ftf_reconcile_mission_aircraft_day_actuals', [orgA, actorA, ids.mission, ids.dayA]))
      .toMatchObject({ ready_for_sign_off: true });
    const signedVersion = await scalar(db, `select row_version as value from public.mission_operating_days where id='${ids.dayA}'`);
    expect(await call('ftf_complete_and_sign_off_mission_operating_day', [orgA, actorA, ids.mission, ids.dayA, signedVersion, '2026-09-05T03:00:00Z', null]))
      .toMatchObject({ fleet_projection: { projected_count: 0, idempotent_count: 2 } });
  });

  test('multi-day final sign-off fails closed before creating completion or projection authority', async () => {
    const readiness = await call('ftf_read_mission_final_signoff_readiness', [orgA, actorA, ids.mission]);
    expect(readiness.ready_for_final_signoff).toBe(false);
    expect(readiness.blockers.map((blocker) => blocker.code)).toContain('MISSION_DAY_INCOMPLETE');
    expect(await call('ftf_final_signoff_mission', [orgA, actorA, ids.mission, 0, 'Evidence reviewed and complete.']))
      .toMatchObject({ error: readiness.blockers[0].code });
    expect(await scalar(db, `select count(*)::integer as value from public.mission_completion_revisions where mission_id='${ids.mission}'`)).toBe(0);
    expect(await scalar(db, `select count(*)::integer as value from public.mission_final_projection_sources where mission_id='${ids.mission}'`)).toBe(0);
  });

  test('terminal finality guard blocks ordinary commands and direct writers without partial mutation', async () => {
    const authorisationId = 'e0000000-0000-4000-8000-000000000001';
    const chemicalId = 'e0000000-0000-4000-8000-000000000002';
    const operationalId = 'e0000000-0000-4000-8000-000000000003';
    const prospectivePackId = 'e0000000-0000-4000-8000-000000000004';
    const eventId = 'e0000000-0000-4000-8000-000000000005';
    await expect(call('ftf_build_mission_report_evidence_manifest', [orgB, ids.mission]))
      .rejects.toThrow(/MISSION_REPORT_EVIDENCE_INVALID/);
    await db.exec(`
      insert into public.missions(id,organisation_id,job_id,operating_location_id,mission_number,status)
        values('${ids.missionOther}','${orgA}','${ids.job}','${baseA}','MIS-OTHER','cancelled');
      insert into public.mission_authorisation_revisions(
        id,organisation_id,operating_location_id,mission_id,version_number,evidence_manifest,readiness_snapshot,declaration,
        authorised_personnel_id,authorised_personnel_snapshot,authorised_by_internal_user_id,mission_pack_revision_id,decision,evidence_digest
      ) values('${authorisationId}','${orgA}','${baseA}','${ids.mission}',1,'{}','{}','Authorised','${ids.personnel}','{}','${actorA}','${ids.pack}','AUTHORISED','${'c'.repeat(64)}');
      update public.missions set current_authorised_pack_revision_id='${ids.pack}' where id='${ids.mission}';
      insert into public.mission_pack_revisions(
        id,organisation_id,operating_location_id,mission_id,version_number,pack_snapshot,generated_by_internal_user_id,
        job_id,package_state,jsa_revision_id,evidence_digest,source_manifest
      ) values('${prospectivePackId}','${orgA}','${baseA}','${ids.mission}',2,'{}','${actorA}','${ids.job}','PREPARING','${ids.jsa}','${'e'.repeat(64)}','{}');
      insert into public.mission_operational_chemical_revisions(
        id,organisation_id,operating_location_id,mission_id,version_number,changed_from_plan,actual_usage,planned_chemicals_snapshot,recorded_by_internal_user_id
      ) values('${chemicalId}','${orgA}','${baseA}','${ids.mission}',1,false,'{}','{}','${actorA}');
      insert into public.mission_operational_revisions(
        id,organisation_id,operating_location_id,mission_id,version_number,authorisation_revision_id,source_file_ids,
        resource_revision_id,chemical_revision_id,event_ids,review_snapshot,submitted_by_internal_user_id
      ) select '${operationalId}','${orgA}','${baseA}','${ids.mission}',1,'${authorisationId}','{}',id,'${chemicalId}','{}','{}','${actorA}'
        from public.mission_operational_resource_revisions where organisation_id='${orgA}' and mission_id='${ids.mission}' order by version_number desc limit 1;
      insert into public.mission_operational_events(
        id,organisation_id,operating_location_id,mission_id,batch_version,event_index,event_type,event_details,no_events_declaration,recorded_by_internal_user_id
      ) values('${eventId}','${orgA}','${baseA}','${ids.mission}',1,0,'NO_OPERATIONAL_EVENTS','{}',true,'${actorA}');
    `);
    await db.exec('begin');
    await db.exec(`insert into public.mission_operational_import_attributions(
      organisation_id,operating_location_id,mission_id,operational_import_id,aircraft_id,attribution_confidence,attributed_by_internal_user_id
    ) select '${orgA}','${ids.baseAlt}','${ids.mission}',id,'${ids.aircraftC}','OPERATOR_CONFIRMED','${actorA}'
      from public.mission_operational_imports where organisation_id='${orgA}' and mission_id='${ids.mission}' limit 1`);
    await expect(call('ftf_build_mission_report_evidence_manifest', [orgA, ids.mission]))
      .rejects.toThrow(/MISSION_REPORT_EVIDENCE_INVALID: base/);
    await db.exec('rollback');
    expect(await scalar(db, `select count(*)::integer as value from public.mission_operational_import_attributions where operating_location_id='${ids.baseAlt}'`)).toBe(0);

    const foreignImportId = 'e1000000-0000-4000-8000-000000000001';
    await db.exec('begin');
    await db.exec(`insert into public.mission_operational_imports(
      id,organisation_id,operating_location_id,mission_id,version_number,storage_provider,storage_bucket,storage_object_key,
      original_filename,source_format,content_type,file_size_bytes,sha256_checksum,evidence_type,parse_status,
      imported_by_internal_user_id
    ) values('${foreignImportId}','${orgA}','${baseA}','${ids.missionOther}',1,'supabase','mission-operational-evidence',
      'foreign/flight.kml','foreign.kml','KML','application/vnd.google-earth.kml+xml',100,'${'f'.repeat(64)}','FLIGHT_LINES','PARSED','${actorA}');
      insert into public.mission_operational_import_attributions(
        organisation_id,operating_location_id,mission_id,operational_import_id,operating_day_id,aircraft_id,attribution_confidence,attributed_by_internal_user_id
      ) values('${orgA}','${baseA}','${ids.mission}','${foreignImportId}','${ids.dayA}','${ids.aircraftA}','OPERATOR_CONFIRMED','${actorA}')`);
    await expect(call('ftf_build_mission_report_evidence_manifest', [orgA, ids.mission]))
      .rejects.toThrow(/MISSION_REPORT_EVIDENCE_INVALID: reference/);
    await db.exec('rollback');
    expect(await scalar(db, `select count(*)::integer as value from public.mission_operational_imports where id='${foreignImportId}'`)).toBe(0);

    await db.exec('begin');
    const foreignWeather = await call('ftf_create_mission_weather_observation', [orgA, actorA, ids.missionOther, 0, JSON.stringify({
      source: 'OPEN_METEO', providerIdentifier: 'foreign-provider', observationLocation: 'Base A',
      latitude: '-27.000000', longitude: '153.000000', locationSource: 'PROVIDER_LOCATION',
      locationCapturedAt: '2026-09-05T00:00:00Z', observedAt: '2026-09-05T00:00:00Z', retrievedAt: '2026-09-05T00:01:00Z',
      temperatureC: '25.00', relativeHumidity: '50.00', windSpeedKmh: '10.00', windDirectionDegrees: '90.0',
      inversionAssessment: 'UNLIKELY', inversionAssessmentSource: 'OPEN_METEO', inversionAssessedAt: '2026-09-05T00:00:00Z',
    })]);
    expect(foreignWeather.record.id).toBeTruthy();
    await db.exec(`insert into public.mission_day_weather_reports(
      organisation_id,operating_location_id,mission_id,operating_day_id,mission_pack_revision_id,coverage,
      interval_start_at,interval_end_at,timezone,source,source_weather_observation_id,latitude,longitude,
      provider_identifier,provider_retrieved_at,hourly_observations,inversion_inputs,inversion_results,coverage_gaps,
      source_metadata,source_digest,recorded_by_internal_user_id
    ) values('${orgA}','${baseA}','${ids.mission}','${ids.dayA}','${ids.pack}','ACTUAL_INTERVAL',
      '2026-09-05T00:00:00Z','2026-09-05T01:00:00Z','Australia/Brisbane','OPEN_METEO','${foreignWeather.record.id}',
      -27.0,153.0,'foreign-provider','2026-09-05T00:01:00Z','[{}]','{}','{}','[]','{}','${'1'.repeat(64)}','${actorA}')`);
    await expect(call('ftf_build_mission_report_evidence_manifest', [orgA, ids.mission]))
      .rejects.toThrow(/MISSION_REPORT_EVIDENCE_INVALID: reference/);
    await db.exec('rollback');
    expect(await scalar(db, `select count(*)::integer as value from public.mission_weather_observations where id='${foreignWeather.record.id}'`)).toBe(0);

    await db.exec('begin');
    await db.exec(`insert into public.mission_operating_days(
      id,organisation_id,operating_location_id,mission_id,work_date,timezone,mission_pack_revision_id,jsa_revision_id,state,
      created_by_internal_user_id,updated_by_internal_user_id
    ) select gen_random_uuid(),'${orgA}','${baseA}','${ids.mission}',date '2030-01-01'+day_offset,'Australia/Brisbane','${ids.pack}','${ids.jsa}','DRAFT','${actorA}','${actorA}'
      from generate_series(0,366) day_offset`);
    await expect(call('ftf_build_mission_report_evidence_manifest', [orgA, ids.mission]))
      .rejects.toThrow(/MISSION_REPORT_EVIDENCE_BOUND_EXCEEDED/);
    await db.exec('rollback');
    expect(await scalar(db, `select count(*)::integer as value from public.mission_operating_days where mission_id='${ids.mission}' and work_date>=date '2030-01-01'`)).toBe(0);

    await db.exec(`
      insert into public.mission_completion_revisions(
        organisation_id,operating_location_id,mission_id,version_number,authorisation_revision_id,operational_revision_id,
        completion_snapshot,declaration,completed_by_internal_user_id,daily_evidence_manifest,daily_evidence_digest
      ) select '${orgA}','${baseA}','${ids.mission}',1,'${authorisationId}','${operationalId}','{}','Final','${actorA}',evidence,
        encode(digest(convert_to(evidence::text,'UTF8'),'sha256'),'hex')
        from (select public.ftf_build_mission_daily_evidence_manifest('${orgA}','${ids.mission}') evidence) frozen;
    `);
    const frozen = await scalar(db, `select daily_evidence_manifest as value from public.mission_completion_revisions where mission_id='${ids.mission}'`);
    expect(frozen.reportEvidence.scope).toMatchObject({
      mission: { id: ids.mission, missionNumber: 'MIS-A', operatingLocationId: baseA },
      job: { id: ids.job, reference: 'JOB-A' }, client: { id: ids.client, name: 'Client A' },
    });
    expect(frozen.reportEvidence.scope.properties[0].fields[0]).toMatchObject({ id: ids.field, name: 'Field A', areaHectares: '10.0000', targetHectares: '10.0000' });
    expect(frozen.reportEvidence.governance.effectivePackage).toMatchObject({ id: ids.pack, revisionNumber: 1 });
    expect(frozen.reportEvidence.aircraft.map((item) => item.registration)).toEqual(['FTF-T100-001', 'FTF-T100-002', 'FTF-T100-003']);
    expect(frozen.reportEvidence.flightLineEvidence[0]).toEqual(expect.objectContaining({ filename: 'multi.kml', digest: 'b'.repeat(64), format: 'KML' }));
    const frozenDigest = await scalar(db, `select daily_evidence_digest as value from public.mission_completion_revisions where mission_id='${ids.mission}'`);
    const retry = await call('ftf_final_signoff_mission', [orgA, actorA, ids.mission, 1, 'Final']);
    expect(retry).toMatchObject({ idempotent: true, record: { version_number: 1, daily_evidence_digest: frozenDigest } });
    await db.exec(`update public.clients set name='Client A renamed after final' where organisation_id='${orgA}' and id='${ids.client}'`);
    expect(await scalar(db, `select daily_evidence_manifest->'reportEvidence'->'scope'->'client'->>'name' as value from public.mission_completion_revisions where mission_id='${ids.mission}'`)).toBe('Client A');
    expect(await scalar(db, `select daily_evidence_digest as value from public.mission_completion_revisions where mission_id='${ids.mission}'`)).toBe(frozenDigest);
    expect(await scalar(db, "select count(*)::integer as value from pg_trigger where tgname='aaa_mission_terminal_guard' and not tgisinternal")).toBe(15);
    const before = await scalar(db, `select count(*)::integer as value from public.mission_operational_events where mission_id='${ids.mission}'`);
    await expect(call('ftf_save_mission_operational_events', [orgA, actorA, ids.mission, 0, '[]']))
      .rejects.toThrow(/MISSION_FINAL_SIGNOFF_IMMUTABLE/);
    await expect(call('ftf_complete_mission', [orgA, actorA, ids.mission, operationalId, 1, 'Again', 'Not permitted']))
      .rejects.toThrow(/MISSION_FINAL_SIGNOFF_IMMUTABLE/);
    await expect(db.exec(`insert into public.mission_operational_events(
      organisation_id,operating_location_id,mission_id,batch_version,event_index,event_type,event_details,no_events_declaration,recorded_by_internal_user_id
    ) values('${orgA}','${baseA}','${ids.mission}',99,0,'NO_OPERATIONAL_EVENTS','{}',true,'${actorA}')`))
      .rejects.toThrow(/MISSION_FINAL_SIGNOFF_IMMUTABLE/);
    await expect(db.exec(`update public.mission_operational_events set mission_id='${ids.missionOther}' where id='${eventId}'`))
      .rejects.toThrow(/MISSION_FINAL_SIGNOFF_IMMUTABLE/);
    expect(await scalar(db, `select mission_id::text as value from public.mission_operational_events where id='${eventId}'`)).toBe(ids.mission);
    await expect(db.exec(`insert into public.mission_completion_revisions(
      organisation_id,operating_location_id,mission_id,version_number,authorisation_revision_id,operational_revision_id,
      completion_snapshot,declaration,completed_by_internal_user_id
    ) values('${orgA}','${baseA}','${ids.mission}',2,'${authorisationId}','${operationalId}','{}','Legacy append','${actorA}')`))
      .rejects.toThrow(/MISSION_FINAL_SIGNOFF_IMMUTABLE/);
    expect(await scalar(db, `select count(*)::integer as value from public.mission_operational_events where mission_id='${ids.mission}'`)).toBe(before);
    expect(await scalar(db, `select count(*)::integer as value from public.mission_completion_revisions where mission_id='${ids.mission}'`)).toBe(1);
    expect(await scalar(db, `select daily_evidence_digest as value from public.mission_completion_revisions where mission_id='${ids.mission}'`)).toBe(frozenDigest);
    await db.exec(`insert into public.permissions(organisation_id,code,description) values('${orgA}','jobs.write','Write Jobs') on conflict do nothing;
      insert into public.role_permissions(organisation_id,role_id,permission_id)
      select '${orgA}',role.id,permission.id from public.roles role join public.permissions permission on permission.organisation_id=role.organisation_id
      where role.organisation_id='${orgA}' and role.code='admin' and permission.code='jobs.write' on conflict do nothing`);
    const jobVersion = await scalar(db, `select row_version as value from public.jobs where id='${ids.job}'`);
    expect(await call('ftf_close_job', [orgA, actorA, ids.job, jobVersion])).toMatchObject({ error: 'JOB_MISSION_AUTHORITY_UNRESOLVED' });
    expect(await scalar(db, `select lower(status) as value from public.jobs where id='${ids.job}'`)).not.toBe('closed');
  });

  test('writes bounded audit and outbox evidence and closes the database', async () => {
    expect(await scalar(db, `select count(*)::integer as value from public.audit_events where organisation_id='${orgA}' and event_type like 'mission.aircraft_day.%'`)).toBeGreaterThan(0);
    expect(await scalar(db, `select count(*)::integer as value from public.transactional_outbox where organisation_id='${orgA}' and topic like 'operational.mission.aircraft_day_%'`)).toBeGreaterThan(0);
    await db.close();
  });
} else {
  test('passes repeatable aircraft-day, flight and Fleet projection behavior checks in PostgreSQL', () => {
    try {
      execFileSync(process.execPath, [__filename], { cwd: root, env: { ...process.env, MISSION_AIRCRAFT_ACTUALS_PGLITE_CHILD: '1' }, stdio: 'pipe' });
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
  })().catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
}
