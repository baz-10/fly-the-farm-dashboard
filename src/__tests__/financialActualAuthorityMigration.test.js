const fs = require('fs');
const path = require('path');

const migrationPath = path.resolve(__dirname, '../../supabase/migrations/20260822100000_financial_actual_authority.sql');
const sql = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, 'utf8') : '';

test('defines the tenant-scoped Financial Actual aggregate and child authority', () => {
  for (const table of [
    'financial_actuals',
    'financial_actual_revisions',
    'financial_actual_work_entries',
    'financial_actual_cost_lines',
    'financial_actual_value_provenance',
  ]) {
    expect(sql).toMatch(new RegExp(`create table public\\.${table}`));
    expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security`));
    expect(sql).toMatch(new RegExp(`alter table public\\.${table} force row level security`));
    expect(sql).toMatch(new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, 'i'));
  }
  expect(sql).toContain('current_final_revision_id');
  expect(sql).toContain('active_draft_revision_id');
  expect(sql).toMatch(/unique\s*\(organisation_id,financial_actual_id,revision_number\)/i);
  expect(sql).toMatch(/where status='DRAFT'/i);
});

test('provides immutable FINAL and active-pointer database guards', () => {
  expect(sql).toContain('ftf_guard_financial_actual_revision_mutation');
  expect(sql).toContain('ftf_guard_financial_actual_child_mutation');
  expect(sql).toContain('ftf_guard_financial_actual_revision_pointers');
  expect(sql).toContain('ftf_sync_financial_actual_final_revision_pointers');
  expect(sql).toContain('FINANCIAL_ACTUAL_FINAL_IMMUTABLE');
  expect(sql).toContain('FINANCIAL_ACTUAL_REVISION_POINTER_INVALID');
});

test('defines bounded work, cost and provenance domains without Quote or Fleet authority', () => {
  for (const category of ['LABOUR','PRODUCT','TRAVEL','AIRCRAFT_EQUIPMENT','OTHER']) expect(sql).toContain(`'${category}'`);
  for (const provenance of ['AUTHORITATIVE_OPERATIONAL_INPUT','SYSTEM_DERIVED','MANUAL_FINANCIAL_INPUT','MANUAL_OVERRIDE','QUOTE_DERIVED']) expect(sql).toContain(`'${provenance}'`);
  expect(sql).toMatch(/actual_work_hours numeric\(10,4\)/i);
  expect(sql).toMatch(/quantity numeric\(18,6\)/i);
  expect(sql).toMatch(/unit_cost numeric\(19,6\)/i);
  expect(sql).toMatch(/amount numeric\(19,4\)/i);
  expect(sql).not.toMatch(/references public\.(quotes|fleet_assets)/i);
  expect(sql).not.toMatch(/ftf_actuals|localstorage/i);
});

test('provisions explicit permissions to admin and never grants by contractor role name', () => {
  for (const action of ['read','create','update','finalise','archive','export']) expect(sql).toContain(`financial_actuals.${action}`);
  expect(sql).toMatch(/new\.code<>'admin'/i);
  expect(sql).not.toMatch(/new\.code='contractor'[\s\S]*financial_actuals\./i);
});

test('exposes only Slice 1 checked commands and bounded audit/outbox events', () => {
  for (const fn of ['ftf_list_financial_actuals','ftf_read_financial_actual','ftf_create_financial_actual','ftf_update_financial_actual_draft']) expect(sql).toContain(fn);
  for (const later of ['ftf_finalise_financial_actual_revision','ftf_create_financial_actual_correction','ftf_archive_financial_actual','ftf_read_financial_actual_operational_prefill']) expect(sql).not.toContain(`create function public.${later}`);
  expect(sql).toContain("'financial_actual.created'");
  expect(sql).toContain("'financial_actual.draft_updated'");
  expect(sql).toContain("'financial.actual.created'");
  expect(sql).toContain("'financial.actual.draft_updated'");
  expect(sql).not.toMatch(/grant (insert|update|delete) on table public\.financial_actual/i);
});

test('keeps Product Maturity and runtime exposure outside the migration', () => {
  expect(sql).not.toMatch(/product-maturity-registry|COMING_SOON|ProductMaturitySurface/i);
});
