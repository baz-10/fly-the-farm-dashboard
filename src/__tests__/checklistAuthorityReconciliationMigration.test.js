const fs = require('fs');
const path = require('path');

const migrationPath = path.resolve(__dirname, '../../supabase/migrations/20260823100000_checklist_authority_reconciliation.sql');
const sql = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, 'utf8') : '';

test('adds explicit platform and organisation template authority without a parallel checklist domain', () => {
  expect(sql).toContain("authority_scope in ('PLATFORM_SYSTEM','ORGANISATION')");
  expect(sql).toContain('source_system_template_version_id');
  expect(sql).toContain('checklist_template_applicability');
  expect(sql).not.toContain('create table public.preprepared_checklist_executions');
});

test('freezes started execution content and removes latest-version submission invalidation', () => {
  expect(sql).toContain('frozen_checklist_snapshot');
  expect(sql).toContain('ftf_start_checklist_execution');
  expect(sql).toContain('ftf_complete_checklist_execution');
  expect(sql).not.toContain('SUPERSEDED_CHECKLIST_SELECTED');
  expect(sql).toContain('newer.version_number>v.version_number');
  expect(sql).toContain('e.template_version_id=r.template_version_id');
  expect(sql).toContain('revoke all on function public.ftf_write_checklist_execution(uuid,uuid,text,uuid,integer,jsonb),');
  expect(sql).toContain('public.ftf_write_checklist_corrective_action(uuid,uuid,text,uuid,integer,jsonb)from service_role');
  expect(sql).toContain('ftf_update_checklist_corrective_action');
  expect(sql).toContain("finding.frozen_item_id=action.item_id");
});

test('uses checked applicability, Base and exact Fleet identity authority', () => {
  for (const token of [
    'ftf_read_applicable_checklist_templates',
    'ftf_operational_location_allowed',
    'ftf_maintenance_asset_location_allowed',
    'maintainable_asset_id',
    'asset_system_id',
    'component_position_id',
    'readiness_required',
  ]) expect(sql).toContain(token);
});

test('provisions separated permissions and keeps platform mutation out of customer commands', () => {
  for (const permission of [
    'checklist_templates.read', 'checklist_templates.author', 'checklist_templates.publish',
    'checklists.execute', 'checklists.read_completed', 'checklist_findings.manage',
  ]) expect(sql).toContain(permission);
  expect(sql).toContain("authority_scope='ORGANISATION'");
});

test('validates completion transactionally and creates immutable pending findings', () => {
  for (const token of [
    'CHECK', 'PASS_DEFECT_NA', 'YES_NO_NA', 'NUMERIC', 'TEXT', 'SELECTION',
    'CHECKLIST_RESPONSE_INVALID', 'CHECKLIST_REQUIRED_RESPONSE_MISSING', 'CHECKLIST_NA_NOT_ALLOWED',
    'checklist_findings', 'DEFECT_HANDOFF_PENDING', 'checklist_findings_immutable',
    'audit_events', 'transactional_outbox',
  ]) expect(sql).toContain(token);
  expect(sql).not.toMatch(/update public\.(aircraft|fleet_assets).*serviceability/is);
});

test('maps existing authority without rewriting immutable submitted evidence', () => {
  expect(sql).toContain("set authority_scope='ORGANISATION'");
  const reconciliationDdl = sql.split('create function public.ftf_provision_checklist_authority_permissions')[0];
  expect(reconciliationDdl).not.toMatch(/update public\.checklist_executions/i);
  expect(reconciliationDdl).not.toMatch(/update public\.checklist_execution_evidence/i);
});
