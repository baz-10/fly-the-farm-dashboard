import type {
  IncomingMessage,
  ServerResponse,
} from 'http';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { Readable } = require('stream');
const {
  localApiPlugin,
  registerLocalApiMiddleware,
} = require('./localApiMiddleware');

type LocalMiddleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (error?: unknown) => void
) => Promise<unknown> | void;

interface MockResponse {
  statusCode: number;
  headers: Record<string, string | string[]>;
  body: string;
  setHeader: (name: string, value: string | string[]) => void;
  getHeader: (name: string) => string | string[] | undefined;
  end: (body?: string) => MockResponse;
}

interface RegisteredMiddleware {
  path: string;
  middleware: LocalMiddleware;
}

function upstreamResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body === null ? '' : JSON.stringify(body),
  };
}

function createRequest({
  method = 'GET',
  url = '/',
  headers = {},
  body = '',
}: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
} = {}): IncomingMessage {
  return Object.assign(Readable.from(body ? [Buffer.from(body)] : []), {
    method,
    url,
    headers,
  }) as IncomingMessage;
}

function createResponse(): MockResponse {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    getHeader(name) {
      return this.headers[name.toLowerCase()];
    },
    end(body = '') {
      this.body = body;
      return this;
    },
  };
}

function registeredRoutes(): Map<string, LocalMiddleware> {
  const routes = new Map<string, LocalMiddleware>();
  registerLocalApiMiddleware({
    use(path: string, middleware: LocalMiddleware) {
      routes.set(path, middleware);
    },
  });
  return routes;
}

async function invokePlugin(
  url: string,
  hook: 'configureServer' | 'configurePreviewServer' = 'configureServer',
  headers: Record<string, string> = {},
) {
  const layers: RegisteredMiddleware[] = [];
  localApiPlugin()[hook]({
    middlewares: {
      use(path: string, middleware: LocalMiddleware) {
        layers.push({ path, middleware });
      },
    },
  });

  const req = createRequest({ url, headers });
  const response = createResponse();
  let currentLayer = 0;
  let spaFallbacks = 0;

  const dispatch = async (error?: unknown): Promise<void> => {
    if (error) throw error;
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;

    while (currentLayer < layers.length) {
      const { path, middleware } = layers[currentLayer];
      currentLayer += 1;
      if (pathname !== path && !pathname.startsWith(`${path}/`)) continue;

      const originalUrl = req.url;
      req.url = (req.url || '/').slice(path.length) || '/';
      await middleware(req, response as unknown as ServerResponse, async (nextError) => {
        req.url = originalUrl;
        await dispatch(nextError);
      });
      return;
    }

    spaFallbacks += 1;
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><div id="root"></div>');
  };

  await dispatch();
  return { layers, response, spaFallbacks };
}

async function invoke(
  route: string,
  req: IncomingMessage
): Promise<{ response: MockResponse; spaFallbacks: number }> {
  const middleware = registeredRoutes().get(route);
  if (!middleware) throw new Error(`Missing local route ${route}`);

  const response = createResponse();
  let spaFallbacks = 0;
  await middleware(req, response as unknown as ServerResponse, (error) => {
    if (error) throw error;
    spaFallbacks += 1;
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><div id="root"></div>');
  });

  return { response, spaFallbacks };
}

describe('local Vercel API middleware', () => {
  const originalEnvironment = process.env;

  afterEach(() => {
    process.env = originalEnvironment;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('registers every production API path before SPA fallback', () => {
    const routes: string[] = [];
    registerLocalApiMiddleware({
      use(path: string) {
        routes.push(path);
      },
    } as never);

    expect(routes).toEqual([
      '/api/auth',
      '/api/store',
      '/api/geocode',
      '/api/pmav',
      '/api/identify-weed',
    ]);
  });

  it('delivers JSON PUT bodies and original cookie headers to the store handler', async () => {
    process.env = {
      ...originalEnvironment,
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    };
    const upstreamRequests: Array<{
      url: string;
      options: RequestInit;
    }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit = {}) => {
      upstreamRequests.push({ url, options });
      if (url.endsWith('/auth/v1/user')) {
        return upstreamResponse(200, {
          id: 'user-a',
          email: 'pilot@example.com',
          user_metadata: {},
        });
      }
      if (url.includes('/rest/v1/ftf_profiles')) {
        return upstreamResponse(200, [{
          user_id: 'user-a',
          tenant_id: 'tenant-a',
          role: 'contractor',
          name: 'Pilot',
          tier: 'free',
        }]);
      }
      if (url.includes('/rest/v1/ftf_store') && options.method !== 'POST') {
        return upstreamResponse(200, []);
      }
      if (url.includes('/rest/v1/ftf_store') && options.method === 'POST') {
        return upstreamResponse(204, null);
      }
      return upstreamResponse(500, { error: 'unexpected request' });
    }));

    const payload = {
      collection: 'ftf_missions',
      records: [{ id: 'mission-a', status: 'Approved' }],
    };
    const { response, spaFallbacks } = await invoke(
      '/api/store',
      createRequest({
        method: 'PUT',
        url: '/api/store?collection=ftf_missions',
        headers: {
          'content-type': 'application/json',
          cookie: 'ftf_access_token=token-a',
          origin: 'http://localhost:5173',
          host: 'localhost:5173',
        },
        body: JSON.stringify(payload),
      })
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ ok: true, count: 1 });
    const authenticationRequest = upstreamRequests.find(({ url }) => url.endsWith('/auth/v1/user'));
    expect(authenticationRequest?.options.headers).toMatchObject({
      Authorization: 'Bearer token-a',
    });
    const writeRequest = upstreamRequests.find(({ options }) => options.method === 'POST');
    expect(JSON.parse(String(writeRequest?.options.body))).toEqual([
      expect.objectContaining({
        tenant_id: 'tenant-a',
        collection: 'ftf_missions',
        record_id: 'mission-a',
        payload: { id: 'mission-a', status: 'Approved' },
      }),
    ]);
    expect(spaFallbacks).toBe(0);
  });

  it('keeps API error responses as JSON instead of falling through to the SPA', async () => {
    const { response, spaFallbacks } = await invoke(
      '/api/geocode',
      createRequest({ url: '/api/geocode?q=x' })
    );

    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toContain('application/json');
    expect(JSON.parse(response.body)).toEqual({
      error: 'Enter an Australian address between 3 and 160 characters.',
    });
    expect(response.body).not.toContain('<!doctype html>');
    expect(spaFallbacks).toBe(0);
  });

  it('terminates unmatched API requests as JSON before Vite SPA fallback', async () => {
    const { layers, response, spaFallbacks } = await invokePlugin('/api/not-real');

    expect(layers.map(({ path }) => path)).toEqual([
      '/api/auth',
      '/api/store',
      '/api/geocode',
      '/api/pmav',
      '/api/identify-weed',
      '/api',
    ]);
    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.headers['content-type']).not.toContain('text/html');
    expect(JSON.parse(response.body)).toEqual({ error: 'API route not found.' });
    expect(spaFallbacks).toBe(0);
  });

  it('registers the same API boundary in built Vite previews', async () => {
    const development = await invokePlugin('/api/not-real', 'configureServer');
    const preview = await invokePlugin('/api/not-real', 'configurePreviewServer');

    expect(preview.layers.map(({ path }) => path)).toEqual(
      development.layers.map(({ path }) => path)
    );
    expect(preview.response.statusCode).toBe(404);
    expect(preview.response.headers['content-type']).toContain('application/json');
    expect(preview.spaFallbacks).toBe(0);
  });

  it('offers a loopback-only authenticated read fixture without exposing financial sentinels', async () => {
    process.env = {
      ...originalEnvironment,
      FTF_E2E_AUTH_FIXTURE: 'local-playwright-only',
    };

    const { response } = await invokePlugin(
      '/api/store?collection=ftf_missions',
      'configurePreviewServer',
      {
        host: '127.0.0.1:4173',
        'x-ftf-e2e-auth': 'contractor',
      },
    );

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.records[0]).toMatchObject({
      id: 'e2e-mission',
      missionName: 'Synthetic boundary mission',
      deploymentWorkPack: {
        assets: [{ id: 'e2e-truck', name: 'Synthetic truck' }],
      },
    });
    expect(JSON.stringify(body)).not.toMatch(
      /E2E_(?:COST|RATE|MARGIN|PROFIT|PURCHASE|DEPLOYMENT)_SENTINEL/
    );
    expect(body.records[0]).not.toHaveProperty('financialEstimate');
    expect(body.records[0]).not.toHaveProperty('financialActual');
  });

  it('never enables the synthetic fixture in Vercel', async () => {
    process.env = {
      ...originalEnvironment,
      FTF_E2E_AUTH_FIXTURE: 'local-playwright-only',
      VERCEL: '1',
    };

    const { response } = await invokePlugin(
      '/api/store?collection=ftf_missions',
      'configurePreviewServer',
      {
        host: '127.0.0.1:4173',
        'x-ftf-e2e-auth': 'contractor',
      },
    );

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toEqual({ error: 'Authentication is required.' });
  });
});
