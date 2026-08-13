const MAX_FIELD_LENGTH = 160;
const SAFE_CODE = /^[A-Z0-9_.-]+$/;
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]+$/;
const CONTROLLED_PREFIXES = [
  'COMMERCIAL_ONBOARDING_ACCEPTANCE_EVIDENCE_INVALID',
  'COMMERCIAL_ONBOARDING_ACCEPTANCE_PROVENANCE_MISMATCH',
  'COMMERCIAL_ONBOARDING_ACCEPTANCE_SCOPE_MISMATCH',
  'COMMERCIAL_ONBOARDING_ACCEPTANCE_TABLE_FORBIDDEN',
  'COMMERCIAL_ONBOARDING_ACCEPTANCE_VERSION_CONFLICT',
  'COMMERCIAL_ONBOARDING_ACCEPTANCE_OUTBOX_MISMATCH',
  'COMMERCIAL_ONBOARDING_ACCEPTANCE_LEGACY_STORE_MISMATCH',
];
const CONTROLLED_SUFFIXES = [
  'application', 'invitation', 'auth identity', 'forbidden identity', 'identity chain',
  'seat assignment', 'Base assignment', 'seat allocation', 'profile', 'membership',
  'Base', 'internal user', 'organisation', 'acceptance', 'legacyStore',
  'legacyStore row', 'legacyStore values', 'equipment_kit_aircraft_compatibility',
  'missions', 'jobs', 'fields', 'properties', 'clients', 'equipment_kits', 'aircraft',
  'role_permissions', 'permissions', 'roles', 'field_boundary_versions',
];
const SAFE_CONTROLLED_DIAGNOSTICS = new Set([
  ...CONTROLLED_PREFIXES,
  ...CONTROLLED_PREFIXES.flatMap((prefix) => CONTROLLED_SUFFIXES.map((suffix) => `${prefix}: ${suffix}`)),
]);

function boundedDiagnostic(value, kind) {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[\r\n\t]+/g, ' ').trim();
  if (!normalized) return null;
  const limit = kind === 'code' ? 64 : kind === 'requestId' ? 100 : MAX_FIELD_LENGTH;
  const allowed = kind === 'code'
    ? SAFE_CODE.test(normalized)
    : kind === 'requestId'
      ? SAFE_REQUEST_ID.test(normalized)
      : SAFE_CONTROLLED_DIAGNOSTICS.has(normalized);
  if (normalized.length > limit || !allowed) return '[redacted]';
  return normalized;
}

export function controlledOnboardingRestError({ path, status, body, headers }) {
  const endpoint = String(path || '').split('?')[0];
  const diagnostics = [];
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    for (const [label, value] of [
      ['code', body.code],
      ['message', body.message],
      ['detail', body.details ?? body.detail],
      ['hint', body.hint],
    ]) {
      const safe = boundedDiagnostic(value, label === 'code' ? 'code' : 'diagnostic');
      if (safe) diagnostics.push(`${label}=${safe}`);
    }
  }
  const requestId = boundedDiagnostic(
    headers?.get?.('x-request-id')
      ?? headers?.get?.('sb-request-id')
      ?? headers?.get?.('x-correlation-id'),
    'requestId',
  );
  if (requestId) diagnostics.push(`requestId=${requestId}`);
  const suffix = diagnostics.length ? ` ${diagnostics.join('; ')}.` : '';
  return new Error(`Controlled onboarding verification failed at ${endpoint} (${status}).${suffix}`);
}
