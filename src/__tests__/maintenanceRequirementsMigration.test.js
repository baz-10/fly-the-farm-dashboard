const fs = require('fs');
const path = require('path');

const migrationPath = path.resolve(
  __dirname,
  '../../supabase/migrations/20260821100000_maintenance_requirements_due_state.sql',
);

const migrationSql = () => fs.readFileSync(migrationPath, 'utf8');

describe('authoritative maintenance requirements and due-state migration', () => {
  test('defines stable identities, immutable versions, typed ANY thresholds and explicit baselines', () => {
    const sql = migrationSql();
    expect(sql).toMatch(/create table public\.maintenance_requirements/i);
    expect(sql).toMatch(/create table public\.maintenance_requirement_versions/i);
    expect(sql).toMatch(/create table public\.maintenance_requirement_thresholds/i);
    expect(sql).toMatch(/create table public\.asset_maintenance_requirement_baselines/i);
    expect(sql).toMatch(/threshold_policy text not null check \(threshold_policy='ANY'\)/i);
    expect(sql).toMatch(/threshold_type in \('CALENDAR','METER','CONDITION','ONE_TIME','COMPONENT'\)/i);
    expect(sql).toMatch(/MAINTENANCE_REQUIREMENT_VERSION_IMMUTABLE/i);
    expect(sql).toMatch(/MAINTENANCE_REQUIREMENT_THRESHOLD_IMMUTABLE/i);
    expect(sql).toMatch(/MAINTENANCE_REQUIREMENT_SCOPE_CONTRADICTION/i);
  });

  test('exposes narrow tenant and Platform lifecycle commands with evidence and concurrency', () => {
    const sql = migrationSql();
    for (const command of [
      'ftf_propose_organisation_maintenance_requirement',
      'ftf_review_organisation_maintenance_requirement_version',
      'ftf_approve_organisation_maintenance_requirement_version',
      'ftf_make_organisation_maintenance_requirement_effective',
      'ftf_propose_platform_maintenance_requirement',
      'ftf_review_platform_maintenance_requirement_version',
      'ftf_approve_platform_maintenance_requirement_version',
      'ftf_make_platform_maintenance_requirement_effective',
      'ftf_record_asset_maintenance_requirement_baseline',
    ]) {
      expect(sql).toMatch(new RegExp(`create function public\\.${command}`, 'i'));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${command}[\\s\\S]*to service_role`, 'i'));
    }
    expect(sql).toMatch(/p_expected_version integer/i);
    expect(sql).toMatch(/REQUIREMENT_REVIEW_EVIDENCE_REQUIRED/i);
    expect(sql).toMatch(/REQUIREMENT_APPROVAL_EVIDENCE_REQUIRED/i);
    expect(sql).toMatch(/MANUFACTURER_REQUIREMENT_REQUIRES_PLATFORM_AUTHORITY/i);
    expect(sql).toMatch(/insert into public\.(?:platform_)?audit_events/i);
    expect(sql).toMatch(/insert into public\.(?:platform_)?transactional_outbox/i);
  });

  test('keeps command-owned tables behind forced RLS and no generic service role writes', () => {
    const sql = migrationSql();
    for (const table of [
      'maintenance_requirements',
      'maintenance_requirement_versions',
      'maintenance_requirement_thresholds',
      'asset_maintenance_requirement_baselines',
    ]) {
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} force row level security`, 'i'));
      expect(sql).toMatch(new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated, service_role`, 'i'));
      expect(sql).not.toMatch(new RegExp(`grant (?:insert|update|delete|all)[^;]*on table public\\.${table}[^;]*to service_role`, 'i'));
    }
  });

  test('provides one deterministic read projection using explicit as-of and IANA Base timezone', () => {
    const sql = migrationSql();
    const projection = sql.slice(sql.indexOf('create function public.ftf_project_asset_maintenance_due_state'));
    expect(projection).toMatch(/p_as_of timestamptz/i);
    expect(projection).toMatch(/operating_locations[\s\S]*timezone/i);
    expect(projection).toMatch(/timezone\(v_timezone/i);
    expect(projection).toMatch(/INSUFFICIENT_DATA/i);
    expect(projection).toMatch(/DUE_SOON/i);
    expect(projection).toMatch(/OVERDUE/i);
    expect(projection).toMatch(/controllingThreshold/i);
    expect(projection).toMatch(/serviceKitVersionId/i);
    expect(projection).toMatch(/ftf_maintenance_asset_location_allowed/i);
    expect(projection).not.toMatch(/update public\.(aircraft|equipment_kits|fleet_assets)/i);
  });

  test('links exact Service Kit versions without creating schedules or fixture data', () => {
    const sql = migrationSql();
    expect(sql).toMatch(/service_template_requirement_links[\s\S]*foreign key \(maintenance_requirement_version_id\)[\s\S]*maintenance_requirement_versions/i);
    expect(sql).not.toMatch(/insert into public\.(fleet_assets|maintainable_asset_registry)/i);
    expect(sql).not.toMatch(/create table public\.(maintenance_tasks|work_orders|tracked_components)/i);
  });
});
