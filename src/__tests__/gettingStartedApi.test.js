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

test('keeps Personnel optional until authoritative Mission work makes it operationally relevant', () => {
  const withoutPersonnel = projectGettingStarted(context, source({
    missions: [{ id: 'mission-1', organisation_id: 'organisation-1', operating_location_id: 'base-1' }],
  }));
  expect(withoutPersonnel.steps.find((step) => step.code === 'PERSONNEL')).toMatchObject({
    state: 'NEEDS_ATTENTION', optional: false,
  });

  const withPersonnel = projectGettingStarted(context, source({
    personnel: [{ id: 'personnel-1', organisation_id: 'organisation-1' }],
    missions: [{ id: 'mission-1', organisation_id: 'organisation-1', operating_location_id: 'base-1' }],
  }));
  expect(withPersonnel.steps.find((step) => step.code === 'PERSONNEL').state).toBe('COMPLETE');
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
  expect(repo.list).toHaveBeenCalledWith('operating_locations', context, { pageSize: 100 });
  expect(repo.listPersonnel).toHaveBeenCalledWith(context, { operatingLocationId: 'base-1', includePrivate: false });
  expect(Object.keys(repo)).toEqual(expect.not.arrayContaining(['create', 'update', 'write', 'audit']));
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
