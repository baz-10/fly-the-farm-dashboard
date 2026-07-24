import { describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { collectTestInventory } from './test-inventory.mjs';

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

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
  it('discovers the complete source test file inventory', async () => {
    const inventory = await collectTestInventory('src');

    expect(inventory.files).toHaveLength(57);
    expect(inventory.declaredTests).toBe(224);
    expect(inventory.files).toContain('src/services/__tests__/persistence.test.ts');
    expect(inventory.files).toContain('src/App.test.tsx');
    expect(inventory.files).toContain('src/__tests__/route-manifest.test.tsx');
    expect(inventory.supplementaryFiles).toEqual([
      'src/config/environment.build.test.ts',
      'src/config/environment.test.ts',
    ]);
  });

  it('contains no Jest runtime API in migrated React tests', async () => {
    const offenders = await findPatterns('src', /\bjest\.(fn|mock|spyOn|useFakeTimers|resetModules)\b|jest\.Mock/);
    expect(offenders).toEqual([]);
  });

  it('has no Create React App runtime or configuration', async () => {
    const pkg = JSON.parse(await readFile('package.json', 'utf8'));

    expect(pkg.dependencies?.['react-scripts']).toBeUndefined();
    expect(pkg.dependencies?.['@types/jest']).toBeUndefined();
    expect(pkg.devDependencies?.['@types/jest']).toBeUndefined();
    expect(pkg.eslintConfig).toBeUndefined();
    expect(pkg.scripts).toMatchObject({
      dev: 'vite',
      start: 'vite',
      build: 'tsc --noEmit && vite build',
      preview: 'vite preview',
      test: 'vitest run',
      'test:watch': 'vitest',
      'test:coverage': 'vitest run --coverage',
      'test:e2e': 'playwright test',
    });
    expect(await pathExists('src/setupProxy.js')).toBe(false);
    expect(await pathExists('src/react-app-env.d.ts')).toBe(false);
    expect(await pathExists('public/index.html')).toBe(false);
  });
});
