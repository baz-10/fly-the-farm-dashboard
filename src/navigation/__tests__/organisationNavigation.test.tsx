import { CLIENT_RESOURCE_LINKS, ORGANISATION_NAV_GROUPS, findActiveNavigationGroup } from '../organisationNavigation';

describe('organisation navigation', () => {
  test('exposes Clients, Properties, Fields and Jobs as distinct client resources', () => {
    expect(CLIENT_RESOURCE_LINKS.map((item) => item.label)).toEqual(['Clients', 'Properties', 'Fields', 'Jobs']);
    expect(CLIENT_RESOURCE_LINKS.every((item) => item.path.startsWith('/jobs'))).toBe(true);
  });

  test.each([
    '/jobs',
    '/jobs/client/client-1',
    '/jobs/client/client-1/property/property-1',
    '/jobs/client/client-1/property/property-1/field/field-1',
    '/jobs/client/client-1/property/property-1/field/field-1/job/job-1',
  ])('expands CLIENTS for %s', (pathname) => {
    expect(findActiveNavigationGroup(pathname)).toBe('clients');
  });

  test('provides all approved top-level navigation groups in order', () => {
    expect(ORGANISATION_NAV_GROUPS.map((group) => group.label)).toEqual([
      'HOME', 'CLIENTS', 'OPERATIONS', 'FLEET', 'PEOPLE', 'COMPLIANCE', 'INTELLIGENCE', 'REPORTS', 'ORGANISATION',
    ]);
  });

  test('preserves existing operational route paths', () => {
    const paths = ORGANISATION_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.path));
    expect(paths).toEqual(expect.arrayContaining(['/missions', '/aircraft', '/personnel', '/compliance', '/quotes', '/financials']));
  });
});
