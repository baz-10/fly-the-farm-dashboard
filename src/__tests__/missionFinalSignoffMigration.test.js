const fs = require('fs');
const path = require('path');

const migrationPath = path.join(__dirname, '../../supabase/migrations/20260905140000_mission_final_signoff_and_job_close.sql');
const migration = () => fs.readFileSync(migrationPath, 'utf8').toLowerCase();
const missionChain = () => fs.readdirSync(path.join(__dirname, '../../supabase/migrations'))
  .filter((name) => /^20260905(100000|110000|120000|130000|135000|140000)_.+\.sql$/.test(name))
  .sort().map((name) => fs.readFileSync(path.join(__dirname, '../../supabase/migrations', name), 'utf8').toLowerCase()).join('\n');

test('extends canonical completion revisions with an immutable multi-day manifest', () => {
  const sql = migration();
  expect(sql).toContain('alter table public.mission_completion_revisions');
  expect(sql).toContain('daily_evidence_manifest');
  expect(sql).toContain('daily_evidence_digest');
  expect(sql).not.toContain('create table public.mission_final_signoffs');
  expect(sql).toContain('ftf_final_signoff_mission');
});

test('locks the mission, effective package, days and job and fails closed on every evidence boundary', () => {
  const sql = migration();
  for (const token of [
    'for update', 'mission_day_incomplete', 'mission_jsa_review_required',
    'mission_aircraft_day_required', 'mission_evidence_unreconciled',
    'mission_day_chemical_required', 'mission_day_weather_required',
    'mission_reauthorisation_required', 'transactional_outbox', 'audit_events',
  ]) expect(sql).toContain(token);
});

test('rejects an unreconciled material variance in the latest daily chemical revision', () => {
  const sql = migration();
  expect(sql).toContain('mission_day_chemical_reconciliation_required');
  expect(sql).toMatch(/select c\.material_variance[\s\S]+order by c\.revision_number desc limit 1/);
});

test('uses one terminal guard for every ordinary Mission mutation boundary', () => {
  const sql = migration();
  expect(sql).toContain('ftf_assert_mission_not_final');
  expect(sql).toContain('mission_final_signoff_immutable');
  expect(sql).toContain('mission_completion_append_terminal_guard');
  expect(sql).toContain('ftf_lock_mission_package_aggregate_allow_final');
  expect(sql).toMatch(/create or replace function public\.ftf_lock_mission_package_aggregate[\s\S]+ftf_assert_mission_not_final/);
  expect(sql).toMatch(/create (or replace )?function public\.ftf_save_mission_operational_events[\s\S]+ftf_lock_mission_package_aggregate/);
  expect(sql).toMatch(/create function public\.ftf_final_signoff_mission[\s\S]+ftf_lock_mission_package_aggregate_allow_final/);
  expect(sql).toMatch(/tg_op in \('update','delete'\)[\s\S]+to_jsonb\(old\)/);
  expect(sql).toMatch(/tg_op in \('insert','update'\)[\s\S]+to_jsonb\(new\)/);
  expect(sql).toMatch(/select distinct scope\.organisation_id,scope\.mission_id[\s\S]+order by scope\.organisation_id,scope\.mission_id/);
  const chain = missionChain();
  for (const writer of [
    'ftf_generate_mission_pack', 'ftf_save_mission_package_scope', 'ftf_submit_mission_package',
    'ftf_decide_mission_package', 'ftf_authorise_mission', 'ftf_save_mission_actual_resources',
    'ftf_save_mission_actual_chemicals', 'ftf_save_mission_operational_events',
    'ftf_submit_mission_operational_evidence', 'ftf_complete_mission', 'ftf_save_mission_map',
    'ftf_create_mission_map_source_file', 'ftf_save_mission_personnel', 'ftf_save_mission_chemical_plan',
    'ftf_save_mission_jsa', 'ftf_approve_mission_jsa', 'ftf_create_mission_weather_observation',
    'ftf_select_mission_weather_observation', 'ftf_create_mission_weather_forecast',
    'ftf_select_mission_weather_forecast', 'ftf_create_mission_operating_day',
    'ftf_review_mission_day_jsa', 'ftf_start_mission_operating_day',
    'ftf_save_mission_day_field_activity', 'ftf_complete_mission_operating_day',
    'ftf_save_mission_aircraft_day_actuals', 'ftf_reconcile_mission_aircraft_day_actuals',
    'ftf_complete_and_sign_off_mission_operating_day', 'ftf_create_mission_operational_import',
    'ftf_confirm_mission_day_chemical_actuals', 'ftf_freeze_mission_day_weather_report',
    'ftf_create_mission_amendment',
  ]) {
    expect(chain).toMatch(new RegExp(`function public\\.${writer}\\([\\s\\S]{0,2500}?perform public\\.ftf_lock_mission_package_aggregate`));
  }
});

test('projects signed authority once and keeps operational days distinct from aircraft hours', () => {
  const sql = migration();
  expect(sql).toContain('mission_final_projection_sources');
  expect(sql).toContain('unique (organisation_id, completion_revision_id, projection_type)');
  expect(sql).toMatch(/count\(distinct day\.work_date\) filter \(\s*where/);
  expect(sql).toMatch(/actual_finished_at\s*-\s*day\.actual_started_at\)\)\s*\/\s*3600\s*>\s*0/);
  expect(sql).toContain('sum(actual.total_flight_hours)');
  expect(sql).toContain('create or replace function public.ftf_financial_actual_operational_proposal');
  expect(sql).toContain("p_expected_revision in (v_current,v_current-1)");
});

test('job close requires every non-cancelled mission to use canonical final authority', () => {
  const sql = migration();
  expect(sql).toContain('ftf_close_job');
  expect(sql).toContain('job_missions_not_signed_off');
  expect(sql).toContain('job_closed');
  expect(sql).toMatch(/mission_completion_revisions[\s\S]+not exists/);
  expect(sql).toMatch(/order by c\.version_number desc[\s\S]+limit 1/);
  expect(sql).toContain('job_mission_authority_unresolved');
  expect(sql).toContain("package_state in ('preparing','awaiting_crp_approval')");
  expect(sql).toContain('mission_package_amendments');
});

test('grants checked execution only and creates no browser table writes', () => {
  const sql = migration();
  expect(sql).toMatch(/grant execute on function[\s\S]+public\.ftf_final_signoff_mission/);
  expect(sql).toMatch(/grant execute on function[\s\S]+public\.ftf_close_job/);
  expect(sql).toContain('to service_role');
  expect(sql).not.toMatch(/grant\s+(insert|update|delete).*mission_completion_revisions.*authenticated/i);
  expect(sql).toContain('ftf_financial_actual_operational_proposal_single_closeout(uuid,uuid,uuid) from public,anon,authenticated,service_role');
  expect(sql).toContain('grant execute on function public.ftf_financial_actual_operational_proposal(uuid,uuid,uuid) to service_role');
});
