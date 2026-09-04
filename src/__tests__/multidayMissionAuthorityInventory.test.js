const fs = require('fs');
const path = require('path');

test('inventory binds every new capability to existing authority', () => {
  const text = fs.readFileSync(path.join(__dirname, '../../docs/operations/multifield-multiday-authority-inventory.md'), 'utf8');
  for (const token of [
    'public.job_fields',
    'public.mission_jsa_revisions',
    'public.mission_authorisation_revisions',
    'public.mission_operational_revisions',
    'public.mission_outcome_observations',
    'ftf_read_mission_outcomes',
    'ftf_stage_mission_outcome_photo',
    'ftf_create_mission_outcome_observation',
    'ftf_write_mission_outcome_follow_up',
    '/api/v1/mission-outcomes',
    'createMissionOutcomesApi',
    'MissionOutcomes',
    'public.asset_meter_readings',
    'public.ftf_read_financial_actual_operational_prefill',
    'No fabricated historical operating days',
  ]) expect(text).toContain(token);
});
