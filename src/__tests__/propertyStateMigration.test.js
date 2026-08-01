const fs = require('fs');
const path = require('path');

const migrationPath = path.resolve(
  __dirname,
  '../../supabase/migrations/20260801005000_property_state.sql'
);

test('forward migration adds constrained property state without a guessed default', () => {
  const migration = fs.readFileSync(migrationPath, 'utf8').replace(/\s+/g, ' ').toLowerCase();
  expect(migration).toContain('add column state text');
  expect(migration).toMatch(/state in \('nsw', 'vic', 'qld', 'sa', 'wa', 'tas', 'nt', 'act'\)/);
  expect(migration).not.toMatch(/state text[^;]*default/);
  expect(migration).toContain("p_data->>'state'");
});
