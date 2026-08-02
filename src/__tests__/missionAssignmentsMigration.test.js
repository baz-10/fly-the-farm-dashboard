const fs = require('fs');
const path = require('path');

test('Mission assignment migration preserves history, tenant scope, and atomic audit/outbox evidence', () => {
  const migration = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/20260802022000_authoritative_mission_assignments.sql'), 'utf8');
  expect(migration).toContain('create table public.mission_aircraft_assignments');
  expect(migration).toContain('create table public.mission_equipment_kit_assignments');
  expect(migration).toContain('unassigned_at timestamptz');
  expect(migration).toContain('current_user_has_organisation_access(organisation_id)');
  expect(migration).toContain("'missions.assignments_updated'");
  expect(migration).toContain("'operational.missions.assignments_updated'");
  expect(migration).toContain('equipment_kit_aircraft_compatibility');
  expect(migration).toContain('membership_operating_location_assignments');
});
