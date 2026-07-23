import { getActiveGroupId, getVisibleNavigationGroups, isRouteActive } from '../navigationConfig';

test('orders daily operations first and hides empty unauthorised groups', () => {
  const groups = getVisibleNavigationGroups('client');

  expect(groups[0].id).toBe('daily');
  expect(groups.flatMap(group => group.items).every(item => item.roles.includes('client'))).toBe(true);
  expect(groups.every(group => group.items.length > 0)).toBe(true);
});

test('finds the group for nested active routes', () => {
  expect(getActiveGroupId('/missions/mission-1', getVisibleNavigationGroups('admin'))).toBe('daily');
});

test('matches only complete non-root route segments', () => {
  expect(isRouteActive('/missions/mission-1', '/missions')).toBe(true);
  expect(isRouteActive('/missions-archive', '/missions')).toBe(false);
  expect(isRouteActive('/jobs-old', '/jobs')).toBe(false);
});

test('matches the root route exactly', () => {
  expect(isRouteActive('/', '/')).toBe(true);
  expect(isRouteActive('/missions', '/')).toBe(false);
});
