const {
  fetchOpenMeteoPlanningForecast,
  reverseGeocodeAustralianLocation,
  searchAustralianWeatherLocations,
  deriveAustralianPlaceFromAddress,
  geocodeOpenMeteoLocation,
  mergeAustralianPlace,
  fetchOpenMeteoHistoricalWeather,
} = require('../../server/weather-provider');

test('normalises and filters historical observations to the exact frozen UTC interval', async () => {
  const fetchImpl = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      latitude: -27.5, longitude: 153.1, timezone: 'GMT', utc_offset_seconds: 0,
      hourly: {
        time: ['2026-09-04T21:00', '2026-09-04T22:00', '2026-09-04T23:00', '2026-09-05T00:00', '2026-09-05T01:00', '2026-09-05T02:00', '2026-09-05T03:00', '2026-09-05T04:00'],
        temperature_2m: [23, 24, 23, 22, 21, 20, 20, 21], relative_humidity_2m: [55, 60, 61, 62, 65, 66, 67, 68],
        dew_point_2m: [14, 16, 16, 15, 15, 14, 14, 15], wind_speed_10m: [9, 10, 9, 8, 7, 6, 5, 6],
        wind_direction_10m: [80, 90, 95, 100, 105, 110, 115, 120], precipitation: [0, 0, 0, 0, 0, 0, 0, 0],
      },
    }),
  });
  const result = await fetchOpenMeteoHistoricalWeather({
    latitude: -27.5, longitude: 153.1,
    intervalStart: '2026-09-04T21:30:00.000Z', intervalEnd: '2026-09-05T03:15:00.000Z',
    fetchImpl, now: () => new Date('2026-09-06T00:00:00.000Z'),
  });
  const requested = new URL(fetchImpl.mock.calls[0][0]);
  expect(requested.hostname).toBe('archive-api.open-meteo.com');
  expect(requested.searchParams.get('timezone')).toBe('GMT');
  expect(result.hourlyObservations.map((item) => item.observedAt)).toEqual([
    '2026-09-04T22:00:00.000Z', '2026-09-04T23:00:00.000Z', '2026-09-05T00:00:00.000Z',
    '2026-09-05T01:00:00.000Z', '2026-09-05T02:00:00.000Z', '2026-09-05T03:00:00.000Z',
  ]);
  expect(result).toEqual(expect.objectContaining({
    source: 'OPEN_METEO', providerIdentifier: 'OPEN_METEO_ARCHIVE_V1', providerRetrievedAt: '2026-09-06T00:00:00.000Z',
    coverageGaps: [], inversionResults: expect.objectContaining({ assessment: 'UNABLE_TO_DETERMINE' }), manualReason: null,
  }));
});

test('retains provider coverage gaps instead of inventing historical hours', async () => {
  const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => ({
    latitude: -27.5, longitude: 153.1, timezone: 'GMT', utc_offset_seconds: 0,
    hourly: {
      time: ['2026-09-05T00:00', '2026-09-05T02:00'], temperature_2m: [22, 20], relative_humidity_2m: [60, 65],
      dew_point_2m: [14, 13], wind_speed_10m: [8, 6], wind_direction_10m: [90, 100], precipitation: [0, 0],
    },
  }) });
  const result = await fetchOpenMeteoHistoricalWeather({
    latitude: -27.5, longitude: 153.1, intervalStart: '2026-09-05T00:00:00.000Z', intervalEnd: '2026-09-05T03:00:00.000Z', fetchImpl,
  });
  expect(result.coverageGaps).toEqual([{ observedAt: '2026-09-05T01:00:00.000Z', reason: 'PROVIDER_HOUR_MISSING' }]);
});

test('fails closed when historical provider evidence is unavailable or empty', async () => {
  await expect(fetchOpenMeteoHistoricalWeather({
    latitude: -27.5, longitude: 153.1, intervalStart: '2026-09-05T00:00:00.000Z', intervalEnd: '2026-09-05T03:00:00.000Z',
    fetchImpl: jest.fn().mockResolvedValue({ ok: false, status: 503 }),
  })).rejects.toThrow('Open-Meteo historical weather failed (503).');
  await expect(fetchOpenMeteoHistoricalWeather({
    latitude: -27.5, longitude: 153.1, intervalStart: '2026-09-05T00:00:00.000Z', intervalEnd: '2026-09-05T03:00:00.000Z',
    fetchImpl: jest.fn().mockResolvedValue({ ok: true, json: async () => ({
      latitude: -27.5, longitude: 153.1, timezone: 'GMT', utc_offset_seconds: 0,
      hourly: { time: [], temperature_2m: [], relative_humidity_2m: [], dew_point_2m: [], wind_speed_10m: [], wind_direction_10m: [], precipitation: [] },
    }) }),
  })).rejects.toThrow('Open-Meteo returned no historical observations for the operating interval.');
});

test.each([
  [{ timezone: 'Australia/Brisbane', utc_offset_seconds: 36000 }, 'UTC/GMT'],
  [{ timezone: 'GMT' }, 'UTC/GMT'],
])('rejects historical responses whose timestamp timezone is ambiguous or non-zero (%p)', async (metadata, message) => {
  const hourly = {
    time: ['2026-09-05T00:00'], temperature_2m: [22], relative_humidity_2m: [60], dew_point_2m: [14],
    wind_speed_10m: [8], wind_direction_10m: [90], precipitation: [0],
  };
  await expect(fetchOpenMeteoHistoricalWeather({
    latitude: -27.5, longitude: 153.1,
    intervalStart: '2026-09-05T00:00:00.000Z', intervalEnd: '2026-09-05T01:00:00.000Z',
    fetchImpl: jest.fn().mockResolvedValue({ ok: true, json: async () => ({ latitude: -27.5, longitude: 153.1, ...metadata, hourly }) }),
  })).rejects.toThrow(message);
});

test('rejects misaligned arrays and non-finite historical values into manual fallback', async () => {
  const base = {
    latitude: -27.5, longitude: 153.1, timezone: 'GMT', utc_offset_seconds: 0,
    hourly: {
      time: ['2026-09-05T00:00'], temperature_2m: [22], relative_humidity_2m: [60], dew_point_2m: [14],
      wind_speed_10m: [8], wind_direction_10m: [90], precipitation: [0],
    },
  };
  const input = {
    latitude: -27.5, longitude: 153.1,
    intervalStart: '2026-09-05T00:00:00.000Z', intervalEnd: '2026-09-05T01:00:00.000Z',
  };
  await expect(fetchOpenMeteoHistoricalWeather({ ...input,
    fetchImpl: jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ...base, hourly: { ...base.hourly, precipitation: [] } }) }),
  })).rejects.toThrow('aligned finite hourly observations');
  await expect(fetchOpenMeteoHistoricalWeather({ ...input,
    fetchImpl: jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ...base, hourly: { ...base.hourly, temperature_2m: [Infinity] } }) }),
  })).rejects.toThrow('aligned finite hourly observations');
});

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

test('combines a provider locality with reverse-geocoded state and postcode', () => {
  expect(mergeAustralianPlace(
    {locality:'Queensland Islands',state:'',postcode:''},
    {locality:'',state:'QLD',postcode:'4707',latitude:-22.8,longitude:149.2},
  )).toEqual(expect.objectContaining({label:'Queensland Islands, QLD 4707',locality:'Queensland Islands',state:'QLD',postcode:'4707'}));
});

test('retains the provider place name when geocoding an authorised operating-location address', async () => {
  const fetchImpl=jest.fn().mockResolvedValue({ok:true,json:async()=>({results:[{name:'Mackenzie River',admin1:'Queensland',postcodes:['4705'],latitude:-23.1,longitude:148.4}]})});
  await expect(geocodeOpenMeteoLocation('Mackenzie River QLD 4705',fetchImpl)).resolves.toEqual(expect.objectContaining({
    latitude:-23.1,longitude:148.4,resolvedLocation:{label:'Mackenzie River, QLD 4705',locality:'Mackenzie River',state:'QLD',postcode:'4705'},
  }));
});

test('derives a locality label from the organisation address when rural reverse geocoding has no place name', () => {
  expect(deriveAustralianPlaceFromAddress('17 Example Road, Bluff QLD 4702')).toEqual(expect.objectContaining({
    label: 'Bluff, QLD 4702', locality: 'Bluff', state: 'QLD', postcode: '4702',
  }));
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

test('uses rural hamlet names when a reverse-geocoded address has no suburb or town', async () => {
  const fetchImpl = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ address: { hamlet: 'Lilyvale', state: 'Queensland', postcode: '4723', country_code: 'au' } }),
  });

  await expect(reverseGeocodeAustralianLocation({ latitude: -23.1, longitude: 148.4 }, fetchImpl)).resolves.toEqual(expect.objectContaining({
    label: 'Lilyvale, QLD 4723', locality: 'Lilyvale', state: 'QLD', postcode: '4723',
  }));
});
