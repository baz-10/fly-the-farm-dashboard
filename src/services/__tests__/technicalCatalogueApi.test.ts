import { TechnicalCatalogueApiError, technicalCatalogueApi } from '../technicalCatalogueApi';

function response(status: number, body: unknown, correlationId = 'catalogue-correlation') {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: () => correlationId },
  } as Response;
}

describe('technicalCatalogueApi', () => {
  beforeEach(() => { global.fetch = jest.fn(); });

  test('loads canonical asset lookup separately from private preferences', async () => {
    (fetch as jest.Mock).mockResolvedValue(response(200, { data: { parts: [], fluids: [], serviceTemplates: [] } }));

    await technicalCatalogueApi.lookupAsset('asset-1', '2026-08-20T00:00:00.000Z');

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/technical-catalogue?action=lookup&assetId=asset-1&asOf=2026-08-20T00%3A00%3A00.000Z',
      { method: 'GET', credentials: 'same-origin' }
    );
    expect((fetch as jest.Mock).mock.calls[0][0]).not.toContain('preferences');
  });

  test('resolves an Asset Workspace source record without sending tenant or registry identity', async () => {
    (fetch as jest.Mock).mockResolvedValue(response(200, { data: {
      registryId: 'registry-1', source: 'fleet-asset', sourceRecordId: 'fleet-1', identity: 'FTF-11',
    } }));

    const resolved = await technicalCatalogueApi.resolveAssetRoute('fleet-asset', 'fleet-1');

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/technical-catalogue?action=resolve-asset&source=fleet-asset&sourceRecordId=fleet-1',
      { method: 'GET', credentials: 'same-origin' }
    );
    expect((fetch as jest.Mock).mock.calls[0][0]).not.toMatch(/organisationId|registryId/);
    expect(resolved).toEqual({ registryId: 'registry-1', source: 'fleet-asset', sourceRecordId: 'fleet-1', identity: 'FTF-11' });
  });

  test('exposes authoritative attached links and factual grouping keys from catalogue rows', async () => {
    (fetch as jest.Mock).mockResolvedValue(response(200, { data: {
      systems: [{ id: 'system-1', code: 'ENGINE', name: 'Engine' }], positions: [],
      parts: [{ applicationCode: 'FILTER', quantity: 1, unitCode: 'EA', partVersion: {}, part: {},
        systemId: 'system-1', systemCode: 'ENGINE', systemName: 'Engine',
        componentPositionId: null, componentPositionCode: null, componentPositionName: null }],
      fluids: [], serviceTemplates: [],
      attachedAssets: [{ registryId: 'registry-2', source: 'equipment-kit', sourceRecordId: 'kit-2', identity: 'Generator kit' }],
    } }));

    const catalogue = await technicalCatalogueApi.lookupAsset('registry-1', '2026-08-20T00:00:00.000Z');

    expect(catalogue.attachedAssets[0]).toEqual({ registryId: 'registry-2', source: 'equipment-kit', sourceRecordId: 'kit-2', identity: 'Generator kit' });
    expect(catalogue.parts[0]).toMatchObject({ systemId: 'system-1', systemCode: 'ENGINE', systemName: 'Engine' });
  });

  test('loads tenant preferences through their dedicated endpoint', async () => {
    (fetch as jest.Mock).mockResolvedValue(response(200, { data: { parts: [], fluids: [] } }));

    await technicalCatalogueApi.readPreferences();

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/technical-catalogue?action=preferences',
      { method: 'GET', credentials: 'same-origin' }
    );
  });

  test('requests an exact applicable Service Template version', async () => {
    (fetch as jest.Mock).mockResolvedValue(response(200, { data: {
      template: { id: 'template-1', ownerScope: 'ORGANISATION' },
      version: { id: 'version-1', authorityType: 'ORGANISATION_STANDARD', evidence: { source: 'manual' } },
      applicability: [], actions: [], partLines: [], fluidLines: [], inspections: [], replacements: [], requirementLinks: [],
    } }));

    const aggregate = await technicalCatalogueApi.readServiceTemplateVersion('asset-1', 'version-1', '2026-08-20T00:00:00.000Z');

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/technical-catalogue?action=service-template-version&assetId=asset-1&templateVersionId=version-1&asOf=2026-08-20T00%3A00%3A00.000Z',
      { method: 'GET', credentials: 'same-origin' }
    );
    expect(aggregate.version.id).toBe('version-1');
    expect(aggregate).toHaveProperty('requirementLinks', []);
  });

  test('creates and reviews organisation proposals without caller actor fields', async () => {
    (fetch as jest.Mock).mockResolvedValue(response(201, { data: { id: 'proposal-1', proposal_state: 'PROPOSED', has_technical_authority: false } }));
    await technicalCatalogueApi.createProposal({
      proposalType: 'PART', proposedData: { manufacturer: 'Maker' }, evidence: { source: 'manual' }, proposedByType: 'AI_EXTRACTION',
    });
    expect(JSON.parse((fetch as jest.Mock).mock.calls[0][1].body)).not.toHaveProperty('actorInternalUserId');
    expect((fetch as jest.Mock).mock.calls[0][0]).toBe('/api/v1/technical-catalogue?action=propose');

    (fetch as jest.Mock).mockResolvedValue(response(200, { data: { id: 'proposal-1', proposal_state: 'REVIEWED', row_version: 2 } }));
    await technicalCatalogueApi.reviewProposal({
      proposalId: 'proposal-1', expectedVersion: 1, decision: 'REVIEW', reviewEvidence: { checked: true }, reviewNotes: 'Checked',
    });
    expect((fetch as jest.Mock).mock.calls[1][0]).toBe('/api/v1/technical-catalogue?action=review');
  });

  test('creates and reviews Platform proposals without caller Platform identity', async () => {
    (fetch as jest.Mock).mockResolvedValue(response(201, { data: { id: 'proposal-1', proposal_state: 'PROPOSED', has_technical_authority: false } }));
    await technicalCatalogueApi.createPlatformProposal({
      proposalType: 'SERVICE_TEMPLATE', proposedData: { code: 'SERVICE-1' }, evidence: { source: 'manual' }, proposedByType: 'HUMAN',
    });
    expect(JSON.parse((fetch as jest.Mock).mock.calls[0][1].body)).not.toHaveProperty('platformUserId');
    expect((fetch as jest.Mock).mock.calls[0][0]).toBe('/api/v1/technical-catalogue?action=platform-propose');

    (fetch as jest.Mock).mockResolvedValue(response(200, { data: { id: 'proposal-1', proposal_state: 'APPROVED', row_version: 3 } }));
    await technicalCatalogueApi.reviewPlatformProposal({
      proposalId: 'proposal-1', expectedVersion: 2, decision: 'APPROVE', reviewEvidence: { approved: true }, reviewNotes: 'Approved',
    });
    expect((fetch as jest.Mock).mock.calls[1][0]).toBe('/api/v1/technical-catalogue?action=platform-review');
  });

  test('sends governed preference mutation with same-origin credentials', async () => {
    (fetch as jest.Mock).mockResolvedValue(response(200, { data: { id: 'preference-1', row_version: 2 } }));

    await technicalCatalogueApi.savePreference({
      preferenceType: 'PART',
      preferenceId: 'preference-1',
      expectedVersion: 1,
      data: { preferredSupplier: 'Supplier A' },
    });

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/technical-catalogue?action=save-preference',
      expect.objectContaining({ method: 'POST', credentials: 'same-origin' })
    );
  });

  test('exposes the narrow Platform publication commands without caller actor identity', async () => {
    (fetch as jest.Mock).mockResolvedValue(response(200, { data: { id: 'version-1', row_version: 2 } }));

    await technicalCatalogueApi.publishTechnicalVersion({
      entityType: 'PART',
      entityId: 'version-1',
      expectedVersion: 1,
      effectiveFrom: '2026-08-20T00:00:00.000Z',
    });

    const body = JSON.parse((fetch as jest.Mock).mock.calls[0][1].body);
    expect(body).toEqual({
      entityType: 'PART', entityId: 'version-1', expectedVersion: 1,
      effectiveFrom: '2026-08-20T00:00:00.000Z',
    });
    expect(body).not.toHaveProperty('platformUserId');
  });

  test.each([
    ['publishPartEquivalence', { equivalenceId: 'equivalence-1', expectedVersion: 1, effectiveFrom: '2026-08-20T00:00:00.000Z' }, 'publish-part-equivalence'],
    ['publishTechnicalApplicability', { applicabilityType: 'FLUID', applicabilityId: 'applicability-1', expectedVersion: 1, effectiveFrom: '2026-08-20T00:00:00.000Z' }, 'publish-technical-applicability'],
    ['publishPlatformServiceTemplate', { serviceTemplateVersionId: 'version-1', expectedVersion: 1, effectiveFrom: '2026-08-20T00:00:00.000Z' }, 'publish-platform-service-template'],
  ] as const)('sends %s through its dedicated command endpoint', async (method, input, action) => {
    (fetch as jest.Mock).mockResolvedValue(response(200, { data: { id: 'published-1' } }));

    await (technicalCatalogueApi[method] as (value: typeof input) => Promise<unknown>)(input);

    expect(fetch).toHaveBeenCalledWith(
      `/api/v1/technical-catalogue?action=${action}`,
      expect.objectContaining({ method: 'POST', credentials: 'same-origin' })
    );
  });

  test('retains safe API code, status and correlation ID', async () => {
    (fetch as jest.Mock).mockResolvedValue(response(409, {
      error: { code: 'VERSION_CONFLICT', message: 'This record changed.' },
    }));

    await expect(technicalCatalogueApi.publishOrganisationServiceTemplate({
      serviceTemplateVersionId: 'version-1', expectedVersion: 1,
      effectiveFrom: '2026-08-20T00:00:00.000Z',
    })).rejects.toEqual(expect.objectContaining<Partial<TechnicalCatalogueApiError>>({
      status: 409,
      code: 'VERSION_CONFLICT',
      correlationId: 'catalogue-correlation',
    }));
  });

  test.each([
    [{ code: 'bad code\nSECRET', message: 'password=do-not-display' }, 'unsafe-reference\nvalue'],
    [{ code: 'A'.repeat(100), message: 'x'.repeat(500) }, 'r'.repeat(500)],
    [{ code: { nested: true }, message: { private: true } }, 'valid-reference'],
    [{ code: 'UPSTREAM_ERROR', message: 'Authorization: Bearer bearer-token-value' }, 'safe-reference'],
    [{ code: 'UPSTREAM_ERROR', message: 'Provider returned sk-proj-AbCdEf1234567890' }, 'safe-reference'],
    [{ code: 'UPSTREAM_ERROR', message: 'Provider returned ghp_AbCdEf1234567890' }, 'safe-reference'],
    [{ code: 'UPSTREAM_ERROR', message: 'Provider returned AIzaSyAbCdEf1234567890' }, 'safe-reference'],
    [{ code: 'UPSTREAM_ERROR', message: 'Provider returned AKIAABCDEFGHIJKLMNOP' }, 'safe-reference'],
    [{ code: 'UPSTREAM_ERROR', message: 'Provider returned eyJhbGciOi.payload123.signature123' }, 'safe-reference'],
  ])('fails the whole browser diagnostic tuple closed when any member is unsafe', async (error, correlationId) => {
    (fetch as jest.Mock).mockResolvedValue(response(500, { error }, correlationId));
    await expect(technicalCatalogueApi.readPreferences()).rejects.toMatchObject({
      code: 'TECHNICAL_CATALOGUE_API_ERROR',
      message: 'Technical catalogue request failed.',
      correlationId: undefined,
    });
  });
});
