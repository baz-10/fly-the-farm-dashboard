const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { TextDecoder, TextEncoder } = require('util');
global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;
const { PGlite } = require('@electric-sql/pglite');

const root = path.join(__dirname, '../..');
const file = path.join(root, 'supabase/migrations/20260905130000_mission_day_chemical_and_weather_actuals.sql');
const migrations = path.join(root, 'supabase/migrations');
const migration = () => fs.readFileSync(file, 'utf8').toLowerCase();
const child = process.env.MISSION_DAY_CHEMICAL_WEATHER_PGLITE_CHILD === '1';
const tests = [];
if (child) {
  global.jest = { setTimeout: () => {} };
  global.expect = require('expect');
  global.test = (name, run) => tests.push({ name, run });
}
jest.setTimeout(300000);

test('chemical actuals require operating day and authorised Field scope', () => {
  const sql = migration();
  for (const token of ['mission_day_chemical_revisions', 'mission_day_chemical_lines', 'mission_day_field_invalid']) expect(sql).toContain(token);
  expect(sql).toContain('planned_chemical_revision_id');
  expect(sql).toContain('mission_reauthorisation_required');
});

test('weather stores one immutable UTC interval with Base timezone provenance', () => {
  const sql = migration();
  for (const token of ['mission_day_weather_reports', 'interval_start_at', 'interval_end_at', 'timezone', 'source_digest']) expect(sql).toContain(token);
  expect(sql).toContain('full_day');
  expect(sql).toContain('actual_interval');
  expect(sql).toContain('reject_append_only_mutation');
});

test('trusted commands retain scope, concurrency, audit and outbox boundaries', () => {
  const sql = migration();
  for (const token of [
    'ftf_read_mission_day_chemical_actuals', 'ftf_confirm_mission_day_chemical_actuals',
    'ftf_prepare_mission_day_weather_capture', 'ftf_freeze_mission_day_weather_report',
    'ftf_read_mission_day_weather_report', 'p_expected_day_version', 'p_expected_revision',
    'ftf_actor_has_permission', 'ftf_operational_location_allowed', 'audit_events', 'transactional_outbox',
  ]) expect(sql).toContain(token);
});

const ids = {
  authA: '10000000-0000-4000-8000-000000000001', authB: '10000000-0000-4000-8000-000000000002',
  client: '20000000-0000-4000-8000-000000000001', property: '30000000-0000-4000-8000-000000000001',
  fieldA: '40000000-0000-4000-8000-000000000001', fieldB: '40000000-0000-4000-8000-000000000002',
  job: '50000000-0000-4000-8000-000000000001', mission: '60000000-0000-4000-8000-000000000001',
  personnel: '70000000-0000-4000-8000-000000000001', jsa: '80000000-0000-4000-8000-000000000001',
  pack: '90000000-0000-4000-8000-000000000001', plan: 'a0000000-0000-4000-8000-000000000001',
  planLine: 'a0000000-0000-4000-8000-000000000002', dayDraft: 'b0000000-0000-4000-8000-000000000001',
  dayActual: 'b0000000-0000-4000-8000-000000000002', dayFull: 'b0000000-0000-4000-8000-000000000003',
  aircraft: 'c0000000-0000-4000-8000-000000000001', assignment: 'c0000000-0000-4000-8000-000000000002',
  aircraftOther: 'c0000000-0000-4000-8000-000000000003', assignmentOther: 'c0000000-0000-4000-8000-000000000004',
  weather: 'd0000000-0000-4000-8000-000000000001',
};
const scalar = async (db, sql, params = []) => (await db.query(sql, params)).rows[0]?.value;

if (child) {
  let db; let orgA; let orgB; let actorA; let actorB; let baseA;
  const call = async (name, args) => scalar(db, `select public.${name}(${args.map((_, index) => `$${index + 1}`).join(',')}) as value`, args);
  const chemicalLine = (overrides = {}) => ({
    fieldId: ids.fieldA, plannedLineId: ids.planLine, platformProductId: null, platformProductVersionId: null,
    registerEntryId: null, productName: 'Test Product', rate: '2.000000', rateUnit: 'L_HA',
    appliedQuantity: '20.000000', quantityUnit: 'L', batchLot: 'LOT-001', aircraftId: ids.aircraft, ...overrides,
  });
  const weatherEvidence = (source, overrides = {}) => ({
    source, providerIdentifier: source === 'OPEN_METEO' ? 'OPEN_METEO_ARCHIVE_V1' : null,
    providerRetrievedAt: source === 'OPEN_METEO' ? '2026-09-06T00:00:00.000Z' : null,
    hourlyObservations: [{ observedAt: '2026-09-04T22:00:00.000Z', temperatureC: 24, relativeHumidity: 60, dewPointC: 16, windSpeedKmh: 10, windDirectionDegrees: 90, precipitationMm: 0 }],
    inversionInputs: { method: 'OPEN_METEO_HOURLY_PROXY_V1', inputsAvailable: false },
    inversionResults: { assessment: 'UNABLE_TO_DETERMINE', reason: 'No vertical profile.' }, coverageGaps: [],
    manualReason: source === 'MANUAL' ? 'Provider unavailable; copied from the on-site station log.' : null,
    sourceMetadata: { attribution: source === 'OPEN_METEO' ? 'Weather data by Open-Meteo.com' : 'On-site station log' }, ...overrides,
  });

  test('executes the migration chain and seeds canonical Mission planning authority', async () => {
    const { pgcrypto } = require(path.join(root, 'node_modules/@electric-sql/pglite/dist/contrib/pgcrypto.cjs'));
    db = new PGlite({ extensions: { pgcrypto } });
    await db.exec(`create schema auth;create table auth.users(id uuid primary key,email text unique);create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;create role anon;create role authenticated;create role service_role;create extension if not exists pgcrypto;`);
    const excluded = new Set(['20260804162000_production_beta_platform_identity_reconciliation.sql', '20260805131000_personnel_compliance_evidence_storage.sql', '20260805144000_checklist_evidence_storage.sql']);
    for (const name of fs.readdirSync(migrations).filter((name) => /^\d{14}_.+\.sql$/.test(name)).sort()) if (!excluded.has(name)) {
      const sql = fs.readFileSync(path.join(migrations, name), 'utf8');
      try { await db.exec(sql); } catch (error) { throw new Error(`${name}: ${error.message}`); }
    }
    await db.exec(`insert into auth.users(id,email) values('${ids.authA}','a@example.test'),('${ids.authB}','b@example.test')`);
    const a = await call('ftf_bootstrap_production_beta_organisation', [ids.authA, 'Organisation A', 'Admin A', 'Base A', null, 'Australia/Brisbane']);
    const b = await call('ftf_bootstrap_production_beta_organisation', [ids.authB, 'Organisation B', 'Admin B', 'Base B', null, 'Australia/Brisbane']);
    orgA = a.organisation_id; actorA = a.internal_user_id; baseA = a.operating_location_id; orgB = b.organisation_id; actorB = b.internal_user_id;
    await db.exec(`
      insert into public.clients(id,organisation_id,name) values('${ids.client}','${orgA}','Client A');
      insert into public.properties(id,organisation_id,client_id,name,latitude,longitude) values('${ids.property}','${orgA}','${ids.client}','Property A',-27.5,153.1);
      insert into public.fields(id,organisation_id,property_id,name,area_hectares) values('${ids.fieldA}','${orgA}','${ids.property}','Field A',10),('${ids.fieldB}','${orgA}','${ids.property}','Field B',10);
      insert into public.jobs(id,organisation_id,client_id,property_id,reference) values('${ids.job}','${orgA}','${ids.client}','${ids.property}','JOB-A');
      insert into public.job_fields(organisation_id,property_id,job_id,field_id,target_area_hectares) values('${orgA}','${ids.property}','${ids.job}','${ids.fieldA}',10),('${orgA}','${ids.property}','${ids.job}','${ids.fieldB}',10);
      insert into public.missions(id,organisation_id,job_id,operating_location_id,mission_number) values('${ids.mission}','${orgA}','${ids.job}','${baseA}','MIS-A');
      insert into public.personnel(id,organisation_id,internal_user_id,full_name,created_by_internal_user_id,updated_by_internal_user_id) values('${ids.personnel}','${orgA}','${actorA}','Operator A','${actorA}','${actorA}');
      insert into public.mission_jsa_revisions(id,organisation_id,operating_location_id,mission_id,version_number,template_id,template_version_id,template_version,policy_id,policy_version_id,policy_version,policy_snapshot,template_snapshot,created_by_internal_user_id)
        select '${ids.jsa}','${orgA}','${baseA}','${ids.mission}',1,'b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000101',1,p.id,pv.id,pv.version_number,to_jsonb(pv),to_jsonb(tv),'${actorA}' from public.organisation_jsa_policies p join public.organisation_jsa_policy_versions pv on pv.organisation_id=p.organisation_id and pv.policy_id=p.id join public.platform_jsa_template_versions tv on tv.id='b1000000-0000-4000-8000-000000000101' where p.organisation_id='${orgA}';
      insert into public.mission_chemical_plan_revisions(id,organisation_id,operating_location_id,mission_id,version_number,treatment_area_ha,application_volume_l_ha,tank_capacity_l,total_spray_volume_l,water_required_l,hectares_per_batch,batch_count,created_by_internal_user_id)
        values('${ids.plan}','${orgA}','${baseA}','${ids.mission}',1,10,40,100,400,380,2.5,4,'${actorA}');
      insert into public.mission_chemical_plan_lines(id,organisation_id,revision_id,mission_id,line_number,match_state,product_name,normalised_product_name,rate,rate_unit,total_product_quantity,total_product_unit,product_per_batch,snapshot)
        values('${ids.planLine}','${orgA}','${ids.plan}','${ids.mission}',1,'UNMATCHED','Test Product','test product',2,'L_HA',20,'L',5,'{}');
      insert into public.mission_weather_observations(id,organisation_id,operating_location_id,mission_id,version_number,source,provider_identifier,observation_location,latitude,longitude,location_source,location_captured_at,observed_at,retrieved_at,temperature_c,relative_humidity,delta_t_c,delta_t_source,calculated_delta_t_c,delta_t_variance_c,delta_t_variance_warning,wind_speed_kmh,wind_direction_degrees,precipitation_mm,inversion_assessment,inversion_assessment_source,inversion_assessed_at,provider_snapshot,transformation_metadata,created_by_internal_user_id)
        values('${ids.weather}','${orgA}','${baseA}','${ids.mission}',1,'OPEN_METEO','OPEN_METEO','Mission boundary',-27.5,153.1,'DEVICE_GPS','2026-09-01T00:00:00Z','2026-09-01T00:00:00Z','2026-09-01T00:00:00Z',24,60,5.4,'CALCULATED',5.4,0,false,10,90,0,'UNLIKELY','OPEN_METEO','2026-09-01T00:00:00Z','{}','{}','${actorA}');
      insert into public.aircraft(id,organisation_id,operating_location_id,registration,manufacturer,model,serial_number,status,serviceability_state,mission_ready,mtow,max_altitude,max_wind_speed,total_flight_hours,hours_since_last_service,insurance_policy_number,insurance_provider,insurance_expiry_date,insurance_coverage_amount,hull_value,min_operating_temp,max_operating_temp,max_payload_weight,max_flight_time,service_range,minimum_crew_size,created_by_internal_user_id,updated_by_internal_user_id)
        values('${ids.aircraft}','${orgA}','${baseA}','FTF-T100-001','DJI','T100','SER-001','operational','serviceable',true,100,120,30,0,0,'POL-1','Insurer','2030-01-01',100000,50000,-10,50,50,60,10,1,'${actorA}','${actorA}'),
          ('${ids.aircraftOther}','${orgA}','${baseA}','FTF-T100-002','DJI','T100','SER-002','operational','serviceable',true,100,120,30,0,0,'POL-2','Insurer','2030-01-01',100000,50000,-10,50,50,60,10,1,'${actorA}','${actorA}');
      insert into public.mission_aircraft_assignments(id,organisation_id,operating_location_id,mission_id,aircraft_id,assigned_by_internal_user_id) values
        ('${ids.assignment}','${orgA}','${baseA}','${ids.mission}','${ids.aircraft}','${actorA}'),
        ('${ids.assignmentOther}','${orgA}','${baseA}','${ids.mission}','${ids.aircraftOther}','${actorA}');
      insert into public.mission_pack_revisions(id,organisation_id,operating_location_id,mission_id,version_number,pack_snapshot,generated_by_internal_user_id,job_id,package_state,jsa_revision_id,evidence_digest,source_manifest)
        values('${ids.pack}','${orgA}','${baseA}','${ids.mission}',1,'{}','${actorA}','${ids.job}','PREPARING','${ids.jsa}','${'a'.repeat(64)}','${JSON.stringify({ chemicals: { id: ids.plan, version: 1 }, weather: { observationId: ids.weather, observationVersion: 1 }, aircraftAssignments: [{ id: ids.assignment, aircraftId: ids.aircraft, aircraftRowVersion: 1 }] })}');
      insert into public.mission_pack_fields(organisation_id,operating_location_id,mission_id,job_id,pack_revision_id,property_id,field_id,field_order) values('${orgA}','${baseA}','${ids.mission}','${ids.job}','${ids.pack}','${ids.property}','${ids.fieldA}',1);
      insert into public.mission_operating_days(id,organisation_id,operating_location_id,mission_id,work_date,timezone,mission_pack_revision_id,jsa_revision_id,state,actual_started_at,actual_finished_at,created_by_internal_user_id,updated_by_internal_user_id) values
        ('${ids.dayDraft}','${orgA}','${baseA}','${ids.mission}','2026-09-04','Australia/Brisbane','${ids.pack}','${ids.jsa}','DRAFT',null,null,'${actorA}','${actorA}'),
        ('${ids.dayActual}','${orgA}','${baseA}','${ids.mission}','2026-09-05','Australia/Brisbane','${ids.pack}','${ids.jsa}','COMPLETED','2026-09-04T21:30:00Z','2026-09-05T03:15:00Z','${actorA}','${actorA}'),
        ('${ids.dayFull}','${orgA}','${baseA}','${ids.mission}','2026-09-06','Australia/Brisbane','${ids.pack}','${ids.jsa}','IN_PROGRESS','2026-09-05T22:00:00Z',null,'${actorA}','${actorA}');
    `);
  });

  test('returns plan lines only as proposals and does not persist them before confirmation', async () => {
    const result = await call('ftf_read_mission_day_chemical_actuals', [orgA, actorA, ids.mission, ids.dayDraft]);
    expect(result).toMatchObject({ planned_chemical_revision_id: ids.plan, current_revision: 0, actual: null });
    expect(result.proposals[0]).toMatchObject({ planned_line_id: ids.planLine, product_name: 'Test Product', rate: '2.000000' });
    expect(await scalar(db, `select count(*)::integer as value from public.mission_day_chemical_revisions where operating_day_id='${ids.dayDraft}'`)).toBe(0);
  });

  test('requires reauthorisation for a material pre-operation change without partial writes', async () => {
    expect(await call('ftf_confirm_mission_day_chemical_actuals', [orgA, actorA, ids.mission, ids.dayDraft, 1, 0, JSON.stringify([chemicalLine({ rate: '3.000000' })]), null]))
      .toMatchObject({ error: 'MISSION_REAUTHORISATION_REQUIRED' });
    expect(await scalar(db, `select count(*)::integer as value from public.mission_day_chemical_revisions where operating_day_id='${ids.dayDraft}'`)).toBe(0);
  });

  test('rejects cross-Field actuals and confirms exact planned evidence explicitly', async () => {
    expect(await call('ftf_confirm_mission_day_chemical_actuals', [orgA, actorA, ids.mission, ids.dayDraft, 1, 0, JSON.stringify([chemicalLine({ fieldId: ids.fieldB })]), null]))
      .toMatchObject({ error: 'MISSION_DAY_FIELD_INVALID' });
    const confirmed = await call('ftf_confirm_mission_day_chemical_actuals', [orgA, actorA, ids.mission, ids.dayDraft, 1, 0, JSON.stringify([chemicalLine()]), 'Checked against the plan.']);
    expect(confirmed).toMatchObject({ current_revision: 1, actual: { changed_from_plan: false, confirmation_state: 'CONFIRMED' } });
    expect(confirmed.actual.lines[0]).toMatchObject({ field_id: ids.fieldA, product_name: 'Test Product', applied_quantity: '20.000000', batch_lot: 'LOT-001', aircraft_id: ids.aircraft });
  });

  test('retains post-operation variance without rewriting the approved plan', async () => {
    const before = await scalar(db, `select rate::text as value from public.mission_chemical_plan_lines where id='${ids.planLine}'`);
    const result = await call('ftf_confirm_mission_day_chemical_actuals', [orgA, actorA, ids.mission, ids.dayActual, 1, 0, JSON.stringify([chemicalLine({ rate: '3.000000', appliedQuantity: '27.500000', batchLot: 'LOT-ACTUAL' })]), 'Actual application variance recorded after work.']);
    expect(result).toMatchObject({ actual: { changed_from_plan: true, material_variance: true } });
    expect(result.actual.lines[0]).toMatchObject({ rate: '3.000000', applied_quantity: '27.500000' });
    expect(await scalar(db, `select rate::text as value from public.mission_chemical_plan_lines where id='${ids.planLine}'`)).toBe(before);
    await expect(db.exec(`update public.mission_day_chemical_revisions set notes='changed' where id='${result.actual.id}'`)).rejects.toThrow();
    await expect(db.exec(`delete from public.mission_day_chemical_lines where revision_id='${result.actual.id}'`)).rejects.toThrow();
  });

  test('accepts aircraft provenance only from the operating day package', async () => {
    expect(await call('ftf_confirm_mission_day_chemical_actuals', [orgA, actorA, ids.mission, ids.dayFull, 1, 0, JSON.stringify([chemicalLine({ aircraftId: ids.aircraftOther })]), null]))
      .toMatchObject({ error: 'MISSION_DAY_AIRCRAFT_INVALID' });
  });

  test('derives exact actual and Base-local full-day UTC intervals without host timezone dependence', async () => {
    expect(await call('ftf_prepare_mission_day_weather_capture', [orgA, actorA, ids.mission, ids.dayActual, 'ACTUAL_INTERVAL']))
      .toMatchObject({ coverage: 'ACTUAL_INTERVAL', interval_start_at: '2026-09-04T21:30:00.000Z', interval_end_at: '2026-09-05T03:15:00.000Z', timezone: 'Australia/Brisbane', latitude: '-27.500000', longitude: '153.100000' });
    expect(await call('ftf_prepare_mission_day_weather_capture', [orgA, actorA, ids.mission, ids.dayDraft, 'ACTUAL_INTERVAL']))
      .toMatchObject({ error: 'MISSION_DAY_ACTUAL_INTERVAL_REQUIRED' });
    expect(await call('ftf_prepare_mission_day_weather_capture', [orgA, actorA, ids.mission, ids.dayFull, 'FULL_DAY']))
      .toMatchObject({ coverage: 'FULL_DAY', interval_start_at: '2026-09-05T14:00:00.000Z', interval_end_at: '2026-09-06T14:00:00.000Z', timezone: 'Australia/Brisbane' });
  });

  test('freezes provider evidence once with a canonical digest and never refreshes reads', async () => {
    const prepared = await call('ftf_prepare_mission_day_weather_capture', [orgA, actorA, ids.mission, ids.dayActual, 'ACTUAL_INTERVAL']);
    const frozen = await call('ftf_freeze_mission_day_weather_report', [orgA, actorA, ids.mission, ids.dayActual, prepared.day_version, 'ACTUAL_INTERVAL', JSON.stringify(weatherEvidence('OPEN_METEO'))]);
    expect(frozen.report).toMatchObject({ coverage: 'ACTUAL_INTERVAL', source: 'OPEN_METEO', timezone: 'Australia/Brisbane', interval_start_at: '2026-09-04T21:30:00.000Z', interval_end_at: '2026-09-05T03:15:00.000Z' });
    expect(frozen.report.source_digest).toMatch(/^[a-f0-9]{64}$/);
    const originalDigest = frozen.report.source_digest;
    expect(await call('ftf_freeze_mission_day_weather_report', [orgA, actorA, ids.mission, ids.dayActual, prepared.day_version, 'ACTUAL_INTERVAL', JSON.stringify(weatherEvidence('OPEN_METEO', { providerRetrievedAt: '2026-09-07T00:00:00.000Z' }))]))
      .toMatchObject({ error: 'MISSION_DAY_WEATHER_ALREADY_FROZEN', current_digest: originalDigest });
    expect((await call('ftf_read_mission_day_weather_report', [orgA, actorA, ids.mission, ids.dayActual])).report.source_digest).toBe(originalDigest);
    await expect(db.exec(`update public.mission_day_weather_reports set provider_identifier='changed' where operating_day_id='${ids.dayActual}'`)).rejects.toThrow();
  });

  test('accepts explicit manual evidence fallback and rejects foreign tenant reads', async () => {
    const prepared = await call('ftf_prepare_mission_day_weather_capture', [orgA, actorA, ids.mission, ids.dayFull, 'FULL_DAY']);
    const frozen = await call('ftf_freeze_mission_day_weather_report', [orgA, actorA, ids.mission, ids.dayFull, prepared.day_version, 'FULL_DAY', JSON.stringify(weatherEvidence('MANUAL', { hourlyObservations: [{ observedAt: '2026-09-05T22:00:00.000Z', temperatureC: 23, relativeHumidity: 65, dewPointC: 16, windSpeedKmh: 8, windDirectionDegrees: 100, precipitationMm: 0 }] }))]);
    expect(frozen.report).toMatchObject({ source: 'MANUAL', coverage: 'FULL_DAY', manual_reason: 'Provider unavailable; copied from the on-site station log.' });
    expect(await call('ftf_read_mission_day_weather_report', [orgB, actorB, ids.mission, ids.dayFull])).toMatchObject({ error: 'MISSION_OPERATING_DAY_NOT_FOUND' });
  });

  test('rejects malformed hourly weather evidence before freezing any report', async () => {
    const evidence = weatherEvidence('MANUAL', { hourlyObservations: [{
      observedAt: '2026-09-03T16:00:00.000Z', temperatureC: 23, relativeHumidity: 120,
      dewPointC: 16, windSpeedKmh: 8, windDirectionDegrees: 100, precipitationMm: 0,
    }] });
    expect(await call('ftf_freeze_mission_day_weather_report', [orgA, actorA, ids.mission, ids.dayDraft, 1, 'FULL_DAY', JSON.stringify(evidence)]))
      .toMatchObject({ error: 'MISSION_DAY_WEATHER_INPUT_INVALID' });
    expect(await scalar(db, `select count(*)::integer as value from public.mission_day_weather_reports where operating_day_id='${ids.dayDraft}'`)).toBe(0);
    expect(await call('ftf_freeze_mission_day_weather_report', [orgA, actorA, ids.mission, ids.dayDraft, 1, 'FULL_DAY', JSON.stringify(weatherEvidence('MANUAL', {
      providerRetrievedAt: '2026-09-06T00:00:00.000Z',
      hourlyObservations: [{ observedAt: '2026-09-03T16:00:00.000Z', temperatureC: 23, relativeHumidity: 60, dewPointC: 16, windSpeedKmh: 8, windDirectionDegrees: 100, precipitationMm: 0 }],
    }))])).toMatchObject({ error: 'MISSION_DAY_WEATHER_INPUT_INVALID' });
    expect(await scalar(db, `select count(*)::integer as value from public.mission_day_weather_reports where operating_day_id='${ids.dayDraft}'`)).toBe(0);
  });

  test('enforces revision and day concurrency and writes audit and outbox evidence', async () => {
    expect(await call('ftf_confirm_mission_day_chemical_actuals', [orgA, actorA, ids.mission, ids.dayActual, 1, 0, JSON.stringify([chemicalLine()]), null]))
      .toMatchObject({ error: 'MISSION_DAY_CHEMICAL_REVISION_CONFLICT', current_version: 1 });
    expect(await call('ftf_freeze_mission_day_weather_report', [orgA, actorA, ids.mission, ids.dayDraft, 0, 'FULL_DAY', JSON.stringify(weatherEvidence('MANUAL'))]))
      .toMatchObject({ error: 'MISSION_OPERATING_DAY_VERSION_CONFLICT', current_version: 1 });
    expect(await scalar(db, `select count(*)::integer as value from public.audit_events where organisation_id='${orgA}' and event_type like 'mission.day_%'`)).toBeGreaterThan(1);
    expect(await scalar(db, `select count(*)::integer as value from public.transactional_outbox where organisation_id='${orgA}' and topic like 'operational.mission.day_%'`)).toBeGreaterThan(1);
    await db.close();
  });
} else {
  test('passes repeatable chemical actual and frozen weather checks in PostgreSQL', () => {
    try {
      execFileSync(process.execPath, [__filename], { cwd: root, env: { ...process.env, MISSION_DAY_CHEMICAL_WEATHER_PGLITE_CHILD: '1', TZ: 'Australia/Brisbane' }, stdio: 'pipe' });
    } catch (error) {
      throw new Error(`${error.stdout || ''}${error.stderr || ''}` || error.message);
    }
  });
}

if (child) {
  (async () => {
    for (const { name, run } of tests) { await run(); process.stdout.write(`PASS ${name}\n`); }
  })().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
}
