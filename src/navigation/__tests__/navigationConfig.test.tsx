import { getActiveGroupId, getVisibleNavigationGroups } from '../navigationConfig';

test('orders daily operations first and hides empty unauthorised groups', () => {
  const groups = getVisibleNavigationGroups('client');

  expect(groups[0].id).toBe('daily');
  expect(groups.flatMap(group => group.items).every(item => item.roles.includes('client'))).toBe(true);
  expect(groups.every(group => group.items.length > 0)).toBe(true);
});

test('finds the group for nested active routes', () => {
  expect(getActiveGroupId('/missions/mission-1', getVisibleNavigationGroups('admin'))).toBe('daily');
});
