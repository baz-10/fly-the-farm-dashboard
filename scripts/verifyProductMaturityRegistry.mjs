import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = resolve(root, 'src/productMaturity/product-maturity-registry.json');
const routeManifestPath = resolve(root, 'src/productMaturity/surfaces.ts');
const appPath = resolve(root, 'src/App.tsx');
const customerFacingSourcePaths = [
  'src/navigation/organisationNavigation.tsx',
  'src/components/Layout.tsx',
  'src/components/productMaturity/ComingSoonWorkspace.tsx',
  'src/components/productMaturity/MaturityBadge.tsx',
  'src/components/productMaturity/ProductMaturitySurface.tsx',
  'src/components/productMaturity/WorkflowMaturityBoundary.tsx',
];

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

    if (!isNonEmptyString(entry.customerName) || /Legacy/.test(entry.customerName)) {
      throw new Error(`${label} has an invalid customer-facing name.`);
    }
    if (!validMaturities.has(entry.maturity)) throw new Error(`${label} has an invalid maturity.`);
    if (!isNonEmptyString(entry.owner)) throw new Error(`${label} is missing owner.`);
    if (!validPriorities.has(entry.priority)) throw new Error(`${label} has an invalid priority.`);
    if (!Array.isArray(entry.promotionBlockers)
      || !entry.promotionBlockers.every(isNonEmptyString)) {
      throw new Error(`${label} has invalid promotionBlockers.`);
    }
    if (entry.promotionBlockers.length === 0 && entry.maturity !== 'OPERATIONALLY_READY') {
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
      && !entry.evidence.some((evidence) => /founder approval/i.test(evidence))) {
      throw new Error(`${label} needs explicit Founder approval evidence.`);
    }
  });
}

function extractRoutePaths(source, expression, sourceName) {
  const paths = Array.from(source.matchAll(expression), (match) => match[1]);
  if (paths.length === 0) throw new Error(`${sourceName} contains no route paths.`);
  return paths;
}

async function verifyProductMaturityRegistry() {
  const [registrySource, routeManifestSource, appSource, ...customerFacingSources] = await Promise.all([
    readFile(registryPath, 'utf8'),
    readFile(routeManifestPath, 'utf8'),
    readFile(appPath, 'utf8'),
    ...customerFacingSourcePaths.map((sourcePath) => readFile(resolve(root, sourcePath), 'utf8')),
  ]);
  const registry = JSON.parse(registrySource);

  validateRegistry(registry);

  const manifestBlock = routeManifestSource.match(
    /export const REACHABLE_PRODUCT_ROUTES\s*=\s*\[([\s\S]*?)\]\s*as const/,
  )?.[1];
  if (!manifestBlock) throw new Error('Reachable route manifest is missing.');

  const manifestPaths = new Set(extractRoutePaths(
    manifestBlock,
    /\bpath:\s*['"]([^'"]+)['"]/g,
    'Reachable route manifest',
  ));
  const appRoutePaths = extractRoutePaths(appSource, /<Route\s+path\s*=\s*['"]([^'"]+)['"]/g, 'App route source');
  const missingManifestRoutes = appRoutePaths.filter((routePath) => !manifestPaths.has(routePath));
  if (missingManifestRoutes.length > 0) {
    throw new Error(`Reachable route manifest is missing ${missingManifestRoutes.length} App route literal(s).`);
  }

  const legacyViolations = customerFacingSources.flatMap((source, index) =>
    /Legacy/.test(source) ? [customerFacingSourcePaths[index]] : [],
  );
  if (legacyViolations.length > 0) {
    throw new Error(`Customer-facing Legacy violation(s): ${legacyViolations.join(', ')}.`);
  }

  const moduleCount = registry.filter((entry) => entry.workflowCode === null).length;
  const workflowCount = registry.length - moduleCount;

  return { moduleCount, workflowCount, routeCount: appRoutePaths.length };
}

try {
  const { moduleCount, workflowCount, routeCount } = await verifyProductMaturityRegistry();
  console.log(
    `Product maturity registry verified: ${moduleCount} modules and ${workflowCount} workflows classified; ${routeCount} App routes checked; 0 customer-facing Legacy violations.`,
  );
} catch (error) {
  console.error(`Product maturity registry verification failed: ${error.message}`);
  process.exitCode = 1;
}
