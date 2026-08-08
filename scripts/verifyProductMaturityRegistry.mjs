import { readFile, readdir, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const excludedCustomerUiDirectoryPaths = new Set([
  'src/ai', 'src/data', 'src/productMaturity', 'src/security', 'src/services', 'src/theme', 'src/utils',
]);
const excludedCustomerUiFiles = new Set(['react-app-env.d.ts', 'reportWebVitals.ts', 'setupTests.ts']);

const validMaturities = new Set([
  'COMMERCIALLY_READY',
  'OPERATIONALLY_READY',
  'BETA',
  'COMING_SOON',
]);
const validPriorities = new Set(['P0', 'P1', 'P2', 'P3']);
const codePattern = /^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)*$/;
const visibleStringCandidateBudget = 256;
const visibleStringDepthBudget = 32;
const visibleStringNodeBudget = 4096;
const visibleStringSymbolBudget = 1024;
const requiredArrayFields = [
  'evidence',
  'requiredAutomatedTests',
  'requiredManualAcceptance',
  'requiredOperationalEvidence',
];

function resolveVerifierRoot(argumentsList) {
  if (argumentsList.length === 0) return defaultRoot;
  if (argumentsList.length === 2 && argumentsList[0] === '--root' && isNonEmptyString(argumentsList[1])) {
    return resolve(argumentsList[1]);
  }

  throw new Error('Usage: node scripts/verifyProductMaturityRegistry.mjs [--root <fixture-root>]');
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasNonEmptyStrings(value) {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function validateRegistry(registry) {
  if (!Array.isArray(registry) || registry.length === 0) {
    throw new Error('Registry must contain at least one entry.');
  }

  const keys = new Set();

  registry.forEach((entry, index) => {
    const label = `entry ${index + 1}`;

    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`${label} must be an object.`);
    }
    if (!isNonEmptyString(entry.moduleCode) || !codePattern.test(entry.moduleCode)) {
      throw new Error(`${label} has an invalid moduleCode.`);
    }
    if (entry.workflowCode !== null
      && (!isNonEmptyString(entry.workflowCode) || !codePattern.test(entry.workflowCode))) {
      throw new Error(`${label} has an invalid workflowCode.`);
    }

    const key = `${entry.moduleCode}::${entry.workflowCode ?? ''}`;
    if (keys.has(key)) throw new Error(`${label} duplicates a module/workflow key.`);
    keys.add(key);

    if (!isNonEmptyString(entry.customerName) || /legacy/i.test(entry.customerName)) {
      throw new Error(`${label} has an invalid customer-facing name.`);
    }
    if (!validMaturities.has(entry.maturity)) throw new Error(`${label} has an invalid maturity.`);
    if (!isNonEmptyString(entry.owner)) throw new Error(`${label} is missing owner.`);
    if (!validPriorities.has(entry.priority)) throw new Error(`${label} has an invalid priority.`);
    if (!Array.isArray(entry.promotionBlockers)
      || !entry.promotionBlockers.every(isNonEmptyString)) {
      throw new Error(`${label} has invalid promotionBlockers.`);
    }
    if (entry.promotionBlockers.length === 0
      && entry.maturity !== 'OPERATIONALLY_READY'
      && entry.maturity !== 'COMMERCIALLY_READY') {
      throw new Error(`${label} needs at least one promotion blocker.`);
    }
    if (entry.maturity === 'COMMERCIALLY_READY' && entry.promotionBlockers.length !== 0) {
      throw new Error(`${label} must not have promotion blockers when Commercially Ready.`);
    }
    requiredArrayFields.forEach((field) => {
      if (!hasNonEmptyStrings(entry[field])) throw new Error(`${label} is missing ${field}.`);
    });
    if (!isNonEmptyString(entry.targetPromotionMilestone)) {
      throw new Error(`${label} is missing targetPromotionMilestone.`);
    }
    if (!isNonEmptyString(entry.reviewDate) || !isIsoDate(entry.reviewDate)) {
      throw new Error(`${label} has an invalid reviewDate.`);
    }
    if (!isNonEmptyString(entry.changelogReference)) {
      throw new Error(`${label} is missing changelogReference.`);
    }
    if (entry.founderApproval !== undefined) {
      const approval = entry.founderApproval;
      if (!approval || typeof approval !== 'object'
        || approval.status !== 'APPROVED'
        || approval.approverRole !== 'Founder'
        || !isNonEmptyString(approval.decision)
        || !isNonEmptyString(approval.reference)) {
        throw new Error(`${label} has invalid structured Founder approval.`);
      }
    }
    if (entry.maturity === 'COMMERCIALLY_READY' && entry.founderApproval === undefined) {
      throw new Error(`${label} needs explicit structured Founder approval.`);
    }
  });
}

function readSurfaceProperty(source, property, sourceName) {
  const match = source.match(new RegExp(`\\b${property}:\\s*(?:'([^']+)'|\"([^\"]+)\"|(null))`));
  if (!match) throw new Error(`${sourceName} is missing ${property}.`);

  return match[1] ?? match[2] ?? null;
}

function parseSurfaceEntries(source, sourceName, pathProperty) {
  const objectSources = Array.from(source.matchAll(/\{([^{}]+)\}/g), (match) => match[1]);
  if (objectSources.length === 0) throw new Error(`${sourceName} contains no surface entries.`);

  return objectSources.map((objectSource, index) => {
    const entryName = `${sourceName} entry ${index + 1}`;
    const path = readSurfaceProperty(objectSource, pathProperty, entryName);
    const moduleCode = readSurfaceProperty(objectSource, 'moduleCode', entryName);
    const workflowCode = readSurfaceProperty(objectSource, 'workflowCode', entryName);

    if (path === null || moduleCode === null) throw new Error(`${entryName} has invalid route metadata.`);
    return { path, moduleCode, workflowCode };
  });
}

function assertExactRegistryEntries(entries, registry, sourceName) {
  const registryKeys = new Set(registry.map((entry) => `${entry.moduleCode}::${entry.workflowCode ?? ''}`));

  entries.forEach(({ path, moduleCode, workflowCode }) => {
    const registryKey = `${moduleCode}::${workflowCode ?? ''}`;
    if (!registryKeys.has(registryKey)) {
      throw new Error(`${sourceName} entry for ${path} does not have an exact registry entry.`);
    }
  });
}

const canonicalRouteConventionError = 'Route composition requires the canonical route import/symbol convention.';

function requiredSourceFile(program, suffix) {
  const sourceFiles = program.getSourceFiles().filter((sourceFile) => sourceFile.fileName.endsWith(suffix));
  if (sourceFiles.length !== 1) throw new Error(canonicalRouteConventionError);
  return sourceFiles[0];
}

function requiredFunctionSymbol(sourceFile, checker, name) {
  const declarations = sourceFile.statements.filter((statement) => (
    ts.isFunctionDeclaration(statement) && statement.name?.text === name
  ));
  const symbol = declarations.length === 1 && declarations[0].name
    ? checker.getSymbolAtLocation(declarations[0].name)
    : undefined;
  if (!symbol) throw new Error(canonicalRouteConventionError);
  return { declaration: declarations[0], symbol };
}

function requiredClassSymbol(sourceFile, checker, name) {
  const declarations = sourceFile.statements.filter((statement) => (
    ts.isClassDeclaration(statement) && statement.name?.text === name
  ));
  const symbol = declarations.length === 1 && declarations[0].name
    ? checker.getSymbolAtLocation(declarations[0].name)
    : undefined;
  if (!symbol) throw new Error(canonicalRouteConventionError);
  return { declaration: declarations[0], symbol };
}

function resolveAliasedSymbol(checker, symbol) {
  return symbol && (symbol.flags & ts.SymbolFlags.Alias)
    ? checker.getAliasedSymbol(symbol)
    : symbol;
}

function exactDefaultImportSymbol(sourceFile, checker, modulePath, localName, canonicalSymbol) {
  const imports = sourceFile.statements.filter((statement) => (
    ts.isImportDeclaration(statement)
      && ts.isStringLiteral(statement.moduleSpecifier)
      && statement.moduleSpecifier.text === modulePath
  ));
  const clause = imports.length === 1 ? imports[0].importClause : null;
  if (!clause
    || clause.isTypeOnly
    || !clause.name
    || clause.name.text !== localName
    || clause.namedBindings) throw new Error(canonicalRouteConventionError);
  const symbol = checker.getSymbolAtLocation(clause.name);
  if (!symbol || resolveAliasedSymbol(checker, symbol) !== canonicalSymbol) {
    throw new Error(canonicalRouteConventionError);
  }
  return symbol;
}

function exactNamedImportSymbols(sourceFile, checker, modulePath, importNames, canonicalSymbols) {
  const imports = sourceFile.statements.filter((statement) => (
    ts.isImportDeclaration(statement)
      && ts.isStringLiteral(statement.moduleSpecifier)
      && statement.moduleSpecifier.text === modulePath
  ));
  const clause = imports.length === 1 ? imports[0].importClause : null;
  const bindings = clause?.namedBindings;
  if (!clause
    || clause.isTypeOnly
    || clause.name
    || !bindings
    || !ts.isNamedImports(bindings)
    || bindings.elements.length !== importNames.length) throw new Error(canonicalRouteConventionError);

  const symbols = new Map();
  bindings.elements.forEach((element, index) => {
    const expectedName = importNames[index];
    if (element.isTypeOnly
      || element.propertyName
      || element.name.text !== expectedName) throw new Error(canonicalRouteConventionError);
    const symbol = checker.getSymbolAtLocation(element.name);
    if (!symbol || resolveAliasedSymbol(checker, symbol) !== canonicalSymbols.get(expectedName)) {
      throw new Error(canonicalRouteConventionError);
    }
    symbols.set(expectedName, symbol);
  });
  return symbols;
}

function assertCanonicalRouteSymbolConventions(program, appSourceFile) {
  const checker = program.getTypeChecker();
  const protectedSource = requiredSourceFile(program, '/components/ProtectedRoute.tsx');
  const platformProtectedSource = requiredSourceFile(program, '/components/PlatformProtectedRoute.tsx');
  const layoutSource = requiredSourceFile(program, '/components/Layout.tsx');
  const authorisedSource = requiredSourceFile(
    program,
    '/components/productMaturity/AuthorisedProductRoute.tsx',
  );
  const productMaturitySource = requiredSourceFile(
    program,
    '/components/productMaturity/ProductMaturitySurface.tsx',
  );
  const surfaceResolverSource = requiredSourceFile(program, '/productMaturity/surfaces.ts');
  const comingSoonSource = requiredSourceFile(
    program,
    '/components/productMaturity/ComingSoonWorkspace.tsx',
  );
  const maturityBadgeSource = requiredSourceFile(
    program,
    '/components/productMaturity/MaturityBadge.tsx',
  );
  const protectedRoute = requiredFunctionSymbol(protectedSource, checker, 'ProtectedRoute');
  const platformProtectedRoute = requiredFunctionSymbol(
    platformProtectedSource,
    checker,
    'PlatformProtectedRoute',
  );
  const layout = requiredFunctionSymbol(layoutSource, checker, 'Layout');
  const authorisedProductRoute = requiredFunctionSymbol(
    authorisedSource,
    checker,
    'AuthorisedProductRoute',
  );
  const productRouteSurface = requiredFunctionSymbol(
    authorisedSource,
    checker,
    'ProductRouteSurface',
  );
  const productMaturitySurface = requiredFunctionSymbol(
    productMaturitySource,
    checker,
    'ProductMaturitySurface',
  );
  const productMaturityPathError = requiredClassSymbol(
    surfaceResolverSource,
    checker,
    'ProductMaturityPathError',
  );
  const resolveProductSurface = requiredFunctionSymbol(
    surfaceResolverSource,
    checker,
    'resolveProductSurface',
  );
  const comingSoonWorkspace = requiredFunctionSymbol(
    comingSoonSource,
    checker,
    'ComingSoonWorkspace',
  );
  const maturityBadge = requiredFunctionSymbol(
    maturityBadgeSource,
    checker,
    'MaturityBadge',
  );

  const authorisedModuleSymbol = checker.getSymbolAtLocation(authorisedSource);
  const authorisedExports = authorisedModuleSymbol
    ? checker.getExportsOfModule(authorisedModuleSymbol)
    : [];
  const expectedAuthorisedExports = new Set([
    authorisedProductRoute.symbol,
    productRouteSurface.symbol,
  ]);
  if (authorisedExports.length !== expectedAuthorisedExports.size
    || authorisedExports.some((symbol) => !expectedAuthorisedExports.has(resolveAliasedSymbol(checker, symbol)))) {
    throw new Error(canonicalRouteConventionError);
  }

  const appAuthorisedImports = exactNamedImportSymbols(
    appSourceFile,
    checker,
    './components/productMaturity/AuthorisedProductRoute',
    ['AuthorisedProductRoute', 'ProductRouteSurface'],
    new Map([
      ['AuthorisedProductRoute', authorisedProductRoute.symbol],
      ['ProductRouteSurface', productRouteSurface.symbol],
    ]),
  );
  const authorisedMaturityImport = exactNamedImportSymbols(
    authorisedSource,
    checker,
    './ProductMaturitySurface',
    ['ProductMaturitySurface'],
    new Map([['ProductMaturitySurface', productMaturitySurface.symbol]]),
  );
  const productMaturityResolverImports = exactNamedImportSymbols(
    productMaturitySource,
    checker,
    '../../productMaturity/surfaces',
    ['ProductMaturityPathError', 'resolveProductSurface'],
    new Map([
      ['ProductMaturityPathError', productMaturityPathError.symbol],
      ['resolveProductSurface', resolveProductSurface.symbol],
    ]),
  );
  const productMaturityComingSoonImport = exactNamedImportSymbols(
    productMaturitySource,
    checker,
    './ComingSoonWorkspace',
    ['ComingSoonWorkspace'],
    new Map([['ComingSoonWorkspace', comingSoonWorkspace.symbol]]),
  );
  const productMaturityBadgeImport = exactNamedImportSymbols(
    productMaturitySource,
    checker,
    './MaturityBadge',
    ['MaturityBadge'],
    new Map([['MaturityBadge', maturityBadge.symbol]]),
  );

  return {
    checker,
    sourceFiles: { authorised: authorisedSource, productMaturity: productMaturitySource },
    canonical: {
      AuthorisedProductRoute: authorisedProductRoute,
      ProductRouteSurface: productRouteSurface,
      ProductMaturitySurface: productMaturitySurface,
    },
    app: {
      ProtectedRoute: exactDefaultImportSymbol(
        appSourceFile,
        checker,
        './components/ProtectedRoute',
        'ProtectedRoute',
        protectedRoute.symbol,
      ),
      PlatformProtectedRoute: exactDefaultImportSymbol(
        appSourceFile,
        checker,
        './components/PlatformProtectedRoute',
        'PlatformProtectedRoute',
        platformProtectedRoute.symbol,
      ),
      Layout: exactDefaultImportSymbol(
        appSourceFile,
        checker,
        './components/Layout',
        'Layout',
        layout.symbol,
      ),
      AuthorisedProductRoute: appAuthorisedImports.get('AuthorisedProductRoute'),
      ProductRouteSurface: appAuthorisedImports.get('ProductRouteSurface'),
    },
    authorised: {
      ProtectedRoute: exactDefaultImportSymbol(
        authorisedSource,
        checker,
        '../ProtectedRoute',
        'ProtectedRoute',
        protectedRoute.symbol,
      ),
      ProductRouteSurface: productRouteSurface.symbol,
      ProductMaturitySurface: authorisedMaturityImport.get('ProductMaturitySurface'),
    },
    productMaturity: {
      declaration: productMaturitySurface.declaration,
      ProductMaturityPathError: productMaturityResolverImports.get('ProductMaturityPathError'),
      resolveProductSurface: productMaturityResolverImports.get('resolveProductSurface'),
      ComingSoonWorkspace: productMaturityComingSoonImport.get('ComingSoonWorkspace'),
      MaturityBadge: productMaturityBadgeImport.get('MaturityBadge'),
    },
  };
}

const authLifecycleRouteComponents = new Map([
  ['/login', 'Login'],
  ['/auth/callback', 'AuthCallback'],
  ['/forgot-password', 'ForgotPassword'],
  ['/reset-password', 'ResetPassword'],
]);
const publicProductSurfaceRouteComponents = new Map([
  ['/register', 'Register'],
  ['/customer-acceptance/:token', 'CustomerAcceptancePublic'],
]);

function unwrapTransparentExpression(expression) {
  let unwrapped = expression;
  while (ts.isParenthesizedExpression(unwrapped)
    || ts.isAsExpression(unwrapped)
    || ts.isTypeAssertionExpression(unwrapped)
    || ts.isNonNullExpression(unwrapped)
    || ts.isSatisfiesExpression(unwrapped)) {
    unwrapped = unwrapped.expression;
  }
  return unwrapped;
}

function jsxTagIdentifier(element, expectedName, checker, expectedSymbol) {
  const opening = ts.isJsxElement(element) ? element.openingElement : element;
  return ts.isIdentifier(opening.tagName)
    && opening.tagName.text === expectedName
    && (!expectedSymbol || checker?.getSymbolAtLocation(opening.tagName) === expectedSymbol);
}

function significantJsxChildren(element) {
  if (!ts.isJsxElement(element)) return [];
  return element.children.filter((child) => (
    !(ts.isJsxText(child) && child.text.trim().length === 0)
      && !(ts.isJsxExpression(child) && !child.expression)
  ));
}

function isExactJsxComponent(element, componentName, checker, expectedSymbol) {
  const opening = ts.isJsxElement(element) ? element.openingElement : element;
  return jsxTagIdentifier(element, componentName, checker, expectedSymbol)
    && opening.attributes.properties.length === 0
    && (!ts.isJsxElement(element) || significantJsxChildren(element).length === 0);
}

function isExactJsxWrapper(element, componentName, childPredicate, checker, expectedSymbol) {
  if (!ts.isJsxElement(element)
    || !jsxTagIdentifier(element, componentName, checker, expectedSymbol)
    || element.openingElement.attributes.properties.length !== 0) return false;
  const children = significantJsxChildren(element);
  return children.length === 1 && childPredicate(children[0]);
}

function routeElementExpression(routeOpening, errorMessage) {
  const elementAttributes = routeOpening.attributes.properties.filter((attribute) => (
    ts.isJsxAttribute(attribute) && attribute.name.text === 'element'
  ));
  if (elementAttributes.length !== 1
    || !elementAttributes[0].initializer
    || !ts.isJsxExpression(elementAttributes[0].initializer)
    || !elementAttributes[0].initializer.expression) {
    throw new Error(errorMessage);
  }
  return elementAttributes[0].initializer.expression;
}

function isChildrenJsxExpression(node) {
  return ts.isJsxExpression(node)
    && Boolean(node.expression)
    && ts.isIdentifier(node.expression)
    && node.expression.text === 'children';
}

function hasExactExpressionAttribute(element, sourceFile, name, expressionText) {
  return element.openingElement.attributes.properties.some((attribute) => (
    ts.isJsxAttribute(attribute)
      && attribute.name.text === name
      && attribute.initializer
      && ts.isJsxExpression(attribute.initializer)
      && attribute.initializer.expression?.getText(sourceFile) === expressionText
  ));
}

function assertProductRouteHelperComposition(sourceFile, routeSymbols) {
  const { checker } = routeSymbols;
  const declarations = [];
  const visit = (node) => {
    if (ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.name.text === 'productRoute') declarations.push(node);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  const declaration = declarations.length === 1 ? declarations[0] : null;
  const initializer = declaration?.initializer;
  const body = initializer && ts.isArrowFunction(initializer)
    ? unwrapTransparentExpression(initializer.body)
    : null;
  if (!body
    || !ts.isJsxElement(body)
    || !jsxTagIdentifier(
      body,
      'AuthorisedProductRoute',
      checker,
      routeSymbols.app.AuthorisedProductRoute,
    )) {
    throw new Error('App productRoute helper must use the approved AuthorisedProductRoute composition.');
  }

  const attributes = body.openingElement.attributes.properties;
  const children = significantJsxChildren(body);
  if (attributes.length !== 2
    || !hasExactExpressionAttribute(body, sourceFile, 'allowedRoles', 'options.allowedRoles')
    || !hasExactExpressionAttribute(body, sourceFile, 'requiredEntitlement', 'options.requiredEntitlement')
    || children.length !== 1
    || !isChildrenJsxExpression(children[0])) {
    throw new Error('App productRoute helper must use the approved AuthorisedProductRoute composition.');
  }
  const productRouteSymbol = checker.getSymbolAtLocation(declaration.name);
  if (!productRouteSymbol) throw new Error(canonicalRouteConventionError);
  return productRouteSymbol;
}

function directFunctionReturnExpression(declaration) {
  if (!declaration?.body) return null;
  if (!ts.isBlock(declaration.body)) return unwrapTransparentExpression(declaration.body);
  const returns = declaration.body.statements.filter(ts.isReturnStatement);
  return returns.length === 1 && returns[0].expression
    ? unwrapTransparentExpression(returns[0].expression)
    : null;
}

function assertCanonicalAuthorisedProductRouteComposition(routeSymbols) {
  const { checker } = routeSymbols;
  const sourceFile = routeSymbols.sourceFiles.authorised;
  const functions = new Map((sourceFile?.statements ?? [])
    .filter((statement) => ts.isFunctionDeclaration(statement) && statement.name)
    .map((statement) => [statement.name.text, statement]));
  const productSurface = directFunctionReturnExpression(functions.get('ProductRouteSurface'));
  const authorisedRoute = directFunctionReturnExpression(functions.get('AuthorisedProductRoute'));

  const surfaceChildren = ts.isJsxElement(productSurface)
    ? significantJsxChildren(productSurface)
    : [];
  const validProductSurface = sourceFile
    && ts.isJsxElement(productSurface)
    && jsxTagIdentifier(
      productSurface,
      'ProductMaturitySurface',
      checker,
      routeSymbols.authorised.ProductMaturitySurface,
    )
    && productSurface.openingElement.attributes.properties.length === 2
    && hasExactExpressionAttribute(productSurface, sourceFile, 'pathname', 'location.pathname')
    && hasExactExpressionAttribute(productSurface, sourceFile, 'search', 'location.search')
    && surfaceChildren.length === 1
    && isChildrenJsxExpression(surfaceChildren[0]);

  const authorisedChildren = ts.isJsxElement(authorisedRoute)
    ? significantJsxChildren(authorisedRoute)
    : [];
  const surfaceChild = authorisedChildren.length === 1 ? authorisedChildren[0] : null;
  const nestedChildren = ts.isJsxElement(surfaceChild) ? significantJsxChildren(surfaceChild) : [];
  const validAuthorisedRoute = sourceFile
    && ts.isJsxElement(authorisedRoute)
    && jsxTagIdentifier(
      authorisedRoute,
      'ProtectedRoute',
      checker,
      routeSymbols.authorised.ProtectedRoute,
    )
    && authorisedRoute.openingElement.attributes.properties.length === 2
    && hasExactExpressionAttribute(authorisedRoute, sourceFile, 'allowedRoles', 'allowedRoles')
    && hasExactExpressionAttribute(authorisedRoute, sourceFile, 'requiredEntitlement', 'requiredEntitlement')
    && ts.isJsxElement(surfaceChild)
    && jsxTagIdentifier(
      surfaceChild,
      'ProductRouteSurface',
      checker,
      routeSymbols.authorised.ProductRouteSurface,
    )
    && surfaceChild.openingElement.attributes.properties.length === 0
    && nestedChildren.length === 1
    && isChildrenJsxExpression(nestedChildren[0]);

  if (!validProductSurface || !validAuthorisedRoute) {
    throw new Error('Canonical AuthorisedProductRoute must compose its guard before ProductRouteSurface.');
  }
}

function assertCanonicalProductMaturitySurfaceComposition(routeSymbols) {
  const { checker } = routeSymbols;
  const declaration = routeSymbols.productMaturity.declaration;
  if (!declaration.body) throw new Error(canonicalRouteConventionError);
  const counts = {
    resolveProductSurface: 0,
    ProductMaturityPathError: 0,
    ComingSoonWorkspace: 0,
    MaturityBadge: 0,
  };

  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = unwrapTransparentExpression(node.expression);
      if (ts.isIdentifier(callee) && callee.text === 'resolveProductSurface') {
        if (checker.getSymbolAtLocation(callee) !== routeSymbols.productMaturity.resolveProductSurface
          || node.arguments.length !== 2
          || node.arguments[0].getText(routeSymbols.sourceFiles.productMaturity) !== 'pathname'
          || node.arguments[1].getText(routeSymbols.sourceFiles.productMaturity) !== 'search') {
          throw new Error(canonicalRouteConventionError);
        }
        counts.resolveProductSurface += 1;
      }
    }
    if (ts.isBinaryExpression(node)
      && node.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword
      && ts.isIdentifier(node.right)
      && node.right.text === 'ProductMaturityPathError') {
      if (checker.getSymbolAtLocation(node.right) !== routeSymbols.productMaturity.ProductMaturityPathError) {
        throw new Error(canonicalRouteConventionError);
      }
      counts.ProductMaturityPathError += 1;
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (ts.isIdentifier(node.tagName) && node.tagName.text === 'ComingSoonWorkspace') {
        if (checker.getSymbolAtLocation(node.tagName) !== routeSymbols.productMaturity.ComingSoonWorkspace) {
          throw new Error(canonicalRouteConventionError);
        }
        counts.ComingSoonWorkspace += 1;
      }
      if (ts.isIdentifier(node.tagName) && node.tagName.text === 'MaturityBadge') {
        if (checker.getSymbolAtLocation(node.tagName) !== routeSymbols.productMaturity.MaturityBadge) {
          throw new Error(canonicalRouteConventionError);
        }
        counts.MaturityBadge += 1;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(declaration.body);

  if (Object.values(counts).some((count) => count !== 1)) {
    throw new Error(canonicalRouteConventionError);
  }
}

function discoverReactRouterPaths(sourceFile, checker, approvedRoutePaths, routeSymbols) {
  const directRouteImportSymbols = new Set();
  const namespaceImportSymbols = new Set();

  sourceFile.statements.forEach((statement) => {
    if (!ts.isImportDeclaration(statement)
      || !ts.isStringLiteral(statement.moduleSpecifier)
      || statement.moduleSpecifier.text !== 'react-router-dom') return;

    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      bindings.elements.forEach((element) => {
        if ((element.propertyName ?? element.name).text !== 'Route') return;
        const symbol = checker.getSymbolAtLocation(element.name);
        if (symbol) directRouteImportSymbols.add(symbol);
      });
    }
    if (bindings && ts.isNamespaceImport(bindings)) {
      const symbol = checker.getSymbolAtLocation(bindings.name);
      if (symbol) namespaceImportSymbols.add(symbol);
    }
  });

  if (directRouteImportSymbols.size === 0 && namespaceImportSymbols.size === 0) {
    throw new Error('App route source does not import React Router Route.');
  }

  const isReactRouterRouteTag = (tagName) => {
    if (ts.isIdentifier(tagName)) {
      return directRouteImportSymbols.has(checker.getSymbolAtLocation(tagName));
    }
    return ts.isPropertyAccessExpression(tagName)
      && tagName.name.text === 'Route'
      && ts.isIdentifier(tagName.expression)
      && namespaceImportSymbols.has(checker.getSymbolAtLocation(tagName.expression));
  };

  const containsRouteChild = (element) => element.children.some((child) => {
    if (ts.isJsxElement(child)) {
      return isReactRouterRouteTag(child.openingElement.tagName) || containsRouteChild(child);
    }
    if (ts.isJsxFragment(child)) return containsRouteChild(child);
    if (ts.isJsxSelfClosingElement(child)) return isReactRouterRouteTag(child.tagName);
    if (ts.isJsxExpression(child) && child.expression) {
      let found = false;
      const visitExpression = (node) => {
        if (found) return;
        if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
          && isReactRouterRouteTag(node.tagName)) {
          found = true;
          return;
        }
        ts.forEachChild(node, visitExpression);
      };
      visitExpression(child.expression);
      return found;
    }
    return false;
  });

  const paths = [];
  const routeRecords = [];
  const layoutRecords = [];
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (isReactRouterRouteTag(node.tagName)) {
        if (node.attributes.properties.some(ts.isJsxSpreadAttribute)) {
          throw new Error('React Router Route in App.tsx must not use spread attributes.');
        }

        const pathAttributes = node.attributes.properties.filter((attribute) => (
          ts.isJsxAttribute(attribute) && attribute.name.text === 'path'
        ));
        if (pathAttributes.length === 0) {
          const isStructuralLayoutRoute = ts.isJsxOpeningElement(node)
            && ts.isJsxElement(node.parent)
            && containsRouteChild(node.parent);
          if (!isStructuralLayoutRoute) {
            throw new Error('Every reachable React Router Route in App.tsx requires a path.');
          }
          layoutRecords.push({ opening: node, element: node.parent });
        } else {
          if (pathAttributes.length !== 1) {
            throw new Error('React Router Route path in App.tsx must be declared exactly once.');
          }
          const initializer = pathAttributes[0].initializer;
          let routePath;
          if (initializer && ts.isStringLiteral(initializer)) {
            routePath = initializer.text;
          } else if (initializer && ts.isJsxExpression(initializer)
            && initializer.expression
            && ts.isStringLiteralLike(initializer.expression)) {
            routePath = initializer.expression.text;
          } else {
            throw new Error('React Router Route path in App.tsx requires a static string literal.');
          }
          if (routePath.length === 0) {
            throw new Error('React Router Route path in App.tsx requires a non-empty static string literal.');
          }
          paths.push(routePath);
          routeRecords.push({ path: routePath, opening: node });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  if (paths.length === 0) throw new Error('App route source contains no route paths.');

  const isDescendantOf = (node, ancestor) => {
    let current = node.parent;
    while (current) {
      if (current === ancestor) return true;
      current = current.parent;
    }
    return false;
  };
  const layoutKind = new Map();
  layoutRecords.forEach((layout) => {
    const descendantPaths = routeRecords
      .filter((record) => isDescendantOf(record.opening, layout.element))
      .map((record) => record.path);
    const containsPlatformRoute = descendantPaths.includes('/platform');
    const expression = routeElementExpression(
      layout.opening,
      containsPlatformRoute
        ? 'Platform structural route requires the approved platform guard-before-maturity composition.'
        : 'Organisation structural route requires the approved organisation structural route composition.',
    );

    if (containsPlatformRoute) {
      const validPlatformLayout = isExactJsxWrapper(
        expression,
        'PlatformProtectedRoute',
        (surface) => isExactJsxWrapper(
          surface,
          'ProductRouteSurface',
          (shell) => isExactJsxComponent(shell, 'PlatformShell'),
          checker,
          routeSymbols.app.ProductRouteSurface,
        ),
        checker,
        routeSymbols.app.PlatformProtectedRoute,
      );
      if (!validPlatformLayout || descendantPaths.some((path) => path !== '/platform')) {
        throw new Error('Platform structural route requires the approved platform guard-before-maturity composition.');
      }
      layoutKind.set(layout, 'platform');
      return;
    }

    const validOrganisationLayout = isExactJsxWrapper(
      expression,
      'ProtectedRoute',
      (providers) => isExactJsxWrapper(
        providers,
        'WorkflowProviders',
        (shell) => isExactJsxComponent(
          shell,
          'Layout',
          checker,
          routeSymbols.app.Layout,
        ),
      ),
      checker,
      routeSymbols.app.ProtectedRoute,
    );
    if (!validOrganisationLayout) {
      throw new Error('Organisation structural route requires the approved organisation structural route composition.');
    }
    layoutKind.set(layout, 'organisation');
  });

  const platformLayouts = layoutRecords.filter((layout) => layoutKind.get(layout) === 'platform');
  const organisationLayouts = layoutRecords.filter((layout) => layoutKind.get(layout) === 'organisation');
  if (platformLayouts.length !== 1 || organisationLayouts.length !== 1) {
    throw new Error('App.tsx must contain exactly the approved platform and organisation structural routes.');
  }

  const nearestLayout = (routeOpening) => {
    let current = routeOpening.parent;
    while (current) {
      const layout = layoutRecords.find((candidate) => candidate.element === current);
      if (layout) return layout;
      current = current.parent;
    }
    return null;
  };

  const productRouteSymbol = assertProductRouteHelperComposition(sourceFile, routeSymbols);
  routeRecords.forEach(({ path: routePath, opening }) => {
    if (!approvedRoutePaths.has(routePath)) return;
    const expression = routeElementExpression(
      opening,
      `App route ${routePath} requires an approved route composition.`,
    );
    const layout = nearestLayout(opening);
    const kind = layout ? layoutKind.get(layout) : null;
    const authComponent = authLifecycleRouteComponents.get(routePath);
    if (authComponent) {
      if (kind !== null || !isExactJsxComponent(expression, authComponent)) {
        throw new Error(`App route ${routePath} requires its approved auth lifecycle composition.`);
      }
      return;
    }

    const publicComponent = publicProductSurfaceRouteComponents.get(routePath);
    if (publicComponent) {
      const validPublicSurface = kind === null && isExactJsxWrapper(
        expression,
        'ProductRouteSurface',
        (child) => isExactJsxComponent(child, publicComponent),
        checker,
        routeSymbols.app.ProductRouteSurface,
      );
      if (!validPublicSurface) {
        throw new Error(`App route ${routePath} requires its approved public ProductRouteSurface composition.`);
      }
      return;
    }

    if (routePath === '/platform') {
      if (kind !== 'platform' || !isExactJsxComponent(expression, 'PlatformAdmin')) {
        throw new Error('App route /platform requires its approved platform guard-before-maturity composition.');
      }
      return;
    }

    const unwrapped = unwrapTransparentExpression(expression);
    if (ts.isCallExpression(unwrapped)
      && ts.isIdentifier(unwrapped.expression)
      && unwrapped.expression.text === 'productRoute'
      && checker.getSymbolAtLocation(unwrapped.expression) !== productRouteSymbol) {
      throw new Error(canonicalRouteConventionError);
    }
    const validProductRoute = kind === 'organisation'
      && ts.isCallExpression(unwrapped)
      && ts.isIdentifier(unwrapped.expression)
      && unwrapped.expression.text === 'productRoute'
      && checker.getSymbolAtLocation(unwrapped.expression) === productRouteSymbol
      && (unwrapped.arguments.length === 1 || unwrapped.arguments.length === 2)
      && (ts.isJsxElement(unwrapped.arguments[0]) || ts.isJsxSelfClosingElement(unwrapped.arguments[0]));
    if (!validProductRoute) {
      throw new Error(`App route ${routePath} requires the approved productRoute composition.`);
    }
  });

  return paths;
}

function assertExactRoutePathMultiset(appRoutePaths, reachableRoutes) {
  const appCounts = new Map();
  const manifestCounts = new Map();
  appRoutePaths.forEach((routePath) => appCounts.set(routePath, (appCounts.get(routePath) ?? 0) + 1));
  reachableRoutes.forEach(({ path: routePath }) => (
    manifestCounts.set(routePath, (manifestCounts.get(routePath) ?? 0) + 1)
  ));

  const allPaths = [...new Set([...appCounts.keys(), ...manifestCounts.keys()])].sort();
  const mismatches = allPaths.filter((routePath) => (
    appCounts.get(routePath) !== manifestCounts.get(routePath)
  ));
  if (mismatches.length === 0) return;

  const details = mismatches.map((routePath) => (
    `${routePath} (App ${appCounts.get(routePath) ?? 0}, manifest ${manifestCounts.get(routePath) ?? 0})`
  ));
  throw new Error(`App route manifest mismatch: ${details.join(', ')}.`);
}

function assertWorkflowBoundaryReferences(root, productionSourcePaths, registry, program) {
  const checker = program.getTypeChecker();
  const registryKeys = new Set(registry.map((entry) => `${entry.moduleCode}::${entry.workflowCode ?? ''}`));
  const canonicalSource = program.getSourceFiles().find((sourceFile) => (
    sourceFile.fileName.endsWith('/components/productMaturity/WorkflowMaturityBoundary.tsx')
  ));
  const canonicalDeclaration = canonicalSource?.statements.find((statement) => (
    ts.isFunctionDeclaration(statement) && statement.name?.text === 'WorkflowMaturityBoundary'
  ));
  const canonicalSymbol = canonicalDeclaration?.name
    ? checker.getSymbolAtLocation(canonicalDeclaration.name)
    : undefined;
  if (!canonicalSymbol) throw new Error('Canonical WorkflowMaturityBoundary declaration is missing.');

  productionSourcePaths.forEach((sourcePath) => {
    const sourceFile = program.getSourceFile(resolve(root, sourcePath));
    if (!sourceFile) return;
    const isCanonicalSource = sourceFile === canonicalSource;
    let directImportSymbol;
    const canonicalModuleSuffix = 'components/productMaturity/WorkflowMaturityBoundary';
    const resolvesToCanonical = (symbol) => {
      if (!symbol) return false;
      if (symbol === canonicalSymbol) return true;
      return Boolean(symbol.flags & ts.SymbolFlags.Alias)
        && checker.getAliasedSymbol(symbol) === canonicalSymbol;
    };

    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
    const moduleExports = moduleSymbol ? checker.getExportsOfModule(moduleSymbol) : [];
    if (isCanonicalSource
      && (moduleExports.length !== 1 || !resolvesToCanonical(moduleExports[0]))) {
      throw new Error('Canonical WorkflowMaturityBoundary module must export only its required component declaration.');
    }
    if (!isCanonicalSource && moduleExports.some((exportSymbol) => resolvesToCanonical(exportSymbol))) {
      throw new Error(`WorkflowMaturityBoundary in ${sourcePath} must not be exported or re-exported.`);
    }

    sourceFile.statements.forEach((statement) => {
      if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
        const modulePath = statement.moduleSpecifier.text;
        const bindings = statement.importClause?.namedBindings;
        if (modulePath.endsWith(canonicalModuleSuffix)
          && (!bindings || ts.isNamespaceImport(bindings) || statement.importClause?.name)) {
          throw new Error(`WorkflowMaturityBoundary in ${sourcePath} requires its exact direct named import.`);
        }
        if (bindings && ts.isNamedImports(bindings)) {
          bindings.elements.forEach((element) => {
            if (modulePath.endsWith(canonicalModuleSuffix)
              && ((element.propertyName ?? element.name).text !== 'WorkflowMaturityBoundary'
                || element.name.text !== 'WorkflowMaturityBoundary')) {
              throw new Error(`WorkflowMaturityBoundary in ${sourcePath} permits only its exact named import from the canonical module.`);
            }
            const importSymbol = checker.getSymbolAtLocation(element.name);
            if (!resolvesToCanonical(importSymbol)) return;
            if (!modulePath.endsWith(canonicalModuleSuffix)
              || (element.propertyName ?? element.name).text !== 'WorkflowMaturityBoundary'
              || element.name.text !== 'WorkflowMaturityBoundary') {
              throw new Error(`WorkflowMaturityBoundary in ${sourcePath} requires its exact direct named import without aliases or barrels.`);
            }
            directImportSymbol = importSymbol;
          });
        }
      }
      if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        statement.exportClause.elements.forEach((element) => {
          if (resolvesToCanonical(checker.getSymbolAtLocation(element.name))) {
            throw new Error(`WorkflowMaturityBoundary in ${sourcePath} must not be re-exported.`);
          }
        });
      }
    });

    let visitedNodeCount = 0;

    function visit(node) {
      visitedNodeCount += 1;
      if (visitedNodeCount > 250000) {
        throw new Error(`WorkflowMaturityBoundary traversal budget exceeded in ${sourcePath}.`);
      }
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tagText = node.tagName.getText(sourceFile);
        const tagSymbolLocation = ts.isPropertyAccessExpression(node.tagName)
          ? node.tagName.name
          : node.tagName;
        const tagSymbol = checker.getSymbolAtLocation(tagSymbolLocation);
        if (resolvesToCanonical(tagSymbol)
          && (!ts.isIdentifier(node.tagName)
            || tagText !== 'WorkflowMaturityBoundary'
            || tagSymbol !== directImportSymbol)) {
          throw new Error(`WorkflowMaturityBoundary JSX tag in ${sourcePath} must use its exact direct identifier import.`);
        }
        if (tagText === 'WorkflowMaturityBoundary' && tagSymbol !== directImportSymbol) {
          throw new Error(`WorkflowMaturityBoundary JSX tag in ${sourcePath} is shadowed or unrelated.`);
        }
        const isBoundaryReference = tagText === 'WorkflowMaturityBoundary' && tagSymbol === directImportSymbol;

        if (isBoundaryReference) {
          if (node.attributes.properties.some(ts.isJsxSpreadAttribute)) {
            throw new Error(`WorkflowMaturityBoundary reference in ${sourcePath} must not use spread code props.`);
          }
          const attributes = new Map(node.attributes.properties
            .filter(ts.isJsxAttribute)
            .map((attribute) => [attribute.name.text, attribute.initializer]));
          const readLiteral = (name) => {
            const initializer = attributes.get(name);
            if (initializer && ts.isStringLiteral(initializer)) return initializer.text;
            if (initializer && ts.isJsxExpression(initializer)
              && initializer.expression
              && ts.isStringLiteralLike(initializer.expression)) return initializer.expression.text;
            return null;
          };
          const moduleCode = readLiteral('moduleCode');
          const workflowCode = readLiteral('workflowCode');
          if (!moduleCode || !workflowCode) {
            throw new Error(`WorkflowMaturityBoundary reference in ${sourcePath} has a missing or nonliteral code prop; moduleCode and workflowCode require a static string literal.`);
          }
          if (!registryKeys.has(`${moduleCode}::${workflowCode}`)) {
            throw new Error(`WorkflowMaturityBoundary reference in ${sourcePath} does not have an exact registry override: ${moduleCode}/${workflowCode}.`);
          }
        }
      }
      if (ts.isIdentifier(node) && resolvesToCanonical(checker.getSymbolAtLocation(node))) {
        const isCanonicalDeclarationName = isCanonicalSource
          && canonicalDeclaration?.name === node;
        const isImportName = ts.isImportSpecifier(node.parent);
        const isJsxTag = (ts.isJsxOpeningElement(node.parent)
          || ts.isJsxSelfClosingElement(node.parent)
          || ts.isJsxClosingElement(node.parent)) && node.parent.tagName === node;
        if (!isCanonicalDeclarationName && !isImportName && !isJsxTag) {
          throw new Error(`WorkflowMaturityBoundary in ${sourcePath} must only be referenced as its direct JSX tag.`);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  });
}

async function listCustomerUiSourcePaths(root) {
  const sourcePaths = [];

  async function visit(relativeDirectory) {
    const entries = await readdir(resolve(root, relativeDirectory), { withFileTypes: true });
    await Promise.all(entries.map(async (entry) => {
      const relativePath = `${relativeDirectory}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__' && !excludedCustomerUiDirectoryPaths.has(relativePath)) {
          await visit(relativePath);
        }
        return;
      }
      if (entry.isFile()
        && /\.tsx?$/.test(entry.name)
        && !/\.test\.tsx?$/.test(entry.name)
        && !excludedCustomerUiFiles.has(entry.name)) {
        sourcePaths.push(relativePath);
      }
    }));
  }

  await visit('src');
  return sourcePaths.sort();
}

async function listProductionTypeScriptSourcePaths(root) {
  const sourcePaths = [];
  async function visit(relativeDirectory) {
    const entries = await readdir(resolve(root, relativeDirectory), { withFileTypes: true });
    await Promise.all(entries.map(async (entry) => {
      const relativePath = `${relativeDirectory}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') await visit(relativePath);
        return;
      }
      if (entry.isFile()
        && /\.tsx?$/.test(entry.name)
        && !/\.test\.tsx?$/.test(entry.name)
        && entry.name !== 'setupTests.ts') sourcePaths.push(relativePath);
    }));
  }
  await visit('src');
  return sourcePaths.sort();
}

function isOutsideRoot(root, candidate) {
  const relativeCandidate = relative(root, candidate);
  return relativeCandidate === '..'
    || relativeCandidate.startsWith(`..${sep}`)
    || isAbsolute(relativeCandidate);
}

async function validateRepositoryReference(root, realRoot, reference, label) {
  const resolvedReference = resolve(root, reference);
  if (isAbsolute(reference) || relative(root, resolvedReference).length === 0 || isOutsideRoot(root, resolvedReference)) {
    throw new Error(`${label} must be a repository-relative path.`);
  }

  let realReference;
  try {
    realReference = await realpath(resolvedReference);
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`${label} does not exist: ${reference}.`);
    throw error;
  }

  if (isOutsideRoot(realRoot, realReference)) {
    throw new Error(`${label} resolves outside the repository: ${reference}.`);
  }
}

async function validateRegistryReferences(root, registry) {
  const realRoot = await realpath(root);
  let evidenceReferenceCount = 0;

  for (const [entryIndex, entry] of registry.entries()) {
    await validateRepositoryReference(
      root,
      realRoot,
      entry.changelogReference,
      `entry ${entryIndex + 1} changelog reference`,
    );
    for (const evidenceReference of entry.evidence) {
      await validateRepositoryReference(root, realRoot, evidenceReference, `entry ${entryIndex + 1} evidence reference`);
      evidenceReferenceCount += 1;
    }
    if (entry.founderApproval !== undefined) {
      await validateRepositoryReference(
        root,
        realRoot,
        entry.founderApproval.reference,
        `entry ${entryIndex + 1} Founder approval reference`,
      );
    }
  }

  return evidenceReferenceCount;
}

function recordVisibleStringNodeVisit(state) {
  state.nodeVisitCount += 1;
  if (state.nodeVisitCount > visibleStringNodeBudget) {
    throw new Error(`visible-string node budget exceeded (${visibleStringNodeBudget}).`);
  }
}

function recordVisibleStringSymbolVisit(state) {
  state.symbolVisitCount += 1;
  if (state.symbolVisitCount > visibleStringSymbolBudget) {
    throw new Error(`visible-string symbol budget exceeded (${visibleStringSymbolBudget}).`);
  }
}

function functionReturnExpressions(declaration, state) {
  const body = declaration.body;
  if (!body) return [];
  if (!ts.isBlock(body)) return [body];

  const returns = [];
  function visit(node) {
    recordVisibleStringNodeVisit(state);
    if (node !== body && ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node) && node.expression) {
      returns.push(node.expression);
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(body);
  return returns;
}

function boundedVisibleStringCandidates(values) {
  const candidates = [...new Set(values)];
  if (candidates.length > visibleStringCandidateBudget) {
    throw new Error(`visible-string candidate budget exceeded (${visibleStringCandidateBudget}).`);
  }
  return candidates;
}

function boundedStaticValues(values) {
  const candidates = [...new Map(values.map((value) => [
    `${value.kind}:${JSON.stringify(value.value)}`,
    value,
  ])).values()];
  if (candidates.length > visibleStringCandidateBudget) {
    throw new Error(`visible-string candidate budget exceeded (${visibleStringCandidateBudget}).`);
  }
  return candidates;
}

function composeStaticArrayValues(elementValueSets) {
  if (elementValueSets.some((values) => (
    values.length === 0 || values.some((value) => value.kind !== 'string')
  ))) return null;

  return elementValueSets.reduce((arrays, values) => boundedStaticValues(
    arrays.flatMap((arrayValue) => values.map((value) => ({
      kind: 'string-array',
      value: [...arrayValue.value, value.value],
    }))),
  ), [{ kind: 'string-array', value: [] }]);
}

function staticValuesToVisibleStrings(values) {
  return boundedVisibleStringCandidates(values.map((value) => (
    value.kind === 'string' ? value.value : value.value.join('')
  )));
}

function coerceStaticValueToString(value) {
  return value.kind === 'string' ? value.value : value.value.join(',');
}

function evaluateStaticConcat(receiverValues, argumentValueSets) {
  if (!receiverValues || argumentValueSets.some((values) => !values)) return null;

  return argumentValueSets.reduce((currentValues, argumentValues) => boundedStaticValues(
    currentValues.flatMap((receiverValue) => argumentValues.map((argumentValue) => {
      if (receiverValue.kind === 'string') {
        const coercedArgument = coerceStaticValueToString(argumentValue);
        return { kind: 'string', value: `${receiverValue.value}${coercedArgument}` };
      }
      return {
        kind: 'string-array',
        value: [
          ...receiverValue.value,
          ...(argumentValue.kind === 'string' ? [argumentValue.value] : argumentValue.value),
        ],
      };
    })),
  ), receiverValues);
}

function expandStaticStringReplacement(replacement, receiver, matchIndex, search) {
  const prefix = receiver.slice(0, matchIndex);
  const suffix = receiver.slice(matchIndex + search.length);
  let result = '';
  for (let index = 0; index < replacement.length; index += 1) {
    if (replacement[index] !== '$' || index + 1 >= replacement.length) {
      result += replacement[index];
      continue;
    }
    const token = replacement[index + 1];
    if (token === '$') result += '$';
    else if (token === '&') result += search;
    else if (token === '`') result += prefix;
    else if (token === "'") result += suffix;
    else {
      result += '$';
      continue;
    }
    index += 1;
  }
  return result;
}

function replaceStaticString(receiver, search, replacement, replaceAll) {
  if (!replaceAll) {
    const matchIndex = receiver.indexOf(search);
    if (matchIndex < 0) return receiver;
    return `${receiver.slice(0, matchIndex)}${expandStaticStringReplacement(
      replacement,
      receiver,
      matchIndex,
      search,
    )}${receiver.slice(matchIndex + search.length)}`;
  }

  if (search.length === 0) {
    let result = '';
    for (let index = 0; index <= receiver.length; index += 1) {
      result += expandStaticStringReplacement(replacement, receiver, index, search);
      if (index < receiver.length) result += receiver.slice(index, index + 1);
    }
    return result;
  }

  let result = '';
  let cursor = 0;
  while (cursor <= receiver.length) {
    const matchIndex = receiver.indexOf(search, cursor);
    if (matchIndex < 0) return `${result}${receiver.slice(cursor)}`;
    result += receiver.slice(cursor, matchIndex);
    result += expandStaticStringReplacement(replacement, receiver, matchIndex, search);
    cursor = matchIndex + search.length;
  }
  return result;
}

function evaluateStaticStringTransform(receiverValues, searchValues, replacementValues, replaceAll) {
  if (!receiverValues || !searchValues || !replacementValues
    || receiverValues.some((value) => value.kind !== 'string')
    || searchValues.some((value) => value.kind !== 'string')
    || replacementValues.some((value) => value.kind !== 'string')) return null;

  const results = new Map();
  receiverValues.forEach((receiverValue) => {
    searchValues.forEach((searchValue) => {
      replacementValues.forEach((replacementValue) => {
        const transformed = {
          kind: 'string',
          value: replaceStaticString(
            receiverValue.value,
            searchValue.value,
            replacementValue.value,
            replaceAll,
          ),
        };
        results.set(`${transformed.kind}:${JSON.stringify(transformed.value)}`, transformed);
        if (results.size > visibleStringCandidateBudget) {
          throw new Error(`visible-string candidate budget exceeded (${visibleStringCandidateBudget}).`);
        }
      });
    });
  });
  return [...results.values()];
}

function resolveVisibleStrings(
  expression,
  checker,
  nodePath = new Set(),
  depth = 0,
  bindings = new Map(),
  symbolPath = new Set(),
  state = { nodeVisitCount: 0, symbolVisitCount: 0 },
) {
  if (!expression) return [];
  if (depth > visibleStringDepthBudget) {
    throw new Error(`visible-string resolution depth exceeded (${visibleStringDepthBudget}).`);
  }
  recordVisibleStringNodeVisit(state);
  if (nodePath.has(expression)) return [];
  const nestedNodePath = new Set(nodePath);
  nestedNodePath.add(expression);
  const resolveNested = (nested) => resolveVisibleStrings(
    nested, checker, nestedNodePath, depth + 1, bindings, new Set(symbolPath), state,
  );

  if (ts.isStringLiteralLike(expression)) return [expression.text];
  if (ts.isParenthesizedExpression(expression)) return resolveNested(expression.expression);
  if (ts.isAsExpression(expression)
    || ts.isTypeAssertionExpression(expression)
    || ts.isNonNullExpression(expression)
    || ts.isSatisfiesExpression(expression)) {
    return resolveNested(expression.expression);
  }
  if (ts.isConditionalExpression(expression)) {
    return boundedVisibleStringCandidates([
      ...resolveNested(expression.whenTrue),
      ...resolveNested(expression.whenFalse),
    ]);
  }
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const leftValues = resolveNested(expression.left);
    const rightValues = resolveNested(expression.right);
    if (leftValues.length === 0 || rightValues.length === 0) {
      return boundedVisibleStringCandidates([...leftValues, ...rightValues]);
    }
    return boundedVisibleStringCandidates(
      leftValues.flatMap((left) => rightValues.map((right) => `${left}${right}`)),
    );
  }
  if (ts.isBinaryExpression(expression) && [
    ts.SyntaxKind.AmpersandAmpersandToken,
    ts.SyntaxKind.BarBarToken,
    ts.SyntaxKind.QuestionQuestionToken,
  ].includes(expression.operatorToken.kind)) {
    return boundedVisibleStringCandidates([
      ...resolveNested(expression.left),
      ...resolveNested(expression.right),
    ]);
  }
  if (ts.isTemplateExpression(expression)) {
    return expression.templateSpans.reduce((compositions, span) => {
      const values = resolveNested(span.expression);
      if (values.length === 0) {
        return boundedVisibleStringCandidates(compositions.map((value) => `${value}${span.literal.text}`));
      }
      return boundedVisibleStringCandidates(compositions.flatMap((composition) => values.map(
        (value) => `${composition}${value}${span.literal.text}`,
      )));
    }, [expression.head.text]);
  }
  if (ts.isArrayLiteralExpression(expression)) {
    return boundedVisibleStringCandidates(expression.elements.flatMap(resolveNested));
  }
  if (ts.isObjectLiteralExpression(expression)) {
    return boundedVisibleStringCandidates(expression.properties.flatMap((property) => {
      if (ts.isPropertyAssignment(property)) return resolveNested(property.initializer);
      if (ts.isShorthandPropertyAssignment(property)) return resolveNested(property.name);
      if (ts.isSpreadAssignment(property)) return resolveNested(property.expression);
      return [];
    }));
  }
  if (ts.isCallExpression(expression)) {
    const unwrapStaticExpression = (candidate) => {
      let unwrapped = candidate;
      while (ts.isParenthesizedExpression(unwrapped)
        || ts.isAsExpression(unwrapped)
        || ts.isTypeAssertionExpression(unwrapped)
        || ts.isNonNullExpression(unwrapped)
        || ts.isSatisfiesExpression(unwrapped)) {
        recordVisibleStringNodeVisit(state);
        unwrapped = unwrapped.expression;
      }
      return unwrapped;
    };
    const calleeExpression = unwrapStaticExpression(expression.expression);
    const propertyMethodAccess = ts.isPropertyAccessExpression(calleeExpression)
      ? calleeExpression
      : null;
    const elementMethodAccess = ts.isElementAccessExpression(calleeExpression)
      ? calleeExpression
      : null;
    const methodAccess = propertyMethodAccess ?? elementMethodAccess;
    const elementMethodNameExpression = elementMethodAccess?.argumentExpression
      ? unwrapStaticExpression(elementMethodAccess.argumentExpression)
      : null;
    const methodName = propertyMethodAccess?.name.text
      ?? (elementMethodNameExpression && ts.isStringLiteralLike(elementMethodNameExpression)
        ? elementMethodNameExpression.text
        : null);
    if (elementMethodAccess && methodName === null) {
      throw new Error('visible-string dynamic rendered method name could not be resolved safely.');
    }

    const resolveStaticValues = (
      candidate,
      sequenceSymbolPath = new Set(symbolPath),
      sequenceDepth = depth + 1,
    ) => {
      if (sequenceDepth > visibleStringDepthBudget) {
        throw new Error(`visible-string resolution depth exceeded (${visibleStringDepthBudget}).`);
      }
      const unwrapped = unwrapStaticExpression(candidate);
      if (ts.isArrayLiteralExpression(unwrapped)) {
        recordVisibleStringNodeVisit(state);
        if (unwrapped.elements.some(ts.isSpreadElement)) return null;
        return composeStaticArrayValues(
          unwrapped.elements.map((element) => resolveStaticValues(
            element,
            new Set(sequenceSymbolPath),
            sequenceDepth + 1,
          ) ?? []),
        );
      }
      if (ts.isConditionalExpression(unwrapped)) {
        const branchValues = [unwrapped.whenTrue, unwrapped.whenFalse].flatMap((branch) => (
          resolveStaticValues(
            branch,
            new Set(sequenceSymbolPath),
            sequenceDepth + 1,
          ) ?? []
        ));
        return branchValues.length > 0 ? boundedStaticValues(branchValues) : null;
      }
      if (ts.isIdentifier(unwrapped) || ts.isPropertyAccessExpression(unwrapped)) {
        recordVisibleStringNodeVisit(state);
        let sequenceSymbol = checker.getSymbolAtLocation(
          ts.isPropertyAccessExpression(unwrapped) ? unwrapped.name : unwrapped,
        );
        if (sequenceSymbol) recordVisibleStringSymbolVisit(state);
        if (sequenceSymbol && bindings.has(sequenceSymbol)) {
          return boundedStaticValues(bindings.get(sequenceSymbol).map((value) => ({
            kind: 'string',
            value,
          })));
        }
        if (sequenceSymbol && (sequenceSymbol.flags & ts.SymbolFlags.Alias)) {
          sequenceSymbol = checker.getAliasedSymbol(sequenceSymbol);
        }
        if (sequenceSymbol && sequenceSymbolPath.has(sequenceSymbol)) return null;
        const nestedSequenceSymbolPath = new Set(sequenceSymbolPath);
        if (sequenceSymbol) nestedSequenceSymbolPath.add(sequenceSymbol);
        const declarationValues = (sequenceSymbol?.declarations ?? []).flatMap((declaration) => {
          const initializer = ts.isVariableDeclaration(declaration)
            ? declaration.initializer
            : ts.isPropertyAssignment(declaration)
              ? declaration.initializer
              : null;
          if (!initializer) return [];
          return resolveStaticValues(
            initializer,
            nestedSequenceSymbolPath,
            sequenceDepth + 1,
          ) ?? [];
        });
        if (declarationValues.length > 0) {
          return boundedStaticValues(declarationValues);
        }
      }

      const type = checker.getTypeAtLocation(unwrapped);
      if ((type.flags & ts.TypeFlags.StringLike) === 0) return null;
      const values = resolveNested(unwrapped);
      return values.length > 0
        ? boundedStaticValues(values.map((value) => ({ kind: 'string', value })))
        : null;
    };

    const resolveStaticTransformValues = (
      candidate,
      transformSymbolPath = new Set(symbolPath),
      transformDepth = depth + 1,
    ) => {
      if (transformDepth > visibleStringDepthBudget) {
        throw new Error(`visible-string resolution depth exceeded (${visibleStringDepthBudget}).`);
      }
      const unwrapped = unwrapStaticExpression(candidate);
      if (ts.isStringLiteralLike(unwrapped)) return resolveStaticValues(unwrapped);
      if (ts.isConditionalExpression(unwrapped)) {
        const whenTrue = resolveStaticTransformValues(
          unwrapped.whenTrue,
          new Set(transformSymbolPath),
          transformDepth + 1,
        );
        const whenFalse = resolveStaticTransformValues(
          unwrapped.whenFalse,
          new Set(transformSymbolPath),
          transformDepth + 1,
        );
        return whenTrue && whenFalse
          ? boundedStaticValues([...whenTrue, ...whenFalse])
          : null;
      }
      if (ts.isIdentifier(unwrapped) || ts.isPropertyAccessExpression(unwrapped)) {
        recordVisibleStringNodeVisit(state);
        let transformSymbol = checker.getSymbolAtLocation(
          ts.isPropertyAccessExpression(unwrapped) ? unwrapped.name : unwrapped,
        );
        if (transformSymbol) recordVisibleStringSymbolVisit(state);
        if (transformSymbol && bindings.has(transformSymbol)) {
          return boundedStaticValues(bindings.get(transformSymbol).map((value) => ({
            kind: 'string',
            value,
          })));
        }
        if (transformSymbol && (transformSymbol.flags & ts.SymbolFlags.Alias)) {
          transformSymbol = checker.getAliasedSymbol(transformSymbol);
        }
        if (transformSymbol && transformSymbolPath.has(transformSymbol)) return null;
        const nestedTransformSymbolPath = new Set(transformSymbolPath);
        if (transformSymbol) nestedTransformSymbolPath.add(transformSymbol);
        const declarationValueSets = (transformSymbol?.declarations ?? []).map((declaration) => {
          const initializer = ts.isVariableDeclaration(declaration)
            ? declaration.initializer
            : ts.isPropertyAssignment(declaration)
              ? declaration.initializer
              : null;
          return initializer
            ? resolveStaticTransformValues(
              initializer,
              nestedTransformSymbolPath,
              transformDepth + 1,
            )
            : null;
        });
        if (declarationValueSets.length === 0 || declarationValueSets.some((values) => !values)) return null;
        return boundedStaticValues(declarationValueSets.flat());
      }
      if (ts.isCallExpression(unwrapped)) {
        const nestedCallee = unwrapStaticExpression(unwrapped.expression);
        const nestedPropertyAccess = ts.isPropertyAccessExpression(nestedCallee) ? nestedCallee : null;
        const nestedElementAccess = ts.isElementAccessExpression(nestedCallee) ? nestedCallee : null;
        const nestedMethodAccess = nestedPropertyAccess ?? nestedElementAccess;
        const nestedElementName = nestedElementAccess?.argumentExpression
          ? unwrapStaticExpression(nestedElementAccess.argumentExpression)
          : null;
        const nestedMethodName = nestedPropertyAccess?.name.text
          ?? (nestedElementName && ts.isStringLiteralLike(nestedElementName)
            ? nestedElementName.text
            : null);
        if (!nestedMethodAccess) return null;
        if (nestedMethodName === 'replace' || nestedMethodName === 'replaceAll') {
          if (unwrapped.arguments.length !== 2) return null;
          const nestedReceiverValues = resolveStaticTransformValues(
            nestedMethodAccess.expression,
            new Set(transformSymbolPath),
            transformDepth + 1,
          );
          const transformedValues = evaluateStaticStringTransform(
            nestedReceiverValues,
            resolveStaticTransformValues(
              unwrapped.arguments[0],
              new Set(transformSymbolPath),
              transformDepth + 1,
            ),
            resolveStaticTransformValues(
              unwrapped.arguments[1],
              new Set(transformSymbolPath),
              transformDepth + 1,
            ),
            nestedMethodName === 'replaceAll',
          );
          if (!transformedValues && nestedReceiverValues) {
            throw new Error('visible-string rendered string transform could not be resolved safely.');
          }
          return transformedValues;
        }
        if (nestedMethodName === 'concat') {
          const receiverValues = resolveStaticTransformValues(
            nestedMethodAccess.expression,
            new Set(transformSymbolPath),
            transformDepth + 1,
          );
          const argumentValueSets = unwrapped.arguments.map((argument) => resolveStaticTransformValues(
            argument,
            new Set(transformSymbolPath),
            transformDepth + 1,
          ));
          const values = evaluateStaticConcat(receiverValues, argumentValueSets);
          return values?.every((value) => value.kind === 'string') ? values : null;
        }
        if (nestedMethodName === 'join') {
          const receiverValues = resolveStaticValues(nestedMethodAccess.expression);
          const separatorValues = unwrapped.arguments.length === 0
            ? [{ kind: 'string', value: ',' }]
            : unwrapped.arguments.length === 1
              ? resolveStaticTransformValues(
                unwrapped.arguments[0],
                new Set(transformSymbolPath),
                transformDepth + 1,
              )
              : null;
          if (!receiverValues
            || receiverValues.some((value) => value.kind !== 'string-array')
            || !separatorValues) return null;
          return boundedStaticValues(receiverValues.flatMap((receiverValue) => separatorValues.map(
            (separatorValue) => ({
              kind: 'string',
              value: receiverValue.value.join(separatorValue.value),
            }),
          )));
        }
        return null;
      }
      return null;
    };

    const staticMethodReceiverValues = methodAccess
      && (methodName === 'join' || methodName === 'concat')
      ? resolveStaticValues(methodAccess.expression)
      : null;
    const isStaticTransformMethod = methodName === 'replace' || methodName === 'replaceAll';
    const staticTransformReceiverValues = methodAccess && isStaticTransformMethod
      ? resolveStaticTransformValues(methodAccess.expression)
      : null;

    if (methodAccess && methodName === 'join') {
      const separatorValues = expression.arguments.length === 0
        ? [{ kind: 'string', value: ',' }]
        : expression.arguments.length === 1
          ? resolveStaticValues(expression.arguments[0])
          : null;
      if (staticMethodReceiverValues
        && staticMethodReceiverValues.every((value) => value.kind === 'string-array')
        && separatorValues) {
        return boundedVisibleStringCandidates(staticMethodReceiverValues.flatMap((receiverValue) => (
          separatorValues.map((separatorValue) => receiverValue.value.join(
            coerceStaticValueToString(separatorValue),
          ))
        )));
      }
    }

    if (methodAccess && methodName === 'concat') {
      const concatenatedValues = evaluateStaticConcat(
        staticMethodReceiverValues,
        expression.arguments.map((argument) => resolveStaticValues(argument)),
      );
      if (concatenatedValues) return staticValuesToVisibleStrings(concatenatedValues);
    }

    if (methodAccess && (methodName === 'replace' || methodName === 'replaceAll')) {
      const searchValues = expression.arguments.length === 2
        ? resolveStaticTransformValues(expression.arguments[0])
        : null;
      const replacementValues = expression.arguments.length === 2
        ? resolveStaticTransformValues(expression.arguments[1])
        : null;
      const transformedValues = expression.arguments.length === 2
        ? evaluateStaticStringTransform(
          staticTransformReceiverValues,
          searchValues,
          replacementValues,
          methodName === 'replaceAll',
        )
        : null;
      if (transformedValues) return staticValuesToVisibleStrings(transformedValues);
    }

    const argumentValueSets = expression.arguments.map(resolveNested);
    const argumentStrings = argumentValueSets.flat();
    const receiverExpression = methodAccess ? unwrapStaticExpression(methodAccess.expression) : null;
    const receiverHasDirectStaticCopy = receiverExpression && (
      ts.isStringLiteralLike(receiverExpression)
      || ts.isTemplateExpression(receiverExpression)
      || ts.isArrayLiteralExpression(receiverExpression)
      || ts.isBinaryExpression(receiverExpression)
      || ts.isConditionalExpression(receiverExpression)
    );
    const receiverStrings = staticMethodReceiverValues
      ? staticValuesToVisibleStrings(staticMethodReceiverValues)
      : staticTransformReceiverValues
        ? staticValuesToVisibleStrings(staticTransformReceiverValues)
        : methodAccess && !isStaticTransformMethod && (
        receiverHasDirectStaticCopy
          || methodName === 'join'
          || methodName === 'concat'
      )
        ? resolveNested(methodAccess.expression)
        : [];
    const symbolLocation = propertyMethodAccess?.name ?? elementMethodAccess ?? expression.expression;
    let symbol = checker.getSymbolAtLocation(symbolLocation);
    if (symbol) recordVisibleStringSymbolVisit(state);
    if (symbol && (symbol.flags & ts.SymbolFlags.Alias)) symbol = checker.getAliasedSymbol(symbol);
    if (symbol && symbolPath.has(symbol)) return argumentStrings;
    const functionSymbolPath = new Set(symbolPath);
    if (symbol) functionSymbolPath.add(symbol);
    let resolvedFunction = false;
    const returnStrings = (symbol?.declarations ?? []).flatMap((declaration) => {
      let functionDeclaration = declaration;
      if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
        functionDeclaration = declaration.initializer;
      }
      if (!ts.isFunctionLike(functionDeclaration)
        || !functionDeclaration.body
        || functionDeclaration.parameters.length !== expression.arguments.length) return [];
      const callBindings = new Map(bindings);
      for (const [index, parameter] of functionDeclaration.parameters.entries()) {
        if (!ts.isIdentifier(parameter.name)) return [];
        const parameterSymbol = checker.getSymbolAtLocation(parameter.name);
        const argumentValues = argumentValueSets[index];
        if (parameterSymbol) recordVisibleStringSymbolVisit(state);
        if (!parameterSymbol || argumentValues.length === 0) return [];
        callBindings.set(parameterSymbol, argumentValues);
      }
      resolvedFunction = true;
      return functionReturnExpressions(functionDeclaration, state).flatMap((returnExpression) => resolveVisibleStrings(
        returnExpression, checker, nestedNodePath, depth + 1, callBindings, functionSymbolPath, state,
      ));
    });
    if (resolvedFunction) return boundedVisibleStringCandidates(returnStrings);
    if (receiverStrings.length > 0) {
      const unresolvedVisibleStrings = boundedVisibleStringCandidates([...receiverStrings, ...argumentStrings]);
      if (methodName === 'join' || methodName === 'concat') {
        throw new Error('visible-string rendered call receiver could not be resolved safely.');
      }
      if (methodName === 'replace' || methodName === 'replaceAll') {
        throw new Error('visible-string rendered string transform could not be resolved safely.');
      }
      return unresolvedVisibleStrings;
    }
    return boundedVisibleStringCandidates(argumentStrings);
  }
  if (ts.isIdentifier(expression) || ts.isPropertyAccessExpression(expression)) {
    let symbol = checker.getSymbolAtLocation(ts.isPropertyAccessExpression(expression) ? expression.name : expression);
    if (symbol) recordVisibleStringSymbolVisit(state);
    if (symbol && bindings.has(symbol)) return bindings.get(symbol);
    if (symbol && (symbol.flags & ts.SymbolFlags.Alias)) symbol = checker.getAliasedSymbol(symbol);
    if (symbol && symbolPath.has(symbol)) return [];
    const declarationSymbolPath = new Set(symbolPath);
    if (symbol) declarationSymbolPath.add(symbol);
    return boundedVisibleStringCandidates((symbol?.declarations ?? []).flatMap((declaration) => {
      if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
        return resolveVisibleStrings(
          declaration.initializer, checker, nestedNodePath, depth + 1, bindings, declarationSymbolPath, state,
        );
      }
      if (ts.isPropertyAssignment(declaration)) {
        return resolveVisibleStrings(
          declaration.initializer, checker, nestedNodePath, depth + 1, bindings, declarationSymbolPath, state,
        );
      }
      return [];
    }));
  }
  return [];
}

function customerVisibleStrings(sourceFile, checker) {
  const visibleStrings = [];
  const visibleMessageCallPattern = /^(?:alert|(?:set|show|open|enqueue)?(?:Snackbar|Toast|Notice)|(?:set|show)(?:.*(?:Error|Message|Notice|Toast)))$/i;
  const visibleJsxAttributes = new Set([
    'label', 'title', 'placeholder', 'helpertext', 'aria-label', 'alt', 'tooltip', 'description',
  ]);
  const customerCopyProperties = new Set([
    'label', 'shortLabel', 'message', 'title', 'placeholder', 'helperText', 'primary', 'secondary',
  ]);

  function visit(node) {
    if (ts.isJsxText(node)) visibleStrings.push(node.text);
    if (ts.isJsxAttribute(node)) {
      if (node.initializer && visibleJsxAttributes.has(node.name.text.toLowerCase())) {
        const expression = ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer;
        visibleStrings.push(...resolveVisibleStrings(expression, checker));
      }
      return;
    }
    if (ts.isJsxExpression(node) && node.expression) {
      visibleStrings.push(...resolveVisibleStrings(node.expression, checker));
    }
    if (ts.isPropertyAssignment(node)
      && customerCopyProperties.has(node.name.getText(sourceFile).replace(/^['"]|['"]$/g, ''))) {
      visibleStrings.push(...resolveVisibleStrings(node.initializer, checker));
    }
    if (ts.isCallExpression(node)) {
      const calleeName = ts.isIdentifier(node.expression)
        ? node.expression.text
        : ts.isPropertyAccessExpression(node.expression)
          ? node.expression.name.text
          : '';
      if (!visibleMessageCallPattern.test(calleeName)) {
        ts.forEachChild(node, visit);
        return;
      }
      node.arguments.forEach((argument) => {
        visibleStrings.push(...resolveVisibleStrings(argument, checker));
      });
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return visibleStrings;
}

function findCustomerVisibleLegacyViolations(root, customerUiSourcePaths, program) {
  const checker = program.getTypeChecker();

  return customerUiSourcePaths.filter((sourcePath) => {
    const sourceFile = program.getSourceFile(resolve(root, sourcePath));
    return sourceFile && customerVisibleStrings(sourceFile, checker).some((value) => /legacy/i.test(value));
  });
}

async function verifyProductMaturityRegistry(root) {
  const registryPath = resolve(root, 'src/productMaturity/product-maturity-registry.json');
  const routeManifestPath = resolve(root, 'src/productMaturity/surfaces.ts');
  const appPath = resolve(root, 'src/App.tsx');
  const [registrySource, routeManifestSource, customerUiSourcePaths, productionSourcePaths] = await Promise.all([
    readFile(registryPath, 'utf8'),
    readFile(routeManifestPath, 'utf8'),
    listCustomerUiSourcePaths(root),
    listProductionTypeScriptSourcePaths(root),
  ]);
  const productionProgram = ts.createProgram(
    productionSourcePaths.map((sourcePath) => resolve(root, sourcePath)),
    {
      allowJs: false,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      target: ts.ScriptTarget.ESNext,
    },
  );
  const registry = JSON.parse(registrySource);

  validateRegistry(registry);
  const evidenceReferenceCount = await validateRegistryReferences(root, registry);

  const manifestBlock = routeManifestSource.match(
    /export const REACHABLE_PRODUCT_ROUTES\s*=\s*\[([\s\S]*?)\]\s*as const/,
  )?.[1];
  if (!manifestBlock) throw new Error('Reachable route manifest is missing.');

  const reachableRoutes = parseSurfaceEntries(manifestBlock, 'Reachable route manifest', 'path');
  assertExactRegistryEntries(reachableRoutes, registry, 'Reachable route manifest');

  const querySurfaceBlock = routeManifestSource.match(
    /export const PRODUCT_SURFACES[\s\S]*?=\s*\[([\s\S]*?)\.\.\.routeSurfaces/,
  )?.[1];
  if (querySurfaceBlock === undefined) throw new Error('Product surface manifest is missing.');

  const querySurfaces = parseSurfaceEntries(querySurfaceBlock, 'Query-driven product surface manifest', 'routePattern');
  assertExactRegistryEntries(querySurfaces, registry, 'Query-driven product surface manifest');
  assertWorkflowBoundaryReferences(root, productionSourcePaths, registry, productionProgram);

  const appSourceFile = productionProgram.getSourceFile(appPath);
  if (!appSourceFile) throw new Error('App route source is missing from the TypeScript Program.');
  const routeSymbols = assertCanonicalRouteSymbolConventions(productionProgram, appSourceFile);
  assertCanonicalAuthorisedProductRouteComposition(routeSymbols);
  assertCanonicalProductMaturitySurfaceComposition(routeSymbols);
  const appRoutePaths = discoverReactRouterPaths(
    appSourceFile,
    productionProgram.getTypeChecker(),
    new Set(reachableRoutes.map(({ path: routePath }) => routePath)),
    routeSymbols,
  );
  assertExactRoutePathMultiset(appRoutePaths, reachableRoutes);

  const legacyViolations = findCustomerVisibleLegacyViolations(root, customerUiSourcePaths, productionProgram);
  if (legacyViolations.length > 0) {
    throw new Error(`Customer-facing Legacy violation(s): ${legacyViolations.join(', ')}.`);
  }

  const moduleCount = registry.filter((entry) => entry.workflowCode === null).length;
  const workflowCount = registry.length - moduleCount;

  return {
    moduleCount,
    workflowCount,
    routeCount: appRoutePaths.length,
    customerUiSourceCount: customerUiSourcePaths.length,
    evidenceReferenceCount,
  };
}

try {
  const root = resolveVerifierRoot(process.argv.slice(2));
  const {
    moduleCount,
    workflowCount,
    routeCount,
    customerUiSourceCount,
    evidenceReferenceCount,
  } = await verifyProductMaturityRegistry(root);
  console.log(
    `Product maturity registry verified: ${moduleCount} modules and ${workflowCount} workflows classified; ${routeCount} App routes checked; ${customerUiSourceCount} customer UI source files checked; ${evidenceReferenceCount} evidence references checked; 0 customer-facing Legacy violations.`,
  );
} catch (error) {
  console.error(`Product maturity registry verification failed: ${error.message}`);
  process.exitCode = 1;
}
