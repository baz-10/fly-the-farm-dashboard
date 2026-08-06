const path = require('path');
const { execFileSync } = require('child_process');

test('archives an inactive Property while retaining immutable boundary history', () => {
  const runner = path.resolve(__dirname, '../../scripts/verifyOperationalArchiveHistoricalEvidence.mjs');
  expect(() => execFileSync(process.execPath, [runner], { stdio: 'pipe' })).not.toThrow();
});
