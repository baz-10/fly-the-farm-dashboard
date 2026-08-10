import { CLIENT_RESOURCE_LINKS, GETTING_STARTED_NAV_ITEM, HOME_NAV_ITEM, ORGANISATION_NAV_GROUPS, findActiveNavigationGroup, getOrganisationNavigationGroups } from '../organisationNavigation';
import { getMaturityEntry } from '../../productMaturity/registry';

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

  test('keeps Home standalone and provides the approved expandable groups in order', () => {
    expect(HOME_NAV_ITEM).toMatchObject({ label: 'Home', path: '/' });
    expect(ORGANISATION_NAV_GROUPS.map((group) => group.label)).toEqual([
      'CLIENTS', 'OPERATIONS', 'FLEET', 'PEOPLE', 'COMPLIANCE', 'INTELLIGENCE', 'REPORTS', 'ORGANISATION',
    ]);
    expect(ORGANISATION_NAV_GROUPS.flatMap((group) => group.items)).not.toContainEqual(expect.objectContaining({ path: '/' }));
  });

  test('preserves existing operational route paths', () => {
    const paths = ORGANISATION_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.path));
    expect(paths).toEqual(expect.arrayContaining(['/missions', '/aircraft', '/personnel', '/compliance', '/quotes', '/financials']));
  });

  test('adds Getting Started only as incomplete-onboarding context without hiding stable modules', () => {
    expect(GETTING_STARTED_NAV_ITEM).toMatchObject({ label: 'Getting Started', path: '/getting-started', roles: ['admin'] });
    const incomplete = getOrganisationNavigationGroups({ gettingStartedIncomplete: true });
    const complete = getOrganisationNavigationGroups({ gettingStartedIncomplete: false });
    const incompletePaths = incomplete.flatMap((group) => group.items.map((item) => item.path));
    const completePaths = complete.flatMap((group) => group.items.map((item) => item.path));

    expect(incompletePaths).toContain('/getting-started');
    expect(completePaths).not.toContain('/getting-started');
    expect(completePaths).toEqual(incompletePaths.filter((path) => path !== '/getting-started'));
    expect(incompletePaths).toEqual(expect.arrayContaining(['/jobs', '/missions', '/aircraft', '/personnel', '/admin']));
    expect(findActiveNavigationGroup('/getting-started')).toBe('organisation');
  });

  test('assigns every visible navigation destination stable registry metadata without changing its access contract', () => {
    const navigationItems = [HOME_NAV_ITEM, ...ORGANISATION_NAV_GROUPS.flatMap((group) => group.items)];

    navigationItems.forEach((item) => {
      expect(() => getMaturityEntry(item.moduleCode, item.workflowCode)).not.toThrow();
    });

    expect(navigationItems.map(({ path, roles, entitlement, activePrefixes }) => ({ path, roles, entitlement, activePrefixes }))).toEqual([
      { path: '/', roles: ['admin', 'contractor'], entitlement: undefined, activePrefixes: undefined },
      { path: '/jobs', roles: ['admin', 'contractor', 'client'], entitlement: undefined, activePrefixes: ['/jobs/client'] },
      { path: '/jobs?view=properties', roles: ['admin', 'contractor', 'client'], entitlement: undefined, activePrefixes: undefined },
      { path: '/jobs?view=fields', roles: ['admin', 'contractor', 'client'], entitlement: undefined, activePrefixes: undefined },
      { path: '/jobs?view=jobs', roles: ['admin', 'contractor', 'client'], entitlement: undefined, activePrefixes: undefined },
      { path: '/missions', roles: ['admin', 'contractor'], entitlement: undefined, activePrefixes: undefined },
      { path: '/calculator', roles: ['admin', 'contractor'], entitlement: undefined, activePrefixes: undefined },
      { path: '/aircraft', roles: ['admin', 'contractor'], entitlement: undefined, activePrefixes: undefined },
      { path: '/fleet-work-packs', roles: ['admin', 'contractor'], entitlement: undefined, activePrefixes: undefined },
      { path: '/personnel', roles: ['admin', 'contractor'], entitlement: undefined, activePrefixes: undefined },
      { path: '/compliance', roles: ['admin', 'contractor'], entitlement: undefined, activePrefixes: undefined },
      { path: '/compliance/checklists', roles: ['admin', 'contractor'], entitlement: undefined, activePrefixes: undefined },
      { path: '/jsa', roles: ['admin', 'contractor'], entitlement: undefined, activePrefixes: undefined },
      { path: '/database', roles: ['admin', 'contractor', 'client'], entitlement: undefined, activePrefixes: undefined },
      { path: '/ask-ftf', roles: ['admin', 'contractor'], entitlement: 'legacyAskFtf', activePrefixes: undefined },
      { path: '/quotes', roles: ['admin', 'contractor'], entitlement: undefined, activePrefixes: undefined },
      { path: '/financials', roles: ['admin', 'contractor'], entitlement: undefined, activePrefixes: undefined },
      { path: '/getting-started', roles: ['admin'], entitlement: undefined, activePrefixes: undefined },
      { path: '/license-settings', roles: ['admin', 'contractor'], entitlement: undefined, activePrefixes: undefined },
      { path: '/admin', roles: ['admin'], entitlement: undefined, activePrefixes: undefined },
    ]);
  });

  test('keeps group ordering and paths stable while using the customer-facing Operational Intelligence label', () => {
    expect(ORGANISATION_NAV_GROUPS.map((group) => ({
      label: group.label,
      paths: group.items.map((item) => item.path),
    }))).toEqual([
      { label: 'CLIENTS', paths: ['/jobs', '/jobs?view=properties', '/jobs?view=fields', '/jobs?view=jobs'] },
      { label: 'OPERATIONS', paths: ['/missions', '/calculator'] },
      { label: 'FLEET', paths: ['/aircraft', '/fleet-work-packs'] },
      { label: 'PEOPLE', paths: ['/personnel'] },
      { label: 'COMPLIANCE', paths: ['/compliance', '/compliance/checklists', '/jsa'] },
      { label: 'INTELLIGENCE', paths: ['/database', '/ask-ftf'] },
      { label: 'REPORTS', paths: ['/quotes', '/financials'] },
      { label: 'ORGANISATION', paths: ['/getting-started', '/license-settings', '/admin'] },
    ]);
    expect(ORGANISATION_NAV_GROUPS.flatMap((group) => group.items).find((item) => item.path === '/ask-ftf')).toMatchObject({
      label: 'Operational Intelligence',
      shortLabel: 'Operational Intelligence',
    });
  });
});
