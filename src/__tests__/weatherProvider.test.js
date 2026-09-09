const {
  fetchOpenMeteoPlanningForecast,
  reverseGeocodeAustralianLocation,
  searchAustralianWeatherLocations,
  deriveAustralianPlaceFromAddress,
  geocodeOpenMeteoLocation,
  mergeAustralianPlace,
  fetchOpenMeteoHistoricalWeather,
  fetchOpenMeteoOperationsForecast,
} = require('../../server/weather-provider');

function operationsSnapshot(overrides={}) {
  const start=Date.parse('2026-09-08T00:00:00Z');
  const times=Array.from({length:48},(_,index)=>new Date(start+index*3600000).toISOString().slice(0,16));
  const values=Array.from({length:48},()=>20);
  const dates=Array.from({length:14},(_,index)=>new Date(start+index*86400000).toISOString().slice(0,10));
  const base={latitude:-27,longitude:153,timezone:'Australia/Brisbane',utc_offset_seconds:36000,current:{time:'2026-09-08T20:15',temperature_2m:24,apparent_temperature:24,relative_humidity_2m:70,wind_speed_10m:8,wind_gusts_10m:12,wind_direction_10m:90,precipitation:0,rain:0,is_day:0},hourly:{time:times,temperature_2m:values,relative_humidity_2m:values.map(()=>70),precipitation_probability:values.map(()=>0),precipitation:values.map(()=>0),cloud_cover:values.map(()=>20),is_day:values.map((_,index)=>index%24>=6&&index%24<18?1:0),wind_speed_10m:values.map(()=>8),wind_gusts_10m:values.map(()=>12),wind_direction_10m:values.map(()=>90)},daily:{time:dates,weather_code:dates.map(()=>2),temperature_2m_min:dates.map(()=>15),temperature_2m_max:dates.map(()=>27),precipitation_probability_max:dates.map(()=>0),precipitation_sum:dates.map(()=>0),precipitation_hours:dates.map(()=>0),wind_speed_10m_max:dates.map(()=>12),wind_gusts_10m_max:dates.map(()=>18),wind_direction_10m_dominant:dates.map(()=>90)}};
  return {...base,...overrides,current:{...base.current,...overrides.current},hourly:{...base.hourly,...overrides.hourly}};
}

test('builds the operations outlook from the actual current provider-local hour for exactly the next 24 hours',async()=>{
  const fetchImpl=jest.fn().mockResolvedValue({ok:true,json:async()=>operationsSnapshot()});
  const result=await fetchOpenMeteoOperationsForecast({latitude:-27,longitude:153,fetchImpl,now:()=>new Date('2026-09-08T10:22:00.000Z')});
  expect(result.hourly).toHaveLength(25);expect(result.hourly[0].time).toBe('2026-09-08T21:00');expect(result.hourly[24].time).toBe('2026-09-09T21:00');expect(result.hourly[0].inversionPotential).toEqual(expect.objectContaining({rating:expect.stringMatching(/low|moderate|high/)}));
  const request=new URL(fetchImpl.mock.calls[0][0]);expect(request.searchParams.get('hourly')).toMatch(/cloud_cover/);expect(request.searchParams.get('hourly')).toMatch(/is_day/);
});

test('requests and returns a fourteen-day spray-planning outlook with daily rain timing',async()=>{
  const snapshot=operationsSnapshot();
  const start=Date.parse('2026-09-08T00:00:00Z'),hours=14*24;
  snapshot.hourly.time=Array.from({length:hours},(_,index)=>new Date(start+index*3600000).toISOString().slice(0,16));
  for(const key of ['temperature_2m','relative_humidity_2m','precipitation_probability','precipitation','cloud_cover','is_day','wind_speed_10m','wind_gusts_10m','wind_direction_10m']) snapshot.hourly[key]=Array.from({length:hours},(_,index)=>key==='temperature_2m'?20:key==='relative_humidity_2m'?70:key==='cloud_cover'?20:key==='is_day'?(index%24>=6&&index%24<18?1:0):key==='wind_speed_10m'?8:key==='wind_gusts_10m'?12:key==='wind_direction_10m'?90:0);
  snapshot.hourly.precipitation_probability[38]=65;snapshot.hourly.precipitation_probability[39]=75;snapshot.hourly.precipitation[38]=1.2;snapshot.hourly.precipitation[39]=2.1;
  const dates=Array.from({length:14},(_,index)=>new Date(start+index*86400000).toISOString().slice(0,10));
  snapshot.daily={time:dates,weather_code:dates.map(()=>2),temperature_2m_min:dates.map(()=>14),temperature_2m_max:dates.map(()=>27),precipitation_probability_max:dates.map((_,index)=>index===1?75:5),precipitation_sum:dates.map((_,index)=>index===1?3.3:0),precipitation_hours:dates.map((_,index)=>index===1?2:0),wind_speed_10m_max:dates.map(()=>16),wind_gusts_10m_max:dates.map(()=>24),wind_direction_10m_dominant:dates.map(()=>90)};
  const fetchImpl=jest.fn().mockResolvedValue({ok:true,json:async()=>snapshot});
  const result=await fetchOpenMeteoOperationsForecast({latitude:-27,longitude:153,fetchImpl,now:()=>new Date('2026-09-08T10:22:00.000Z')});
  const request=new URL(fetchImpl.mock.calls[0][0]);
  expect(request.searchParams.get('forecast_days')).toBe('14');
  expect(request.searchParams.get('daily')).toMatch(/precipitation_hours/);
  expect(request.searchParams.get('daily')).toMatch(/wind_direction_10m_dominant/);
  expect(result.daily).toHaveLength(14);
  expect(result.daily[1]).toEqual(expect.objectContaining({condition:'Partly cloudy',rainAmountMm:3.3,rainDurationHours:2,windDirection:'E',rainWindow:expect.objectContaining({certainty:'LIKELY',start:'2026-09-09T14:00',end:'2026-09-09T16:00',peakProbability:75,expectedAmountMm:3.3})}));
});

test('keeps separated showers as distinct rain windows and excludes elapsed hours from today spray guidance',async()=>{
  const snapshot=operationsSnapshot({current:{time:'2026-09-08T10:15'}}),day=snapshot.daily.time[0];
  snapshot.hourly.precipitation_probability[9]=70;snapshot.hourly.precipitation[9]=1;
  snapshot.hourly.precipitation_probability[17]=80;snapshot.hourly.precipitation[17]=2;
  const fetchImpl=jest.fn().mockResolvedValue({ok:true,json:async()=>snapshot});
  const result=await fetchOpenMeteoOperationsForecast({latitude:-27,longitude:153,fetchImpl,now:()=>new Date('2026-09-08T00:22:00.000Z')});
  expect(result.daily[0].rainWindows).toEqual([{certainty:'LIKELY',start:`${day}T09:00`,end:`${day}T10:00`,peakProbability:70,expectedAmountMm:1},{certainty:'LIKELY',start:`${day}T17:00`,end:`${day}T18:00`,peakProbability:80,expectedAmountMm:2}]);
  expect(result.daily[0].bestSprayWindow?.start>=`${day}T11:00`).toBe(true);
});

test('fails closed when fourteen-day daily forecast arrays are incomplete or misaligned',async()=>{
  const snapshot=operationsSnapshot();snapshot.daily.precipitation_hours=snapshot.daily.precipitation_hours.slice(0,13);
  await expect(fetchOpenMeteoOperationsForecast({latitude:-27,longitude:153,fetchImpl:jest.fn().mockResolvedValue({ok:true,json:async()=>snapshot}),now:()=>new Date('2026-09-08T10:22:00.000Z')})).rejects.toThrow('daily values');
});

test('accepts a valid provider timezone offset when retrieval time includes milliseconds',async()=>{
  const fetchImpl=jest.fn().mockResolvedValue({ok:true,json:async()=>operationsSnapshot()});
  await expect(fetchOpenMeteoOperationsForecast({latitude:-27,longitude:153,fetchImpl,now:()=>new Date('2026-09-08T10:22:00.999Z')})).resolves.toEqual(expect.objectContaining({timezone:'Australia/Brisbane'}));
});

test('fails closed when the provider timezone and UTC offset disagree',async()=>{
  const fetchImpl=jest.fn().mockResolvedValue({ok:true,json:async()=>operationsSnapshot({utc_offset_seconds:0})});
  await expect(fetchOpenMeteoOperationsForecast({latitude:-27,longitude:153,fetchImpl,now:()=>new Date('2026-09-08T10:22:00.000Z')})).rejects.toThrow('timezone and UTC offset');
});

test('fails closed on duplicate timestamps, misaligned arrays, and non-finite core values',async()=>{
  const duplicate=operationsSnapshot();duplicate.hourly.time[22]=duplicate.hourly.time[21];
  await expect(fetchOpenMeteoOperationsForecast({latitude:-27,longitude:153,fetchImpl:jest.fn().mockResolvedValue({ok:true,json:async()=>duplicate}),now:()=>new Date('2026-09-08T10:22:00.000Z')})).rejects.toThrow('unique ordered');
  const misaligned=operationsSnapshot({hourly:{precipitation:[]}});
  await expect(fetchOpenMeteoOperationsForecast({latitude:-27,longitude:153,fetchImpl:jest.fn().mockResolvedValue({ok:true,json:async()=>misaligned}),now:()=>new Date('2026-09-08T10:22:00.000Z')})).rejects.toThrow('aligned finite');
  const invalid=operationsSnapshot();invalid.hourly.wind_speed_10m[0]=Infinity;
  await expect(fetchOpenMeteoOperationsForecast({latitude:-27,longitude:153,fetchImpl:jest.fn().mockResolvedValue({ok:true,json:async()=>invalid}),now:()=>new Date('2026-09-08T10:22:00.000Z')})).rejects.toThrow('aligned finite');
});

test.each([
  [{ timezone:'Australia/Brisbane' }, 'UTC offset'],
  [{ timezone:'Australia/Brisbane', utc_offset_seconds:'36000' }, 'UTC offset'],
])('fails closed when operations forecast provider time metadata is invalid (%p)',async(metadata,message)=>{
  const values=[20];
  const fetchImpl=jest.fn().mockResolvedValue({ok:true,json:async()=>({latitude:-27,longitude:153,...metadata,current:{time:'2026-09-08T20:00',temperature_2m:24,apparent_temperature:24,relative_humidity_2m:70,wind_speed_10m:8,wind_gusts_10m:12,wind_direction_10m:90,precipitation:0,rain:0,is_day:1},hourly:{time:['2026-09-08T20:00'],temperature_2m:values,relative_humidity_2m:[70],precipitation_probability:[0],precipitation:[0],cloud_cover:[20],is_day:[0],wind_speed_10m:[8],wind_gusts_10m:[12],wind_direction_10m:[90]},daily:{time:[],temperature_2m_min:[],temperature_2m_max:[],precipitation_probability_max:[],precipitation_sum:[],wind_speed_10m_max:[],wind_gusts_10m_max:[]}})});
  await expect(fetchOpenMeteoOperationsForecast({latitude:-27,longitude:153,fetchImpl})).rejects.toThrow(message);
});

test('fails closed instead of presenting a stale hourly window as current',async()=>{
  const values=Array.from({length:25},()=>20),times=Array.from({length:25},(_,index)=>`2026-09-08T${String(index).padStart(2,'0')}:00`);
  const snapshot=operationsSnapshot({current:{time:'2026-09-09T20:15'},hourly:{time:times,temperature_2m:values,relative_humidity_2m:values.map(()=>70),precipitation_probability:values.map(()=>0),precipitation:values.map(()=>0),cloud_cover:values.map(()=>20),is_day:values.map(()=>1),wind_speed_10m:values.map(()=>8),wind_gusts_10m:values.map(()=>12),wind_direction_10m:values.map(()=>90)}});
  const fetchImpl=jest.fn().mockResolvedValue({ok:true,json:async()=>snapshot});
  await expect(fetchOpenMeteoOperationsForecast({latitude:-27,longitude:153,fetchImpl,now:()=>new Date('2026-09-09T10:22:00.000Z')})).rejects.toThrow('does not cover the next 24 hours');
});

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

test.each([
  ['null latitude', null, 153.1],
  ['empty latitude', '', 153.1],
  ['numeric-string latitude', '-27.5', 153.1],
  ['boolean latitude', false, 153.1],
  ['missing latitude', undefined, 153.1],
  ['null longitude', -27.5, null],
  ['empty longitude', -27.5, ''],
  ['numeric-string longitude', -27.5, '153.1'],
  ['boolean longitude', -27.5, false],
  ['missing longitude', -27.5, undefined],
])('rejects provider responses with %s before numeric conversion', async (_caseName, latitude, longitude) => {
  const hourly = {
    time: ['2026-09-05T00:00'], temperature_2m: [22], relative_humidity_2m: [60], dew_point_2m: [14],
    wind_speed_10m: [8], wind_direction_10m: [90], precipitation: [0],
  };
  await expect(fetchOpenMeteoHistoricalWeather({
    latitude: -27.5, longitude: 153.1,
    intervalStart: '2026-09-05T00:00:00.000Z', intervalEnd: '2026-09-05T01:00:00.000Z',
    fetchImpl: jest.fn().mockResolvedValue({ ok: true, json: async () => ({
      latitude, longitude, timezone: 'GMT', utc_offset_seconds: 0, hourly,
    }) }),
  })).rejects.toThrow('invalid historical coordinates');
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
