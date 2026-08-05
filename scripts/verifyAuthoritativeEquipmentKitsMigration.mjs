import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const migrationDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../supabase/migrations');
const rejected = async (db, sql) => { try { await db.exec(sql); } catch { return true; } return false; };
const ids = {
  org: '10000000-0000-0000-0000-000000000001', otherOrg: '20000000-0000-0000-0000-000000000002',
  actor: '10000000-0000-0000-0000-000000000101', otherActor: '20000000-0000-0000-0000-000000000202',
  location: '10000000-0000-0000-0000-000000001001', forbiddenLocation: '10000000-0000-0000-0000-000000001002',
  otherLocation: '20000000-0000-0000-0000-000000002001'
};

const db = new PGlite();
try {
  await db.exec(`create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid; $$;
    create role anon; create role authenticated; create role service_role;`);
  for (const name of (await readdir(migrationDirectory)).filter(n => n.endsWith('.sql') && !['20260804162000_production_beta_platform_identity_reconciliation.sql', '20260805131000_personnel_compliance_evidence_storage.sql', '20260805144000_checklist_evidence_storage.sql'].includes(n)).sort())
    await db.exec(await readFile(resolve(migrationDirectory, name), 'utf8'));

  await db.exec(`
    insert into auth.users(id) values ('10000000-0000-0000-0000-000000000011'),('20000000-0000-0000-0000-000000000022');
    insert into public.organisations(id,organisation_id,name) values ('${ids.org}','${ids.org}','Fly The Farm'),('${ids.otherOrg}','${ids.otherOrg}','Other');
    insert into public.internal_users(id,organisation_id,auth_user_id,display_name) values
      ('${ids.actor}','${ids.org}','10000000-0000-0000-0000-000000000011','Operator'),
      ('${ids.otherActor}','${ids.otherOrg}','20000000-0000-0000-0000-000000000022','Other operator');
    insert into public.roles(id,organisation_id,code,name) values
      ('10000000-0000-0000-0000-000000000111','${ids.org}','admin','Admin'),
      ('20000000-0000-0000-0000-000000000222','${ids.otherOrg}','admin','Admin');
    insert into public.memberships(id,organisation_id,internal_user_id,role_id) values
      ('10000000-0000-0000-0000-000000000121','${ids.org}','${ids.actor}','10000000-0000-0000-0000-000000000111'),
      ('20000000-0000-0000-0000-000000000232','${ids.otherOrg}','${ids.otherActor}','20000000-0000-0000-0000-000000000222');
    insert into public.operating_locations(id,organisation_id,name) values
      ('${ids.location}','${ids.org}','FTF base'),('${ids.forbiddenLocation}','${ids.org}','Unassigned base'),
      ('${ids.otherLocation}','${ids.otherOrg}','Other base');
    select public.ftf_seed_internal_beta_access('${ids.org}','${ids.actor}');
    select public.ftf_seed_internal_beta_access('${ids.otherOrg}','${ids.otherActor}');
    update public.membership_operating_location_assignments set is_active=false,archived_at=now(),archived_by_internal_user_id='${ids.actor}'
      where organisation_id='${ids.org}' and operating_location_id='${ids.forbiddenLocation}';
  `);
  const permission = await db.query(`select count(*)::int count from public.role_permissions rp join public.permissions p
    on p.organisation_id=rp.organisation_id and p.id=rp.permission_id where rp.organisation_id='${ids.org}' and p.code like 'equipment_kits.%'`);
  if (permission.rows[0]?.count !== 5) throw new Error('Equipment Kit admin permissions were not provisioned');

  const aircraftPayload = JSON.stringify({ operating_location_id: ids.location, registration: 'VH-KIT1', manufacturer: 'DJI', model: 'Agras T100',
    serial_number: 'KIT-AIR-1', activation_date: '2026-08-02', status: 'operational', serviceability_state: 'serviceable', mission_ready: true,
    mtow: 149, max_altitude: 120, max_wind_speed: 28, total_flight_hours: 0, hours_since_last_service: 0,
    last_inspection: '2026-07-01', next_inspection_due: '2026-10-01', last_major_service: '2026-06-01', next_major_service_due: '2026-12-01',
    insurance_policy_number: 'P1', insurance_provider: 'Cover', insurance_expiry_date: '2027-08-01', insurance_coverage_amount: 1000000,
    hull_value: 80000, min_operating_temp: -10, max_operating_temp: 45, max_payload_weight: 75, battery_cycles: 1,
    max_flight_time: 18, service_range: 8, minimum_crew_size: 1, documentation: { manuals: [], certificates: [], logbooks: [], complianceChecks: {} } });
  const aircraft = await db.query(`select public.ftf_write_operational_resource('${ids.org}','${ids.actor}','aircraft','create',null,null,$1::jsonb) result`, [aircraftPayload]);
  const aircraftId = aircraft.rows[0].result.record.id;
  const otherAircraftPayload = JSON.stringify({ ...JSON.parse(aircraftPayload), operating_location_id: ids.otherLocation, registration: 'VH-OTH1', serial_number: 'OTHER-1' });
  const otherAircraft = await db.query(`select public.ftf_write_operational_resource('${ids.otherOrg}','${ids.otherActor}','aircraft','create',null,null,$1::jsonb) result`, [otherAircraftPayload]);
  const otherAircraftId = otherAircraft.rows[0].result.record.id;

  const payload = JSON.stringify({ operating_location_id: ids.location, name: 'T100 Broadcast Kit', kit_type: 'spray', description: 'Operational spray kit',
    status: 'available', specifications: { capacity: 100 }, components: [{ id: 'pump-1', name: 'Pump' }], operational_data: { setupTime: 15 },
    financial_data: { purchasePrice: 25000 }, compatible_aircraft_ids: [aircraftId], notes: 'Mission ready' });
  const created = await db.query(`select public.ftf_write_operational_resource('${ids.org}','${ids.actor}','equipment-kits','create',null,null,$1::jsonb) result`, [payload]);
  const kit = created.rows[0]?.result?.record;
  if (!kit?.id || kit.row_version !== 1 || kit.status !== 'available') throw new Error('authoritative Equipment Kit create failed');
  const compatible = await db.query(`select count(*)::int count from public.equipment_kit_aircraft_compatibility where equipment_kit_id='${kit.id}' and aircraft_id='${aircraftId}'`);
  if (compatible.rows[0].count !== 1) throw new Error('aircraft compatibility was not relationally persisted');

  const stale = await db.query(`select public.ftf_write_operational_resource('${ids.org}','${ids.actor}','equipment-kits','update','${kit.id}',99,$1::jsonb) result`, [payload]);
  if (!stale.rows[0].result.conflict) throw new Error('stale Equipment Kit update was accepted');
  const crossTenant = await db.query(`select public.ftf_write_operational_resource('${ids.otherOrg}','${ids.otherActor}','equipment-kits','update','${kit.id}',1,$1::jsonb) result`, [payload]);
  if (!crossTenant.rows[0].result.not_found) throw new Error('cross-tenant Equipment Kit identifier was exposed');
  const forbiddenPayload = JSON.stringify({ ...JSON.parse(payload), operating_location_id: ids.forbiddenLocation, name: 'Forbidden kit', compatible_aircraft_ids: [] });
  const forbidden = await db.query(`select public.ftf_write_operational_resource('${ids.org}','${ids.actor}','equipment-kits','create',null,null,$1::jsonb) result`, [forbiddenPayload]);
  if (!forbidden.rows[0].result.location_forbidden) throw new Error('unassigned-location Equipment Kit was accepted');
  const badRelationshipPayload = JSON.stringify({ ...JSON.parse(payload), name: 'Cross tenant kit', compatible_aircraft_ids: [otherAircraftId] });
  if (!await rejected(db, `select public.ftf_write_operational_resource('${ids.org}','${ids.actor}','equipment-kits','create',null,null,'${badRelationshipPayload}'::jsonb)`))
    throw new Error('cross-tenant aircraft compatibility was accepted');

  const assignment = await db.query(`select public.ftf_write_operational_resource('${ids.org}','${ids.actor}','equipment-kits','assign','${kit.id}',null,$1::jsonb) result`, [JSON.stringify({ aircraft_id: aircraftId, configuration_name: 'Operational T100', configuration_data: { pricingModel: { type: 'included' } } })]);
  if (!assignment.rows[0].result.record?.id) throw new Error('compatible mission-ready assignment failed');
  const assignmentId = assignment.rows[0].result.record.id;
  const archiveAssigned = await db.query(`select public.ftf_write_operational_resource('${ids.org}','${ids.actor}','equipment-kits','archive','${kit.id}',1,'{}'::jsonb) result`);
  if (!archiveAssigned.rows[0].result.assignment_conflict) throw new Error('assigned Equipment Kit archive was accepted');
  const unassignStale = await db.query(`select public.ftf_write_operational_resource('${ids.org}','${ids.actor}','equipment-kits','unassign','${assignmentId}',99,'{}'::jsonb) result`);
  if (!unassignStale.rows[0].result.conflict) throw new Error('stale assignment update was accepted');
  await db.query(`select public.ftf_write_operational_resource('${ids.org}','${ids.actor}','equipment-kits','unassign','${assignmentId}',1,'{}'::jsonb)`);
  const archived = await db.query(`select public.ftf_write_operational_resource('${ids.org}','${ids.actor}','equipment-kits','archive','${kit.id}',1,'{}'::jsonb) result`);
  if (!archived.rows[0].result.record.archived_at || archived.rows[0].result.record.row_version !== 2) throw new Error('controlled Equipment Kit archive failed');

  const counts = await db.query(`select
    (select count(*)::int from public.audit_events where entity_id='${kit.id}' and entity_type='equipment_kit') audits,
    (select count(*)::int from public.transactional_outbox where aggregate_id='${kit.id}' and aggregate_type='equipment_kit') outbox`);
  if (counts.rows[0].audits !== 4 || counts.rows[0].outbox !== 4) throw new Error('Equipment Kit audit/outbox events were not atomic');
  await db.exec('set role authenticated');
  if (!await rejected(db, `insert into public.equipment_kits(organisation_id,operating_location_id,name,kit_type,status,created_by_internal_user_id,updated_by_internal_user_id)
    values('${ids.org}','${ids.location}','Direct','spray','available','${ids.actor}','${ids.actor}')`)) throw new Error('browser Equipment Kit write was accepted');
  await db.exec('reset role');
} finally { await db.close(); }
