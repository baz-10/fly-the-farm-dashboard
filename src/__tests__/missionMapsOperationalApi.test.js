const { createMissionMapHandler } = require('../../server/operational-api');

const missionId = '11111111-1111-4111-8111-111111111111';
const context = { organisation: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, internalUser: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }, permissions: ['mission_maps.read', 'mission_maps.update'], operatingLocationIds: ['cccccccc-cccc-4ccc-8ccc-cccccccccccc'] };
const response = () => { const res = { statusCode: 0, body: null, headers: {}, setHeader: (k,v) => { res.headers[k]=v; }, status: (s) => { res.statusCode=s; return res; }, json: (b) => { res.body=b; return res; }, end: () => res }; return res; };
const request = (method, body = {}, query = { missionId }) => ({ method, body, query, headers: { origin: 'https://spray.test', host: 'spray.test' } });

describe('mission map operational API', () => {
  test('requires map permission and location-scoped mission access', async () => {
    const repository = { get: jest.fn().mockResolvedValue({ id: missionId, operating_location_id: context.operatingLocationIds[0], status: 'planning' }), getMissionMap: jest.fn().mockResolvedValue(null) };
    const res = response();
    await createMissionMapHandler({ repository, resolveContext: jest.fn().mockResolvedValue({ ...context, permissions: [] }) })(request('GET'), res);
    expect(res.statusCode).toBe(403);
    expect(repository.getMissionMap).not.toHaveBeenCalled();
  });

  test('dispatches a valid versioned geometry save', async () => {
    const geometry = { id: '22222222-2222-4222-8222-222222222222', role: 'operational_boundary', geometryType: 'Polygon', geometry: { type: 'Polygon', coordinates: [[[153,-27],[153.01,-27],[153.01,-27.01],[153,-27]]] }, sourceCrs: 'EPSG:4326', canonicalCrs: 'EPSG:4326', provenance: 'drawn', validationState: 'valid', areaHectares: 10, lengthMetres: null, label: 'Block', notes: '', sourceFileId: null };
    const repository = { get: jest.fn().mockResolvedValue({ id: missionId, operating_location_id: context.operatingLocationIds[0], status: 'planning' }), saveMissionMap: jest.fn().mockResolvedValue({ record: { mission_id: missionId, version_number: 1, notes: '', source_field_boundary_version_id: null, geometries: [geometry], created_at: '2026-08-02T00:00:00Z', created_by_internal_user_id: context.internalUser.id } }) };
    const res = response();
    await createMissionMapHandler({ repository, resolveContext: jest.fn().mockResolvedValue(context) })(request('POST', { expectedVersion: 0, notes: '', sourceFieldBoundaryVersionId: null, geometries: [geometry] }), res);
    expect(res.statusCode).toBe(201);
    expect(repository.saveMissionMap).toHaveBeenCalledWith(context, missionId, expect.objectContaining({ expectedVersion: 0, geometries: [geometry] }));
  });

  test('returns explicit conflict and never reports a failed save as success', async () => {
    const repository = { get: jest.fn().mockResolvedValue({ id: missionId, operating_location_id: context.operatingLocationIds[0], status: 'planning' }), saveMissionMap: jest.fn().mockResolvedValue({ conflict: true, currentVersion: 4 }) };
    const res = response();
    const geometry = { id: '22222222-2222-4222-8222-222222222222', role: 'operational_boundary', geometryType: 'Polygon', geometry: { type: 'Polygon', coordinates: [[[153,-27],[153.01,-27],[153.01,-27.01],[153,-27]]] }, sourceCrs: 'EPSG:4326', canonicalCrs: 'EPSG:4326', provenance: 'drawn', validationState: 'valid', areaHectares: 10, lengthMetres: null, label: 'Block', notes: '', sourceFileId: null };
    await createMissionMapHandler({ repository, resolveContext: jest.fn().mockResolvedValue(context) })(request('POST', { expectedVersion: 3, notes: '', sourceFieldBoundaryVersionId: null, geometries: [geometry] }), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.error.code).toBe('VERSION_CONFLICT');
  });
});
