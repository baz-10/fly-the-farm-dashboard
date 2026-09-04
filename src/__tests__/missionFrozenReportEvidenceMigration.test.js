const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../../supabase/migrations/20260905150000_mission_frozen_report_evidence.sql');
const migration = () => fs.readFileSync(file, 'utf8').toLowerCase();
const finalityMigration = () => fs.readFileSync(path.join(__dirname, '../../supabase/migrations/20260905140000_mission_final_signoff_and_job_close.sql'), 'utf8').toLowerCase();

test('enriches only the canonical completion manifest through a forward migration', () => {
  const sql = migration();
  expect(sql).toContain('ftf_build_mission_report_evidence_manifest');
  expect(sql).toContain('ftf_build_mission_daily_evidence_manifest_before_report_evidence');
  expect(sql).toContain("'reportevidence'");
  expect(sql).not.toMatch(/create table|mission_report_authority|report_final/);
});

test('freezes complete bounded report evidence with deterministic ordering', () => {
  const sql = migration();
  for (const token of [
    "'scope'", "'job'", "'client'", "'properties'", "'fields'", "'targethectares'",
    "'effectivepackage'", "'packagehistory'", "'decisionhistory'", "'effectiveapproval'",
    "'governingjsa'", "'jsahistory'", "'aircraft'", "'plannedchemicals'",
    "'flightlineevidence'", "'exceptionhistory'",
  ]) expect(sql).toContain(token);
  expect(sql).toContain('mission_report_evidence_bound_exceeded');
  expect(sql).toMatch(/order by scope\.field_order,field\.id/);
  expect(sql).toMatch(/order by pack\.version_number,pack\.id/);
  expect(sql).toMatch(/order by decision\.version_number,decision\.id/);
  expect(sql).toMatch(/order by aircraft\.registration,aircraft\.id/);
  expect(sql).toMatch(/order by import\.version_number,import\.id/);
});

test('derives the snapshot server-side under canonical final-signoff locks', () => {
  const sql = migration();
  expect(sql).toContain('ftf_lock_mission_package_aggregate_allow_final');
  expect(sql).toContain('current_authorised_pack_revision_id');
  expect(sql).toContain('mission_report_evidence_invalid');
  expect(finalityMigration()).toMatch(/ftf_build_mission_daily_evidence_manifest[\s\S]+daily_evidence_digest/);
  expect(sql).not.toMatch(/grant execute[\s\S]+ftf_build_mission_report_evidence_manifest[\s\S]+authenticated/);
  expect(sql).toContain('from public,anon,authenticated,service_role');
});
