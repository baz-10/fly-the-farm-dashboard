import { describe, expect, test, vi } from 'vitest';

import { runMissionOperation } from '../missionOperation';

describe('mission operation error handling', () => {
  test('returns successful operation results', () => {
    const reportError = vi.fn();
    expect(runMissionOperation(() => 'updated', 'Failed to update', reportError)).toBe('updated');
    expect(reportError).not.toHaveBeenCalled();
  });

  test('reports optional operation failures without throwing', () => {
    const reportError = vi.fn();
    expect(runMissionOperation(() => {
      throw new Error('validation failed');
    }, 'Failed to save', reportError)).toBeNull();
    expect(reportError).toHaveBeenCalledWith('Failed to save: validation failed', expect.any(Error));
  });

  test('rethrows required lifecycle operation failures for the UI', () => {
    expect(() => runMissionOperation(() => {
      throw new Error('invalid transition');
    }, 'Failed to transition mission status', vi.fn(), true)).toThrow(
      'Failed to transition mission status: invalid transition',
    );
  });
});
