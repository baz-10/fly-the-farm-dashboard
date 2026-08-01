const { supabaseRequest } = require('./supabase');

const TABLES = {
  clients: 'clients',
  properties: 'properties',
  fields: 'fields',
  jobs: 'jobs',
  missions: 'missions',
  aircraft: 'aircraft',
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
  const column = resource === 'operating_locations' ? 'id' : ['missions', 'aircraft'].includes(resource) ? 'operating_location_id' : null;
  if (!column) return null;
  const ids = Array.isArray(context.operatingLocationIds) ? context.operatingLocationIds.filter(Boolean) : [];
  if (ids.length === 0) return false;
  return `${column}=in.(${ids.map(encodeURIComponent).join(',')})`;
}

class OperationalRepository {
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
    return resource === 'jobs' ? this.attachJobFieldIds(context, records) : records;
  }

  async get(resource, context, id) {
    const locationFilter = assignedLocationFilter(resource, context);
    if (locationFilter === false) return null;
    const rows = await supabaseRequest(`rest/v1/${tableFor(resource)}?${tenantFilter(context)}&id=eq.${encodeURIComponent(id)}&${activeFilter()}${locationFilter ? `&${locationFilter}` : ''}&select=*&limit=1`, {
      publicMessage: 'Operational record could not be loaded.',
    });
    if (!Array.isArray(rows) || !rows[0]) return null;
    if (resource !== 'jobs') return rows[0];
    const [record] = await this.attachJobFieldIds(context, [rows[0]]);
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
    return { record: result?.record || result };
  }
}

module.exports = { OperationalRepository, TABLES, tableFor };
