import { describe, expect, test } from 'vitest';

import { calculateMissionMixVolumes } from '../missionMix';

describe('mission tank mix volumes', () => {
  test('subtracts liquid products from the total tank mix', () => {
    const result = calculateMissionMixVolumes(10, 20, [
      { product: 'Product A', ratePerHa: 1.5, unit: 'L', totalRequired: 15 },
      { product: 'Adjuvant', ratePerHa: 250, unit: 'ml', totalRequired: 2500 },
      { product: 'Dry mix', ratePerHa: 0.5, unit: 'kg', totalRequired: 5 },
    ]);

    expect(result).toEqual({
      totalTankMixLitres: 200,
      liquidChemicalLitres: 17.5,
      waterRequiredLitres: 182.5,
    });
  });

  test('never reports negative water when products exceed the tank mix', () => {
    expect(calculateMissionMixVolumes(2, 5, [
      { product: 'Product A', ratePerHa: 6, unit: 'L', totalRequired: 12 },
    ]).waterRequiredLitres).toBe(0);
  });
});
