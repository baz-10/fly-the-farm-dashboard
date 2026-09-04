const fs = require('fs');
const path = require('path');

const migrationPath = path.resolve(
  __dirname,
  '../../supabase/migrations/20260905090000_multifield_job_scope.sql'
);

function migration() {
  return fs.readFileSync(migrationPath, 'utf8').replace(/\s+/g, ' ').toLowerCase();
}

test('checks every Field through Property and one Client under the aggregate lock', () => {
  const sql = migration();
  for (const token of ['ftf_write_job_scope', 'pg_advisory_xact_lock', 'for update', 'job_fields', 'properties', 'client_id']) {
    expect(sql).toContain(token);
  }
  expect(sql).toContain('job_scope_client_mismatch');
  expect(sql).toContain('job_scope_field_duplicate');
  expect(sql).toContain('job_scope_version_conflict');
});

test('enforces the exact jobs.write authority in the checked RPC', () => {
  const sql = migration();
  expect(sql).toContain("public.ftf_actor_has_permission(p_organisation_id, p_actor_internal_user_id, 'jobs.write')");
  expect(sql).toContain("return jsonb_build_object('forbidden', true)");
});

test('keeps the adopted Job Field relation while removing its single-property parent restriction', () => {
  const sql = migration();
  expect(sql).toContain('alter table public.job_fields drop constraint');
  expect(sql).toContain('add constraint job_fields_job_fk');
  expect(sql).toContain('foreign key (organisation_id, job_id) references public.jobs (organisation_id, id)');
});

test('rejects empty, foreign, and cross-tenant scope before replacing active links', () => {
  const sql = migration();
  for (const token of ['job_scope_empty', 'job_scope_field_not_found', 'organisation_id = p_organisation_id', 'archived_at is null']) {
    expect(sql).toContain(token);
  }
  expect(sql).toMatch(/update public\.job_fields[\s\S]+archived_at is null/);
});

test('advances the Job version and emits bounded scope evidence containing IDs only', () => {
  const sql = migration();
  expect(sql).toMatch(/update public\.jobs[\s\S]+row_version = v_job\.row_version \+ 1/);
  expect(sql).toContain("'job.scope_changed'");
  expect(sql).toContain("'operational.job.scope_changed'");
  expect(sql).toContain("jsonb_build_object('job_id'");
  expect(sql).not.toContain("jsonb_build_object('record'");
});

test('grants checked execution without browser table writes', () => {
  const sql = migration();
  expect(sql).toContain('grant execute on function public.ftf_write_job_scope');
  expect(sql).toContain('to service_role');
  expect(sql).not.toMatch(/grant\s+(insert|update|delete).*job_fields.*authenticated/i);
});
