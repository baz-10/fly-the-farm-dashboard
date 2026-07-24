import { describe, expect, it } from 'vitest';

import { collectTestInventory } from './test-inventory.mjs';

describe('test inventory', () => {
  it('discovers the complete pre-migration test file inventory', async () => {
    const inventory = await collectTestInventory('src');

    expect(inventory.files).toHaveLength(56);
    expect(inventory.declaredTests).toBe(219);
    expect(inventory.files).toContain('src/services/__tests__/persistence.test.ts');
    expect(inventory.files).toContain('src/App.test.tsx');
    expect(inventory.supplementaryFiles).toEqual([
      'src/config/environment.build.test.ts',
      'src/config/environment.test.ts',
    ]);
  });
});
