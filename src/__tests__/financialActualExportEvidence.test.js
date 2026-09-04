const fs = require('fs');
const path = require('path');

const migrationPath = path.resolve(__dirname, '../../supabase/migrations/20260822140000_financial_actual_export_evidence.sql');
const sql = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, 'utf8') : '';

test('adds only the single checked Financial Actual export-evidence RPC', () => {
  expect(sql).toContain('create function public.ftf_record_financial_actual_export_evidence');
  expect(sql).toMatch(/security definer set search_path=public,pg_temp/i);
  expect(sql).toMatch(/revoke all on function public\.ftf_record_financial_actual_export_evidence[\s\S]*from public,anon,authenticated/i);
  expect(sql).toMatch(/grant execute on function public\.ftf_record_financial_actual_export_evidence[\s\S]*to service_role/i);
  expect(sql).not.toMatch(/create\s+table/i);
  expect(sql).not.toMatch(/grant\s+(select|insert|update|delete|all)\s+on\s+table/i);
});

test('revalidates exact immutable FINAL authority and both permissions', () => {
  for (const value of [
    'financial_actuals.read', 'financial_actuals.export', 'p_financial_actual_id', 'p_revision_id',
    'p_revision_number', 'p_input_digest', 'p_formula_version', 'p_report_version', 'p_generated_at',
    "status='FINAL'", 'FINANCIAL_ACTUAL_EXPORT_EVIDENCE_MISMATCH', 'FINANCIAL_ACTUAL_PNL_V1',
  ]) expect(sql).toContain(value);
  expect(sql).toContain('ftf_financial_actor_has_location');
  expect(sql).toContain("'financial_actual.export_generated'");
  expect(sql).toContain("'financial.actual.export_generated'");
});

test('records bounded identifiers without financial payloads', () => {
  for (const key of ['revision_id', 'revision_number', 'input_digest', 'formula_version', 'report_version', 'generated_at']) expect(sql).toContain(`'${key}'`);
  for (const forbidden of ['revenue', 'gross_profit', 'cost_lines', 'work_entries', 'provenance_snapshot', 'input_snapshot', 'source_manifest']) expect(sql).not.toContain(`'${forbidden}'`);
});
