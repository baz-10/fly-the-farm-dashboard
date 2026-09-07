import type {
  CrpDecision,
  MissionPackageHistory,
  MissionPackageRevision,
  MissionPackageState,
  MissionFieldActivity,
  MissionFieldActivityInput,
  MissionFieldActivityStatus,
  MissionJsaDayReview,
  MissionJsaDayReviewOutcome,
  MissionOperatingDay,
  MissionOperatingDays,
  MissionOperatingDayState,
  MissionAircraftDayActual,
  MissionAircraftDayActualsRecord,
  MissionAircraftDayActualsSaveInput,
  MissionAircraftDayReconciliationStatus,
  MissionAircraftDayTotalSource,
  MissionFlightActual,
  MissionDayChemicalActualLine,
  MissionDayChemicalActualRevision,
  MissionDayChemicalActualsRecord,
  MissionDayChemicalConfirmationInput,
  MissionDayChemicalProposal,
  MissionDayWeatherCaptureInput,
  MissionDayWeatherCoverage,
  MissionDayWeatherCoverageGap,
  MissionDayWeatherHourlyObservation,
  MissionDayWeatherManualInput,
  MissionDayWeatherReportRecord,
  MissionDayWeatherSource,
  MissionFinalSignoffReadiness,
  MissionCompletionRevision,
  MissionJobCloseResult,
} from '../types/missionOperations';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const STATES: readonly MissionPackageState[] = ['PREPARING', 'AWAITING_CRP_APPROVAL', 'AUTHORISED', 'REJECTED'];
const DECISIONS = ['AUTHORISED', 'REJECTED'] as const;
const DAY_STATES: readonly MissionOperatingDayState[] = ['DRAFT', 'READY', 'IN_PROGRESS', 'COMPLETED', 'SIGNED_OFF'];
const REVIEW_OUTCOMES: readonly MissionJsaDayReviewOutcome[] = ['CONDITIONS_COVERED', 'CHANGE_DECLARED'];
const ACTIVITY_STATUSES: readonly MissionFieldActivityStatus[] = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'NOT_WORKED'];
const HECTARES = /^(?:0|[1-9]\d{0,11})\.\d{6}$/;
const TIMESTAMPTZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const HOURS = /^(?:0|[1-9]\d{0,5})\.\d{4}$/;
const DECIMAL6 = /^(?:0|[1-9]\d{0,11})\.\d{6}$/;
const SIGNED_DECIMAL6 = /^-?(?:0|[1-9]\d{0,2})\.\d{6}$/;
const AIRCRAFT_TOTAL_SOURCES: readonly MissionAircraftDayTotalSource[] = ['DECLARED', 'DERIVED_FROM_FLIGHTS'];
const AIRCRAFT_RECONCILIATION_STATES: readonly MissionAircraftDayReconciliationStatus[] = ['TOTAL_ONLY', 'FLIGHTS_ONLY', 'RECONCILED', 'MISMATCH'];

export class MissionOperationsApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly correlationId?: string,
    readonly currentVersion?: number,
    readonly currentDigest?: string,
  ) {
    super(message);
    this.name = 'MissionOperationsApiError';
  }
}

function malformed(): never {
  throw new MissionOperationsApiError(0, 'MALFORMED_RESPONSE', 'The Mission Operations API returned an invalid response.');
}

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return malformed();
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const actual = Object.keys(value);
  if (actual.length !== keys.length || keys.some((key) => !(key in value)) || actual.some((key) => !keys.includes(key))) return malformed();
  return value;
}

function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) return malformed();
  return value;
}

function positiveInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) return malformed();
  return value;
}

function nonNegativeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return malformed();
  return value;
}

function isoTimestamp(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) return malformed();
  return value;
}

function exactTimestamp(value: unknown): string {
  if (typeof value !== 'string' || !TIMESTAMPTZ.test(value) || !Number.isFinite(Date.parse(value))) return malformed();
  canonicalDate(value.slice(0, 10));
  return value;
}

function nullable<T>(value: unknown, decode: (candidate: unknown) => T): T | null {
  return value === null ? null : decode(value);
}

function canonicalDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return malformed();
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthLengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > monthLengths[month - 1]) return malformed();
  return value;
}

function boundedText(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum || value.trim() !== value
    || value.split('').some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return malformed();
  return value;
}

function timezone(value: unknown): string {
  return boundedText(value, 100);
}

function hectares(value: unknown): string {
  if (typeof value !== 'string' || !HECTARES.test(value)) return malformed();
  return value;
}

function hours(value: unknown): string {
  if (typeof value !== 'string' || !HOURS.test(value)) return malformed();
  return value;
}

function sumHours(values: string[]): string {
  const units = values.reduce((sum, value) => sum + Number(value.replace('.', '')), 0);
  if (!Number.isSafeInteger(units) || units > 9_999_999_999) return malformed();
  return `${Math.floor(units / 10_000)}.${String(units % 10_000).padStart(4, '0')}`;
}

function declaration(value: unknown): string {
  if (typeof value !== 'string' || value.trim() !== value || value.length < 1 || value.length > 2000
    || value.split('').some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return malformed();
  return value;
}

function digest(value: unknown): string {
  if (typeof value !== 'string' || !SHA256.test(value)) return malformed();
  return value;
}

function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') return malformed();
  return value;
}

function decimal6(value: unknown): string {
  if (typeof value !== 'string' || !DECIMAL6.test(value)) return malformed();
  return value;
}

function jsonObject(value: unknown): Record<string, unknown> {
  const result = object(value);
  try {
    if (JSON.stringify(result).length > 100000) return malformed();
  } catch {
    return malformed();
  }
  return result;
}

function finiteNullable(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return malformed();
  return value;
}

function finiteWithin(value: unknown, minimum: number, maximum: number): number | null {
  const result = finiteNullable(value);
  if (result !== null && (result < minimum || result > maximum)) return malformed();
  return result;
}

function uniqueFieldIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) return malformed();
  const ids = value.map(uuid);
  if (new Set(ids.map((id) => id.toLowerCase())).size !== ids.length) return malformed();
  return ids;
}

function state(value: unknown): MissionPackageState {
  if (typeof value !== 'string' || !STATES.includes(value as MissionPackageState)) return malformed();
  return value as MissionPackageState;
}

export function decodeMissionPackageRevision(value: unknown): MissionPackageRevision {
  const source = exact(object(value), ['id', 'missionId', 'revisionNumber', 'fieldIds', 'jsaRevisionId', 'evidenceDigest', 'state', 'createdAt']);
  return {
    id: uuid(source.id),
    missionId: uuid(source.missionId),
    revisionNumber: positiveInteger(source.revisionNumber),
    fieldIds: uniqueFieldIds(source.fieldIds),
    jsaRevisionId: uuid(source.jsaRevisionId),
    evidenceDigest: digest(source.evidenceDigest),
    state: state(source.state),
    createdAt: isoTimestamp(source.createdAt),
  };
}

export function decodeCrpDecision(value: unknown): CrpDecision {
  const source = exact(object(value), ['id', 'packageRevisionId', 'decision', 'decidedByInternalUserId', 'decidedAt', 'declaration']);
  if (typeof source.decision !== 'string' || !DECISIONS.includes(source.decision as typeof DECISIONS[number])) return malformed();
  return {
    id: uuid(source.id),
    packageRevisionId: uuid(source.packageRevisionId),
    decision: source.decision as CrpDecision['decision'],
    decidedByInternalUserId: uuid(source.decidedByInternalUserId),
    decidedAt: isoTimestamp(source.decidedAt),
    declaration: declaration(source.declaration),
  };
}

export function decodeMissionPackageHistory(value: unknown): MissionPackageHistory {
  const source = exact(object(value), ['missionId', 'currentRevision', 'packages', 'decisions']);
  if (!Array.isArray(source.packages) || source.packages.length > 100 || !Array.isArray(source.decisions) || source.decisions.length > 100) return malformed();
  const missionId = uuid(source.missionId);
  const currentRevision = nonNegativeInteger(source.currentRevision);
  const packages = source.packages.map(decodeMissionPackageRevision);
  const decisions = source.decisions.map(decodeCrpDecision);
  const packageIds = new Set(packages.map((revision) => revision.id));
  if (packages.some((revision) => revision.missionId !== missionId)
    || new Set(packages.map((revision) => revision.id)).size !== packages.length
    || new Set(packages.map((revision) => revision.revisionNumber)).size !== packages.length
    || new Set(decisions.map((entry) => entry.packageRevisionId)).size !== decisions.length
    || decisions.some((entry) => !packageIds.has(entry.packageRevisionId))) return malformed();
  if (packages.some((revision) => revision.revisionNumber > currentRevision)) return malformed();
  return { missionId, currentRevision, packages, decisions };
}

export function decodeMissionJsaDayReview(value: unknown): MissionJsaDayReview {
  const source = exact(object(value), [
    'id', 'operatingDayId', 'missionId', 'jsaRevisionId', 'outcome', 'notes',
    'reviewedByInternalUserId', 'reviewedAt',
  ]);
  if (typeof source.outcome !== 'string' || !REVIEW_OUTCOMES.includes(source.outcome as MissionJsaDayReviewOutcome)) return malformed();
  return {
    id: uuid(source.id),
    operatingDayId: uuid(source.operatingDayId),
    missionId: uuid(source.missionId),
    jsaRevisionId: uuid(source.jsaRevisionId),
    outcome: source.outcome as MissionJsaDayReviewOutcome,
    notes: nullable(source.notes, (candidate) => boundedText(candidate, 4000)),
    reviewedByInternalUserId: uuid(source.reviewedByInternalUserId),
    reviewedAt: exactTimestamp(source.reviewedAt),
  };
}

export function decodeMissionFieldActivity(value: unknown): MissionFieldActivity {
  const source = exact(object(value), [
    'id', 'operatingDayId', 'missionId', 'fieldId', 'hectaresAttempted', 'hectaresCompleted',
    'startedAt', 'finishedAt', 'status', 'notes', 'rowVersion', 'createdAt', 'updatedAt',
  ]);
  if (typeof source.status !== 'string' || !ACTIVITY_STATUSES.includes(source.status as MissionFieldActivityStatus)) return malformed();
  const startedAt = nullable(source.startedAt, exactTimestamp);
  const finishedAt = nullable(source.finishedAt, exactTimestamp);
  if (finishedAt !== null && (startedAt === null || Date.parse(finishedAt) < Date.parse(startedAt))) return malformed();
  return {
    id: uuid(source.id),
    operatingDayId: uuid(source.operatingDayId),
    missionId: uuid(source.missionId),
    fieldId: uuid(source.fieldId),
    hectaresAttempted: nullable(source.hectaresAttempted, hectares),
    hectaresCompleted: nullable(source.hectaresCompleted, hectares),
    startedAt,
    finishedAt,
    status: source.status as MissionFieldActivityStatus,
    notes: nullable(source.notes, (candidate) => boundedText(candidate, 4000)),
    rowVersion: positiveInteger(source.rowVersion),
    createdAt: exactTimestamp(source.createdAt),
    updatedAt: exactTimestamp(source.updatedAt),
  };
}

export function decodeMissionOperatingDay(value: unknown): MissionOperatingDay {
  const source = exact(object(value), [
    'id', 'missionId', 'workDate', 'timezone', 'packageRevisionId', 'jsaRevisionId', 'state',
    'actualStartedAt', 'actualFinishedAt', 'notes', 'rowVersion', 'createdAt', 'updatedAt',
    'jsaReview', 'fieldActivities',
  ]);
  if (typeof source.state !== 'string' || !DAY_STATES.includes(source.state as MissionOperatingDayState)
    || !Array.isArray(source.fieldActivities) || source.fieldActivities.length > 100) return malformed();
  const id = uuid(source.id);
  const missionId = uuid(source.missionId);
  const jsaRevisionId = uuid(source.jsaRevisionId);
  const actualStartedAt = nullable(source.actualStartedAt, exactTimestamp);
  const actualFinishedAt = nullable(source.actualFinishedAt, exactTimestamp);
  const jsaReview = nullable(source.jsaReview, decodeMissionJsaDayReview);
  const fieldActivities = source.fieldActivities.map(decodeMissionFieldActivity);
  if ((source.state === 'DRAFT' || source.state === 'READY') && (actualStartedAt !== null || actualFinishedAt !== null)) return malformed();
  if (source.state === 'IN_PROGRESS' && (actualStartedAt === null || actualFinishedAt !== null)) return malformed();
  if ((source.state === 'COMPLETED' || source.state === 'SIGNED_OFF')
    && (actualStartedAt === null || actualFinishedAt === null || Date.parse(actualFinishedAt) < Date.parse(actualStartedAt))) return malformed();
  if (source.state !== 'DRAFT' && (!jsaReview || jsaReview.outcome !== 'CONDITIONS_COVERED')) return malformed();
  if (jsaReview && (jsaReview.operatingDayId !== id || jsaReview.missionId !== missionId || jsaReview.jsaRevisionId !== jsaRevisionId)) return malformed();
  if (fieldActivities.some((activity) => activity.operatingDayId !== id || activity.missionId !== missionId)
    || new Set(fieldActivities.map((activity) => activity.id)).size !== fieldActivities.length
    || new Set(fieldActivities.map((activity) => activity.fieldId)).size !== fieldActivities.length) return malformed();
  return {
    id,
    missionId,
    workDate: canonicalDate(source.workDate),
    timezone: timezone(source.timezone),
    packageRevisionId: uuid(source.packageRevisionId),
    jsaRevisionId,
    state: source.state as MissionOperatingDayState,
    actualStartedAt,
    actualFinishedAt,
    notes: nullable(source.notes, (candidate) => boundedText(candidate, 4000)),
    rowVersion: positiveInteger(source.rowVersion),
    createdAt: exactTimestamp(source.createdAt),
    updatedAt: exactTimestamp(source.updatedAt),
    jsaReview,
    fieldActivities,
  };
}

export function decodeMissionOperatingDays(value: unknown): MissionOperatingDays {
  const source = exact(object(value), ['missionId', 'days']);
  if (!Array.isArray(source.days) || source.days.length > 366) return malformed();
  const missionId = uuid(source.missionId);
  const days = source.days.map(decodeMissionOperatingDay);
  if (days.some((day) => day.missionId !== missionId)
    || new Set(days.map((day) => day.id)).size !== days.length
    || new Set(days.map((day) => day.workDate)).size !== days.length) return malformed();
  return { missionId, days };
}

function decodeMissionFlightActual(value: unknown): MissionFlightActual {
  const source = exact(object(value), [
    'id', 'aircraftDayActualId', 'missionId', 'operatingDayId', 'aircraftId', 'flightIndex',
    'durationHours', 'startedAt', 'finishedAt', 'fieldId', 'sourceImportId',
  ]);
  const startedAt = nullable(source.startedAt, exactTimestamp);
  const finishedAt = nullable(source.finishedAt, exactTimestamp);
  if (finishedAt !== null && (startedAt === null || Date.parse(finishedAt) < Date.parse(startedAt))) return malformed();
  return {
    id: uuid(source.id),
    aircraftDayActualId: uuid(source.aircraftDayActualId),
    missionId: uuid(source.missionId),
    operatingDayId: uuid(source.operatingDayId),
    aircraftId: uuid(source.aircraftId),
    flightIndex: positiveInteger(source.flightIndex),
    durationHours: hours(source.durationHours),
    startedAt,
    finishedAt,
    fieldId: nullable(source.fieldId, uuid),
    sourceImportId: nullable(source.sourceImportId, uuid),
  };
}

function decodeMissionAircraftDayActual(value: unknown): MissionAircraftDayActual {
  const source = exact(object(value), [
    'id', 'missionId', 'operatingDayId', 'packageRevisionId', 'aircraftId', 'missionAircraftAssignmentId',
    'declaredTotalHours', 'totalFlightHours', 'flightsTotalHours', 'totalSource', 'reconciliationStatus',
    'rowVersion', 'signedOffAt', 'signedOffByInternalUserId', 'flights',
  ]);
  if (typeof source.totalSource !== 'string' || !AIRCRAFT_TOTAL_SOURCES.includes(source.totalSource as MissionAircraftDayTotalSource)
    || typeof source.reconciliationStatus !== 'string' || !AIRCRAFT_RECONCILIATION_STATES.includes(source.reconciliationStatus as MissionAircraftDayReconciliationStatus)
    || !Array.isArray(source.flights) || source.flights.length > 500) return malformed();
  const id = uuid(source.id);
  const missionId = uuid(source.missionId);
  const operatingDayId = uuid(source.operatingDayId);
  const aircraftId = uuid(source.aircraftId);
  const declaredTotalHours = nullable(source.declaredTotalHours, hours);
  const totalFlightHours = hours(source.totalFlightHours);
  const flightsTotalHours = hours(source.flightsTotalHours);
  const flights = source.flights.map(decodeMissionFlightActual);
  const signedOffAt = nullable(source.signedOffAt, exactTimestamp);
  const signedOffByInternalUserId = nullable(source.signedOffByInternalUserId, uuid);
  if ((signedOffAt === null) !== (signedOffByInternalUserId === null)
    || flights.some((flight) => flight.aircraftDayActualId !== id || flight.missionId !== missionId || flight.operatingDayId !== operatingDayId || flight.aircraftId !== aircraftId)
    || new Set(flights.map((flight) => flight.id)).size !== flights.length
    || new Set(flights.map((flight) => flight.flightIndex)).size !== flights.length
    || sumHours(flights.map((flight) => flight.durationHours)) !== flightsTotalHours) return malformed();
  const expectedStatus = declaredTotalHours === null
    ? 'FLIGHTS_ONLY'
    : flights.length === 0 ? 'TOTAL_ONLY' : declaredTotalHours === flightsTotalHours ? 'RECONCILED' : 'MISMATCH';
  if (source.reconciliationStatus !== expectedStatus
    || (declaredTotalHours === null && (source.totalSource !== 'DERIVED_FROM_FLIGHTS' || totalFlightHours !== flightsTotalHours || flights.length === 0))
    || (declaredTotalHours !== null && (source.totalSource !== 'DECLARED' || totalFlightHours !== declaredTotalHours))) return malformed();
  return {
    id,
    missionId,
    operatingDayId,
    packageRevisionId: uuid(source.packageRevisionId),
    aircraftId,
    missionAircraftAssignmentId: nullable(source.missionAircraftAssignmentId, uuid),
    declaredTotalHours,
    totalFlightHours,
    flightsTotalHours,
    totalSource: source.totalSource as MissionAircraftDayTotalSource,
    reconciliationStatus: source.reconciliationStatus as MissionAircraftDayReconciliationStatus,
    rowVersion: positiveInteger(source.rowVersion),
    signedOffAt,
    signedOffByInternalUserId,
    flights,
  };
}

export function decodeMissionAircraftDayActuals(value: unknown): MissionAircraftDayActualsRecord {
  const source = exact(object(value), [
    'missionId', 'operatingDayId', 'packageRevisionId', 'dayVersion', 'totalAircraftHours', 'readyForSignOff', 'actuals',
  ]);
  if (typeof source.readyForSignOff !== 'boolean' || !Array.isArray(source.actuals) || source.actuals.length > 50) return malformed();
  const missionId = uuid(source.missionId);
  const operatingDayId = uuid(source.operatingDayId);
  const packageRevisionId = uuid(source.packageRevisionId);
  const actuals = source.actuals.map(decodeMissionAircraftDayActual);
  const totalAircraftHours = hours(source.totalAircraftHours);
  if (actuals.some((actual) => actual.missionId !== missionId || actual.operatingDayId !== operatingDayId || actual.packageRevisionId !== packageRevisionId)
    || new Set(actuals.map((actual) => actual.id)).size !== actuals.length
    || new Set(actuals.map((actual) => actual.aircraftId)).size !== actuals.length
    || sumHours(actuals.map((actual) => actual.totalFlightHours)) !== totalAircraftHours
    || source.readyForSignOff !== (actuals.length > 0 && actuals.every((actual) => actual.reconciliationStatus !== 'MISMATCH'))) return malformed();
  return {
    missionId,
    operatingDayId,
    packageRevisionId,
    dayVersion: positiveInteger(source.dayVersion),
    totalAircraftHours,
    readyForSignOff: source.readyForSignOff,
    actuals,
  };
}

function decodeMissionDayChemicalProposal(value: unknown): MissionDayChemicalProposal {
  const source = exact(object(value), [
    'plannedLineId', 'platformProductId', 'platformProductVersionId', 'registerEntryId',
    'productName', 'rate', 'rateUnit', 'plannedQuantity', 'quantityUnit', 'productSnapshot',
  ]);
  const rateUnit = chemicalRateUnit(source.rateUnit);
  const quantityUnit = chemicalQuantityUnit(source.quantityUnit);
  if (quantityUnit !== quantityUnitForRate(rateUnit)) return malformed();
  return {
    plannedLineId: uuid(source.plannedLineId),
    platformProductId: nullable(source.platformProductId, uuid),
    platformProductVersionId: nullable(source.platformProductVersionId, uuid),
    registerEntryId: nullable(source.registerEntryId, uuid),
    productName: boundedText(source.productName, 500),
    rate: decimal6(source.rate),
    rateUnit,
    plannedQuantity: decimal6(source.plannedQuantity),
    quantityUnit,
    productSnapshot: jsonObject(source.productSnapshot),
  };
}

function decodeMissionDayChemicalActualLine(value: unknown): MissionDayChemicalActualLine {
  const source = exact(object(value), [
    'id', 'fieldId', 'plannedLineId', 'platformProductId', 'platformProductVersionId',
    'registerEntryId', 'productName', 'rate', 'rateUnit', 'appliedQuantity', 'quantityUnit',
    'batchLot', 'aircraftId', 'productSnapshot',
  ]);
  const rateUnit = chemicalRateUnit(source.rateUnit);
  const quantityUnit = chemicalQuantityUnit(source.quantityUnit);
  if (quantityUnit !== quantityUnitForRate(rateUnit)) return malformed();
  return {
    id: uuid(source.id),
    fieldId: uuid(source.fieldId),
    plannedLineId: nullable(source.plannedLineId, uuid),
    platformProductId: nullable(source.platformProductId, uuid),
    platformProductVersionId: nullable(source.platformProductVersionId, uuid),
    registerEntryId: nullable(source.registerEntryId, uuid),
    productName: boundedText(source.productName, 500),
    rate: decimal6(source.rate),
    rateUnit,
    appliedQuantity: decimal6(source.appliedQuantity),
    quantityUnit,
    batchLot: nullable(source.batchLot, (candidate) => boundedText(candidate, 200)),
    aircraftId: nullable(source.aircraftId, uuid),
    productSnapshot: jsonObject(source.productSnapshot),
  };
}

function chemicalRateUnit(value: unknown): 'L_HA' | 'ML_HA' | 'KG_HA' | 'G_HA' {
  if (value !== 'L_HA' && value !== 'ML_HA' && value !== 'KG_HA' && value !== 'G_HA') return malformed();
  return value;
}

function chemicalQuantityUnit(value: unknown): 'L' | 'ML' | 'KG' | 'G' {
  if (value !== 'L' && value !== 'ML' && value !== 'KG' && value !== 'G') return malformed();
  return value;
}

function quantityUnitForRate(value: 'L_HA' | 'ML_HA' | 'KG_HA' | 'G_HA'): 'L' | 'ML' | 'KG' | 'G' {
  return ({ L_HA: 'L', ML_HA: 'ML', KG_HA: 'KG', G_HA: 'G' } as const)[value];
}

function decodeMissionDayChemicalActualRevision(value: unknown): MissionDayChemicalActualRevision {
  const source = exact(object(value), [
    'id', 'missionId', 'operatingDayId', 'packageRevisionId', 'plannedChemicalRevisionId',
    'revisionNumber', 'confirmationState', 'changedFromPlan', 'materialVariance',
    'operationStartedAtConfirmation', 'notes', 'confirmedByInternalUserId', 'confirmedAt', 'lines',
  ]);
  if (source.confirmationState !== 'CONFIRMED' || !Array.isArray(source.lines)
    || source.lines.length < 1 || source.lines.length > 500) return malformed();
  return {
    id: uuid(source.id),
    missionId: uuid(source.missionId),
    operatingDayId: uuid(source.operatingDayId),
    packageRevisionId: uuid(source.packageRevisionId),
    plannedChemicalRevisionId: uuid(source.plannedChemicalRevisionId),
    revisionNumber: positiveInteger(source.revisionNumber),
    confirmationState: 'CONFIRMED',
    changedFromPlan: boolean(source.changedFromPlan),
    materialVariance: boolean(source.materialVariance),
    operationStartedAtConfirmation: nullable(source.operationStartedAtConfirmation, exactTimestamp),
    notes: nullable(source.notes, (candidate) => boundedText(candidate, 4000)),
    confirmedByInternalUserId: uuid(source.confirmedByInternalUserId),
    confirmedAt: exactTimestamp(source.confirmedAt),
    lines: source.lines.map(decodeMissionDayChemicalActualLine),
  };
}

export function decodeMissionDayChemicalActuals(value: unknown): MissionDayChemicalActualsRecord {
  const source = exact(object(value), [
    'missionId', 'operatingDayId', 'packageRevisionId', 'plannedChemicalRevisionId',
    'dayVersion', 'currentRevision', 'proposals', 'actual',
  ]);
  if (!Array.isArray(source.proposals) || source.proposals.length > 500) return malformed();
  const missionId = uuid(source.missionId);
  const operatingDayId = uuid(source.operatingDayId);
  const packageRevisionId = uuid(source.packageRevisionId);
  const plannedChemicalRevisionId = uuid(source.plannedChemicalRevisionId);
  const currentRevision = nonNegativeInteger(source.currentRevision);
  const proposals = source.proposals.map(decodeMissionDayChemicalProposal);
  const actual = nullable(source.actual, decodeMissionDayChemicalActualRevision);
  if ((actual === null) !== (currentRevision === 0)
    || (actual && (actual.missionId !== missionId || actual.operatingDayId !== operatingDayId
      || actual.packageRevisionId !== packageRevisionId || actual.plannedChemicalRevisionId !== plannedChemicalRevisionId
      || actual.revisionNumber !== currentRevision))
    || new Set(proposals.map((proposal) => proposal.plannedLineId)).size !== proposals.length
    || (actual && new Set(actual.lines.map((line) => line.id)).size !== actual.lines.length)) return malformed();
  return {
    missionId,
    operatingDayId,
    packageRevisionId,
    plannedChemicalRevisionId,
    dayVersion: positiveInteger(source.dayVersion),
    currentRevision,
    proposals,
    actual,
  };
}

function weatherCoverage(value: unknown): MissionDayWeatherCoverage {
  if (value !== 'ACTUAL_INTERVAL' && value !== 'FULL_DAY') return malformed();
  return value;
}

function weatherSource(value: unknown): MissionDayWeatherSource {
  if (value !== 'OPEN_METEO' && value !== 'MANUAL') return malformed();
  return value;
}

function decodeWeatherObservation(value: unknown): MissionDayWeatherHourlyObservation {
  const source = exact(object(value), [
    'observedAt', 'temperatureC', 'relativeHumidity', 'dewPointC', 'windSpeedKmh',
    'windDirectionDegrees', 'precipitationMm',
  ]);
  const observation = {
    observedAt: exactTimestamp(source.observedAt),
    temperatureC: finiteWithin(source.temperatureC, -100, 100),
    relativeHumidity: finiteWithin(source.relativeHumidity, 0, 100),
    dewPointC: finiteWithin(source.dewPointC, -150, 100),
    windSpeedKmh: finiteWithin(source.windSpeedKmh, 0, 500),
    windDirectionDegrees: finiteWithin(source.windDirectionDegrees, 0, 359.999999),
    precipitationMm: finiteWithin(source.precipitationMm, 0, 10000),
  };
  if (Object.entries(observation).every(([key, candidate]) => key === 'observedAt' || candidate === null)) return malformed();
  return observation;
}

function decodeWeatherGap(value: unknown): MissionDayWeatherCoverageGap {
  const source = exact(object(value), ['observedAt', 'reason']);
  return { observedAt: exactTimestamp(source.observedAt), reason: boundedText(source.reason, 1000) };
}

export function decodeMissionDayWeatherReport(value: unknown): MissionDayWeatherReportRecord | null {
  if (value === null) return null;
  const source = exact(object(value), [
    'id', 'missionId', 'operatingDayId', 'packageRevisionId', 'coverage', 'intervalStartAt',
    'intervalEndAt', 'timezone', 'source', 'sourceWeatherObservationId', 'latitude', 'longitude',
    'providerIdentifier', 'providerRetrievedAt', 'hourlyObservations', 'inversionInputs',
    'inversionResults', 'coverageGaps', 'sourceMetadata', 'manualReason', 'sourceDigest',
    'recordedByInternalUserId', 'createdAt',
  ]);
  if (!Array.isArray(source.hourlyObservations) || source.hourlyObservations.length < 1
    || source.hourlyObservations.length > 1000 || !Array.isArray(source.coverageGaps)
    || source.coverageGaps.length > 1000 || typeof source.latitude !== 'string'
    || typeof source.longitude !== 'string' || !SIGNED_DECIMAL6.test(source.latitude)
    || !SIGNED_DECIMAL6.test(source.longitude) || Number(source.latitude) < -90 || Number(source.latitude) > 90
    || Number(source.longitude) < -180 || Number(source.longitude) > 180) return malformed();
  const intervalStartAt = exactTimestamp(source.intervalStartAt);
  const intervalEndAt = exactTimestamp(source.intervalEndAt);
  const weather = weatherSource(source.source);
  const providerIdentifier = nullable(source.providerIdentifier, (candidate) => boundedText(candidate, 200));
  const providerRetrievedAt = nullable(source.providerRetrievedAt, exactTimestamp);
  const manualReason = nullable(source.manualReason, (candidate) => boundedText(candidate, 4000));
  if (Date.parse(intervalEndAt) <= Date.parse(intervalStartAt)
    || (weather === 'OPEN_METEO' && (!providerIdentifier || !providerRetrievedAt || manualReason !== null))
    || (weather === 'MANUAL' && (providerIdentifier !== null || providerRetrievedAt !== null || manualReason === null))) return malformed();
  const hourlyObservations = source.hourlyObservations.map(decodeWeatherObservation);
  const coverageGaps = source.coverageGaps.map(decodeWeatherGap);
  const start = Date.parse(intervalStartAt);
  const end = Date.parse(intervalEndAt);
  const hourMs = 60 * 60 * 1000;
  const expectedBuckets: number[] = [];
  for (let at = Math.ceil(start / hourMs) * hourMs; at < end; at += hourMs) expectedBuckets.push(at);
  const expected = new Set(expectedBuckets);
  const observations = hourlyObservations.map((entry) => Date.parse(entry.observedAt));
  const gaps = coverageGaps.map((gap) => Date.parse(gap.observedAt));
  const uniqueObservations = new Set(observations);
  const uniqueGaps = new Set(gaps);
  const covered = new Set([...observations, ...gaps]);
  if (!expected.size
    || observations.some((at) => at % hourMs !== 0 || !expected.has(at))
    || gaps.some((at) => at % hourMs !== 0 || !expected.has(at))
    || uniqueObservations.size !== observations.length
    || uniqueGaps.size !== gaps.length
    || observations.some((at) => uniqueGaps.has(at))
    || covered.size !== expected.size
    || expectedBuckets.some((at) => !covered.has(at))) return malformed();
  return {
    id: uuid(source.id),
    missionId: uuid(source.missionId),
    operatingDayId: uuid(source.operatingDayId),
    packageRevisionId: uuid(source.packageRevisionId),
    coverage: weatherCoverage(source.coverage),
    intervalStartAt,
    intervalEndAt,
    timezone: timezone(source.timezone),
    source: weather,
    sourceWeatherObservationId: uuid(source.sourceWeatherObservationId),
    latitude: source.latitude,
    longitude: source.longitude,
    providerIdentifier,
    providerRetrievedAt,
    hourlyObservations,
    inversionInputs: jsonObject(source.inversionInputs),
    inversionResults: jsonObject(source.inversionResults),
    coverageGaps,
    sourceMetadata: jsonObject(source.sourceMetadata),
    manualReason,
    sourceDigest: digest(source.sourceDigest),
    recordedByInternalUserId: uuid(source.recordedByInternalUserId),
    createdAt: exactTimestamp(source.createdAt),
  };
}

function decodeRequiredMissionDayWeatherReport(value: unknown): MissionDayWeatherReportRecord {
  const report = decodeMissionDayWeatherReport(value);
  if (!report) return malformed();
  return report;
}

export function decodeMissionFinalSignoffReadiness(value: unknown): MissionFinalSignoffReadiness {
  const source = exact(object(value), ['missionId', 'operationalWorkCompleted', 'finalSignedOff', 'readyForFinalSignoff', 'currentCompletionRevision', 'blockers']);
  if (!Array.isArray(source.blockers) || source.blockers.length > 100) return malformed();
  const blockers = source.blockers.map((candidate) => {
    const blocker = exact(object(candidate), ['code', 'message']);
    return { code: boundedText(blocker.code, 100), message: boundedText(blocker.message, 1000) };
  });
  const readiness = {
    missionId: uuid(source.missionId), operationalWorkCompleted: boolean(source.operationalWorkCompleted), finalSignedOff: boolean(source.finalSignedOff),
    readyForFinalSignoff: boolean(source.readyForFinalSignoff), currentCompletionRevision: nonNegativeInteger(source.currentCompletionRevision), blockers,
  };
  if (readiness.readyForFinalSignoff !== (readiness.blockers.length === 0 && !readiness.finalSignedOff)) return malformed();
  return readiness;
}

export function decodeMissionCompletionRevision(value: unknown): MissionCompletionRevision {
  const source = exact(object(value), ['id', 'missionId', 'versionNumber', 'dailyEvidenceDigest', 'completedAt']);
  return { id: uuid(source.id), missionId: uuid(source.missionId), versionNumber: positiveInteger(source.versionNumber),
    dailyEvidenceDigest: digest(source.dailyEvidenceDigest), completedAt: exactTimestamp(source.completedAt) };
}

export function decodeMissionJobCloseResult(value: unknown): MissionJobCloseResult {
  const source = exact(object(value), ['id', 'status', 'rowVersion']);
  if (source.status !== 'closed') return malformed();
  return { id: uuid(source.id), status: 'closed', rowVersion: positiveInteger(source.rowVersion) };
}

async function parseResponse(response: Response): Promise<unknown> {
  const envelope: any = await response.json().catch(() => ({}));
  const correlationId = response.headers.get('X-Correlation-ID') || envelope?.error?.correlationId || undefined;
  if (!response.ok) {
    const currentVersion = Number.isInteger(envelope?.error?.currentVersion) && envelope.error.currentVersion >= 0
      ? envelope.error.currentVersion : undefined;
    const currentDigest = typeof envelope?.error?.currentDigest === 'string' && SHA256.test(envelope.error.currentDigest)
      ? envelope.error.currentDigest : undefined;
    throw new MissionOperationsApiError(
      response.status,
      typeof envelope?.error?.code === 'string' ? envelope.error.code : 'MISSION_OPERATIONS_API_ERROR',
      typeof envelope?.error?.message === 'string' ? envelope.error.message : 'Mission Operations request failed.',
      correlationId,
      currentVersion,
      currentDigest,
    );
  }
  if (!envelope || !('data' in envelope)) return malformed();
  return envelope.data;
}

export function createMissionOperationsApi(fetcher: typeof fetch = fetch) {
  async function request(action: string, init: RequestInit, missionId?: string, dayId?: string): Promise<unknown> {
    const query = new URLSearchParams({ action });
    if (missionId) query.set('missionId', missionId);
    if (dayId) query.set('dayId', dayId);
    return parseResponse(await fetcher(`/api/v1/mission-operations?${query.toString()}`, {
      credentials: 'same-origin',
      ...init,
      headers: init.body ? { 'Content-Type': 'application/json', ...(init.headers || {}) } : init.headers,
    }));
  }
  function write(action: string, body: Record<string, unknown>) {
    return request(action, { method: 'POST', body: JSON.stringify(body) });
  }
  return {
    saveScope: async (missionId: string, expectedRevision: number, fieldIds: string[]) => decodeMissionPackageRevision(await write('scope', { missionId, expectedRevision, fieldIds })),
    submitForApproval: async (missionId: string, packageRevisionId: string, expectedRevision: number, evidenceDigest: string) => decodeMissionPackageRevision(await write('submit', { missionId, packageRevisionId, expectedRevision, evidenceDigest })),
    authorise: async (missionId: string, packageRevisionId: string, expectedRevision: number, evidenceDigest: string, declarationValue: string) => decodeCrpDecision(await write('authorise', { missionId, packageRevisionId, expectedRevision, evidenceDigest, declaration: declarationValue })),
    reject: async (missionId: string, packageRevisionId: string, expectedRevision: number, evidenceDigest: string, declarationValue: string) => decodeCrpDecision(await write('reject', { missionId, packageRevisionId, expectedRevision, evidenceDigest, declaration: declarationValue })),
    readPackageHistory: async (missionId: string) => decodeMissionPackageHistory(await request('history', { method: 'GET' }, missionId)),
    createDay: async (missionId: string, workDate: string, notes: string | null) => decodeMissionOperatingDay(await write('day-create', { missionId, workDate, notes })),
    reviewJsa: async (missionId: string, dayId: string, expectedVersion: number, outcome: MissionJsaDayReviewOutcome, notes: string | null) => decodeMissionOperatingDay(await write('day-jsa-review', { missionId, dayId, expectedVersion, outcome, notes })),
    startDay: async (missionId: string, dayId: string, expectedVersion: number, startedAt: string) => decodeMissionOperatingDay(await write('day-start', { missionId, dayId, expectedVersion, startedAt })),
    saveFieldActivity: async (missionId: string, dayId: string, activityId: string | null, expectedVersion: number, input: MissionFieldActivityInput) => decodeMissionOperatingDay(await write('field-activity-save', { missionId, dayId, activityId, expectedVersion, ...input })),
    completeDay: async (missionId: string, dayId: string, expectedVersion: number, finishedAt: string, notes: string | null) => decodeMissionOperatingDay(await write('day-complete', { missionId, dayId, expectedVersion, finishedAt, notes })),
    readDays: async (missionId: string) => decodeMissionOperatingDays(await request('days', { method: 'GET' }, missionId)),
    saveAircraftActuals: async (dayId: string, input: MissionAircraftDayActualsSaveInput) => decodeMissionAircraftDayActuals(await write('aircraft-actuals-save', { ...input, dayId })),
    readAircraftActuals: async (missionId: string, dayId: string) => decodeMissionAircraftDayActuals(await request('aircraft-actuals', { method: 'GET' }, missionId, dayId)),
    reconcileAircraftActuals: async (missionId: string, dayId: string) => decodeMissionAircraftDayActuals(await write('aircraft-actuals-reconcile', { missionId, dayId })),
    readChemicalActuals: async (missionId: string, dayId: string) => decodeMissionDayChemicalActuals(await request('chemical-actuals', { method: 'GET' }, missionId, dayId)),
    confirmChemicalActuals: async (dayId: string, input: MissionDayChemicalConfirmationInput) => decodeMissionDayChemicalActuals(await write('chemical-actuals-confirm', { ...input, dayId })),
    readWeatherReport: async (missionId: string, dayId: string) => decodeMissionDayWeatherReport(await request('day-weather', { method: 'GET' }, missionId, dayId)),
    captureWeather: async (dayId: string, input: MissionDayWeatherCaptureInput) => decodeRequiredMissionDayWeatherReport(await write('day-weather-capture', { ...input, dayId })),
    saveManualWeather: async (dayId: string, input: MissionDayWeatherManualInput) => decodeRequiredMissionDayWeatherReport(await write('day-weather-manual', { ...input, dayId })),
    readFinalSignoffReadiness: async (missionId: string) => decodeMissionFinalSignoffReadiness(await request('final-signoff-readiness', { method: 'GET' }, missionId)),
    finalSignoffMission: async (missionId: string, expectedRevision: number, declarationValue: string) => decodeMissionCompletionRevision(await write('final-signoff', { missionId, expectedRevision, declaration: declarationValue })),
    closeJob: async (jobId: string, expectedVersion: number) => decodeMissionJobCloseResult(await write('job-close', { jobId, expectedVersion })),
  };
}

export const missionOperationsApi = createMissionOperationsApi();
