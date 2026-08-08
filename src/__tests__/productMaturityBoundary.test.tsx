import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
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

const withTemporaryFixture = (mutate: (fixtureRoot: string) => void, assertion: (fixtureRoot: string) => void): void => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'product-maturity-registry-'));

  [...fixturePaths, ...evidenceFixturePaths].forEach((relativePath) => {
    const source = path.join(root, relativePath);
    if (!existsSync(source)) return;
    const destination = fixturePath(fixtureRoot, relativePath);
    mkdirSync(path.dirname(destination), { recursive: true });
    if (!existsSync(destination)) cpSync(source, destination, { recursive: true });
  });

  try {
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
    expect(result.stdout).toContain('61 evidence references checked');
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
      const approvalPath = fixturePath(fixtureRoot, 'docs/founder-approval.md');
      mkdirSync(path.dirname(approvalPath), { recursive: true });
      writeFileSync(approvalPath, '# Founder approval\n', 'utf8');
      registry[0] = {
        ...registry[0],
        maturity: 'COMMERCIALLY_READY',
        promotionBlockers: [],
        evidence: [...registry[0].evidence, 'docs/founder-approval.md'],
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
    }), (fixtureRoot) => expectVerifierFailure('needs explicit Founder approval evidence', fixtureRoot));
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
});
