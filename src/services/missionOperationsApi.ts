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

function declaration(value: unknown): string {
  if (typeof value !== 'string' || value.trim() !== value || value.length < 1 || value.length > 2000
    || value.split('').some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return malformed();
  return value;
}

function digest(value: unknown): string {
  if (typeof value !== 'string' || !SHA256.test(value)) return malformed();
  return value;
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
  async function request(action: string, init: RequestInit, missionId?: string): Promise<unknown> {
    const query = new URLSearchParams({ action });
    if (missionId) query.set('missionId', missionId);
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
  };
}

export const missionOperationsApi = createMissionOperationsApi();
