const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { TextDecoder, TextEncoder } = require('util');

global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;

const { PGlite } = require('@electric-sql/pglite');

const root = path.resolve(__dirname, '../..');
const file = path.join(root, 'supabase/migrations/20260905110000_mission_operating_days_and_jsa_reviews.sql');
const migrations = path.join(root, 'supabase/migrations');
const migration = () => fs.readFileSync(file, 'utf8').toLowerCase();
const child = process.env.MISSION_OPERATING_DAYS_PGLITE_CHILD === '1';
const tests = [];

if (child) {
  global.jest = { setTimeout: () => {} };
  global.expect = require('expect');
  global.test = (name, run) => tests.push({ name, run });
}

jest.setTimeout(300000);

test('one local operating date is unique in the Base timezone', () => {
  const sql = migration();
  expect(sql).toContain('mission_operating_days');
  expect(sql).toContain('unique (organisation_id, mission_id, work_date)');
  expect(sql).toContain('operating_locations');
  expect(sql).toContain('numeric(18,6)');
  expect(sql).toContain('timestamptz');
});

test('day start requires current CRP authority and JSA review', () => {
  const sql = migration();
  for (const code of ['mission_not_authorised', 'jsa_day_review_required', 'mission_package_stale']) {
    expect(sql).toContain(code);
  }
});

const ids = {
  authA: '10000000-0000-4000-8000-000000000001',
  authB: '10000000-0000-4000-8000-000000000002',
  authAOtherBase: '10000000-0000-4000-8000-000000000003',
  authAWriter: '10000000-0000-4000-8000-000000000004',
  actorAOtherBase: '11000000-0000-4000-8000-000000000003',
  actorAWriter: '11000000-0000-4000-8000-000000000004',
  baseAOther: '12000000-0000-4000-8000-000000000002',
  writerRole: '13000000-0000-4000-8000-000000000001',
  membershipAOtherBase: '14000000-0000-4000-8000-000000000003',
  membershipAWriter: '14000000-0000-4000-8000-000000000004',
  seatAOtherBase: '15000000-0000-4000-8000-000000000003',
  seatAWriter: '15000000-0000-4000-8000-000000000004',
  locationAssignmentAOtherBase: '16000000-0000-4000-8000-000000000003',
  locationAssignmentAWriter: '16000000-0000-4000-8000-000000000004',
  client: '20000000-0000-4000-8000-000000000001',
  property: '30000000-0000-4000-8000-000000000001',
  fieldA: '40000000-0000-4000-8000-000000000001',
  fieldB: '40000000-0000-4000-8000-000000000002',
  job: '50000000-0000-4000-8000-000000000001',
  mission: '60000000-0000-4000-8000-000000000001',
  personnel: '70000000-0000-4000-8000-000000000001',
  jsa: '80000000-0000-4000-8000-000000000001',
};

const scalar = async (db, sql, params = []) => (await db.query(sql, params)).rows[0]?.value;

if (child) {
  let db;
  let orgA;
  let orgB;
  let actorA;
  let actorB;
  let baseA;
  let pack;
  let day;

  const call = async (name, args) => scalar(
    db,
    `select public.${name}(${args.map((_, index) => `$${index + 1}`).join(',')}) as value`,
    args,
  );

  test('executes the migration chain and seeds one authorised multi-Field Mission', async () => {
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
    await db.exec(`insert into auth.users(id,email) values
      ('${ids.authA}','a@example.test'),
      ('${ids.authB}','b@example.test'),
      ('${ids.authAOtherBase}','a-other-base@example.test'),
      ('${ids.authAWriter}','a-writer@example.test')`);
    const a = await call('ftf_bootstrap_production_beta_organisation', [ids.authA, 'Organisation A', 'Admin A', 'Base A', null, 'Australia/Brisbane']);
    const b = await call('ftf_bootstrap_production_beta_organisation', [ids.authB, 'Organisation B', 'Admin B', 'Base B', null, 'Australia/Brisbane']);
    orgA = a.organisation_id; actorA = a.internal_user_id; baseA = a.operating_location_id;
    orgB = b.organisation_id; actorB = b.internal_user_id;
    await db.exec(`
      update public.organisation_seat_allocations set allocated_seats=3 where organisation_id='${orgA}';
      insert into public.operating_locations(id,organisation_id,name,timezone)
        values('${ids.baseAOther}','${orgA}','Base A Other','Australia/Brisbane');
      insert into public.internal_users(id,organisation_id,auth_user_id,display_name) values
        ('${ids.actorAOtherBase}','${orgA}','${ids.authAOtherBase}','Other Base Admin'),
        ('${ids.actorAWriter}','${orgA}','${ids.authAWriter}','Base A Writer');
      insert into public.roles(id,organisation_id,code,name)
        values('${ids.writerRole}','${orgA}','mission_writer_test','Mission writer test');
      insert into public.memberships(id,organisation_id,internal_user_id,role_id) values
        ('${ids.membershipAOtherBase}','${orgA}','${ids.actorAOtherBase}',(select id from public.roles where organisation_id='${orgA}' and code='admin')),
        ('${ids.membershipAWriter}','${orgA}','${ids.actorAWriter}','${ids.writerRole}');
      insert into public.role_permissions(organisation_id,role_id,permission_id)
        select '${orgA}','${ids.writerRole}',id from public.permissions
        where organisation_id='${orgA}' and code='mission.operational.write';
      insert into public.internal_user_seat_assignments(
        id,organisation_id,organisation_seat_allocation_id,internal_user_id,membership_id,status,assignment_source
      ) values
        ('${ids.seatAOtherBase}','${orgA}',(select id from public.organisation_seat_allocations where organisation_id='${orgA}'),'${ids.actorAOtherBase}','${ids.membershipAOtherBase}','active','mission_day_test'),
        ('${ids.seatAWriter}','${orgA}',(select id from public.organisation_seat_allocations where organisation_id='${orgA}'),'${ids.actorAWriter}','${ids.membershipAWriter}','active','mission_day_test');
      insert into public.membership_operating_location_assignments(
        id,organisation_id,membership_id,operating_location_id,assignment_source
      ) values
        ('${ids.locationAssignmentAOtherBase}','${orgA}','${ids.membershipAOtherBase}','${ids.baseAOther}','mission_day_test'),
        ('${ids.locationAssignmentAWriter}','${orgA}','${ids.membershipAWriter}','${baseA}','mission_day_test');
      insert into public.clients(id,organisation_id,name) values('${ids.client}','${orgA}','Client A');
      insert into public.properties(id,organisation_id,client_id,name) values('${ids.property}','${orgA}','${ids.client}','Property A');
      insert into public.fields(id,organisation_id,property_id,name,area_hectares) values
        ('${ids.fieldA}','${orgA}','${ids.property}','Field A',10),
        ('${ids.fieldB}','${orgA}','${ids.property}','Field B',20);
      insert into public.jobs(id,organisation_id,client_id,property_id,reference) values('${ids.job}','${orgA}','${ids.client}','${ids.property}','JOB-A');
      insert into public.job_fields(organisation_id,property_id,job_id,field_id,target_area_hectares) values
        ('${orgA}','${ids.property}','${ids.job}','${ids.fieldA}',9),
        ('${orgA}','${ids.property}','${ids.job}','${ids.fieldB}',19);
      insert into public.missions(id,organisation_id,job_id,operating_location_id,mission_number)
        values('${ids.mission}','${orgA}','${ids.job}','${baseA}','MIS-A');
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
      insert into public.mission_chemical_plan_revisions(
        organisation_id,operating_location_id,mission_id,version_number,treatment_area_ha,
        application_volume_l_ha,tank_capacity_l,total_spray_volume_l,water_required_l,
        hectares_per_batch,batch_count,created_by_internal_user_id
      ) values('${orgA}','${baseA}','${ids.mission}',1,28,10,100,280,250,10,3,'${actorA}');
      insert into public.personnel(id,organisation_id,internal_user_id,full_name,created_by_internal_user_id,updated_by_internal_user_id)
        values('${ids.personnel}','${orgA}','${actorA}','Eligible CRP','${actorA}','${actorA}');
      insert into public.personnel_operating_locations(organisation_id,personnel_id,operating_location_id,created_by_internal_user_id)
        values('${orgA}','${ids.personnel}','${baseA}','${actorA}');
      create table public.test_mission_readiness_dependency(blocked boolean not null);
      insert into public.test_mission_readiness_dependency(blocked) values(false);
      create or replace function public.ftf_evaluate_mission_readiness(p_organisation_id uuid,p_mission_id uuid,p_evaluated_at timestamptz default now())
      returns jsonb language sql stable as $$
        select jsonb_build_object(
          'ready',not dependency.blocked,
          'overallState',case when dependency.blocked then 'BLOCKED' else 'READY' end,
          'blockers',case when dependency.blocked then jsonb_build_array(jsonb_build_object('code','LIVE_DEPENDENCY_BLOCKED')) else '[]'::jsonb end,
          'warnings','[]'::jsonb,
          'evidenceManifest',jsonb_build_object('planning',jsonb_build_object('chemicals',jsonb_build_object('revision',1),'aircraft','[]'::jsonb,'equipmentKits','[]'::jsonb,'personnel',jsonb_build_object('assignments','[]'::jsonb)),'preflight',jsonb_build_object('jsa',jsonb_build_object('id','${ids.jsa}'),'observedWeather',null))
        ) from public.test_mission_readiness_dependency dependency
      $$;
    `);
    const preparing = await call('ftf_save_mission_package_scope', [orgA, actorA, ids.mission, 0, JSON.stringify([ids.fieldA])]);
    const submitted = await call('ftf_submit_mission_package', [orgA, actorA, ids.mission, preparing.record.id, 1, preparing.record.evidence_digest]);
    await call('ftf_decide_mission_package', [orgA, actorA, ids.mission, submitted.record.id, 2, submitted.record.evidence_digest, 'AUTHORISED', 'Reviewed exact evidence.']);
    pack = submitted.record;
  });

  test('creates one Base-local date and rejects a duplicate or foreign tenant', async () => {
    day = await call('ftf_create_mission_operating_day', [orgA, actorA, ids.mission, '2026-09-05', null]);
    expect(day.day).toMatchObject({ mission_id: ids.mission, work_date: '2026-09-05', timezone: 'Australia/Brisbane', package_revision_id: pack.id, jsa_revision_id: ids.jsa, state: 'DRAFT', row_version: 1 });
    expect(await call('ftf_create_mission_operating_day', [orgA, actorA, ids.mission, '2026-09-05', null])).toMatchObject({ error: 'MISSION_OPERATING_DATE_CONFLICT' });
    expect(await call('ftf_create_mission_operating_day', [orgB, actorB, ids.mission, '2026-09-05', null])).toMatchObject({ error: 'MISSION_OPERATING_DAY_NOT_FOUND' });
  });

  test('denies direct read and write RPCs to a same-org actor assigned only another Base', async () => {
    expect(await scalar(db, `select public.ftf_actor_has_permission('${orgA}','${ids.actorAOtherBase}','mission.operational.read') as value`)).toBe(true);
    expect(await scalar(db, `select public.ftf_actor_has_permission('${orgA}','${ids.actorAOtherBase}','mission.operational.write') as value`)).toBe(true);
    expect(await call('ftf_create_mission_operating_day', [orgA, ids.actorAOtherBase, ids.mission, '2026-09-07', null])).toMatchObject({ location_forbidden: true });
    expect(await call('ftf_read_mission_operating_days', [orgA, ids.actorAOtherBase, ids.mission])).toMatchObject({ location_forbidden: true });
  });

  test('requires the exact day JSA review and rejects Fields outside the authorised package', async () => {
    expect(await call('ftf_start_mission_operating_day', [orgA, actorA, ids.mission, day.day.id, 1, '2026-09-04T15:30:00.000Z'])).toMatchObject({ error: 'JSA_DAY_REVIEW_REQUIRED' });
    expect(await call('ftf_review_mission_day_jsa', [orgA, actorA, ids.mission, day.day.id, null, 'CONDITIONS_COVERED', null])).toMatchObject({ error: 'MISSION_OPERATING_DAY_VERSION_CONFLICT', current_version: 1 });
    const reviewed = await call('ftf_review_mission_day_jsa', [orgA, actorA, ids.mission, day.day.id, 1, 'CONDITIONS_COVERED', 'Conditions unchanged.']);
    expect(reviewed.day).toMatchObject({ state: 'READY', row_version: 2, jsa_review: { jsa_revision_id: ids.jsa } });
    expect(await call('ftf_save_mission_day_field_activity', [orgA, actorA, ids.mission, day.day.id, null, 0, ids.fieldB, '1.000000', null, null, null, 'PLANNED', null])).toMatchObject({ error: 'MISSION_DAY_FIELD_NOT_AUTHORISED' });
    expect(await call('ftf_save_mission_day_field_activity', [orgA, actorA, ids.mission, day.day.id, null, null, ids.fieldA, '1.000000', null, null, null, 'PLANNED', null])).toMatchObject({ error: 'MISSION_FIELD_ACTIVITY_VERSION_CONFLICT', current_version: 0 });
    const saved = await call('ftf_save_mission_day_field_activity', [orgA, actorA, ids.mission, day.day.id, null, 0, ids.fieldA, '1.250000', '1.000000', null, null, 'PLANNED', null]);
    expect(saved.day.field_activities[0]).toMatchObject({ field_id: ids.fieldA, hectares_attempted: '1.250000', hectares_completed: '1.000000' });
    day = saved;
  });

  test('rechecks live readiness under the aggregate lock immediately before start', async () => {
    expect(await scalar(db, `select (readiness_snapshot->>'ready')::boolean as value from public.mission_authorisation_revisions where mission_pack_revision_id='${pack.id}'`)).toBe(true);
    await db.exec(`update public.test_mission_readiness_dependency set blocked=true`);
    const blocked = await call('ftf_start_mission_operating_day', [orgA, actorA, ids.mission, day.day.id, 3, '2026-09-04T15:30:00.000Z']);
    expect(blocked).toMatchObject({ readiness_blocked: true, readiness: { ready: false, overallState: 'BLOCKED' } });
    expect(await scalar(db, `select state as value from public.mission_operating_days where id='${day.day.id}'`)).toBe('READY');
    expect(await scalar(db, `select count(*)::integer as value from public.audit_events where entity_id='${day.day.id}' and event_type='mission.operating_day.started'`)).toBe(0);
    await db.exec(`update public.test_mission_readiness_dependency set blocked=false`);
  });

  test('starts once under optimistic concurrency and preserves exact overnight timestamps', async () => {
    expect(await call('ftf_start_mission_operating_day', [orgA, actorA, ids.mission, day.day.id, null, '2026-09-04T15:30:00.000Z'])).toMatchObject({ error: 'MISSION_OPERATING_DAY_VERSION_CONFLICT', current_version: 3 });
    const started = await call('ftf_start_mission_operating_day', [orgA, actorA, ids.mission, day.day.id, 3, '2026-09-04T15:30:00.000Z']);
    expect(started.day).toMatchObject({ state: 'IN_PROGRESS', row_version: 4 });
    expect(new Date(started.day.actual_started_at).toISOString()).toBe('2026-09-04T15:30:00.000Z');
    expect(await call('ftf_start_mission_operating_day', [orgA, actorA, ids.mission, day.day.id, 3, '2026-09-04T15:30:00.000Z'])).toMatchObject({ error: 'MISSION_OPERATING_DAY_VERSION_CONFLICT', current_version: 4 });
    expect(await call('ftf_complete_mission_operating_day', [orgA, actorA, ids.mission, day.day.id, null, '2026-09-05T17:00:00.000Z', null])).toMatchObject({ error: 'MISSION_OPERATING_DAY_VERSION_CONFLICT', current_version: 4 });
    const completed = await call('ftf_complete_mission_operating_day', [orgA, actorA, ids.mission, day.day.id, 4, '2026-09-05T17:00:00.000Z', 'Overnight operation.']);
    expect(completed.day).toMatchObject({ state: 'COMPLETED', row_version: 5 });
    expect(new Date(completed.day.actual_finished_at).toISOString()).toBe('2026-09-05T17:00:00.000Z');
  });

  test('requires exact operational read permission at the direct read RPC', async () => {
    expect(await scalar(db, `select public.ftf_actor_has_permission('${orgA}','${ids.actorAWriter}','mission.operational.write') as value`)).toBe(true);
    expect(await scalar(db, `select public.ftf_actor_has_permission('${orgA}','${ids.actorAWriter}','mission.operational.read') as value`)).toBe(false);
    expect(await call('ftf_read_mission_operating_days', [orgA, ids.actorAWriter, ids.mission])).toMatchObject({ forbidden: true });
  });

  test('fails governed sign-off closed when aircraft-day authority is missing', async () => {
    await db.exec(`select set_config('app.mission_operating_day_signoff','allowed',false)`);
    await expect(db.exec(`update public.mission_operating_days set state='SIGNED_OFF' where id='${day.day.id}'`)).rejects.toThrow(/MISSION_AIRCRAFT_DAY_REQUIRED/);
    await db.exec(`select set_config('app.mission_operating_day_signoff','',false)`);
    expect(await scalar(db, `select state as value from public.mission_operating_days where id='${day.day.id}'`)).toBe('COMPLETED');
  });

  test('records administrative actual evidence without invalidating the effective package', async () => {
    const completionAuditId = await scalar(db, `select id::text as value from public.audit_events where organisation_id='${orgA}' and entity_id='${day.day.id}' and event_type='mission.operating_day.completed' order by created_at desc limit 1`);
    const recorded = await call('ftf_create_mission_amendment', [
      orgA, actorA, ids.mission, 2,
      JSON.stringify({ completionNotes: null }),
      JSON.stringify({ completionNotes: { auditEventId: completionAuditId } }),
      'Added the completed-day notes evidence.',
    ]);
    expect(recorded).toMatchObject({ classification: 'ADMINISTRATIVE', reasons: [], changed_keys: ['completionNotes'], package_revision: null });
    expect(recorded.after_values.completionNotes).toMatchObject({ auditEventId: completionAuditId, eventType: 'mission.operating_day.completed' });
    expect(await scalar(db, `select max(version_number)::integer as value from public.mission_pack_revisions where organisation_id='${orgA}' and mission_id='${ids.mission}'`)).toBe(2);
    expect(await scalar(db, `select current_authorised_pack_revision_id::text as value from public.missions where organisation_id='${orgA}' and id='${ids.mission}'`)).toBe(pack.id);
  });

  test('rejects browser assertions that do not match canonical non-Field authority', async () => {
    const chemicals = await scalar(db, `select source_manifest->'chemicals' as value from public.mission_pack_revisions where organisation_id='${orgA}' and id='${pack.id}'`);
    expect(await call('ftf_create_mission_amendment', [
      orgA, actorA, ids.mission, 2,
      JSON.stringify({ chemicalProductIds: chemicals }),
      JSON.stringify({ chemicalProductIds: { id: 'browser-forged' } }),
      'Claimed chemical change.',
    ])).toMatchObject({ error: 'MISSION_AMENDMENT_AFTER_MISMATCH' });
    expect(await call('ftf_create_mission_amendment', [
      orgA, actorA, ids.mission, 2,
      JSON.stringify({ completionNotes: null }),
      JSON.stringify({ completionNotes: { auditEventId: '99999999-9999-4999-8999-999999999999' } }),
      'Claimed completion evidence.',
    ])).toMatchObject({ error: 'MISSION_AMENDMENT_EVIDENCE_INVALID' });
  });

  test('fails closed when a newer unapproved package makes a reviewed day stale', async () => {
    const next = await call('ftf_create_mission_operating_day', [orgA, actorA, ids.mission, '2026-09-06', null]);
    const reviewed = await call('ftf_review_mission_day_jsa', [orgA, actorA, ids.mission, next.day.id, 1, 'CONDITIONS_COVERED', null]);
    const newer = await call('ftf_save_mission_package_scope', [orgA, actorA, ids.mission, 2, JSON.stringify([ids.fieldA, ids.fieldB])]);
    expect(newer.record.version_number).toBe(3);
    expect(await call('ftf_start_mission_operating_day', [orgA, actorA, ids.mission, next.day.id, reviewed.day.row_version, '2026-09-05T15:30:00.000Z'])).toMatchObject({ error: 'MISSION_PACKAGE_STALE' });
  });

  test('creates a prospective material revision while preserving completed-day authority', async () => {
    const amended = await call('ftf_create_mission_amendment', [
      orgA, actorA, ids.mission, 3,
      JSON.stringify({ fieldIds: [ids.fieldA] }),
      JSON.stringify({ fieldIds: [ids.fieldA, ids.fieldB] }),
      'Second Field added after site review.',
    ]);
    expect(amended).toMatchObject({ classification: 'MATERIAL', reasons: ['FIELD_SCOPE_CHANGED'], changed_keys: ['fieldIds'] });
    expect(amended.package_revision.record).toMatchObject({ version_number: 4, package_state: 'PREPARING' });
    expect(await scalar(db, `select current_authorised_pack_revision_id::text as value from public.missions where organisation_id='${orgA}' and id='${ids.mission}'`)).toBe(pack.id);
    expect(await scalar(db, `select mission_pack_revision_id::text as value from public.mission_operating_days where id='${day.day.id}'`)).toBe(pack.id);
    expect(await call('ftf_create_mission_operating_day', [orgA, actorA, ids.mission, '2026-09-07', null])).toMatchObject({ error: 'MISSION_PACKAGE_STALE' });
  });

  test('returns only bounded checked amendment history with authoritative values', async () => {
    const history = await call('ftf_read_mission_amendment_history', [orgA, actorA, ids.mission]);
    expect(history.records).toHaveLength(2);
    expect(history.records.map((record) => record.classification)).toEqual(['MATERIAL', 'ADMINISTRATIVE']);
    expect(history.records[0]).toMatchObject({
      beforeValues: { fieldIds: [ids.fieldA] }, afterValues: { fieldIds: [ids.fieldA, ids.fieldB] },
    });
    expect(await call('ftf_read_mission_amendment_history', [orgB, actorB, ids.mission])).toMatchObject({ error: 'MISSION_PACKAGE_NOT_FOUND' });
  });

  test('returns bounded day aggregates and writes audit plus outbox events', async () => {
    const result = await call('ftf_read_mission_operating_days', [orgA, actorA, ids.mission]);
    expect(result.mission_id).toBe(ids.mission);
    expect(result.days).toHaveLength(2);
    expect(await scalar(db, `select count(*)::integer as value from public.audit_events where organisation_id='${orgA}' and event_type like 'mission.operating_day.%'`)).toBeGreaterThanOrEqual(5);
    expect(await scalar(db, `select count(*)::integer as value from public.transactional_outbox where organisation_id='${orgA}' and topic like 'operational.mission.day_%'`)).toBeGreaterThanOrEqual(5);
  });

  test('closes the database', async () => { await db.close(); });
} else {
  test('passes repeatable Mission operating-day authority behavior checks in PostgreSQL', () => {
    try {
      execFileSync(process.execPath, [__filename], { cwd: root, env: { ...process.env, MISSION_OPERATING_DAYS_PGLITE_CHILD: '1' }, stdio: 'pipe' });
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
