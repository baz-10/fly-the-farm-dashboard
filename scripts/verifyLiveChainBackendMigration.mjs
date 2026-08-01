import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const migrationNames = [
  '20260801000000_production_beta_foundation.sql',
  '20260801001000_trusted_operational_api_writes.sql',
  '20260801002000_trusted_operational_api_corrections.sql',
  '20260801003000_trusted_operational_parent_guards.sql',
  '20260801004000_trusted_operational_lock_protocol.sql',
  '20260801005000_property_state.sql',
];
const accessMigrationPath = resolve(scriptDirectory, '../supabase/migrations/20260801006000_live_chain_access_prerequisites.sql');
const workflowMigrationPath = resolve(scriptDirectory, '../supabase/migrations/20260801007000_live_chain_workflow_prerequisites.sql');
const reviewFixMigrationPath = resolve(scriptDirectory, '../supabase/migrations/20260801008000_live_chain_review_fixes.sql');
const reviewFollowupMigrationPath = resolve(scriptDirectory, '../supabase/migrations/20260801009000_live_chain_review_followup.sql');
const resolutionAtomicityMigrationPath = resolve(scriptDirectory, '../supabase/migrations/20260801010000_boundary_resolution_atomicity.sql');
const missionArchiveScopeMigrationPath = resolve(scriptDirectory, '../supabase/migrations/20260801011000_mission_archive_location_scope.sql');

async function expectRejected(db, label, sql) {
  try {
    await db.exec(sql);
  } catch {
    return;
  }
  throw new Error(`${label} was accepted`);
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
  for (const migrationName of migrationNames) {
    await db.exec(await readFile(resolve(scriptDirectory, `../supabase/migrations/${migrationName}`), 'utf8'));
  }

  // This member exists before the forward migration and must not be stranded.
  await db.exec(`
    insert into auth.users (id) values
      ('00000000-0000-0000-0000-000000000011'),
      ('00000000-0000-0000-0000-000000000022');
    insert into public.organisations (id, organisation_id, name) values
      ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Organisation one'),
      ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'Organisation two');
    insert into public.internal_users (id, organisation_id, auth_user_id, display_name) values
      ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'Operator one'),
      ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000022', 'Operator two');
    insert into public.roles (id, organisation_id, code, name) values
      ('00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-000000000001', 'operator', 'Operator'),
      ('00000000-0000-0000-0000-000000000222', '00000000-0000-0000-0000-000000000002', 'operator', 'Operator');
    insert into public.memberships (id, organisation_id, internal_user_id, role_id) values
      ('00000000-0000-0000-0000-000000000121', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000111'),
      ('00000000-0000-0000-0000-000000000232', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000222');
    insert into public.operating_locations (id, organisation_id, name) values
      ('00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000000001', 'Operations base'),
      ('00000000-0000-0000-0000-000000001002', '00000000-0000-0000-0000-000000000002', 'Other tenant base');
    insert into public.clients (id, organisation_id, name)
      values ('00000000-0000-0000-0000-000000000311', '00000000-0000-0000-0000-000000000001', 'Legacy client');
    insert into public.properties (id, organisation_id, client_id, name, state)
      values ('00000000-0000-0000-0000-000000000411', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000311', 'Legacy property', 'QLD');
    insert into public.field_boundary_versions (id, organisation_id, property_id, version_number, boundary_geojson) values
      ('00000000-0000-0000-0000-000000000511', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000411', 1, '{"type":"Polygon","coordinates":[[[153,-27],[154,-27],[154,-28],[153,-27]]]}'::jsonb),
      ('00000000-0000-0000-0000-000000000512', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000411', 2, '{"type":"Polygon","coordinates":[[[153,-27],[155,-27],[155,-28],[153,-27]]]}'::jsonb);
    insert into public.fields (id, organisation_id, property_id, field_boundary_version_id, name) values
      ('00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000411', '00000000-0000-0000-0000-000000000511', 'Legacy shared one'),
      ('00000000-0000-0000-0000-000000000612', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000411', '00000000-0000-0000-0000-000000000511', 'Legacy shared two');
  `);

  await db.exec(await readFile(accessMigrationPath, 'utf8'));
  await db.exec(await readFile(workflowMigrationPath, 'utf8'));
  await db.exec(await readFile(reviewFixMigrationPath, 'utf8'));
  await db.exec(await readFile(reviewFollowupMigrationPath, 'utf8'));
  await db.exec(await readFile(resolutionAtomicityMigrationPath, 'utf8'));
  await db.exec(await readFile(missionArchiveScopeMigrationPath, 'utf8'));

  const legacyRepair = await db.query(`
    select
      (select field_boundary_version_id from public.fields where id = '00000000-0000-0000-0000-000000000611') as first_pointer,
      (select field_boundary_version_id from public.fields where id = '00000000-0000-0000-0000-000000000612') as second_pointer,
      (select field_id from public.field_boundary_versions where id = (select field_boundary_version_id from public.fields where id = '00000000-0000-0000-0000-000000000612')) as second_owner,
      (select count(*)::integer from public.operational_migration_issues where issue_code = 'legacy_boundary_unassigned' and source_entity_id = '00000000-0000-0000-0000-000000000512') as unassigned_issues,
      (select count(*)::integer from public.operational_migration_issues where issue_code = 'legacy_shared_boundary_repaired') as shared_issues;
  `);
  const repair = legacyRepair.rows[0];
  if (repair.first_pointer !== '00000000-0000-0000-0000-000000000511' || repair.second_pointer === repair.first_pointer || repair.second_owner !== '00000000-0000-0000-0000-000000000612' || repair.unassigned_issues !== 1 || repair.shared_issues !== 1) {
    throw new Error('080 did not preserve/report unassigned history and deterministically repair shared current boundaries');
  }
  const resolutionIssue = await db.query(`select id from public.operational_migration_issues
    where organisation_id = '00000000-0000-0000-0000-000000000001'
      and issue_code = 'legacy_boundary_unassigned'
      and source_entity_id = '00000000-0000-0000-0000-000000000512';`);
  const resolutionIssueId = resolutionIssue.rows[0]?.id;
  await db.exec('set role service_role;');
  const recordedResolution = await db.query(`select public.ftf_record_boundary_migration_issue_resolution(
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000101',
    '${resolutionIssueId}', '{"resolution":"reviewed_unassigned_history"}'::jsonb
  ) as result;`);
  if (recordedResolution.rows[0]?.result?.record?.issue_id !== resolutionIssueId) {
    throw new Error('controlled boundary migration issue resolution was not appended');
  }
  await db.exec('reset role;');
  const resolutionId = recordedResolution.rows[0].result.record.id;
  const resolutionAtomicity = await db.query(`select
    (select count(*)::integer from public.audit_events
      where organisation_id = '00000000-0000-0000-0000-000000000001'
        and actor_internal_user_id = '00000000-0000-0000-0000-000000000101'
        and event_type = 'boundary_migration_issue_resolutions.create'
        and entity_type = 'boundary_migration_issue_resolutions'
        and entity_id = '${resolutionId}'
        and event_payload->>'issue_id' = '${resolutionIssueId}') as audit_count,
    (select count(*)::integer from public.transactional_outbox
      where organisation_id = '00000000-0000-0000-0000-000000000001'
        and topic = 'operational.boundary_migration_issue_resolutions.create'
        and aggregate_type = 'boundary_migration_issue_resolutions'
        and aggregate_id = '${resolutionId}'
        and payload->>'issue_id' = '${resolutionIssueId}') as outbox_count;`);
  if (resolutionAtomicity.rows[0]?.audit_count !== 1 || resolutionAtomicity.rows[0]?.outbox_count !== 1) {
    throw new Error('boundary issue resolution did not atomically create its audit and outbox records');
  }
  await db.exec('set role service_role;');
  await expectRejected(db, 'service-role direct boundary issue resolution insert', `insert into public.boundary_migration_issue_resolutions (
    organisation_id, issue_id, resolved_by_internal_user_id, resolution_details
  ) values (
    '00000000-0000-0000-0000-000000000001', '${resolutionIssueId}',
    '00000000-0000-0000-0000-000000000101', '{}'::jsonb
  );`);
  await db.exec('reset role;');

  const rollbackIssue = await db.query(`select id from public.operational_migration_issues
    where organisation_id = '00000000-0000-0000-0000-000000000001'
      and issue_code = 'legacy_shared_boundary_repaired' limit 1;`);
  const rollbackIssueId = rollbackIssue.rows[0]?.id;
  await expectRejected(db, 'cross-organisation resolution actor', `select public.ftf_record_boundary_migration_issue_resolution(
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000202',
    '${rollbackIssueId}', '{}'::jsonb
  );`);
  await db.exec(`
    create function public.ftf_test_reject_resolution_outbox() returns trigger
    language plpgsql as $$
    begin
      if new.topic = 'operational.boundary_migration_issue_resolutions.create' then
        raise exception 'forced resolution outbox failure';
      end if;
      return new;
    end;
    $$;
    create trigger ftf_test_reject_resolution_outbox
    before insert on public.transactional_outbox
    for each row execute function public.ftf_test_reject_resolution_outbox();
  `);
  await db.exec('set role service_role;');
  await expectRejected(db, 'resolution outbox failure', `select public.ftf_record_boundary_migration_issue_resolution(
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000101',
    '${rollbackIssueId}', '{"resolution":"must_roll_back"}'::jsonb
  );`);
  await db.exec('reset role;');
  await db.exec(`drop trigger ftf_test_reject_resolution_outbox on public.transactional_outbox;
    drop function public.ftf_test_reject_resolution_outbox();`);
  const resolutionRollback = await db.query(`select
    (select count(*)::integer from public.boundary_migration_issue_resolutions
      where issue_id = '${rollbackIssueId}') as resolution_count,
    (select count(*)::integer from public.audit_events
      where event_type = 'boundary_migration_issue_resolutions.create'
        and event_payload->>'issue_id' = '${rollbackIssueId}') as audit_count,
    (select count(*)::integer from public.transactional_outbox
      where topic = 'operational.boundary_migration_issue_resolutions.create'
        and payload->>'issue_id' = '${rollbackIssueId}') as outbox_count;`);
  if (resolutionRollback.rows[0]?.resolution_count !== 0 || resolutionRollback.rows[0]?.audit_count !== 0 || resolutionRollback.rows[0]?.outbox_count !== 0) {
    throw new Error('failed boundary issue resolution did not roll back resolution, audit, and outbox together');
  }
  await expectRejected(db, 'boundary issue resolution update', `update public.boundary_migration_issue_resolutions
    set resolution_details = '{"resolution":"changed"}'::jsonb where issue_id = '${resolutionIssueId}';`);
  await expectRejected(db, 'boundary issue resolution delete', `delete from public.boundary_migration_issue_resolutions
    where issue_id = '${resolutionIssueId}';`);
  await expectRejected(db, 'legacy issue ledger resolution update', `update public.operational_migration_issues
    set resolved_at = now() where id = '${resolutionIssueId}';`);
  await expectRejected(db, 'cross-field current boundary pointer', `update public.fields set field_boundary_version_id = '00000000-0000-0000-0000-000000000511' where id = '00000000-0000-0000-0000-000000000612';`);

  const legacyOperationalHistory = await db.query(`select public.ftf_read_field_boundary_versions(
    '00000000-0000-0000-0000-000000000001', null,
    '00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000411', 0, 100
  ) as result;`);
  if (legacyOperationalHistory.rows[0]?.result?.some((row) => row.id === '00000000-0000-0000-0000-000000000512')) {
    throw new Error('unassignable legacy boundary leaked into operational field history');
  }
  await expectRejected(db, 'generic field pointer write', `select public.ftf_write_operational_resource(
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101',
    'fields', 'update', '00000000-0000-0000-0000-000000000611', 1,
    '{"property_id":"00000000-0000-0000-0000-000000000411","field_boundary_version_id":"00000000-0000-0000-0000-000000000511","name":"Pointer injection"}'::jsonb
  );`);
  await db.exec(`update public.fields set archived_at = now() where id = '00000000-0000-0000-0000-000000000611';`);
  const archivedParentHistory = await db.query(`select public.ftf_read_field_boundary_versions(
    '00000000-0000-0000-0000-000000000001', null,
    '00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000411', 0, 100
  ) as result;`);
  if (archivedParentHistory.rows[0]?.result?.length !== 0) {
    throw new Error('boundary read returned history for an archived field parent');
  }

  const migratedAccess = await db.query(`
    select
      (select allocated_seats from public.organisation_seat_allocations where organisation_id = '00000000-0000-0000-0000-000000000001') as allocated_seats,
      (select status from public.internal_user_seat_assignments where internal_user_id = '00000000-0000-0000-0000-000000000101') as seat_status,
      (select count(*)::integer from public.membership_operating_location_assignments where membership_id = '00000000-0000-0000-0000-000000000121' and operating_location_id = '00000000-0000-0000-0000-000000001001') as location_count,
      (select count(*)::integer from public.audit_events where organisation_id = '00000000-0000-0000-0000-000000000001' and event_type = 'beta_access.migrated') as audit_count,
      (select count(*)::integer from public.transactional_outbox where organisation_id = '00000000-0000-0000-0000-000000000001' and topic = 'operational.beta_access.migrated') as outbox_count;
  `);
  const migrated = migratedAccess.rows[0];
  if (migrated.allocated_seats !== 1 || migrated.seat_status !== 'active' || migrated.location_count !== 1 || migrated.audit_count !== 1 || migrated.outbox_count !== 1) {
    throw new Error('existing active beta member did not receive traceable seat and location access');
  }

  const locationWrite = await db.query(`select public.ftf_write_operational_resource(
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000101',
    'operating_locations', 'create', null, null,
    '{"name":"Northern base","address":"2 Airstrip Rd","timezone":"Australia/Brisbane"}'::jsonb
  ) as result;`);
  const createdLocationId = locationWrite.rows[0]?.result?.record?.id;
  if (!createdLocationId || locationWrite.rows[0]?.result?.record?.name !== 'Northern base') {
    throw new Error('trusted operating-location create did not return its record');
  }
  const locationAtomicity = await db.query(`
    select
      (select count(*)::integer from public.audit_events where event_type = 'operating_locations.create' and entity_id = '${createdLocationId}') as audit_count,
      (select count(*)::integer from public.transactional_outbox where topic = 'operational.operating_locations.create' and aggregate_id = '${createdLocationId}') as outbox_count;
  `);
  if (locationAtomicity.rows[0].audit_count !== 1 || locationAtomicity.rows[0].outbox_count !== 1) {
    throw new Error('operating-location write did not atomically create audit and outbox rows');
  }

  const crossOrganisationLocation = await db.query(`select public.ftf_write_operational_resource(
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101',
    'operating_locations', 'update', '00000000-0000-0000-0000-000000001002', 1,
    '{"name":"Tenant escape","timezone":"Australia/Brisbane"}'::jsonb
  ) as result;`);
  if (crossOrganisationLocation.rows[0]?.result?.not_found !== true) {
    throw new Error('cross-organisation operating-location update was not hidden');
  }

  // A member added after migration remains denied until the controlled seed.
  await db.exec(`
    insert into auth.users (id) values ('00000000-0000-0000-0000-000000000033');
    insert into public.internal_users (id, organisation_id, auth_user_id, display_name)
      values ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000033', 'Operator three');
    insert into public.memberships (id, organisation_id, internal_user_id, role_id)
      values ('00000000-0000-0000-0000-000000000343', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000111');
  `);
  await expectRejected(db, 'unseeded actor trusted write', `select public.ftf_write_operational_resource(
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000303',
    'clients', 'create', null, null, '{"name":"Denied"}'::jsonb
  );`);
  const controlledSeed = await db.query(`select public.ftf_seed_internal_beta_access(
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101'
  ) as result;`);
  if (controlledSeed.rows[0]?.result?.allocated_seats !== 2 || controlledSeed.rows[0]?.result?.seat_assignments !== 2) {
    throw new Error('controlled beta seed did not allocate explicit active seats');
  }
  await db.exec(`update public.organisation_seat_allocations set allocated_seats = 1 where organisation_id = '00000000-0000-0000-0000-000000000001';`);
  const rankedSeats = await db.query(`select internal_user_id from public.internal_user_seat_assignments
    where organisation_id = '00000000-0000-0000-0000-000000000001' and status = 'active' and archived_at is null
    order by assigned_at, id;`);
  const deniedSeatActor = rankedSeats.rows[1]?.internal_user_id;
  const deniedSeatCheck = await db.query(`select public.ftf_actor_has_active_beta_seat(
    '00000000-0000-0000-0000-000000000001', '${deniedSeatActor}'
  ) as allowed;`);
  if (deniedSeatCheck.rows[0]?.allowed !== false) throw new Error('SQL seat check accepted an assignment beyond the reduced allocation');
  await expectRejected(db, 'oversubscribed actor trusted write', `select public.ftf_write_operational_resource(
    '00000000-0000-0000-0000-000000000001', '${deniedSeatActor}',
    'clients', 'create', null, null, '{"name":"Oversubscribed"}'::jsonb
  );`);
  await db.exec(`update public.organisation_seat_allocations set allocated_seats = 2 where organisation_id = '00000000-0000-0000-0000-000000000001';`);
  const seededActorWrite = await db.query(`select public.ftf_write_operational_resource(
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000303',
    'clients', 'create', null, null, '{"name":"Seeded actor client"}'::jsonb
  ) as result;`);
  if (seededActorWrite.rows[0]?.result?.record?.name !== 'Seeded actor client') {
    throw new Error('controlled beta seed did not enable the new internal member');
  }

  await db.exec(`update public.internal_user_seat_assignments set status = 'revoked', revoked_at = now() where internal_user_id = '00000000-0000-0000-0000-000000000303';`);
  await expectRejected(db, 'revoked-seat actor trusted write', `select public.ftf_write_operational_resource(
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000303',
    'clients', 'create', null, null, '{"name":"Revoked actor"}'::jsonb
  );`);

  await db.exec(`
    insert into public.clients (id, organisation_id, name) values
      ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000001', 'Client');
    insert into public.properties (id, organisation_id, client_id, name, state) values
      ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000401', 'Property', 'QLD');
    insert into public.jobs (id, organisation_id, client_id, property_id, reference) values
      ('00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000501', 'JOB-ACCESS');
    insert into public.missions (id, organisation_id, job_id, operating_location_id, mission_number, status) values
      ('00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000001001', 'M-ACCESS', 'planning');
  `);
  const archiveDependency = await db.query(`select public.ftf_write_operational_resource(
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101',
    'operating_locations', 'archive', '00000000-0000-0000-0000-000000001001', 1, '{}'::jsonb
  ) as result;`);
  if (archiveDependency.rows[0]?.result?.archive_conflict !== true) {
    throw new Error('operating-location archive accepted an active mission dependency');
  }

  await db.exec(`
    insert into public.fields (id, organisation_id, property_id, name) values
      ('00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000501', 'North field'),
      ('00000000-0000-0000-0000-000000000802', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000501', 'South field');
    insert into public.properties (id, organisation_id, client_id, name, state)
      values ('00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000401', 'Other property', 'QLD');
    insert into public.fields (id, organisation_id, property_id, name)
      values ('00000000-0000-0000-0000-000000000803', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000502', 'Other property field');
  `);

  await expectRejected(db, 'invalid boundary geometry', `select public.ftf_create_field_boundary_version(
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000501', 1,
    '{"type":"Point","coordinates":[153,-27]}'::jsonb, null
  );`);
  await expectRejected(db, 'oversized boundary geometry', `select public.ftf_create_field_boundary_version(
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000501', 1,
    jsonb_build_object('type', 'Polygon', 'coordinates', '[]'::jsonb, 'padding', repeat('x', 270000)), null
  );`);

  const firstBoundary = await db.query(`select public.ftf_create_field_boundary_version(
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000501', 1,
    '{"type":"Polygon","coordinates":[[[153,-27],[154,-27],[154,-28],[153,-27]]]}'::jsonb,
    '2026-08-01T00:00:00Z'
  ) as result;`);
  const firstBoundaryResult = firstBoundary.rows[0]?.result;
  if (firstBoundaryResult?.record?.version_number !== 1 || firstBoundaryResult?.field_version !== 2) {
    throw new Error('trusted boundary create did not atomically advance the field version');
  }
  const boundaryId = firstBoundaryResult.record.id;
  const staleBoundary = await db.query(`select public.ftf_create_field_boundary_version(
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000501', 1,
    '{"type":"Polygon","coordinates":[[[153,-27],[155,-27],[155,-28],[153,-27]]]}'::jsonb, null
  ) as result;`);
  if (staleBoundary.rows[0]?.result?.conflict !== true || staleBoundary.rows[0]?.result?.current_version !== 2) {
    throw new Error('stale boundary update did not return current field version');
  }
  const boundaryAtomicity = await db.query(`
    select
      (select count(*)::integer from public.field_boundary_versions where field_id = '00000000-0000-0000-0000-000000000801') as boundary_count,
      (select field_boundary_version_id from public.fields where id = '00000000-0000-0000-0000-000000000801') as current_boundary_id,
      (select count(*)::integer from public.audit_events where event_type = 'field_boundary_versions.create' and entity_id = '${boundaryId}') as audit_count,
      (select count(*)::integer from public.transactional_outbox where topic = 'operational.field_boundary_versions.create' and aggregate_id = '${boundaryId}') as outbox_count;
  `);
  const boundaryState = boundaryAtomicity.rows[0];
  if (boundaryState.boundary_count !== 1 || boundaryState.current_boundary_id !== boundaryId || boundaryState.audit_count !== 1 || boundaryState.outbox_count !== 1) {
    throw new Error('boundary create/conflict did not preserve atomic version, audit, and outbox state');
  }

  const multiBoundary = await db.query(`select public.ftf_create_field_boundary_version(
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000501', 2,
    '{"type":"MultiPolygon","coordinates":[[[[153,-27],[154,-27],[154,-28],[153,-27]]]]}'::jsonb, null
  ) as result;`);
  if (multiBoundary.rows[0]?.result?.record?.version_number !== 2 || multiBoundary.rows[0]?.result?.field_version !== 3) {
    throw new Error('trusted boundary command did not accept a valid MultiPolygon');
  }

  const jobCreate = await db.query(`select public.ftf_write_operational_resource(
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101',
    'jobs', 'create', null, null,
    '{
      "client_id":"00000000-0000-0000-0000-000000000401",
      "property_id":"00000000-0000-0000-0000-000000000501",
      "field_ids":["00000000-0000-0000-0000-000000000801","00000000-0000-0000-0000-000000000802"],
      "reference":"JOB-LIVE","scope":"Two paddocks","status":"draft","notes":"Morning requested",
      "requested_date":"2026-08-08","scheduled_date":"2026-08-10"
    }'::jsonb
  ) as result;`);
  const jobRecord = jobCreate.rows[0]?.result?.record;
  const liveJobId = jobRecord?.id;
  if (!liveJobId || jobRecord.scope !== 'Two paddocks' || jobRecord.field_ids?.length !== 2) {
    throw new Error('trusted job create did not return workflow fields and multiple field IDs');
  }
  const jobCreateState = await db.query(`
    select
      (select count(*)::integer from public.job_fields where job_id = '${liveJobId}' and archived_at is null) as active_fields,
      (select count(*)::integer from public.audit_events where event_type = 'jobs.create' and entity_id = '${liveJobId}') as audit_count,
      (select count(*)::integer from public.transactional_outbox where topic = 'operational.jobs.create' and aggregate_id = '${liveJobId}') as outbox_count;
  `);
  if (jobCreateState.rows[0].active_fields !== 2 || jobCreateState.rows[0].audit_count !== 1 || jobCreateState.rows[0].outbox_count !== 1) {
    throw new Error('job and multi-field assignments were not atomic with audit/outbox');
  }

  const inconsistentJob = await db.query(`select public.ftf_write_operational_resource(
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101',
    'jobs', 'update', '${liveJobId}', 1,
    '{
      "client_id":"00000000-0000-0000-0000-000000000401",
      "property_id":"00000000-0000-0000-0000-000000000501",
      "field_ids":["00000000-0000-0000-0000-000000000801","00000000-0000-0000-0000-000000000803"],
      "reference":"JOB-BROKEN","scope":"Invalid mix","status":"draft","notes":"",
      "requested_date":"2026-08-08","scheduled_date":"2026-08-10"
    }'::jsonb
  ) as result;`);
  if (inconsistentJob.rows[0]?.result?.relationship_conflict !== true) {
    throw new Error('job update accepted fields from different properties');
  }
  const inconsistentRollback = await db.query(`
    select
      (select reference from public.jobs where id = '${liveJobId}') as reference,
      (select count(*)::integer from public.job_fields where job_id = '${liveJobId}' and archived_at is null) as active_fields,
      (select count(*)::integer from public.audit_events where event_type = 'jobs.update' and entity_id = '${liveJobId}') as update_audits;
  `);
  if (inconsistentRollback.rows[0].reference !== 'JOB-LIVE' || inconsistentRollback.rows[0].active_fields !== 2 || inconsistentRollback.rows[0].update_audits !== 0) {
    throw new Error('failed multi-field job update did not roll back cleanly');
  }

  const jobUpdate = await db.query(`select public.ftf_write_operational_resource(
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101',
    'jobs', 'update', '${liveJobId}', 1,
    '{
      "client_id":"00000000-0000-0000-0000-000000000401",
      "property_id":"00000000-0000-0000-0000-000000000501",
      "field_ids":["00000000-0000-0000-0000-000000000801"],
      "reference":"JOB-LIVE","scope":"North only","status":"scheduled","notes":"Confirmed",
      "requested_date":"2026-08-08","scheduled_date":"2026-08-11"
    }'::jsonb
  ) as result;`);
  const updatedJob = jobUpdate.rows[0]?.result?.record;
  if (updatedJob?.row_version !== 2 || updatedJob?.field_ids?.length !== 1 || updatedJob?.scheduled_date !== '2026-08-11') {
    throw new Error('trusted job update did not atomically replace workflow fields and field assignments');
  }
  const staleJob = await db.query(`select public.ftf_write_operational_resource(
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101',
    'jobs', 'update', '${liveJobId}', 1,
    '{"client_id":"00000000-0000-0000-0000-000000000401","property_id":"00000000-0000-0000-0000-000000000501","field_ids":["00000000-0000-0000-0000-000000000802"],"reference":"STALE"}'::jsonb
  ) as result;`);
  if (staleJob.rows[0]?.result?.conflict !== true || staleJob.rows[0]?.result?.current_version !== 2) {
    throw new Error('stale job field replacement did not return a version conflict');
  }
  const staleJobState = await db.query(`select
    (select reference from public.jobs where id = '${liveJobId}') as reference,
    (select field_id from public.job_fields where job_id = '${liveJobId}' and archived_at is null) as field_id;`);
  if (staleJobState.rows[0].reference !== 'JOB-LIVE' || staleJobState.rows[0].field_id !== '00000000-0000-0000-0000-000000000801') {
    throw new Error('stale job update changed the job or active field assignment');
  }

  const propertyMove = await db.query(`select public.ftf_write_operational_resource(
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101',
    'jobs', 'update', '${liveJobId}', 2,
    '{
      "client_id":"00000000-0000-0000-0000-000000000401",
      "property_id":"00000000-0000-0000-0000-000000000502",
      "field_ids":["00000000-0000-0000-0000-000000000803"],
      "reference":"JOB-MOVED","scope":"Other property","status":"draft","notes":""
    }'::jsonb
  ) as result;`);
  if (propertyMove.rows[0]?.result?.relationship_conflict !== true) {
    throw new Error('job update did not explicitly preserve its original client/property relationship');
  }

  await db.exec(`insert into public.operating_locations (id, organisation_id, name)
    values ('00000000-0000-0000-0000-000000001003', '00000000-0000-0000-0000-000000000001', 'Unassigned base');`);
  await db.exec(`insert into public.missions (
    id, organisation_id, job_id, operating_location_id, mission_number, title, status
  ) values (
    '00000000-0000-0000-0000-000000000702',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000601',
    '00000000-0000-0000-0000-000000001003',
    'M-UNASSIGNED', 'Unassigned mission', 'planning'
  );`);
  const assignedMissionArchive = await db.query(`select public.ftf_write_operational_resource(
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101',
    'missions', 'archive', '00000000-0000-0000-0000-000000000701', 1, '{}'::jsonb
  ) as result;`);
  if (assignedMissionArchive.rows[0]?.result?.record?.id !== '00000000-0000-0000-0000-000000000701'
    || !assignedMissionArchive.rows[0]?.result?.record?.archived_at) {
    throw new Error('member could not archive a mission at an assigned operating location');
  }
  const unassignedMissionArchive = await db.query(`select public.ftf_write_operational_resource(
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101',
    'missions', 'archive', '00000000-0000-0000-0000-000000000702', 1, '{}'::jsonb
  ) as result;`);
  if (unassignedMissionArchive.rows[0]?.result?.not_found !== true) {
    throw new Error('member archived a mission at an unassigned operating location by ID and version');
  }
  const deniedMissionArchiveState = await db.query(`select
    (select status from public.missions where id = '00000000-0000-0000-0000-000000000702') as status,
    (select archived_at from public.missions where id = '00000000-0000-0000-0000-000000000702') as archived_at,
    (select row_version from public.missions where id = '00000000-0000-0000-0000-000000000702') as row_version,
    (select count(*)::integer from public.audit_events
      where event_type = 'missions.archive' and entity_id = '00000000-0000-0000-0000-000000000702') as audit_count,
    (select count(*)::integer from public.transactional_outbox
      where topic = 'operational.missions.archive' and aggregate_id = '00000000-0000-0000-0000-000000000702') as outbox_count;`);
  if (deniedMissionArchiveState.rows[0]?.status !== 'planning'
    || deniedMissionArchiveState.rows[0]?.archived_at !== null
    || deniedMissionArchiveState.rows[0]?.row_version !== 1
    || deniedMissionArchiveState.rows[0]?.audit_count !== 0
    || deniedMissionArchiveState.rows[0]?.outbox_count !== 0) {
    throw new Error('denied mission archive changed mission, audit, or outbox state');
  }
  const unassignedMission = await db.query(`select public.ftf_write_operational_resource(
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101',
    'missions', 'create', null, null,
    '{"job_id":"${liveJobId}","operating_location_id":"00000000-0000-0000-0000-000000001003","mission_number":"M-DENIED","title":"Denied","status":"planning"}'::jsonb
  ) as result;`);
  if (unassignedMission.rows[0]?.result?.location_forbidden !== true) {
    throw new Error('mission accepted an active but unassigned operating location');
  }

  const missionCreate = await db.query(`select public.ftf_write_operational_resource(
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101',
    'missions', 'create', null, null,
    '{
      "job_id":"${liveJobId}","operating_location_id":"00000000-0000-0000-0000-000000001001",
      "mission_number":"M-LIVE","title":"North paddock spray","description":"Planning brief",
      "scheduled_start_at":"2026-08-11T06:00:00Z","status":"planning"
    }'::jsonb
  ) as result;`);
  const missionRecord = missionCreate.rows[0]?.result?.record;
  const liveMissionId = missionRecord?.id;
  if (!liveMissionId || missionRecord.title !== 'North paddock spray' || missionRecord.description !== 'Planning brief' || missionRecord.status !== 'planning') {
    throw new Error('trusted mission create did not persist safe Planning metadata');
  }
  await expectRejected(db, 'approved mission create', `select public.ftf_write_operational_resource(
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101',
    'missions', 'create', null, null,
    '{"job_id":"${liveJobId}","operating_location_id":"00000000-0000-0000-0000-000000001001","mission_number":"M-APPROVED","status":"approved"}'::jsonb
  );`);
  await db.exec(`update public.missions set status = 'approved' where id = '${liveMissionId}';`);
  const approvedMissionUpdate = await db.query(`select public.ftf_write_operational_resource(
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101',
    'missions', 'update', '${liveMissionId}', 2,
    '{"job_id":"${liveJobId}","operating_location_id":"00000000-0000-0000-0000-000000001001","mission_number":"M-LIVE","title":"Downgrade","status":"planning"}'::jsonb
  ) as result;`);
  if (approvedMissionUpdate.rows[0]?.result?.lifecycle_conflict !== true) {
    throw new Error('generic mission update changed an authorised mission lifecycle');
  }
  const missionAtomicity = await db.query(`select
    (select count(*)::integer from public.audit_events where event_type = 'missions.create' and entity_id = '${liveMissionId}') as audit_count,
    (select count(*)::integer from public.transactional_outbox where topic = 'operational.missions.create' and aggregate_id = '${liveMissionId}') as outbox_count;`);
  if (missionAtomicity.rows[0].audit_count !== 1 || missionAtomicity.rows[0].outbox_count !== 1) {
    throw new Error('mission Planning write did not atomically create audit and outbox rows');
  }

  await expectRejected(db, 'immutable boundary update', `update public.field_boundary_versions set boundary_geojson = '{}'::jsonb where id = '${boundaryId}';`);

  await db.exec(`update public.organisations set archived_at = now() where id = '00000000-0000-0000-0000-000000000002';`);
  await expectRejected(db, 'archived organisation generic write', `select public.ftf_write_operational_resource(
    '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000202',
    'operating_locations', 'create', null, null, '{"name":"Archived org base"}'::jsonb
  );`);
  await expectRejected(db, 'archived organisation boundary command', `select public.ftf_create_field_boundary_version(
    '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000202',
    '00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000501', 1,
    '{"type":"Polygon","coordinates":[[[153,-27],[154,-27],[154,-28],[153,-27]]]}'::jsonb, null
  );`);
  await expectRejected(db, 'archived organisation seed command', `select public.ftf_seed_internal_beta_access(
    '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000202'
  );`);

  await db.exec(`update public.organisations set archived_at = now() where id = '00000000-0000-0000-0000-000000000001';`);
  const archivedOrganisationHistory = await db.query(`select public.ftf_read_field_boundary_versions(
    '00000000-0000-0000-0000-000000000001', '${boundaryId}', null, null, 0, 1
  ) as result;`);
  if (archivedOrganisationHistory.rows[0]?.result?.length !== 0) {
    throw new Error('boundary read returned data after its organisation was archived');
  }

  await db.exec('set role authenticated;');
  await expectRejected(db, 'authenticated seat assignment DML', `update public.internal_user_seat_assignments set status = 'active';`);
  await expectRejected(db, 'authenticated operating-location DML', `insert into public.operating_locations (organisation_id, name) values ('00000000-0000-0000-0000-000000000001', 'Browser location');`);
  await expectRejected(db, 'authenticated boundary version DML', `insert into public.field_boundary_versions (organisation_id, property_id, field_id, version_number, boundary_geojson) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000801', 99, '{}'::jsonb);`);
  await expectRejected(db, 'authenticated boundary issue resolution command', `select public.ftf_record_boundary_migration_issue_resolution(
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000101',
    '${resolutionIssueId}', '{}'::jsonb
  );`);
  await expectRejected(db, 'authenticated job field DML', `insert into public.job_fields (organisation_id, property_id, job_id, field_id) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000501', '${liveJobId}', '00000000-0000-0000-0000-000000000802');`);
  await db.exec('reset role;');
} finally {
  await db.close();
}
