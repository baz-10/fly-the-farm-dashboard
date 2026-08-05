const fs = require('fs');
const path = require('path');

const migrationPath = path.join(__dirname, '../../supabase/migrations/20260805120000_casa_compliance_foundation.sql');

test('CASA compliance migration defines the authoritative command-centre records', () => {
  expect(fs.existsSync(migrationPath)).toBe(true);
  const migration = fs.readFileSync(migrationPath, 'utf8');
  for (const table of [
    'compliance_country_packs', 'compliance_regulatory_rules', 'organisation_compliance_profiles',
    'organisation_compliance_instruments', 'compliance_instrument_evidence', 'controlled_documents',
    'controlled_document_versions', 'controlled_document_acknowledgements', 'compliance_training_records',
    'compliance_renewal_actions', 'compliance_legal_holds',
  ]) expect(migration).toContain(`create table public.${table}`);
  expect(migration).toContain('force row level security');
  expect(migration).toContain('reject_append_only_mutation');
});

test('Australian rules retain evidence-specific timing and ReOC warning thresholds', () => {
  const migration = fs.readFileSync(migrationPath, 'utf8');
  expect(migration).toContain("'AU_PART_101'");
  expect(migration).toContain("array[90,60,30,14,7]");
  expect(migration).toContain("'RECORD_CREATED_AT'");
  expect(migration).toContain("'EMPLOYMENT_CEASED_AT'");
  expect(migration).toContain("'LAST_AIRCRAFT_OPERATION_AT'");
  expect(migration).toContain("'https://www.legislation.gov.au/F2019L00593/latest'");
});

test('CASA compliance permissions and commands remain explicit', () => {
  const migration = fs.readFileSync(migrationPath, 'utf8');
  for (const permission of [
    'compliance.read', 'compliance.manage', 'compliance.verify', 'compliance.publish',
    'compliance.export', 'compliance.restricted.read',
  ]) expect(migration).toContain(`'${permission}'`);
  for (const rpc of [
    'ftf_read_casa_compliance_overview', 'ftf_write_compliance_instrument',
    'ftf_publish_controlled_document_version', 'ftf_write_compliance_training', 'ftf_write_renewal_action',
  ]) expect(migration).toContain(`function public.${rpc}`);
  expect(migration).toContain('audit_events');
  expect(migration).toContain('transactional_outbox');
  expect(migration).toContain('p_expected_version');
});
