// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'vite';

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

async function findProductionPatterns(root: string, pattern: RegExp): Promise<string[]> {
  const offenders: string[] = [];

  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (
        /\.(?:[cm]?[jt]sx?|html|css)$/.test(entry.name) &&
        !/\.test\.[jt]sx?$/.test(entry.name) &&
        pattern.test(await readFile(entryPath, 'utf8'))
      ) {
        offenders.push(entryPath);
      }
    }
  }

  await visit(root);
  return offenders.sort();
}

async function findEmittedPatterns(root: string, pattern: RegExp): Promise<string[]> {
  const offenders: string[] = [];

  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (
        /\.(?:js|css|html)$/.test(entry.name) &&
        pattern.test(await readFile(entryPath, 'utf8'))
      ) {
        offenders.push(entryPath);
      }
    }
  }

  await visit(root);
  return offenders.sort();
}

function countDeclaredTests(source: string): number {
  return Array.from(
    source.matchAll(/\b(?:it|test)(?:\.(?:each|skip|only|todo))?\s*\(/g)
  ).length;
}

describe('test inventory', () => {
  it('keeps Safety Plan production guidance remote and service-role-only', async () => {
    const deployment = await readFile('docs/production-deployment.md', 'utf8');
    const playwright = await readFile('playwright.config.ts', 'utf8');

    expect(deployment).toContain('VITE_PERSISTENCE_MODE=remote');
    expect(deployment).toContain('Do **not** add `anon` or `authenticated` Supabase Storage policies');
    expect(deployment).toContain('Apply the base Supabase migration');
    expect(playwright).toContain("VITE_PERSISTENCE_MODE: 'remote'");
  });

  it('tracks the exact Safety Plan release-gate supplements outside src', async () => {
    const releaseGateSupplements: Record<string, number> = {
      'e2e/safety-plan-workflow.spec.ts': 6,
      'server/localApiMiddleware.test.ts': 11,
    };
    const actual = Object.fromEntries(
      await Promise.all(
        Object.keys(releaseGateSupplements).map(async (file) => [
          file,
          countDeclaredTests(await readFile(file, 'utf8')),
        ])
      )
    );

    expect(actual).toEqual(releaseGateSupplements);
  });

  it('preserves the exact accepted baseline and explicit migration supplements', async () => {
    const inventory = await collectTestInventory('src');
    const manifest = JSON.parse(
      await readFile('scripts/test-baseline-manifest.json', 'utf8')
    );
    const baseline = manifest.declaredTestsByFile as Record<string, number>;
    const approvedDeltas = manifest.approvedDeclarationDeltas as Record<string, number>;
    const supplements = manifest.supplementaryTestsByFile as Record<string, number>;
    const expectedCurrentBaseline = Object.fromEntries(
      Object.entries(baseline).map(([file, count]) => [
        file,
        count + (approvedDeltas[file] ?? 0),
      ])
    );
    const explicitPostBaselineSupplements: Record<string, number> = {
      ...supplements,
      'src/App.safetyPlanProvider.test.tsx': 1,
      'src/__tests__/authenticated-safety-plan-api.test.ts': 86,
      'src/components/safety-plan/JobSafetyPlanCard.test.tsx': 6,
      'src/__tests__/safety-plan-authority-api.test.ts': 2,
      'src/components/safety-plan/SafetyPlanAuthorityManager.test.tsx': 2,
      'src/components/safety-plan/SafetyPlanApprovalPanel.test.tsx': 6,
      'src/components/safety-plan/SafetyPlanAttachments.test.tsx': 5,
      'src/contexts/__tests__/SafetyPlanContext.test.tsx': 30,
      'src/pages/JobDetail.test.tsx': 4,
      'src/pages/SafetyPlanRegister.test.tsx': 3,
      'src/pages/SafetyPlanEditor.test.tsx': 13,
      'src/pages/SafetyPlanTemplateEditor.test.tsx': 2,
      'src/services/__tests__/persistence.safetyPlan.test.ts': 9,
      'src/services/__tests__/safetyPlanRepository.test.ts': 15,
      'src/services/__tests__/safetyPlanTemplateRepository.test.ts': 3,
      'src/services/__tests__/safetyPlanPrefill.test.ts': 4,
      'src/services/__tests__/safetyPlanApproval.test.ts': 11,
      'src/services/__tests__/safetyPlanAttachments.test.ts': 3,
      'src/utils/__tests__/safetyPlanPermissions.test.ts': 5,
      'src/utils/__tests__/safetyPlanRules.test.ts': 10,
      'src/utils/__tests__/safetyPlanSourceSync.test.ts': 11,
      'src/utils/__tests__/safetyPlanPdf.test.ts': 7,
    };
    const supplementaryCounts = Object.fromEntries(
      await Promise.all(
        Object.keys(explicitPostBaselineSupplements).map(async (file) => [
          file,
          countDeclaredTests(await readFile(file, 'utf8')),
        ])
      )
    );

    expect(manifest.sourceCommit).toBe('52e6ace');
    expect(manifest.runtimeBaseline).toEqual({ suites: 56, tests: 224 });
    expect(Object.keys(baseline)).toHaveLength(56);
    expect(Object.values(baseline).reduce((total: number, count: number) => total + count, 0))
      .toBe(219);
    expect(inventory.testsByFile).toEqual(expectedCurrentBaseline);
    expect(inventory.files).toEqual(Object.keys(baseline).sort());
    expect(inventory.supplementaryFiles).toEqual(Object.keys(explicitPostBaselineSupplements).sort());
    expect(supplementaryCounts).toEqual(explicitPostBaselineSupplements);
    expect(inventory.files.length + inventory.supplementaryFiles.length).toBe(81);
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

  it('keeps the final client dependency and source surface migration-clean', async () => {
    const pkg = JSON.parse(await readFile('package.json', 'utf8'));

    expect(pkg.dependencies?.['react-scripts']).toBeUndefined();
    expect(pkg.devDependencies?.['@types/jest']).toBeUndefined();
    expect(pkg.dependencies?.['react-router-dom']).toMatch(/^\^7/);
    expect(
      await findProductionPatterns(
        'src',
        /process\.env\.REACT_APP_|%PUBLIC_URL%|react-router(?:-dom)?\/dist/
      )
    ).toEqual([]);
  });

  it('does not emit server secret names into a clean production client bundle', async () => {
    const outputRoot = await realpath(
      await mkdtemp(path.join(tmpdir(), 'ftf-final-secret-audit-'))
    );
    const outputDirectory = path.join(outputRoot, 'dist');
    const originalViteSecret = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
    const originalCraSecret = process.env.REACT_APP_ANTHROPIC_API_KEY;
    const viteSentinel = 'final-audit-vite-service-role-secret';
    const craSentinel = 'final-audit-cra-anthropic-secret';

    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY = viteSentinel;
    process.env.REACT_APP_ANTHROPIC_API_KEY = craSentinel;

    try {
      await build({
        configFile: path.resolve(process.cwd(), 'vite.config.ts'),
        build: {
          emptyOutDir: true,
          outDir: outputDirectory,
        },
        logLevel: 'silent',
      });

      const secretPattern =
        /SUPABASE_SERVICE_ROLE_KEY|ANTHROPIC_API_KEY|final-audit-(?:vite|cra)-/;
      expect(await findEmittedPatterns(outputDirectory, secretPattern)).toEqual([]);

      const injectedOutput = path.join(outputDirectory, 'audit-injected-secret.js');
      await writeFile(injectedOutput, 'const leaked = "ANTHROPIC_API_KEY";');
      expect(await findEmittedPatterns(outputDirectory, secretPattern)).toEqual([
        injectedOutput,
      ]);
    } finally {
      if (originalViteSecret === undefined) {
        delete process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
      } else {
        process.env.VITE_SUPABASE_SERVICE_ROLE_KEY = originalViteSecret;
      }
      if (originalCraSecret === undefined) {
        delete process.env.REACT_APP_ANTHROPIC_API_KEY;
      } else {
        process.env.REACT_APP_ANTHROPIC_API_KEY = originalCraSecret;
      }
      await rm(outputRoot, { recursive: true, force: true });
    }
  }, 30_000);
});
