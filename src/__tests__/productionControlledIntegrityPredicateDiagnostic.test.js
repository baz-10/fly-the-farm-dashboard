const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

describe('Production controlled-integrity predicate diagnostic', () => {
  test('is a separate read-only diagnostic with bounded JSON output', () => {
    const sql = read('scripts/productionControlledIntegrityPredicateDiagnostic.sql');
    expect(sql).toMatch(/begin\s+transaction\s+read\s+only/i);
    expect(sql).toMatch(/jsonb_build_object/i);
    expect(sql).toContain('integrity-predicate');
    expect(sql).not.toMatch(/\b(insert|update|delete|truncate|alter|create|drop|grant|revoke|call)\b/i);
    expect(sql).not.toMatch(/email|phone|submitted_payload|raw_payload|password|secret|token/i);
    expect(sql).not.toMatch(/jsonb_agg/i);
  });

  test('represents every canonical aggregate predicate family individually', () => {
    const sql = read('scripts/productionControlledIntegrityPredicateDiagnostic.sql');
    for (const predicate of [
      'governed_application_exists', 'governed_invitation_exists', 'governed_organisation_exists',
      'governed_fixture_linkage', 'application_status', 'application_row_version',
      'application_history', 'application_invitation_cardinality', 'invitation_status_supported',
      'sent_invitation_version', 'sent_invitation_identity_absent', 'sent_invitation_history',
      'accepted_invitation_version', 'accepted_invitation_identity_complete',
      'accepted_invitation_history', 'accepted_invitation_audit', 'accepted_organisation_link',
      'organisation_accepted_provenance', 'organisation_archived', 'internal_user_cardinality',
      'internal_user_final_state', 'membership_cardinality', 'membership_final_state',
      'location_cardinality', 'location_final_state', 'seat_allocation_final_state',
      'seat_assignment_cardinality', 'seat_assignment_final_state', 'base_assignment_cardinality',
      'base_assignment_final_state', 'active_identity_residue', 'platform_user_residue',
      'personnel_residue', 'profile_residue', 'store_residue', 'client_residue',
      'property_residue', 'field_residue', 'job_residue', 'mission_residue',
      'archive_audit_cardinality', 'archive_outbox_cardinality', 'ambiguous_provenance_count',
      'active_controlled_organisation_count', 'personnel_base_link_count',
      'personnel_role_link_count', 'personnel_credential_count', 'personnel_evidence_count',
      'personnel_mission_assignment_count',
    ]) expect(sql).toContain(`'${predicate}'`);
  });

  test('preserves the exact governed fixture identity and canonical marker semantics', () => {
    const sql = read('scripts/productionControlledIntegrityPredicateDiagnostic.sql');
    for (const value of [
      'a865f157-c334-447e-aa1e-661ee0db7b85',
      '29b9b342-335e-4959-9402-4cb4e1090427',
      '961a4354-40f5-479d-a577-74839596ad14',
      'SC-APP-FD04165C43EA',
      '^SC-APP-[A-Z0-9]+$',
      '^SC ACCEPTANCE — [0-9]{4}-[0-9]{2}-[0-9]{2}T',
    ]) expect(sql).toContain(value);
  });

  test('protected workflow isolates exactly one diagnostic mode in the accepted environment', () => {
    const workflow = read('.github/workflows/production-beta-operational-acceptance.yml');
    expect(workflow).toContain('controlled_integrity_diagnostic_only');
    expect(workflow).toContain('production-beta-acceptance');
    expect(workflow).toContain('productionControlledIntegrityPredicateDiagnostic.sql');
    expect(workflow).toContain('fzkrvglzompkuiodqllr');
    expect(workflow).toContain('ON_ERROR_STOP=1');
  });
});
