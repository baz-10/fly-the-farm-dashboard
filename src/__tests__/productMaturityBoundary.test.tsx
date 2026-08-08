import { readFileSync, writeFileSync } from 'fs';
import { spawnSync, SpawnSyncReturns } from 'child_process';
import path from 'path';

const root = path.resolve(process.cwd());
const registryPath = path.join(root, 'src/productMaturity/product-maturity-registry.json');
const surfacesPath = path.join(root, 'src/productMaturity/surfaces.ts');
const navigationPath = path.join(root, 'src/navigation/organisationNavigation.tsx');

const runVerifier = (): SpawnSyncReturns<string> => spawnSync(process.execPath, ['scripts/verifyProductMaturityRegistry.mjs'], {
  cwd: root,
  encoding: 'utf8',
  env: {},
});

const withTemporarySource = (filePath: string, mutate: (source: string) => string, assertion: () => void): void => {
  const original = readFileSync(filePath, 'utf8');
  const modified = mutate(original);
  if (modified === original) throw new Error(`Fixture mutation did not change ${filePath}.`);

  writeFileSync(filePath, modified, 'utf8');
  try {
    assertion();
  } finally {
    writeFileSync(filePath, original, 'utf8');
  }
};

const expectVerifierFailure = (expectedMessage: string): void => {
  const result = runVerifier();

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
    expect(result.stdout).toContain('46 modules and 9 workflows classified');
    expect(result.stdout).toContain('0 customer-facing Legacy violations');
  });

  test('fails closed when a reachable route lacks an exact registry key', () => {
    withTemporarySource(surfacesPath, (source) => source.replace(
      "{ path: '/login', moduleCode: 'authentication', workflowCode: null },",
      "{ path: '/login', moduleCode: 'unregistered-module', workflowCode: null },",
    ), () => expectVerifierFailure('does not have an exact registry entry'));
  });

  test('fails closed when a query-driven surface lacks an exact registry key', () => {
    withTemporarySource(surfacesPath, (source) => source.replace(
      "routePattern: '/jobs',\n    moduleCode: 'properties',\n    workflowCode: null,",
      "routePattern: '/jobs',\n    moduleCode: 'unregistered-query-module',\n    workflowCode: null,",
    ), () => expectVerifierFailure('does not have an exact registry entry'));
  });

  test('allows a Commercially Ready entry with no promotion blockers when Founder approval is present', () => {
    withTemporarySource(registryPath, (source) => {
      const registry = JSON.parse(source);
      registry[0] = {
        ...registry[0],
        maturity: 'COMMERCIALLY_READY',
        promotionBlockers: [],
        evidence: [...registry[0].evidence, 'Founder approval recorded in release decision.'],
      };
      return JSON.stringify(registry, null, 2);
    }, () => {
      const result = runVerifier();

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
    });
  });

  test('retains Founder approval as a requirement for Commercially Ready entries', () => {
    withTemporarySource(registryPath, (source) => {
      const registry = JSON.parse(source);
      registry[0] = { ...registry[0], maturity: 'COMMERCIALLY_READY', promotionBlockers: [] };
      return JSON.stringify(registry, null, 2);
    }, () => expectVerifierFailure('needs explicit Founder approval evidence'));
  });

  test('rejects lowercase legacy language in registry customer-facing names', () => {
    withTemporarySource(registryPath, (source) => {
      const registry = JSON.parse(source);
      registry[0] = { ...registry[0], customerName: 'legacy Authentication' };
      return JSON.stringify(registry, null, 2);
    }, () => expectVerifierFailure('invalid customer-facing name'));
  });

  test('rejects lowercase legacy language in customer-facing navigation', () => {
    withTemporarySource(navigationPath, (source) => source.replace(
      "{ label: 'Clients'",
      "{ label: 'legacy Clients'",
    ), () => expectVerifierFailure('Customer-facing Legacy violation'));
  });
});
