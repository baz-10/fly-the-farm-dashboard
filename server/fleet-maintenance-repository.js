const { supabaseRequest } = require('./supabase');
class FleetMaintenanceRepository {
  async command(context, command, entityId, expectedVersion, data){
    return supabaseRequest('rest/v1/rpc/ftf_write_asset_maintenance_command',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_command:command,p_entity_id:entityId,p_expected_version:expectedVersion,p_data:data}),publicMessage:'Maintenance command failed.'});
  }
  async readWorkspace(context, registryId){
    return supabaseRequest('rest/v1/rpc/ftf_read_asset_maintenance_workspace',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_asset_id:registryId}),publicMessage:'Asset maintenance workspace could not be loaded.'});
  }
}
module.exports={FleetMaintenanceRepository};
