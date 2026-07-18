import { fetchWeatherForDate } from '../weatherService';

describe('weather service', () => {
  afterEach(() => jest.restoreAllMocks());

  test('requests spray-weather fields and calculates wet-bulb Delta T', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        latitude: -27.4, longitude: 153.1, timezone: 'Australia/Brisbane',
        hourly: {
          time: ['2026-07-20T09:00'], temperature_2m: [30], relative_humidity_2m: [50], dew_point_2m: [18],
          wind_speed_10m: [12], wind_direction_10m: [90], wind_gusts_10m: [18],
          precipitation_probability: [20], cloud_cover: [15], is_day: [1],
        },
        daily: { sunrise: ['2026-07-20T06:30'], sunset: ['2026-07-20T17:15'] },
      }),
    } as Response);

    const result = await fetchWeatherForDate(-27.4, 153.1, '2026-07-20');

    expect(fetchMock.mock.calls[0][0]).toContain('precipitation_probability,cloud_cover,is_day');
    expect(result.hourly[0]).toMatchObject({ deltaT: 7.7, precipitationProbability: 20, cloudCoverPercent: 15, isDay: true });
    expect(result.sunrise).toBe('2026-07-20T06:30');
  });
});
