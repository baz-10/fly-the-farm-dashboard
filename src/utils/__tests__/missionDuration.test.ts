import { describe, expect, test } from 'vitest';

import { durationPartsToMinutes, minutesToDurationParts } from '../missionDuration';

describe('mission duration conversion', () => {
  test.each([
    [0, { hours: 0, minutes: 0 }],
    [59, { hours: 0, minutes: 59 }],
    [60, { hours: 1, minutes: 0 }],
    [90, { hours: 1, minutes: 30 }],
  ])('converts %i total minutes', (total, expected) => {
    expect(minutesToDurationParts(total)).toEqual(expected);
  });

  test('normalises minute overflow into hours', () => {
    expect(durationPartsToMinutes(1, 75)).toBe(135);
  });

  test('clamps invalid negative values', () => {
    expect(durationPartsToMinutes(-2, -15)).toBe(0);
    expect(minutesToDurationParts(-10)).toEqual({ hours: 0, minutes: 0 });
  });
});
