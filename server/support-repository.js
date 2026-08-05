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
  async resolveSession(sessionId,platformUserId){
    const select='id,organisation_id,platform_user_id,access_mode,scope_type,mission_id,job_id,module_code,reason,state,started_at,expires_at,support_requests(support_approval_events(approved_by_internal_user_id,decision,approval_timestamp),organisations(name))';
    const rows=await supabaseRequest(`rest/v1/support_sessions?id=eq.${encodeURIComponent(sessionId)}&platform_user_id=eq.${encodeURIComponent(platformUserId)}&select=${encodeURIComponent(select)}&limit=1`,{publicMessage:'Delegated Support Session could not be loaded.'});const row=rows?.[0];if(!row)return null;const approvals=row.support_requests?.support_approval_events||[],approval=approvals.filter(x=>x.decision==='APPROVE').sort((a,b)=>String(b.approval_timestamp).localeCompare(String(a.approval_timestamp)))[0];return{id:row.id,organisationId:row.organisation_id,organisationName:row.support_requests?.organisations?.name||'Supported organisation',platformUserId:row.platform_user_id,accessMode:row.access_mode,scopeType:row.scope_type,missionId:row.mission_id,jobId:row.job_id,moduleCode:row.module_code,reason:row.reason,state:row.state,startedAt:row.started_at,expiresAt:row.expires_at,approvedByInternalUserId:approval?.approved_by_internal_user_id||null};
  }
  async listOperatingLocationIds(organisationId){const rows=await supabaseRequest(`rest/v1/operating_locations?organisation_id=eq.${encodeURIComponent(organisationId)}&archived_at=is.null&select=id`,{publicMessage:'Supported operating locations could not be loaded.'});return(rows||[]).map(x=>x.id);}
}

module.exports = { SupportRepository };
