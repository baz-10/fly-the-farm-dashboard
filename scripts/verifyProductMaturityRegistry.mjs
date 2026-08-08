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
    if (sourceFile === canonicalSource) return;
    let directImportSymbol;
    const canonicalModuleSuffix = 'components/productMaturity/WorkflowMaturityBoundary';
    const resolvesToCanonical = (symbol) => {
      if (!symbol) return false;
      if (symbol === canonicalSymbol) return true;
      return Boolean(symbol.flags & ts.SymbolFlags.Alias)
        && checker.getAliasedSymbol(symbol) === canonicalSymbol;
    };

    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
    if (moduleSymbol && checker.getExportsOfModule(moduleSymbol).some((exportSymbol) => (
      resolvesToCanonical(exportSymbol)
    ))) {
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
        const isImportName = ts.isImportSpecifier(node.parent);
        const isJsxTag = (ts.isJsxOpeningElement(node.parent)
          || ts.isJsxSelfClosingElement(node.parent)
          || ts.isJsxClosingElement(node.parent)) && node.parent.tagName === node;
        if (!isImportName && !isJsxTag) {
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

function functionReturnExpressions(declaration) {
  const body = declaration.body;
  if (!body) return [];
  if (!ts.isBlock(body)) return [body];

  const returns = [];
  function visit(node) {
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

function resolveVisibleStrings(expression, checker, seen = new Set(), depth = 0, bindings = new Map()) {
  if (!expression || depth > 32 || seen.has(expression)) return [];
  seen.add(expression);
  const resolveNested = (nested) => resolveVisibleStrings(nested, checker, seen, depth + 1, bindings);

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
    const argumentValueSets = expression.arguments.map(resolveNested);
    const argumentStrings = argumentValueSets.flat();
    const symbolLocation = ts.isPropertyAccessExpression(expression.expression)
      ? expression.expression.name
      : expression.expression;
    let symbol = checker.getSymbolAtLocation(symbolLocation);
    if (symbol && (symbol.flags & ts.SymbolFlags.Alias)) symbol = checker.getAliasedSymbol(symbol);
    let resolvedFunction = false;
    const returnStrings = (symbol?.declarations ?? []).flatMap((declaration) => {
      let functionDeclaration = declaration;
      if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
        functionDeclaration = declaration.initializer;
      }
      if (!ts.isFunctionLike(functionDeclaration)
        || functionDeclaration.parameters.length !== expression.arguments.length) return [];
      const callBindings = new Map(bindings);
      for (const [index, parameter] of functionDeclaration.parameters.entries()) {
        if (!ts.isIdentifier(parameter.name)) return [];
        const parameterSymbol = checker.getSymbolAtLocation(parameter.name);
        const argumentValues = argumentValueSets[index];
        if (!parameterSymbol || argumentValues.length === 0) return [];
        callBindings.set(parameterSymbol, argumentValues);
      }
      resolvedFunction = true;
      return functionReturnExpressions(functionDeclaration).flatMap((returnExpression) => resolveVisibleStrings(
        returnExpression, checker, new Set(seen), depth + 1, callBindings,
      ));
    });
    return boundedVisibleStringCandidates(resolvedFunction ? returnStrings : argumentStrings);
  }
  if (ts.isIdentifier(expression) || ts.isPropertyAccessExpression(expression)) {
    let symbol = checker.getSymbolAtLocation(ts.isPropertyAccessExpression(expression) ? expression.name : expression);
    if (symbol && bindings.has(symbol)) return bindings.get(symbol);
    if (symbol && (symbol.flags & ts.SymbolFlags.Alias)) symbol = checker.getAliasedSymbol(symbol);
    return boundedVisibleStringCandidates((symbol?.declarations ?? []).flatMap((declaration) => {
      if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
        return resolveNested(declaration.initializer);
      }
      if (ts.isPropertyAssignment(declaration)) {
        return resolveNested(declaration.initializer);
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
  const [registrySource, routeManifestSource, appSource, customerUiSourcePaths, productionSourcePaths] = await Promise.all([
    readFile(registryPath, 'utf8'),
    readFile(routeManifestPath, 'utf8'),
    readFile(appPath, 'utf8'),
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

  const manifestPaths = new Set(reachableRoutes.map((route) => route.path));
  const appRoutePaths = Array.from(
    appSource.matchAll(/<Route\s+path\s*=\s*['"]([^'"]+)['"]/g),
    (match) => match[1],
  );
  if (appRoutePaths.length === 0) throw new Error('App route source contains no route paths.');
  const missingManifestRoutes = appRoutePaths.filter((routePath) => !manifestPaths.has(routePath));
  if (missingManifestRoutes.length > 0) {
    throw new Error(`Reachable route manifest is missing ${missingManifestRoutes.length} App route literal(s).`);
  }

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
