import { getMaturityEntry, ProductMaturityConfigurationError } from './registry';
import { ProductMaturityEntry } from './types';

export interface ReachableProductRoute {
  path: string;
  moduleCode: string;
  workflowCode?: string | null;
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

export const REACHABLE_PRODUCT_ROUTES = [
  { path: '/login', moduleCode: 'authentication' },
  { path: '/register', moduleCode: 'organisation-onboarding' },
  { path: '/auth/callback', moduleCode: 'authentication' },
  { path: '/forgot-password', moduleCode: 'authentication' },
  { path: '/reset-password', moduleCode: 'authentication' },
  { path: '/customer-acceptance/:token', moduleCode: 'customer-portal' },
  { path: '/platform', moduleCode: 'platform-identity' },
  { path: '/', moduleCode: 'home' },
  { path: '/database', moduleCode: 'chemical-database' },
  { path: '/search', moduleCode: 'chemical-database' },
  { path: '/treatment/:id', moduleCode: 'chemical-intelligence' },
  { path: '/calculator', moduleCode: 'spray-calculator' },
  { path: '/jobs', moduleCode: 'clients' },
  { path: '/jobs/import', moduleCode: 'spray-recommendation-import' },
  { path: '/jobs/history', moduleCode: 'jobs' },
  { path: '/jobs/client/:clientId', moduleCode: 'clients' },
  { path: '/jobs/client/:clientId/property/:propertyId', moduleCode: 'properties' },
  { path: '/jobs/client/:clientId/property/:propertyId/field/:fieldId', moduleCode: 'fields' },
  { path: '/jobs/client/:clientId/property/:propertyId/field/:fieldId/new-job', moduleCode: 'jobs' },
  { path: '/jobs/client/:clientId/property/:propertyId/field/:fieldId/job/:jobId', moduleCode: 'jobs' },
  { path: '/jobs/client/:clientId/property/:propertyId/field/:fieldId/job/:jobId/new-mission', moduleCode: 'mission-workspace' },
  { path: '/quotes', moduleCode: 'quotes' },
  { path: '/quotes/new', moduleCode: 'quotes' },
  { path: '/quotes/settings', moduleCode: 'quotes' },
  { path: '/quotes/:quoteId', moduleCode: 'quotes', workflowCode: 'pdf-export' },
  { path: '/financials', moduleCode: 'financials' },
  { path: '/financials/new', moduleCode: 'financials', workflowCode: 'invoice-export' },
  { path: '/financials/:actualId', moduleCode: 'financials', workflowCode: 'margin-analysis' },
  { path: '/ask-ftf', moduleCode: 'operational-intelligence' },
  { path: '/aircraft', moduleCode: 'aircraft' },
  { path: '/personnel', moduleCode: 'personnel' },
  { path: '/fleet-work-packs', moduleCode: 'fleet-work-packs' },
  { path: '/jsa', moduleCode: 'mission-jsa' },
  { path: '/missions', moduleCode: 'mission-register' },
  { path: '/missions/new', moduleCode: 'mission-register', workflowCode: 'setup-drafts' },
  { path: '/missions/:missionId', moduleCode: 'mission-workspace' },
  { path: '/weather', moduleCode: 'weather-centre' },
  { path: '/mission-planning', moduleCode: 'mission-register' },
  { path: '/compliance', moduleCode: 'casa-compliance' },
  { path: '/compliance/reoc', moduleCode: 'operating-authority' },
  { path: '/compliance/operations-manual', moduleCode: 'operations-manual' },
  { path: '/compliance/library', moduleCode: 'casa-compliance' },
  { path: '/compliance/checklists', moduleCode: 'controlled-checklists' },
  { path: '/compliance/flight', moduleCode: 'flight-records' },
  { path: '/compliance/chemical', moduleCode: 'application-records' },
  { path: '/compliance/transport', moduleCode: 'transport-storage' },
  { path: '/compliance/licensing', moduleCode: 'licences-credentials' },
  { path: '/compliance/environmental', moduleCode: 'environmental-records' },
  { path: '/compliance/vegetation', moduleCode: 'vegetation-pmav' },
  { path: '/compliance/safety', moduleCode: 'safety-ppe' },
  { path: '/compliance/documentation', moduleCode: 'documentation-audit' },
  { path: '/license-settings', moduleCode: 'licences-credentials' },
  { path: '/admin', moduleCode: 'organisation-administration' },
] as const satisfies readonly ReachableProductRoute[];

const specificity = (routePattern: string): number => routePattern
  .split('/')
  .filter(Boolean)
  .reduce((score, segment) => score + (segment.startsWith(':') ? 1 : 10), 0);

const routeSurfaces: ProductSurface[] = REACHABLE_PRODUCT_ROUTES.map(route => ({
  routePattern: route.path,
  moduleCode: route.moduleCode,
  workflowCode: route.workflowCode ?? null,
}));

export const PRODUCT_SURFACES: readonly ProductSurface[] = [
  {
    routePattern: '/jobs',
    moduleCode: 'properties',
    workflowCode: null,
    matchesSearch: search => search.get('view') === 'properties',
  },
  {
    routePattern: '/jobs',
    moduleCode: 'fields',
    workflowCode: null,
    matchesSearch: search => search.get('view') === 'fields',
  },
  {
    routePattern: '/jobs',
    moduleCode: 'jobs',
    workflowCode: null,
    matchesSearch: search => search.get('view') === 'jobs',
  },
  ...routeSurfaces,
].sort((left, right) => specificity(right.routePattern) - specificity(left.routePattern));

// The App manifest only uses static segments and named single-segment params.
// This is React Router's exact-match behavior for that supported route subset.
const matchesRoute = (routePattern: string, pathname: string): boolean => {
  const routeSegments = routePattern.split('/').filter(Boolean);
  const pathnameSegments = pathname.split('/').filter(Boolean);

  return routeSegments.length === pathnameSegments.length && routeSegments.every((segment, index) =>
    segment.startsWith(':') ? pathnameSegments[index].length > 0 : segment === pathnameSegments[index]
  );
};

const resolveSurface = (surface: ProductSurface): ResolvedProductSurface => {
  const entry = getMaturityEntry(surface.moduleCode, surface.workflowCode ?? undefined);

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
  const searchParams = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const querySurface = PRODUCT_SURFACES.find(surface =>
    surface.matchesSearch && matchesRoute(surface.routePattern, pathname) && surface.matchesSearch(searchParams)
  );

  if (querySurface) return resolveSurface(querySurface);

  const routeSurface = PRODUCT_SURFACES.find(surface =>
    !surface.matchesSearch && matchesRoute(surface.routePattern, pathname)
  );

  return routeSurface ? resolveSurface(routeSurface) : null;
}

export { ProductMaturityConfigurationError } from './registry';
