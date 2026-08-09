const { createGettingStartedHandler, projectGettingStarted } = require('../../server/getting-started-api');

const permissions = [
  'organisation.branding.read', 'operating_locations.read', 'aircraft.read',
  'equipment_kits.read', 'personnel.read', 'clients.read', 'properties.read',
  'fields.read', 'jobs.read', 'missions.read',
];

const context = {
  user: { id: 'auth-1', name: 'Alex Morgan' },
  organisation: { id: 'organisation-1', name: 'Western Downs Aerial Application' },
  internalUser: { id: 'internal-user-1', name: 'Alex Morgan' },
  roles: ['admin'],
  permissions,
  operatingLocationIds: ['base-1'],
};

function source(overrides = {}) {
  return {
    branding: { organisation: { profile: { report_display_name: 'Western Downs Aerial Application' } } },
    operatingLocations: [{
      id: 'base-1', organisation_id: 'organisation-1', name: 'Dalby Base',
      address: '1 Farm Road, Dalby QLD 4405', timezone: 'Australia/Brisbane',
      latitude: null, longitude: null, location_confirmed_at: null,
    }],
    aircraft: [], equipmentKits: [], personnel: [], clients: [], properties: [],
    fields: [], jobs: [], missions: [],
    ...overrides,
  };
}

function response() {
  return {
    statusCode: 200, body: null, headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

function request(method = 'GET', query = {}) {
  return { method, query, headers: {} };
}

function repository(overrides = {}) {
  return {
    readOrganisationBranding: jest.fn().mockResolvedValue(source().branding),
    list: jest.fn(async (resource) => ({
      operating_locations: source().operatingLocations,
      aircraft: [], 'equipment-kits': [], clients: [], properties: [], fields: [], jobs: [], missions: [],
    }[resource] || [])),
    listPersonnel: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

test('projects the initial organisation from authoritative records without completion flags', () => {
  const result = projectGettingStarted(context, source());

  expect(result.steps.map(({ code, state }) => [code, state])).toEqual([
    ['ORGANISATION', 'COMPLETE'], ['BASE', 'NEEDS_ATTENTION'], ['AIRCRAFT', 'NOT_STARTED'],
    ['EQUIPMENT', 'NOT_STARTED'], ['PERSONNEL', 'OPTIONAL'], ['CLIENT', 'NOT_STARTED'],
    ['PROPERTY', 'NOT_STARTED'], ['FIELD', 'NOT_STARTED'], ['JOB', 'NOT_STARTED'],
    ['MISSION', 'NOT_STARTED'],
  ]);
  expect(result.nextAction).toMatchObject({ code: 'CONFIRM_BASE', route: '/getting-started#base' });
  expect(result.steps.find((step) => step.code === 'EQUIPMENT').action).toMatchObject({
    code: 'ADD_EQUIPMENT', route: '/aircraft',
  });
  expect(result).not.toHaveProperty('completionFlags');
});

test('requires confirmed Base coordinates and an active assignment in the authenticated location scope', () => {
  const completeBase = {
    id: 'base-1', organisation_id: 'organisation-1', name: 'Dalby Base',
    address: '1 Farm Road, Dalby QLD 4405', timezone: 'Australia/Brisbane',
    latitude: -27.1817, longitude: 151.2621,
    location_confirmed_at: '2026-08-09T00:00:00.000Z',
  };

  expect(projectGettingStarted(context, source({ operatingLocations: [completeBase] })).steps[1].state).toBe('COMPLETE');
  expect(projectGettingStarted(context, source({
    operatingLocations: [{ ...completeBase, id: 'unassigned-base' }],
  })).steps[1].state).toBe('NOT_STARTED');
  expect(projectGettingStarted(context, source({
    operatingLocations: [{ ...completeBase, latitude: null }],
  })).steps[1].state).toBe('NEEDS_ATTENTION');
});

test('keeps Personnel optional when a Draft Mission exists because no operate decision is authoritative in this slice', () => {
  const withoutPersonnel = projectGettingStarted(context, source({
    missions: [{ id: 'mission-1', organisation_id: 'organisation-1', operating_location_id: 'base-1', status: 'DRAFT' }],
  }));
  expect(withoutPersonnel.steps.find((step) => step.code === 'PERSONNEL')).toMatchObject({
    state: 'OPTIONAL', optional: true,
  });
  expect(withoutPersonnel.operationalReadiness).toEqual({ completedSteps: 2, requiredSteps: 9 });

  const withPersonnel = projectGettingStarted(context, source({
    personnel: [{ id: 'personnel-1', organisation_id: 'organisation-1', operating_location_ids: ['base-1'] }],
    missions: [{ id: 'mission-1', organisation_id: 'organisation-1', operating_location_id: 'base-1' }],
  }));
  expect(withPersonnel.steps.find((step) => step.code === 'PERSONNEL').state).toBe('COMPLETE');
});

test('fails closed for records without exact tenant and assigned Base authority fields', () => {
  const projection = projectGettingStarted(context, source({
    operatingLocations: [
      { id: 'base-1', address: 'Missing tenant', timezone: 'Australia/Brisbane', latitude: -27, longitude: 151, location_confirmed_at: '2026-08-09T00:00:00Z' },
      { id: 'base-1', organisation_id: 'other-organisation', address: 'Wrong tenant', timezone: 'Australia/Brisbane', latitude: -27, longitude: 151, location_confirmed_at: '2026-08-09T00:00:00Z' },
    ],
    aircraft: [
      { id: 'aircraft-unscoped', organisation_id: 'organisation-1' },
      { id: 'aircraft-other-base', organisation_id: 'organisation-1', operating_location_id: 'base-2' },
      { id: 'aircraft-other-tenant', organisation_id: 'other-organisation', operating_location_id: 'base-1' },
    ],
    equipmentKits: [{ id: 'kit-unscoped', organisation_id: 'organisation-1' }],
    personnel: [{ id: 'person-unscoped' }, { id: 'person-other', organisation_id: 'other-organisation' }],
    clients: [{ id: 'client-unscoped' }, { id: 'client-other', organisation_id: 'other-organisation' }],
    properties: [{ id: 'property-unscoped' }],
    fields: [{ id: 'field-unscoped' }],
    jobs: [{ id: 'job-unscoped' }],
    missions: [{ id: 'mission-unscoped', organisation_id: 'organisation-1' }],
  }));

  expect(projection.steps.slice(1).map(({ code, count }) => [code, count])).toEqual([
    ['BASE', 0], ['AIRCRAFT', 0], ['EQUIPMENT', 0], ['PERSONNEL', 0], ['CLIENT', 0],
    ['PROPERTY', 0], ['FIELD', 0], ['JOB', 0], ['MISSION', 0],
  ]);
});

test('rejects blank coordinates and malformed confirmation times while accepting coordinate boundaries', () => {
  const base = {
    id: 'base-1', organisation_id: 'organisation-1', address: '1 Farm Road', timezone: 'Australia/Brisbane',
    latitude: -90, longitude: 180, location_confirmed_at: '2026-08-09T00:00:00.000Z',
  };

  expect(projectGettingStarted(context, source({ operatingLocations: [base] })).steps[1].state).toBe('COMPLETE');
  expect(projectGettingStarted(context, source({ operatingLocations: [{ ...base, latitude: '   ' }] })).steps[1].state).toBe('NEEDS_ATTENTION');
  expect(projectGettingStarted(context, source({ operatingLocations: [{ ...base, longitude: '\t' }] })).steps[1].state).toBe('NEEDS_ATTENTION');
  expect(projectGettingStarted(context, source({ operatingLocations: [{ ...base, location_confirmed_at: 'not-a-time' }] })).steps[1].state).toBe('NEEDS_ATTENTION');
  expect(projectGettingStarted(context, source({ operatingLocations: [{ ...base, latitude: 90, longitude: -180 }] })).steps[1].state).toBe('COMPLETE');
});

test('reads the authenticated tenant and assigned Base scope without creating audit noise', async () => {
  const repo = repository();
  const resolveContext = jest.fn().mockResolvedValue(context);
  const handler = createGettingStartedHandler({ repository: repo, resolveContext });
  const res = response();

  await handler(request('GET', { organisationId: 'attacker-organisation' }), res);

  expect(res.statusCode).toBe(200);
  expect(res.headers['cache-control']).toBe('no-store');
  expect(res.body.data.organisation).toMatchObject({ id: 'organisation-1' });
  expect(repo.readOrganisationBranding).toHaveBeenCalledWith(context);
  expect(repo.list).toHaveBeenCalledWith('operating_locations', context, { page: 1, pageSize: 100 });
  expect(repo.listPersonnel).toHaveBeenCalledWith(context, { operatingLocationId: 'base-1', includePrivate: false });
  expect(Object.keys(repo)).toEqual(expect.not.arrayContaining(['create', 'update', 'write', 'audit']));
});

test('reads every page so an assigned confirmed Base after row 100 is not truncated', async () => {
  const firstPage = Array.from({ length: 100 }, (_, index) => ({
    id: `unassigned-base-${index + 1}`,
    organisation_id: 'organisation-1',
    address: `${index + 1} Farm Road`,
    timezone: 'Australia/Brisbane',
    latitude: -27,
    longitude: 151,
    location_confirmed_at: '2026-08-09T00:00:00.000Z',
  }));
  const assignedBase = {
    id: 'base-1', organisation_id: 'organisation-1', address: '1 Assigned Road',
    timezone: 'Australia/Brisbane', latitude: -27.1817, longitude: 151.2621,
    location_confirmed_at: '2026-08-09T00:00:00.000Z',
  };
  const repo = repository({
    list: jest.fn(async (resource, _context, options) => {
      if (resource !== 'operating_locations') return [];
      return options.page === 1 ? firstPage : [assignedBase];
    }),
  });
  const handler = createGettingStartedHandler({ repository: repo, resolveContext: async () => context });
  const res = response();

  await handler(request(), res);

  expect(res.statusCode).toBe(200);
  expect(res.body.data.steps.find((step) => step.code === 'BASE')).toMatchObject({ state: 'COMPLETE', count: 1 });
  expect(repo.list).toHaveBeenCalledWith('operating_locations', context, { page: 2, pageSize: 100 });
});

test('denies non-admin and permission-incomplete sessions before reading tenant records', async () => {
  const cases = [
    { ...context, roles: ['contractor'] },
    { ...context, permissions: permissions.filter((permission) => permission !== 'aircraft.read') },
  ];

  for (const deniedContext of cases) {
    const repo = repository();
    const handler = createGettingStartedHandler({ repository: repo, resolveContext: async () => deniedContext });
    const res = response();
    await handler(request(), res);
    expect(res.statusCode).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(repo.list).not.toHaveBeenCalled();
  }
});

test('honours the same scoped read wildcards as the established domain APIs', async () => {
  const wildcardContext = {
    ...context,
    permissions: permissions.map((permission) => permission.replace(/\.[^.]+$/, '.*')),
  };
  const repo = repository();
  const handler = createGettingStartedHandler({ repository: repo, resolveContext: async () => wildcardContext });
  const res = response();

  await handler(request(), res);

  expect(res.statusCode).toBe(200);
  expect(repo.list).toHaveBeenCalled();
});

test('allows GET only and exposes both direct and dispatcher API modules', async () => {
  expect(() => require('../../api/v1/getting-started')).not.toThrow();
  const repo = repository();
  const handler = createGettingStartedHandler({ repository: repo, resolveContext: async () => context });
  const res = response();
  await handler(request('POST'), res);
  expect(res.statusCode).toBe(405);
  expect(res.headers.allow).toBe('GET');
  expect(repo.list).not.toHaveBeenCalled();
});
