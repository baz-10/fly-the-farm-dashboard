const { execFileSync } = require('child_process');
const path = require('path');

test('provisions an additional Production Beta member atomically and idempotently', () => {
  const runner = path.resolve(__dirname, '../../scripts/verifyBetaMemberProvisioning.mjs');
  expect(() => execFileSync(process.execPath, [runner], { stdio: 'pipe' })).not.toThrow();
});
