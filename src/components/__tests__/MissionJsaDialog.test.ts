import { calculateRiskLevel } from '../MissionJsaDialog';

describe('JSA risk matrix', () => {
  test('classifies low, medium, high and critical combinations', () => {
    expect(calculateRiskLevel('rare', 'minor')).toBe('low');
    expect(calculateRiskLevel('possible', 'moderate')).toBe('medium');
    expect(calculateRiskLevel('likely', 'major')).toBe('high');
    expect(calculateRiskLevel('almost-certain', 'catastrophic')).toBe('critical');
  });
});
