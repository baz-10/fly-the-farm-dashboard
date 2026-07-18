import { assessInversionPotential, calculateDeltaT, calculateWetBulbC, classifyDeltaT, selectCurrentHourlyPoint } from '../sprayWeather';
import { HourlyWeatherPoint } from '../../services/weatherService';

describe('spray weather calculations', () => {
  test('calculates wet-bulb temperature and true Delta T from temperature and humidity', () => {
    expect(calculateWetBulbC(30, 50)).toBeCloseTo(22.3, 1);
    expect(calculateDeltaT(30, 50)).toBeCloseTo(7.7, 1);
  });

  test('classifies the agreed Delta T boundaries', () => {
    expect(classifyDeltaT(1.9)).toBe('marginal');
    expect(classifyDeltaT(2)).toBe('preferred');
    expect(classifyDeltaT(8)).toBe('preferred');
    expect(classifyDeltaT(8.1)).toBe('marginal');
    expect(classifyDeltaT(10)).toBe('marginal');
    expect(classifyDeltaT(10.1)).toBe('unsuitable');
  });

  test('rates calm, clear, humid overnight conditions as high potential', () => {
    const result = assessInversionPotential({
      time: '2026-07-18T21:00:00', sunrise: '2026-07-18T06:30:00', sunset: '2026-07-18T17:15:00',
      windSpeedKmh: 4, cloudCoverPercent: 10, humidityPercent: 94, temperatureTrendC: -1.5,
    });
    expect(result.rating).toBe('high');
    expect(result.message).toMatch(/Do not spray/i);
    expect(result.message).toMatch(/verify conditions on site/i);
  });

  test('rates windy daytime conditions low but still requires an on-site check', () => {
    const result = assessInversionPotential({
      time: '2026-07-18T12:00:00', sunrise: '2026-07-18T06:30:00', sunset: '2026-07-18T17:15:00',
      windSpeedKmh: 18, cloudCoverPercent: 65, humidityPercent: 55, temperatureTrendC: 1,
    });
    expect(result.rating).toBe('low');
    expect(result.message).toMatch(/on-site check/i);
  });

  test('selects the hourly point nearest now instead of midnight', () => {
    const points = ['2026-07-18T00:00:00', '2026-07-18T12:00:00', '2026-07-18T13:00:00'].map((time) => ({ time } as HourlyWeatherPoint));
    expect(selectCurrentHourlyPoint(points, new Date('2026-07-18T12:40:00'))?.time).toContain('13:00');
  });

  test('selects current wall-clock hour in the forecast location timezone', () => {
    const points = ['2026-07-18T02:00:00', '2026-07-18T12:00:00'].map((time) => ({ time } as HourlyWeatherPoint));
    expect(selectCurrentHourlyPoint(points, new Date('2026-07-18T02:20:00Z'), 'Europe/London')?.time).toContain('02:00');
  });

  test('uses local clock time for inversion windows across forecast dates', () => {
    const result = assessInversionPotential({ time: '2026-07-20T12:00:00', sunrise: '2026-07-18T06:30:00', sunset: '2026-07-18T17:15:00', windSpeedKmh: 4, cloudCoverPercent: 10, humidityPercent: 94, temperatureTrendC: -1 });
    expect(result.rating).not.toBe('high');
  });
});
