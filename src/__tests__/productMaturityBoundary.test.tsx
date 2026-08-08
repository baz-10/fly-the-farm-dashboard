import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { spawnSync, SpawnSyncReturns } from 'child_process';
import { tmpdir } from 'os';
import path from 'path';

const root = path.resolve(process.cwd());
const fixturePaths = [
  'src/productMaturity/product-maturity-registry.json',
  'src/productMaturity/surfaces.ts',
  'src/App.tsx',
  'src/pages',
  'src/components',
  'src/navigation',
];
const registryFixture = JSON.parse(readFileSync(
  path.join(root, 'src/productMaturity/product-maturity-registry.json'),
  'utf8',
));
const evidenceFixturePaths = Array.from(new Set<string>(
  registryFixture.flatMap((entry: { evidence: string[] }) => entry.evidence),
));

const runVerifier = (fixtureRoot?: string): SpawnSyncReturns<string> => spawnSync(process.execPath, [
  'scripts/verifyProductMaturityRegistry.mjs',
  ...(fixtureRoot ? ['--root', fixtureRoot] : []),
], {
  cwd: root,
  encoding: 'utf8',
  env: {},
});

const fixturePath = (fixtureRoot: string, relativePath: string): string => path.join(fixtureRoot, relativePath);

const copyFixtureSource = (fixtureRoot: string, relativePath: string): void => {
  const repositoryRoot = realpathSync(root);
  const source = path.resolve(root, relativePath);
  const lexicalRelativeSource = path.relative(root, source);
  if (lexicalRelativeSource === '..' || lexicalRelativeSource.startsWith(`..${path.sep}`) || path.isAbsolute(lexicalRelativeSource)) {
    throw new Error(`Fixture source path must stay within the repository: ${relativePath}`);
  }
  if (!existsSync(source)) return;

  const realSource = realpathSync(source);
  const realRelativeSource = path.relative(repositoryRoot, realSource);
  if (realRelativeSource === '..' || realRelativeSource.startsWith(`..${path.sep}`) || path.isAbsolute(realRelativeSource)) {
    throw new Error(`Fixture source path must resolve within the repository: ${relativePath}`);
  }

  const destination = fixturePath(fixtureRoot, relativePath);
  mkdirSync(path.dirname(destination), { recursive: true });
  if (!existsSync(destination)) cpSync(realSource, destination, { recursive: true });
};

const withTemporaryFixture = (
  mutate: (fixtureRoot: string) => void,
  assertion: (fixtureRoot: string) => void,
  additionalFixturePaths: string[] = [],
): void => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'product-maturity-registry-'));

  try {
    [...fixturePaths, ...evidenceFixturePaths, ...additionalFixturePaths]
      .forEach((relativePath) => copyFixtureSource(fixtureRoot, relativePath));
    mutate(fixtureRoot);
    assertion(fixtureRoot);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
};

const replaceFixtureSource = (fixtureRoot: string, relativePath: string, find: string, replace: string): void => {
  const filePath = fixturePath(fixtureRoot, relativePath);
  const source = readFileSync(filePath, 'utf8');
  const modified = source.replace(find, replace);
  if (modified === source) throw new Error(`Fixture mutation did not change ${relativePath}.`);
  writeFileSync(filePath, modified, 'utf8');
};

const updateFixtureRegistry = (fixtureRoot: string, update: (registry: any[]) => void): void => {
  const filePath = fixturePath(fixtureRoot, 'src/productMaturity/product-maturity-registry.json');
  const registry = JSON.parse(readFileSync(filePath, 'utf8'));
  update(registry);
  writeFileSync(filePath, JSON.stringify(registry, null, 2), 'utf8');
};

const expectVerifierSuccess = (fixtureRoot: string): void => {
  const result = runVerifier(fixtureRoot);
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
};

const expectVerifierFailure = (expectedMessage: string, fixtureRoot: string): void => {
  const result = runVerifier(fixtureRoot);

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(expectedMessage);
};

describe('product maturity CI boundary', () => {
  test('verifies every classified module and workflow without a customer-facing Legacy violation', () => {
    const result = runVerifier();

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('46 modules and 12 workflows classified');
    expect(result.stdout).toContain('116 customer UI source files checked');
    expect(result.stdout).toContain('64 evidence references checked');
    expect(result.stdout).toContain('0 customer-facing Legacy violations');
  });

  test('fails closed when a reachable route lacks an exact registry key', () => {
    withTemporaryFixture((fixtureRoot) => replaceFixtureSource(
      fixtureRoot,
      'src/productMaturity/surfaces.ts',
      "{ path: '/login', moduleCode: 'authentication', workflowCode: null },",
      "{ path: '/login', moduleCode: 'unregistered-module', workflowCode: null },",
    ), (fixtureRoot) => expectVerifierFailure('does not have an exact registry entry', fixtureRoot));
  });

  test('fails closed when a query-driven surface lacks an exact registry key', () => {
    withTemporaryFixture((fixtureRoot) => replaceFixtureSource(
      fixtureRoot,
      'src/productMaturity/surfaces.ts',
      "routePattern: '/jobs',\n    moduleCode: 'properties',\n    workflowCode: null,",
      "routePattern: '/jobs',\n    moduleCode: 'unregistered-query-module',\n    workflowCode: null,",
    ), (fixtureRoot) => expectVerifierFailure('does not have an exact registry entry', fixtureRoot));
  });

  test('allows a Commercially Ready entry with no promotion blockers when Founder approval is present', () => {
    withTemporaryFixture((fixtureRoot) => updateFixtureRegistry(fixtureRoot, (registry) => {
      const approvalPath = fixturePath(fixtureRoot, 'docs/commercial-release-decision.md');
      mkdirSync(path.dirname(approvalPath), { recursive: true });
      writeFileSync(approvalPath, '# Founder approval\n', 'utf8');
      registry[0] = {
        ...registry[0],
        maturity: 'COMMERCIALLY_READY',
        promotionBlockers: [],
        founderApproval: {
          status: 'APPROVED',
          approverRole: 'Founder',
          decision: 'Approved for commercial release.',
          reference: 'docs/commercial-release-decision.md',
        },
      };
    }), (fixtureRoot) => {
      const result = runVerifier(fixtureRoot);

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
    });
  });

  test('retains Founder approval as a requirement for Commercially Ready entries', () => {
    withTemporaryFixture((fixtureRoot) => updateFixtureRegistry(fixtureRoot, (registry) => {
      registry[0] = { ...registry[0], maturity: 'COMMERCIALLY_READY', promotionBlockers: [] };
    }), (fixtureRoot) => expectVerifierFailure('needs explicit structured Founder approval', fixtureRoot));
  });

  test('rejects lowercase legacy language in registry customer-facing names', () => {
    withTemporaryFixture((fixtureRoot) => updateFixtureRegistry(fixtureRoot, (registry) => {
      registry[0] = { ...registry[0], customerName: 'legacy Authentication' };
    }), (fixtureRoot) => expectVerifierFailure('invalid customer-facing name', fixtureRoot));
  });

  test('rejects lowercase legacy language in customer-facing navigation', () => {
    withTemporaryFixture((fixtureRoot) => replaceFixtureSource(
      fixtureRoot,
      'src/navigation/organisationNavigation.tsx',
      "{ label: 'Clients'",
      "{ label: 'legacy Clients'",
    ), (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
  });

  test('rejects customer-facing legacy language in any production UI source', () => {
    withTemporaryFixture((fixtureRoot) => replaceFixtureSource(
      fixtureRoot,
      'src/pages/ClientDetail.tsx',
      'All Clients',
      'legacy Clients',
    ), (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
  });

  test('ignores comments and internal string literals that are not supplied to rendered UI', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(filePath, `${source}\n// legacy migration note\nconst internalMigrationKey = 'legacy-record';\n`, 'utf8');
    }, expectVerifierSuccess);
  });

  test('rejects an imported string when a production UI source renders it', () => {
    withTemporaryFixture((fixtureRoot) => {
      const copyPath = fixturePath(fixtureRoot, 'src/customerCopy.ts');
      writeFileSync(copyPath, "export const clientHeading = 'legacy Client Records';\n", 'utf8');
      replaceFixtureSource(
        fixtureRoot,
        'src/pages/ClientDetail.tsx',
        "import React, { useState } from 'react';",
        "import React, { useState } from 'react';\nimport { clientHeading } from '../customerCopy';",
      );
      replaceFixtureSource(fixtureRoot, 'src/pages/ClientDetail.tsx', 'All Clients', '{clientHeading}');
    }, (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
  });

  test('fails closed when an evidence reference does not exist', () => {
    withTemporaryFixture((fixtureRoot) => updateFixtureRegistry(fixtureRoot, (registry) => {
      registry[0] = { ...registry[0], evidence: ['src/pages/NotARealEvidence.tsx'] };
    }), (fixtureRoot) => expectVerifierFailure('evidence reference does not exist', fixtureRoot));
  });

  test('fails closed when an evidence reference leaves the repository root', () => {
    withTemporaryFixture((fixtureRoot) => updateFixtureRegistry(fixtureRoot, (registry) => {
      registry[0] = { ...registry[0], evidence: ['../outside-evidence.md'] };
    }), (fixtureRoot) => expectVerifierFailure('evidence reference must be a repository-relative path', fixtureRoot));
  });

  test('fails closed when an evidence symlink resolves outside the repository root', () => {
    const outsideRoot = mkdtempSync(path.join(tmpdir(), 'product-maturity-evidence-outside-'));
    try {
      const outsideEvidence = path.join(outsideRoot, 'decision.md');
      writeFileSync(outsideEvidence, '# External decision\n', 'utf8');
      withTemporaryFixture((fixtureRoot) => {
        const linkPath = fixturePath(fixtureRoot, 'docs/evidence-link.md');
        mkdirSync(path.dirname(linkPath), { recursive: true });
        symlinkSync(outsideEvidence, linkPath);
        updateFixtureRegistry(fixtureRoot, (registry) => {
          registry[0] = { ...registry[0], evidence: ['docs/evidence-link.md'] };
        });
      }, (fixtureRoot) => expectVerifierFailure('evidence reference resolves outside the repository', fixtureRoot));
    } finally {
      rmSync(outsideRoot, { recursive: true, force: true });
    }
  });

  test('rejects fixture evidence paths outside the repository before copying them', () => {
    expect(() => withTemporaryFixture(() => undefined, () => undefined, ['../package.json']))
      .toThrow('Fixture source path must stay within the repository');
  });
});
