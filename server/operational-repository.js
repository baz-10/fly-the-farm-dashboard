const { supabaseRequest } = require('./supabase');

const TABLES = {
  clients: 'clients',
  properties: 'properties',
  fields: 'fields',
  jobs: 'jobs',
  missions: 'missions',
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

class OperationalRepository {
  async list(resource, context, { page = 1, pageSize = 25 } = {}) {
    const offset = (page - 1) * pageSize;
    return supabaseRequest(`rest/v1/${tableFor(resource)}?${tenantFilter(context)}&${activeFilter()}&select=*&order=updated_at.desc&offset=${offset}&limit=${pageSize}`, {
      publicMessage: 'Operational records could not be loaded.',
    });
  }

  async get(resource, context, id) {
    const rows = await supabaseRequest(`rest/v1/${tableFor(resource)}?${tenantFilter(context)}&id=eq.${encodeURIComponent(id)}&${activeFilter()}&select=*&limit=1`, {
      publicMessage: 'Operational record could not be loaded.',
    });
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
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
    return { record: result?.record || result };
  }
}

module.exports = { OperationalRepository, TABLES, tableFor };
