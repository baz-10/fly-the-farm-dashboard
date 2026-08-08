import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const customerUiSourceRoots = ['src/pages', 'src/components', 'src/navigation'];

const validMaturities = new Set([
  'COMMERCIALLY_READY',
  'OPERATIONALLY_READY',
  'BETA',
  'COMING_SOON',
]);
const validPriorities = new Set(['P0', 'P1', 'P2', 'P3']);
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
    if (!isNonEmptyString(entry.moduleCode)) throw new Error(`${label} is missing moduleCode.`);
    if (entry.workflowCode !== null && !isNonEmptyString(entry.workflowCode)) {
      throw new Error(`${label} has an invalid workflowCode.`);
    }

    const key = `${entry.moduleCode}::${entry.workflowCode ?? ''}`;
    if (keys.has(key)) throw new Error(`${label} duplicates a module/workflow key.`);
    keys.add(key);

    if (!isNonEmptyString(entry.customerName) || /\bLegacy\b/i.test(entry.customerName)) {
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
    if (entry.maturity === 'COMMERCIALLY_READY'
      && !entry.evidence.some((evidence) => /founder[ -]approval/i.test(evidence))) {
      throw new Error(`${label} needs explicit Founder approval evidence.`);
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

async function listCustomerUiSourcePaths(root) {
  const sourcePaths = [];

  async function visit(relativeDirectory) {
    const entries = await readdir(resolve(root, relativeDirectory), { withFileTypes: true });
    await Promise.all(entries.map(async (entry) => {
      const relativePath = `${relativeDirectory}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') await visit(relativePath);
        return;
      }
      if (entry.isFile() && entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx')) {
        sourcePaths.push(relativePath);
      }
    }));
  }

  await Promise.all(customerUiSourceRoots.map(visit));
  return sourcePaths.sort();
}

async function validateEvidenceReferences(root, registry) {
  let evidenceReferenceCount = 0;

  for (const [entryIndex, entry] of registry.entries()) {
    for (const evidenceReference of entry.evidence) {
      const resolvedReference = resolve(root, evidenceReference);
      const repositoryRelativeReference = relative(root, resolvedReference);
      const leavesRepository = repositoryRelativeReference === '..'
        || repositoryRelativeReference.startsWith(`..${sep}`)
        || isAbsolute(repositoryRelativeReference);

      if (isAbsolute(evidenceReference) || repositoryRelativeReference.length === 0 || leavesRepository) {
        throw new Error(`entry ${entryIndex + 1} evidence reference must be a repository-relative path.`);
      }

      try {
        await stat(resolvedReference);
      } catch (error) {
        if (error?.code === 'ENOENT') {
          throw new Error(`entry ${entryIndex + 1} evidence reference does not exist: ${evidenceReference}.`);
        }
        throw error;
      }
      evidenceReferenceCount += 1;
    }
  }

  return evidenceReferenceCount;
}

async function verifyProductMaturityRegistry(root) {
  const registryPath = resolve(root, 'src/productMaturity/product-maturity-registry.json');
  const routeManifestPath = resolve(root, 'src/productMaturity/surfaces.ts');
  const appPath = resolve(root, 'src/App.tsx');
  const [registrySource, routeManifestSource, appSource, customerUiSourcePaths] = await Promise.all([
    readFile(registryPath, 'utf8'),
    readFile(routeManifestPath, 'utf8'),
    readFile(appPath, 'utf8'),
    listCustomerUiSourcePaths(root),
  ]);
  const registry = JSON.parse(registrySource);

  validateRegistry(registry);
  const evidenceReferenceCount = await validateEvidenceReferences(root, registry);

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

  const customerUiSources = await Promise.all(
    customerUiSourcePaths.map((sourcePath) => readFile(resolve(root, sourcePath), 'utf8')),
  );
  const legacyViolations = customerUiSources.flatMap((source, index) =>
    /\bLegacy\b/i.test(source) ? [customerUiSourcePaths[index]] : [],
  );
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
