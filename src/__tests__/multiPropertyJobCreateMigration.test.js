const fs = require('fs');
const path = require('path');

const migrationPath = path.resolve(
  __dirname,
  '../../supabase/migrations/20260905220000_checked_multiproperty_job_create.sql',
);

const migration = () => fs.existsSync(migrationPath)
  ? fs.readFileSync(migrationPath, 'utf8').replace(/\s+/g, ' ').toLowerCase()
  : '';

test('creates the Job and complete cross-Property scope atomically under one organisation lock', () => {
  const sql = migration();
  for (const token of [
    'ftf_create_job_with_scope', 'pg_advisory_xact_lock', 'insert into public.jobs',
    'insert into public.job_fields', 'for update', 'job_scope_client_mismatch',
  ]) expect(sql).toContain(token);
  expect(sql).not.toMatch(/commit|start transaction/);
});

test('derives the compatibility Property from authoritative Fields and rejects untrusted scope', () => {
  const sql = migration();
  for (const token of [
    'job_scope_empty', 'job_scope_field_invalid', 'job_scope_field_duplicate',
    'job_scope_field_not_found', 'archived_at is null', 'v_first_property_id',
  ]) expect(sql).toContain(token);
  expect(sql).toContain("client_id <> (p_data->>'client_id')::uuid");
  expect(sql).toContain("ftf_allocate_operational_reference(p_organisation_id, 'job')");
  expect(sql).toContain("role.code = 'production_beta_acceptance'");
  expect(sql).toContain("starts_with(coalesce(p_data->>'scope', ''), 'sc acceptance —')");
});

test('preserves least privilege and emits bounded create evidence', () => {
  const sql = migration();
  expect(sql).toMatch(/public\.ftf_actor_has_permission\(\s*p_organisation_id,\s*p_actor_internal_user_id,\s*'jobs\.create'/);
  expect(sql).toContain("return jsonb_build_object('forbidden', true)");
  expect(sql).toContain("'jobs.create'");
  expect(sql).toContain("'operational.jobs.create'");
  expect(sql).toContain('grant execute on function public.ftf_create_job_with_scope');
  expect(sql).not.toMatch(/grant\s+(insert|update|delete).*authenticated/i);
});
