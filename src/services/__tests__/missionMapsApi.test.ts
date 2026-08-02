import { createMissionMapsApi, MissionMapsApiError } from '../missionMapsApi';

const revision = {
  missionId: '11111111-1111-4111-8111-111111111111', version: 2,
  notes: 'Powerlines on western edge', sourceFieldBoundaryVersionId: null,
  geometries: [{ id: '22222222-2222-4222-8222-222222222222', role: 'operational_boundary', geometryType: 'Polygon',
    geometry: { type: 'Polygon', coordinates: [[[153, -27], [153.01, -27], [153.01, -27.01], [153, -27]]] },
    sourceCrs: 'EPSG:4326', canonicalCrs: 'EPSG:4326', provenance: 'drawn', validationState: 'valid', areaHectares: 10,
    lengthMetres: null, label: 'Treatment block', notes: '', sourceFileId: null }],
  createdAt: '2026-08-02T00:00:00Z', createdBy: '33333333-3333-4333-8333-333333333333',
};

describe('mission maps API', () => {
  test('loads the current governed map revision', async () => {
    const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: revision }) });
    await expect(createMissionMapsApi(fetcher as any).get(revision.missionId)).resolves.toEqual(revision);
    expect(fetcher).toHaveBeenCalledWith(`/api/v1/mission-maps?missionId=${revision.missionId}`, expect.objectContaining({ credentials: 'same-origin' }));
  });

  test('saves with optimistic concurrency and no legacy fallback', async () => {
    const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: revision }) });
    await createMissionMapsApi(fetcher as any).save(revision.missionId, { expectedVersion: 1, notes: revision.notes, sourceFieldBoundaryVersionId: null, geometries: revision.geometries });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(expect.objectContaining({ expectedVersion: 1, geometries: revision.geometries }));
  });

  test('surfaces stale writes explicitly', async () => {
    const fetcher = jest.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: { code: 'VERSION_CONFLICT', message: 'Changed', meta: { currentVersion: 3 } } }) });
    await expect(createMissionMapsApi(fetcher as any).save(revision.missionId, { expectedVersion: 2, notes: '', sourceFieldBoundaryVersionId: null, geometries: [] }))
      .rejects.toEqual(expect.objectContaining<Partial<MissionMapsApiError>>({ code: 'VERSION_CONFLICT', currentVersion: 3 }));
  });

  test('uploads imported map evidence and receives an internal source-file ID', async () => {
    const source = {
      id: '44444444-4444-4444-8444-444444444444', missionId: revision.missionId,
      originalFilename: 'boundary.kml', sourceFormat: 'kml', fileSizeBytes: 11,
      checksum: 'a'.repeat(64), originalCrs: 'EPSG:4326', transformationMetadata: { canonicalCrs: 'EPSG:4326' },
      validationResult: { state: 'valid' }, importedAt: '2026-08-02T00:00:00Z', createdBy: 'user-1',
    };
    const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: source }) });
    await expect(createMissionMapsApi(fetcher as any).uploadSourceFile(revision.missionId, {
      fileName: 'boundary.kml', fileType: 'kml', sizeBytes: 11,
      dataUrl: 'data:application/vnd.google-earth.kml+xml;base64,PGttbD48L2ttbD4=',
      sourceCrs: 'EPSG:4326', transformationMetadata: { canonicalCrs: 'EPSG:4326' },
      validationResult: { state: 'valid' }, importedAt: '2026-08-02T00:00:00Z',
    })).resolves.toEqual(source);
    expect(fetcher).toHaveBeenCalledWith(
      `/api/v1/mission-maps?missionId=${revision.missionId}&action=source-file`,
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
