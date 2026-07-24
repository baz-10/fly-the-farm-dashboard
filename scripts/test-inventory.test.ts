import { describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { collectTestInventory } from './test-inventory.mjs';

async function findPatterns(root: string, pattern: RegExp): Promise<string[]> {
  const offenders: string[] = [];

  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        // Root-level API suites migrate separately; this guard covers React suites.
        if (directory === root && entry.name === '__tests__') continue;
        await visit(entryPath);
      } else if (/\.test\.(ts|tsx)$/.test(entry.name) && pattern.test(await readFile(entryPath, 'utf8'))) {
        offenders.push(entryPath);
      }
    }
  }

  await visit(root);
  return offenders.sort();
}

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

  it('contains no Jest runtime API in migrated React tests', async () => {
    const offenders = await findPatterns('src', /\bjest\.(fn|mock|spyOn|useFakeTimers|resetModules)\b|jest\.Mock/);
    expect(offenders).toEqual([]);
  });
});
