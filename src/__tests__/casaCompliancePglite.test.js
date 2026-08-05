const path = require('path');
const { execFileSync } = require('child_process');

test('applies and exercises authoritative CASA compliance persistence in PostgreSQL', () => {
  const runner = path.resolve(__dirname, '../../scripts/verifyCasaComplianceMigration.mjs');
  expect(() => execFileSync(process.execPath, [runner], { stdio: 'pipe' })).not.toThrow();
});
