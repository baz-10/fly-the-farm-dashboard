const path = require('path');
const { execFileSync } = require('child_process');

test('provisions server-only legacy runtime tables with tenant integrity', () => {
  const runner = path.resolve(__dirname, '../../scripts/verifyLegacyRuntimeMigration.mjs');

  expect(() => execFileSync(process.execPath, [runner], { stdio: 'pipe' })).not.toThrow();
});
