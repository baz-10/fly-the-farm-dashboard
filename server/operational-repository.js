const { supabaseRequest } = require('./supabase');
const crypto = require('crypto');

const TABLES = {
  clients: 'clients',
  properties: 'properties',
  fields: 'fields',
  jobs: 'jobs',
  missions: 'missions',
  aircraft: 'aircraft',
  'equipment-kits': 'equipment_kits',
  operating_locations: 'operating_locations',
  field_boundary_versions: 'field_boundary_versions',
  job_fields: 'job_fields',
  mission_versions: 'mission_versions',
};

function tableFor(resource) {
  const table = TABLES[resource];
  if (!table) throw new Error(`Unsupported operational resource: ${resource}`);
  return table;
}

function tenantFilter(context) {
  return `organisation_id=eq.${encodeURIComponent(context.organisation.id)}`;
}

function activeFilter() {
  return 'archived_at=is.null';
}

function assignedLocationFilter(resource, context) {
  const column = resource === 'operating_locations' ? 'id' : ['missions', 'aircraft', 'equipment-kits'].includes(resource) ? 'operating_location_id' : null;
  if (!column) return null;
  const ids = Array.isArray(context.operatingLocationIds) ? context.operatingLocationIds.filter(Boolean) : [];
  if (ids.length === 0) return false;
  return `${column}=in.(${ids.map(encodeURIComponent).join(',')})`;
}

class OperationalRepository {
  async attachMissionAssignments(context, records) {
    if (!Array.isArray(records) || records.length === 0) return records;
    const missionIds = records.map((record) => record.id).filter(Boolean).map(encodeURIComponent).join(',');
    const [aircraftAssignments, kitAssignments] = await Promise.all([
      supabaseRequest(`rest/v1/mission_aircraft_assignments?${tenantFilter(context)}&mission_id=in.(${missionIds})&unassigned_at=is.null&select=mission_id,aircraft_id&order=assigned_at.asc`, {
        publicMessage: 'Mission Aircraft assignments could not be loaded.',
      }),
      supabaseRequest(`rest/v1/mission_equipment_kit_assignments?${tenantFilter(context)}&mission_id=in.(${missionIds})&unassigned_at=is.null&select=mission_id,equipment_kit_id&order=assigned_at.asc`, {
        publicMessage: 'Mission Equipment assignments could not be loaded.',
      }),
    ]);
    return records.map((record) => ({
      ...record,
      aircraft_ids: (aircraftAssignments || []).filter((assignment) => assignment.mission_id === record.id).map((assignment) => assignment.aircraft_id),
      equipment_kit_ids: (kitAssignments || []).filter((assignment) => assignment.mission_id === record.id).map((assignment) => assignment.equipment_kit_id),
    }));
  }

  async attachEquipmentKitRelationships(context, records) {
    if (!Array.isArray(records) || records.length === 0) return records;
    const kitIds = records.map((record) => record.id).filter(Boolean);
    const encodedIds = kitIds.map(encodeURIComponent).join(',');
    const [compatibility, assignments] = await Promise.all([
      supabaseRequest(`rest/v1/equipment_kit_aircraft_compatibility?${tenantFilter(context)}&equipment_kit_id=in.(${encodedIds})&select=equipment_kit_id,aircraft_id`, {
        publicMessage: 'Equipment Kit compatibility could not be loaded.',
      }),
      supabaseRequest(`rest/v1/aircraft_equipment_kit_assignments?${tenantFilter(context)}&equipment_kit_id=in.(${encodedIds})&unassigned_at=is.null&${activeFilter()}&select=*&order=assigned_at.desc`, {
        publicMessage: 'Equipment Kit assignments could not be loaded.',
      }),
    ]);
    return records.map((record) => ({
      ...record,
      compatible_aircraft_ids: (compatibility || []).filter((link) => link.equipment_kit_id === record.id).map((link) => link.aircraft_id),
      active_assignment: (assignments || []).find((assignment) => assignment.equipment_kit_id === record.id) || null,
    }));
  }

  async attachJobFieldIds(context, records) {
    if (!Array.isArray(records) || records.length === 0) return records;
    const jobIds = records.map((record) => record.id).filter(Boolean);
    const links = await supabaseRequest(`rest/v1/job_fields?${tenantFilter(context)}&job_id=in.(${jobIds.map(encodeURIComponent).join(',')})&${activeFilter()}&select=job_id,field_id&order=field_id.asc`, {
      publicMessage: 'Job field assignments could not be loaded.',
    });
    return records.map((record) => ({
      ...record,
      field_ids: (Array.isArray(links) ? links : []).filter((link) => link.job_id === record.id).map((link) => link.field_id),
    }));
  }

  async list(resource, context, { page = 1, pageSize = 25 } = {}) {
    const locationFilter = assignedLocationFilter(resource, context);
    if (locationFilter === false) return [];
    const offset = (page - 1) * pageSize;
    const records = await supabaseRequest(`rest/v1/${tableFor(resource)}?${tenantFilter(context)}&${activeFilter()}${locationFilter ? `&${locationFilter}` : ''}&select=*&order=updated_at.desc&offset=${offset}&limit=${pageSize}`, {
      publicMessage: 'Operational records could not be loaded.',
    });
    if (resource === 'jobs') return this.attachJobFieldIds(context, records);
    if (resource === 'missions') return this.attachMissionAssignments(context, records);
    if (resource === 'equipment-kits') return this.attachEquipmentKitRelationships(context, records);
    return records;
  }

  async get(resource, context, id) {
    const locationFilter = assignedLocationFilter(resource, context);
    if (locationFilter === false) return null;
    const rows = await supabaseRequest(`rest/v1/${tableFor(resource)}?${tenantFilter(context)}&id=eq.${encodeURIComponent(id)}&${activeFilter()}${locationFilter ? `&${locationFilter}` : ''}&select=*&limit=1`, {
      publicMessage: 'Operational record could not be loaded.',
    });
    if (!Array.isArray(rows) || !rows[0]) return null;
    if (!['jobs', 'missions', 'equipment-kits'].includes(resource)) return rows[0];
    const [record] = resource === 'jobs'
      ? await this.attachJobFieldIds(context, [rows[0]])
      : resource === 'missions'
        ? await this.attachMissionAssignments(context, [rows[0]])
      : await this.attachEquipmentKitRelationships(context, [rows[0]]);
    return record || null;
  }

  async listBoundaryVersions(context, { fieldId, propertyId, page = 1, pageSize = 25 }) {
    const offset = (page - 1) * pageSize;
    return supabaseRequest('rest/v1/rpc/ftf_read_field_boundary_versions', {
      method: 'POST',
      body: JSON.stringify({
        p_organisation_id: context.organisation.id,
        p_entity_id: null,
        p_field_id: fieldId,
        p_property_id: propertyId,
        p_offset: offset,
        p_limit: pageSize,
      }),
      publicMessage: 'Boundary versions could not be loaded.',
    });
  }

  async getBoundaryVersion(context, id) {
    const records = await supabaseRequest('rest/v1/rpc/ftf_read_field_boundary_versions', {
      method: 'POST',
      body: JSON.stringify({
        p_organisation_id: context.organisation.id,
        p_entity_id: id,
        p_field_id: null,
        p_property_id: null,
        p_offset: 0,
        p_limit: 1,
      }),
      publicMessage: 'Boundary version could not be loaded.',
    });
    return Array.isArray(records) && records[0] ? records[0] : null;
  }

  async createBoundaryVersion(context, values) {
    const result = await supabaseRequest('rest/v1/rpc/ftf_create_field_boundary_version', {
      method: 'POST',
      body: JSON.stringify({
        p_organisation_id: context.organisation.id,
        p_actor_internal_user_id: context.internalUser.id,
        p_field_id: values.fieldId,
        p_property_id: values.propertyId,
        p_expected_field_version: values.expectedFieldVersion,
        p_boundary_geojson: values.boundaryGeojson,
        p_captured_at: values.capturedAt,
      }),
      publicMessage: 'Boundary version could not be saved.',
    });
    if (result?.conflict) return { conflict: true, currentVersion: result.current_version };
    if (result?.not_found) return { notFound: true };
    if (result?.relationship_conflict) return { relationshipConflict: true };
    return { record: result?.record || result, fieldVersion: result?.field_version };
  }

  async getMissionMap(context, missionId, history = false) {
    const result = await supabaseRequest('rest/v1/rpc/ftf_read_mission_map', { method: 'POST', body: JSON.stringify({
      p_organisation_id: context.organisation.id, p_mission_id: missionId, p_history: history,
    }), publicMessage: 'Mission map could not be loaded.' });
    return history ? (Array.isArray(result) ? result : []) : (Array.isArray(result) ? result[0] || null : result || null);
  }

  async saveMissionMap(context, missionId, values) {
    const result = await supabaseRequest('rest/v1/rpc/ftf_save_mission_map', { method: 'POST', body: JSON.stringify({
      p_organisation_id: context.organisation.id, p_actor_internal_user_id: context.internalUser.id,
      p_mission_id: missionId, p_expected_version: values.expectedVersion, p_notes: values.notes,
      p_source_field_boundary_version_id: values.sourceFieldBoundaryVersionId, p_geometries: values.geometries,
    }), publicMessage: 'Mission map could not be saved.' });
    if (result?.conflict) return { conflict: true, currentVersion: result.current_version };
    if (result?.not_found) return { notFound: true };
    if (result?.location_forbidden) return { locationForbidden: true };
    if (result?.relationship_conflict) return { relationshipConflict: true };
    return { record: result?.record || result };
  }

  async createMissionMapSourceFile(context, missionId, values) {
    const bucket = 'mission-map-imports';
    const safeName = values.fileName.replace(/[^A-Za-z0-9._-]/g, '_');
    const objectKey = `${context.organisation.id}/${missionId}/${crypto.randomUUID()}/${safeName}`;
    await supabaseRequest(`storage/v1/object/${bucket}/${objectKey}`, {
      method: 'POST', body: values.bytes, headers: { 'Content-Type': values.contentType, 'x-upsert': 'false' },
      publicMessage: 'Mission map source file could not be stored.',
    });
    const cleanup = () => supabaseRequest(`storage/v1/object/${bucket}/${objectKey}`, { method: 'DELETE', publicMessage: 'Mission map source cleanup failed.' }).catch(() => {});
    try {
      const result = await supabaseRequest('rest/v1/rpc/ftf_create_mission_map_source_file', { method: 'POST', body: JSON.stringify({
        p_organisation_id: context.organisation.id, p_actor_internal_user_id: context.internalUser.id, p_mission_id: missionId,
        p_storage_provider: 'supabase', p_storage_bucket: bucket, p_storage_object_key: objectKey,
        p_original_filename: values.fileName, p_source_format: values.fileType, p_content_type: values.contentType,
        p_file_size_bytes: values.bytes.length, p_sha256_checksum: values.checksum, p_original_crs: values.sourceCrs,
        p_transformation_metadata: values.transformationMetadata, p_validation_result: values.validationResult,
      }), publicMessage: 'Mission map source evidence could not be recorded.' });
      if (result?.not_found) { await cleanup(); return { notFound: true }; }
      if (result?.relationship_conflict) { await cleanup(); return { relationshipConflict: true }; }
      return result;
    } catch (error) {
      await cleanup();
      throw error;
    }
  }

  async relationshipExists(resource, context, id, filters = {}) {
    const extra = Object.entries(filters).map(([key, value]) => `${key}=eq.${encodeURIComponent(value)}`);
    const rows = await supabaseRequest(`rest/v1/${tableFor(resource)}?${tenantFilter(context)}&id=eq.${encodeURIComponent(id)}&${activeFilter()}&${extra.join('&')}&select=id&limit=1`, {
      publicMessage: 'Related operational record could not be loaded.',
    });
    return Array.isArray(rows) && Boolean(rows[0]);
  }

  async hasActiveDependencies(resource, context, id) {
    const dependency = {
      operating_locations: ['missions', 'operating_location_id'],
      clients: ['properties', 'client_id'],
      properties: ['fields', 'property_id'],
      fields: ['job_fields', 'field_id'],
      jobs: ['missions', 'job_id'],
      missions: ['mission_versions', 'mission_id'],
    }[resource];
    if (!dependency) return false;
    const [table, column] = dependency;
    const rows = await supabaseRequest(`rest/v1/${table}?${tenantFilter(context)}&${column}=eq.${encodeURIComponent(id)}&${activeFilter()}&select=id&limit=1`, {
      publicMessage: 'Operational dependency check failed.',
    });
    return Array.isArray(rows) && Boolean(rows[0]);
  }

  async create(resource, context, data) {
    return this.write('create', resource, context, null, null, data);
  }

  async update(resource, context, id, expectedVersion, data) {
    return this.write('update', resource, context, id, expectedVersion, data);
  }

  async archive(resource, context, id, expectedVersion) {
    return this.write('archive', resource, context, id, expectedVersion, {});
  }

  async assignEquipmentKit(context, kitId, aircraftId, configurationName, configurationData) {
    return this.write('assign','equipment-kits',context,kitId,null,{ aircraft_id: aircraftId, configuration_name: configurationName, configuration_data: configurationData || {} });
  }

  async unassignEquipmentKit(context, assignmentId, expectedVersion) {
    return this.write('unassign','equipment-kits',context,assignmentId,expectedVersion,{});
  }

  async write(operation, resource, context, entityId, expectedVersion, data) {
    const result = await supabaseRequest('rest/v1/rpc/ftf_write_operational_resource', {
      method: 'POST',
      body: JSON.stringify({
        p_organisation_id: context.organisation.id,
        p_actor_internal_user_id: context.internalUser.id,
        p_resource: resource,
        p_operation: operation,
        p_entity_id: entityId,
        p_expected_version: expectedVersion,
        p_data: data,
      }),
      publicMessage: 'Operational record could not be saved.',
    });
    if (result?.conflict) return { conflict: true, currentVersion: result.current_version };
    if (result?.not_found) return { notFound: true };
    if (result?.archive_conflict) return { archiveConflict: true };
    if (result?.relationship_conflict) return { relationshipConflict: true };
    if (result?.location_forbidden) return { locationForbidden: true };
    if (result?.lifecycle_conflict) return { lifecycleConflict: true };
    if (result?.assignment_conflict) return { archiveConflict: true };
    if (result?.incompatible) return { incompatible: true };
    if (result?.unavailable) return { unavailable: true };
    if (result?.aircraft_not_ready) return { aircraftNotReady: true };
    return { record: result?.record || result };
  }
}

module.exports = { OperationalRepository, TABLES, tableFor };
