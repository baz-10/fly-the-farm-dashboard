const fs = require('fs');
const path = require('path');

test('Property address provenance is constrained and retained by trusted writes', () => {
  const migrationPath = path.join(__dirname, '../../supabase/migrations/20260804070000_property_address_source.sql');
  expect(fs.existsSync(migrationPath)).toBe(true);
  const sql = fs.readFileSync(migrationPath, 'utf8').replace(/\s+/g, ' ').toLowerCase();
  expect(sql).toContain("address_source text not null default 'manual'");
  expect(sql).toMatch(/address_source in \('geocoded',\s*'manual'\)/);
  expect(sql).toContain('ftf.property.address_source');
  expect(sql).toContain("p_data->>'addresssource'");
});
