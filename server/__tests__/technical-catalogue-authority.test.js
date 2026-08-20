jest.mock('../supabase', () => ({
  ...jest.requireActual('../supabase'),
  supabaseRequest: jest.fn(),
}));

const { supabaseRequest } = require('../supabase');
const { TechnicalCatalogueRepository } = require('../technical-catalogue-repository');
const { createTechnicalCatalogueHandler } = require('../technical-catalogue-api');

const ORGANISATION_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';
const ASSET_ID = '33333333-3333-4333-8333-333333333333';
const ENTITY_ID = '44444444-4444-4444-8444-444444444444';
const TEMPLATE_VERSION_ID = '55555555-5555-4555-8555-555555555555';
const PLATFORM_USER_ID = '66666666-6666-4666-8666-666666666666';
const SOURCE_RECORD_ID = '77777777-7777-4777-8777-777777777777';
const AS_OF = '2026-08-20T00:00:00.000Z';

function organisationContext(permissions = [
  'technical_catalogue.read',
  'technical_proposals.create',
  'technical_proposals.review',
  'technical_preferences.read',
  'technical_preferences.manage',
  'service_templates.read',
  'service_templates.publish',
]) {
  return {
    organisation: { id: ORGANISATION_ID, name: 'Farm A' },
    internalUser: { id: ACTOR_ID, name: 'Maintainer' },
    operatingLocationIds: ['base-a'],
    permissions,
  };
}

function platformContext(permissions = ['platform.technical_catalogue.publish']) {
  return {
    platformUser: { id: PLATFORM_USER_ID, name: 'Catalogue curator' },
    permissions,
  };
}

function response() {
  const res = { headers: {}, statusCode: 200, body: undefined };
  res.setHeader = jest.fn((name, value) => { res.headers[String(name).toLowerCase()] = value; });
  res.status = jest.fn((statusCode) => { res.statusCode = statusCode; return res; });
  res.json = jest.fn((body) => { res.body = body; return res; });
  return res;
}

function request(method, action, body = {}, query = {}) {
  return {
    method,
    query: { action, ...query },
    body,
    correlationId: 'technical-catalogue-request',
    headers: {
      origin: 'https://app.example.test',
      host: 'app.example.test',
      'x-forwarded-proto': 'https',
    },
  };
}

function rpcCall(name, body) {
  expect(supabaseRequest).toHaveBeenLastCalledWith(
    `rest/v1/rpc/${name}`,
    expect.objectContaining({ method: 'POST', body: JSON.stringify(body) })
  );
}

describe('TechnicalCatalogueRepository authority contract', () => {
  beforeEach(() => supabaseRequest.mockReset().mockResolvedValue({ record: { id: ENTITY_ID } }));

  test('keeps canonical lookup and private preference reads on separate scoped RPCs', async () => {
    const repository = new TechnicalCatalogueRepository();
    const context = organisationContext();

    await repository.readAssetCatalogue(context, ASSET_ID, AS_OF);
    rpcCall('ftf_read_asset_technical_catalogue', {
      p_organisation_id: ORGANISATION_ID,
      p_actor_internal_user_id: ACTOR_ID,
      p_maintainable_asset_id: ASSET_ID,
      p_as_of: AS_OF,
    });

    await repository.resolveAssetRoute(context, 'fleet-asset', SOURCE_RECORD_ID);
    rpcCall('ftf_resolve_maintainable_asset_route', {
      p_organisation_id: ORGANISATION_ID,
      p_actor_internal_user_id: ACTOR_ID,
      p_source: 'fleet-asset',
      p_source_record_id: SOURCE_RECORD_ID,
    });

    await repository.readPreferences(context);
    rpcCall('ftf_read_organisation_technical_preferences', {
      p_organisation_id: ORGANISATION_ID,
      p_actor_internal_user_id: ACTOR_ID,
    });

    await repository.readApplicableServiceTemplateVersion(context, ASSET_ID, TEMPLATE_VERSION_ID, AS_OF);
    rpcCall('ftf_read_applicable_service_template_version', {
      p_organisation_id: ORGANISATION_ID,
      p_actor_internal_user_id: ACTOR_ID,
      p_maintainable_asset_id: ASSET_ID,
      p_service_template_version_id: TEMPLATE_VERSION_ID,
      p_as_of: AS_OF,
    });
  });

  test('uses only the narrow preference and publication RPC commands', async () => {
    const repository = new TechnicalCatalogueRepository();
    const organisation = organisationContext();
    const platform = platformContext();

    await repository.createOrganisationProposal(organisation, 'PART', { manufacturer: 'Maker' }, { source: 'manual' }, 'HUMAN');
    rpcCall('ftf_create_organisation_technical_proposal', {
      p_organisation_id: ORGANISATION_ID,
      p_actor_internal_user_id: ACTOR_ID,
      p_proposal_type: 'PART',
      p_proposed_data: { manufacturer: 'Maker' },
      p_evidence: { source: 'manual' },
      p_proposed_by_type: 'HUMAN',
    });

    await repository.reviewOrganisationProposal(organisation, ENTITY_ID, 1, 'REVIEW', { checked: true }, 'Checked');
    rpcCall('ftf_review_organisation_technical_proposal', {
      p_organisation_id: ORGANISATION_ID,
      p_actor_internal_user_id: ACTOR_ID,
      p_proposal_id: ENTITY_ID,
      p_expected_version: 1,
      p_decision: 'REVIEW',
      p_review_evidence: { checked: true },
      p_review_notes: 'Checked',
    });

    await repository.createPlatformProposal(platform, 'FLUID_SPECIFICATION', { code: 'ISO-1' }, { source: 'import' }, 'IMPORT');
    rpcCall('ftf_create_platform_technical_proposal', {
      p_platform_user_id: PLATFORM_USER_ID,
      p_proposal_type: 'FLUID_SPECIFICATION',
      p_proposed_data: { code: 'ISO-1' },
      p_evidence: { source: 'import' },
      p_proposed_by_type: 'IMPORT',
    });

    await repository.reviewPlatformProposal(platform, ENTITY_ID, 2, 'APPROVE', { approved: true }, 'Approved');
    rpcCall('ftf_review_platform_technical_proposal', {
      p_platform_user_id: PLATFORM_USER_ID,
      p_proposal_id: ENTITY_ID,
      p_expected_version: 2,
      p_decision: 'APPROVE',
      p_review_evidence: { approved: true },
      p_review_notes: 'Approved',
    });

    await repository.writePreference(organisation, 'PART', ENTITY_ID, 3, { preferred_supplier: 'Supplier A' });
    rpcCall('ftf_write_organisation_technical_preference', {
      p_organisation_id: ORGANISATION_ID,
      p_actor_internal_user_id: ACTOR_ID,
      p_preference_type: 'PART',
      p_preference_id: ENTITY_ID,
      p_expected_version: 3,
      p_data: { preferred_supplier: 'Supplier A' },
    });

    await repository.publishOrganisationServiceTemplate(organisation, TEMPLATE_VERSION_ID, 4, AS_OF);
    rpcCall('ftf_publish_service_template_version', {
      p_organisation_id: ORGANISATION_ID,
      p_actor_internal_user_id: ACTOR_ID,
      p_service_template_version_id: TEMPLATE_VERSION_ID,
      p_expected_version: 4,
      p_effective_from: AS_OF,
    });

    await repository.publishTechnicalVersion(platform, 'PART', ENTITY_ID, 5, AS_OF);
    rpcCall('ftf_publish_technical_version', {
      p_platform_user_id: PLATFORM_USER_ID,
      p_entity_type: 'PART',
      p_entity_id: ENTITY_ID,
      p_expected_version: 5,
      p_effective_from: AS_OF,
    });

    await repository.publishPartEquivalence(platform, ENTITY_ID, 6, AS_OF);
    rpcCall('ftf_publish_part_equivalence', {
      p_platform_user_id: PLATFORM_USER_ID,
      p_equivalence_id: ENTITY_ID,
      p_expected_version: 6,
      p_effective_from: AS_OF,
    });

    await repository.publishTechnicalApplicability(platform, 'FLUID', ENTITY_ID, 7, AS_OF);
    rpcCall('ftf_publish_technical_applicability', {
      p_platform_user_id: PLATFORM_USER_ID,
      p_applicability_type: 'FLUID',
      p_applicability_id: ENTITY_ID,
      p_expected_version: 7,
      p_effective_from: AS_OF,
    });

    await repository.publishPlatformServiceTemplate(platform, TEMPLATE_VERSION_ID, 8, AS_OF);
    rpcCall('ftf_publish_platform_service_template_version', {
      p_platform_user_id: PLATFORM_USER_ID,
      p_service_template_version_id: TEMPLATE_VERSION_ID,
      p_expected_version: 8,
      p_effective_from: AS_OF,
    });

    for (const [path] of supabaseRequest.mock.calls) expect(path).toMatch(/^rest\/v1\/rpc\/ftf_/);
  });
});

describe('technical catalogue trusted API', () => {
  let repository;
  let resolveContext;
  let resolvePlatformContext;

  beforeEach(() => {
    repository = {
      readAssetCatalogue: jest.fn(),
      resolveAssetRoute: jest.fn(),
      readApplicableServiceTemplateVersion: jest.fn(),
      readPreferences: jest.fn(),
      createOrganisationProposal: jest.fn(),
      reviewOrganisationProposal: jest.fn(),
      createPlatformProposal: jest.fn(),
      reviewPlatformProposal: jest.fn(),
      writePreference: jest.fn(),
      publishOrganisationServiceTemplate: jest.fn(),
      publishTechnicalVersion: jest.fn(),
      publishPartEquivalence: jest.fn(),
      publishTechnicalApplicability: jest.fn(),
      publishPlatformServiceTemplate: jest.fn(),
    };
    resolveContext = jest.fn().mockResolvedValue(organisationContext());
    resolvePlatformContext = jest.fn().mockResolvedValue(platformContext());
  });

  function handler() {
    return createTechnicalCatalogueHandler({ repository, resolveContext, resolvePlatformContext });
  }

  test('reads canonical catalogue without joining the tenant-private preference overlay', async () => {
    repository.readAssetCatalogue.mockResolvedValue({
      parts: [{ requirementId: 'part-requirement' }],
      fluids: [],
      serviceTemplates: [],
    });
    const res = response();

    await handler()(request('GET', 'lookup', {}, { assetId: ASSET_ID, asOf: AS_OF }), res);

    expect(res.statusCode).toBe(200);
    expect(repository.readAssetCatalogue).toHaveBeenCalledWith(expect.objectContaining({ organisation: { id: ORGANISATION_ID, name: 'Farm A' } }), ASSET_ID, AS_OF);
    expect(repository.readPreferences).not.toHaveBeenCalled();
    expect(res.body.data.parts).toEqual([{ requirementId: 'part-requirement' }]);
  });

  test('resolves a workspace source record without trusting browser tenant or registry identities', async () => {
    repository.resolveAssetRoute.mockResolvedValue({
      registryId: ASSET_ID,
      source: 'fleet-asset',
      sourceRecordId: SOURCE_RECORD_ID,
      identity: 'FTF-11',
    });
    const res = response();

    await handler()(request('GET', 'resolve-asset', {}, {
      source: 'fleet-asset',
      sourceRecordId: SOURCE_RECORD_ID,
      organisationId: 'browser-supplied-tenant',
      registryId: 'browser-supplied-registry',
    }), res);

    expect(res.statusCode).toBe(200);
    expect(repository.resolveAssetRoute).toHaveBeenCalledWith(
      expect.objectContaining({ organisation: { id: ORGANISATION_ID, name: 'Farm A' }, internalUser: { id: ACTOR_ID, name: 'Maintainer' } }),
      'fleet-asset',
      SOURCE_RECORD_ID
    );
    expect(res.body.data).toEqual({ registryId: ASSET_ID, source: 'fleet-asset', sourceRecordId: SOURCE_RECORD_ID, identity: 'FTF-11' });
  });

  test('reads tenant-private preferences separately and never resolves a Platform curator', async () => {
    repository.readPreferences.mockResolvedValue({ parts: [{ preferred_supplier: 'Private Supplier' }], fluids: [] });
    const res = response();

    await handler()(request('GET', 'preferences'), res);

    expect(res.statusCode).toBe(200);
    expect(repository.readPreferences).toHaveBeenCalledWith(expect.objectContaining({ organisation: { id: ORGANISATION_ID, name: 'Farm A' } }));
    expect(repository.readAssetCatalogue).not.toHaveBeenCalled();
    expect(resolvePlatformContext).not.toHaveBeenCalled();
  });

  test('returns the exact applicable Service Template aggregate from its narrow RPC', async () => {
    repository.readApplicableServiceTemplateVersion.mockResolvedValue({
      template: { id: 'template-a', name: '100 hour service' },
      version: { id: TEMPLATE_VERSION_ID, authorityType: 'MANUFACTURER', evidence: { source: 'manual' } },
      applicability: [], actions: [], partLines: [], fluidLines: [], inspections: [], replacements: [], requirementLinks: [],
    });
    const res = response();

    await handler()(request('GET', 'service-template-version', {}, {
      assetId: ASSET_ID,
      asOf: AS_OF,
      templateVersionId: TEMPLATE_VERSION_ID,
    }), res);

    expect(res.statusCode).toBe(200);
    expect(repository.readApplicableServiceTemplateVersion).toHaveBeenCalledWith(
      expect.objectContaining({ organisation: { id: ORGANISATION_ID, name: 'Farm A' } }),
      ASSET_ID, TEMPLATE_VERSION_ID, AS_OF
    );
    expect(repository.readAssetCatalogue).not.toHaveBeenCalled();
    expect(res.body.data.version.id).toBe(TEMPLATE_VERSION_ID);
  });

  test('reads an exact applicable Service Template aggregate with only service_templates.read', async () => {
    resolveContext = jest.fn().mockResolvedValue(organisationContext(['service_templates.read']));
    repository.readApplicableServiceTemplateVersion.mockResolvedValue({
      template: { id: 'template-a', name: '100 hour service' },
      version: { id: TEMPLATE_VERSION_ID },
      applicability: [], actions: [], partLines: [], fluidLines: [], inspections: [], replacements: [], requirementLinks: [],
    });
    const res = response();

    await handler()(request('GET', 'service-template-version', {}, {
      assetId: ASSET_ID,
      asOf: AS_OF,
      templateVersionId: TEMPLATE_VERSION_ID,
    }), res);

    expect(res.statusCode).toBe(200);
    expect(repository.readApplicableServiceTemplateVersion).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: ['service_templates.read'] }),
      ASSET_ID, TEMPLATE_VERSION_ID, AS_OF
    );
  });

  test('creates and reviews organisation proposals without accepting caller authority', async () => {
    repository.createOrganisationProposal.mockResolvedValue({ record: { id: ENTITY_ID, proposal_state: 'PROPOSED', has_technical_authority: false } });
    repository.reviewOrganisationProposal.mockResolvedValue({ record: { id: ENTITY_ID, proposal_state: 'REVIEWED', has_technical_authority: false, row_version: 2 } });
    const createRes = response();
    await handler()(request('POST', 'propose', {
      organisationId: 'foreign', actorInternalUserId: 'foreign', proposalType: 'PART',
      proposedData: { manufacturer: 'Maker' }, evidence: { source: 'manual' }, proposedByType: 'AI_EXTRACTION',
    }), createRes);
    expect(createRes.statusCode).toBe(201);
    expect(repository.createOrganisationProposal).toHaveBeenCalledWith(
      expect.objectContaining({ organisation: { id: ORGANISATION_ID, name: 'Farm A' }, internalUser: { id: ACTOR_ID, name: 'Maintainer' } }),
      'PART', { manufacturer: 'Maker' }, { source: 'manual' }, 'AI_EXTRACTION'
    );

    const reviewRes = response();
    await handler()(request('POST', 'review', {
      proposalId: ENTITY_ID, expectedVersion: 1, decision: 'REVIEW',
      reviewEvidence: { document: 'checked' }, reviewNotes: 'Checked by maintainer',
    }), reviewRes);
    expect(reviewRes.statusCode).toBe(200);
    expect(repository.reviewOrganisationProposal).toHaveBeenCalledWith(
      expect.objectContaining({ internalUser: { id: ACTOR_ID, name: 'Maintainer' } }),
      ENTITY_ID, 1, 'REVIEW', { document: 'checked' }, 'Checked by maintainer'
    );
  });

  test('creates and reviews Platform proposals only through the Platform identity plane', async () => {
    repository.createPlatformProposal.mockResolvedValue({ record: { id: ENTITY_ID, proposal_state: 'PROPOSED', has_technical_authority: false } });
    repository.reviewPlatformProposal.mockResolvedValue({ record: { id: ENTITY_ID, proposal_state: 'APPROVED', has_technical_authority: false, row_version: 3 } });
    const createRes = response();
    await handler()(request('POST', 'platform-propose', {
      platformUserId: 'foreign', proposalType: 'FLUID_SPECIFICATION', proposedData: { code: 'ISO-1' },
      evidence: { source: 'import' }, proposedByType: 'IMPORT',
    }), createRes);
    expect(createRes.statusCode).toBe(201);
    expect(repository.createPlatformProposal).toHaveBeenCalledWith(
      expect.objectContaining({ platformUser: { id: PLATFORM_USER_ID, name: 'Catalogue curator' } }),
      'FLUID_SPECIFICATION', { code: 'ISO-1' }, { source: 'import' }, 'IMPORT'
    );
    expect(resolveContext).not.toHaveBeenCalled();

    const reviewRes = response();
    await handler()(request('POST', 'platform-review', {
      proposalId: ENTITY_ID, expectedVersion: 2, decision: 'APPROVE',
      reviewEvidence: { approved: true }, reviewNotes: 'Qualified review',
    }), reviewRes);
    expect(reviewRes.statusCode).toBe(200);
    expect(repository.reviewPlatformProposal).toHaveBeenCalledWith(
      expect.objectContaining({ platformUser: { id: PLATFORM_USER_ID, name: 'Catalogue curator' } }),
      ENTITY_ID, 2, 'APPROVE', { approved: true }, 'Qualified review'
    );
  });

  test('rejects proposal review without evidence or optimistic concurrency', async () => {
    const res = response();
    await handler()(request('POST', 'review', {
      proposalId: ENTITY_ID, decision: 'APPROVE', reviewEvidence: {},
    }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(repository.reviewOrganisationProposal).not.toHaveBeenCalled();
  });

  test('uses server-derived tenant and actor scope for preference mutation', async () => {
    repository.writePreference.mockResolvedValue({ record: { id: ENTITY_ID, row_version: 2 } });
    const res = response();

    await handler()(request('POST', 'save-preference', {
      organisationId: 'foreign-organisation',
      actorInternalUserId: 'foreign-actor',
      preferenceType: 'PART',
      preferenceId: ENTITY_ID,
      expectedVersion: 1,
      data: {
        preferredSupplier: 'Supplier A',
        supplierSku: 'SKU-1',
        purchasingMetadata: { secret: true },
      },
    }), res);

    expect(res.statusCode).toBe(200);
    expect(repository.writePreference).toHaveBeenCalledWith(
      expect.objectContaining({ organisation: { id: ORGANISATION_ID, name: 'Farm A' }, internalUser: { id: ACTOR_ID, name: 'Maintainer' } }),
      'PART',
      ENTITY_ID,
      1,
      { preferred_supplier: 'Supplier A', supplier_sku: 'SKU-1' }
    );
  });

  test('requires same-origin requests before every mutation', async () => {
    const req = request('POST', 'save-preference', {});
    req.headers.origin = 'https://evil.example.test';
    const res = response();

    await handler()(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body.error.code).toBe('CROSS_ORIGIN_REQUEST');
    expect(resolveContext).not.toHaveBeenCalled();
    expect(repository.writePreference).not.toHaveBeenCalled();
  });

  test('requires optimistic concurrency for organisation Service Template publication', async () => {
    const res = response();

    await handler()(request('POST', 'publish-service-template', {
      serviceTemplateVersionId: TEMPLATE_VERSION_ID,
      effectiveFrom: AS_OF,
    }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(repository.publishOrganisationServiceTemplate).not.toHaveBeenCalled();
  });

  test('maps database concurrency conflicts to a safe error', async () => {
    repository.publishOrganisationServiceTemplate.mockResolvedValue({ conflict: true, current_version: 9 });
    const res = response();

    await handler()(request('POST', 'publish-service-template', {
      serviceTemplateVersionId: TEMPLATE_VERSION_ID,
      expectedVersion: 8,
      effectiveFrom: AS_OF,
    }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toEqual({
      code: 'VERSION_CONFLICT',
      message: 'This technical catalogue record changed. Reload it and try again.',
      correlationId: 'technical-catalogue-request',
    });
  });

  test('publishes canonical facts only through the established Platform identity plane', async () => {
    repository.publishTechnicalVersion.mockResolvedValue({ record: { id: ENTITY_ID, lifecycle_state: 'EFFECTIVE', row_version: 3 } });
    const res = response();

    await handler()(request('POST', 'publish-technical-version', {
      platformUserId: 'caller-supplied-platform-user',
      entityType: 'PART',
      entityId: ENTITY_ID,
      expectedVersion: 2,
      effectiveFrom: AS_OF,
      proposedByType: 'AI_EXTRACTION',
    }), res);

    expect(res.statusCode).toBe(200);
    expect(resolvePlatformContext).toHaveBeenCalled();
    expect(resolveContext).not.toHaveBeenCalled();
    expect(repository.publishTechnicalVersion).toHaveBeenCalledWith(
      expect.objectContaining({ platformUser: { id: PLATFORM_USER_ID, name: 'Catalogue curator' } }),
      'PART', ENTITY_ID, 2, AS_OF
    );
  });

  test('requires the human Platform publication permission before repository access', async () => {
    resolvePlatformContext.mockResolvedValue(platformContext([]));
    const res = response();

    await handler()(request('POST', 'publish-technical-version', {
      entityType: 'PART', entityId: ENTITY_ID, expectedVersion: 2, effectiveFrom: AS_OF,
    }), res);

    expect(res.statusCode).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(repository.publishTechnicalVersion).not.toHaveBeenCalled();
  });

  test.each([
    ['publish-part-equivalence', { equivalenceId: ENTITY_ID }, 'publishPartEquivalence', ['context', ENTITY_ID, 2, AS_OF]],
    ['publish-technical-applicability', { applicabilityType: 'FLUID', applicabilityId: ENTITY_ID }, 'publishTechnicalApplicability', ['context', 'FLUID', ENTITY_ID, 2, AS_OF]],
    ['publish-platform-service-template', { serviceTemplateVersionId: TEMPLATE_VERSION_ID }, 'publishPlatformServiceTemplate', ['context', TEMPLATE_VERSION_ID, 2, AS_OF]],
  ])('maps %s to its narrow Platform RPC repository method', async (action, fields, method, expected) => {
    repository[method].mockResolvedValue({ record: { id: ENTITY_ID, row_version: 3 } });
    const res = response();

    await handler()(request('POST', action, { ...fields, expectedVersion: 2, effectiveFrom: AS_OF }), res);

    expect(res.statusCode).toBe(200);
    const expectedArguments = expected.map((value) => value === 'context'
      ? expect.objectContaining({ platformUser: { id: PLATFORM_USER_ID, name: 'Catalogue curator' } })
      : value);
    expect(repository[method]).toHaveBeenCalledWith(...expectedArguments);
  });

  test('does not let AI/source metadata substitute for an authenticated human Platform publisher', async () => {
    resolvePlatformContext.mockRejectedValue(Object.assign(new Error('Platform access is not configured.'), { statusCode: 403 }));
    const res = response();

    await handler()(request('POST', 'publish-technical-version', {
      entityType: 'PART', entityId: ENTITY_ID, expectedVersion: 1, effectiveFrom: AS_OF,
      proposedByType: 'AI_EXTRACTION', evidence: { source: 'manual' }, approved: true,
    }), res);

    expect(res.statusCode).toBe(403);
    expect(repository.publishTechnicalVersion).not.toHaveBeenCalled();
  });

  test('does not let an organisation session invoke canonical publication', async () => {
    resolvePlatformContext.mockRejectedValue(Object.assign(new Error('Platform access is not configured.'), { statusCode: 403 }));
    const res = response();

    await handler()(request('POST', 'publish-part-equivalence', {
      equivalenceId: ENTITY_ID, expectedVersion: 1, effectiveFrom: AS_OF,
    }), res);

    expect(res.statusCode).toBe(403);
    expect(resolveContext).not.toHaveBeenCalled();
    expect(repository.publishPartEquivalence).not.toHaveBeenCalled();
  });

  test('does not leak database details through unexpected errors', async () => {
    repository.readAssetCatalogue.mockRejectedValue(new Error('relation private_table password=secret does not exist'));
    const res = response();

    await handler()(request('GET', 'lookup', {}, { assetId: ASSET_ID, asOf: AS_OF }), res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.body.error.message).toBe('Technical catalogue request failed.');
    expect(JSON.stringify(res.body)).not.toContain('private_table');
  });

  test('fails the whole server diagnostic tuple closed when any member is unsafe', async () => {
    repository.readPreferences.mockRejectedValue(Object.assign(
      new Error('Provider returned Authorization: Bearer bearer-token-value'),
      { statusCode: 409, code: 'VERSION_CONFLICT' }
    ));
    const req = request('GET', 'preferences');
    req.correlationId = 'ghp_AbCdEf1234567890';
    const res = response();

    await handler()(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toEqual({
      code: 'TECHNICAL_CATALOGUE_ERROR',
      message: 'Technical catalogue request failed.',
    });
    expect(JSON.stringify(res.body)).not.toContain('Bearer');
    expect(JSON.stringify(res.body)).not.toContain('ghp_');
  });
});
