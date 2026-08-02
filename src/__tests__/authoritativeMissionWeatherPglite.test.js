const { execFileSync } = require('child_process');
const path = require('path');

test('authoritative Mission Weather evidence behaves correctly in PostgreSQL', () => {
  const runner = path.resolve(__dirname, '../../scripts/verifyAuthoritativeMissionWeatherMigration.mjs');
  expect(() => execFileSync(process.execPath, [runner], { stdio: 'pipe' })).not.toThrow();
});
