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
  client: '20000000-0000-4000-8000-000000000001',
  property: '30000000-0000-4000-8000-000000000001',
  field: '40000000-0000-4000-8000-000000000001',
  job: '50000000-0000-4000-8000-000000000001',
  mission: '60000000-0000-4000-8000-000000000001',
  personnel: '70000000-0000-4000-8000-000000000001',
  jsa: '80000000-0000-4000-8000-000000000001',
  pack: '90000000-0000-4000-8000-000000000001',
  dayA: 'a0000000-0000-4000-8000-000000000001',
  dayB: 'a0000000-0000-4000-8000-000000000002',
  dayC: 'a0000000-0000-4000-8000-000000000003',
  aircraftA: 'b0000000-0000-4000-8000-000000000001',
  aircraftB: 'b0000000-0000-4000-8000-000000000002',
  assignmentA: 'c0000000-0000-4000-8000-000000000001',
  assignmentB: 'c0000000-0000-4000-8000-000000000002',
  meterA: 'd0000000-0000-4000-8000-000000000001',
  meterB: 'd0000000-0000-4000-8000-000000000002',
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
      ) values('${ids.pack}','${orgA}','${baseA}','${ids.mission}',1,'{}','${actorA}','${ids.job}','PREPARING','${ids.jsa}','${'a'.repeat(64)}','{}');
      insert into public.mission_pack_fields(organisation_id,operating_location_id,mission_id,job_id,pack_revision_id,property_id,field_id,field_order)
        values('${orgA}','${baseA}','${ids.mission}','${ids.job}','${ids.pack}','${ids.property}','${ids.field}',1);
      insert into public.aircraft(
        id,organisation_id,operating_location_id,registration,manufacturer,model,serial_number,status,serviceability_state,mission_ready,
        mtow,max_altitude,max_wind_speed,total_flight_hours,hours_since_last_service,insurance_policy_number,insurance_provider,
        insurance_expiry_date,insurance_coverage_amount,hull_value,min_operating_temp,max_operating_temp,max_payload_weight,
        max_flight_time,service_range,minimum_crew_size,created_by_internal_user_id,updated_by_internal_user_id
      ) values
        ('${ids.aircraftA}','${orgA}','${baseA}','FTF-T100-001','DJI','T100','SER-001','operational','serviceable',true,100,120,30,0,0,'POL-1','Insurer','2030-01-01',100000,50000,-10,50,50,60,10,1,'${actorA}','${actorA}'),
        ('${ids.aircraftB}','${orgA}','${baseA}','FTF-T100-002','DJI','T100','SER-002','operational','serviceable',true,100,120,30,0,0,'POL-2','Insurer','2030-01-01',100000,50000,-10,50,50,60,10,1,'${actorA}','${actorA}');
      insert into public.mission_aircraft_assignments(id,organisation_id,operating_location_id,mission_id,aircraft_id,assigned_by_internal_user_id) values
        ('${ids.assignmentA}','${orgA}','${baseA}','${ids.mission}','${ids.aircraftA}','${actorA}'),
        ('${ids.assignmentB}','${orgA}','${baseA}','${ids.mission}','${ids.aircraftB}','${actorA}');
      insert into public.maintainable_asset_registry(organisation_id,aircraft_id,created_by_internal_user_id,updated_by_internal_user_id)
        select organisation_id,id,'${actorA}','${actorA}' from public.aircraft where organisation_id='${orgA}';
      insert into public.asset_meter_definitions(id,organisation_id,maintainable_asset_id,meter_type,name,unit,precision_scale,source_policy,created_by_internal_user_id)
        select '${ids.meterA}','${orgA}',id,'flight_hours','Flight hours','h',4,'MISSION_DERIVED','${actorA}' from public.maintainable_asset_registry where aircraft_id='${ids.aircraftA}';
      insert into public.asset_meter_definitions(id,organisation_id,maintainable_asset_id,meter_type,name,unit,precision_scale,source_policy,created_by_internal_user_id)
        select '${ids.meterB}','${orgA}',id,'flight_hours','Flight hours','h',4,'MISSION_DERIVED','${actorA}' from public.maintainable_asset_registry where aircraft_id='${ids.aircraftB}';
      insert into public.mission_operating_days(
        id,organisation_id,operating_location_id,mission_id,work_date,timezone,mission_pack_revision_id,jsa_revision_id,state,
        actual_started_at,created_by_internal_user_id,updated_by_internal_user_id
      ) values
        ('${ids.dayA}','${orgA}','${baseA}','${ids.mission}','2026-09-05','Australia/Brisbane','${ids.pack}','${ids.jsa}','IN_PROGRESS','2026-09-04T15:00:00Z','${actorA}','${actorA}'),
        ('${ids.dayB}','${orgA}','${baseA}','${ids.mission}','2026-09-06','Australia/Brisbane','${ids.pack}','${ids.jsa}','IN_PROGRESS','2026-09-05T15:00:00Z','${actorA}','${actorA}');
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
      JSON.stringify([{ aircraftId: ids.aircraftA, totalFlightHours: null }]),
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
      JSON.stringify([{ aircraftId: ids.aircraftA, totalFlightHours: '9.0000' }]),
      JSON.stringify([{ aircraftId: ids.aircraftA, durationHours: '10.0000', startedAt: null, finishedAt: null, fieldId: null, sourceImportId: null }]),
    ]);
    expect(saved).toMatchObject({ ready_for_sign_off: false });
    expect(saved.actuals[0].reconciliation_status).toBe('MISMATCH');
    expect(await call('ftf_reconcile_mission_aircraft_day_actuals', [orgA, actorA, ids.mission, ids.dayB])).toMatchObject({ error: 'AIRCRAFT_FLIGHT_TOTAL_MISMATCH' });
    await db.exec(`update public.mission_operating_days set state='COMPLETED',actual_finished_at='2026-09-06T03:00:00Z' where id='${ids.dayB}'`);
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

  test('projects signed-off daily totals once through the existing Fleet meter command', async () => {
    await db.exec(`
      update public.mission_operating_days set state='COMPLETED',actual_finished_at='2026-09-05T03:00:00Z' where id='${ids.dayA}';
      begin;
      select set_config('app.mission_operating_day_signoff','allowed',true);
      update public.mission_operating_days set state='SIGNED_OFF' where id='${ids.dayA}';
      commit;
    `);
    const first = await call('ftf_project_signed_off_aircraft_day_actuals', [orgA, actorA, ids.mission, ids.dayA]);
    const second = await call('ftf_project_signed_off_aircraft_day_actuals', [orgA, actorA, ids.mission, ids.dayA]);
    expect(first).toMatchObject({ projected_count: 2, idempotent_count: 0 });
    expect(second).toMatchObject({ projected_count: 0, idempotent_count: 2 });
    expect(await scalar(db, `select count(*)::integer as value from public.asset_meter_readings where organisation_id='${orgA}' and source_system='mission_aircraft_day_actual'`)).toBe(2);
    expect(await scalar(db, `select sum(value)::text as value from public.asset_meter_readings where organisation_id='${orgA}' and source_system='mission_aircraft_day_actual'`)).toBe('20.000000');
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
      JSON.stringify([{ aircraftId: ids.aircraftB, totalFlightHours: null }]),
      JSON.stringify([{ aircraftId: ids.aircraftB, durationHours: '1.0000', startedAt: null, finishedAt: null, fieldId: null, sourceImportId: result.record.id }]),
    ])).toMatchObject({ error: 'MISSION_FLIGHT_IMPORT_NOT_FOUND' });
    expect(await scalar(db, `select count(*)::integer as value from public.mission_aircraft_day_actuals where operating_day_id='${ids.dayC}'`)).toBe(0);
    expect(await call('ftf_save_mission_aircraft_day_actuals', [
      orgA, actorA, ids.mission, ids.dayC, 1, '1.0000',
      JSON.stringify([{ aircraftId: ids.aircraftA, totalFlightHours: null }]),
      JSON.stringify([{ aircraftId: ids.aircraftA, durationHours: '1.0000', startedAt: null, finishedAt: null, fieldId: null, sourceImportId: result.record.id }]),
    ])).toMatchObject({ total_aircraft_hours: '1.0000', ready_for_sign_off: true });
    await expect(db.exec(`update public.mission_operational_imports set original_filename='changed.kml' where id='${result.record.id}'`)).rejects.toThrow();
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
