const VALID_SCOPES = new Set(['ORGANISATION', 'MISSION', 'JOB', 'MODULE']);

function evaluateSupportAccess({ session, operation, organisationId, moduleCode, missionId, jobId, now = new Date().toISOString() }) {
  if (!session || session.organisationId !== organisationId) return { allowed: false, denialCode: 'SUPPORT_SESSION_NOT_FOUND' };
  if (session.state !== 'ACTIVE') return { allowed: false, denialCode: `SUPPORT_SESSION_${session.state || 'INVALID'}` };
  if (new Date(now).getTime() >= new Date(session.expiresAt).getTime()) return { allowed: false, denialCode: 'SUPPORT_SESSION_EXPIRED' };
  if (String(operation).toUpperCase() === 'WRITE' && session.accessMode === 'READ_ONLY') return { allowed: false, denialCode: 'SUPPORT_READ_ONLY' };
  if (!VALID_SCOPES.has(session.scopeType)) return { allowed: false, denialCode: 'SUPPORT_SCOPE_MISMATCH' };

  const scoped = session.scopeType === 'ORGANISATION'
    || (session.scopeType === 'MISSION' && session.missionId === missionId)
    || (session.scopeType === 'JOB' && session.jobId === jobId)
    || (session.scopeType === 'MODULE' && session.moduleCode === moduleCode);
  return scoped ? { allowed: true, denialCode: null } : { allowed: false, denialCode: 'SUPPORT_SCOPE_MISMATCH' };
}

module.exports = { evaluateSupportAccess, VALID_SCOPES };
