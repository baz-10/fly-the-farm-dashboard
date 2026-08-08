import { getMaturityEntry, ProductMaturityConfigurationError } from './registry';
import { ProductMaturityEntry } from './types';

export interface ReachableProductRoute {
  path: string;
  moduleCode: string;
  workflowCode: string | null;
}

export interface ResolvedProductSurface {
  routePattern: string;
  moduleCode: string;
  workflowCode: string | null;
  entry: ProductMaturityEntry;
}

interface ProductSurface {
  routePattern: string;
  moduleCode: string;
  workflowCode: string | null;
  matchesSearch?: (search: URLSearchParams) => boolean;
}

export class ProductMaturityPathError extends ProductMaturityConfigurationError {
  constructor() {
    super('The product route pathname contains malformed percent encoding.');
    this.name = 'ProductMaturityPathError';
  }
}

export const REACHABLE_PRODUCT_ROUTES = [
  { path: '/login', moduleCode: 'authentication', workflowCode: null },
  { path: '/register', moduleCode: 'organisation-onboarding', workflowCode: null },
  { path: '/auth/callback', moduleCode: 'authentication', workflowCode: null },
  { path: '/forgot-password', moduleCode: 'authentication', workflowCode: null },
  { path: '/reset-password', moduleCode: 'authentication', workflowCode: null },
  { path: '/customer-acceptance/:token', moduleCode: 'customer-portal', workflowCode: null },
  { path: '/platform', moduleCode: 'platform-identity', workflowCode: null },
  { path: '/', moduleCode: 'home', workflowCode: null },
  { path: '/database', moduleCode: 'chemical-database', workflowCode: null },
  { path: '/search', moduleCode: 'chemical-database', workflowCode: null },
  { path: '/treatment/:id', moduleCode: 'chemical-database', workflowCode: null },
  { path: '/calculator', moduleCode: 'spray-calculator', workflowCode: null },
  { path: '/jobs', moduleCode: 'clients', workflowCode: null },
  { path: '/jobs/import', moduleCode: 'spray-recommendation-import', workflowCode: null },
  { path: '/jobs/history', moduleCode: 'jobs', workflowCode: null },
  { path: '/jobs/client/:clientId', moduleCode: 'clients', workflowCode: null },
  { path: '/jobs/client/:clientId/property/:propertyId', moduleCode: 'properties', workflowCode: null },
  { path: '/jobs/client/:clientId/property/:propertyId/field/:fieldId', moduleCode: 'fields', workflowCode: null },
  { path: '/jobs/client/:clientId/property/:propertyId/field/:fieldId/new-job', moduleCode: 'jobs', workflowCode: null },
  { path: '/jobs/client/:clientId/property/:propertyId/field/:fieldId/job/:jobId', moduleCode: 'jobs', workflowCode: null },
  { path: '/jobs/client/:clientId/property/:propertyId/field/:fieldId/job/:jobId/new-mission', moduleCode: 'mission-workspace', workflowCode: null },
  { path: '/quotes', moduleCode: 'quotes', workflowCode: null },
  { path: '/quotes/new', moduleCode: 'quotes', workflowCode: null },
  { path: '/quotes/settings', moduleCode: 'quotes', workflowCode: null },
  { path: '/quotes/:quoteId', moduleCode: 'quotes', workflowCode: null },
  { path: '/financials', moduleCode: 'financials', workflowCode: null },
  { path: '/financials/new', moduleCode: 'financials', workflowCode: null },
  { path: '/financials/:actualId', moduleCode: 'financials', workflowCode: null },
  { path: '/ask-ftf', moduleCode: 'operational-intelligence', workflowCode: null },
  { path: '/aircraft', moduleCode: 'aircraft', workflowCode: null },
  { path: '/personnel', moduleCode: 'personnel', workflowCode: null },
  { path: '/fleet-work-packs', moduleCode: 'fleet-work-packs', workflowCode: null },
  { path: '/jsa', moduleCode: 'mission-jsa', workflowCode: null },
  { path: '/missions', moduleCode: 'mission-register', workflowCode: null },
  { path: '/missions/new', moduleCode: 'mission-register', workflowCode: 'setup-drafts' },
  { path: '/missions/:missionId', moduleCode: 'mission-workspace', workflowCode: null },
  { path: '/weather', moduleCode: 'weather-centre', workflowCode: null },
  { path: '/mission-planning', moduleCode: 'mission-register', workflowCode: null },
  { path: '/compliance', moduleCode: 'casa-compliance', workflowCode: null },
  { path: '/compliance/reoc', moduleCode: 'operating-authority', workflowCode: null },
  { path: '/compliance/operations-manual', moduleCode: 'operations-manual', workflowCode: null },
  { path: '/compliance/library', moduleCode: 'casa-compliance', workflowCode: null },
  { path: '/compliance/checklists', moduleCode: 'controlled-checklists', workflowCode: null },
  { path: '/compliance/flight', moduleCode: 'flight-records', workflowCode: null },
  { path: '/compliance/chemical', moduleCode: 'application-records', workflowCode: null },
  { path: '/compliance/transport', moduleCode: 'transport-storage', workflowCode: null },
  { path: '/compliance/licensing', moduleCode: 'licences-credentials', workflowCode: null },
  { path: '/compliance/environmental', moduleCode: 'environmental-records', workflowCode: null },
  { path: '/compliance/vegetation', moduleCode: 'vegetation-pmav', workflowCode: null },
  { path: '/compliance/safety', moduleCode: 'safety-ppe', workflowCode: null },
  { path: '/compliance/documentation', moduleCode: 'documentation-audit', workflowCode: null },
  { path: '/license-settings', moduleCode: 'licences-credentials', workflowCode: null },
  { path: '/admin', moduleCode: 'organisation-administration', workflowCode: null },
] as const satisfies readonly ReachableProductRoute[];

const specificity = (routePattern: string): number => routePattern
  .split('/')
  .filter(Boolean)
  .reduce((score, segment) => score + (segment.startsWith(':') ? 1 : 10), 0);

const routeSurfaces: ProductSurface[] = REACHABLE_PRODUCT_ROUTES.map(route => ({
  routePattern: route.path,
  moduleCode: route.moduleCode,
  workflowCode: route.workflowCode,
}));

export const PRODUCT_SURFACES: readonly ProductSurface[] = [
  {
    routePattern: '/jobs',
    moduleCode: 'properties',
    workflowCode: null,
    matchesSearch: (search: URLSearchParams) => search.get('view') === 'properties',
  },
  {
    routePattern: '/jobs',
    moduleCode: 'fields',
    workflowCode: null,
    matchesSearch: (search: URLSearchParams) => search.get('view') === 'fields',
  },
  {
    routePattern: '/jobs',
    moduleCode: 'jobs',
    workflowCode: null,
    matchesSearch: (search: URLSearchParams) => search.get('view') === 'jobs',
  },
  ...routeSurfaces,
].sort((left, right) => specificity(right.routePattern) - specificity(left.routePattern));

// The App manifest only uses static segments and named single-segment params.
// This is React Router's exact-match behavior for that supported route subset.
const matchesRoute = (routePattern: string, pathname: string): boolean => {
  const routeSegments = routePattern.split('/').filter(Boolean);
  const pathnameSegments = pathname.split('/').filter(Boolean);

  return routeSegments.length === pathnameSegments.length && routeSegments.every((segment, index) =>
    segment.startsWith(':')
      ? pathnameSegments[index].length > 0
      : segment.toLowerCase() === pathnameSegments[index].toLowerCase()
  );
};

// React Router decodes each pathname segment before matching and preserves an
// encoded slash inside a segment. Malformed encoding is rejected here so a
// missing maturity match can never expose the underlying route.
const decodePathname = (pathname: string): string => {
  try {
    return pathname
      .split('/')
      .map(segment => decodeURIComponent(segment).replace(/\//g, '%2F'))
      .join('/');
  } catch {
    throw new ProductMaturityPathError();
  }
};

const resolveSurface = (surface: ProductSurface): ResolvedProductSurface => {
  let entry: ProductMaturityEntry;
  try {
    entry = getMaturityEntry(surface.moduleCode, surface.workflowCode ?? undefined);
  } catch (error) {
    if (error instanceof ProductMaturityConfigurationError && surface.workflowCode !== null) {
      throw new ProductMaturityConfigurationError(
        `Missing product maturity registry metadata for route ${surface.routePattern}.`
      );
    }
    throw error;
  }

  if (entry.moduleCode !== surface.moduleCode || entry.workflowCode !== surface.workflowCode) {
    throw new ProductMaturityConfigurationError(
      `Missing product maturity registry metadata for route ${surface.routePattern}.`
    );
  }

  return {
    routePattern: surface.routePattern,
    moduleCode: surface.moduleCode,
    workflowCode: surface.workflowCode,
    entry,
  };
};

export function resolveProductSurface(pathname: string, search: string): ResolvedProductSurface | null {
  const decodedPathname = decodePathname(pathname);
  const searchParams = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const querySurface = PRODUCT_SURFACES.find(surface =>
    surface.matchesSearch && matchesRoute(surface.routePattern, decodedPathname) && surface.matchesSearch(searchParams)
  );

  if (querySurface) return resolveSurface(querySurface);

  const routeSurface = PRODUCT_SURFACES.find(surface =>
    !surface.matchesSearch && matchesRoute(surface.routePattern, decodedPathname)
  );

  return routeSurface ? resolveSurface(routeSurface) : null;
}

export { ProductMaturityConfigurationError } from './registry';
