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
  return {
    name: 'ftf-local-api',
    configureServer(server) {
      registerLocalApiMiddleware(server.middlewares);
    },
  };
}

module.exports = {
  registerLocalApiMiddleware,
  localApiPlugin,
};
