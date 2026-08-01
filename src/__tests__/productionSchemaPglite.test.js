const path = require('path');
const { execFileSync } = require('child_process');

test('applies the production migration and rejects invalid tenant chains in PostgreSQL', () => {
  const runner = path.resolve(__dirname, '../../scripts/verifyProductionSchemaMigration.mjs');

  expect(() => execFileSync(process.execPath, [runner], { stdio: 'pipe' })).not.toThrow();
});
