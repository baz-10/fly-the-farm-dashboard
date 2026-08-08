import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { spawnSync, SpawnSyncReturns } from 'child_process';
import { tmpdir } from 'os';
import path from 'path';

const root = path.resolve(process.cwd());
const fixturePaths = [
  'src/productMaturity/product-maturity-registry.json',
  'src/productMaturity/surfaces.ts',
  'src/App.tsx',
  'src/brand',
  'src/contexts',
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
const changelogFixturePaths = Array.from(new Set<string>(
  registryFixture.map((entry: { changelogReference: string }) => entry.changelogReference),
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
    [...fixturePaths, ...evidenceFixturePaths, ...changelogFixturePaths, ...additionalFixturePaths]
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

const rewriteAdminBoundaryAlias = (
  fixtureRoot: string,
  replacementImport: string,
  aliasDeclaration: string,
  dynamic = false,
): void => {
  const filePath = fixturePath(fixtureRoot, 'src/pages/Admin.tsx');
  let source = readFileSync(filePath, 'utf8')
    .replaceAll('<WorkflowMaturityBoundary', '<Boundary')
    .replaceAll('</WorkflowMaturityBoundary', '</Boundary')
    .replace(
      "import { WorkflowMaturityBoundary } from '../components/productMaturity/WorkflowMaturityBoundary';",
      `${replacementImport}\n${aliasDeclaration}`,
    );
  if (dynamic) {
    source = source.replace('workflowCode="network-source-manager"', 'workflowCode={dynamicWorkflow}');
  }
  writeFileSync(filePath, source, 'utf8');
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
    expect(result.stdout).toContain('148 customer UI source files checked');
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

  test('discovers an unclassified App route written as a static JSX expression', () => {
    withTemporaryFixture((fixtureRoot) => replaceFixtureSource(
      fixtureRoot,
      'src/App.tsx',
      'path="/login"',
      "path={'/unclassified-login'}",
    ), (fixtureRoot) => expectVerifierFailure('App route manifest mismatch', fixtureRoot));
  });

  test.each([
    ['dynamic expression', 'path={dynamicRoutePath}', 'static string literal'],
    ['spread props', '{...dynamicRouteProps} path="/login"', 'spread attributes'],
    ['missing path', '', 'requires a path'],
  ])('fails closed on an App leaf Route with a %s', (_label, replacement, expectedMessage) => {
    withTemporaryFixture((fixtureRoot) => replaceFixtureSource(
      fixtureRoot,
      'src/App.tsx',
      'path="/login"',
      replacement,
    ), (fixtureRoot) => expectVerifierFailure(expectedMessage, fixtureRoot));
  });

  test.each([
    ['JSX string expression', "path={'/login'}"],
    ['no-substitution template', 'path={`/login`}'],
  ])('counts an exact App route written as a %s', (_label, replacement) => {
    withTemporaryFixture((fixtureRoot) => replaceFixtureSource(
      fixtureRoot,
      'src/App.tsx',
      'path="/login"',
      replacement,
    ), (fixtureRoot) => {
      const result = runVerifier(fixtureRoot);

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('53 App routes checked');
    });
  });

  test('fails closed when the reachable manifest contains an extra route', () => {
    withTemporaryFixture((fixtureRoot) => replaceFixtureSource(
      fixtureRoot,
      'src/productMaturity/surfaces.ts',
      "  { path: '/login', moduleCode: 'authentication', workflowCode: null },",
      "  { path: '/login', moduleCode: 'authentication', workflowCode: null },\n  { path: '/manifest-only', moduleCode: 'authentication', workflowCode: null },",
    ), (fixtureRoot) => expectVerifierFailure('App route manifest mismatch', fixtureRoot));
  });

  test('fails closed when App route multiplicity differs from the reachable manifest', () => {
    withTemporaryFixture((fixtureRoot) => replaceFixtureSource(
      fixtureRoot,
      'src/App.tsx',
      '        <Route path="/login" element={<Login />} />',
      '        <Route path="/login" element={<Login />} />\n        <Route path="/login" element={<Login />} />',
    ), (fixtureRoot) => expectVerifierFailure('App route manifest mismatch', fixtureRoot));
  });

  test.each([
    ['moduleCode="organisation-administration"', 'moduleCode="missing-administration"'],
    ['workflowCode="network-source-manager"', 'workflowCode="missing-source-manager"'],
  ])('fails closed when a WorkflowMaturityBoundary literal lacks an exact registry override', (find, replace) => {
    withTemporaryFixture((fixtureRoot) => replaceFixtureSource(
      fixtureRoot,
      'src/pages/Admin.tsx',
      find,
      replace,
    ), (fixtureRoot) => expectVerifierFailure('WorkflowMaturityBoundary reference', fixtureRoot));
  });

  test.each([
    ['workflowCode="network-source-manager"', '', 'missing'],
    ['workflowCode="network-source-manager"', 'workflowCode={dynamicWorkflow}', 'static string literal'],
    ['moduleCode="organisation-administration"', '{...boundaryCodes} moduleCode="organisation-administration"', 'spread'],
  ])('fails closed on %s WorkflowMaturityBoundary code props', (find, replace, expectedMessage) => {
    withTemporaryFixture((fixtureRoot) => replaceFixtureSource(
      fixtureRoot,
      'src/pages/Admin.tsx',
      find,
      replace,
    ), (fixtureRoot) => expectVerifierFailure(expectedMessage, fixtureRoot));
  });

  test('accepts a WorkflowMaturityBoundary code expressed as a static JSX string expression', () => {
    withTemporaryFixture((fixtureRoot) => replaceFixtureSource(
      fixtureRoot,
      'src/pages/Admin.tsx',
      'workflowCode="network-source-manager"',
      "workflowCode={'network-source-manager'}",
    ), expectVerifierSuccess);
  });

  test('validates dynamic props on an aliased WorkflowMaturityBoundary import', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/Admin.tsx');
      const source = readFileSync(filePath, 'utf8')
        .replaceAll('<WorkflowMaturityBoundary', '<Boundary')
        .replaceAll('</WorkflowMaturityBoundary', '</Boundary')
        .replace(
          'import { WorkflowMaturityBoundary }',
          'import { WorkflowMaturityBoundary as Boundary }',
        )
        .replace('workflowCode="network-source-manager"', 'workflowCode={dynamicWorkflow}');
      writeFileSync(filePath, source, 'utf8');
    }, (fixtureRoot) => expectVerifierFailure('exact named import', fixtureRoot));
  });

  test('rejects an aliased WorkflowMaturityBoundary import with exact static codes', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/Admin.tsx');
      const source = readFileSync(filePath, 'utf8')
        .replaceAll('<WorkflowMaturityBoundary', '<Boundary')
        .replaceAll('</WorkflowMaturityBoundary', '</Boundary')
        .replace(
          'import { WorkflowMaturityBoundary }',
          'import { WorkflowMaturityBoundary as Boundary }',
        );
      writeFileSync(filePath, source, 'utf8');
    }, (fixtureRoot) => expectVerifierFailure('exact named import', fixtureRoot));
  });

  test('fails closed when an aliased WorkflowMaturityBoundary tag is rebound', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/Admin.tsx');
      const source = readFileSync(filePath, 'utf8')
        .replaceAll('<WorkflowMaturityBoundary', '<Boundary')
        .replaceAll('</WorkflowMaturityBoundary', '</Boundary')
        .replace(
          'import { WorkflowMaturityBoundary }',
          'import { WorkflowMaturityBoundary as Boundary }',
        );
      writeFileSync(filePath, `${source}\nconst Boundary = () => null;\n`, 'utf8');
    }, (fixtureRoot) => expectVerifierFailure('exact named import', fixtureRoot));
  });

  test.each([
    [
      'multi-hop alias',
      "import { WorkflowMaturityBoundary as BoundaryBase } from '../components/productMaturity/WorkflowMaturityBoundary';",
      'const BoundaryOne = BoundaryBase;\nconst Boundary = BoundaryOne;',
    ],
    [
      'parenthesized type wrapper',
      "import { WorkflowMaturityBoundary as BoundaryBase } from '../components/productMaturity/WorkflowMaturityBoundary';",
      'const Boundary = (BoundaryBase as typeof BoundaryBase)!;',
    ],
    [
      'memo wrapper',
      "import { WorkflowMaturityBoundary as BoundaryBase } from '../components/productMaturity/WorkflowMaturityBoundary';",
      'const Boundary = React.memo(BoundaryBase);',
    ],
    [
      'namespace property assignment',
      "import * as Maturity from '../components/productMaturity/WorkflowMaturityBoundary';",
      'const Boundary = Maturity.WorkflowMaturityBoundary;',
    ],
    [
      'conditional alias',
      "import { WorkflowMaturityBoundary } from '../components/productMaturity/WorkflowMaturityBoundary';",
      'const Boundary = true ? WorkflowMaturityBoundary : WorkflowMaturityBoundary;',
    ],
  ])('rejects a %s instead of inferring a boundary alias', (_label, replacementImport, declaration) => {
    withTemporaryFixture((fixtureRoot) => rewriteAdminBoundaryAlias(
      fixtureRoot, replacementImport, declaration,
    ), (fixtureRoot) => expectVerifierFailure('WorkflowMaturityBoundary', fixtureRoot));
  });

  test('rejects a barrel re-export of the canonical boundary', () => {
    withTemporaryFixture((fixtureRoot) => {
      writeFileSync(
        fixturePath(fixtureRoot, 'src/components/productMaturity/index.ts'),
        "export { WorkflowMaturityBoundary } from './WorkflowMaturityBoundary';\n",
        'utf8',
      );
      rewriteAdminBoundaryAlias(
        fixtureRoot,
        "import { WorkflowMaturityBoundary as Boundary } from '../components/productMaturity';",
        '',
      );
    }, (fixtureRoot) => expectVerifierFailure('exported or re-exported', fixtureRoot));
  });

  test('rejects an export-star barrel in an excluded non-UI directory', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/utils/boundaryBarrel.ts');
      mkdirSync(path.dirname(filePath), { recursive: true });
      writeFileSync(
        filePath,
        "export * from '../components/productMaturity/WorkflowMaturityBoundary';\n",
        'utf8',
      );
    }, (fixtureRoot) => expectVerifierFailure('must not be exported or re-exported', fixtureRoot));
  });

  test('rejects namespace JSX use in an excluded non-UI directory', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/utils/boundaryNamespace.tsx');
      mkdirSync(path.dirname(filePath), { recursive: true });
      writeFileSync(filePath, "import * as Maturity from '../components/productMaturity/WorkflowMaturityBoundary';\nexport const BoundaryNamespace = <Maturity.WorkflowMaturityBoundary moduleCode=\"organisation-administration\" workflowCode=\"network-source-manager\">content</Maturity.WorkflowMaturityBoundary>;\n", 'utf8');
    }, (fixtureRoot) => expectVerifierFailure('exact direct named import', fixtureRoot));
  });

  test('rejects a boundary wrapper in an excluded non-UI directory', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/services/boundaryWrapper.tsx');
      mkdirSync(path.dirname(filePath), { recursive: true });
      writeFileSync(filePath, "import React from 'react';\nimport { WorkflowMaturityBoundary } from '../components/productMaturity/WorkflowMaturityBoundary';\nexport const WrappedBoundary = React.memo(WorkflowMaturityBoundary);\n", 'utf8');
    }, (fixtureRoot) => expectVerifierFailure('direct JSX tag', fixtureRoot));
  });

  test('accepts the exact direct canonical boundary convention', () => {
    withTemporaryFixture(() => undefined, expectVerifierSuccess);
  });

  test('rejects an exported wrapper added to the canonical component file', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(
        fixtureRoot,
        'src/components/productMaturity/WorkflowMaturityBoundary.tsx',
      );
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(filePath, `${source}\nexport const WrappedBoundary = React.memo(WorkflowMaturityBoundary);\n`, 'utf8');
    }, (fixtureRoot) => expectVerifierFailure('must export only its required component declaration', fixtureRoot));
  });

  test('rejects any extra named export from the canonical component file', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(
        fixtureRoot,
        'src/components/productMaturity/WorkflowMaturityBoundary.tsx',
      );
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(filePath, `${source}\nexport const OtherBoundary = () => null;\n`, 'utf8');
    }, (fixtureRoot) => expectVerifierFailure('must export only its required component declaration', fixtureRoot));
  });

  test('rejects a consumer dynamic boundary imported as an extra canonical-module export', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/Admin.tsx');
      const source = readFileSync(filePath, 'utf8')
        .replace(
          'import { WorkflowMaturityBoundary }',
          'import { WorkflowMaturityBoundary, OtherBoundary }',
        )
        .replace('<WorkflowMaturityBoundary', '<OtherBoundary')
        .replace('</WorkflowMaturityBoundary>', '</OtherBoundary>')
        .replace('workflowCode="network-source-manager"', 'workflowCode={dynamicWorkflow}');
      writeFileSync(filePath, source, 'utf8');
    }, (fixtureRoot) => expectVerifierFailure('permits only its exact named import', fixtureRoot));
  });

  test('rejects a boundary hidden behind more than 32 alias hops', () => {
    withTemporaryFixture((fixtureRoot) => {
      const declarations = Array.from({ length: 40 }, (_, index) => (
        `const Boundary${index + 1} = ${index === 0 ? 'WorkflowMaturityBoundary' : `Boundary${index}`};`
      )).join('\n');
      rewriteAdminBoundaryAlias(
        fixtureRoot,
        "import { WorkflowMaturityBoundary } from '../components/productMaturity/WorkflowMaturityBoundary';",
        `${declarations}\nconst Boundary = Boundary40;`,
      );
    }, (fixtureRoot) => expectVerifierFailure('direct JSX tag', fixtureRoot));
  });

  test('rejects a legally nested shadow with the canonical JSX tag text', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/Admin.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(filePath, `${source}\nfunction ShadowFixture() { const WorkflowMaturityBoundary = ({ children }: any) => children; return <WorkflowMaturityBoundary moduleCode="organisation-administration" workflowCode="network-source-manager">shadow</WorkflowMaturityBoundary>; }\n`, 'utf8');
    }, (fixtureRoot) => expectVerifierFailure('shadowed or unrelated', fixtureRoot));
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

  test('rejects Commercially Ready entries while promotion blockers remain', () => {
    withTemporaryFixture((fixtureRoot) => updateFixtureRegistry(fixtureRoot, (registry) => {
      const approvalPath = fixturePath(fixtureRoot, 'docs/commercial-release-decision.md');
      mkdirSync(path.dirname(approvalPath), { recursive: true });
      writeFileSync(approvalPath, '# Founder approval\n', 'utf8');
      registry[0] = {
        ...registry[0],
        maturity: 'COMMERCIALLY_READY',
        promotionBlockers: ['Complete the outstanding release recovery exercise.'],
        founderApproval: {
          status: 'APPROVED',
          approverRole: 'Founder',
          decision: 'Approved for commercial release.',
          reference: 'docs/commercial-release-decision.md',
        },
      };
    }), (fixtureRoot) => expectVerifierFailure('must not have promotion blockers', fixtureRoot));
  });

  test('rejects lowercase legacy language in registry customer-facing names', () => {
    withTemporaryFixture((fixtureRoot) => updateFixtureRegistry(fixtureRoot, (registry) => {
      registry[0] = { ...registry[0], customerName: 'legacy Authentication' };
    }), (fixtureRoot) => expectVerifierFailure('invalid customer-facing name', fixtureRoot));
  });

  test.each([
    ['moduleCode', 'Invalid.Module'],
    ['workflowCode', 'Invalid.Workflow'],
  ])('enforces the runtime lowercase code pattern for %s', (field, invalidCode) => {
    withTemporaryFixture((fixtureRoot) => updateFixtureRegistry(fixtureRoot, (registry) => {
      registry[0] = { ...registry[0], [field]: invalidCode };
    }), (fixtureRoot) => expectVerifierFailure(`invalid ${field}`, fixtureRoot));
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

  test('rejects Legacy as a substring in visible customer copy', () => {
    withTemporaryFixture((fixtureRoot) => replaceFixtureSource(
      fixtureRoot,
      'src/pages/ClientDetail.tsx',
      'All Clients',
      'LegacyReport Clients',
    ), (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
  });

  test('rejects customer-visible copy in the production brand surface', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/brand/PlatformBrand.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(filePath, `${source}\nexport const repairBrandFixture = <span>Legacy Brand</span>;\n`, 'utf8');
    }, (fixtureRoot) => expectVerifierFailure('src/brand/PlatformBrand.tsx', fixtureRoot));
  });

  test('rejects customer-visible copy in a product maturity component', () => {
    withTemporaryFixture((fixtureRoot) => {
      const relativePath = 'src/components/productMaturity/MaturityBadge.tsx';
      const filePath = fixturePath(fixtureRoot, relativePath);
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(filePath, `${source}\nexport const repairMaturityFixture = <span>LegacyReport maturity</span>;\n`, 'utf8');
    }, (fixtureRoot) => expectVerifierFailure('src/components/productMaturity/MaturityBadge.tsx', fixtureRoot));
  });

  test.each([
    ['src/App.tsx', 'Legacy App'],
    ['src/contexts/AuthContext.tsx', 'Legacy Context'],
  ])('rejects customer-rendered copy in %s', (relativePath, visibleCopy) => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, relativePath);
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(filePath, `${source}\nexport const repairUiFixture = <span>${visibleCopy}</span>;\n`, 'utf8');
    }, (fixtureRoot) => expectVerifierFailure(relativePath, fixtureRoot));
  });

  test('ignores comments and internal string literals that are not supplied to rendered UI', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(filePath, `${source}\n// legacy migration note\nconst legacyInternalMigrationKey = 'legacy-record';\nconst internalOnly = <div id="legacy-panel" className="legacy-layout" data-testid="legacy-client" />;\n`, 'utf8');
    }, expectVerifierSuccess);
  });

  test.each([
    ['showNotice', "showNotice('legacy client record');"],
    ['setNotice', "setNotice('legacy client record');"],
  ])('rejects customer-visible copy passed to %s wrappers', (_wrapperName, statement) => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(filePath, `${source}\n${statement}\n`, 'utf8');
    }, (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
  });

  test('rejects customer-visible copy in logical JSX expressions', () => {
    withTemporaryFixture((fixtureRoot) => replaceFixtureSource(
      fixtureRoot,
      'src/pages/ClientDetail.tsx',
      'All Clients',
      "{true && 'legacy Client Records'}",
    ), (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
  });

  test.each([
    ["{'Leg' + 'acy Records'}", 'concatenation'],
    ['{`Leg${"acy"} Records`}', 'template composition'],
    ["{true ? 'Leg' + 'acy Records' : 'Records'}", 'conditional composition'],
  ])('rejects visible Legacy assembled through %s', (replacement) => {
    withTemporaryFixture((fixtureRoot) => replaceFixtureSource(
      fixtureRoot,
      'src/pages/ClientDetail.tsx',
      'All Clients',
      replacement,
    ), (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
  });

  test.each([
    ['a complete array element joined into visible copy', "{['Legacy Records'].join('')}"],
    ['fragmented array elements joined into visible copy', "{['Leg', 'acy'].join('')}"],
    ['string concat', "{'Leg'.concat('acy Records')}"],
    ['array concat rendered as adjacent copy', "{['Leg'].concat('acy Records')}"],
  ])('rejects Legacy assembled through %s', (_label, replacement) => {
    withTemporaryFixture((fixtureRoot) => replaceFixtureSource(
      fixtureRoot,
      'src/pages/ClientDetail.tsx',
      'All Clients',
      replacement,
    ), (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
  });

  test.each([
    ['array identifier join', "const repairParts = ['Leg', 'acy'];\nexport const repairReceiverFixture = <span>{repairParts.join('')}</span>;"],
    ['array identifier concat', "const repairParts = ['Leg'];\nexport const repairReceiverFixture = <span>{repairParts.concat('acy')}</span>;"],
  ])('rejects Legacy assembled through an %s', (_label, fixtureSource) => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(filePath, `${source}\n${fixtureSource}\n`, 'utf8');
    }, (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
  });

  test('fails closed when a rendered join receiver has static copy but a dynamic separator', () => {
    withTemporaryFixture((fixtureRoot) => replaceFixtureSource(
      fixtureRoot,
      'src/pages/ClientDetail.tsx',
      'All Clients',
      "{['Current', ' Records'].join(dynamicSeparator)}",
    ), (fixtureRoot) => expectVerifierFailure('rendered call receiver could not be resolved safely', fixtureRoot));
  });

  test('fails closed without executing an unresolved rendered concat argument', () => {
    withTemporaryFixture((fixtureRoot) => replaceFixtureSource(
      fixtureRoot,
      'src/pages/ClientDetail.tsx',
      'All Clients',
      "{['Current Records'].concat(() => { throw new Error('must not execute'); })}",
    ), (fixtureRoot) => expectVerifierFailure('rendered call receiver could not be resolved safely', fixtureRoot));
  });

  test('ignores an unsupported receiver call that cannot flow into rendered output', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `${source}\nconst repairInternalReceiver = ['Legacy Records'].map(() => { throw new Error('must not execute'); });\n`,
        'utf8',
      );
    }, expectVerifierSuccess);
  });

  test('fails deterministically when static visible-string composition exceeds the candidate budget', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      const substitutions = '${true ? \'a\' : \'b\'}'.repeat(9);
      writeFileSync(filePath, `${source}\nexport const repairBudgetFixture = <span>{\`${substitutions}\`}</span>;\n`, 'utf8');
    }, (fixtureRoot) => expectVerifierFailure('visible-string candidate budget exceeded', fixtureRoot));
  });

  test('deduplicates repeated static candidates before enforcing the budget', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      const substitutions = '${true ? \'safe\' : \'safe\'}'.repeat(12);
      writeFileSync(filePath, `${source}\nexport const repairDedupFixture = <span>{\`${substitutions}\`}</span>;\n`, 'utf8');
    }, expectVerifierSuccess);
  });

  test('rejects nested customer-message values in object, array, and call argument forms', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(filePath, `${source}\nshowNotice({ message: formatNotice([true ? 'legacy client record' : 'client record']) });\n`, 'utf8');
    }, (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
  });

  test('rejects customer copy in accessibility attributes', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(filePath, `${source}\nconst accessibleCopy = <img alt="legacy client record" />;\n`, 'utf8');
    }, (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
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

  test('rejects a visible string returned by a local zero-argument helper', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(filePath, `${source}\nconst repairLabel = () => 'Legacy Records';\nexport const repairHelperFixture = <span>{repairLabel()}</span>;\n`, 'utf8');
    }, (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
  });

  test('rejects composed visible copy returned by a parameterised local helper', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(filePath, `${source}\nconst repairLabel = (left: string, right: string) => left + right;\nexport const repairHelperFixture = <span>{repairLabel('Leg', 'acy Records')}</span>;\n`, 'utf8');
    }, (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
  });

  test('rejects composed visible copy returned by a parameterised imported helper', () => {
    withTemporaryFixture((fixtureRoot) => {
      writeFileSync(
        fixturePath(fixtureRoot, 'src/customerCopy.ts'),
        'export const importedLabel = (left: string, right: string) => left + right;\n',
        'utf8',
      );
      replaceFixtureSource(
        fixtureRoot,
        'src/pages/ClientDetail.tsx',
        "import React, { useState } from 'react';",
        "import React, { useState } from 'react';\nimport { importedLabel } from '../customerCopy';",
      );
      replaceFixtureSource(
        fixtureRoot,
        'src/pages/ClientDetail.tsx',
        'All Clients',
        "{importedLabel('Leg', 'acy Records')}",
      );
    }, (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
  });

  test('rejects visible Legacy composed across typed cyclic variables', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `${source}\nconst left: string = right || 'Leg';\nconst right: string = left || 'acy';\nexport const repairCyclicCopyFixture = <span>{left + right}</span>;\n`,
        'utf8',
      );
    }, (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
  });

  test('terminates a genuine typed variable cycle with no visible strings', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `${source}\nconst left: string = right;\nconst right: string = left;\nexport const repairNonvisibleCycleFixture = <span>{left}</span>;\n`,
        'utf8',
      );
    }, expectVerifierSuccess);
  });

  test('rejects a visible string returned by a statically resolvable imported helper', () => {
    withTemporaryFixture((fixtureRoot) => {
      writeFileSync(
        fixturePath(fixtureRoot, 'src/customerCopy.ts'),
        "export function importedLabel() { return 'Legacy Imported Records'; }\n",
        'utf8',
      );
      replaceFixtureSource(
        fixtureRoot,
        'src/pages/ClientDetail.tsx',
        "import React, { useState } from 'react';",
        "import React, { useState } from 'react';\nimport { importedLabel } from '../customerCopy';",
      );
      replaceFixtureSource(fixtureRoot, 'src/pages/ClientDetail.tsx', 'All Clients', '{importedLabel()}');
    }, (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
  });

  test('ignores helper return strings that do not flow into customer-visible output', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(filePath, `${source}\nconst internalHelper = () => 'Legacy Internal Record';\n`, 'utf8');
    }, expectVerifierSuccess);
  });

  test('fails closed when a visible local helper/composition chain exceeds the depth budget', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      const helpers = Array.from({ length: 36 }, (_, index) => (
        index === 0
          ? "const repairDepth0 = () => 'Leg' + 'acy Records';"
          : `const repairDepth${index} = () => repairDepth${index - 1}();`
      )).join('\n');
      writeFileSync(filePath, `${source}\n${helpers}\nexport const repairDepthFixture = <span>{repairDepth35()}</span>;\n`, 'utf8');
    }, (fixtureRoot) => expectVerifierFailure('visible-string resolution depth exceeded (32)', fixtureRoot));
  });

  test('fails closed when a visible imported helper/composition chain exceeds the depth budget', () => {
    withTemporaryFixture((fixtureRoot) => {
      const helperPath = fixturePath(fixtureRoot, 'src/customerCopy.ts');
      const helpers = Array.from({ length: 36 }, (_, index) => (
        index === 0
          ? "const importedDepth0 = () => 'Leg' + 'acy Imported Records';"
          : `${index === 35 ? 'export ' : ''}const importedDepth${index} = () => importedDepth${index - 1}();`
      )).join('\n');
      writeFileSync(helperPath, `${helpers}\n`, 'utf8');
      replaceFixtureSource(
        fixtureRoot,
        'src/pages/ClientDetail.tsx',
        "import React, { useState } from 'react';",
        "import React, { useState } from 'react';\nimport { importedDepth35 } from '../customerCopy';",
      );
      replaceFixtureSource(
        fixtureRoot,
        'src/pages/ClientDetail.tsx',
        'All Clients',
        '{importedDepth35()}',
      );
    }, (fixtureRoot) => expectVerifierFailure('visible-string resolution depth exceeded (32)', fixtureRoot));
  });

  test('allows a near-limit clean helper chain', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      const helpers = Array.from({ length: 28 }, (_, index) => (
        index === 0
          ? "const repairSafeDepth0 = () => 'Current Records';"
          : `const repairSafeDepth${index} = () => repairSafeDepth${index - 1}();`
      )).join('\n');
      writeFileSync(filePath, `${source}\n${helpers}\nexport const repairSafeDepthFixture = <span>{repairSafeDepth27()}</span>;\n`, 'utf8');
    }, expectVerifierSuccess);
  });

  test('fails closed when two helper return branches aggregate beyond the node budget', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      const branchValues = Array.from({ length: 2048 }, () => "'Current'").join(', ');
      writeFileSync(
        filePath,
        `${source}\nfunction repairNodeBudget() {\n  if (true) return [${branchValues}];\n  return [${branchValues}];\n}\nexport const repairNodeBudgetFixture = <span>{repairNodeBudget()}</span>;\n`,
        'utf8',
      );
    }, (fixtureRoot) => expectVerifierFailure('visible-string node budget exceeded (4096)', fixtureRoot));
  });

  test('allows two helper return branches whose aggregate stays at the node budget', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      const branchValues = Array.from({ length: 2044 }, () => "'Current'").join(', ');
      writeFileSync(
        filePath,
        `${source}\nfunction repairNearNodeBudget() {\n  if (true) return [${branchValues}];\n  return [${branchValues}];\n}\nexport const repairNearNodeBudgetFixture = <span>{repairNearNodeBudget()}</span>;\n`,
        'utf8',
      );
    }, expectVerifierSuccess);
  });

  test('fails closed when shallow visible-string breadth exceeds the symbol budget', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      const declarations = Array.from(
        { length: 1025 },
        (_, index) => `const repairSymbol${index}: string = 'Current';`,
      ).join('\n');
      const references = Array.from({ length: 1025 }, (_, index) => `repairSymbol${index}`).join(', ');
      writeFileSync(
        filePath,
        `${source}\n${declarations}\nexport const repairSymbolBudgetFixture = <span>{[${references}]}</span>;\n`,
        'utf8',
      );
    }, (fixtureRoot) => expectVerifierFailure('visible-string symbol budget exceeded (1024)', fixtureRoot));
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

  test('fails closed when a changelog reference does not exist', () => {
    withTemporaryFixture((fixtureRoot) => updateFixtureRegistry(fixtureRoot, (registry) => {
      registry[0] = { ...registry[0], changelogReference: 'docs/missing-changelog.md' };
    }), (fixtureRoot) => expectVerifierFailure('changelog reference does not exist', fixtureRoot));
  });

  test('fails closed when a changelog reference leaves the repository root', () => {
    withTemporaryFixture((fixtureRoot) => updateFixtureRegistry(fixtureRoot, (registry) => {
      registry[0] = { ...registry[0], changelogReference: '../outside-changelog.md' };
    }), (fixtureRoot) => expectVerifierFailure('changelog reference must be a repository-relative path', fixtureRoot));
  });

  test('fails closed when a changelog symlink resolves outside the repository root', () => {
    const outsideRoot = mkdtempSync(path.join(tmpdir(), 'product-maturity-changelog-outside-'));
    try {
      const outsideChangelog = path.join(outsideRoot, 'changelog.md');
      writeFileSync(outsideChangelog, '# External changelog\n', 'utf8');
      withTemporaryFixture((fixtureRoot) => {
        const linkPath = fixturePath(fixtureRoot, 'docs/changelog-link.md');
        mkdirSync(path.dirname(linkPath), { recursive: true });
        symlinkSync(outsideChangelog, linkPath);
        updateFixtureRegistry(fixtureRoot, (registry) => {
          registry[0] = { ...registry[0], changelogReference: 'docs/changelog-link.md' };
        });
      }, (fixtureRoot) => expectVerifierFailure('changelog reference resolves outside the repository', fixtureRoot));
    } finally {
      rmSync(outsideRoot, { recursive: true, force: true });
    }
  });

  test('rejects fixture evidence paths outside the repository before copying them', () => {
    expect(() => withTemporaryFixture(() => undefined, () => undefined, ['../package.json']))
      .toThrow('Fixture source path must stay within the repository');
  });
});
