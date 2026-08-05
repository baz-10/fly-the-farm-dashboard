const { supabaseRequest } = require('./supabase');

class ComplianceRepository {
  async readOverview(context) {
    return supabaseRequest('rest/v1/rpc/ftf_read_casa_compliance_overview', {
      method: 'POST',
      body: JSON.stringify({ p_organisation_id: context.organisation.id }),
      publicMessage: 'CASA Compliance overview could not be loaded.',
    });
  }

  async writePersonnelCasaCredential(context, payload) {
    return supabaseRequest('rest/v1/rpc/ftf_write_personnel_casa_credential', {
      method: 'POST',
      body: JSON.stringify({
        p_organisation_id: context.organisation.id,
        p_actor_internal_user_id: context.internalUser.id,
        p_personnel_id: payload.personnelId,
        p_payload: payload,
      }),
      publicMessage: 'CASA credential evidence could not be saved.',
    });
  }

  async verifyPersonnelCasaCredential(context, payload) {
    return supabaseRequest('rest/v1/rpc/ftf_verify_personnel_credential', {
      method: 'POST',
      body: JSON.stringify({
        p_organisation_id: context.organisation.id,
        p_actor_internal_user_id: context.internalUser.id,
        p_credential_id: payload.credentialId,
        p_expected_version: payload.expectedVersion,
        p_decision: payload.decision,
        p_notes: payload.notes || null,
      }),
      publicMessage: 'CASA credential verification could not be saved.',
    });
  }

  async evaluatePersonnelMissionEligibility(context, personnelId, requirements) {
    return supabaseRequest('rest/v1/rpc/ftf_evaluate_personnel_mission_eligibility', {
      method: 'POST',
      body: JSON.stringify({
        p_organisation_id: context.organisation.id,
        p_personnel_id: personnelId,
        p_requirements: requirements,
      }),
      publicMessage: 'Personnel mission eligibility could not be evaluated.',
    });
  }
}

module.exports = { ComplianceRepository };
