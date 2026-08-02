jest.mock('../../server/supabase', () => ({ supabaseRequest: jest.fn() }));

const { supabaseRequest } = require('../../server/supabase');
const { OperationalRepository } = require('../../server/operational-repository');

describe('Mission map source-file repository adapter', () => {
  beforeEach(() => supabaseRequest.mockReset());

  test('compensates the storage upload when the database rejects the Mission relationship', async () => {
    supabaseRequest
      .mockResolvedValueOnce({ Key: 'stored' })
      .mockResolvedValueOnce({ relationship_conflict: true })
      .mockResolvedValueOnce(null);
    const repository = new OperationalRepository();
    const result = await repository.createMissionMapSourceFile({
      organisation: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      internalUser: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
    }, '11111111-1111-4111-8111-111111111111', {
      fileName: 'boundary.kml', fileType: 'kml', contentType: 'application/vnd.google-earth.kml+xml',
      bytes: Buffer.from('<kml/>'), checksum: 'a'.repeat(64), sourceCrs: 'EPSG:4326',
      transformationMetadata: {}, validationResult: { state: 'valid' },
    });
    expect(result).toEqual({ relationshipConflict: true });
    expect(supabaseRequest).toHaveBeenCalledTimes(3);
    expect(supabaseRequest.mock.calls[2][0]).toMatch(/^storage\/v1\/object\/mission-map-imports\//);
    expect(supabaseRequest.mock.calls[2][1]).toEqual(expect.objectContaining({ method: 'DELETE' }));
  });
});
