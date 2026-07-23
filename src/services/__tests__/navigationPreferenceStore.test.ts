import { readNavigationExpansion, writeNavigationExpansion } from '../navigationPreferenceStore';

describe('navigation preference store', () => {
  beforeEach(() => localStorage.clear());

  test('keeps preferences separate by user', () => {
    writeNavigationExpansion('user-a', ['daily', 'safety']);

    expect(readNavigationExpansion('user-a')).toEqual(['daily', 'safety']);
    expect(readNavigationExpansion('user-b')).toEqual([]);
  });

  test('returns an empty preference when storage is malformed', () => {
    localStorage.setItem('ftf_navigation_groups:user-a', '{bad');

    expect(readNavigationExpansion('user-a')).toEqual([]);
  });
});
