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

  test('returns the immutable map revision ID needed by downstream evidence', async () => {
    const revisionId = '99999999-9999-4999-8999-999999999999';
    const repository = { get: jest.fn().mockResolvedValue({ id: missionId, operating_location_id: context.operatingLocationIds[0], status: 'planning' }), getMissionMap: jest.fn().mockResolvedValue({ id: revisionId, mission_id: missionId, version_number: 3, notes: '', geometries: [], created_at: '2026-08-02T00:00:00Z', created_by_internal_user_id: context.internalUser.id }) };
    const res = response();
    await createMissionMapHandler({ repository, resolveContext: jest.fn().mockResolvedValue(context) })(request('GET'), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual(expect.objectContaining({ id: revisionId, version: 3 }));
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

  test('rejects a malformed source-file relationship before saving geometry', async () => {
    const geometry = { id: '22222222-2222-4222-8222-222222222222', role: 'operational_boundary', geometryType: 'Polygon', geometry: { type: 'Polygon', coordinates: [[[153,-27],[153.01,-27],[153.01,-27.01],[153,-27]]] }, sourceCrs: 'EPSG:4326', canonicalCrs: 'EPSG:4326', provenance: 'imported', validationState: 'valid', areaHectares: 10, lengthMetres: null, label: 'Block', notes: '', sourceFileId: 'not-a-uuid' };
    const repository = { get: jest.fn().mockResolvedValue({ id: missionId, operating_location_id: context.operatingLocationIds[0], status: 'planning' }), saveMissionMap: jest.fn() };
    const res = response();
    await createMissionMapHandler({ repository, resolveContext: jest.fn().mockResolvedValue(context) })(request('POST', { expectedVersion: 0, notes: '', sourceFieldBoundaryVersionId: null, geometries: [geometry] }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(repository.saveMissionMap).not.toHaveBeenCalled();
  });

  test('accepts an access point alongside the required operational boundary', async () => {
    const boundary = { id: '22222222-2222-4222-8222-222222222222', role: 'operational_boundary', geometryType: 'Polygon', geometry: { type: 'Polygon', coordinates: [[[153,-27],[153.01,-27],[153.01,-27.01],[153,-27]]] }, sourceCrs: 'EPSG:4326', canonicalCrs: 'EPSG:4326', provenance: 'drawn', validationState: 'valid', areaHectares: 10, lengthMetres: null, label: 'Block', notes: '', sourceFileId: null };
    const access = { ...boundary, id: '33333333-3333-4333-8333-333333333333', role: 'access_point', geometryType: 'Point', geometry: {type:'Point',coordinates:[153,-27]}, areaHectares:null,label:'Gate' };
    const repository = { get: jest.fn().mockResolvedValue({ id: missionId, operating_location_id: context.operatingLocationIds[0], status: 'planning' }), saveMissionMap: jest.fn().mockResolvedValue({ record: { mission_id: missionId, version_number: 1, notes: '', geometries: [boundary,access], created_at: '2026-08-02T00:00:00Z' } }) };
    const res=response(); await createMissionMapHandler({repository,resolveContext:jest.fn().mockResolvedValue(context)})(request('POST',{expectedVersion:0,notes:'',sourceFieldBoundaryVersionId:null,geometries:[boundary,access]}),res);
    expect(res.statusCode).toBe(201);
  });

  test('creates an internal Mission source-file record without returning a provider URL', async () => {
    const sourceFileId = '44444444-4444-4444-8444-444444444444';
    const repository = {
      get: jest.fn().mockResolvedValue({ id: missionId, operating_location_id: context.operatingLocationIds[0], status: 'planning' }),
      createMissionMapSourceFile: jest.fn().mockResolvedValue({
        id: sourceFileId, mission_id: missionId, original_filename: 'boundary.kml', source_format: 'kml',
        file_size_bytes: 24, sha256_checksum: 'a'.repeat(64), original_crs: 'EPSG:4326',
        transformation_metadata: { canonicalCrs: 'EPSG:4326' }, validation_result: { state: 'valid' },
        imported_at: '2026-08-02T00:00:00Z', imported_by_internal_user_id: context.internalUser.id,
      }),
    };
    const res = response();
    await createMissionMapHandler({ repository, resolveContext: jest.fn().mockResolvedValue(context) })(request('POST', {
      fileName: 'boundary.kml', fileType: 'kml', sizeBytes: 11,
      dataUrl: 'data:application/vnd.google-earth.kml+xml;base64,PGttbD48L2ttbD4=',
      sourceCrs: 'EPSG:4326', transformationMetadata: { canonicalCrs: 'EPSG:4326' },
      validationResult: { state: 'valid' }, importedAt: '2026-08-02T00:00:00Z',
    }, { missionId, action: 'source-file' }), res);
    expect(res.statusCode).toBe(201);
    expect(repository.createMissionMapSourceFile).toHaveBeenCalledWith(context, missionId, expect.objectContaining({
      fileName: 'boundary.kml', fileType: 'kml', bytes: expect.any(Buffer), checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
    expect(res.body.data).toEqual(expect.objectContaining({ id: sourceFileId, originalFilename: 'boundary.kml', checksum: 'a'.repeat(64) }));
    expect(JSON.stringify(res.body)).not.toMatch(/providerUrl|publicUrl|storageObjectKey/);
  });

  test('rejects invalid import payloads before creating source-file records', async () => {
    const repository = {
      get: jest.fn().mockResolvedValue({ id: missionId, operating_location_id: context.operatingLocationIds[0], status: 'planning' }),
      createMissionMapSourceFile: jest.fn(),
    };
    const res = response();
    await createMissionMapHandler({ repository, resolveContext: jest.fn().mockResolvedValue(context) })(request('POST', {
      fileName: 'boundary.exe', fileType: 'exe', sizeBytes: 4, dataUrl: 'data:text/plain;base64,ZmFrZQ==',
      sourceCrs: 'EPSG:4326', transformationMetadata: {}, validationResult: { state: 'valid' },
    }, { missionId, action: 'source-file' }), res);
    expect(res.statusCode).toBe(400);
    expect(repository.createMissionMapSourceFile).not.toHaveBeenCalled();
  });
});
