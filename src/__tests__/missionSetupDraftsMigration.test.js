const fs=require('fs');const path=require('path');
const sql=fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20260804070000_mission_setup_drafts.sql'),'utf8').toLowerCase();
test('stores tenant-scoped resumable Mission setup drafts with concurrency, audit and outbox',()=>{
  expect(sql).toContain('create table public.mission_setup_drafts');
  expect(sql).toContain('row_version');
  expect(sql).toContain('current_user_has_organisation_access');
  expect(sql).toContain('ftf_write_mission_setup_draft');
  expect(sql).toContain('audit_events');
  expect(sql).toContain('transactional_outbox');
  expect(sql).toContain('archived_at');
});
