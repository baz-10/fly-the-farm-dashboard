import { spawnSync } from 'child_process';
import path from 'path';

describe('product maturity CI boundary', () => {
  test('verifies every classified module and workflow without a customer-facing Legacy violation', () => {
    const result = spawnSync(process.execPath, ['scripts/verifyProductMaturityRegistry.mjs'], {
      cwd: path.resolve(process.cwd()),
      encoding: 'utf8',
      env: {},
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('46 modules and 9 workflows classified');
    expect(result.stdout).toContain('0 customer-facing Legacy violations');
  });
});
