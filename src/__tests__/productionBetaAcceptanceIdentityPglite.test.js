const { execFileSync } = require('child_process');
const path = require('path');

test('reconciles and enforces the dedicated acceptance identity in PostgreSQL', () => {
  const runner = path.resolve(__dirname, '../../scripts/verifyProductionBetaAcceptanceIdentity.mjs');
  expect(() => execFileSync(process.execPath, [runner], { stdio: 'pipe' })).not.toThrow();
});
