const path = require('path');
const { execFileSync } = require('child_process');

test('applies and exercises authoritative Personnel persistence in PostgreSQL', () => {
  const runner = path.resolve(__dirname, '../../scripts/verifyAuthoritativePersonnelMigration.mjs');
  expect(() => execFileSync(process.execPath, [runner], { stdio: 'pipe' })).not.toThrow();
});
