type ReadinessResponseEvidence = {
  status: number;
  body: unknown;
  requestId?: string | null;
  durationMs: number;
};

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue
    : null;
}

function safeText(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  return value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

export function gettingStartedReadinessDiagnostic(evidence: ReadinessResponseEvidence) {
  const body = record(evidence.body);
  const error = record(body?.error);
  return {
    status: Number.isInteger(evidence.status) ? evidence.status : 0,
    code: safeText(error?.code, 'UNKNOWN'),
    message: safeText(error?.message, 'Getting Started progress could not be loaded.'),
    correlationId: safeText(body?.correlationId ?? error?.correlationId, 'unavailable'),
    requestId: safeText(evidence.requestId, 'unavailable'),
    durationMs: Number.isFinite(evidence.durationMs) && evidence.durationMs >= 0
      ? Math.round(evidence.durationMs)
      : 0,
  };
}

export function validateGettingStartedReadiness(evidence: ReadinessResponseEvidence): RecordValue {
  const diagnostic = gettingStartedReadinessDiagnostic(evidence);
  if (evidence.status !== 200) {
    throw new Error(
      `ONBOARDING_GETTING_STARTED_FAILED status=${diagnostic.status} code=${diagnostic.code}`
      + ` message=${diagnostic.message} correlation=${diagnostic.correlationId}`
      + ` request=${diagnostic.requestId} durationMs=${diagnostic.durationMs}`,
    );
  }

  const body = record(evidence.body);
  const projection = record(body?.data);
  const organisation = record(projection?.organisation);
  if (!projection || !Array.isArray(projection.steps) || typeof organisation?.id !== 'string' || !organisation.id) {
    throw new Error(
      `ONBOARDING_GETTING_STARTED_RESPONSE_INVALID status=${diagnostic.status}`
      + ` request=${diagnostic.requestId} durationMs=${diagnostic.durationMs}`,
    );
  }
  return projection;
}
