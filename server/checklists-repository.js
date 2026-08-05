const{supabaseRequest}=require('./supabase');const tenant=(context)=>`organisation_id=eq.${encodeURIComponent(context.organisation.id)}`;
class ChecklistsRepository{
 listTemplates(context){return supabaseRequest(`rest/v1/checklist_templates?${tenant(context)}&archived_at=is.null&select=*,checklist_template_versions(*)&order=name.asc`,{publicMessage:'Checklists could not be loaded.'});}
 readMissionExecutions(context,missionId){return supabaseRequest(`rest/v1/checklist_executions?${tenant(context)}&mission_id=eq.${encodeURIComponent(missionId)}&select=*,checklist_corrective_actions(*)&order=created_at.desc`,{publicMessage:'Mission checklists could not be loaded.'});}
 writeTemplate(context,operation,templateId,expectedVersion,payload){return this.rpc('ftf_write_checklist_template',{p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_operation:operation,p_template_id:templateId,p_expected_version:expectedVersion,p_payload:payload});}
 publishTemplate(context,templateId,expectedVersion,payload){return this.rpc('ftf_publish_checklist_template',{p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_template_id:templateId,p_expected_version:expectedVersion,p_payload:payload});}
 writeExecution(context,operation,executionId,expectedVersion,payload){return this.rpc('ftf_write_checklist_execution',{p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_operation:operation,p_execution_id:executionId,p_expected_version:expectedVersion,p_payload:payload});}
 writeCorrectiveAction(context,operation,actionId,expectedVersion,payload){return this.rpc('ftf_write_checklist_corrective_action',{p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_operation:operation,p_action_id:actionId,p_expected_version:expectedVersion,p_payload:payload});}
 evaluateMissionReadiness(context,missionId,lifecycleStage){return this.rpc('ftf_evaluate_mission_checklist_readiness',{p_organisation_id:context.organisation.id,p_mission_id:missionId,p_lifecycle_stage:lifecycleStage});}
 async rpc(name,body){const result=await supabaseRequest(`rest/v1/rpc/${name}`,{method:'POST',body:JSON.stringify(body),publicMessage:'Checklist command could not be completed.'});return result;}
}
module.exports={ChecklistsRepository};
