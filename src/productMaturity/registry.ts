import registryManifest from './product-maturity-registry.json';
import { ProductMaturity, ProductMaturityEntry } from './types';

const VALID_MATURITIES: ReadonlySet<ProductMaturity> = new Set<ProductMaturity>([
  'COMMERCIALLY_READY',
  'OPERATIONALLY_READY',
  'BETA',
  'COMING_SOON',
]);
const VALID_PRIORITIES = new Set(['P0', 'P1', 'P2', 'P3']);
const CODE_PATTERN = /^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)*$/;
const REQUIRED_ARRAY_FIELDS: Array<keyof Pick<ProductMaturityEntry,
  'evidence' | 'requiredAutomatedTests' | 'requiredManualAcceptance' | 'requiredOperationalEvidence'>> = [
  'evidence',
  'requiredAutomatedTests',
  'requiredManualAcceptance',
  'requiredOperationalEvidence',
];

export class ProductMaturityConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductMaturityConfigurationError';
  }
}

const hasNonEmptyStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length > 0 && value.every(item => typeof item === 'string' && item.trim().length > 0);

const isIsoDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const configurationError = (entry: Partial<ProductMaturityEntry>, message: string): ProductMaturityConfigurationError =>
  new ProductMaturityConfigurationError(`Invalid product maturity registry entry ${entry.moduleCode ?? '(missing module)'}${entry.workflowCode ? `/${entry.workflowCode}` : ''}: ${message}`);

export function assertValidRegistry(registry: readonly ProductMaturityEntry[]): void {
  if (!Array.isArray(registry) || registry.length === 0) {
    throw new ProductMaturityConfigurationError('Product maturity registry must contain at least one entry.');
  }

  const keys = new Set<string>();
  registry.forEach((entry: ProductMaturityEntry) => {
    if (!entry || typeof entry !== 'object') {
      throw new ProductMaturityConfigurationError('Product maturity registry contains a non-object entry.');
    }
    if (typeof entry.moduleCode !== 'string' || !CODE_PATTERN.test(entry.moduleCode)) {
      throw configurationError(entry, 'moduleCode must be a stable lowercase dot-separated code.');
    }
    if (entry.workflowCode !== null && (typeof entry.workflowCode !== 'string' || !CODE_PATTERN.test(entry.workflowCode))) {
      throw configurationError(entry, 'workflowCode must be null or a stable lowercase dot-separated code.');
    }
    const key = `${entry.moduleCode}/${entry.workflowCode ?? ''}`;
    if (keys.has(key)) throw configurationError(entry, 'moduleCode/workflowCode must be unique.');
    keys.add(key);

    if (typeof entry.customerName !== 'string' || entry.customerName.trim().length === 0) {
      throw configurationError(entry, 'customerName is required.');
    }
    if (/legacy/i.test(entry.customerName)) {
      throw configurationError(entry, 'customer-facing customerName must not contain Legacy.');
    }
    if (!VALID_MATURITIES.has(entry.maturity)) {
      throw configurationError(entry, 'maturity is unknown.');
    }
    if (typeof entry.owner !== 'string' || entry.owner.trim().length === 0) {
      throw configurationError(entry, 'owner is required.');
    }
    if (!VALID_PRIORITIES.has(entry.priority)) {
      throw configurationError(entry, 'priority is invalid.');
    }
    if (!Array.isArray(entry.promotionBlockers) || !entry.promotionBlockers.every(blocker => typeof blocker === 'string' && blocker.trim().length > 0)) {
      throw configurationError(entry, 'promotionBlockers must be an array of non-empty strings.');
    }
    if (entry.maturity !== 'OPERATIONALLY_READY'
      && entry.maturity !== 'COMMERCIALLY_READY'
      && entry.promotionBlockers.length === 0) {
      throw configurationError(entry, 'non-operational entries require promotion blockers.');
    }
    REQUIRED_ARRAY_FIELDS.forEach(field => {
      if (!hasNonEmptyStrings(entry[field])) throw configurationError(entry, `${field} is required.`);
    });
    if (typeof entry.targetPromotionMilestone !== 'string' || entry.targetPromotionMilestone.trim().length === 0) {
      throw configurationError(entry, 'targetPromotionMilestone is required.');
    }
    if (!isIsoDate(entry.reviewDate)) throw configurationError(entry, 'reviewDate must be a valid ISO date.');
    if (typeof entry.changelogReference !== 'string' || entry.changelogReference.trim().length === 0) {
      throw configurationError(entry, 'changelogReference is required.');
    }
    if (entry.maturity === 'COMMERCIALLY_READY' && !entry.evidence.some(item => /founder[ -]approval/i.test(item))) {
      throw configurationError(entry, 'Commercially Ready entries require explicit Founder approval evidence.');
    }
  });
}

export const PRODUCT_MATURITY_REGISTRY: readonly ProductMaturityEntry[] = registryManifest as ProductMaturityEntry[];

assertValidRegistry(PRODUCT_MATURITY_REGISTRY);

export function getMaturityEntry(moduleCode: string, workflowCode?: string): ProductMaturityEntry {
  if (workflowCode) {
    const workflowEntry = PRODUCT_MATURITY_REGISTRY.find(entry =>
      entry.moduleCode === moduleCode && entry.workflowCode === workflowCode
    );
    if (workflowEntry) return workflowEntry;
  }

  const moduleEntry = PRODUCT_MATURITY_REGISTRY.find(entry =>
    entry.moduleCode === moduleCode && entry.workflowCode === null
  );
  if (moduleEntry) return moduleEntry;

  throw new ProductMaturityConfigurationError(`Missing product maturity registry metadata for module ${moduleCode}.`);
}
