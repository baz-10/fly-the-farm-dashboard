const fs = require('fs');
const path = require('path');

const migrationPath = path.join(__dirname, '../../supabase/migrations/20260803130000_authoritative_mission_outcomes.sql');
const migration = () => fs.readFileSync(migrationPath, 'utf8');

test('models dedicated immutable Mission Outcome evidence and separate follow-up actions', () => {
  const sql = migration();
  for (const table of [
    'mission_outcome_observation_types',
    'mission_outcome_methods',
    'mission_outcome_confidence_levels',
    'mission_outcome_observations',
    'mission_outcome_pending_files',
    'mission_outcome_observation_files',
    'mission_outcome_follow_up_actions',
  ]) expect(sql).toContain(`create table public.${table}`);
  for (const token of ['completion_revision_id', 'personnel_snapshot', 'days_since_application', 'supersedes_observation_id', 'operational_knowledge_eligible', 'reject_append_only_mutation']) expect(sql).toContain(token);
  expect(sql).not.toContain('update public.mission_outcome_observations');
  expect(sql).not.toContain('mission_operational_events');
});

test('uses repository-controlled expandable catalogues and confidence semantics', () => {
  const sql = migration();
  for (const token of ['INITIAL', 'FOLLOW_UP', 'FINAL', 'REGROWTH', 'CUSTOM', 'GROUND_INSPECTION', 'AERIAL_INSPECTION', 'REMOTE_IMAGERY', 'CUSTOMER_REPORT', 'HIGH', 'MEDIUM', 'LOW', 'direct, clear and sufficient evidence', 'credible evidence with identifiable uncertainty', 'limited or indirect evidence']) expect(sql).toContain(token);
});

test('provides trusted commands with scope, permissions, audit and outbox', () => {
  const sql = migration();
  for (const fn of ['ftf_read_mission_outcomes', 'ftf_stage_mission_outcome_photo', 'ftf_create_mission_outcome_observation', 'ftf_write_mission_outcome_follow_up']) expect(sql).toContain(fn);
  for (const permission of ['mission.outcomes.read', 'mission.outcomes.create', 'mission.outcomes.photo.upload', 'mission.outcomes.follow_up.manage']) expect(sql).toContain(`'${permission}'`);
  for (const token of ['enable row level security', 'force row level security', 'current_user_has_organisation_access', 'audit_events', 'transactional_outbox', "'post_mission.mission.outcome_observed'", "'post_mission.mission.outcome_follow_up_changed'"]) expect(sql).toContain(token);
});

test('keeps outcomes optional and completion immutable', () => {
  const sql = migration();
  expect(sql).toContain('mission_completion_revisions');
  expect(sql).not.toContain('update public.mission_completion_revisions');
  expect(sql).not.toContain('mission readiness');
});
