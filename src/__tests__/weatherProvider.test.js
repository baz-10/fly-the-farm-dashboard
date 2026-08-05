const {
  fetchOpenMeteoPlanningForecast,
  reverseGeocodeAustralianLocation,
  searchAustralianWeatherLocations,
} = require('../../server/weather-provider');

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

test('searches Australian places and returns an operator-readable locality label', async () => {
  const fetchImpl = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ([{
      lat: '-27.9712',
      lon: '153.3608',
      display_name: 'Molendinar, City of Gold Coast, Queensland, 4214, Australia',
      address: { suburb: 'Molendinar', state: 'Queensland', postcode: '4214', country_code: 'au' },
    }]),
  });

  await expect(searchAustralianWeatherLocations('Molendinar 4214', fetchImpl)).resolves.toEqual([expect.objectContaining({
    label: 'Molendinar, QLD 4214',
    locality: 'Molendinar',
    state: 'QLD',
    postcode: '4214',
    latitude: -27.9712,
    longitude: 153.3608,
  })]);
});

test('reverse geocodes coordinates without exposing an internal operating-location name as the place', async () => {
  const fetchImpl = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ address: { suburb: 'Molendinar', state: 'Queensland', postcode: '4214', country_code: 'au' } }),
  });

  await expect(reverseGeocodeAustralianLocation({ latitude: -27.9712, longitude: 153.3608 }, fetchImpl)).resolves.toEqual(expect.objectContaining({
    label: 'Molendinar, QLD 4214',
    locality: 'Molendinar',
    state: 'QLD',
  }));
});
