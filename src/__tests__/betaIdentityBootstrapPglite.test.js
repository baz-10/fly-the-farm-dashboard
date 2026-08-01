const path = require('path');
const { execFileSync } = require('child_process');

test('bootstraps Production Beta identity and access atomically and idempotently', () => {
  const runner = path.resolve(__dirname, '../../scripts/verifyBetaIdentityBootstrap.mjs');

  expect(() => execFileSync(process.execPath, [runner], { stdio: 'pipe' })).not.toThrow();
});
