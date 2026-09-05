const fs = require('fs');
const path = require('path');
const sql = () => fs.readFileSync(path.join(__dirname, '../../supabase/migrations/20260905170000_complete_mission_frozen_report_document.sql'), 'utf8').toLowerCase();

test('composes one complete report input from immutable completion authority', () => {
  const migration = sql();
  for (const token of ["'reportevidence',p_completion.daily_evidence_manifest->'reportevidence'", "'dailyevidence',p_completion.daily_evidence_manifest-'reportevidence'", "'finalcompletion'", "'dailyevidencedigest',p_completion.daily_evidence_digest", 'new.report_document_schema_version:=2', 'new.report_document_era:=2']) expect(migration).toContain(token);
});

test('freezes through a before-insert trigger and validates the identical composition on read', () => {
  const migration = sql();
  expect(migration).toContain('before insert on public.mission_completion_revisions');
  expect(migration).toContain('ftf_compose_complete_mission_report_document(new)');
  expect(migration).toContain('ftf_compose_complete_mission_report_document(v_completion)');
  expect(migration).toContain('v_completion.report_document_text is distinct from v_expected::text');
  expect(migration).toContain("jsonb_typeof(p_completion.daily_evidence_manifest->'days')<>'array'");
});

test('keeps prior eras unavailable and grants no parallel table authority', () => {
  const migration = sql();
  expect(migration).toContain("'historical_complete_report_document_unavailable'");
  expect(migration).not.toMatch(/update\s+public\.mission_completion_revisions/);
  expect(migration).not.toMatch(/grant\s+(select|insert|update|delete).*mission_completion_revisions/);
});
