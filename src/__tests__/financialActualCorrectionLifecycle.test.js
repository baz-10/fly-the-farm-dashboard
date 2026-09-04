const fs=require('fs');const path=require('path');
const migration=path.resolve(__dirname,'../../supabase/migrations/20260822130000_financial_actual_correction_and_archive.sql');

test('defines only checked correction, bounded history, historical detail and archive authority',()=>{
  const sql=fs.readFileSync(migration,'utf8');
  for(const name of['ftf_create_financial_actual_correction','ftf_read_financial_actual_revision_history','ftf_read_financial_actual_historical_revision','ftf_archive_financial_actual'])expect(sql).toContain(`create function public.${name}`);
  expect(sql).toContain("'financial_actual.correction_created'");
  expect(sql).toContain("'financial.actual.correction_created'");
  expect(sql).toContain("'financial_actual.archived'");
  expect(sql).toContain("'financial.actual.archived'");
  expect(sql).not.toMatch(/delete\s+from\s+public\.financial_actual/i);
  expect(sql).not.toMatch(/grant\s+(?:select|insert|update|delete).*financial_actual/i);
});

test('requires bounded reasons, serial aggregate locks, exact final expectations and active-Draft archive conflict',()=>{
  const sql=fs.readFileSync(migration,'utf8');
  expect(sql).toMatch(/for update/i);
  expect(sql).toContain('p_expected_final_revision_id');
  expect(sql).toContain('p_expected_final_revision_version');
  expect(sql).toContain('FINANCIAL_ACTUAL_CORRECTION_REASON_INVALID');
  expect(sql).toContain('ACTIVE_DRAFT_CONFLICT');
  expect(sql).toContain("status='FINAL'");
  expect(sql).toContain('current_final_revision_id');
});
