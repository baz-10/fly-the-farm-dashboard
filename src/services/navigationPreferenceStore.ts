import { NavigationGroupId } from '../navigation/navigationConfig';

const prefix = 'ftf_navigation_groups';
const navigationGroupIds: NavigationGroupId[] = ['daily', 'resources', 'safety', 'commercial', 'support'];

function isNavigationGroupId(value: unknown): value is NavigationGroupId {
  return typeof value === 'string' && navigationGroupIds.includes(value as NavigationGroupId);
}

export function readNavigationExpansion(userId: string): NavigationGroupId[] {
  try {
    const value = JSON.parse(localStorage.getItem(`${prefix}:${userId}`) || '[]');
    return Array.isArray(value)
      ? Array.from(new Set(value.filter(isNavigationGroupId)))
      : [];
  } catch {
    return [];
  }
}

export function writeNavigationExpansion(userId: string, groupIds: NavigationGroupId[]): void {
  try {
    localStorage.setItem(`${prefix}:${userId}`, JSON.stringify(Array.from(new Set(groupIds))));
  } catch {
    // Preferences are non-critical; navigation remains usable.
  }
}
