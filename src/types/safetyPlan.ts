export type SafetyPlanStatus =
  | 'not_required'
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'superseded';

export type SafetyPlanFieldType =
  | 'text'
  | 'textarea'
  | 'date'
  | 'date_range'
  | 'boolean'
  | 'select'
  | 'multi_select'
  | 'person_list'
  | 'asset_list'
  | 'attachment_list';

export type SafetyPlanFieldValue = string | boolean | string[] | null;

export interface SafetyPlanActor {
  userId: string;
  name: string;
  role: 'admin' | 'contractor';
  operationalAuthority: boolean;
}

export interface SafetyPlanSourceLink {
  sourceType: 'mission' | 'jsa' | 'risk_assessment';
  sourceId: string;
  sourceItemId?: string;
  sourceUpdatedAt: string;
}

export interface SafetyPlanSourceItem {
  /** Stable composite identity: source type, record ID and item ID. */
  id: string;
  sourceType: 'jsa' | 'risk_assessment';
  /** Mission that owns the source safety record. */
  sourceId: string;
  /** JSA or Risk Assessment record that owns the item. */
  sourceRecordId?: string;
  sourceItemId: string;
  sourceUpdatedAt: string;
  label: string;
  /** Latest value supplied by the source record. */
  value: string;
  /** Editable value retained by the company when resolving source changes. */
  companyValue: string;
}

export interface SafetyPlanSiteMapSnapshot {
  boundary?: {
    fileName: string;
    fileType: 'kml' | 'shp' | 'kmz';
    sizeBytes: number;
    boundingBox?: {
      north: number;
      south: number;
      east: number;
      west: number;
    };
    uploadedAt: string;
  };
  boundaryCoords: Array<[number, number]>;
}

/** A typed, immutable-at-capture summary rather than a live Job or Mission object. */
export interface SafetyPlanSourceSnapshot {
  capturedAt: string;
  company?: {
    id: string;
    name: string;
  };
  job: {
    id: string;
    name: string;
    clientName?: string;
    propertyName?: string;
    fieldName?: string;
    location?: string;
    operatingDates?: string;
    siteNotes?: string;
  };
  missions: Array<{
    id: string;
    name: string;
  }>;
  client?: {
    id: string;
    name: string;
    phone?: string;
    email?: string;
  };
  property?: {
    id: string;
    name: string;
    address?: string;
  };
  field?: {
    id: string;
    name: string;
    sizeHa?: number;
  };
  crew?: Array<{
    id: string;
    name: string;
    role: string;
  }>;
  assets?: Array<{
    id: string;
    name: string;
    type: string;
  }>;
  chemicals?: Array<{
    product: string;
    activeIngredient?: string;
    ratePerHa?: string;
    quantity?: string;
    sdsReference?: string;
  }>;
  emergencyContacts?: Array<{
    name: string;
    phone: string;
    role?: string;
  }>;
  siteMap?: SafetyPlanSiteMapSnapshot;
  hazards?: SafetyPlanSourceItem[];
  sourceLinks: SafetyPlanSourceLink[];
}

export interface SafetyPlanField {
  id: string;
  label: string;
  helpText: string;
  type: SafetyPlanFieldType;
  required: boolean;
  companyEditable: boolean;
  value?: SafetyPlanFieldValue;
}

export interface SafetyPlanSection {
  id: string;
  title?: string;
  helpText?: string;
  required: boolean;
  companyEditable?: boolean;
  fields: SafetyPlanField[];
}

export interface SafetyPlanTemplate {
  id: string;
  name: string;
  version: string;
  jurisdiction: string;
  notice: string;
  sections: SafetyPlanSection[];
  isPlatformStandard: boolean;
}

export interface CompanySafetyPlanTemplate extends SafetyPlanTemplate {
  tenantId: string;
  recordType?: 'draft' | 'published';
  draftRevision?: number;
  standardVersion: string;
  sectionStandardVersions?: Record<string, string>;
  masterVersion: number;
  publishedAt?: string;
  publishedBy?: Pick<SafetyPlanActor, 'userId' | 'name'>;
}

export interface SafetyPlanAttachment {
  id: string;
  tenantId: string;
  versionId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  contentDigest: string;
  source: 'upload' | 'link';
  description?: string;
  uploadedBy: SafetyPlanActor;
  uploadedAt: string;
}

export interface SafetyPlanAcknowledgement {
  id: string;
  versionId: string;
  actor: SafetyPlanActor;
  assignedRole: string;
  statement: string;
  acknowledgedAt: string;
  withdrawnAt?: string;
  replacementAcknowledgementId?: string;
}

export interface SafetyPlanAuditEvent {
  id: string;
  /** Correlates the plan mutation and its atomic audit append. */
  operationId?: string;
  tenantId: string;
  planId: string;
  versionId?: string;
  actor: SafetyPlanActor;
  action:
    | 'created'
    | 'source_refreshed'
    | 'field_changed'
    | 'attachment_changed'
    | 'submitted'
    | 'returned_to_draft'
    | 'approved'
    | 'acknowledged'
    | 'revised'
    | 'superseded'
    | 'shared'
    | 'pdf_generated'
    | 'client_copy_exported'
    | 'draft_deleted'
    | 'draft_restored'
    | 'not_required_selected'
    | 'authority_nominated'
    | 'authority_removed'
    | 'company_master_published';
  occurredAt: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  clientId?: string;
}

export interface SafetyPlanVersion {
  id: string;
  planId: string;
  version: string;
  status: Exclude<SafetyPlanStatus, 'not_required'>;
  templateSnapshot: SafetyPlanTemplate;
  sections: SafetyPlanSection[];
  sourceSnapshot: SafetyPlanSourceSnapshot;
  attachments: SafetyPlanAttachment[];
  acknowledgements: SafetyPlanAcknowledgement[];
  approvedBy?: SafetyPlanActor;
  approvedAt?: string;
  contentDigest?: string;
  retentionUntil?: string;
  createdAt: string;
  updatedAt: string;
  /** Optimistic-concurrency integer for this immutable or draft version. */
  revision: number;
  createdBy?: SafetyPlanActor;
  /**
   * Mutation intent for the repository. The authenticated server derives
   * actor identity and occurrence time when it appends the audit event.
   */
  sourceRefreshIntent?: {
    kind: 'source_refresh';
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
}

export interface SafetyPlan {
  id: string;
  jobId: string;
  tenantId: string;
  /** Optimistic-concurrency integer for the complete plan record. */
  revision: number;
  status: SafetyPlanStatus;
  currentVersionId?: string;
  versions: SafetyPlanVersion[];
  notRequiredReason?: string;
  notRequiredActor?: SafetyPlanActor;
  notRequiredSelectedAt?: string;
  deletedAt?: string;
  deletedBy?: SafetyPlanActor;
  createdAt: string;
  updatedAt: string;
}
