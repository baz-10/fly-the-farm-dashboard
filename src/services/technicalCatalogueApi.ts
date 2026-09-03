import { boundedPublicDiagnostics } from './publicDiagnostics';

export type TechnicalEntityType = 'PART' | 'FLUID';
export type TechnicalProposalType = 'PART' | 'PART_EQUIVALENCE' | 'PART_APPLICABILITY' | 'FLUID_SPECIFICATION' | 'FLUID_APPLICABILITY' | 'SERVICE_TEMPLATE';
export type TechnicalProposalSource = 'HUMAN' | 'AI_EXTRACTION' | 'MANUAL_EXTRACTION' | 'IMPORT';
export type TechnicalProposalDecision = 'REVIEW' | 'APPROVE' | 'REJECT';
export type AssetSource = 'aircraft' | 'equipment-kit' | 'fleet-asset';

export interface ResolvedAssetRoute {
  registryId: string;
  source: AssetSource;
  sourceRecordId: string;
  identity: string;
}

export type TechnicalGroupingIdentity = {
  systemId: string | null;
  systemCode: string;
  systemName: string;
  componentPositionId: string | null;
  componentPositionCode: string | null;
  componentPositionName: string | null;
};

export interface TechnicalPartCatalogueItem extends TechnicalGroupingIdentity {
  requirementId?: string;
  applicabilityId?: string;
  applicationCode: string;
  quantity: number;
  unitCode: string;
  partVersion: Record<string, unknown>;
  part: Record<string, unknown>;
}

export interface TechnicalFluidCatalogueItem extends TechnicalGroupingIdentity {
  requirementId?: string;
  applicabilityId?: string;
  servicePoint: string;
  capacitySemantics: string;
  quantity: number;
  unitCode: string;
  approximate: boolean;
  tolerance: string | null;
  specificationVersion: Record<string, unknown>;
  specification: Record<string, unknown>;
}

export interface ApplicableServiceTemplateVersion {
  templateId: string;
  templateVersionId: string;
  name: string;
  ownerScope: 'PLATFORM' | 'ORGANISATION';
  authorityType: 'MANUFACTURER' | 'ORGANISATION_STANDARD' | 'VERIFIED_TECHNICAL_SOURCE';
}

export interface ServiceTemplateAggregateVersion {
  id: string;
  serviceTemplateId: string;
  versionNumber: number;
  description: string;
  authorityType: 'MANUFACTURER' | 'ORGANISATION_STANDARD' | 'VERIFIED_TECHNICAL_SOURCE';
  lifecycleState: 'EFFECTIVE' | 'SUPERSEDED';
  evidence: Record<string, unknown>;
  conditionSchemaVersion: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  approvedByInternalUserId: string | null;
  approvedByPlatformUserId: string | null;
  approvedAt: string;
  supersedesVersionId: string | null;
  rowVersion: number;
}

export interface ApplicableServiceTemplateAggregate {
  template: { id: string; code: string; name: string; ownerScope: 'PLATFORM' | 'ORGANISATION'; sourceTemplateId: string | null; rowVersion: number };
  version: ServiceTemplateAggregateVersion;
  applicability: Array<Record<string, unknown> & { id: string; evidence: Record<string, unknown>; rowVersion: number }>;
  actions: Array<Record<string, unknown> & { id: string; sequenceNumber: number; actionType: string; disposition: string; description: string; rowVersion: number }>;
  partLines: Array<Record<string, unknown> & { id: string; technicalPartVersionId: string; quantity: number; unitCode: string; partVersion: Record<string, unknown>; part: Record<string, unknown>; rowVersion: number }>;
  fluidLines: Array<Record<string, unknown> & { id: string; fluidSpecificationVersionId: string; quantity: number; unitCode: string; specificationVersion: Record<string, unknown>; specification: Record<string, unknown>; rowVersion: number }>;
  inspections: Array<Record<string, unknown> & { id: string; description: string; disposition: string; rowVersion: number }>;
  replacements: Array<Record<string, unknown> & { id: string; replacementPartVersionId: string | null; replacementComponentType: string | null; authorityType: string; evidence: Record<string, unknown>; rowVersion: number }>;
  requirementLinks: Array<Record<string, unknown> & { id: string; maintenanceRequirementVersionId: string; requirementSchemaVersion: number; disposition: string; rowVersion: number }>;
}

export interface TechnicalProposal extends Record<string, unknown> {
  id: string;
  organisation_id: string | null;
  proposal_type: TechnicalProposalType;
  proposal_state: 'PROPOSED' | 'REVIEWED' | 'APPROVED' | 'REJECTED';
  proposed_by_type: TechnicalProposalSource;
  has_technical_authority: false;
  published_entity_id: null;
  row_version: number;
}

export interface AssetTechnicalCatalogue {
  systems: Array<{ id: string; code: string; name: string }>;
  positions: Array<{ id: string; code: string; name: string }>;
  parts: TechnicalPartCatalogueItem[];
  fluids: TechnicalFluidCatalogueItem[];
  serviceTemplates: ApplicableServiceTemplateVersion[];
  attachedAssets: ResolvedAssetRoute[];
}

export interface OrganisationPartPreference extends Record<string, unknown> {
  id: string;
  technical_part_id: string;
  preferred_part_version_id: string | null;
  row_version: number;
}

export interface OrganisationFluidPreference extends Record<string, unknown> {
  id: string;
  technical_fluid_specification_id: string;
  satisfied_fluid_specification_version_id: string;
  preferred_product: string;
  row_version: number;
}

export interface OrganisationTechnicalPreferences {
  parts: OrganisationPartPreference[];
  fluids: OrganisationFluidPreference[];
}

export type PartPreferenceData = {
  technicalPartId?: string;
  preferredPartVersionId?: string | null;
  preferredSupplier?: string | null;
  supplierSku?: string | null;
  internalSku?: string | null;
  organisationNotes?: string | null;
};

export type FluidPreferenceData = {
  technicalFluidSpecificationId?: string;
  satisfiedFluidSpecificationVersionId?: string;
  preferredProduct: string;
  preferredBrand?: string | null;
  preferredSupplier?: string | null;
  supplierSku?: string | null;
  organisationNotes?: string | null;
};

export class TechnicalCatalogueApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly correlationId?: string
  ) {
    super(message);
    this.name = 'TechnicalCatalogueApiError';
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const envelope: any = await response.json().catch(() => ({}));
  const correlationId = response.headers.get('X-Correlation-ID') || envelope?.error?.correlationId || undefined;
  if (!response.ok) {
    const diagnostics = boundedPublicDiagnostics({
      code: envelope?.error?.code,
      message: envelope?.error?.message,
      correlationId,
    }, {
      code: 'TECHNICAL_CATALOGUE_API_ERROR',
      message: 'Technical catalogue request failed.',
    });
    throw new TechnicalCatalogueApiError(
      response.status,
      diagnostics.code,
      diagnostics.message,
      diagnostics.correlationId
    );
  }
  if (!envelope || typeof envelope.data !== 'object' || envelope.data === null) {
    throw new TechnicalCatalogueApiError(0, 'MALFORMED_RESPONSE', 'The technical catalogue API returned an invalid response.', correlationId);
  }
  return envelope.data as T;
}

function get<T>(action: string, query: Record<string, string> = {}) {
  const parameters = new URLSearchParams({ action, ...query });
  return fetch(`/api/v1/technical-catalogue?${parameters.toString()}`, {
    method: 'GET',
    credentials: 'same-origin',
  }).then(parseResponse<T>);
}

function post<T>(action: string, body: unknown) {
  return fetch(`/api/v1/technical-catalogue?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(parseResponse<T>);
}

export const technicalCatalogueApi = {
  resolveAssetRoute(source: AssetSource, sourceRecordId: string) {
    return get<ResolvedAssetRoute>('resolve-asset', { source, sourceRecordId });
  },

  lookupAsset(assetId: string, asOf: string) {
    return get<AssetTechnicalCatalogue>('lookup', { assetId, asOf });
  },

  readPreferences() {
    return get<OrganisationTechnicalPreferences>('preferences');
  },

  readServiceTemplateVersion(assetId: string, templateVersionId: string, asOf: string) {
    return get<ApplicableServiceTemplateAggregate>('service-template-version', { assetId, templateVersionId, asOf });
  },

  createProposal(input: { proposalType: TechnicalProposalType; proposedData: Record<string, unknown>; evidence?: Record<string, unknown>; proposedByType: TechnicalProposalSource }) {
    return post<TechnicalProposal>('propose', input);
  },

  reviewProposal(input: { proposalId: string; expectedVersion: number; decision: TechnicalProposalDecision; reviewEvidence: Record<string, unknown>; reviewNotes?: string }) {
    return post<TechnicalProposal>('review', input);
  },

  createPlatformProposal(input: { proposalType: TechnicalProposalType; proposedData: Record<string, unknown>; evidence?: Record<string, unknown>; proposedByType: TechnicalProposalSource }) {
    return post<TechnicalProposal>('platform-propose', input);
  },

  reviewPlatformProposal(input: { proposalId: string; expectedVersion: number; decision: TechnicalProposalDecision; reviewEvidence: Record<string, unknown>; reviewNotes?: string }) {
    return post<TechnicalProposal>('platform-review', input);
  },

  savePreference(input:
    | { preferenceType: 'PART'; preferenceId?: string; expectedVersion?: number; data: PartPreferenceData }
    | { preferenceType: 'FLUID'; preferenceId?: string; expectedVersion?: number; data: FluidPreferenceData }
  ) {
    return post<Record<string, unknown>>('save-preference', input);
  },

  publishOrganisationServiceTemplate(input: { serviceTemplateVersionId: string; expectedVersion: number; effectiveFrom: string }) {
    return post<Record<string, unknown>>('publish-service-template', input);
  },

  publishTechnicalVersion(input: { entityType: TechnicalEntityType; entityId: string; expectedVersion: number; effectiveFrom: string }) {
    return post<Record<string, unknown>>('publish-technical-version', input);
  },

  publishPartEquivalence(input: { equivalenceId: string; expectedVersion: number; effectiveFrom: string }) {
    return post<Record<string, unknown>>('publish-part-equivalence', input);
  },

  publishTechnicalApplicability(input: { applicabilityType: TechnicalEntityType; applicabilityId: string; expectedVersion: number; effectiveFrom: string }) {
    return post<Record<string, unknown>>('publish-technical-applicability', input);
  },

  publishPlatformServiceTemplate(input: { serviceTemplateVersionId: string; expectedVersion: number; effectiveFrom: string }) {
    return post<Record<string, unknown>>('publish-platform-service-template', input);
  },
};
