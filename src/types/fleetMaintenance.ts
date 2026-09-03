export type MaintenanceDueState = 'CURRENT' | 'DUE_SOON' | 'DUE' | 'OVERDUE' | 'INSUFFICIENT_DATA';
export type MaintenanceThresholdPolicy = 'ANY';
export type MaintenanceThresholdType = 'CALENDAR' | 'METER' | 'CONDITION' | 'ONE_TIME' | 'COMPONENT';
export type MaintenanceMeterType = 'odometer' | 'engine_hours' | 'flight_hours' | 'cycles' | 'missions' | 'area' | 'custom';
export type MaintenanceBaselineType = 'PREVIOUS_COMPLETION' | 'COMMISSIONING' | 'METER' | 'ONE_TIME';
export type MaintenanceCurrentAuthoritySource = 'AUTHORITATIVE_METER' | 'AIRCRAFT_COMPATIBILITY';
export type MaintenanceRequirementKind = 'SERVICE' | 'INSPECTION' | 'REPLACEMENT' | 'CALIBRATION' | 'ONE_TIME' | 'CONDITION_BASED';
export type MaintenanceAuthorityType = 'MANUFACTURER' | 'ORGANISATION_STANDARD' | 'CONDITION_BASED';
export type MaintenanceAuthorityScope = 'PLATFORM' | 'ORGANISATION';
export type ApplicableMaintenanceLifecycleState = 'EFFECTIVE' | 'SUPERSEDED';

export type MaintenanceEvidence = Record<string, unknown>;

export interface MaintenanceThresholdResult {
  thresholdId: string;
  sequenceNumber: number;
  thresholdType: MaintenanceThresholdType;
  meterType: MaintenanceMeterType | null;
  unitCode: string | null;
  intervalValue: number | null;
  dueSoonValue: number | null;
  baselineType: MaintenanceBaselineType | null;
  baselineValue: number | null;
  baselineDate: string | null;
  currentValue: number | null;
  currentRecordedAt: string | null;
  currentAuthoritySource: MaintenanceCurrentAuthoritySource | null;
  dueValue: number | null;
  dueDate: string | null;
  remaining: number | null;
  state: MaintenanceDueState;
  baselineEvidence: MaintenanceEvidence | null;
}

export interface MaintenanceRequirementDueResult {
  requirementId: string;
  requirementVersionId: string;
  requirementCode: string;
  requirementName: string;
  requirementKind: MaintenanceRequirementKind;
  authorityType: MaintenanceAuthorityType;
  authorityScope: MaintenanceAuthorityScope;
  lifecycleState: ApplicableMaintenanceLifecycleState;
  effectiveFrom: string;
  effectiveTo: string | null;
  thresholdPolicy: MaintenanceThresholdPolicy;
  state: MaintenanceDueState;
  controllingThresholdId: string;
  thresholds: MaintenanceThresholdResult[];
  evidence: MaintenanceEvidence;
  serviceKitVersionId: string | null;
}

export interface MaintenanceDueProjection {
  assetId: string;
  asOf: string;
  timezone: string;
  requirements: MaintenanceRequirementDueResult[];
}

export interface AttachedAssetMaintenanceDueSummary {
  registryId: string;
  dueState: MaintenanceDueProjection;
}

export interface MaintenanceDueResult extends MaintenanceDueProjection {
  attachedAssetSummaries: AttachedAssetMaintenanceDueSummary[];
}

export interface MaintenanceBaselineEvidence {
  type: MaintenanceBaselineType | null;
  value: number | null;
  date: string | null;
  evidence: MaintenanceEvidence | null;
}

export interface MaintenanceCurrentEvidence {
  value: number | null;
  recordedAt: string | null;
  authoritySource: MaintenanceCurrentAuthoritySource | null;
}

export interface MaintenanceDueEvidence {
  value: number | null;
  date: string | null;
}

export interface MaintenanceValueEvidence {
  value: number;
  unitCode: string | null;
}

export interface MaintenanceThresholdExplanation {
  thresholdId: string;
  thresholdType: MaintenanceThresholdType;
  state: MaintenanceDueState;
  interval: MaintenanceValueEvidence | null;
  baseline: MaintenanceBaselineEvidence | null;
  current: MaintenanceCurrentEvidence | null;
  due: MaintenanceDueEvidence | null;
  remaining: MaintenanceValueEvidence | null;
  dueSoonRule: MaintenanceValueEvidence | null;
}

export interface AttachedMaintenanceAssetPresentationSummary {
  registryId: string;
  requirementCount: number;
  attentionRequirementCount: number;
  highestState: MaintenanceDueState | null;
}

export interface AttachedMaintenancePresentationSummary {
  requiresAttention: boolean;
  assets: AttachedMaintenanceAssetPresentationSummary[];
}
