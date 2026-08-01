const path = require('path');
const { execFileSync } = require('child_process');

test('applies and exercises the live-chain backend migration in PostgreSQL', () => {
  const runner = path.resolve(__dirname, '../../scripts/verifyLiveChainBackendMigration.mjs');

  expect(() => execFileSync(process.execPath, [runner], { stdio: 'pipe' })).not.toThrow();
});
