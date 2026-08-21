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

const FLEET_DUE_RPC_CONCURRENCY = 4;

function scopedSourcePath(context, source, baseIds, sourceIds) {
  const config = SOURCES[source];
  const location = baseIds.length === 1
    ? `operating_location_id=eq.${encodeURIComponent(baseIds[0])}`
    : `operating_location_id=in.(${baseIds.map(encodeURIComponent).join(',')})`;
  const identifiers = sourceIds.map(encodeURIComponent).join(',');
  return `rest/v1/${config.table}?organisation_id=eq.${encodeURIComponent(context.organisation.id)}&archived_at=is.null&${location}&id=in.(${identifiers})&select=${config.select}&order=id.asc&limit=${sourceIds.length + 1}`;
}

function registryPagePath(context, page, pageSize) {
  const offset = (page - 1) * pageSize;
  return `rest/v1/maintainable_asset_registry?organisation_id=eq.${encodeURIComponent(context.organisation.id)}&tracking_state=eq.ACTIVE&select=id,aircraft_id,equipment_kit_id,fleet_asset_id&order=id.asc&offset=${offset}&limit=${pageSize + 1}`;
}

async function mapWithConcurrency(values, concurrency, mapper) {
  const results = new Array(values.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
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
    if (baseIds.length === 0) return { candidates: [], hasMore: false, scannedCount: 0 };
    const page = filters.page;
    const pageSize = filters.pageSize;
    const sourceNames = filters.assetType ? [filters.assetType] : Object.keys(SOURCES);
    const rawRegistryRows = await supabaseRequest(registryPagePath(context, page, pageSize), {
      publicMessage: 'Scoped maintainable assets could not be loaded.',
    });
    if (!Array.isArray(rawRegistryRows) || rawRegistryRows.length > pageSize + 1) {
      throw new Error('Scoped maintainable asset page exceeded its requested bound.');
    }
    const hasMore = rawRegistryRows.length > pageSize;
    const registryRows = rawRegistryRows.slice(0, pageSize);
    const sourceGroups = await Promise.all(sourceNames.map(async (source) => {
      const config = SOURCES[source];
      const sourceIds = registryRows.map((row) => row[config.registryKey]).filter(Boolean);
      if (sourceIds.length === 0) return { source, records: [] };
      const records = await supabaseRequest(scopedSourcePath(context, source, baseIds, sourceIds), {
        publicMessage: 'Scoped Fleet assets could not be loaded.',
      });
      if (!Array.isArray(records) || records.length > sourceIds.length) {
        throw new Error('Scoped Fleet source page exceeded its requested bound.');
      }
      return { source, records };
    }));
    const recordsBySource = new Map(sourceGroups.map((group) => [
      group.source,
      new Map(group.records.map((record) => [record.id, record])),
    ]));
    const candidates = registryRows.flatMap((registry) => {
      const source = sourceNames.find((name) => registry[SOURCES[name].registryKey]);
      if (!source) return [];
      const config = SOURCES[source];
      const sourceRecord = recordsBySource.get(source)?.get(registry[config.registryKey]);
      if (!sourceRecord) return [];
      return [{
        registryId: registry.id,
        source,
        sourceRecordId: sourceRecord.id,
        identity: String(config.identity(sourceRecord) || sourceRecord.id),
        operatingLocationId: sourceRecord.operating_location_id,
      }];
    });
    const projected = await mapWithConcurrency(candidates, FLEET_DUE_RPC_CONCURRENCY, async (candidate) => ({
      ...candidate,
      dueState: await this.readDueState(context, candidate.registryId, asOf),
    }));
    return {
      candidates: projected.filter((candidate) => candidate.dueState && !candidate.dueState.not_found && !candidate.dueState.forbidden),
      hasMore,
      scannedCount: registryRows.length,
    };
  }
}
module.exports={FleetMaintenanceRepository};
