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
  sourceUpdatedAt: string;
}

/** A typed, immutable-at-capture summary rather than a live Job or Mission object. */
export interface SafetyPlanSourceSnapshot {
  capturedAt: string;
  job: {
    id: string;
    name: string;
    clientName?: string;
    propertyName?: string;
    location?: string;
    operatingDates?: string;
  };
  missions: Array<{
    id: string;
    name: string;
  }>;
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
    | 'draft_deleted';
  occurredAt: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
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
}

export interface SafetyPlan {
  id: string;
  jobId: string;
  tenantId: string;
  status: SafetyPlanStatus;
  currentVersionId?: string;
  versions: SafetyPlanVersion[];
  notRequiredReason?: string;
  createdAt: string;
  updatedAt: string;
}
