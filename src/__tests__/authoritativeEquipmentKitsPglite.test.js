const path = require('path');
const { execFileSync } = require('child_process');

test('applies and exercises authoritative Equipment Kit persistence and assignment integrity in PostgreSQL', () => {
  const runner = path.resolve(__dirname, '../../scripts/verifyAuthoritativeEquipmentKitsMigration.mjs');

  expect(() => execFileSync(process.execPath, [runner], { stdio: 'pipe' })).not.toThrow();
});
