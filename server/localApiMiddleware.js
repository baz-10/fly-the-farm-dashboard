const authHandler = require('../api/auth');
const storeHandler = require('../api/store');
const safetyAttachmentsHandler = require('../api/safety-attachments');
const geocodeHandler = require('../api/geocode');
const pmavHandler = require('../api/pmav');
const identifyWeedHandler = require('../api/identify-weed');

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);
const RAW_BODY_HANDLERS = new Set([safetyAttachmentsHandler]);
const LOCAL_API_HANDLERS = [
  ['/api/auth', authHandler],
  ['/api/store', storeHandler],
  ['/api/safety-attachments', safetyAttachmentsHandler],
  ['/api/geocode', geocodeHandler],
  ['/api/pmav', pmavHandler],
  ['/api/identify-weed', identifyWeedHandler],
];

const LOCAL_E2E_USERS = {
  contractor: {
    id: 'e2e-contractor',
    email: 'operator@example.test',
    name: 'Synthetic Operator',
    role: 'contractor',
    tenantId: 'e2e-tenant',
    tier: 'free',
    safetyPlanAuthority: false,
  },
  authority: {
    id: 'e2e-authority',
    email: 'authority@example.test',
    name: 'Synthetic Authority',
    role: 'contractor',
    tenantId: 'e2e-tenant',
    tier: 'pro',
    safetyPlanAuthority: true,
  },
  admin: {
    id: 'e2e-admin',
    email: 'admin@example.test',
    name: 'Synthetic Administrator',
    role: 'admin',
    tenantId: 'e2e-tenant',
    tier: 'pro',
    safetyPlanAuthority: false,
  },
  pic: {
    id: 'e2e-pic',
    email: 'pic@example.test',
    name: 'Synthetic PIC',
    role: 'contractor',
    tenantId: 'e2e-tenant',
    tier: 'pro',
    safetyPlanAuthority: false,
  },
  client: {
    id: 'e2e-client-user',
    email: 'client@example.test',
    name: 'Synthetic Client',
    role: 'client',
    tenantId: 'e2e-tenant',
    tier: 'free',
    safetyPlanAuthority: false,
  },
  unrelated: {
    id: 'e2e-unrelated',
    email: 'unrelated@example.test',
    name: 'Unrelated Operator',
    role: 'contractor',
    tenantId: 'e2e-other-tenant',
    tier: 'pro',
    safetyPlanAuthority: false,
  },
};

const LOCAL_E2E_SEED_COLLECTIONS = {
  ftf_missions: [{
    id: 'e2e-mission',
    missionName: 'Synthetic boundary mission',
    jobId: 'e2e-job',
    status: 'Approved',
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
    jsaRecord: {
      id: 'e2e-jsa',
      updatedAt: '2026-07-24T00:00:00.000Z',
      hazardIdentification: [
        {
          id: 'hazard-powerlines',
          description: 'Powerlines',
          controlMeasures: ['Maintain exclusion area'],
        },
        {
          id: 'hazard-public',
          description: 'Public access',
          controlMeasures: ['Install signage'],
        },
      ],
      missionChecks: {
        answers: [{
          questionId: 'weather-change',
          answer: true,
          notes: 'Weather may change',
        }],
        riskControls: [{
          questionId: 'weather-change',
          mitigation: 'Monitor live weather',
        }],
      },
      signOffs: { pilot: { userId: 'e2e-pic' } },
    },
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
  ftf_safety_plan_templates: [],
  ftf_safety_plans: [],
  ftf_safety_plan_audit: [],
  ftf_work_packs: [{
    id: '__value__',
    assets: [{
      id: 'e2e-truck',
      assetType: 'truck',
      registration: 'E2E-001',
      name: 'Synthetic Operations Truck',
      manufacturer: 'Synthetic',
      model: 'Fixture',
      year: 2026,
      vin: 'E2EVIN',
      ownershipType: 'owned',
      payloadCapacityKg: 1000,
      operationalNotes: 'Operational data remains visible',
      status: 'available',
      costs: {
        purchasePrice: 987654.34,
        currentValue: 987654.35,
        costPerHour: 987654.31,
        costPerDay: 987654.32,
        costPerKm: 987654.33,
      },
      createdAt: '2026-07-24T00:00:00.000Z',
      updatedAt: '2026-07-24T00:00:00.000Z',
    }],
    trucks: [],
    templates: [],
    snapshots: [],
  }],
  ftf_maintenance: [{
    id: '__value__',
    assets: [{
      id: 'e2e-maintenance-truck',
      tenantId: 'e2e-tenant',
      sourceId: 'e2e-truck',
      scope: 'fleet',
      assetClass: 'truck',
      name: 'Synthetic Operations Truck',
      status: 'serviceable',
      readings: { kilometres: 100 },
      createdAt: '2026-07-24T00:00:00.000Z',
      updatedAt: '2026-07-24T00:00:00.000Z',
    }],
    schedules: [],
    records: [{
      id: 'e2e-maintenance-record',
      tenantId: 'e2e-tenant',
      assetId: 'e2e-maintenance-truck',
      type: 'maintenance',
      title: 'Synthetic service',
      status: 'serviceable',
      occurredAt: '2026-07-24T00:00:00.000Z',
      createdAt: '2026-07-24T00:00:00.000Z',
      createdBy: 'e2e-contractor',
      createdByName: 'Synthetic Operator',
      createdByRole: 'contractor',
      affectsServiceability: false,
      resultingServiceability: 'serviceable',
      cost: 987654.36,
      attachments: [],
    }],
    auditEvents: [],
  }],
};

let localE2eCollections;

function resetLocalE2eCollections() {
  localE2eCollections = structuredClone(LOCAL_E2E_SEED_COLLECTIONS);
}

resetLocalE2eCollections();

function localE2eFixtureFor(role) {
  return {
    user: LOCAL_E2E_USERS[role],
    collections: localE2eCollections,
  };
}

/*
 * Deliberately process-local and unreachable unless the exact test sentinel,
 * loopback host and non-Vercel conditions all match. This repository prevents
 * browser write tests from ever falling through to Supabase.
 */
function handleLocalE2eStore(req, res) {
  const fixture = req.localE2eFixture;
  if (!fixture) return false;
  if (req.method === 'DELETE' && String(req.query?.fixtureReset || '') === '1') {
    if (fixture.user.role !== 'admin') {
      res.status(403).json({ error: 'Only fixture administrators may reset browser test data.' });
      return true;
    }
    resetLocalE2eCollections();
    res.status(204).end();
    return true;
  }
  if (!['PUT', 'DELETE'].includes(req.method)) return false;

  const body = req.body || {};
  const collection = String(body.collection || req.query?.collection || '');
  if (!Object.prototype.hasOwnProperty.call(localE2eCollections, collection)) {
    res.status(400).json({ error: 'Invalid collection name.' });
    return true;
  }
  if (
    fixture.user.role === 'client'
    || (collection === 'ftf_safety_plan_templates' && fixture.user.role !== 'admin')
  ) {
    res.status(403).json({ error: 'Fixture account cannot write the requested collection.' });
    return true;
  }
  const records = localE2eCollections[collection];
  const recordId = String(body.recordId || req.query?.recordId || '');

  if (req.method === 'DELETE') {
    localE2eCollections[collection] = recordId
      ? records.filter((record) => record?.id !== recordId)
      : [];
    res.status(200).json({ ok: true, payload: null });
    return true;
  }

  if (collection === 'ftf_safety_plan_templates' && body.action) {
    const incoming = structuredClone(body.payload || {});
    if (body.action === 'publish_company_master') {
      const nextMasterVersion = Math.max(
        0,
        ...records.map((record) => Number(record?.masterVersion) || 0)
      ) + 1;
      const published = {
        ...incoming,
        id: `e2e-company-safety-plan-master-${nextMasterVersion}`,
        recordType: 'published',
        masterVersion: nextMasterVersion,
        version: `${nextMasterVersion}.0`,
        publishedAt: new Date().toISOString(),
        publishedBy: { userId: fixture.user.id, name: fixture.user.name },
      };
      localE2eCollections[collection] = [
        ...records.filter((record) => record?.recordType !== 'draft'),
        published,
      ];
      res.status(200).json({ ok: true, count: 1, payload: published });
      return true;
    }
    const draft = {
      ...incoming,
      id: 'safety-plan-template-draft',
      recordType: 'draft',
      draftRevision: body.action === 'update_company_template_draft'
        ? (Number(incoming.draftRevision) || 0) + 1
        : 1,
      version: 'draft',
    };
    const draftIndex = records.findIndex((record) => record?.id === draft.id);
    if (draftIndex >= 0) records[draftIndex] = draft;
    else records.push(draft);
    res.status(200).json({ ok: true, count: 1, payload: draft });
    return true;
  }

  if (!recordId || !body.payload || body.payload.id !== recordId) {
    res.status(400).json({ error: 'Fixture writes require a matching record ID and payload.' });
    return true;
  }
  if (body.payload.tenantId && body.payload.tenantId !== fixture.user.tenantId) {
    res.status(403).json({ error: 'Fixture tenant does not match the authenticated tenant.' });
    return true;
  }
  const currentIndex = records.findIndex((record) => record?.id === recordId);
  if (
    currentIndex >= 0
    && Number.isSafeInteger(body.payload.revision)
    && body.payload.revision !== records[currentIndex].revision + 1
  ) {
    res.status(409).json({
      error: 'Safety Plan changed in another session. Refresh and try again.',
      code: 'SAFETY_PLAN_CONFLICT',
      currentRevision: records[currentIndex].revision,
    });
    return true;
  }
  const canonical = structuredClone(body.payload);
  if (currentIndex >= 0) records[currentIndex] = canonical;
  else records.push(canonical);
  res.status(200).json({ ok: true, count: 1, payload: canonical });
  return true;
}

function isLoopbackHost(host) {
  return /^(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(String(host || ''))
    || /^\[::1\](?::\d+)?$/.test(String(host || ''));
}

function attachLocalE2eFixture(req) {
  const fixtureRole = String(req.headers?.['x-ftf-e2e-auth'] || '');
  if (
    process.env.FTF_E2E_AUTH_FIXTURE === 'local-playwright-only'
    && process.env.VERCEL !== '1'
    && Object.prototype.hasOwnProperty.call(LOCAL_E2E_USERS, fixtureRole)
    && isLoopbackHost(req.headers?.host)
  ) {
    Object.defineProperty(req, 'localE2eFixture', {
      configurable: true,
      enumerable: false,
      value: localE2eFixtureFor(fixtureRole),
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

    if (BODY_METHODS.has(req.method) && !RAW_BODY_HANDLERS.has(handler)) {
      try {
        req.body = await readJsonBody(req);
      } catch {
        return res.status(400).json({ error: 'Invalid JSON body.' });
      }
    }

    try {
      if (handler === storeHandler && handleLocalE2eStore(req, res)) return undefined;
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
