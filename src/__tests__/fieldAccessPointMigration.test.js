const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/20260904170000_field_access_point_authority.sql'), 'utf8');

test('adds an optional all-or-none confirmed Field access point through checked authority', () => {
  for (const column of ['access_point_label', 'access_latitude', 'access_longitude', 'access_coordinate_source', 'access_location_confirmed_at']) {
    expect(sql).toContain(column);
  }
  expect(sql).toMatch(/num_nonnulls\([\s\S]*?\) in \(0, 5\)/i);
  expect(sql).toMatch(/access_coordinate_source in \('PROPERTY_SUGGESTED','MANUALLY_ADJUSTED'\)/i);
  expect(sql).toMatch(/access_latitude between -90 and 90/i);
  expect(sql).toMatch(/access_longitude between -180 and 180/i);
  expect(sql).toMatch(/p_resource = 'fields'/i);
  expect(sql).toMatch(/set_config\('ftf\.field\.access_point_present', 'false', true\)/i);
});

test('does not broaden Field or table privileges', () => {
  expect(sql).not.toMatch(/grant\s+(select|insert|update|delete|all).*fields/i);
  expect(sql).not.toMatch(/disable\s+row\s+level\s+security/i);
  expect(sql).toMatch(/revoke all on function public\.ftf_apply_field_access_point_metadata\(\)/i);
});
