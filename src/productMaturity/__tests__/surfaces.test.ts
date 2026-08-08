import fs from 'fs';
import path from 'path';

const surfaces = () => require('../surfaces');

const concretePath = (routePattern: string): string => routePattern
  .replace(':token', 'customer-token')
  .replace(':clientId', 'client-1')
  .replace(':propertyId', 'property-1')
  .replace(':fieldId', 'field-1')
  .replace(':jobId', 'job-1')
  .replace(':quoteId', 'quote-1')
  .replace(':actualId', 'actual-1')
  .replace(':missionId', 'mission-1')
  .replace(':id', 'record-1');

describe('product maturity route surfaces', () => {
  test('resolves every declared reachable route to its registry metadata', () => {
    const { REACHABLE_PRODUCT_ROUTES, resolveProductSurface } = surfaces();

    REACHABLE_PRODUCT_ROUTES.forEach((route: { path: string; moduleCode: string; workflowCode?: string | null }) => {
      const surface = resolveProductSurface(concretePath(route.path), '');

      expect(surface).toMatchObject({
        routePattern: route.path,
        moduleCode: route.moduleCode,
        workflowCode: route.workflowCode ?? null,
      });
      expect(surface.entry.moduleCode).toBe(route.moduleCode);
      expect(surface.entry.workflowCode).toBe(route.workflowCode ?? null);
    });
  });

  test('prefers the most specific Client, Property, Field, Job and Mission matcher', () => {
    const { resolveProductSurface } = surfaces();

    expect(resolveProductSurface('/jobs/client/client-1', '')).toMatchObject({ moduleCode: 'clients' });
    expect(resolveProductSurface('/jobs/client/client-1/property/property-1', '')).toMatchObject({ moduleCode: 'properties' });
    expect(resolveProductSurface('/jobs/client/client-1/property/property-1/field/field-1', '')).toMatchObject({ moduleCode: 'fields' });
    expect(resolveProductSurface('/jobs/client/client-1/property/property-1/field/field-1/job/job-1', '')).toMatchObject({ moduleCode: 'jobs' });
    expect(resolveProductSurface('/jobs/client/client-1/property/property-1/field/field-1/job/job-1/new-mission', '')).toMatchObject({ moduleCode: 'mission-workspace' });
  });

  test('resolves Jobs workspace query views before the shared Jobs fallback', () => {
    const { resolveProductSurface } = surfaces();

    expect(resolveProductSurface('/jobs', '?view=properties')).toMatchObject({ moduleCode: 'properties' });
    expect(resolveProductSurface('/jobs', '?view=fields')).toMatchObject({ moduleCode: 'fields' });
    expect(resolveProductSurface('/jobs', '?view=jobs')).toMatchObject({ moduleCode: 'jobs' });
    expect(resolveProductSurface('/jobs', '?view=unknown')).toMatchObject({ moduleCode: 'jobs' });
  });

  test('fails closed when a configured route refers to an unknown module', () => {
    const { PRODUCT_SURFACES, resolveProductSurface } = surfaces();
    const mutableSurfaces = PRODUCT_SURFACES as unknown as Array<unknown>;

    mutableSurfaces.push({
      routePattern: '/misconfigured-product-surface',
      moduleCode: 'not-a-module',
      workflowCode: null,
    });

    try {
      expect(() => resolveProductSurface('/misconfigured-product-surface', '')).toThrow(
        'Missing product maturity registry metadata for module not-a-module.'
      );
    } finally {
      mutableSurfaces.pop();
    }
  });

  test('fails closed when a configured route refers to an unknown workflow', () => {
    const { PRODUCT_SURFACES, resolveProductSurface } = surfaces();
    const mutableSurfaces = PRODUCT_SURFACES as unknown as Array<unknown>;

    mutableSurfaces.push({
      routePattern: '/misconfigured-workflow-surface',
      moduleCode: 'jobs',
      workflowCode: 'not-a-workflow',
    });

    try {
      expect(() => resolveProductSurface('/misconfigured-workflow-surface', '')).toThrow(
        'Missing product maturity registry metadata for route /misconfigured-workflow-surface.'
      );
    } finally {
      mutableSurfaces.pop();
    }
  });

  test('keeps every literal App route in the maturity route manifest', () => {
    const { REACHABLE_PRODUCT_ROUTES } = surfaces();
    const appSource = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');
    const appRoutePaths = Array.from(appSource.matchAll(/<Route\s+path="([^"]+)"/g), match => match[1]);
    const manifestPaths = new Set(REACHABLE_PRODUCT_ROUTES.map((route: { path: string }) => route.path));

    expect(appRoutePaths).not.toHaveLength(0);
    appRoutePaths.forEach(routePath => expect(manifestPaths.has(routePath)).toBe(true));
  });

  test('returns null only for an unknown route', () => {
    const { resolveProductSurface } = surfaces();

    expect(resolveProductSurface('/not-a-reachable-route', '')).toBeNull();
  });
});
