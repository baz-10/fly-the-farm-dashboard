const path = require('path');
const { execFileSync } = require('child_process');

test('separates platform identities without implicit tenant access', () => {
  const runner = path.resolve(__dirname, '../../scripts/verifyPlatformIdentitySupportPostgres.mjs');
  expect(() => execFileSync(process.execPath, [runner], { stdio: 'pipe' })).not.toThrow();
});
