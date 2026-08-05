const fs = require('fs');
const path = require('path');

const migrationPath = path.join(
  __dirname,
  '../../supabase/migrations/20260805093000_platform_trusted_server_privileges.sql',
);

function migration() {
  return fs.readFileSync(migrationPath, 'utf8').toLowerCase().replace(/\s+/g, ' ');
}

describe('Platform trusted-server least-privilege migration', () => {
  test('grants identity resolution read access only through the five ownership tables', () => {
    const sql = migration();
    expect(sql).toContain(
      'grant select on table public.platform_users, public.platform_user_roles, public.platform_roles, public.platform_role_permissions, public.platform_permissions to service_role;',
    );
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all)[^;]*platform_(users|user_roles|roles|role_permissions|permissions)/);
  });

  test('grants Assisted Support read access only to tables queried by the trusted repository', () => {
    const sql = migration();
    expect(sql).toContain(
      'grant select on table public.support_requests, public.support_approval_events, public.support_sessions to service_role;',
    );
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all)[^;]*support_(requests|approval_events|sessions)/);
  });

  test('does not expose evidence or notification tables directly to the trusted server', () => {
    const sql = migration();
    for (const table of [
      'platform_audit_events',
      'platform_transactional_outbox',
      'support_activity_events',
      'organisation_notifications',
      'audit_events',
      'transactional_outbox',
    ]) {
      expect(sql).not.toMatch(new RegExp(`grant\\s+[^;]*on\\s+table\\s+[^;]*${table}[^;]*to\\s+service_role`));
    }
  });

  test('keeps RLS enabled and denies browser-facing roles', () => {
    const sql = migration();
    for (const table of [
      'platform_users',
      'platform_user_roles',
      'platform_roles',
      'platform_role_permissions',
      'platform_permissions',
      'support_requests',
      'support_approval_events',
      'support_sessions',
    ]) {
      expect(sql).toContain(`alter table public.${table} enable row level security;`);
    }
    expect(sql).toContain('revoke all on table');
    expect(sql).toContain('from public, anon, authenticated;');
  });
});
