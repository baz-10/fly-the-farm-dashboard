const fs = require('fs');
const path = require('path');

const migrationPath = path.resolve(__dirname, '../../supabase/migrations/20260905135000_mission_material_amendment_policy.sql');
const migration = () => fs.readFileSync(migrationPath, 'utf8').replace(/\s+/g, ' ').toLowerCase();

test('mirrors the closed TypeScript classification and fails unknown keys closed', () => {
  const sql = migration();
  for (const token of [
    'ftf_classify_mission_amendment', 'administrative', 'material', 'unrecognised_change',
    'field_scope_changed', 'aircraft_assignment_changed', 'regulated_crew_changed',
    'chemical_product_changed', 'application_method_changed', 'governed_rate_changed',
    'jsa_hazards_changed', 'jsa_controls_changed', 'safety_map_changed',
    'operational_permission_changed', 'actualflighthours', 'flightlineevidenceid',
  ]) expect(sql).toContain(token);
});

test('creates an immutable prospective amendment record and preparing package without rewriting effective history', () => {
  const sql = migration();
  for (const token of [
    'mission_package_amendments', 'reject_append_only_mutation', 'ftf_create_mission_amendment',
    'ftf_lock_mission_package_aggregate', "package_state = 'preparing'", 'mission_pack_fields',
    'current_authorised_pack_revision_id', 'audit_events', 'transactional_outbox',
  ]) expect(sql).toContain(token);
  expect(sql).not.toMatch(/set\s+current_authorised_pack_revision_id\s*=/);
});

test('serializes amendment creation with day start and fails stale or forged authority closed', () => {
  const sql = migration();
  expect(sql.indexOf('perform public.ftf_lock_mission_package_aggregate')).toBeLessThan(sql.indexOf('for update'));
  for (const token of [
    'mission_package_version_conflict', 'mission_amendment_before_mismatch',
    'mission_amendment_after_mismatch', 'mission_amendment_reason_invalid',
    'mission.pack.generate', 'ftf_operational_location_allowed',
    'ftf_build_mission_package_source_manifest', 'v_authoritative_source_changed',
    'ftf_derive_mission_material_changed_keys', 'mission_amendment_key_set_mismatch',
    'ftf_project_mission_amendment_values', 'ftf_validate_mission_administrative_evidence',
    'mission_amendment_evidence_invalid', 'before_values', 'after_values',
  ]) expect(sql).toContain(token);
});

test('does not classify unsupported receipt or correction claims as administrative evidence', () => {
  const sql = migration();
  const administrativeList = sql.match(/if v_key = any\(array\[(.*?)\]\) then continue/s)?.[1] || '';
  expect(administrativeList).not.toContain("'receipts'");
  expect(administrativeList).not.toContain("'nonsafetycorrections'");
});

test('bounds the combined key union and exposes only checked scoped history', () => {
  const sql = migration();
  expect(sql).toContain('cardinality(v_all_keys) > 64');
  expect(sql).toContain('ftf_read_mission_amendment_history');
  expect(sql).toContain('limit 100');
  expect(sql).toContain("'mission.pack.read'");
  expect(sql).toContain('ftf_operational_location_allowed');
});

test('grants only checked RPC execution and no direct amendment mutation authority', () => {
  const sql = migration();
  expect(sql).toContain('grant execute on function public.ftf_create_mission_amendment');
  expect(sql).toContain('revoke all on table public.mission_package_amendments from public, anon, authenticated, service_role');
  expect(sql).not.toMatch(/grant\s+(insert|update|delete).*mission_package_amendments.*authenticated/);
});
