const fs = require('fs');
const path = require('path');

const migrationPath = path.join(__dirname, '../../supabase/migrations/20260809135000_operating_location_confirmation.sql');

test('adds authoritative Base location evidence without weakening trusted writes', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  for (const column of ['latitude', 'longitude', 'address_source', 'location_confirmed_at']) {
    expect(sql).toContain(column);
  }
  expect(sql).toMatch(/rename\s+to\s+ftf_write_operational_resource_without_base_confirmation/i);
  expect(sql).toMatch(/grant execute on function public\.ftf_write_operational_resource\([\s\S]*?\) to service_role/i);
  expect(sql).toMatch(/revoke all on function public\.ftf_write_operational_resource_without_base_confirmation\([\s\S]*?\) from public, anon, authenticated, service_role/i);
  expect(sql).toMatch(/address_source[^;]+ADDRESS_SEARCH[^;]+MANUALLY_ADJUSTED/i);
});
