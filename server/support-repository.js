const { supabaseRequest } = require('./supabase');

function first(result) { return Array.isArray(result) ? result[0] : result; }
async function rpc(name, body) {
  return first(await supabaseRequest(`rest/v1/rpc/${name}`, { method: 'POST', body: JSON.stringify(body), publicMessage: 'Assisted Support request failed.' }));
}

class SupportRepository {
  createRequest(context, body) { return rpc('create_support_request', { p_organisation_id: context.organisation.id, p_requester_internal_user_id: context.internalUser.id, p_reason: body.reason, p_access_mode: body.accessMode, p_scope_type: body.scopeType, p_mission_id: body.missionId || null, p_job_id: body.jobId || null, p_module_code: body.moduleCode || null, p_duration_minutes: body.durationMinutes || 120 }); }
  decideRequest(context, body) { return rpc('decide_support_request', { p_organisation_id: context.organisation.id, p_approver_internal_user_id: context.internalUser.id, p_request_id: body.requestId, p_expected_version: body.expectedVersion, p_decision: body.decision, p_notes: body.notes || null }); }
  startSession(platformUserId, requestId) { return rpc('start_support_session', { p_platform_user_id: platformUserId, p_request_id: requestId }); }
  revokeSession(context, body) { return rpc('revoke_support_session', { p_organisation_id: context.organisation.id, p_actor_internal_user_id: context.internalUser.id, p_session_id: body.sessionId, p_expected_version: body.expectedVersion, p_reason: body.reason }); }
  async listOrganisation(context) {
    return supabaseRequest(`rest/v1/support_requests?organisation_id=eq.${encodeURIComponent(context.organisation.id)}&select=*,support_approval_events(*),support_sessions(*)&order=requested_at.desc`, { publicMessage: 'Support requests could not be loaded.' });
  }
  async listPlatform() {
    return supabaseRequest('rest/v1/support_requests?state=in.(PENDING,APPROVED)&select=*,organisations(name),support_approval_events(*),support_sessions(*)&order=requested_at.desc', { publicMessage: 'Platform support queue could not be loaded.' });
  }
}

module.exports = { SupportRepository };
