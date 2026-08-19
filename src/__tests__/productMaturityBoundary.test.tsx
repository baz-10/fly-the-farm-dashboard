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
  'src/security',
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
    expect(result.stdout).toContain('46 modules and 15 workflows classified');
    expect(result.stdout).toContain('163 customer UI source files checked');
    expect(result.stdout).toContain('77 evidence references checked');
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

  test('rejects a weakened canonical product maturity resolver implementation', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/productMaturity/surfaces.ts');
      const source = readFileSync(filePath, 'utf8');
      const modified = source.replace(
        /export function resolveProductSurface\(pathname: string, search: string\): ResolvedProductSurface \| null \{[\s\S]*?\n}\n\nexport \{ ProductMaturityConfigurationError \}/,
        [
          'export function resolveProductSurface(pathname: string, search: string): ResolvedProductSurface | null {',
          '  return null;',
          '}',
          '',
          "export { ProductMaturityConfigurationError }",
        ].join('\n'),
      );
      if (modified === source) throw new Error('Fixture mutation did not weaken resolveProductSurface.');
      writeFileSync(filePath, modified, 'utf8');
    }, (fixtureRoot) => expectVerifierFailure(
      'canonical product maturity resolver source integrity',
      fixtureRoot,
    ));
  });

  test('discovers an unclassified App route written as a static JSX expression', () => {
    withTemporaryFixture((fixtureRoot) => replaceFixtureSource(
      fixtureRoot,
      'src/App.tsx',
      'path="/login"',
      "path={'/unclassified-login'}",
    ), (fixtureRoot) => expectVerifierFailure('App route manifest mismatch', fixtureRoot));
  });

  test('rejects a reachable React Router Route hidden behind a component alias', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/App.tsx');
      const source = readFileSync(filePath, 'utf8');
      const withAlias = source.replace(
        'function App() {\n  const productRoute',
        'function App() {\n  const HiddenRoute = Route;\n  const productRoute',
      );
      const modified = withAlias.replace(
        '        <Route path="/login" element={<Login />} />',
        '        <HiddenRoute path="/hidden" element={<QuoteList />} />\n        <Route path="/login" element={<Login />} />',
      );
      if (withAlias === source || modified === withAlias) {
        throw new Error('Fixture mutation did not add the hidden route alias and leaf.');
      }
      writeFileSync(filePath, modified, 'utf8');
    }, (fixtureRoot) => expectVerifierFailure(
      'canonical direct JSX-only import/symbol convention',
      fixtureRoot,
    ));
  });

  test.each([
    [
      'react-router-dom ESM variable',
      "import { Route } from 'react-router-dom';\nexport const HiddenRoute = Route;\n",
    ],
    [
      'CommonJS acquisition',
      "const HiddenRoute = require('react-router-dom').Route;\nexport { HiddenRoute };\n",
    ],
    [
      'underlying react-router ESM alias',
      "import { Route as HiddenRoute } from 'react-router';\nexport { HiddenRoute };\n",
    ],
  ])('rejects an unguarded duplicate route hidden via %s', (_label, hiddenRouteSource) => {
    withTemporaryFixture((fixtureRoot) => {
      writeFileSync(
        fixturePath(fixtureRoot, 'src/components/HiddenRoute.tsx'),
        hiddenRouteSource,
        'utf8',
      );
      const filePath = fixturePath(fixtureRoot, 'src/App.tsx');
      const source = readFileSync(filePath, 'utf8');
      const withImport = source.replace(
        "import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom';",
        "import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom';\nimport { HiddenRoute } from './components/HiddenRoute';",
      );
      const modified = withImport.replace(
        '        <Route path="/login" element={<Login />} />',
        '        <HiddenRoute path="/admin" element={<Admin />} />\n        <Route path="/login" element={<Login />} />',
      );
      if (withImport === source || modified === withImport) {
        throw new Error('Fixture mutation did not add the imported route alias and duplicate leaf.');
      }
      writeFileSync(filePath, modified, 'utf8');
    }, (fixtureRoot) => expectVerifierFailure(
      'canonical direct JSX-only import/symbol convention',
      fixtureRoot,
    ));
  });

  test('rejects a parallel useRoutes routing channel beside the canonical Routes tree', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/App.tsx');
      const source = readFileSync(filePath, 'utf8');
      const withImport = source.replace(
        'BrowserRouter, Navigate, Routes, Route',
        'BrowserRouter, Navigate, Routes, Route, useRoutes',
      );
      const withComponent = withImport.replace(
        'function App() {',
        "function HiddenRoutes() { return useRoutes([{ path: '/hidden', element: <QuoteList /> }]); }\n\nfunction App() {",
      );
      const modified = withComponent.replace(
        '      </Routes>\n    </BrowserRouter>',
        '      </Routes>\n      <HiddenRoutes />\n    </BrowserRouter>',
      );
      if (withImport === source || withComponent === withImport || modified === withComponent) {
        throw new Error('Fixture mutation did not add the parallel useRoutes channel.');
      }
      writeFileSync(filePath, modified, 'utf8');
    }, (fixtureRoot) => expectVerifierFailure(
      'canonical direct JSX-only import/symbol convention',
      fixtureRoot,
    ));
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
    ['Component override', 'Component={QuoteList}'],
    ['lazy override', 'lazy={async () => ({ Component: QuoteList })}'],
  ])('rejects a competing React Router %s on an audited leaf route', (_label, competingProp) => {
    withTemporaryFixture((fixtureRoot) => replaceFixtureSource(
      fixtureRoot,
      'src/App.tsx',
      '<Route path="/jobs" element={productRoute(<ClientList />)} />',
      `<Route path="/jobs" ${competingProp} element={productRoute(<ClientList />)} />`,
    ), (fixtureRoot) => expectVerifierFailure(
      'requires exactly the canonical path and element attributes',
      fixtureRoot,
    ));
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
      expect(result.stdout).toContain('57 App routes checked');
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
    ['bare destination', '<QuoteList />'],
    ['guard only', "<ProtectedRoute allowedRoles={['admin', 'contractor']}><QuoteList /></ProtectedRoute>"],
    ['maturity only', '<ProductRouteSurface><QuoteList /></ProductRouteSurface>'],
    ['guard nested inside maturity', "<ProductRouteSurface><ProtectedRoute allowedRoles={['admin', 'contractor']}><QuoteList /></ProtectedRoute></ProductRouteSurface>"],
    ['direct equivalent wrapper', "<AuthorisedProductRoute allowedRoles={['admin', 'contractor']}><QuoteList /></AuthorisedProductRoute>"],
  ])('rejects an organisation route using %s instead of productRoute', (_label, routeElement) => {
    withTemporaryFixture((fixtureRoot) => replaceFixtureSource(
      fixtureRoot,
      'src/App.tsx',
      "<Route path=\"/quotes\" element={productRoute(<QuoteList />, { allowedRoles: ['admin', 'contractor'] })} />",
      `<Route path="/quotes" element={${routeElement}} />`,
    ), (fixtureRoot) => expectVerifierFailure('approved productRoute composition', fixtureRoot));
  });

  test.each([
    [
      'retired registration redirect composition',
      '<Route path="/register" element={<Navigate to="/apply" replace />} />',
      '<Route path="/register" element={<ProductRouteSurface><CommercialApplication /></ProductRouteSurface>} />',
      'retired registration redirect composition',
    ],
    [
      'login auth lifecycle',
      '<Route path="/login" element={<Login />} />',
      '<Route path="/login" element={<ProductRouteSurface><Login /></ProductRouteSurface>} />',
      'auth lifecycle composition',
    ],
    [
      'platform guard-before-maturity layout',
      '<Route element={<PlatformProtectedRoute><ProductRouteSurface><PlatformShell /></ProductRouteSurface></PlatformProtectedRoute>}>',
      '<Route element={<ProductRouteSurface><PlatformProtectedRoute><PlatformShell /></PlatformProtectedRoute></ProductRouteSurface>}>',
      'platform guard-before-maturity composition',
    ],
  ])('rejects a route with an invalid %s', (_label, find, replace, expectedMessage) => {
    withTemporaryFixture((fixtureRoot) => replaceFixtureSource(
      fixtureRoot,
      'src/App.tsx',
      find,
      replace,
    ), (fixtureRoot) => expectVerifierFailure(expectedMessage, fixtureRoot));
  });

  test('fails closed when the retired registration redirect destination changes', () => {
    withTemporaryFixture((fixtureRoot) => replaceFixtureSource(
      fixtureRoot,
      'src/App.tsx',
      '<Route path="/register" element={<Navigate to="/apply" replace />} />',
      '<Route path="/register" element={<Navigate to="/login" replace />} />',
    ), (fixtureRoot) => expectVerifierFailure('canonical route destination contract', fixtureRoot));
  });

  test('rejects an organisation structural layout without its approved guard/provider composition', () => {
    withTemporaryFixture((fixtureRoot) => replaceFixtureSource(
      fixtureRoot,
      'src/App.tsx',
      '            <ProtectedRoute>\n              <WorkflowProviders>\n                <Layout />\n              </WorkflowProviders>\n            </ProtectedRoute>',
      '            <WorkflowProviders>\n              <ProtectedRoute>\n                <Layout />\n              </ProtectedRoute>\n            </WorkflowProviders>',
    ), (fixtureRoot) => expectVerifierFailure('organisation structural route composition', fixtureRoot));
  });

  test('rejects a productRoute helper that omits its authorised guard composition', () => {
    withTemporaryFixture((fixtureRoot) => {
      replaceFixtureSource(
        fixtureRoot,
        'src/App.tsx',
        '    <AuthorisedProductRoute allowedRoles={options.allowedRoles} requiredEntitlement={options.requiredEntitlement}>',
        '    <ProductRouteSurface>',
      );
      replaceFixtureSource(
        fixtureRoot,
        'src/App.tsx',
        '    </AuthorisedProductRoute>',
        '    </ProductRouteSurface>',
      );
    }, (fixtureRoot) => expectVerifierFailure('productRoute helper', fixtureRoot));
  });

  test('rejects a canonical route wrapper with maturity outside its guard', () => {
    withTemporaryFixture((fixtureRoot) => replaceFixtureSource(
      fixtureRoot,
      'src/components/productMaturity/AuthorisedProductRoute.tsx',
      '    <ProtectedRoute allowedRoles={allowedRoles} requiredEntitlement={requiredEntitlement}>\n      <ProductRouteSurface>{children}</ProductRouteSurface>\n    </ProtectedRoute>',
      '    <ProductRouteSurface>\n      <ProtectedRoute allowedRoles={allowedRoles} requiredEntitlement={requiredEntitlement}>{children}</ProtectedRoute>\n    </ProductRouteSurface>',
    ), (fixtureRoot) => expectVerifierFailure('guard before ProductRouteSurface', fixtureRoot));
  });

  test.each([
    ['ProtectedRoute', (fixtureRoot: string) => {
      writeFileSync(
        fixturePath(fixtureRoot, 'src/components/ProtectedRouteFixtureNoop.tsx'),
        "import React from 'react';\nexport default function ProtectedRoute({ children }: { children: React.ReactNode }) { return <>{children}</>; }\n",
        'utf8',
      );
      replaceFixtureSource(
        fixtureRoot,
        'src/App.tsx',
        "import ProtectedRoute from './components/ProtectedRoute';",
        "import ProtectedRoute from './components/ProtectedRouteFixtureNoop';",
      );
    }],
    ['PlatformProtectedRoute', (fixtureRoot: string) => {
      writeFileSync(
        fixturePath(fixtureRoot, 'src/components/PlatformProtectedRouteFixtureNoop.tsx'),
        "import React from 'react';\nexport default function PlatformProtectedRoute({ children }: { children: React.ReactNode }) { return <>{children}</>; }\n",
        'utf8',
      );
      replaceFixtureSource(
        fixtureRoot,
        'src/App.tsx',
        "import PlatformProtectedRoute from './components/PlatformProtectedRoute';",
        "import PlatformProtectedRoute from './components/PlatformProtectedRouteFixtureNoop';",
      );
    }],
    ['Layout', (fixtureRoot: string) => {
      writeFileSync(
        fixturePath(fixtureRoot, 'src/components/LayoutFixtureNoop.tsx'),
        "import React from 'react';\nexport default function Layout() { return null; }\n",
        'utf8',
      );
      replaceFixtureSource(
        fixtureRoot,
        'src/App.tsx',
        "import Layout from './components/Layout';",
        "import Layout from './components/LayoutFixtureNoop';",
      );
    }],
    ['ProductRouteSurface and AuthorisedProductRoute', (fixtureRoot: string) => {
      writeFileSync(
        fixturePath(fixtureRoot, 'src/components/productMaturity/AuthorisedProductRouteFixtureNoop.tsx'),
        "import React from 'react';\nexport function ProductRouteSurface({ children }: { children: React.ReactNode }) { return <>{children}</>; }\nexport function AuthorisedProductRoute({ children }: { children: React.ReactNode }) { return <>{children}</>; }\n",
        'utf8',
      );
      replaceFixtureSource(
        fixtureRoot,
        'src/App.tsx',
        "from './components/productMaturity/AuthorisedProductRoute';",
        "from './components/productMaturity/AuthorisedProductRouteFixtureNoop';",
      );
    }],
    ['aliased route-surface import', (fixtureRoot: string) => {
      replaceFixtureSource(
        fixtureRoot,
        'src/App.tsx',
        "import { AuthorisedProductRoute, ProductRouteSurface } from './components/productMaturity/AuthorisedProductRoute';",
        "import { AuthorisedProductRoute as CanonicalAuthorisedProductRoute, ProductRouteSurface as CanonicalProductRouteSurface } from './components/productMaturity/AuthorisedProductRoute';",
      );
      const filePath = fixturePath(fixtureRoot, 'src/App.tsx');
      const source = readFileSync(filePath, 'utf8')
        .replaceAll('<AuthorisedProductRoute', '<CanonicalAuthorisedProductRoute')
        .replaceAll('</AuthorisedProductRoute>', '</CanonicalAuthorisedProductRoute>')
        .replaceAll('<ProductRouteSurface', '<CanonicalProductRouteSurface')
        .replaceAll('</ProductRouteSurface>', '</CanonicalProductRouteSurface>');
      writeFileSync(filePath, source, 'utf8');
    }],
    ['route-surface barrel import', (fixtureRoot: string) => {
      writeFileSync(
        fixturePath(fixtureRoot, 'src/components/productMaturity/RouteSurfaceFixtureBarrel.ts'),
        "export { AuthorisedProductRoute, ProductRouteSurface } from './AuthorisedProductRoute';\n",
        'utf8',
      );
      replaceFixtureSource(
        fixtureRoot,
        'src/App.tsx',
        "from './components/productMaturity/AuthorisedProductRoute';",
        "from './components/productMaturity/RouteSurfaceFixtureBarrel';",
      );
    }],
    ['ProductMaturitySurface dependency', (fixtureRoot: string) => {
      writeFileSync(
        fixturePath(fixtureRoot, 'src/components/productMaturity/ProductMaturitySurfaceFixtureNoop.tsx'),
        "import React from 'react';\nexport function ProductMaturitySurface({ children }: { children: React.ReactNode }) { return <>{children}</>; }\n",
        'utf8',
      );
      replaceFixtureSource(
        fixtureRoot,
        'src/components/productMaturity/AuthorisedProductRoute.tsx',
        "import { ProductMaturitySurface } from './ProductMaturitySurface';",
        "import { ProductMaturitySurface } from './ProductMaturitySurfaceFixtureNoop';",
      );
    }],
    ['ProductMaturitySurface resolver dependency', (fixtureRoot: string) => {
      writeFileSync(
        fixturePath(fixtureRoot, 'src/productMaturity/surfacesFixtureNoop.ts'),
        "export class ProductMaturityPathError extends Error {}\nexport function resolveProductSurface() { return null; }\n",
        'utf8',
      );
      replaceFixtureSource(
        fixtureRoot,
        'src/components/productMaturity/ProductMaturitySurface.tsx',
        "from '../../productMaturity/surfaces';",
        "from '../../productMaturity/surfacesFixtureNoop';",
      );
    }],
    ['ProductMaturitySurface implementation', (fixtureRoot: string) => {
      const filePath = fixturePath(
        fixtureRoot,
        'src/components/productMaturity/ProductMaturitySurface.tsx',
      );
      const source = readFileSync(filePath, 'utf8');
      const modified = source.replace(
        /export function ProductMaturitySurface[\s\S]*\n}\n$/,
        "export function ProductMaturitySurface({ children }: ProductMaturitySurfaceProps) { return <>{children}</>; }\n",
      );
      if (modified === source) throw new Error('Fixture mutation did not replace ProductMaturitySurface.');
      writeFileSync(filePath, modified, 'utf8');
    }],
    ['ProductMaturitySurface dead-code implementation', (fixtureRoot: string) => {
      const filePath = fixturePath(
        fixtureRoot,
        'src/components/productMaturity/ProductMaturitySurface.tsx',
      );
      const source = readFileSync(filePath, 'utf8');
      const modified = source.replace(
        /export function ProductMaturitySurface[\s\S]*\n}\n$/,
        [
          'export function ProductMaturitySurface({ pathname, search, children }: ProductMaturitySurfaceProps) {',
          '  if (false) {',
          '    let surface;',
          '    try {',
          '      surface = resolveProductSurface(pathname, search);',
          '    } catch (error) {',
          '      if (!(error instanceof ProductMaturityPathError)) throw error;',
          '    }',
          "    if (surface?.entry.maturity === 'COMING_SOON') return <ComingSoonWorkspace entry={surface.entry} />;",
          '    return <MaturityBadge entry={surface!.entry} />;',
          '  }',
          '  return <>{children}</>;',
          '}',
          '',
        ].join('\n'),
      );
      if (modified === source) throw new Error('Fixture mutation did not replace ProductMaturitySurface.');
      writeFileSync(filePath, modified, 'utf8');
    }],
    ['ProductMaturitySurface unsafe error fallback', (fixtureRoot: string) => replaceFixtureSource(
      fixtureRoot,
      'src/components/productMaturity/ProductMaturitySurface.tsx',
      [
        '    return (',
        '      <Alert severity="warning">',
        '        <Typography component="h1" variant="h5" gutterBottom>Page unavailable</Typography>',
        '        This URL could not be opened safely. Use the application navigation to choose a page.',
        '      </Alert>',
        '    );',
      ].join('\n'),
      '    return <Alert severity="warning">{children}</Alert>;',
    )],
    ['missionOperatorRoles dependency', (fixtureRoot: string) => {
      writeFileSync(
        fixturePath(fixtureRoot, 'src/security/operationalRouteRolesFixtureNoop.ts'),
        "export const missionOperatorRoles = ['admin', 'contractor', 'production_beta_acceptance'];\n",
        'utf8',
      );
      replaceFixtureSource(
        fixtureRoot,
        'src/App.tsx',
        "from './security/operationalRouteRoles';",
        "from './security/operationalRouteRolesFixtureNoop';",
      );
    }],
  ])('rejects a non-canonical %s route symbol', (_label, mutateFixture) => {
    withTemporaryFixture(
      mutateFixture,
      (fixtureRoot) => expectVerifierFailure('canonical route import/symbol convention', fixtureRoot),
    );
  });

  test('rejects a non-canonical productRoute helper call route symbol', () => {
    withTemporaryFixture((fixtureRoot) => {
      replaceFixtureSource(
        fixtureRoot,
        'src/App.tsx',
        '  return (\n    <BrowserRouter>',
        '  const alternateProductRoute = productRoute;\n\n  return (\n    <BrowserRouter>',
      );
      replaceFixtureSource(
        fixtureRoot,
        'src/App.tsx',
        '          <Route path="/quotes" element={productRoute(<QuoteList />, { allowedRoles: [\'admin\', \'contractor\'] })} />',
        '          <Route path="/quotes" element={alternateProductRoute(<QuoteList />, { allowedRoles: [\'admin\', \'contractor\'] })} />',
      );
    }, (fixtureRoot) => expectVerifierFailure('approved productRoute composition', fixtureRoot));
  });

  test.each([
    ['/jobs path swap', (fixtureRoot: string) => replaceFixtureSource(
      fixtureRoot,
      'src/App.tsx',
      '<Route path="/jobs" element={productRoute(<ClientList />)} />',
      '<Route path="/jobs" element={productRoute(<QuoteList />)} />',
    )],
    ['same-name alternate Login', (fixtureRoot: string) => {
      writeFileSync(
        fixturePath(fixtureRoot, 'src/pages/LoginFixtureAlternate.tsx'),
        'export default function Login() { return null; }\n',
        'utf8',
      );
      replaceFixtureSource(
        fixtureRoot,
        'src/App.tsx',
        "import Login from './pages/Login';",
        "import Login from './pages/LoginFixtureAlternate';",
      );
    }],
    ['canonical Login module re-exporting an alternate default', (fixtureRoot: string) => {
      writeFileSync(
        fixturePath(fixtureRoot, 'src/pages/LoginFixtureAlternate.tsx'),
        'export default function Login() { return null; }\n',
        'utf8',
      );
      writeFileSync(
        fixturePath(fixtureRoot, 'src/pages/Login.tsx'),
        "export { default } from './LoginFixtureAlternate';\n",
        'utf8',
      );
    }],
    ['canonical Login module locally aliasing an alternate default', (fixtureRoot: string) => {
      writeFileSync(
        fixturePath(fixtureRoot, 'src/pages/LoginFixtureAlternate.tsx'),
        'export default function AlternateLogin() { return null; }\n',
        'utf8',
      );
      writeFileSync(
        fixturePath(fixtureRoot, 'src/pages/Login.tsx'),
        "import AlternateLogin from './LoginFixtureAlternate';\nconst Login = AlternateLogin;\nexport default Login;\n",
        'utf8',
      );
    }],
    ['dynamic /jobs component alias', (fixtureRoot: string) => {
      replaceFixtureSource(
        fixtureRoot,
        'src/App.tsx',
        'function App() {',
        'const DynamicJobsDestination = true ? ClientList : QuoteList;\n\nfunction App() {',
      );
      replaceFixtureSource(
        fixtureRoot,
        'src/App.tsx',
        '<Route path="/jobs" element={productRoute(<ClientList />)} />',
        '<Route path="/jobs" element={productRoute(<DynamicJobsDestination />)} />',
      );
    }],
    ['unapproved /jobs wrapper', (fixtureRoot: string) => replaceFixtureSource(
      fixtureRoot,
      'src/App.tsx',
      '<Route path="/jobs" element={productRoute(<ClientList />)} />',
      '<Route path="/jobs" element={productRoute(<div><ClientList /></div>)} />',
    )],
    ['same-name alternate PlatformShell structural component', (fixtureRoot: string) => {
      writeFileSync(
        fixturePath(fixtureRoot, 'src/components/PlatformShellFixtureAlternate.tsx'),
        'export default function PlatformShell() { return null; }\n',
        'utf8',
      );
      replaceFixtureSource(
        fixtureRoot,
        'src/App.tsx',
        "import PlatformShell from './components/PlatformShell';",
        "import PlatformShell from './components/PlatformShellFixtureAlternate';",
      );
    }],
    ['same-name alternate PlatformAdmin leaf', (fixtureRoot: string) => {
      writeFileSync(
        fixturePath(fixtureRoot, 'src/pages/PlatformAdminFixtureAlternate.tsx'),
        'export default function PlatformAdmin() { return null; }\n',
        'utf8',
      );
      replaceFixtureSource(
        fixtureRoot,
        'src/App.tsx',
        "import PlatformAdmin from './pages/PlatformAdmin';",
        "import PlatformAdmin from './pages/PlatformAdminFixtureAlternate';",
      );
    }],
    ['swapped gated spray-import leaf', (fixtureRoot: string) => replaceFixtureSource(
      fixtureRoot,
      'src/App.tsx',
      '<OperationalFeatureGate feature="Spray Recommendation Import"><SprayRecImport /></OperationalFeatureGate>',
      '<OperationalFeatureGate feature="Spray Recommendation Import"><QuoteList /></OperationalFeatureGate>',
    )],
  ])('rejects a non-canonical %s destination', (_label, mutateFixture) => {
    withTemporaryFixture(
      mutateFixture,
      (fixtureRoot) => expectVerifierFailure('canonical route destination contract', fixtureRoot),
    );
  });

  test.each([
    ['removed /quotes roles', (fixtureRoot: string) => replaceFixtureSource(
      fixtureRoot,
      'src/App.tsx',
      "productRoute(<QuoteList />, { allowedRoles: ['admin', 'contractor'] })",
      'productRoute(<QuoteList />)',
    )],
    ['removed /ask-ftf entitlement', (fixtureRoot: string) => replaceFixtureSource(
      fixtureRoot,
      'src/App.tsx',
      "productRoute(<AskFTF />, { allowedRoles: ['admin', 'contractor'], requiredEntitlement: 'legacyAskFtf' })",
      "productRoute(<AskFTF />, { allowedRoles: ['admin', 'contractor'] })",
    )],
    ['changed /quotes role', (fixtureRoot: string) => replaceFixtureSource(
      fixtureRoot,
      'src/App.tsx',
      "productRoute(<QuoteList />, { allowedRoles: ['admin', 'contractor'] })",
      "productRoute(<QuoteList />, { allowedRoles: ['admin', 'client'] })",
    )],
    ['reordered /quotes roles', (fixtureRoot: string) => replaceFixtureSource(
      fixtureRoot,
      'src/App.tsx',
      "productRoute(<QuoteList />, { allowedRoles: ['admin', 'contractor'] })",
      "productRoute(<QuoteList />, { allowedRoles: ['contractor', 'admin'] })",
    )],
    ['dynamic /quotes options', (fixtureRoot: string) => {
      replaceFixtureSource(
        fixtureRoot,
        'src/App.tsx',
        'function App() {',
        "const quoteRouteOptions = { allowedRoles: ['admin', 'contractor'] as UserRole[] };\n\nfunction App() {",
      );
      replaceFixtureSource(
        fixtureRoot,
        'src/App.tsx',
        "productRoute(<QuoteList />, { allowedRoles: ['admin', 'contractor'] })",
        'productRoute(<QuoteList />, quoteRouteOptions)',
      );
    }],
    ['spread /quotes options', (fixtureRoot: string) => {
      replaceFixtureSource(
        fixtureRoot,
        'src/App.tsx',
        'function App() {',
        "const quoteRouteOptions = { allowedRoles: ['admin', 'contractor'] as UserRole[] };\n\nfunction App() {",
      );
      replaceFixtureSource(
        fixtureRoot,
        'src/App.tsx',
        "productRoute(<QuoteList />, { allowedRoles: ['admin', 'contractor'] })",
        'productRoute(<QuoteList />, { ...quoteRouteOptions })',
      );
    }],
    ['extra /quotes option', (fixtureRoot: string) => replaceFixtureSource(
      fixtureRoot,
      'src/App.tsx',
      "productRoute(<QuoteList />, { allowedRoles: ['admin', 'contractor'] })",
      "productRoute(<QuoteList />, { allowedRoles: ['admin', 'contractor'], unexpected: true })",
    )],
    ['explicit options on a default-auth route', (fixtureRoot: string) => replaceFixtureSource(
      fixtureRoot,
      'src/App.tsx',
      'productRoute(<HomeRoute />)',
      'productRoute(<HomeRoute />, {})',
    )],
    ['changed productRoute default options', (fixtureRoot: string) => replaceFixtureSource(
      fixtureRoot,
      'src/App.tsx',
      'options: { allowedRoles?: UserRole[]; requiredEntitlement?: string } = {}',
      "options: { allowedRoles?: UserRole[]; requiredEntitlement?: string } = { allowedRoles: ['admin'] }",
    )],
    ['dynamic /quotes roles', (fixtureRoot: string) => {
      replaceFixtureSource(
        fixtureRoot,
        'src/App.tsx',
        'function App() {',
        "const quoteRoles: UserRole[] = ['admin', 'contractor'];\n\nfunction App() {",
      );
      replaceFixtureSource(
        fixtureRoot,
        'src/App.tsx',
        "productRoute(<QuoteList />, { allowedRoles: ['admin', 'contractor'] })",
        'productRoute(<QuoteList />, { allowedRoles: quoteRoles })',
      );
    }],
    ['changed mission role metadata', (fixtureRoot: string) => replaceFixtureSource(
      fixtureRoot,
      'src/security/operationalRouteRoles.ts',
      "  'production_beta_acceptance',",
      "  'client',",
    )],
    ['a classified route missing validation metadata', (fixtureRoot: string) => {
      replaceFixtureSource(fixtureRoot, 'src/App.tsx', 'path="/quotes"', 'path="/quotations"');
      replaceFixtureSource(
        fixtureRoot,
        'src/productMaturity/surfaces.ts',
        "{ path: '/quotes', moduleCode: 'quotes', workflowCode: null },",
        "{ path: '/quotations', moduleCode: 'quotes', workflowCode: null },",
      );
    }],
  ])('rejects a route access contract with %s', (_label, mutateFixture) => {
    withTemporaryFixture(
      mutateFixture,
      (fixtureRoot) => expectVerifierFailure('exact route access contract', fixtureRoot),
    );
  });

  test('accepts a pathless layout route whose Route child is inside nested JSX fragments', () => {
    withTemporaryFixture((fixtureRoot) => replaceFixtureSource(
      fixtureRoot,
      'src/App.tsx',
      '          <Route path="/platform" element={<PlatformAdmin />} />',
      '          <>\n            <>\n              <Route path="/platform" element={<PlatformAdmin />} />\n            </>\n          </>',
    ), expectVerifierSuccess);
  });

  test('rejects a pathless layout route whose nested JSX fragments contain no Route', () => {
    withTemporaryFixture((fixtureRoot) => replaceFixtureSource(
      fixtureRoot,
      'src/App.tsx',
      '          <Route path="/platform" element={<PlatformAdmin />} />',
      '          <>\n            <>\n              <PlatformAdmin />\n            </>\n          </>',
    ), (fixtureRoot) => expectVerifierFailure(
      'canonical direct JSX-only import/symbol convention',
      fixtureRoot,
    ));
  });

  test('rejects a missing leaf path inside nested JSX fragments', () => {
    withTemporaryFixture((fixtureRoot) => replaceFixtureSource(
      fixtureRoot,
      'src/App.tsx',
      '          <Route path="/platform" element={<PlatformAdmin />} />',
      '          <>\n            <>\n              <Route element={<PlatformAdmin />} />\n            </>\n          </>',
    ), (fixtureRoot) => expectVerifierFailure('requires a path', fixtureRoot));
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

  test.each([
    ['element-access join', "{['Leg', 'acy']['join']('')}"],
    ['element-access string concat', "{'Leg'['concat']('acy')}"],
    ['template-named element-access array concat', "{['Leg'][`concat`]('acy')}"],
  ])('rejects Legacy assembled through %s', (_label, replacement) => {
    withTemporaryFixture((fixtureRoot) => replaceFixtureSource(
      fixtureRoot,
      'src/pages/ClientDetail.tsx',
      'All Clients',
      replacement,
    ), (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
  });

  test.each([
    ['a parenthesized element-access join reference', "{(['Leg', 'acy']['join'])('')}"],
    ['a parenthesized property concat reference', "{('Leg'.concat)('acy')}"],
    ['an as-wrapped element-access concat reference', "{('Leg'['concat'] as typeof String.prototype.concat)('acy')}"],
    ['a non-null property join reference', "{(['Leg', 'acy'].join!)('')}"],
  ])('rejects Legacy assembled through %s', (_label, replacement) => {
    withTemporaryFixture((fixtureRoot) => replaceFixtureSource(
      fixtureRoot,
      'src/pages/ClientDetail.tsx',
      'All Clients',
      replacement,
    ), (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
  });

  test('rejects Legacy assembled through a type-assertion-wrapped method reference', () => {
    withTemporaryFixture((fixtureRoot) => writeFileSync(
      fixturePath(fixtureRoot, 'src/pages/RepairWrappedCalleeFixture.ts'),
      "export const repairWrappedCalleeFixture = { label: (<any>['Leg', 'acy']['join'])('') };\n",
      'utf8',
    ), (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
  });

  test('fails closed on a rendered dynamic element-access method name', () => {
    withTemporaryFixture((fixtureRoot) => replaceFixtureSource(
      fixtureRoot,
      'src/pages/ClientDetail.tsx',
      'All Clients',
      "{['Current Records'][dynamicMethodName]('')}",
    ), (fixtureRoot) => expectVerifierFailure('dynamic rendered method name', fixtureRoot));
  });

  test('fails closed on a parenthesized rendered dynamic element-access method reference', () => {
    withTemporaryFixture((fixtureRoot) => replaceFixtureSource(
      fixtureRoot,
      'src/pages/ClientDetail.tsx',
      'All Clients',
      '{(receiver[dynamicMethod])()}',
    ), (fixtureRoot) => expectVerifierFailure('dynamic rendered method name', fixtureRoot));
  });

  test.each([
    ['property string concat array coercion', "{'Le'.concat(['g', 'acy'])}"],
    ['element string concat array coercion', "{'Le'['concat'](['g', 'acy'])}"],
    ['property join separator', "{['Leg', 'acy'].join(',')}"],
    ['element join separator', "{['Leg', 'acy']['join'](',')}"],
    ['property join array-to-string separator coercion', "{['Leg', 'acy'].join([','])}"],
  ])('allows non-Legacy visible copy with real %s semantics', (_label, replacement) => {
    withTemporaryFixture((fixtureRoot) => replaceFixtureSource(
      fixtureRoot,
      'src/pages/ClientDetail.tsx',
      'All Clients',
      replacement,
    ), expectVerifierSuccess);
  });

  test.each([
    ['property array concat flattening', "{['Le'].concat(['g', 'acy'])}"],
    ['element array concat flattening', "{['Le']['concat'](['g', 'acy'])}"],
    ['property string concat single-array coercion', "{'Leg'.concat(['acy'])}"],
    ['element string concat single-array coercion', "{'Leg'['concat'](['acy'])}"],
    ['element join empty-array separator coercion', "{['Leg', 'acy']['join']([])}"],
  ])('rejects Legacy visible copy with real %s semantics', (_label, replacement) => {
    withTemporaryFixture((fixtureRoot) => replaceFixtureSource(
      fixtureRoot,
      'src/pages/ClientDetail.tsx',
      'All Clients',
      replacement,
    ), (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
  });

  test.each([
    ['literal replace', "{'LeXacy'.replace('X', 'g')}"],
    ['fragmented literal replaceAll', "{'L_e_g_a_c_y'.replaceAll('_', '')}"],
    ['element-access replaceAll', "{'L-e-g-a-c-y'['replaceAll']('-', '')}"],
    ['chained literal replace', "{'L_Xacy'.replace('_', 'e').replace('X', 'g')}"],
  ])('rejects Legacy assembled through %s', (_label, replacement) => {
    withTemporaryFixture((fixtureRoot) => replaceFixtureSource(
      fixtureRoot,
      'src/pages/ClientDetail.tsx',
      'All Clients',
      replacement,
    ), (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
  });

  test('rejects Legacy assembled through a parameterised static replace helper', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `${source}\nconst repairReplace = (value: string, search: string, replacement: string) => value.replace(search, replacement);\nexport const repairReplaceFixture = <span>{repairReplace('LeXacy', 'X', 'g')}</span>;\n`,
        'utf8',
      );
    }, (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
  });

  test.each([
    [
      'local literal',
      "const repairHiddenCopy = () => 'LeXacy';\nexport const repairHelperReturnFixture = <span>{repairHiddenCopy().replace('X', 'g')}</span>;",
    ],
    [
      'parameterised identity',
      "const repairHiddenCopy = (value: string) => value;\nexport const repairHelperReturnFixture = <span>{repairHiddenCopy('LeXacy').replace('X', 'g')}</span>;",
    ],
    [
      'function declaration',
      "function repairHiddenCopy() { return 'LeXacy'; }\nexport const repairHelperReturnFixture = <span>{repairHiddenCopy().replace('X', 'g')}</span>;",
    ],
    [
      'nested static join',
      "const repairHiddenCopy = () => ['Le', 'Xacy'].join('');\nexport const repairHelperReturnFixture = <span>{repairHiddenCopy().replace('X', 'g')}</span>;",
    ],
  ])('rejects Legacy assembled through a %s helper-return transform', (_label, fixtureSource) => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(filePath, `${source}\n${fixtureSource}\n`, 'utf8');
    }, (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
  });

  test('rejects Legacy assembled through an imported helper-return transform', () => {
    withTemporaryFixture((fixtureRoot) => {
      writeFileSync(
        fixturePath(fixtureRoot, 'src/pages/repairStaticCopyHelper.ts'),
        "export const repairImportedHiddenCopy = () => 'L_e_g_a_c_y';\n",
        'utf8',
      );
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `import { repairImportedHiddenCopy } from './repairStaticCopyHelper';\n${source}\nexport const repairImportedHelperReturnFixture = <span>{repairImportedHiddenCopy().replaceAll('_', '')}</span>;\n`,
        'utf8',
      );
    }, (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
  });

  test('rejects Legacy assembled through the exact nested helper factory', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `${source}\nconst repairMakeHelper = () => () => 'LeXacy';\nexport const repairFactoryFixture = <span>{repairMakeHelper()().replace('X', 'g')}</span>;\n`,
        'utf8',
      );
    }, (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
  });

  test('rejects Legacy assembled through a nested static argument helper factory', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `${source}\nconst repairMakeNestedHelper = (value: string) => () => () => value;\nexport const repairNestedFactoryFixture = <span>{repairMakeNestedHelper('LeXacy')()().replace('X', 'g')}</span>;\n`,
        'utf8',
      );
    }, (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
  });

  test('allows a clean nested static argument helper factory', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `${source}\nconst repairMakeSafeHelper = (value: string) => () => value;\nexport const repairSafeFactoryFixture = <span>{repairMakeSafeHelper('Current')().replace('x', 'x')}</span>;\n`,
        'utf8',
      );
    }, expectVerifierSuccess);
  });

  test('fails closed on an unresolved helper factory', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `${source}\ndeclare const repairUnresolvedFactory: () => () => string;\nexport const repairUnresolvedFactoryFixture = <span>{repairUnresolvedFactory()().replace('x', 'x')}</span>;\n`,
        'utf8',
      );
    }, (fixtureRoot) => expectVerifierFailure(
      'rendered string transform could not be resolved safely',
      fixtureRoot,
    ));
  });

  test('fails closed on a dynamic helper factory argument', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `${source}\ndeclare const repairDynamicFactoryValue: string;\nconst repairMakeDynamicHelper = (value: string) => () => value;\nexport const repairDynamicFactoryFixture = <span>{repairMakeDynamicHelper(repairDynamicFactoryValue)().replace('x', 'x')}</span>;\n`,
        'utf8',
      );
    }, (fixtureRoot) => expectVerifierFailure(
      'rendered string transform could not be resolved safely',
      fixtureRoot,
    ));
  });

  test('fails closed on a cyclic helper factory', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `${source}\ntype RepairCyclicFactory = () => () => string;\nconst repairCyclicFactory: RepairCyclicFactory = () => repairCyclicFactory();\nexport const repairCyclicFactoryFixture = <span>{repairCyclicFactory()().replace('x', 'x')}</span>;\n`,
        'utf8',
      );
    }, (fixtureRoot) => expectVerifierFailure(
      'rendered string transform could not be resolved safely',
      fixtureRoot,
    ));
  });

  test('allows clean path-local conditional helper factory siblings', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `${source}\ndeclare const repairChooseSafeFactorySibling: boolean;\nconst repairSafeFactoryLeaf = () => 'Current';\nconst repairSafeFactorySiblingB = () => repairSafeFactoryLeaf;\nconst repairSafeFactorySiblingA = () => repairSafeFactorySiblingB();\nconst repairSafeFactorySibling = repairChooseSafeFactorySibling ? repairSafeFactorySiblingA : repairSafeFactorySiblingB;\nexport const repairSafeFactorySiblingFixture = <span>{repairSafeFactorySibling()().replace('x', 'x')}</span>;\n`,
        'utf8',
      );
    }, expectVerifierSuccess);
  });

  test('rejects Legacy through path-local conditional helper factory siblings', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `${source}\ndeclare const repairChooseLegacyFactorySibling: boolean;\nconst repairLegacyFactoryLeaf = () => 'LeXacy';\nconst repairLegacyFactorySiblingB = () => repairLegacyFactoryLeaf;\nconst repairLegacyFactorySiblingA = () => repairLegacyFactorySiblingB();\nconst repairLegacyFactorySibling = repairChooseLegacyFactorySibling ? repairLegacyFactorySiblingA : repairLegacyFactorySiblingB;\nexport const repairLegacyFactorySiblingFixture = <span>{repairLegacyFactorySibling()().replace('X', 'g')}</span>;\n`,
        'utf8',
      );
    }, (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
  });

  test('fails closed on unresolved path-local conditional helper factory siblings', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `${source}\ndeclare const repairChooseUnresolvedFactorySibling: boolean;\ndeclare const repairUnresolvedFactoryLeaf: () => string;\nconst repairUnresolvedFactorySiblingB = () => repairUnresolvedFactoryLeaf;\nconst repairUnresolvedFactorySiblingA = () => repairUnresolvedFactorySiblingB();\nconst repairUnresolvedFactorySibling = repairChooseUnresolvedFactorySibling ? repairUnresolvedFactorySiblingA : repairUnresolvedFactorySiblingB;\nexport const repairUnresolvedFactorySiblingFixture = <span>{repairUnresolvedFactorySibling()().replace('x', 'x')}</span>;\n`,
        'utf8',
      );
    }, (fixtureRoot) => expectVerifierFailure(
      'rendered string transform could not be resolved safely',
      fixtureRoot,
    ));
  });

  test('rejects Legacy assembled through a local helper-function alias', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `${source}\nconst repairAliasedSource = () => 'LeXacy';\nconst repairAliasedHelper = repairAliasedSource;\nexport const repairAliasedHelperFixture = <span>{repairAliasedHelper().replace('X', 'g')}</span>;\n`,
        'utf8',
      );
    }, (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
  });

  test('rejects Legacy assembled through an imported helper-function alias', () => {
    withTemporaryFixture((fixtureRoot) => {
      writeFileSync(
        fixturePath(fixtureRoot, 'src/pages/repairStaticCopyHelper.ts'),
        "const repairAliasedSource = () => 'LeXacy';\nexport const repairAliasedHelper = repairAliasedSource;\n",
        'utf8',
      );
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `import { repairAliasedHelper } from './repairStaticCopyHelper';\n${source}\nexport const repairImportedAliasFixture = <span>{repairAliasedHelper().replace('X', 'g')}</span>;\n`,
        'utf8',
      );
    }, (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
  });

  test('rejects Legacy assembled through a helper-function property alias', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `${source}\nconst repairPropertySource = () => 'LeXacy';\nconst repairPropertyAliases = { hidden: repairPropertySource };\nexport const repairPropertyAliasFixture = <span>{repairPropertyAliases.hidden().replace('X', 'g')}</span>;\n`,
        'utf8',
      );
    }, (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
  });

  test('rejects Legacy assembled through a shorthand helper-function property alias', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `${source}\nconst repairShorthandSource = () => 'LeXacy';\nconst repairShorthandAliases = { repairShorthandSource };\nexport const repairShorthandAliasFixture = <span>{repairShorthandAliases.repairShorthandSource().replace('X', 'g')}</span>;\n`,
        'utf8',
      );
    }, (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
  });

  test('allows a non-Legacy shorthand helper-function property alias', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `${source}\nconst repairSafeShorthandSource = () => 'Current';\nconst repairSafeShorthandAliases = { repairSafeShorthandSource };\nexport const repairSafeShorthandAliasFixture = <span>{repairSafeShorthandAliases.repairSafeShorthandSource().replace('x', 'x')}</span>;\n`,
        'utf8',
      );
    }, expectVerifierSuccess);
  });

  test('rejects Legacy assembled through a destructured helper-function property alias', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `${source}\nconst repairDestructuredSource = () => 'LeXacy';\nconst repairDestructuredAliases = { hidden: repairDestructuredSource };\nconst { hidden: repairDestructuredHelper } = repairDestructuredAliases;\nexport const repairDestructuredAliasFixture = <span>{repairDestructuredHelper().replace('X', 'g')}</span>;\n`,
        'utf8',
      );
    }, (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
  });

  test('allows a non-Legacy destructured helper-function property alias', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `${source}\nconst repairSafeDestructuredSource = () => 'Current';\nconst repairSafeDestructuredAliases = { hidden: repairSafeDestructuredSource };\nconst { hidden: repairSafeDestructuredHelper } = repairSafeDestructuredAliases;\nexport const repairSafeDestructuredAliasFixture = <span>{repairSafeDestructuredHelper().replace('x', 'x')}</span>;\n`,
        'utf8',
      );
    }, expectVerifierSuccess);
  });

  test('rejects Legacy from any conditional helper-function alias alternative', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `${source}\ndeclare const repairChooseConditionalHelper: boolean;\nconst repairConditionalLegacy = () => 'LeXacy';\nconst repairConditionalSafe = () => 'Current';\nconst repairConditionalHelper = repairChooseConditionalHelper ? repairConditionalLegacy : repairConditionalSafe;\nexport const repairConditionalAliasFixture = <span>{repairConditionalHelper().replace('X', 'g')}</span>;\n`,
        'utf8',
      );
    }, (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
  });

  test('rejects the exact reviewer conditional function-expression alias', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `${source}\ndeclare const repairChooseDirectConditionalHelper: boolean;\nconst repairDirectConditionalHelper = repairChooseDirectConditionalHelper ? (() => 'LeXacy') : (() => 'Current');\nexport const repairDirectConditionalAliasFixture = <span>{repairDirectConditionalHelper().replace('X', 'g')}</span>;\n`,
        'utf8',
      );
    }, (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
  });

  test('allows safe static alternatives through a conditional helper-function alias', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `${source}\ndeclare const repairChooseSafeConditionalHelper: boolean;\nconst repairConditionalSafeLeft = () => 'Current';\nconst repairConditionalSafeRight = () => 'Present';\nconst repairSafeConditionalHelper = repairChooseSafeConditionalHelper ? repairConditionalSafeLeft : repairConditionalSafeRight;\nexport const repairSafeConditionalAliasFixture = <span>{repairSafeConditionalHelper().replace('x', 'x')}</span>;\n`,
        'utf8',
      );
    }, expectVerifierSuccess);
  });

  test('fails closed when a conditional helper-function alias has an unresolved alternative', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `${source}\ndeclare const repairChooseUnresolvedConditionalHelper: boolean;\ndeclare const repairUnresolvedConditionalHelper: () => string;\nconst repairResolvedConditionalHelper = () => 'Current';\nconst repairConditionalHelper = repairChooseUnresolvedConditionalHelper ? repairResolvedConditionalHelper : repairUnresolvedConditionalHelper;\nexport const repairUnresolvedConditionalAliasFixture = <span>{repairConditionalHelper().replace('x', 'x')}</span>;\n`,
        'utf8',
      );
    }, (fixtureRoot) => expectVerifierFailure(
      'rendered string transform could not be resolved safely',
      fixtureRoot,
    ));
  });

  test('rejects Legacy from a statically indexed helper-function array alias', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `${source}\nconst repairIndexedSafe = () => 'Current';\nconst repairIndexedLegacy = () => 'LeXacy';\nconst repairIndexedAliases = [repairIndexedSafe, repairIndexedLegacy] as const;\nconst repairIndexedHelper = repairIndexedAliases[1];\nexport const repairIndexedAliasFixture = <span>{repairIndexedHelper().replace('X', 'g')}</span>;\n`,
        'utf8',
      );
    }, (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
  });

  test('rejects the exact reviewer direct indexed-array helper call', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `${source}\nconst repairDirectIndexedHelpers = [() => 'LeXacy'];\nexport const repairDirectIndexedAliasFixture = <span>{repairDirectIndexedHelpers[0]().replace('X', 'g')}</span>;\n`,
        'utf8',
      );
    }, (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
  });

  test('rejects Legacy from every conditional helper-function array alternative', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `${source}\ndeclare const repairChooseIndexedArray: boolean;\nconst repairConditionalIndexedHelpers = repairChooseIndexedArray ? [() => 'LeXacy'] : [() => 'Current'];\nexport const repairConditionalIndexedFixture = <span>{repairConditionalIndexedHelpers[0]().replace('X', 'g')}</span>;\n`,
        'utf8',
      );
    }, (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
  });

  test('fails closed on a direct indexed-array helper with an unresolved selected element', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `${source}\ndeclare const repairUnresolvedIndexedElement: () => string;\nconst repairUnresolvedIndexedHelpers = [repairUnresolvedIndexedElement];\nexport const repairUnresolvedIndexedElementFixture = <span>{repairUnresolvedIndexedHelpers[0]().replace('x', 'x')}</span>;\n`,
        'utf8',
      );
    }, (fixtureRoot) => expectVerifierFailure(
      'rendered string transform could not be resolved safely',
      fixtureRoot,
    ));
  });

  test('fails closed on a statically indexed helper-function array containing a spread', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `${source}\nconst repairSpreadIndexedBase = [() => 'Current'] as const;\nconst repairSpreadIndexedHelpers = [...repairSpreadIndexedBase];\nexport const repairSpreadIndexedFixture = <span>{repairSpreadIndexedHelpers[0]().replace('x', 'x')}</span>;\n`,
        'utf8',
      );
    }, (fixtureRoot) => expectVerifierFailure(
      'rendered string transform could not be resolved safely',
      fixtureRoot,
    ));
  });

  test('allows the selected safe helper in a statically indexed function array', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `${source}\nconst repairSafeIndexedHelper = () => 'Current';\nconst repairUnselectedLegacyHelper = () => 'LeXacy';\nconst repairSafeIndexedAliases = [repairSafeIndexedHelper, repairUnselectedLegacyHelper] as const;\nconst repairSelectedSafeHelper = repairSafeIndexedAliases[0];\nexport const repairSafeIndexedAliasFixture = <span>{repairSelectedSafeHelper().replace('x', 'x')}</span>;\n`,
        'utf8',
      );
    }, expectVerifierSuccess);
  });

  test('fails closed on a dynamic helper-function array alias index', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `${source}\ndeclare const repairDynamicAliasIndex: number;\nconst repairDynamicIndexedSource = () => 'Current';\nconst repairDynamicIndexedAliases = [repairDynamicIndexedSource] as const;\nconst repairDynamicIndexedHelper = repairDynamicIndexedAliases[repairDynamicAliasIndex];\nexport const repairDynamicIndexedAliasFixture = <span>{repairDynamicIndexedHelper().replace('x', 'x')}</span>;\n`,
        'utf8',
      );
    }, (fixtureRoot) => expectVerifierFailure(
      'rendered string transform could not be resolved safely',
      fixtureRoot,
    ));
  });

  test('fails closed on an out-of-range helper-function array alias index', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `${source}\nconst repairShortIndexedSource = () => 'Current';\nconst repairShortIndexedAliases = [repairShortIndexedSource] as const;\nconst repairMissingIndexedHelper = repairShortIndexedAliases[2];\nexport const repairMissingIndexedAliasFixture = <span>{repairMissingIndexedHelper().replace('x', 'x')}</span>;\n`,
        'utf8',
      );
    }, (fixtureRoot) => expectVerifierFailure(
      'rendered string transform could not be resolved safely',
      fixtureRoot,
    ));
  });

  test('fails closed on a non-canonical string helper-function array index', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `${source}\nconst repairStringIndexedHelpers = [() => 'Current', () => 'Present'] as const;\nconst repairStringIndexedHelper = repairStringIndexedHelpers['01'];\nexport const repairStringIndexedAliasFixture = <span>{repairStringIndexedHelper().replace('x', 'x')}</span>;\n`,
        'utf8',
      );
    }, (fixtureRoot) => expectVerifierFailure(
      'rendered string transform could not be resolved safely',
      fixtureRoot,
    ));
  });

  test('rejects Legacy assembled through a re-exported helper-function alias', () => {
    withTemporaryFixture((fixtureRoot) => {
      writeFileSync(
        fixturePath(fixtureRoot, 'src/pages/repairStaticCopySource.ts'),
        "export const repairAliasedSource = () => 'LeXacy';\n",
        'utf8',
      );
      writeFileSync(
        fixturePath(fixtureRoot, 'src/pages/repairStaticCopyHelper.ts'),
        "export { repairAliasedSource as repairAliasedHelper } from './repairStaticCopySource';\n",
        'utf8',
      );
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `import { repairAliasedHelper } from './repairStaticCopyHelper';\n${source}\nexport const repairReexportedAliasFixture = <span>{repairAliasedHelper().replace('X', 'g')}</span>;\n`,
        'utf8',
      );
    }, (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
  });

  test('fails closed on a cyclic helper-function alias', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `${source}\nconst repairAliasA = repairAliasB;\nconst repairAliasB = repairAliasA;\nexport const repairCyclicAliasFixture = <span>{repairAliasA().replace('X', 'g')}</span>;\n`,
        'utf8',
      );
    }, (fixtureRoot) => expectVerifierFailure('rendered string transform could not be resolved safely', fixtureRoot));
  });

  test('allows a non-Legacy result through a local helper-function alias', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `${source}\nconst repairSafeAliasedSource = () => 'Current';\nconst repairSafeAliasedHelper = repairSafeAliasedSource;\nexport const repairSafeAliasFixture = <span>{repairSafeAliasedHelper().replace('x', 'x')}</span>;\n`,
        'utf8',
      );
    }, expectVerifierSuccess);
  });

  test('rejects Legacy assembled through a typed string-array helper parameter', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `${source}\nconst repairArrayHelper = (parts: string[]) => parts.join('');\nexport const repairArrayHelperFixture = <span>{repairArrayHelper(['Le', 'Xacy']).replace('X', 'g')}</span>;\n`,
        'utf8',
      );
    }, (fixtureRoot) => expectVerifierFailure('Customer-facing Legacy violation', fixtureRoot));
  });

  test('allows a non-Legacy typed string-array helper parameter', () => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `${source}\nconst repairSafeArrayHelper = (parts: string[]) => parts.join('');\nexport const repairSafeArrayHelperFixture = <span>{repairSafeArrayHelper(['Current']).replace('x', 'x')}</span>;\n`,
        'utf8',
      );
    }, expectVerifierSuccess);
  });

  test('fails closed on an imported helper-return transform hiding a dynamic search', () => {
    withTemporaryFixture((fixtureRoot) => {
      writeFileSync(
        fixturePath(fixtureRoot, 'src/pages/repairStaticCopyHelper.ts'),
        "declare const repairDynamicSearch: string;\nexport const repairImportedHiddenCopy = () => 'LeXacy'.replace(repairDynamicSearch, 'g');\n",
        'utf8',
      );
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(
        filePath,
        `import { repairImportedHiddenCopy } from './repairStaticCopyHelper';\n${source}\nexport const repairImportedHelperReturnFixture = <span>{repairImportedHiddenCopy().replace('x', 'x')}</span>;\n`,
        'utf8',
      );
    }, (fixtureRoot) => expectVerifierFailure('rendered string transform could not be resolved safely', fixtureRoot));
  });

  test.each([
    [
      'regular expression',
      "const repairHiddenCopy = () => 'LeXacy'.replace(/X/g, 'g');\nexport const repairHelperReturnFixture = <span>{repairHiddenCopy().replace('x', 'x')}</span>;",
    ],
    [
      'callback',
      "const repairHiddenCopy = () => 'LeXacy'.replace('X', () => { throw new Error('must not execute'); });\nexport const repairHelperReturnFixture = <span>{repairHiddenCopy().replace('x', 'x')}</span>;",
    ],
    [
      'dynamic search',
      "declare const repairDynamicSearch: string;\nconst repairHiddenCopy = () => 'LeXacy'.replace(repairDynamicSearch, 'g');\nexport const repairHelperReturnFixture = <span>{repairHiddenCopy().replace('x', 'x')}</span>;",
    ],
    [
      'dynamic return',
      "declare const repairDynamicCopy: string;\nconst repairHiddenCopy = () => repairDynamicCopy;\nexport const repairHelperReturnFixture = <span>{repairHiddenCopy().replace('X', 'g')}</span>;",
    ],
  ])('fails closed on a helper-return transform hiding a %s', (_label, fixtureSource) => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(filePath, `${source}\n${fixtureSource}\n`, 'utf8');
    }, (fixtureRoot) => expectVerifierFailure('rendered string transform could not be resolved safely', fixtureRoot));
  });

  test.each([
    [
      'non-Legacy static result',
      "const repairHiddenCopy = () => 'LeXacy';\nexport const repairHelperReturnControl = <span>{repairHiddenCopy().replace('X', '-')}</span>;",
    ],
    [
      'removed Legacy static result',
      "const repairHiddenCopy = () => 'Legacy';\nexport const repairHelperReturnControl = <span>{repairHiddenCopy().replace('Legacy', 'Current')}</span>;",
    ],
    [
      'direct dynamic receiver',
      "declare const repairDynamicCopy: string;\nexport const repairHelperReturnControl = <span>{repairDynamicCopy.replace('X', 'g')}</span>;",
    ],
  ])('allows a helper-return transform control with a %s', (_label, fixtureSource) => {
    withTemporaryFixture((fixtureRoot) => {
      const filePath = fixturePath(fixtureRoot, 'src/pages/ClientDetail.tsx');
      const source = readFileSync(filePath, 'utf8');
      writeFileSync(filePath, `${source}\n${fixtureSource}\n`, 'utf8');
    }, expectVerifierSuccess);
  });

  test.each([
    ['a non-Legacy replacement', "{'LeXacy'.replace('X', '-')}"],
    ['replace first-match semantics', "{'LeXXacy'.replace('X', 'g')}"],
    ['replaceAll non-Legacy semantics', "{'L_e_g_a_c_y'.replaceAll('_', '-')}"],
    ['removal of an existing Legacy receiver', "{'Legacy'.replace('Legacy', 'Current')}"],
    ['literal replacement token semantics', "{'LeXacy'.replace('X', '$&')}"],
  ])('allows %s with static string transform semantics', (_label, replacement) => {
    withTemporaryFixture((fixtureRoot) => replaceFixtureSource(
      fixtureRoot,
      'src/pages/ClientDetail.tsx',
      'All Clients',
      replacement,
    ), expectVerifierSuccess);
  });

  test.each([
    ['dynamic search', "{'LeXacy'.replace(dynamicSearch, 'g')}"],
    ['dynamic replacement', "{'LeXacy'.replace('X', dynamicReplacement)}"],
    ['regular-expression search', "{'LeXacy'.replace(/X/g, 'g')}"],
    ['an unresolved static receiver chain', "{'LeXacy'.replace(/X/g, 'g').replace('x', 'x')}"],
    ['non-executable replacement callback', "{'LeXacy'.replace('X', () => { throw new Error('must not execute'); })}"],
  ])('fails closed on a rendered transform with %s', (_label, replacement) => {
    withTemporaryFixture((fixtureRoot) => replaceFixtureSource(
      fixtureRoot,
      'src/pages/ClientDetail.tsx',
      'All Clients',
      replacement,
    ), (fixtureRoot) => expectVerifierFailure('rendered string transform could not be resolved safely', fixtureRoot));
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
