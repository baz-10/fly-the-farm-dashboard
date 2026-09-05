export type MissionPackageState = 'PREPARING' | 'AWAITING_CRP_APPROVAL' | 'AUTHORISED' | 'REJECTED';

export interface MissionPackageRevision {
  id: string;
  missionId: string;
  revisionNumber: number;
  fieldIds: string[];
  jsaRevisionId: string;
  evidenceDigest: string;
  state: MissionPackageState;
  createdAt: string;
}

export interface CrpDecision {
  id: string;
  packageRevisionId: string;
  decision: 'AUTHORISED' | 'REJECTED';
  decidedByInternalUserId: string;
  decidedAt: string;
  declaration: string;
}

export interface MissionPackageHistory {
  missionId: string;
  currentRevision: number;
  packages: MissionPackageRevision[];
  decisions: CrpDecision[];
}

export type MissionOperatingDayState = 'DRAFT' | 'READY' | 'IN_PROGRESS' | 'COMPLETED' | 'SIGNED_OFF';
export type MissionJsaDayReviewOutcome = 'CONDITIONS_COVERED' | 'CHANGE_DECLARED';
export type MissionFieldActivityStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'NOT_WORKED';

export interface MissionJsaDayReview {
  id: string;
  operatingDayId: string;
  missionId: string;
  jsaRevisionId: string;
  outcome: MissionJsaDayReviewOutcome;
  notes: string | null;
  reviewedByInternalUserId: string;
  reviewedAt: string;
}

export interface MissionFieldActivity {
  id: string;
  operatingDayId: string;
  missionId: string;
  fieldId: string;
  hectaresAttempted: string | null;
  hectaresCompleted: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  status: MissionFieldActivityStatus;
  notes: string | null;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface MissionOperatingDay {
  id: string;
  missionId: string;
  workDate: string;
  timezone: string;
  packageRevisionId: string;
  jsaRevisionId: string;
  state: MissionOperatingDayState;
  actualStartedAt: string | null;
  actualFinishedAt: string | null;
  notes: string | null;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
  jsaReview: MissionJsaDayReview | null;
  fieldActivities: MissionFieldActivity[];
}

export interface MissionOperatingDays {
  missionId: string;
  days: MissionOperatingDay[];
}

export interface MissionFieldActivityInput {
  fieldId: string;
  hectaresAttempted: string | null;
  hectaresCompleted: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  status: MissionFieldActivityStatus;
  notes: string | null;
}

export type MissionAircraftDayTotalSource = 'DECLARED' | 'DERIVED_FROM_FLIGHTS';
export type MissionAircraftDayReconciliationStatus = 'TOTAL_ONLY' | 'FLIGHTS_ONLY' | 'RECONCILED' | 'MISMATCH';

export interface MissionFlightActual {
  id: string;
  aircraftDayActualId: string;
  missionId: string;
  operatingDayId: string;
  aircraftId: string;
  flightIndex: number;
  durationHours: string;
  startedAt: string | null;
  finishedAt: string | null;
  fieldId: string | null;
  sourceImportId: string | null;
}

export interface MissionAircraftDayActual {
  id: string;
  missionId: string;
  operatingDayId: string;
  packageRevisionId: string;
  aircraftId: string;
  missionAircraftAssignmentId: string | null;
  declaredTotalHours: string | null;
  totalFlightHours: string;
  flightsTotalHours: string;
  totalSource: MissionAircraftDayTotalSource;
  reconciliationStatus: MissionAircraftDayReconciliationStatus;
  rowVersion: number;
  signedOffAt: string | null;
  signedOffByInternalUserId: string | null;
  flights: MissionFlightActual[];
}

export interface MissionAircraftDayActualsRecord {
  missionId: string;
  operatingDayId: string;
  packageRevisionId: string;
  dayVersion: number;
  totalAircraftHours: string;
  readyForSignOff: boolean;
  actuals: MissionAircraftDayActual[];
}

export interface MissionFlightActualInput {
  aircraftId: string;
  durationHours: string;
  startedAt: string | null;
  finishedAt: string | null;
  fieldId: string | null;
  sourceImportId: string | null;
}

export interface MissionAircraftDayActualsSaveInput {
  missionId: string;
  expectedVersion: number;
  totalAircraftHours: string;
  aircraftTotals: Array<{ aircraftId: string; totalFlightHours: string | null }>;
  flights: MissionFlightActualInput[];
}

export type MissionDayChemicalRateUnit = 'L_HA' | 'ML_HA' | 'KG_HA' | 'G_HA';
export type MissionDayChemicalQuantityUnit = 'L' | 'ML' | 'KG' | 'G';

export interface MissionDayChemicalProposal {
  plannedLineId: string;
  platformProductId: string | null;
  platformProductVersionId: string | null;
  registerEntryId: string | null;
  productName: string;
  rate: string;
  rateUnit: MissionDayChemicalRateUnit;
  plannedQuantity: string;
  quantityUnit: MissionDayChemicalQuantityUnit;
  productSnapshot: Record<string, unknown>;
}

export interface MissionDayChemicalActualLineInput {
  fieldId: string;
  plannedLineId: string | null;
  platformProductId: string | null;
  platformProductVersionId: string | null;
  registerEntryId: string | null;
  productName: string;
  rate: string;
  rateUnit: MissionDayChemicalRateUnit;
  appliedQuantity: string;
  quantityUnit: MissionDayChemicalQuantityUnit;
  batchLot: string | null;
  aircraftId: string | null;
}

export interface MissionDayChemicalActualLine extends MissionDayChemicalActualLineInput {
  id: string;
  productSnapshot: Record<string, unknown>;
}

export interface MissionDayChemicalActualRevision {
  id: string;
  missionId: string;
  operatingDayId: string;
  packageRevisionId: string;
  plannedChemicalRevisionId: string;
  revisionNumber: number;
  confirmationState: 'CONFIRMED';
  changedFromPlan: boolean;
  materialVariance: boolean;
  operationStartedAtConfirmation: string | null;
  notes: string | null;
  confirmedByInternalUserId: string;
  confirmedAt: string;
  lines: MissionDayChemicalActualLine[];
}

export interface MissionDayChemicalActualsRecord {
  missionId: string;
  operatingDayId: string;
  packageRevisionId: string;
  plannedChemicalRevisionId: string;
  dayVersion: number;
  currentRevision: number;
  proposals: MissionDayChemicalProposal[];
  actual: MissionDayChemicalActualRevision | null;
}

export interface MissionDayChemicalConfirmationInput {
  missionId: string;
  expectedDayVersion: number;
  expectedRevision: number;
  lines: MissionDayChemicalActualLineInput[];
  notes: string | null;
}

export type MissionDayWeatherCoverage = 'ACTUAL_INTERVAL' | 'FULL_DAY';
export type MissionDayWeatherSource = 'OPEN_METEO' | 'MANUAL';

export interface MissionDayWeatherHourlyObservation {
  observedAt: string;
  temperatureC: number | null;
  relativeHumidity: number | null;
  dewPointC: number | null;
  windSpeedKmh: number | null;
  windDirectionDegrees: number | null;
  precipitationMm: number | null;
}

export interface MissionDayWeatherCoverageGap {
  observedAt: string;
  reason: string;
}

export interface MissionDayWeatherEvidence {
  source: MissionDayWeatherSource;
  providerIdentifier: string | null;
  providerRetrievedAt: string | null;
  hourlyObservations: MissionDayWeatherHourlyObservation[];
  inversionInputs: Record<string, unknown>;
  inversionResults: Record<string, unknown>;
  coverageGaps: MissionDayWeatherCoverageGap[];
  manualReason: string | null;
  sourceMetadata: Record<string, unknown>;
}

export interface MissionDayWeatherReportRecord extends MissionDayWeatherEvidence {
  id: string;
  missionId: string;
  operatingDayId: string;
  packageRevisionId: string;
  coverage: MissionDayWeatherCoverage;
  intervalStartAt: string;
  intervalEndAt: string;
  timezone: string;
  sourceWeatherObservationId: string;
  latitude: string;
  longitude: string;
  sourceDigest: string;
  recordedByInternalUserId: string;
  createdAt: string;
}

export interface MissionDayWeatherCaptureInput {
  missionId: string;
  coverage: MissionDayWeatherCoverage;
}

export interface MissionDayWeatherManualInput extends MissionDayWeatherCaptureInput {
  evidence: MissionDayWeatherEvidence;
}

export interface MissionFinalSignoffBlocker {
  code: string;
  message: string;
}

export interface MissionFinalSignoffReadiness {
  missionId: string;
  operationalWorkCompleted: boolean;
  finalSignedOff: boolean;
  readyForFinalSignoff: boolean;
  currentCompletionRevision: number;
  blockers: MissionFinalSignoffBlocker[];
}

export interface MissionCompletionRevision {
  id: string;
  missionId: string;
  versionNumber: number;
  dailyEvidenceDigest: string;
  completedAt: string;
}

export interface MissionJobCloseResult {
  id: string;
  status: 'closed';
  rowVersion: number;
}
