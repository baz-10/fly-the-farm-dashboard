const fs = require('fs');
const path = require('path');

const migrationPath = path.join(__dirname, '../../supabase/migrations/20260905140000_mission_final_signoff_and_job_close.sql');
const migration = () => fs.readFileSync(migrationPath, 'utf8').toLowerCase();

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
