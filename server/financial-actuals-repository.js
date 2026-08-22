const { supabaseRequest } = require('./supabase');

class FinancialActualsRepository {
  constructor(request = supabaseRequest) { this.request = request; }
  rpc(name, body, publicMessage) {
    return this.request(`rest/v1/rpc/${name}`, { method:'POST', body:JSON.stringify(body), publicMessage });
  }
  trusted(context) { return { p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id }; }
  list(context,{operatingLocationId=null,afterId=null,pageSize=25}={}) { return this.rpc('ftf_list_financial_actual_summaries',{...this.trusted(context),p_operating_location_id:operatingLocationId,p_after_id:afterId,p_page_size:pageSize},'Financial Actuals could not be loaded.'); }
  read(context,actualId) { return this.rpc('ftf_read_financial_actual_authority',{...this.trusted(context),p_financial_actual_id:actualId},'Financial Actual could not be loaded.'); }
  create(context,payload) { return this.rpc('ftf_create_financial_actual',{...this.trusted(context),p_payload:payload},'Financial Actual could not be created.'); }
  updateDraft(context,{actualId,revisionId,expectedVersion,payload}) { return this.rpc('ftf_update_financial_actual_draft',{...this.trusted(context),p_financial_actual_id:actualId,p_revision_id:revisionId,p_expected_version:expectedVersion,p_payload:payload},'Financial Actual Draft could not be saved.'); }
  readPrefill(context,actualId) { return this.rpc('ftf_read_financial_actual_operational_prefill',{...this.trusted(context),p_financial_actual_id:actualId},'Operational prefill could not be loaded.'); }
  acceptPrefill(context,{actualId,revisionId,expectedVersion,payload}) { return this.rpc('ftf_accept_financial_actual_operational_prefill',{...this.trusted(context),p_financial_actual_id:actualId,p_revision_id:revisionId,p_expected_version:expectedVersion,p_payload:payload},'Operational prefill could not be accepted.'); }
  readSourceDrift(context,actualId) { return this.rpc('ftf_read_financial_actual_source_drift',{...this.trusted(context),p_financial_actual_id:actualId},'Financial source status could not be loaded.'); }
  finalise(context,{actualId,revisionId,expectedAggregateVersion,expectedRevisionVersion}) { return this.rpc('ftf_finalise_financial_actual_revision',{...this.trusted(context),p_financial_actual_id:actualId,p_revision_id:revisionId,p_expected_aggregate_version:expectedAggregateVersion,p_expected_draft_version:expectedRevisionVersion},'Financial Actual could not be finalised.'); }
}

module.exports={FinancialActualsRepository};
