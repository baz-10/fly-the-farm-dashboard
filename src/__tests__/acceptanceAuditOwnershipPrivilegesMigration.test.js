const fs = require('fs');
const path = require('path');

const migrationPath = path.join(
  __dirname,
  '../../supabase/migrations/20260807081500_acceptance_audit_ownership_privileges.sql',
);

describe('Production Beta acceptance audit ownership privileges', () => {
  test('grants the trusted server only the audit read needed for archive ownership checks', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8').toLowerCase();

    expect(sql).toContain('grant select on table public.audit_events to service_role');
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all)/);
    expect(sql).not.toContain('disable row level security');
    expect(sql).not.toContain('no force row level security');
  });
});
