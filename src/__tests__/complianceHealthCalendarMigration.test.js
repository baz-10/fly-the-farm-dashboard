const fs = require('fs');
const path = require('path');

const migrationPath = path.join(__dirname, '../../supabase/migrations/20260805170000_compliance_health_calendar.sql');

test('NEW-CMP-022/023 derive one deterministic state and explain every critical blocker', () => {
  expect(fs.existsSync(migrationPath)).toBe(true);
  const sql = fs.readFileSync(migrationPath, 'utf8');
  expect(sql).toContain("'AU-CASA-HEALTH-1'");
  for (const state of ['OPERATIONALLY_BLOCKING','EXPIRED_OVERDUE','MISSING','UNDER_REVIEW','DUE_30','DUE_90','CURRENT']) {
    expect(sql).toContain(`'${state}'`);
  }
  expect(sql).toMatch(/when operationally_blocking then 'OPERATIONALLY_BLOCKING'[\s\S]*when expired_or_overdue then 'EXPIRED_OVERDUE'[\s\S]*when missing then 'MISSING'[\s\S]*when under_review then 'UNDER_REVIEW'[\s\S]*when days_remaining <= 30 then 'DUE_30'[\s\S]*when days_remaining <= 90 then 'DUE_90'/);
  for (const field of ['criticalRuleCode','criticalRuleVersion','reason','sourceEntityType','sourceEntityId','sourceRowVersion','organisationId','operatingLocationId','affectedArea','route','evaluationTimestamp']) {
    expect(sql).toContain(`'${field}'`);
  }
});

test('calendar reuses authoritative sources without persisted calendar or score tables', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  for (const source of ['organisation_compliance_instruments','controlled_document_versions','personnel_credentials','aircraft','checklist_template_versions','checklist_corrective_actions','compliance_renewal_actions']) {
    expect(sql).toContain(`public.${source}`);
  }
  expect(sql).toContain("credential_type='RePL'");
  expect(sql).toContain("pc.credential_type<>'AROC'or pc.expiry_date is not null");
  expect(sql).not.toMatch(/create table public\.(compliance_calendar|compliance_health)/);
  expect(sql).toContain('grant execute on function public.ftf_read_casa_compliance_overview(uuid,timestamptz)to service_role');
});
