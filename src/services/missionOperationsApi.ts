import type {
  CrpDecision,
  MissionPackageHistory,
  MissionPackageRevision,
  MissionPackageState,
} from '../types/missionOperations';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const STATES: readonly MissionPackageState[] = ['PREPARING', 'AWAITING_CRP_APPROVAL', 'AUTHORISED', 'REJECTED'];
const DECISIONS = ['AUTHORISED', 'REJECTED'] as const;

export class MissionOperationsApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly correlationId?: string,
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

function isoTimestamp(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) return malformed();
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
  const source = exact(object(value), ['missionId', 'packages', 'decisions']);
  if (!Array.isArray(source.packages) || source.packages.length > 100 || !Array.isArray(source.decisions) || source.decisions.length > 100) return malformed();
  const missionId = uuid(source.missionId);
  const packages = source.packages.map(decodeMissionPackageRevision);
  const decisions = source.decisions.map(decodeCrpDecision);
  const packageIds = new Set(packages.map((revision) => revision.id));
  if (packages.some((revision) => revision.missionId !== missionId)
    || new Set(packages.map((revision) => revision.id)).size !== packages.length
    || new Set(packages.map((revision) => revision.revisionNumber)).size !== packages.length
    || new Set(decisions.map((entry) => entry.packageRevisionId)).size !== decisions.length
    || decisions.some((entry) => !packageIds.has(entry.packageRevisionId))) return malformed();
  return { missionId, packages, decisions };
}

async function parseResponse(response: Response): Promise<unknown> {
  const envelope: any = await response.json().catch(() => ({}));
  const correlationId = response.headers.get('X-Correlation-ID') || envelope?.error?.correlationId || undefined;
  if (!response.ok) {
    throw new MissionOperationsApiError(
      response.status,
      typeof envelope?.error?.code === 'string' ? envelope.error.code : 'MISSION_OPERATIONS_API_ERROR',
      typeof envelope?.error?.message === 'string' ? envelope.error.message : 'Mission Operations request failed.',
      correlationId,
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
  };
}

export const missionOperationsApi = createMissionOperationsApi();
