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
const FLEET_SCAN_LIMIT = 100;
const STATE_RANK = { OVERDUE: 0, DUE: 1, DUE_SOON: 2, INSUFFICIENT_DATA: 3, CURRENT: 4 };

function scopedSourcePath(context, source, sourceId) {
  const config = SOURCES[source];
  return `rest/v1/${config.table}?organisation_id=eq.${encodeURIComponent(context.organisation.id)}&archived_at=is.null&id=eq.${encodeURIComponent(sourceId)}&select=${config.select}&order=id.asc&limit=2`;
}

function registryPagePath(context, afterRegistryId, batchSize) {
  const after = afterRegistryId ? `&id=gt.${encodeURIComponent(afterRegistryId)}` : '';
  return `rest/v1/maintainable_asset_registry?organisation_id=eq.${encodeURIComponent(context.organisation.id)}&tracking_state=eq.ACTIVE${after}&select=id,aircraft_id,equipment_kit_id,fleet_asset_id&order=id.asc&limit=${batchSize + 1}`;
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

function highestDueState(dueState) {
  const states = Array.isArray(dueState?.requirements)
    ? dueState.requirements.map((requirement) => requirement?.state).filter((state) => Object.hasOwn(STATE_RANK, state))
    : [];
  return states.sort((left, right) => STATE_RANK[left] - STATE_RANK[right])[0] || 'CURRENT';
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
    if (baseIds.length === 0) {
      return { candidates: [], rowRegistryIds: [], hasMore: false, lastScannedRegistryId: filters.afterRegistryId || null, scannedCount: 0 };
    }
    const allowedBases = new Set(baseIds);
    const pageSize = filters.pageSize;
    const sourceNames = filters.assetType ? [filters.assetType] : Object.keys(SOURCES);
    const candidates = [];
    const rowRegistryIds = [];
    let scannedCount = 0;
    let lastScannedRegistryId = filters.afterRegistryId || null;
    let hasMore = false;

    while (rowRegistryIds.length < pageSize && scannedCount < FLEET_SCAN_LIMIT) {
      const batchSize = Math.min(pageSize - rowRegistryIds.length, FLEET_SCAN_LIMIT - scannedCount);
      const rawRegistryRows = await supabaseRequest(registryPagePath(context, lastScannedRegistryId, batchSize), {
        publicMessage: 'Scoped maintainable assets could not be loaded.',
      });
      if (!Array.isArray(rawRegistryRows) || rawRegistryRows.length > batchSize + 1) {
        throw new Error('Scoped maintainable asset page exceeded its requested bound.');
      }
      const registryRows = rawRegistryRows.slice(0, batchSize);
      let priorId = lastScannedRegistryId;
      for (const row of registryRows) {
        if (typeof row?.id !== 'string' || (priorId && row.id <= priorId)) {
          throw new Error('Scoped maintainable asset page was not in keyset order.');
        }
        priorId = row.id;
      }
      if (registryRows.length === 0) {
        hasMore = false;
        break;
      }
      hasMore = rawRegistryRows.length > batchSize;
      scannedCount += registryRows.length;
      lastScannedRegistryId = registryRows[registryRows.length - 1].id;

      const hydrated = await mapWithConcurrency(registryRows, FLEET_DUE_RPC_CONCURRENCY, async (registry) => {
        const source = sourceNames.find((name) => registry[SOURCES[name].registryKey]);
        if (!source) return null;
        const config = SOURCES[source];
        const sourceId = registry[config.registryKey];
        const records = await supabaseRequest(scopedSourcePath(context, source, sourceId), {
          publicMessage: 'Scoped Fleet assets could not be loaded.',
        });
        if (!Array.isArray(records) || records.length > 1) throw new Error('Scoped Fleet source read exceeded its requested bound.');
        const sourceRecord = records[0];
        if (!sourceRecord || sourceRecord.id !== sourceId || !allowedBases.has(sourceRecord.operating_location_id)) return null;
        return {
          registryId: registry.id,
          source,
          sourceRecordId: sourceRecord.id,
          identity: String(config.identity(sourceRecord) || sourceRecord.id),
          operatingLocationId: sourceRecord.operating_location_id,
        };
      });
      const projected = await mapWithConcurrency(hydrated.filter(Boolean), FLEET_DUE_RPC_CONCURRENCY, async (candidate) => ({
        ...candidate,
        dueState: await this.readDueState(context, candidate.registryId, asOf),
      }));
      projected.forEach((candidate) => {
        if (!candidate.dueState || candidate.dueState.not_found || candidate.dueState.forbidden) return;
        candidates.push(candidate);
        if (!filters.state || highestDueState(candidate.dueState) === filters.state) rowRegistryIds.push(candidate.registryId);
      });
      if (rowRegistryIds.length >= pageSize || !hasMore) break;
    }
    return {
      candidates,
      rowRegistryIds,
      hasMore,
      lastScannedRegistryId,
      scannedCount,
    };
  }
}
module.exports={FleetMaintenanceRepository};
