const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/20260806110000_property_location_confirmation.sql'), 'utf8');

test('retains confirmed Property location evidence without guessing historical confirmation', () => {
  expect(sql).toContain('add column postcode text');
  expect(sql).toContain('add column location_confirmed_at timestamptz');
  expect(sql).toContain("'location_confirmed_at'");
  expect(sql).toContain("p_data ? 'address_source'");
  expect(sql).not.toMatch(/update public\.properties[\s\S]*location_confirmed_at/i);
});
