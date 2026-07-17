import { HourlyWeatherPoint } from '../../services/weatherService';
import { selectWeatherWindow, validateWeatherRequest } from '../missionWeather';

const point = (time: string, tempC: number): HourlyWeatherPoint => ({
  time,
  tempC,
  humidity: 55,
  dewpointC: 10,
  deltaT: 8,
  windSpeedKmh: 12,
  windGustsKmh: 17,
  windDirectionDeg: 90,
  windDirectionCompass: 'E',
});

describe('mission weather selection', () => {
  test('requires a planned date and usable location', () => {
    expect(validateWeatherRequest('', undefined, undefined, '')).toBe('Choose a planned date before getting weather.');
    expect(validateWeatherRequest('2026-07-20T09:00', undefined, undefined, '')).toBe('Add a site address or map location before getting weather.');
    expect(validateWeatherRequest('2026-07-20T09:00', -27.4, 153.1, '')).toBeNull();
  });

  test('selects the reading nearest to the planned start time', () => {
    const snapshot = selectWeatherWindow([
      point('2026-07-20T08:00', 18),
      point('2026-07-20T10:00', 22),
    ], '2026-07-20T09:40', 120, 'Australia/Brisbane');

    expect(snapshot.temperatureC).toBe(22);
    expect(snapshot.windDirection).toBe('E');
    expect(snapshot.forecastDate).toBe('2026-07-20');
    expect(snapshot.source).toBe('Open-Meteo');
  });

  test('rejects an empty provider response', () => {
    expect(() => selectWeatherWindow([], '2026-07-20T09:00', 60, 'Australia/Brisbane'))
      .toThrow('No weather data is available for the planned date.');
  });
});
