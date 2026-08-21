import type {
  ApplicableMaintenanceLifecycleState,
  AttachedMaintenancePresentationSummary,
  MaintenanceAuthorityScope,
  MaintenanceAuthorityType,
  MaintenanceBaselineType,
  MaintenanceCurrentAuthoritySource,
  MaintenanceDueProjection,
  MaintenanceDueResult,
  MaintenanceDueState,
  MaintenanceEvidence,
  MaintenanceMeterType,
  MaintenanceRequirementDueResult,
  MaintenanceRequirementKind,
  MaintenanceThresholdExplanation,
  MaintenanceThresholdResult,
  MaintenanceThresholdType,
} from '../../types/fleetMaintenance';

const DUE_STATES = ['CURRENT', 'DUE_SOON', 'DUE', 'OVERDUE', 'INSUFFICIENT_DATA'] as const;
const THRESHOLD_TYPES = ['CALENDAR', 'METER', 'CONDITION', 'ONE_TIME', 'COMPONENT'] as const;
const REQUIREMENT_KINDS = ['SERVICE', 'INSPECTION', 'REPLACEMENT', 'CALIBRATION', 'ONE_TIME', 'CONDITION_BASED'] as const;
const AUTHORITY_TYPES = ['MANUFACTURER', 'ORGANISATION_STANDARD', 'CONDITION_BASED'] as const;
const AUTHORITY_SCOPES = ['PLATFORM', 'ORGANISATION'] as const;
const LIFECYCLE_STATES = ['EFFECTIVE', 'SUPERSEDED'] as const;
const METER_TYPES = ['odometer', 'engine_hours', 'flight_hours', 'cycles', 'missions', 'area', 'custom'] as const;
const BASELINE_TYPES = ['PREVIOUS_COMPLETION', 'COMMISSIONING', 'METER', 'ONE_TIME'] as const;
const CURRENT_AUTHORITY_SOURCES = ['AUTHORITATIVE_METER', 'AIRCRAFT_COMPATIBILITY'] as const;

const REQUIREMENT_KEYS = new Set([
  'requirementId', 'requirementVersionId', 'requirementCode', 'requirementName', 'requirementKind',
  'authorityType', 'authorityScope', 'lifecycleState', 'effectiveFrom', 'effectiveTo', 'thresholdPolicy',
  'state', 'controllingThresholdId', 'thresholds', 'evidence', 'serviceKitVersionId',
]);
const THRESHOLD_KEYS = new Set([
  'thresholdId', 'sequenceNumber', 'thresholdType', 'meterType', 'unitCode', 'intervalValue',
  'dueSoonValue', 'baselineType', 'baselineValue', 'baselineDate', 'currentValue', 'currentRecordedAt',
  'currentAuthoritySource', 'dueValue', 'dueDate', 'remaining', 'state', 'baselineEvidence',
]);
const PROJECTION_KEYS = new Set(['assetId', 'asOf', 'timezone', 'requirements']);
const RESULT_KEYS = new Set(['assetId', 'asOf', 'timezone', 'requirements', 'attachedAssetSummaries']);
const ATTACHED_KEYS = new Set(['registryId', 'dueState']);
const FORBIDDEN_AUTHORITY_KEYS = new Set([
  'availability', 'operationalavailability', 'missionready', 'serviceability',
  'aircraftserviceability', 'fleetstatus',
]);

const PRESENTATION_RANK: Record<MaintenanceDueState, number> = {
  OVERDUE: 0,
  DUE: 1,
  DUE_SOON: 2,
  INSUFFICIENT_DATA: 3,
  CURRENT: 4,
};

export class MaintenanceDueContractError extends Error {
  constructor(readonly path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'MaintenanceDueContractError';
  }
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new MaintenanceDueContractError(path, 'expected an object');
  }
  return value as Record<string, unknown>;
}

function rejectForbiddenAuthorityFields(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectForbiddenAuthorityFields(item, `${path}[${index}]`));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
    const normalizedKey = key.replace(/[^a-z]/gi, '').toLowerCase();
    if (FORBIDDEN_AUTHORITY_KEYS.has(normalizedKey)) {
      throw new MaintenanceDueContractError(`${path}.${key}`, 'availability and serviceability authority is outside this contract');
    }
    rejectForbiddenAuthorityFields(item, `${path}.${key}`);
  });
}

function allowKeys(value: Record<string, unknown>, allowed: Set<string>, path: string): void {
  Object.keys(value).forEach((key) => {
    if (!allowed.has(key)) throw new MaintenanceDueContractError(`${path}.${key}`, 'unexpected projection field');
  });
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new MaintenanceDueContractError(path, 'expected a non-empty string');
  return value;
}

function nullableString(value: unknown, path: string): string | null {
  return value === null ? null : string(value, path);
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new MaintenanceDueContractError(path, 'expected a finite number');
  return value;
}

function nullableNumber(value: unknown, path: string): number | null {
  return value === null ? null : finiteNumber(value, path);
}

function positiveInteger(value: unknown, path: string): number {
  const parsed = finiteNumber(value, path);
  if (!Number.isInteger(parsed) || parsed < 1) throw new MaintenanceDueContractError(path, 'expected a positive integer');
  return parsed;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new MaintenanceDueContractError(path, `expected one of ${allowed.join(', ')}`);
  }
  return value as T;
}

function nullableEnumValue<T extends string>(value: unknown, allowed: readonly T[], path: string): T | null {
  return value === null ? null : enumValue(value, allowed, path);
}

function timestamp(value: unknown, path: string): string {
  const parsed = string(value, path);
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/.test(parsed) || Number.isNaN(Date.parse(parsed))) {
    throw new MaintenanceDueContractError(path, 'expected an ISO timestamp with an explicit UTC offset');
  }
  return parsed;
}

function nullableTimestamp(value: unknown, path: string): string | null {
  return value === null ? null : timestamp(value, path);
}

function date(value: unknown, path: string): string {
  const parsed = string(value, path);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(parsed);
  if (!match) {
    throw new MaintenanceDueContractError(path, 'expected an ISO calendar date');
  }
  const normalized = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).toISOString().slice(0, 10);
  if (normalized !== parsed) throw new MaintenanceDueContractError(path, 'expected an ISO calendar date');
  return parsed;
}

function nullableDate(value: unknown, path: string): string | null {
  return value === null ? null : date(value, path);
}

function evidence(value: unknown, path: string): MaintenanceEvidence {
  const parsed = record(value, path);
  if (Object.keys(parsed).length === 0) throw new MaintenanceDueContractError(path, 'expected non-empty authoritative evidence');
  return parsed;
}

function nullableEvidence(value: unknown, path: string): MaintenanceEvidence | null {
  return value === null ? null : evidence(value, path);
}

function timezone(value: unknown, path: string): string {
  const parsed = string(value, path);
  if (parsed !== 'UTC' && !parsed.includes('/')) throw new MaintenanceDueContractError(path, 'expected an IANA timezone');
  try {
    new Intl.DateTimeFormat('en-AU', { timeZone: parsed }).format(0);
  } catch {
    throw new MaintenanceDueContractError(path, 'expected an IANA timezone');
  }
  return parsed;
}

function dueState(value: unknown, path: string): MaintenanceDueState {
  return enumValue(value, DUE_STATES, path);
}

function requireBaselineMetadata(threshold: MaintenanceThresholdResult, path: string): void {
  if (threshold.baselineType === null) {
    throw new MaintenanceDueContractError(`${path}.baselineType`, 'projected baseline values require an authoritative baseline type');
  }
  if (threshold.baselineEvidence === null) {
    throw new MaintenanceDueContractError(`${path}.baselineEvidence`, 'projected baseline values require authoritative evidence');
  }
}

function rejectBaselineMetadataWithoutValue(threshold: MaintenanceThresholdResult, path: string, valueField: 'baselineValue' | 'baselineDate'): void {
  if (threshold.baselineType !== null || threshold.baselineEvidence !== null) {
    throw new MaintenanceDueContractError(`${path}.${valueField}`, 'baseline metadata cannot exist without its projected value');
  }
}

function validateThresholdEvidenceConsistency(threshold: MaintenanceThresholdResult, path: string): void {
  if (threshold.thresholdType === 'METER') {
    const hasBaseline = threshold.baselineValue !== null;
    const hasCurrent = threshold.currentValue !== null;
    if (hasBaseline) requireBaselineMetadata(threshold, path);
    else rejectBaselineMetadataWithoutValue(threshold, path, 'baselineValue');

    if (hasBaseline && hasCurrent) {
      if (threshold.dueValue === null) throw new MaintenanceDueContractError(`${path}.dueValue`, 'complete meter evidence requires the projected due value');
      if (threshold.remaining === null) throw new MaintenanceDueContractError(`${path}.remaining`, 'complete meter evidence requires the projected remaining value');
      if (threshold.state === 'INSUFFICIENT_DATA') throw new MaintenanceDueContractError(`${path}.state`, 'complete meter evidence cannot be insufficient');
    } else {
      if (threshold.dueValue !== null) throw new MaintenanceDueContractError(`${path}.dueValue`, 'incomplete meter evidence cannot have a projected due value');
      if (threshold.remaining !== null) throw new MaintenanceDueContractError(`${path}.remaining`, 'incomplete meter evidence cannot have a projected remaining value');
      if (threshold.state !== 'INSUFFICIENT_DATA') throw new MaintenanceDueContractError(`${path}.state`, 'incomplete meter evidence must be insufficient');
    }
    return;
  }

  if (threshold.thresholdType === 'CALENDAR' || threshold.thresholdType === 'ONE_TIME') {
    const hasBaseline = threshold.baselineDate !== null;
    if (hasBaseline) {
      requireBaselineMetadata(threshold, path);
      if (threshold.dueDate === null) throw new MaintenanceDueContractError(`${path}.dueDate`, 'calendar baseline evidence requires the projected due date');
      if (threshold.remaining === null) throw new MaintenanceDueContractError(`${path}.remaining`, 'calendar baseline evidence requires the projected remaining days');
      if (threshold.state === 'INSUFFICIENT_DATA') throw new MaintenanceDueContractError(`${path}.state`, 'complete calendar evidence cannot be insufficient');
    } else {
      rejectBaselineMetadataWithoutValue(threshold, path, 'baselineDate');
      if (threshold.dueDate !== null) throw new MaintenanceDueContractError(`${path}.dueDate`, 'missing calendar baseline evidence cannot have a projected due date');
      if (threshold.remaining !== null) throw new MaintenanceDueContractError(`${path}.remaining`, 'missing calendar baseline evidence cannot have projected remaining days');
      if (threshold.state !== 'INSUFFICIENT_DATA') throw new MaintenanceDueContractError(`${path}.state`, 'missing calendar baseline evidence must be insufficient');
    }
    return;
  }

  const laterEvidenceFields: Array<[keyof MaintenanceThresholdResult, unknown]> = [
    ['baselineType', threshold.baselineType],
    ['baselineValue', threshold.baselineValue],
    ['baselineDate', threshold.baselineDate],
    ['baselineEvidence', threshold.baselineEvidence],
    ['currentValue', threshold.currentValue],
    ['currentRecordedAt', threshold.currentRecordedAt],
    ['currentAuthoritySource', threshold.currentAuthoritySource],
    ['dueValue', threshold.dueValue],
    ['dueDate', threshold.dueDate],
    ['remaining', threshold.remaining],
  ];
  const unexpected = laterEvidenceFields.find(([, value]) => value !== null);
  if (unexpected) throw new MaintenanceDueContractError(`${path}.${unexpected[0]}`, 'later-slice evidence cannot appear in this projection');
}

function projectedRequirementState(thresholds: readonly MaintenanceThresholdResult[]): MaintenanceDueState {
  if (thresholds.some((threshold) => threshold.state === 'OVERDUE')) return 'OVERDUE';
  if (thresholds.some((threshold) => threshold.state === 'DUE')) return 'DUE';
  if (thresholds.some((threshold) => threshold.state === 'INSUFFICIENT_DATA')) return 'INSUFFICIENT_DATA';
  if (thresholds.some((threshold) => threshold.state === 'DUE_SOON')) return 'DUE_SOON';
  return 'CURRENT';
}

function projectedControllingThreshold(thresholds: readonly MaintenanceThresholdResult[]): MaintenanceThresholdResult {
  return [...thresholds].sort((left, right) => {
    if (left.remaining === null && right.remaining !== null) return 1;
    if (left.remaining !== null && right.remaining === null) return -1;
    if (left.remaining !== null && right.remaining !== null && left.remaining !== right.remaining) return left.remaining - right.remaining;
    return left.sequenceNumber - right.sequenceNumber;
  })[0];
}

function validateMeterUnit(meterType: MaintenanceMeterType, unitCode: string, path: string): void {
  const unit = unitCode.toLowerCase();
  const compatible = (meterType === 'odometer' && ['km', 'mi'].includes(unit))
    || (['engine_hours', 'flight_hours'].includes(meterType) && ['h', 'hr', 'hours'].includes(unit))
    || (meterType === 'cycles' && ['cycle', 'cycles'].includes(unit))
    || (meterType === 'missions' && ['mission', 'missions'].includes(unit))
    || (meterType === 'area' && ['ha', 'acre', 'acres', 'm2', 'km2'].includes(unit))
    || meterType === 'custom';
  if (!compatible) throw new MaintenanceDueContractError(`${path}.unitCode`, 'unit is not compatible with the projected meter type');
}

function parseThreshold(value: unknown, path: string): MaintenanceThresholdResult {
  const source = record(value, path);
  allowKeys(source, THRESHOLD_KEYS, path);
  const parsed: MaintenanceThresholdResult = {
    thresholdId: string(source.thresholdId, `${path}.thresholdId`),
    sequenceNumber: positiveInteger(source.sequenceNumber, `${path}.sequenceNumber`),
    thresholdType: enumValue(source.thresholdType, THRESHOLD_TYPES, `${path}.thresholdType`) as MaintenanceThresholdType,
    meterType: nullableEnumValue(source.meterType, METER_TYPES, `${path}.meterType`) as MaintenanceMeterType | null,
    unitCode: nullableString(source.unitCode, `${path}.unitCode`),
    intervalValue: nullableNumber(source.intervalValue, `${path}.intervalValue`),
    dueSoonValue: nullableNumber(source.dueSoonValue, `${path}.dueSoonValue`),
    baselineType: nullableEnumValue(source.baselineType, BASELINE_TYPES, `${path}.baselineType`) as MaintenanceBaselineType | null,
    baselineValue: nullableNumber(source.baselineValue, `${path}.baselineValue`),
    baselineDate: nullableDate(source.baselineDate, `${path}.baselineDate`),
    currentValue: nullableNumber(source.currentValue, `${path}.currentValue`),
    currentRecordedAt: nullableTimestamp(source.currentRecordedAt, `${path}.currentRecordedAt`),
    currentAuthoritySource: nullableEnumValue(source.currentAuthoritySource, CURRENT_AUTHORITY_SOURCES, `${path}.currentAuthoritySource`) as MaintenanceCurrentAuthoritySource | null,
    dueValue: nullableNumber(source.dueValue, `${path}.dueValue`),
    dueDate: nullableDate(source.dueDate, `${path}.dueDate`),
    remaining: nullableNumber(source.remaining, `${path}.remaining`),
    state: dueState(source.state, `${path}.state`),
    baselineEvidence: nullableEvidence(source.baselineEvidence, `${path}.baselineEvidence`),
  };

  if (parsed.intervalValue !== null && parsed.intervalValue <= 0) {
    throw new MaintenanceDueContractError(`${path}.intervalValue`, 'projected intervals must be positive');
  }
  if (parsed.dueSoonValue !== null && parsed.dueSoonValue < 0) {
    throw new MaintenanceDueContractError(`${path}.dueSoonValue`, 'projected warning windows must be nonnegative');
  }

  const meterEvidenceMissing = parsed.thresholdType === 'METER' && (parsed.baselineValue === null || parsed.currentValue === null);
  const calendarEvidenceMissing = parsed.thresholdType === 'CALENDAR' && parsed.baselineDate === null;
  const oneTimeEvidenceMissing = parsed.thresholdType === 'ONE_TIME' && parsed.baselineDate === null;
  const laterEvidenceSource = parsed.thresholdType === 'CONDITION' || parsed.thresholdType === 'COMPONENT';
  if ((meterEvidenceMissing || calendarEvidenceMissing || oneTimeEvidenceMissing || laterEvidenceSource) && parsed.state !== 'INSUFFICIENT_DATA') {
    throw new MaintenanceDueContractError(`${path}.state`, 'missing authoritative evidence must be INSUFFICIENT_DATA');
  }
  if (parsed.state === 'INSUFFICIENT_DATA' && parsed.remaining !== null) {
    throw new MaintenanceDueContractError(`${path}.remaining`, 'insufficient evidence cannot have a remaining value');
  }
  const currentEvidenceFields = [parsed.currentValue, parsed.currentRecordedAt, parsed.currentAuthoritySource];
  if (currentEvidenceFields.some((item) => item !== null) && currentEvidenceFields.some((item) => item === null)) {
    const missingField = parsed.currentValue === null
      ? 'currentValue'
      : parsed.currentRecordedAt === null ? 'currentRecordedAt' : 'currentAuthoritySource';
    throw new MaintenanceDueContractError(`${path}.${missingField}`, 'authoritative current-meter evidence must be complete');
  }
  if (parsed.thresholdType === 'METER') {
    if (parsed.meterType === null) throw new MaintenanceDueContractError(`${path}.meterType`, 'meter thresholds require a meter type');
    if (parsed.unitCode === null) throw new MaintenanceDueContractError(`${path}.unitCode`, 'meter thresholds require a unit');
    if (parsed.intervalValue === null) throw new MaintenanceDueContractError(`${path}.intervalValue`, 'meter thresholds require an interval');
    if (parsed.baselineDate !== null) throw new MaintenanceDueContractError(`${path}.baselineDate`, 'meter thresholds use numeric baselines');
    if (parsed.dueDate !== null) throw new MaintenanceDueContractError(`${path}.dueDate`, 'meter thresholds cannot carry calendar due evidence');
    if (parsed.dueSoonValue !== null && parsed.dueSoonValue >= parsed.intervalValue) {
      throw new MaintenanceDueContractError(`${path}.dueSoonValue`, 'meter warning windows must be smaller than the interval');
    }
    validateMeterUnit(parsed.meterType, parsed.unitCode, path);
  } else if (parsed.thresholdType === 'CALENDAR') {
    if (parsed.meterType !== null) throw new MaintenanceDueContractError(`${path}.meterType`, 'calendar thresholds do not use a meter');
    if (!['DAY', 'WEEK', 'MONTH', 'YEAR'].includes(parsed.unitCode ?? '')) throw new MaintenanceDueContractError(`${path}.unitCode`, 'calendar thresholds require a governed interval unit');
    if (parsed.intervalValue === null) throw new MaintenanceDueContractError(`${path}.intervalValue`, 'calendar thresholds require an interval');
    if (parsed.baselineValue !== null) throw new MaintenanceDueContractError(`${path}.baselineValue`, 'calendar thresholds use date baselines');
    if (parsed.currentValue !== null) throw new MaintenanceDueContractError(`${path}.currentValue`, 'calendar thresholds cannot carry current meter evidence');
    if (parsed.currentRecordedAt !== null) throw new MaintenanceDueContractError(`${path}.currentRecordedAt`, 'calendar thresholds cannot carry current meter evidence');
    if (parsed.currentAuthoritySource !== null) throw new MaintenanceDueContractError(`${path}.currentAuthoritySource`, 'calendar thresholds cannot carry current meter evidence');
    if (parsed.dueValue !== null) throw new MaintenanceDueContractError(`${path}.dueValue`, 'calendar thresholds cannot carry meter due evidence');
  } else if (parsed.thresholdType === 'ONE_TIME') {
    if (parsed.meterType !== null) throw new MaintenanceDueContractError(`${path}.meterType`, 'one-time thresholds do not use a meter');
    if (parsed.unitCode !== null) throw new MaintenanceDueContractError(`${path}.unitCode`, 'one-time thresholds do not have a recurrence unit');
    if (parsed.intervalValue !== null || parsed.dueSoonValue !== null) throw new MaintenanceDueContractError(`${path}.intervalValue`, 'one-time thresholds do not recur');
    if (parsed.baselineValue !== null) throw new MaintenanceDueContractError(`${path}.baselineValue`, 'one-time thresholds use date baselines');
    if (parsed.currentValue !== null) throw new MaintenanceDueContractError(`${path}.currentValue`, 'one-time thresholds cannot carry current meter evidence');
    if (parsed.currentRecordedAt !== null) throw new MaintenanceDueContractError(`${path}.currentRecordedAt`, 'one-time thresholds cannot carry current meter evidence');
    if (parsed.currentAuthoritySource !== null) throw new MaintenanceDueContractError(`${path}.currentAuthoritySource`, 'one-time thresholds cannot carry current meter evidence');
    if (parsed.dueValue !== null) throw new MaintenanceDueContractError(`${path}.dueValue`, 'one-time thresholds cannot carry meter due evidence');
  } else if (parsed.thresholdType === 'CONDITION') {
    if (parsed.meterType !== null || parsed.unitCode !== null || parsed.intervalValue !== null || parsed.dueSoonValue !== null) {
      throw new MaintenanceDueContractError(`${path}.meterType`, 'condition thresholds require later authoritative condition evidence');
    }
  } else if (parsed.thresholdType === 'COMPONENT') {
    if (parsed.meterType !== null) throw new MaintenanceDueContractError(`${path}.meterType`, 'component thresholds do not use an asset meter yet');
    if (parsed.unitCode === null || parsed.intervalValue === null) throw new MaintenanceDueContractError(`${path}.intervalValue`, 'component threshold foundation requires an interval and unit');
  }
  validateThresholdEvidenceConsistency(parsed, path);
  return parsed;
}

function parseRequirement(value: unknown, path: string): MaintenanceRequirementDueResult {
  const source = record(value, path);
  allowKeys(source, REQUIREMENT_KEYS, path);
  if (!Array.isArray(source.thresholds) || source.thresholds.length === 0) {
    throw new MaintenanceDueContractError(`${path}.thresholds`, 'expected at least one projected threshold');
  }
  const thresholds = source.thresholds.map((item, index) => parseThreshold(item, `${path}.thresholds[${index}]`));
  const thresholdIds = new Set(thresholds.map((item) => item.thresholdId));
  if (thresholdIds.size !== thresholds.length) {
    throw new MaintenanceDueContractError(`${path}.thresholds.thresholdId`, 'projected threshold IDs must be unique');
  }
  const sequenceNumbers = new Set(thresholds.map((item) => item.sequenceNumber));
  if (sequenceNumbers.size !== thresholds.length) {
    throw new MaintenanceDueContractError(`${path}.thresholds.sequenceNumber`, 'projected threshold sequence numbers must be unique');
  }
  const controllingThresholdId = string(source.controllingThresholdId, `${path}.controllingThresholdId`);
  if (!thresholds.some((item) => item.thresholdId === controllingThresholdId)) {
    throw new MaintenanceDueContractError(`${path}.controllingThresholdId`, 'does not identify a projected threshold');
  }
  if (source.thresholdPolicy !== 'ANY') {
    throw new MaintenanceDueContractError(`${path}.thresholdPolicy`, 'only explicit ANY is governed');
  }
  const state = dueState(source.state, `${path}.state`);
  const expectedState = projectedRequirementState(thresholds);
  if (state !== expectedState) {
    throw new MaintenanceDueContractError(`${path}.state`, `does not match the authoritative ANY threshold state ${expectedState}`);
  }
  const expectedController = projectedControllingThreshold(thresholds);
  if (controllingThresholdId !== expectedController.thresholdId) {
    throw new MaintenanceDueContractError(`${path}.controllingThresholdId`, 'does not match the authoritative threshold ordering');
  }
  const lifecycleState = enumValue(source.lifecycleState, LIFECYCLE_STATES, `${path}.lifecycleState`) as ApplicableMaintenanceLifecycleState;
  const effectiveTo = nullableTimestamp(source.effectiveTo, `${path}.effectiveTo`);
  if (lifecycleState === 'SUPERSEDED' && effectiveTo === null) {
    throw new MaintenanceDueContractError(`${path}.effectiveTo`, 'a superseded projection needs its historical interval end');
  }
  const authorityType = enumValue(source.authorityType, AUTHORITY_TYPES, `${path}.authorityType`) as MaintenanceAuthorityType;
  const authorityScope = enumValue(source.authorityScope, AUTHORITY_SCOPES, `${path}.authorityScope`) as MaintenanceAuthorityScope;
  if (authorityType === 'MANUFACTURER' && authorityScope !== 'PLATFORM') {
    throw new MaintenanceDueContractError(`${path}.authorityScope`, 'manufacturer requirements require Platform authority');
  }
  if (authorityType === 'ORGANISATION_STANDARD' && authorityScope !== 'ORGANISATION') {
    throw new MaintenanceDueContractError(`${path}.authorityScope`, 'organisation standards require organisation authority');
  }
  return {
    requirementId: string(source.requirementId, `${path}.requirementId`),
    requirementVersionId: string(source.requirementVersionId, `${path}.requirementVersionId`),
    requirementCode: string(source.requirementCode, `${path}.requirementCode`),
    requirementName: string(source.requirementName, `${path}.requirementName`),
    requirementKind: enumValue(source.requirementKind, REQUIREMENT_KINDS, `${path}.requirementKind`) as MaintenanceRequirementKind,
    authorityType,
    authorityScope,
    lifecycleState,
    effectiveFrom: timestamp(source.effectiveFrom, `${path}.effectiveFrom`),
    effectiveTo,
    thresholdPolicy: 'ANY',
    state,
    controllingThresholdId,
    thresholds,
    evidence: evidence(source.evidence, `${path}.evidence`),
    serviceKitVersionId: nullableString(source.serviceKitVersionId, `${path}.serviceKitVersionId`),
  };
}

function parseProjection(value: unknown, path: string): MaintenanceDueProjection {
  const source = record(value, path);
  allowKeys(source, PROJECTION_KEYS, path);
  if (!Array.isArray(source.requirements)) throw new MaintenanceDueContractError(`${path}.requirements`, 'expected an array');
  const asOf = timestamp(source.asOf, `${path}.asOf`);
  const requirements = source.requirements.map((item, index) => parseRequirement(item, `${path}.requirements[${index}]`));
  const asOfTime = Date.parse(asOf);
  requirements.forEach((requirement, index) => {
    if (Date.parse(requirement.effectiveFrom) > asOfTime
      || (requirement.effectiveTo !== null && Date.parse(requirement.effectiveTo) <= asOfTime)) {
      throw new MaintenanceDueContractError(`${path}.requirements[${index}].effectiveFrom`, 'requirement is outside its effective interval at asOf');
    }
  });
  return {
    assetId: string(source.assetId, `${path}.assetId`),
    asOf,
    timezone: timezone(source.timezone, `${path}.timezone`),
    requirements,
  };
}

export function normalizeMaintenanceDueResult(value: unknown): MaintenanceDueResult {
  rejectForbiddenAuthorityFields(value, '$');
  const source = record(value, '$');
  allowKeys(source, RESULT_KEYS, '$');
  if (!Array.isArray(source.attachedAssetSummaries)) {
    throw new MaintenanceDueContractError('$.attachedAssetSummaries', 'expected an array');
  }
  const projection = parseProjection({
    assetId: source.assetId,
    asOf: source.asOf,
    timezone: source.timezone,
    requirements: source.requirements,
  }, '$');
  return {
    ...projection,
    attachedAssetSummaries: source.attachedAssetSummaries.map((value, index) => {
      const path = `$.attachedAssetSummaries[${index}]`;
      const attached = record(value, path);
      allowKeys(attached, ATTACHED_KEYS, path);
      const dueStateProjection = parseProjection(attached.dueState, `${path}.dueState`);
      const registryId = string(attached.registryId, `${path}.registryId`);
      if (dueStateProjection.assetId !== registryId) {
        throw new MaintenanceDueContractError(`${path}.registryId`, 'must match the attached due-state assetId');
      }
      if (Date.parse(dueStateProjection.asOf) !== Date.parse(projection.asOf)) {
        throw new MaintenanceDueContractError(`${path}.dueState.asOf`, 'must match the parent projection asOf');
      }
      return { registryId, dueState: dueStateProjection };
    }),
  };
}

export function getControllingMaintenanceThreshold(requirement: MaintenanceRequirementDueResult): MaintenanceThresholdResult {
  const threshold = requirement.thresholds.find((item) => item.thresholdId === requirement.controllingThresholdId);
  if (!threshold) throw new MaintenanceDueContractError('controllingThresholdId', 'does not identify a projected threshold');
  return threshold;
}

export function explainMaintenanceThreshold(threshold: MaintenanceThresholdResult): MaintenanceThresholdExplanation {
  const hasBaseline = threshold.baselineType !== null || threshold.baselineValue !== null || threshold.baselineDate !== null || threshold.baselineEvidence !== null;
  const hasCurrent = threshold.currentValue !== null || threshold.currentRecordedAt !== null || threshold.currentAuthoritySource !== null;
  const hasDue = threshold.dueValue !== null || threshold.dueDate !== null;
  const projectedValueUnit = threshold.thresholdType === 'CALENDAR' || threshold.thresholdType === 'ONE_TIME'
    ? 'DAY'
    : threshold.unitCode;
  return {
    thresholdId: threshold.thresholdId,
    thresholdType: threshold.thresholdType,
    state: threshold.state,
    interval: threshold.intervalValue === null ? null : { value: threshold.intervalValue, unitCode: threshold.unitCode },
    baseline: hasBaseline ? {
      type: threshold.baselineType,
      value: threshold.baselineValue,
      date: threshold.baselineDate,
      evidence: threshold.baselineEvidence,
    } : null,
    current: hasCurrent ? {
      value: threshold.currentValue,
      recordedAt: threshold.currentRecordedAt,
      authoritySource: threshold.currentAuthoritySource,
    } : null,
    due: hasDue ? { value: threshold.dueValue, date: threshold.dueDate } : null,
    remaining: threshold.remaining === null ? null : { value: threshold.remaining, unitCode: projectedValueUnit },
    dueSoonRule: threshold.dueSoonValue === null ? null : { value: threshold.dueSoonValue, unitCode: projectedValueUnit },
  };
}

export function rankMaintenanceRequirements(requirements: readonly MaintenanceRequirementDueResult[]): MaintenanceRequirementDueResult[] {
  return [...requirements].sort((left, right) =>
    PRESENTATION_RANK[left.state] - PRESENTATION_RANK[right.state]
    || left.requirementCode.localeCompare(right.requirementCode));
}

export function summarizeAttachedMaintenance(result: MaintenanceDueResult): AttachedMaintenancePresentationSummary {
  const assets = result.attachedAssetSummaries.map(({ registryId, dueState }) => {
    const ranked = rankMaintenanceRequirements(dueState.requirements);
    const attentionRequirementCount = dueState.requirements.filter((item) => item.state !== 'CURRENT').length;
    return {
      registryId,
      requirementCount: dueState.requirements.length,
      attentionRequirementCount,
      highestState: ranked[0]?.state ?? null,
    };
  });
  return {
    requiresAttention: assets.some((asset) => asset.attentionRequirementCount > 0),
    assets,
  };
}
