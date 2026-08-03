const { fetchOpenMeteoPlanningForecast } = require('../../server/weather-provider');

test('requests a padded provider date range so Australian local Mission hours are retained', async () => {
  const fetchImpl = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      latitude: -27.5,
      longitude: 153.1,
      timezone: 'Australia/Brisbane',
      utc_offset_seconds: 36000,
      hourly: { time: ['2026-08-10T08:00'], temperature_2m: [24] },
    }),
  });

  const result = await fetchOpenMeteoPlanningForecast({
    latitude: -27.5,
    longitude: 153.1,
    validFrom: '2026-08-09T22:00:00Z',
    validTo: '2026-08-10T02:00:00Z',
    fetchImpl,
  });

  const requested = new URL(fetchImpl.mock.calls[0][0]);
  expect(requested.searchParams.get('start_date')).toBe('2026-08-08');
  expect(requested.searchParams.get('end_date')).toBe('2026-08-11');
  expect(result.validFrom).toBe('2026-08-09T22:00:00.000Z');
  expect(result.validTo).toBe('2026-08-10T02:00:00.000Z');
  expect(result.snapshot.hourly.time).toEqual(['2026-08-10T08:00']);
});

