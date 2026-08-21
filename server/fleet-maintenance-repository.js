const { supabaseRequest } = require('./supabase');

function rpc(name, body, publicMessage) {
  return supabaseRequest(`rest/v1/rpc/${name}`, {
    method: 'POST',
    body: JSON.stringify(body),
    publicMessage,
  });
}

const SOURCES = Object.freeze({
  aircraft: { table: 'aircraft', registryKey: 'aircraft_id', select: 'id,registration,operating_location_id', identity: (row) => row.registration },
  'equipment-kit': { table: 'equipment_kits', registryKey: 'equipment_kit_id', select: 'id,name,kit_type,operating_location_id', identity: (row) => row.name },
  'fleet-asset': { table: 'fleet_assets', registryKey: 'fleet_asset_id', select: 'id,asset_identifier,asset_type,operating_location_id', identity: (row) => row.asset_identifier },
});

function scopedSourcePath(context, source, baseIds) {
  const config = SOURCES[source];
  const location = baseIds.length === 1
    ? `operating_location_id=eq.${encodeURIComponent(baseIds[0])}`
    : `operating_location_id=in.(${baseIds.map(encodeURIComponent).join(',')})`;
  return `rest/v1/${config.table}?organisation_id=eq.${encodeURIComponent(context.organisation.id)}&archived_at=is.null&${location}&select=${config.select}&order=id.asc`;
}

class FleetMaintenanceRepository {
  async command(context, command, entityId, expectedVersion, data){
    return supabaseRequest('rest/v1/rpc/ftf_write_asset_maintenance_command',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_command:command,p_entity_id:entityId,p_expected_version:expectedVersion,p_data:data}),publicMessage:'Maintenance command failed.'});
  }
  async readWorkspace(context, registryId){
    return supabaseRequest('rest/v1/rpc/ftf_read_asset_maintenance_workspace',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_asset_id:registryId}),publicMessage:'Asset maintenance workspace could not be loaded.'});
  }

  readDueState(context, registryId, asOf) {
    return rpc('ftf_read_asset_maintenance_due_state', {
      p_organisation_id: context.organisation.id,
      p_actor_internal_user_id: context.internalUser.id,
      p_maintainable_asset_id: registryId,
      p_as_of: asOf,
    }, 'Maintenance due state could not be loaded.');
  }

  async readFleetDueSummary(context, asOf, filters = {}) {
    const assignedBases = Array.isArray(context.operatingLocationIds) ? context.operatingLocationIds.filter(Boolean) : [];
    const baseIds = filters.baseId ? [filters.baseId] : assignedBases;
    if (baseIds.length === 0) return [];
    const sourceNames = filters.assetType ? [filters.assetType] : Object.keys(SOURCES);
    const sourceGroups = await Promise.all(sourceNames.map(async (source) => ({
      source,
      records: await supabaseRequest(scopedSourcePath(context, source, baseIds), {
        publicMessage: 'Scoped Fleet assets could not be loaded.',
      }),
    })));
    const candidates = [];
    for (const group of sourceGroups) {
      const config = SOURCES[group.source];
      const records = Array.isArray(group.records) ? group.records : [];
      if (records.length === 0) continue;
      const sourceIds = records.map((record) => record.id).filter(Boolean);
      const registryRows = await supabaseRequest(
        `rest/v1/maintainable_asset_registry?organisation_id=eq.${encodeURIComponent(context.organisation.id)}&tracking_state=eq.ACTIVE&${config.registryKey}=in.(${sourceIds.map(encodeURIComponent).join(',')})&select=id,aircraft_id,equipment_kit_id,fleet_asset_id&order=id.asc`,
        { publicMessage: 'Scoped maintainable assets could not be loaded.' }
      );
      for (const registry of Array.isArray(registryRows) ? registryRows : []) {
        const sourceRecord = records.find((record) => record.id === registry[config.registryKey]);
        if (!sourceRecord) continue;
        candidates.push({
          registryId: registry.id,
          source: group.source,
          sourceRecordId: sourceRecord.id,
          identity: String(config.identity(sourceRecord) || sourceRecord.id),
          operatingLocationId: sourceRecord.operating_location_id,
        });
      }
    }
    const projected = await Promise.all(candidates.map(async (candidate) => ({
      ...candidate,
      dueState: await this.readDueState(context, candidate.registryId, asOf),
    })));
    return projected.filter((candidate) => candidate.dueState && !candidate.dueState.not_found && !candidate.dueState.forbidden);
  }
}
module.exports={FleetMaintenanceRepository};
