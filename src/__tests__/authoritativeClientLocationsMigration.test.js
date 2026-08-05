const fs = require('fs');
const path = require('path');

test('client locations are repository-controlled authoritative JSON with provenance', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/20260806070000_authoritative_client_locations.sql'), 'utf8');
  expect(sql).toMatch(/add column addresses jsonb not null default '\[\]'::jsonb/i);
  expect(sql).toMatch(/coordinateSource/);
  expect(sql).toMatch(/locationConfirmedAt/);
  expect(sql).toMatch(/ftf\.client\.addresses/);
  expect(sql).not.toMatch(/disable row level security/i);
});
