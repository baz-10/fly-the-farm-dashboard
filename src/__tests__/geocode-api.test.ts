const geocodeHandler = require('../../api/geocode');

function createResponse() {
  return {
    statusCode: 200,
    body: undefined as any,
    headers: {} as Record<string, string>,
    status(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
    json(body: any) {
      this.body = body;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
    },
  };
}

describe('address geocoding API', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('limits address lookup to Australia and returns safe result fields', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [{
        display_name: '1 Queen Street, Brisbane City, Queensland, Australia',
        lat: '-27.4698',
        lon: '153.0251',
        type: 'commercial',
        address: {
          house_number: '1',
          road: 'Queen Street',
          city: 'Brisbane City',
          state: 'Queensland',
          postcode: '4000',
          country_code: 'au',
        },
        ignored: 'not returned',
      }],
    })) as any;
    const res = createResponse();

    await geocodeHandler({ method: 'GET', query: { q: '1 Queen Street Brisbane' } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      results: [{
        label: '1 Queen Street, Brisbane City, Queensland, Australia',
        address: '1 Queen Street',
        locality: 'Brisbane City',
        state: 'QLD',
        postcode: '4000',
        lat: -27.4698,
        lng: 153.0251,
        type: 'commercial',
      }],
    });
    const requestUrl = String((global.fetch as jest.Mock).mock.calls[0][0]);
    expect(requestUrl).toContain('countrycodes=au');
    expect(requestUrl).toContain('limit=5');
    expect(res.headers['cache-control']).toContain('s-maxage=86400');
  });

  test('discards malformed and out-of-bounds provider results', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [
        { display_name: 'Invalid coordinate', lat: 'not-a-number', lon: '153.0', address: { state: 'Queensland' } },
        { display_name: 'Outside Australia', lat: '51.5072', lon: '-0.1276', address: { state: 'Queensland' } },
      ],
    })) as any;
    const res = createResponse();

    await geocodeHandler({ method: 'GET', query: { q: 'test address' } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ results: [] });
  });

  test.each([
    ['New South Wales', 'NSW'], ['Victoria', 'VIC'], ['Queensland', 'QLD'], ['South Australia', 'SA'],
    ['Western Australia', 'WA'], ['Tasmania', 'TAS'], ['Northern Territory', 'NT'],
    ['Australian Capital Territory', 'ACT'],
  ])('normalises %s to %s', async (providerState, expectedState) => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [{
        display_name: `1 Test Road, ${providerState}, Australia`,
        lat: '-27', lon: '133', type: 'house',
        address: { house_number: '1', road: 'Test Road', town: 'Test Town', state: providerState, postcode: '4000' },
      }],
    })) as any;
    const res = createResponse();

    await geocodeHandler({ method: 'GET', query: { q: '1 Test Road' } }, res);

    expect(res.body.results[0].state).toBe(expectedState);
  });

  test('returns a visible upstream error without leaking provider details', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    global.fetch = jest.fn(async () => ({ ok: false, status: 503 })) as any;
    const res = createResponse();

    await geocodeHandler({ method: 'GET', query: { q: '1 Queen Street Brisbane' } }, res);

    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ error: 'Address search is temporarily unavailable. Try again shortly.' });
    expect(JSON.stringify(res.body)).not.toContain('503');
  });

  test('rejects short queries without calling the provider', async () => {
    global.fetch = jest.fn() as any;
    const res = createResponse();

    await geocodeHandler({ method: 'GET', query: { q: 'x' } }, res);

    expect(res.statusCode).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('rejects non-GET requests', async () => {
    global.fetch = jest.fn() as any;
    const res = createResponse();

    await geocodeHandler({ method: 'POST', query: {} }, res);

    expect(res.statusCode).toBe(405);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

export {};
