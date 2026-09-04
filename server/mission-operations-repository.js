const { supabaseRequest } = require('./supabase');

function failure(result) {
  if (!result || typeof result !== 'object') return null;
  if (result.error) return {
    error: result.error,
    currentVersion: result.current_version,
    currentDigest: result.current_digest,
  };
  if (result.forbidden) return { forbidden: true };
  if (result.location_forbidden) return { locationForbidden: true };
  if (result.readiness_blocked) return { readinessBlocked: true, readiness: result.readiness };
  return null;
}

function packageRevision(result) {
  const failed = failure(result);
  if (failed) return failed;
  const record = result?.record || result;
  return {
    id: record.id,
    missionId: record.mission_id,
    revisionNumber: record.version_number,
    fieldIds: result?.field_ids || record.field_ids,
    jsaRevisionId: record.jsa_revision_id,
    evidenceDigest: record.evidence_digest,
    state: result?.effective_state || record.state || record.package_state,
    createdAt: record.generated_at || record.created_at,
  };
}

function crpDecision(result) {
  const failed = failure(result);
  if (failed) return failed;
  const record = result?.record || result;
  return {
    id: record.id,
    packageRevisionId: record.mission_pack_revision_id || record.package_revision_id,
    decision: record.decision,
    decidedByInternalUserId: record.authorised_by_internal_user_id || record.decided_by_internal_user_id,
    decidedAt: record.authorised_at || record.decided_at,
    declaration: record.declaration,
  };
}

class MissionOperationsRepository {
  constructor(request = supabaseRequest) { this.request = request; }

  rpc(name, body, publicMessage) {
    return this.request(`rest/v1/rpc/${name}`, { method: 'POST', body: JSON.stringify(body), publicMessage });
  }

  trusted(context) {
    return {
      p_organisation_id: context.organisation.id,
      p_actor_internal_user_id: context.internalUser.id,
    };
  }

  async saveScope(context, { missionId, expectedRevision, fieldIds }) {
    return packageRevision(await this.rpc('ftf_save_mission_package_scope', {
      ...this.trusted(context),
      p_mission_id: missionId,
      p_expected_revision: expectedRevision,
      p_field_ids: fieldIds,
    }, 'Mission package scope could not be saved.'));
  }

  async submitForApproval(context, { missionId, packageRevisionId, expectedRevision, evidenceDigest }) {
    return packageRevision(await this.rpc('ftf_submit_mission_package', {
      ...this.trusted(context),
      p_mission_id: missionId,
      p_package_revision_id: packageRevisionId,
      p_expected_revision: expectedRevision,
      p_evidence_digest: evidenceDigest,
    }, 'Mission package could not be submitted.'));
  }

  async decide(context, { missionId, packageRevisionId, expectedRevision, evidenceDigest, decision, declaration }) {
    return crpDecision(await this.rpc('ftf_decide_mission_package', {
      ...this.trusted(context),
      p_mission_id: missionId,
      p_package_revision_id: packageRevisionId,
      p_expected_revision: expectedRevision,
      p_evidence_digest: evidenceDigest,
      p_decision: decision,
      p_declaration: declaration,
    }, 'Mission package decision could not be recorded.'));
  }

  async readPackageHistory(context, missionId) {
    const result = await this.rpc('ftf_read_mission_package_history', {
      ...this.trusted(context),
      p_mission_id: missionId,
    }, 'Mission package history could not be loaded.');
    const failed = failure(result);
    if (failed) return failed;
    return {
      missionId: result.mission_id,
      currentRevision: result.current_revision,
      packages: (result.packages || []).map((record) => packageRevision(record)),
      decisions: (result.decisions || []).map((record) => crpDecision(record)),
    };
  }
}

module.exports = { MissionOperationsRepository };
