import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const migrationDirectory = resolve(scriptDirectory, '../supabase/migrations');

async function rejected(db, sql) {
  try { await db.exec(sql); } catch { return true; }
  return false;
}

const db = new PGlite();
try {
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid; $$;
    create role anon;
    create role authenticated;
    create role service_role;
  `);
  const skippedMigrations = new Set([
    '20260804162000_production_beta_platform_identity_reconciliation.sql',
    '20260805131000_personnel_compliance_evidence_storage.sql',
    '20260805144000_checklist_evidence_storage.sql',
  ]);
  const migrations = (await readdir(migrationDirectory)).filter((name) => name.endsWith('.sql') && !skippedMigrations.has(name)).sort();
  for (const migration of migrations) await db.exec(await readFile(resolve(migrationDirectory, migration), 'utf8'));

  await db.exec(`
    insert into auth.users (id) values
      ('10000000-0000-0000-0000-000000000011'),
      ('20000000-0000-0000-0000-000000000022');
    insert into public.organisations (id, organisation_id, name) values
      ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Fly The Farm'),
      ('20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Other operator');
    insert into public.internal_users (id, organisation_id, auth_user_id, display_name) values
      ('10000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000011', 'FTF operator'),
      ('20000000-0000-0000-0000-000000000202', '20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000022', 'Other operator');
    insert into public.roles (id, organisation_id, code, name) values
      ('10000000-0000-0000-0000-000000000111', '10000000-0000-0000-0000-000000000001', 'admin', 'Administrator'),
      ('20000000-0000-0000-0000-000000000222', '20000000-0000-0000-0000-000000000002', 'admin', 'Administrator');
    insert into public.memberships (id, organisation_id, internal_user_id, role_id) values
      ('10000000-0000-0000-0000-000000000121', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000111'),
      ('20000000-0000-0000-0000-000000000232', '20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000202', '20000000-0000-0000-0000-000000000222');
    insert into public.operating_locations (id, organisation_id, name) values
      ('10000000-0000-0000-0000-000000001001', '10000000-0000-0000-0000-000000000001', 'FTF base'),
      ('10000000-0000-0000-0000-000000001002', '10000000-0000-0000-0000-000000000001', 'Unassigned base'),
      ('20000000-0000-0000-0000-000000002001', '20000000-0000-0000-0000-000000000002', 'Other base');
  `);
  const permissions = await db.query(`select count(*)::int as count from public.role_permissions rp
    join public.permissions p on p.organisation_id=rp.organisation_id and p.id=rp.permission_id
    where rp.organisation_id='10000000-0000-0000-0000-000000000001' and p.code like 'aircraft.%';`);
  if (permissions.rows[0]?.count !== 5) throw new Error('new Production Beta admin role did not receive Aircraft permissions');
  await db.exec(`
    select public.ftf_seed_internal_beta_access('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000101');
    select public.ftf_seed_internal_beta_access('20000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000202');
    update public.membership_operating_location_assignments
      set is_active=false, archived_at=now(), archived_by_internal_user_id='10000000-0000-0000-0000-000000000101'
      where organisation_id='10000000-0000-0000-0000-000000000001'
        and operating_location_id='10000000-0000-0000-0000-000000001002';
  `);

  const payload = `{
    "operating_location_id":"10000000-0000-0000-0000-000000001001",
    "registration":"VH-FTF1","manufacturer":"DJI","model":"Agras T100","serial_number":"T100-001",
    "activation_date":"2026-08-02","status":"operational","serviceability_state":"serviceable","mission_ready":true,
    "mtow":149.9,"max_altitude":120,"max_wind_speed":28,"total_flight_hours":12.5,"hours_since_last_service":2.5,
    "last_inspection":"2026-07-01","next_inspection_due":"2026-10-01","last_major_service":"2026-06-01","next_major_service_due":"2026-12-01",
    "insurance_policy_number":"FTF-001","insurance_provider":"Aviation Cover","insurance_expiry_date":"2027-08-01",
    "insurance_coverage_amount":5000000,"hull_value":80000,"min_operating_temp":-10,"max_operating_temp":45,
    "max_payload_weight":75,"battery_cycles":20,"max_flight_time":18,"service_range":8,"minimum_crew_size":2,
    "documentation":{"manuals":["file-1"],"certificates":["file-2"],"logbooks":[],"complianceChecks":{"casaCompliant":true,"lastCasaInspection":"2026-07-01T00:00:00.000Z","nextCasaInspectionDue":"2027-07-01T00:00:00.000Z"}},
    "notes":"Primary spray aircraft","source_system":"ftf_aircraft_data","source_record_id":"aircraft_legacy_1"
  }`;
  const created = await db.query(`select public.ftf_write_operational_resource(
    '10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000101',
    'aircraft','create',null,null,'${payload}'::jsonb) as result;`);
  const record = created.rows[0]?.result?.record;
  if (!record?.id || record.registration !== 'VH-FTF1' || record.row_version !== 1 || record.mission_ready !== true) {
    throw new Error('trusted Aircraft create did not return a mission-ready authoritative record');
  }
  const aircraftId = record.id;

  const stale = await db.query(`select public.ftf_write_operational_resource(
    '10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000101',
    'aircraft','update','${aircraftId}',99,'${payload}'::jsonb) as result;`);
  if (stale.rows[0]?.result?.conflict !== true || stale.rows[0]?.result?.current_version !== 1) throw new Error('Aircraft stale update was accepted');

  const crossTenant = await db.query(`select public.ftf_write_operational_resource(
    '20000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000202',
    'aircraft','update','${aircraftId}',1,'${payload}'::jsonb) as result;`);
  if (crossTenant.rows[0]?.result?.not_found !== true) throw new Error('cross-tenant Aircraft identifier manipulation was not hidden');

  const unassignedPayload = payload.replace('10000000-0000-0000-0000-000000001001', '10000000-0000-0000-0000-000000001002').replace('VH-FTF1', 'VH-FTF2').replace('T100-001', 'T100-002');
  const unassigned = await db.query(`select public.ftf_write_operational_resource(
    '10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000101',
    'aircraft','create',null,null,'${unassignedPayload}'::jsonb) as result;`);
  if (unassigned.rows[0]?.result?.location_forbidden !== true) throw new Error('unassigned-location Aircraft was accepted');

  if (!await rejected(db, `insert into public.aircraft (organisation_id, operating_location_id, registration, manufacturer, model, serial_number, mtow, max_altitude, max_wind_speed, max_payload_weight, max_flight_time, service_range, minimum_crew_size)
    values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000002001','VH-BAD','DJI','T100','BAD',100,120,20,50,20,5,1);`)) {
    throw new Error('cross-tenant Aircraft location relationship was accepted');
  }

  const counts = await db.query(`select
    (select count(*)::int from public.audit_events where event_type='aircraft.create' and entity_id='${aircraftId}') audit_count,
    (select count(*)::int from public.transactional_outbox where topic='operational.aircraft.create' and aggregate_id='${aircraftId}') outbox_count;`);
  if (counts.rows[0].audit_count !== 1 || counts.rows[0].outbox_count !== 1) throw new Error('Aircraft audit/outbox were not atomic');

  const archived = await db.query(`select public.ftf_write_operational_resource(
    '10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000101',
    'aircraft','archive','${aircraftId}',1,'{}'::jsonb) as result;`);
  if (!archived.rows[0]?.result?.record?.archived_at || archived.rows[0]?.result?.record?.row_version !== 2) throw new Error('controlled Aircraft archive failed');

  await db.exec('set role authenticated;');
  if (!await rejected(db, `insert into public.aircraft (organisation_id, operating_location_id, registration, manufacturer, model, serial_number, mtow, max_altitude, max_wind_speed, max_payload_weight, max_flight_time, service_range, minimum_crew_size)
    values ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000001001','VH-DIRECT','DJI','T100','DIRECT',100,120,20,50,20,5,1);`)) {
    throw new Error('browser database write was accepted');
  }
  await db.exec('reset role;');
} finally {
  await db.close();
}
