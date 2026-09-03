const { createOperationalHandler } = require('../../server/operational-api');

const organisationId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
const locationId = '33333333-3333-4333-8333-333333333333';
const assetId = '44444444-4444-4444-8444-444444444444';

function response() {
  return { statusCode: 200, body: null, headers: {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; }, setHeader(name, value) { this.headers[name.toLowerCase()] = value; } };
}

function request(method, body = {}, query = {}) {
  return { method, body, query, headers: { host: 'localhost:3001', origin: 'http://localhost:3001' } };
}

function context(permissions = ['fleet_assets.read', 'fleet_assets.create', 'fleet_assets.update', 'fleet_assets.archive'], locations = [locationId]) {
  return { user: { id: 'auth-user' }, organisation: { id: organisationId, name: 'Fly The Farm' }, internalUser: { id: actorId }, roles: ['admin'], permissions, operatingLocationIds: locations, entitlement: { tier: 'beta', seatActive: true } };
}

function record(overrides = {}) {
  return {
    id: assetId, organisation_id: organisationId, operating_location_id: locationId, asset_type: 'generator',
    asset_identifier: 'GEN-003', registration: null, vin: null, serial_number: 'SER-003', manufacturer: 'Honda',
    model: 'EU70', manufacture_year: 2025, status: 'available', notes: '', row_version: 1,
    created_at: '2026-08-20T00:00:00.000Z', updated_at: '2026-08-20T00:00:00.000Z', ...overrides,
  };
}

function handler(repository, permissions, locations) {
  return createOperationalHandler('fleet-assets', { repository, resolveContext: jest.fn().mockResolvedValue(context(permissions, locations)) });
}

describe('authoritative Fleet asset API', () => {
  test('creates an independent generator without registration or VIN', async () => {
    const repository = { relationshipExists: jest.fn().mockResolvedValue(true), create: jest.fn().mockResolvedValue({ record: record() }) };
    const res = response();
    await handler(repository)(request('POST', {
      operatingLocationId: locationId, assetType: 'generator', assetIdentifier: 'GEN-003', serialNumber: 'SER-003',
      manufacturer: 'Honda', model: 'EU70', manufactureYear: 2025, status: 'available', notes: '',
    }), res);
    expect(res.statusCode).toBe(201);
    expect(res.body.data).toEqual(expect.objectContaining({ id: assetId, assetType: 'generator', assetIdentifier: 'GEN-003', registration: undefined, rowVersion: 1 }));
    expect(repository.create).toHaveBeenCalledWith('fleet-assets', expect.anything(), expect.objectContaining({ asset_type: 'generator', operating_location_id: locationId, registration: null }));
  });

  test.each(['truck', 'trailer'])('requires registration for %s assets', async (assetType) => {
    const repository = { create: jest.fn() };
    const res = response();
    await handler(repository)(request('POST', { operatingLocationId: locationId, assetType, assetIdentifier: 'UNIT-1', status: 'available', notes: '' }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(repository.create).not.toHaveBeenCalled();
  });

  test('rejects create outside the actor Base scope', async () => {
    const repository = { create: jest.fn() };
    const res = response();
    await handler(repository, undefined, [])(request('POST', { operatingLocationId: locationId, assetType: 'generator', assetIdentifier: 'GEN-003', status: 'available', notes: '' }), res);
    expect(res.statusCode).toBe(403);
    expect(res.body.error.code).toBe('LOCATION_FORBIDDEN');
    expect(repository.create).not.toHaveBeenCalled();
  });

  test('filters list and detail reads to assigned Bases', async () => {
    const foreign = record({ id: '55555555-5555-4555-8555-555555555555', operating_location_id: '66666666-6666-4666-8666-666666666666' });
    const repository = { list: jest.fn().mockResolvedValue([record(), foreign]), get: jest.fn().mockResolvedValue(foreign) };
    const listRes = response();
    await handler(repository)(request('GET'), listRes);
    expect(listRes.body.data).toHaveLength(1);
    const detailRes = response();
    await handler(repository)(request('GET', {}, { id: foreign.id }), detailRes);
    expect(detailRes.statusCode).toBe(404);
  });

  test('returns the current row version when an update conflicts', async () => {
    const repository = { relationshipExists: jest.fn().mockResolvedValue(true), get: jest.fn().mockResolvedValue(record()), update: jest.fn().mockResolvedValue({ conflict: true, currentVersion: 3 }) };
    const res = response();
    await handler(repository)(request('PATCH', {
      expectedVersion: 1, operatingLocationId: locationId, assetType: 'generator', assetIdentifier: 'GEN-003',
      serialNumber: 'SER-003', manufacturer: 'Honda', model: 'EU70', manufactureYear: 2025, status: 'available', notes: '',
    }, { id: assetId }), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toEqual(expect.objectContaining({ code: 'VERSION_CONFLICT', meta: { currentVersion: 3 } }));
  });

  test('fails a duplicate governed identity as a conflict without returning a malformed record', async () => {
    const repository = { relationshipExists: jest.fn().mockResolvedValue(true), create: jest.fn().mockResolvedValue({ identityConflict: true }) };
    const res = response();
    await handler(repository)(request('POST', {
      operatingLocationId: locationId, assetType: 'generator', assetIdentifier: 'GEN-003',
      serialNumber: 'SER-003', status: 'available', notes: '',
    }), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.error.code).toBe('IDENTITY_CONFLICT');
  });

  test('archives only with explicit archive permission and expected version', async () => {
    const repository = { get: jest.fn().mockResolvedValue(record()), hasActiveDependencies: jest.fn().mockResolvedValue(false), archive: jest.fn().mockResolvedValue({ record: record({ archived_at: '2026-08-20T01:00:00.000Z', row_version: 2 }) }) };
    const denied = response();
    await handler(repository, ['fleet_assets.read'])(request('DELETE', { expectedVersion: 1 }, { id: assetId }), denied);
    expect(denied.statusCode).toBe(403);
    const allowed = response();
    await handler(repository)(request('DELETE', { expectedVersion: 1 }, { id: assetId }), allowed);
    expect(allowed.statusCode).toBe(200);
    expect(repository.archive).toHaveBeenCalledWith('fleet-assets', expect.anything(), assetId, 1);
  });

  test('does not archive a Fleet asset outside the assigned Base scope', async () => {
    const repository = { get: jest.fn().mockResolvedValue(record()), hasActiveDependencies: jest.fn(), archive: jest.fn() };
    const res = response();
    await handler(repository, undefined, [])(request('DELETE', { expectedVersion: 1 }, { id: assetId }), res);
    expect(res.statusCode).toBe(404);
    expect(repository.archive).not.toHaveBeenCalled();
  });

  test('blocks archive while a current Work Pack references the canonical Fleet ID', async () => {
    const repository = { get: jest.fn().mockResolvedValue(record()), hasActiveDependencies: jest.fn().mockResolvedValue(true), archive: jest.fn() };
    const res = response();
    await handler(repository)(request('DELETE', { expectedVersion: 1 }, { id: assetId }), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.error.code).toBe('ARCHIVE_CONFLICT');
    expect(repository.archive).not.toHaveBeenCalled();
  });
});
