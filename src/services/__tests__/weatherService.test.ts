import { afterEach, describe, expect, test, vi } from 'vitest';

import { fetchWeatherForDate, reverseGeocodeLocation } from '../weatherService';

describe('weather service', () => {
  afterEach(() => vi.restoreAllMocks());

  test('requests spray-weather fields and calculates wet-bulb Delta T', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        latitude: -27.4, longitude: 153.1, timezone: 'Australia/Brisbane',
        hourly: {
          time: ['2026-07-20T09:00'], temperature_2m: [30], relative_humidity_2m: [50], dew_point_2m: [18],
          wind_speed_10m: [12], wind_direction_10m: [90], wind_gusts_10m: [18],
          precipitation_probability: [20], cloud_cover: [15], is_day: [1],
        },
        daily: { time: ['2026-07-20'], sunrise: ['2026-07-20T06:30'], sunset: ['2026-07-20T17:15'], temperature_2m_max: [31], temperature_2m_min: [18], precipitation_probability_max: [25], wind_speed_10m_max: [20], wind_gusts_10m_max: [28] },
      }),
    } as Response);

    const result = await fetchWeatherForDate(-27.4, 153.1, '2026-07-20');

    expect(fetchMock.mock.calls[0][0]).toContain('precipitation_probability,cloud_cover,is_day');
    expect(result.hourly[0]).toMatchObject({ deltaT: 7.7, precipitationProbability: 20, cloudCoverPercent: 15, isDay: true });
    expect(result.sunrise).toBe('2026-07-20T06:30');
    expect(result.daily[0]).toMatchObject({ date: '2026-07-20', maxTempC: 31, rainChancePercent: 25, maxGustKmh: 28 });
  });

  test('resolves device coordinates to a readable place name', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ locality: 'Dalby', principalSubdivision: 'Queensland', countryName: 'Australia' }) } as Response);
    await expect(reverseGeocodeLocation(-27.18, 151.26)).resolves.toBe('Dalby, Queensland, Australia');
  });

  test('can retain adjacent dates so remote-location current time is always present', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ latitude: 0, longitude: 179, timezone: 'Pacific/Auckland', hourly: { time: ['2026-07-19T23:00', '2026-07-20T00:00', '2026-07-21T00:00'], temperature_2m: [20,20,20], relative_humidity_2m: [50,50,50], dew_point_2m: [10,10,10], wind_speed_10m: [5,5,5], wind_direction_10m: [0,0,0], wind_gusts_10m: [6,6,6], precipitation_probability: [0,0,0], cloud_cover: [0,0,0], is_day: [0,0,0] }, daily: { time: [] } }) } as Response);
    const result = await fetchWeatherForDate(0, 179, '2026-07-20', true);
    expect(result.hourly.map((point) => point.time)).toEqual(['2026-07-19T23:00', '2026-07-20T00:00', '2026-07-21T00:00']);
  });
});
