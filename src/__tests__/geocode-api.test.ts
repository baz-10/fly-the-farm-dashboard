import { vi, type Mock } from 'vitest';

let geocodeHandler: any;

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

  beforeEach(async () => {
    vi.resetModules();
    const geocodeModule = await import('../../api/geocode');
    geocodeHandler = geocodeModule.default ?? geocodeModule;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('limits address lookup to Australia and returns safe result fields', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [{
        display_name: '1 Queen Street, Brisbane City, Queensland, Australia',
        lat: '-27.4698',
        lon: '153.0251',
        type: 'commercial',
        ignored: 'not returned',
      }],
    })) as any;
    const res = createResponse();

    await geocodeHandler({ method: 'GET', query: { q: '1 Queen Street Brisbane' } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      results: [{
        label: '1 Queen Street, Brisbane City, Queensland, Australia',
        lat: -27.4698,
        lng: 153.0251,
        type: 'commercial',
      }],
    });
    const requestUrl = String((global.fetch as Mock).mock.calls[0][0]);
    expect(requestUrl).toContain('countrycodes=au');
    expect(requestUrl).toContain('limit=5');
    expect(res.headers['cache-control']).toContain('s-maxage=86400');
  });

  test('rejects short queries without calling the provider', async () => {
    global.fetch = vi.fn() as any;
    const res = createResponse();

    await geocodeHandler({ method: 'GET', query: { q: 'x' } }, res);

    expect(res.statusCode).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('rejects non-GET requests', async () => {
    global.fetch = vi.fn() as any;
    const res = createResponse();

    await geocodeHandler({ method: 'POST', query: {} }, res);

    expect(res.statusCode).toBe(405);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

export {};
