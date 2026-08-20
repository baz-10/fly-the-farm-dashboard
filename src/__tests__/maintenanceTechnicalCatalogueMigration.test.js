const fs = require('fs');
const path = require('path');

const migrationPath = path.resolve(
  __dirname,
  '../../supabase/migrations/20260820110000_maintenance_technical_catalogue.sql',
);

const migrationSql = () => fs.readFileSync(migrationPath, 'utf8');

describe('authoritative maintenance technical catalogue migration', () => {
  test('separates deterministic canonical part identity from immutable evidenced versions', () => {
    const sql = migrationSql();
    expect(sql).toMatch(/create table public\.technical_parts/i);
    expect(sql).toMatch(/normalised_manufacturer text generated always/i);
    expect(sql).toMatch(/normalised_part_number text generated always/i);
    expect(sql).toMatch(/technical_parts_manufacturer_number_unique[\s\S]*normalised_manufacturer, normalised_part_number/i);
    expect(sql).toMatch(/create table public\.technical_part_versions/i);
    expect(sql).toMatch(/unique \(technical_part_id, version_number\)/i);
    expect(sql).toMatch(/authority_type in \('MANUFACTURER', 'VERIFIED_TECHNICAL_SOURCE'\)/i);
    expect(sql).toMatch(/evidence jsonb not null[\s\S]*jsonb_typeof\(evidence\) = 'object'[\s\S]*evidence <> '\{\}'::jsonb/i);
    expect(sql).toMatch(/TECHNICAL_PART_VERSION_IMMUTABLE/i);
    expect(sql).toMatch(/TECHNICAL_PART_VERSION_IDENTITY_MISMATCH/i);
    expect(sql).toMatch(/TECHNICAL_VERSION_SUPERSEDED_VERSION_INVALID/i);
  });

  test('keeps proposals non-authoritative and outside compatibility and applicability foreign keys', () => {
    const sql = migrationSql();
    expect(sql).toMatch(/create table public\.technical_data_proposals/i);
    expect(sql).toMatch(/proposal_state in \('PROPOSED', 'REVIEWED', 'APPROVED', 'REJECTED', 'PUBLISHED'\)/i);
    expect(sql).not.toMatch(/(?:technical_part_equivalences|asset_part_requirements|asset_fluid_requirements)[\s\S]{0,1200}references public\.technical_data_proposals/i);
    expect(sql).toMatch(/PROPOSAL_HAS_NO_TECHNICAL_AUTHORITY/i);
  });

  test('exposes narrow tenant and Platform proposal review commands without publication authority', () => {
    const sql = migrationSql();
    const proposals = sql.match(/create table public\.technical_data_proposals \(([\s\S]*?)\n\);/i)?.[1] || '';
    expect(proposals).toMatch(/proposed_by_platform_user_id uuid references public\.platform_users/i);
    expect(proposals).toMatch(/reviewed_by_platform_user_id uuid references public\.platform_users/i);
    expect(proposals).toMatch(/PROPOSAL_ACTOR_SCOPE_MISMATCH/i);
    for (const command of [
      'ftf_create_organisation_technical_proposal',
      'ftf_review_organisation_technical_proposal',
      'ftf_create_platform_technical_proposal',
      'ftf_review_platform_technical_proposal',
    ]) {
      expect(sql).toMatch(new RegExp(`create function public\\.${command}`, 'i'));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${command}[\\s\\S]*to service_role`, 'i'));
    }
    expect(sql).toContain("'technical_proposals.create'");
    expect(sql).toContain("'technical_proposals.review'");
    const reviewCommands = sql.slice(
      sql.indexOf('create function public.ftf_review_organisation_technical_proposal'),
      sql.indexOf('create function public.ftf_publish_technical_version')
    );
    expect(reviewCommands).toMatch(/p_expected_version integer/i);
    expect(reviewCommands).toMatch(/p_review_evidence jsonb/i);
    expect(reviewCommands).toMatch(/p_review_evidence='\{\}'::jsonb/i);
    expect(reviewCommands).toMatch(/proposal\.row_version<>p_expected_version/i);
    expect(reviewCommands).toMatch(/when 'APPROVE'[\s\S]*then 'APPROVED'/i);
    expect(reviewCommands).toMatch(/insert into public\.(?:platform_)?audit_events/i);
    expect(reviewCommands).toMatch(/insert into public\.(?:platform_)?transactional_outbox/i);
    expect(reviewCommands).not.toMatch(/proposal_state='PUBLISHED'|insert into public\.(?:technical_parts|technical_part_equivalences|technical_part_applicability|technical_fluid_applicability|service_templates)/i);
    expect(sql).not.toMatch(/grant (?:insert|update|delete|all)[^;]*on table public\.technical_data_proposals[^;]*to service_role/i);
  });

  test('publishes equivalence only for exact effective versions with human approval and evidence', () => {
    const sql = migrationSql();
    expect(sql).toMatch(/create table public\.technical_part_equivalences/i);
    expect(sql).toMatch(/directionality in \('SYMMETRIC', 'LEFT_TO_RIGHT', 'RIGHT_TO_LEFT'\)/i);
    expect(sql).toMatch(/left_part_version_id uuid not null/i);
    expect(sql).toMatch(/right_part_version_id uuid not null/i);
    expect(sql).toMatch(/create function public\.ftf_publish_part_equivalence/i);
    expect(sql).toMatch(/ftf_platform_actor_has_permission/i);
    expect(sql).toContain("'platform.technical_catalogue.publish'");
    expect(sql).toMatch(/ftf_technical_version_effective_at\(left_version\.lifecycle_state,left_version\.effective_from,left_version\.effective_to,p_effective_from\)/i);
    expect(sql).toMatch(/ftf_technical_version_effective_at\(right_version\.lifecycle_state,right_version\.effective_from,right_version\.effective_to,p_effective_from\)/i);
    expect(sql).toMatch(/verified_by_platform_user_id=coalesce\(verified_by_platform_user_id,p_platform_user_id\)/i);
    expect(sql).toMatch(/verified_at=coalesce\(verified_at,now\(\)\)/i);
    expect(sql).toMatch(/EQUIVALENCE_EVIDENCE_REQUIRED/i);
    expect(sql).toMatch(/technical_part_equivalences_unique_symmetric[\s\S]*least\(left_part_version_id::text,right_part_version_id::text\)[\s\S]*greatest\(left_part_version_id::text,right_part_version_id::text\)/i);
    expect(sql).toMatch(/insert into public\.platform_audit_events/i);
    expect(sql).toMatch(/insert into public\.platform_transactional_outbox/i);
  });

  test('exposes effective canonical part results without commercial preference fields', () => {
    const sql = migrationSql();
    const view = sql.match(/create view public\.effective_technical_part_catalogue as([\s\S]*?)revoke all on public\.effective_technical_part_catalogue/i)?.[1] || '';
    expect(view).toMatch(/version\.lifecycle_state='EFFECTIVE'/i);
    for (const privateField of ['supplier', 'internal_sku', 'package', 'organisation_notes', 'purchasing_metadata']) {
      expect(view).not.toMatch(new RegExp(privateField, 'i'));
    }
  });

  test('keeps part and fluid preferences tenant private behind forced RLS command boundaries', () => {
    const sql = migrationSql();
    for (const table of ['organisation_part_preferences', 'organisation_fluid_preferences']) {
      expect(sql).toMatch(new RegExp(`create table public\\.${table}`, 'i'));
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} force row level security`, 'i'));
      expect(sql).toMatch(new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated, service_role`, 'i'));
    }
    expect(sql).toMatch(/create function public\.ftf_read_organisation_technical_preferences/i);
    expect(sql).toMatch(/where preference\.organisation_id=p_organisation_id/i);
    expect(sql).toMatch(/create function public\.ftf_write_organisation_technical_preference/i);
    expect(sql).toContain("'technical_preferences.read'");
    expect(sql).toContain("'technical_preferences.manage'");
    expect(sql).toMatch(/ftf_part_preference_version_allowed/i);
    expect(sql).toMatch(/PREFERRED_PART_VERSION_NOT_APPROVED_EQUIVALENT/i);
  });

  test('models canonical fluid versions and exact non-rounded capacity semantics', () => {
    const sql = migrationSql();
    expect(sql).toMatch(/create table public\.technical_fluid_specifications/i);
    expect(sql).toMatch(/create table public\.technical_fluid_specification_versions/i);
    expect(sql).toMatch(/TECHNICAL_FLUID_VERSION_IMMUTABLE/i);
    expect(sql).toMatch(/create table public\.asset_fluid_requirements/i);
    expect(sql).toMatch(/capacity_semantics in \('SERVICE_FILL', 'DRY_FILL', 'TOTAL_SYSTEM_CAPACITY', 'REFILL_AFTER_FILTER_REPLACEMENT', 'OTHER'\)/i);
    expect(sql).toMatch(/quantity numeric not null check \(quantity > 0\)/i);
    expect(sql).toMatch(/unit_code text not null check \(unit_code in \('ML', 'L', 'US_QT', 'IMP_QT', 'G', 'KG'\)\)/i);
    expect(sql).toMatch(/is_approximate boolean not null default false/i);
    expect(sql).toMatch(/manufacturer_tolerance numeric/i);
  });

  test('links asset part and fluid applicability to exact versions, controlled quantities and governed scope', () => {
    const sql = migrationSql();
    expect(sql).toMatch(/create table public\.asset_part_requirements/i);
    expect(sql).toMatch(/technical_part_version_id uuid not null/i);
    expect(sql).toMatch(/create table public\.asset_fluid_requirements/i);
    expect(sql).toMatch(/fluid_specification_version_id uuid not null/i);
    expect(sql).toMatch(/create table public\.technical_part_applicability/i);
    expect(sql).toMatch(/create table public\.technical_fluid_applicability/i);
    expect(sql).toMatch(/ftf_guard_asset_technical_scope/i);
    expect(sql).toMatch(/ASSET_TECHNICAL_SCOPE_CONTRADICTION/i);
    expect(sql).toMatch(/v_system\.maintainable_asset_id is distinct from new\.maintainable_asset_id/i);
    expect(sql).toMatch(/v_position\.system_id is distinct from new\.system_id/i);
    expect(sql.match(/authority_type text not null check \(authority_type='ORGANISATION_STANDARD'\)/gi)).toHaveLength(2);
    const canonicalApplicability = sql.match(/create table public\.technical_part_applicability \(([\s\S]*?)\n\);/i)?.[1] || '';
    expect(canonicalApplicability).toMatch(/authority_type text not null check\(authority_type in \('MANUFACTURER','VERIFIED_TECHNICAL_SOURCE'\)\)/i);
    expect(sql).toMatch(/APPLICABILITY_REQUIRES_EFFECTIVE_PART_VERSION/i);
    expect(sql).toMatch(/APPLICABILITY_REQUIRES_EFFECTIVE_FLUID_VERSION/i);
    expect(sql).toMatch(/ftf_asset_technical_scope_matches/i);
    expect(sql).toMatch(/create function public\.ftf_publish_technical_applicability\(\s*p_platform_user_id uuid/i);
    expect(sql).toMatch(/platform\.technical_catalogue\.applicability_published/i);
  });

  test('uses explicit as-of intervals for canonical versions, applicability and service templates', () => {
    const sql = migrationSql();
    const lookup = sql.slice(sql.indexOf('create function public.ftf_read_asset_technical_catalogue'));
    expect(lookup).toMatch(/p_as_of timestamptz/i);
    expect(lookup.match(/ftf_version_historically_effective_at\([^)]*p_as_of\)/gi).length).toBeGreaterThanOrEqual(5);
    expect(lookup).toMatch(/requirement\.effective_from is null or requirement\.effective_from<=p_as_of/i);
    expect(lookup).toMatch(/requirement\.effective_to is null or requirement\.effective_to>p_as_of/i);
    expect(lookup).toMatch(/applicability\.effective_from is null or applicability\.effective_from<=p_as_of/i);
    expect(lookup).toMatch(/applicability\.effective_to is null or applicability\.effective_to>p_as_of/i);
    expect(lookup).not.toMatch(/join public\.effective_technical_(?:part|fluid)_catalogue/i);
  });

  test('supports FTF-11, attached GEN-003 and model-position T100 lookup without fixture data or tracked components', () => {
    const sql = migrationSql();
    expect(sql).toMatch(/create function public\.ftf_read_asset_technical_catalogue/i);
    expect(sql).toMatch(/p_maintainable_asset_id uuid/i);
    expect(sql).toMatch(/asset_systems/i);
    expect(sql).toMatch(/component_positions/i);
    expect(sql).toMatch(/asset_attachment_periods/i);
    expect(sql).toMatch(/model_scope/i);
    expect(sql).toMatch(/equipment\.specifications->>'model'/i);
    expect(sql).not.toMatch(/equipment\.model/i);
    expect(sql).not.toMatch(/insert into public\.(fleet_assets|maintainable_asset_registry|asset_systems|component_positions|technical_parts|technical_fluid_specifications)/i);
    expect(sql).not.toMatch(/create table public\.tracked_components/i);
  });

  test('creates optional versioned platform and organisation service templates with distinct authority', () => {
    const sql = migrationSql();
    expect(sql).toMatch(/create table public\.service_templates/i);
    expect(sql).toMatch(/owner_scope in \('PLATFORM', 'ORGANISATION'\)/i);
    expect(sql).toMatch(/owner_scope='PLATFORM' and organisation_id is null/i);
    expect(sql).toMatch(/owner_scope='ORGANISATION' and organisation_id is not null/i);
    expect(sql).toMatch(/create table public\.service_template_versions/i);
    expect(sql).toMatch(/unique \(service_template_id, version_number\)/i);
    expect(sql).toMatch(/supersedes_version_id uuid/i);
    expect(sql).toMatch(/SERVICE_TEMPLATE_VERSION_IMMUTABLE/i);
    expect(sql).toMatch(/SERVICE_TEMPLATE_AGGREGATE_IMMUTABLE/i);
    expect(sql).toMatch(/create function public\.ftf_publish_platform_service_template_version/i);
    const organisationPublisher = sql.match(/create function public\.ftf_publish_service_template_version([\s\S]*?)create function public\.ftf_publish_platform_service_template_version/i)?.[1] || '';
    expect(organisationPublisher).toMatch(/template\.owner_scope<>'ORGANISATION'/i);
    expect(organisationPublisher).not.toMatch(/template\.owner_scope='PLATFORM'/i);
    expect(sql).toMatch(/PLATFORM_SERVICE_TEMPLATE_PUBLISH_FORBIDDEN/i);
  });

  test('models template applicability, actions, parts, fluids, inspections and replacement actions', () => {
    const sql = migrationSql();
    for (const table of [
      'service_template_applicability',
      'service_template_actions',
      'service_template_part_lines',
      'service_template_fluid_lines',
      'service_template_inspections',
      'service_template_replacement_actions',
    ]) expect(sql).toMatch(new RegExp(`create table public\\.${table}`, 'i'));
    expect(sql).toMatch(/action_type in \('INSPECT', 'REPLACE', 'SERVICE', 'CALIBRATE', 'OTHER'\)/i);
    const actions = sql.match(/create table public\.service_template_actions \(([\s\S]*?)\n\);/i)?.[1] || '';
    expect(actions).toMatch(/unique \(id,service_template_version_id\)/i);
    expect(sql.match(/disposition text not null check \(disposition in \('REQUIRED', 'OPTIONAL', 'CONDITIONAL'\)\)/gi).length).toBeGreaterThanOrEqual(5);
    expect(sql).toMatch(/CONDITIONAL_REQUIRES_CONDITION/i);
    expect(sql).toMatch(/technical_part_version_id uuid not null/i);
    expect(sql).toMatch(/fluid_specification_version_id uuid not null/i);
    expect(sql).toMatch(/SERVICE_TEMPLATE_PART_VERSION_NOT_EFFECTIVE/i);
    expect(sql).toMatch(/SERVICE_TEMPLATE_FLUID_VERSION_NOT_EFFECTIVE/i);
    const childGuard = sql.match(/create function public\.ftf_guard_service_template_aggregate_mutation([\s\S]*?)\$\$;/i)?.[1] || '';
    expect(childGuard).toMatch(/from public\.service_template_versions[\s\S]*for update/i);
    expect(sql).toMatch(/SERVICE_TEMPLATE_APPLICABILITY_SCOPE_CONTRADICTION/i);
    const templateApplicability = sql.match(/create table public\.service_template_applicability \(([\s\S]*?)\n\);/i)?.[1] || '';
    expect(templateApplicability).toMatch(/manufacturer_scope text/i);
    const templateScopeGuard = sql.match(/create function public\.ftf_guard_service_template_applicability_scope([\s\S]*?)\$\$;/i)?.[1] || '';
    expect(templateScopeGuard).toMatch(/new\.manufacturer_scope is null or length\(btrim\(new\.manufacturer_scope\)\)=0/i);
    const lookup = sql.slice(sql.indexOf('create function public.ftf_read_asset_technical_catalogue'));
    expect(lookup).toMatch(/ftf_normalise_technical_scope\(applicability\.manufacturer_scope\)=public\.ftf_normalise_technical_scope\(v_manufacturer_scope\)/i);
    expect(lookup).toMatch(/ftf_normalise_technical_scope\(applicability\.model_scope\)=public\.ftf_normalise_technical_scope\(v_model_scope\)/i);
  });

  test('reads one exact applicable Service Template aggregate through a tenant and Base scoped RPC', () => {
    const sql = migrationSql();
    const reader = sql.match(/create function public\.ftf_read_applicable_service_template_version([\s\S]*?)revoke all on function public\.ftf_guard_technical_part_version_mutation/i)?.[1] || '';
    expect(reader).toMatch(/p_organisation_id uuid[\s\S]*p_actor_internal_user_id uuid[\s\S]*p_maintainable_asset_id uuid[\s\S]*p_service_template_version_id uuid[\s\S]*p_as_of timestamptz/i);
    expect(reader).toMatch(/ftf_actor_has_active_beta_seat/i);
    expect(reader).toMatch(/'service_templates\.read'/i);
    expect(reader).toMatch(/ftf_maintenance_asset_location_allowed/i);
    expect(reader).toMatch(/candidate\.id=p_service_template_version_id/i);
    expect(reader).toMatch(/ftf_version_historically_effective_at\([^)]*p_as_of\)/i);
    for (const child of [
      'service_template_applicability', 'service_template_actions', 'service_template_part_lines',
      'service_template_fluid_lines', 'service_template_inspections',
      'service_template_replacement_actions', 'service_template_requirement_links',
    ]) expect(reader).toMatch(new RegExp(`public\\.${child}`, 'i'));
    expect(reader).toMatch(/technical_part_versions/i);
    expect(reader).toMatch(/technical_fluid_specification_versions/i);
    expect(reader).not.toMatch(/organisation_part_preferences|organisation_fluid_preferences/i);
    expect(sql).toMatch(/grant execute on function public\.ftf_read_applicable_service_template_version[\s\S]*to service_role/i);
  });

  test('reserves deterministic exact maintenance-requirement version links without due-state inference', () => {
    const sql = migrationSql();
    expect(sql).toMatch(/create table public\.service_template_requirement_links/i);
    expect(sql).toMatch(/maintenance_requirement_version_id uuid not null/i);
    expect(sql).toMatch(/requirement_schema_version integer not null default 1/i);
    expect(sql).not.toMatch(/references public\.maintenance_requirement_versions/i);
    expect(sql).not.toMatch(/create table public\.(maintenance_requirements|maintenance_requirement_versions|maintenance_due|maintenance_events)/i);
    expect(sql).not.toMatch(/due_at|due_state|next_due|threshold_value/i);
  });

  test('forces RLS for organisation service data and exposes only least-privilege service-role commands', () => {
    const sql = migrationSql();
    for (const table of [
      'service_templates', 'service_template_versions', 'service_template_applicability',
      'service_template_actions', 'service_template_part_lines', 'service_template_fluid_lines',
      'service_template_inspections', 'service_template_replacement_actions',
      'service_template_requirement_links',
    ]) {
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} force row level security`, 'i'));
      expect(sql).toMatch(new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated, service_role`, 'i'));
    }
    expect(sql).toMatch(/grant execute on function public\.ftf_publish_service_template_version[\s\S]*to service_role/i);
    expect(sql).not.toMatch(/grant (?:insert|update|delete|all)[^;]*on table public\.(?:service_|technical_|organisation_|asset_part_requirements|asset_fluid_requirements)[^;]*to service_role/i);
  });

  test('uses optimistic concurrency and writes audit and outbox evidence in authoritative commands', () => {
    const sql = migrationSql();
    expect(sql.match(/row_version integer not null default 1/gi).length).toBeGreaterThanOrEqual(8);
    expect(sql).toMatch(/equivalence\.row_version <> p_expected_version/i);
    expect(sql).toMatch(/template_version\.row_version <> p_expected_version/i);
    expect(sql).toMatch(/preference\.row_version <> p_expected_version/i);
    expect((sql.match(/insert into public\.(?:platform_)?audit_events/gi) || []).length).toBeGreaterThanOrEqual(3);
    expect((sql.match(/insert into public\.(?:platform_)?transactional_outbox/gi) || []).length).toBeGreaterThanOrEqual(3);
  });

  test('keeps global publication on the Platform identity plane and tenant preference reads private', () => {
    const sql = migrationSql();
    expect(sql).toMatch(/insert into public\.platform_permissions\(code,description,enabled\)[\s\S]*'platform\.technical_catalogue\.publish'/i);
    expect(sql).toMatch(/create function public\.ftf_platform_actor_has_permission\(p_platform_user_id uuid,p_permission_code text\)/i);
    expect(sql).toMatch(/create function public\.ftf_publish_technical_version\(\s*p_platform_user_id uuid/i);
    expect(sql).not.toMatch(/create function public\.ftf_publish_technical_version\(\s*p_organisation_id uuid/i);
    expect(sql).toMatch(/create function public\.ftf_publish_part_equivalence\(\s*p_platform_user_id uuid/i);
    expect(sql).not.toMatch(/technical_catalogue\.publish','Publish canonical technical facts/i);
    const preferenceReader = sql.match(/create function public\.ftf_read_organisation_technical_preferences([\s\S]*?)create function public\.ftf_write_organisation_technical_preference/i)?.[1] || '';
    expect(preferenceReader).not.toMatch(/platform_user|platform_permission/i);
    expect(preferenceReader).toMatch(/ftf_actor_has_active_beta_seat/i);
  });
});
