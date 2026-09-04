const fs = require('fs');
const path = require('path');

const migrationPath = path.resolve(
  __dirname,
  '../../supabase/migrations/20260905100000_mission_scope_revision_and_crp_gate.sql'
);

function migration() {
  return fs.readFileSync(migrationPath, 'utf8').replace(/\s+/g, ' ').toLowerCase();
}

test('extends the canonical immutable pack and authorisation authorities without duplicate streams', () => {
  const sql = migration();
  expect(sql).toContain('alter table public.mission_pack_revisions');
  expect(sql).toContain('alter table public.mission_authorisation_revisions');
  expect(sql).toContain('create table public.mission_pack_fields');
  expect(sql).not.toMatch(/create table (?:public\.)?mission_package_revisions/);
  expect(sql).not.toMatch(/create table (?:public\.)?mission_crp_decisions/);
  expect(sql).toContain('mission_pack_revisions_immutable');
  expect(sql).toContain('mission_authorisation_revisions_immutable');
  expect(sql).toContain('mission_pack_fields_immutable');
  expect(sql).toContain('reject_append_only_mutation');
});

test('keeps legacy reads compatible without presenting rejected or pre-authorisation rows as authority', () => {
  const sql = migration();
  expect(sql).toContain('create or replace function public.ftf_read_mission_authorisation');
  expect(sql).toContain("a.decision = 'authorised'");
  expect(sql).toContain('create or replace function public.ftf_read_mission_pack');
  expect(sql).toContain("authorisation.decision = 'authorised'");
  expect(sql).toContain('current_authorised_pack_revision_id');
  expect(sql).toContain('ftf_resolve_effective_mission_authorisation');
  expect(sql).toContain('ftf_project_mission_authorisation_evidence');
  expect(sql).toContain('create or replace function public.ftf_generate_mission_pack');
  for (const consumer of [
    'ftf_read_mission_operational_closeout',
    'ftf_save_mission_actual_resources',
    'ftf_save_mission_actual_chemicals',
    'ftf_submit_mission_operational_evidence',
    'ftf_complete_mission',
    'ftf_request_report_artefact',
  ]) expect(sql).toContain(`create or replace function public.${consumer}`);
});

test('binds every package to one Mission Job subset and exact JSA/evidence identities', () => {
  const sql = migration();
  for (const token of [
    'ftf_save_mission_package_scope',
    'mission_pack_fields',
    'job_fields',
    'mission_jsa_revisions',
    'mission_personnel_revisions',
    'mission_chemical_plan_revisions',
    'mission_map_revisions',
    'mission_weather_selections',
    'ftf_evaluate_mission_readiness',
    'digest(',
    "'sha256'",
    "'jobfieldrowversion'",
    "'fieldrowversion'",
    "'propertyrowversion'",
    "'targetareahectares'",
  ]) expect(sql).toContain(token);
  expect(sql).toContain('mission_scope_field_not_in_job');
  expect(sql).toContain('mission_scope_field_duplicate');
  expect(sql).toContain('mission_scope_empty');
  expect(sql).toContain('mission_package_evidence_stale');
});

test('detects assignment asset revision drift and null digest bypasses', () => {
  const sql = migration();
  expect(sql).toContain("'aircraftrowversion', aircraft.row_version");
  expect(sql).toContain("'equipmentkitrowversion', equipment_kit.row_version");
  expect(sql.match(/p_evidence_digest is null/g)).toHaveLength(2);
  expect(sql.match(/v_manifest is null/g)).toHaveLength(2);
});

test('derives CRP eligibility from the actor and never accepts browser CRP identity', () => {
  const sql = migration();
  expect(sql).toContain("public.ftf_actor_has_permission(p_organisation_id, p_actor_internal_user_id, 'mission.authorisation.authorise')");
  expect(sql).toContain('personnel.internal_user_id = p_actor_internal_user_id');
  expect(sql).toContain('personnel_operating_locations');
  expect(sql).toContain('personnel.is_active');
  expect(sql).not.toMatch(/p_(crp|personnel)_id/);
  expect(sql).toContain('mission_crp_ineligible');
});

test('checks organisation, Base and optimistic concurrency under one aggregate lock', () => {
  const sql = migration();
  for (const token of [
    'pg_advisory_xact_lock',
    'organisation_id = p_organisation_id',
    'operating_location_id',
    'ftf_operational_location_allowed',
    'for update',
    'mission_package_version_conflict',
    'mission_package_decision_conflict',
  ]) expect(sql).toContain(token);
  expect(sql.match(/pg_advisory_xact_lock\(hashtext\(p_organisation_id::text\)::bigint\)/g)).toHaveLength(1);
  expect(sql).toContain('create function public.ftf_lock_mission_package_aggregate');
  expect(sql.match(/perform public\.ftf_lock_mission_package_aggregate\(p_organisation_id, p_mission_id\)/g).length).toBeGreaterThanOrEqual(9);
  expect(sql).toContain('create trigger mission_package_aggregate_lock');
});

test('records bounded audit/outbox evidence for each package authority transition', () => {
  const sql = migration();
  for (const token of [
    "'mission.package_scope_saved'",
    "'mission.package_submitted'",
    "'mission.package_authorised'",
    "'mission.package_rejected'",
    "'operational.mission.package_scope_saved'",
    "'operational.mission.package_submitted'",
    "'preflight.mission.package_authorised'",
    "'preflight.mission.package_rejected'",
    'audit_events',
    'transactional_outbox',
  ]) expect(sql).toContain(token);
});

test('exposes only checked service-role functions and tenant-scoped history reads', () => {
  const sql = migration();
  for (const fn of [
    'ftf_save_mission_package_scope',
    'ftf_submit_mission_package',
    'ftf_decide_mission_package',
    'ftf_read_mission_package_history',
  ]) {
    expect(sql).toContain(`grant execute on function public.${fn}`);
  }
  expect(sql).toContain('current_user_has_organisation_access(organisation_id)');
  expect(sql.match(/limit 100/g)).toHaveLength(2);
  expect(sql).toContain('revoke all on table public.mission_pack_fields from public, anon, authenticated');
  expect(sql).toContain('revoke insert, update, delete on table public.mission_pack_revisions from service_role');
  expect(sql).toContain('revoke insert, update, delete on table public.mission_authorisation_revisions from service_role');
  expect(sql).not.toMatch(/grant\s+(insert|update|delete).*mission_(pack_revisions|authorisation_revisions|pack_fields).*authenticated/);
});
