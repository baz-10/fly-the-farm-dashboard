import { projectSelectedPlanningForecast } from '../planningForecast';

const selectedForecast = {
  id: 'forecast-2',
  version_number: 2,
  selected: true,
  selection_version: 3,
  provider: 'OPEN_METEO',
  issued_at: '2026-08-03T00:00:00Z',
  valid_from: '2026-08-09T22:00:00Z',
  valid_to: '2026-08-10T02:00:00Z',
  latitude: -27.5,
  longitude: 153.1,
  provider_snapshot: {
    timezone: 'Australia/Brisbane',
    utc_offset_seconds: 36000,
    hourly: {
      time: ['2026-08-10T08:00', '2026-08-10T09:00', '2026-08-10T10:00'],
      temperature_2m: [24, 25, 26],
      relative_humidity_2m: [60, 55, 50],
      wind_speed_10m: [10, 12, 14],
      wind_gusts_10m: [18, 20, 22],
      wind_direction_10m: [90, 100, 110],
      precipitation_probability: [20, 30, 40],
      precipitation: [0, 0.2, 0.8],
      cloud_cover: [30, 40, 50],
    },
  },
};

test('projects the selected immutable forecast at the exact Mission hour', () => {
  const result = projectSelectedPlanningForecast(
    [{ ...selectedForecast, selected: false, version_number: 1 }, selectedForecast],
    '2026-08-10T08:00:00+10:00',
    new Date('2026-08-03T01:00:00Z'),
  );

  expect(result).toMatchObject({
    revisionId: 'forecast-2',
    revisionVersion: 2,
    provider: 'OPEN_METEO',
    alignment: 'EXACT',
    freshness: 'CURRENT',
    temperatureC: 24,
    relativeHumidityPercent: 60,
    deltaTC: 5.4,
    windSpeedKmh: 10,
    windGustKmh: 18,
    windDirectionDegrees: 90,
    precipitationProbabilityPercent: 20,
    expectedPrecipitationMm: 0,
    cloudCoverPercent: 30,
  });
  expect(result?.matchedAt).toBe('2026-08-09T22:00:00.000Z');
});

test('uses and labels the nearest available interval without changing evidence', () => {
  const result = projectSelectedPlanningForecast(
    [selectedForecast],
    '2026-08-10T08:35:00+10:00',
    new Date('2026-08-03T01:00:00Z'),
  );

  expect(result).toMatchObject({ alignment: 'NEAREST', temperatureC: 25 });
  expect(selectedForecast.provider_snapshot.hourly.temperature_2m).toEqual([24, 25, 26]);
});

test('marks the selected revision misaligned when the Mission time moves outside its saved window', () => {
  const result = projectSelectedPlanningForecast(
    [selectedForecast],
    '2026-08-11T08:00:00+10:00',
    new Date('2026-08-03T01:00:00Z'),
  );

  expect(result).toMatchObject({ alignment: 'OUTSIDE_VALID_PERIOD', freshness: 'MISALIGNED' });
});

test('marks expired evidence stale and preserves unavailable provider measurements', () => {
  const sparse = {
    ...selectedForecast,
    provider_snapshot: { timezone: 'Australia/Brisbane', utc_offset_seconds: 36000, hourly: { time: ['2026-08-10T08:00'], temperature_2m: [24] } },
  };
  const result = projectSelectedPlanningForecast(
    [sparse],
    '2026-08-10T08:00:00+10:00',
    new Date('2026-08-12T00:00:00Z'),
  );

  expect(result).toMatchObject({ freshness: 'STALE', temperatureC: 24 });
  expect(result?.relativeHumidityPercent).toBeNull();
  expect(result?.deltaTC).toBeNull();
  expect(result?.windSpeedKmh).toBeNull();
});
