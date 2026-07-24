const authHandler = require('../api/auth');
const storeHandler = require('../api/store');
const geocodeHandler = require('../api/geocode');
const pmavHandler = require('../api/pmav');
const identifyWeedHandler = require('../api/identify-weed');

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);
const LOCAL_API_HANDLERS = [
  ['/api/auth', authHandler],
  ['/api/store', storeHandler],
  ['/api/geocode', geocodeHandler],
  ['/api/pmav', pmavHandler],
  ['/api/identify-weed', identifyWeedHandler],
];

const LOCAL_E2E_FIXTURE = {
  user: {
    id: 'e2e-contractor',
    email: 'operator@example.test',
    name: 'Synthetic Operator',
    role: 'contractor',
    tenantId: 'e2e-tenant',
    tier: 'free',
  },
  collections: {
    ftf_missions: [{
      id: 'e2e-mission',
      missionName: 'Synthetic boundary mission',
      deploymentWorkPack: {
        assets: [{
          id: 'e2e-truck',
          name: 'Synthetic truck',
          costs: {
            cost: 'E2E_COST_SENTINEL',
            rate: 'E2E_RATE_SENTINEL',
            purchasePrice: 'E2E_PURCHASE_SENTINEL',
          },
        }],
        estimatedDeploymentCost: 'E2E_DEPLOYMENT_SENTINEL',
        costingComplete: true,
      },
      financialEstimate: {
        totalEstimatedCost: 'E2E_COST_SENTINEL',
        rate: 'E2E_RATE_SENTINEL',
      },
      financialActual: {
        profitMargin: 'E2E_MARGIN_SENTINEL',
        profit: 'E2E_PROFIT_SENTINEL',
      },
    }],
  },
};

function isLoopbackHost(host) {
  return /^(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(String(host || ''))
    || /^\[::1\](?::\d+)?$/.test(String(host || ''));
}

function attachLocalE2eFixture(req) {
  if (
    process.env.FTF_E2E_AUTH_FIXTURE === 'local-playwright-only'
    && process.env.VERCEL !== '1'
    && req.method === 'GET'
    && req.headers?.['x-ftf-e2e-auth'] === 'contractor'
    && isLoopbackHost(req.headers?.host)
  ) {
    Object.defineProperty(req, 'localE2eFixture', {
      configurable: true,
      enumerable: false,
      value: LOCAL_E2E_FIXTURE,
    });
  }
}

function parseQuery(url) {
  const query = {};
  const searchParams = new URL(url || '/', 'http://localhost').searchParams;

  for (const [key, value] of searchParams) {
    if (query[key] === undefined) {
      query[key] = value;
    } else {
      query[key] = Array.isArray(query[key]) ? [...query[key], value] : [query[key], value];
    }
  }

  return query;
}

function addVercelResponseHelpers(res) {
  if (typeof res.status !== 'function') {
    res.status = function status(statusCode) {
      this.statusCode = statusCode;
      return this;
    };
  }

  if (typeof res.json !== 'function') {
    res.json = function json(body) {
      if (!this.getHeader('Content-Type')) {
        this.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
      this.end(JSON.stringify(body));
      return this;
    };
  }
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
    const rawBody = req.body.toString();
    return rawBody ? JSON.parse(rawBody) : {};
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const rawBody = Buffer.concat(chunks).toString();
  return rawBody ? JSON.parse(rawBody) : {};
}

function createLocalApiMiddleware(handler) {
  return async function localApiMiddleware(req, res, next) {
    addVercelResponseHelpers(res);
    attachLocalE2eFixture(req);

    if (!req.query) {
      Object.defineProperty(req, 'query', {
        configurable: true,
        enumerable: true,
        value: parseQuery(req.url),
        writable: true,
      });
    }

    if (BODY_METHODS.has(req.method)) {
      try {
        req.body = await readJsonBody(req);
      } catch {
        return res.status(400).json({ error: 'Invalid JSON body.' });
      }
    }

    try {
      return await handler(req, res);
    } catch (error) {
      return next(error);
    }
  };
}

function registerLocalApiMiddleware(server) {
  for (const [path, handler] of LOCAL_API_HANDLERS) {
    server.use(path, createLocalApiMiddleware(handler));
  }
}

function localApiPlugin() {
  const configure = (server) => {
    registerLocalApiMiddleware(server.middlewares);
    server.middlewares.use('/api', (_req, res) => {
      addVercelResponseHelpers(res);
      return res.status(404).json({ error: 'API route not found.' });
    });
  };

  return {
    name: 'ftf-local-api',
    configureServer: configure,
    configurePreviewServer: configure,
  };
}

module.exports = {
  registerLocalApiMiddleware,
  localApiPlugin,
};
