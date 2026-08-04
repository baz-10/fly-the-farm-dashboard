const { supabaseRequest, getSupabaseConfig } = require('./supabase');
const crypto = require('crypto');
const { validateLogoFile } = require('./report-file-validator');

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

  async createDelegated(resource, context, data) { return this.writeDelegated('create',resource,context,null,null,data); }
  async updateDelegated(resource, context, id, expectedVersion, data) { return this.writeDelegated('update',resource,context,id,expectedVersion,data); }
  async archiveDelegated(resource, context, id, expectedVersion) { return this.writeDelegated('archive',resource,context,id,expectedVersion,{}); }

  async assignEquipmentKit(context, kitId, aircraftId, configurationName, configurationData) {
    return this.write('assign','equipment-kits',context,kitId,null,{ aircraft_id: aircraftId, configuration_name: configurationName, configuration_data: configurationData || {} });
  }

  async unassignEquipmentKit(context, assignmentId, expectedVersion) {
    return this.write('unassign','equipment-kits',context,assignmentId,expectedVersion,{});
  }

  async listPersonnel(context, { operatingLocationId = null, includePrivate = false } = {}) {
    return supabaseRequest('rest/v1/rpc/ftf_list_personnel', { method: 'POST', body: JSON.stringify({
      p_organisation_id: context.organisation.id, p_operating_location_id: operatingLocationId, p_include_private: includePrivate,
    }), publicMessage: 'Personnel could not be loaded.' });
  }

  async listMissionSetupDrafts(context) {
    return supabaseRequest(`rest/v1/mission_setup_drafts?${tenantFilter(context)}&archived_at=is.null&select=*&order=updated_at.desc`, { publicMessage: 'Mission setup drafts could not be loaded.' });
  }
  async getMissionSetupDraft(context, id) {
    const rows = await supabaseRequest(`rest/v1/mission_setup_drafts?${tenantFilter(context)}&id=eq.${encodeURIComponent(id)}&archived_at=is.null&select=*&limit=1`, { publicMessage: 'Mission setup draft could not be loaded.' });
    return rows?.[0] || null;
  }
  async writeMissionSetupDraft(context, operation, id, expectedVersion, payload) {
    const result = await supabaseRequest('rest/v1/rpc/ftf_write_mission_setup_draft', { method:'POST', body:JSON.stringify({ p_organisation_id:context.organisation.id, p_actor_internal_user_id:context.internalUser.id, p_operation:operation, p_draft_id:id, p_expected_version:expectedVersion, p_payload:payload }), publicMessage:'Mission setup draft could not be saved.' });
    if(result?.conflict)return{conflict:true,currentVersion:result.current_version};
    if(result?.not_found)return{notFound:true};
    if(result?.location_forbidden)return{locationForbidden:true};
    if(result?.relationship_conflict)return{relationshipConflict:true};
    return{record:result?.record||result};
  }

  async writePersonnel(context, operation, personnelId, expectedVersion, payload) {
    const result = await supabaseRequest('rest/v1/rpc/ftf_write_personnel', { method: 'POST', body: JSON.stringify({
      p_organisation_id: context.organisation.id, p_actor_internal_user_id: context.internalUser.id,
      p_operation: operation, p_personnel_id: personnelId, p_expected_version: expectedVersion, p_payload: payload,
    }), publicMessage: 'Personnel could not be saved.' });
    if (result?.conflict) return { conflict: true, currentVersion: result.current_version };
    if (result?.not_found) return { notFound: true };
    return { record: result?.record || result };
  }

  async linkPersonnelMember(context, personnelId, expectedVersion, internalUserId, membershipId) {
    const result = await supabaseRequest('rest/v1/rpc/ftf_link_personnel_member', { method: 'POST', body: JSON.stringify({
      p_organisation_id: context.organisation.id, p_actor_internal_user_id: context.internalUser.id, p_personnel_id: personnelId,
      p_expected_version: expectedVersion, p_internal_user_id: internalUserId, p_membership_id: membershipId,
    }), publicMessage: 'Personnel member link could not be saved.' });
    if (result?.conflict) return { conflict: true, currentVersion: result.current_version };
    if (result?.not_found) return { notFound: true };
    if (result?.relationship_conflict || result?.duplicate_conflict) return { relationshipConflict: true };
    return { record: result?.record || result };
  }

  async addPersonnelCredential(context, personnelId, payload) { return this.personnelChildWrite('ftf_write_personnel_credential', context, personnelId, payload); }
  async addPersonnelEvidence(context, personnelId, payload) { return this.personnelChildWrite('ftf_write_personnel_evidence', context, personnelId, payload); }
  async personnelChildWrite(rpc, context, personnelId, payload) {
    const result = await supabaseRequest(`rest/v1/rpc/${rpc}`, { method: 'POST', body: JSON.stringify({ p_organisation_id: context.organisation.id, p_actor_internal_user_id: context.internalUser.id, p_personnel_id: personnelId, p_payload: payload }), publicMessage: 'Personnel evidence could not be saved.' });
    if (result?.not_found) return { notFound: true }; return { record: result?.record || result };
  }

  async listPersonnelIdentityCandidates(context, personnelId) {
    return supabaseRequest('rest/v1/rpc/ftf_list_personnel_identity_candidates', { method:'POST', body:JSON.stringify({p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_personnel_id:personnelId}), publicMessage:'Personnel identity candidates could not be loaded.' });
  }
  async linkPersonnelIdentity(context,personnelId,expectedVersion,internalUserId,membershipId,reason){
    const result=await supabaseRequest('rest/v1/rpc/ftf_link_personnel_identity',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_personnel_id:personnelId,p_expected_version:expectedVersion,p_internal_user_id:internalUserId,p_membership_id:membershipId,p_reason:reason}),publicMessage:'Personnel identity link could not be saved.'});
    if(result?.conflict)return{conflict:true,currentVersion:result.current_version};if(result?.not_found)return{notFound:true};if(result?.relationship_conflict||result?.duplicate_conflict)return{relationshipConflict:true};return{record:result?.record||result};
  }
  async unlinkPersonnelIdentity(context,personnelId,expectedVersion,reason){
    const result=await supabaseRequest('rest/v1/rpc/ftf_unlink_personnel_identity',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_personnel_id:personnelId,p_expected_version:expectedVersion,p_reason:reason}),publicMessage:'Personnel identity link could not be removed.'});
    if(result?.conflict)return{conflict:true,currentVersion:result.current_version};if(result?.not_found)return{notFound:true};return{record:result?.record||result};
  }

  async readMissionPersonnel(context, missionId, history = false) { return supabaseRequest('rest/v1/rpc/ftf_read_mission_personnel', { method: 'POST', body: JSON.stringify({ p_organisation_id: context.organisation.id, p_mission_id: missionId, p_history: history }), publicMessage: 'Mission Personnel could not be loaded.' }); }
  async saveMissionPersonnel(context, missionId, expectedVersion, assignments) {
    const result = await supabaseRequest('rest/v1/rpc/ftf_save_mission_personnel', { method: 'POST', body: JSON.stringify({ p_organisation_id: context.organisation.id, p_actor_internal_user_id: context.internalUser.id, p_mission_id: missionId, p_expected_version: expectedVersion, p_assignments: assignments }), publicMessage: 'Mission Personnel could not be saved.' });
    if (result?.conflict) return { conflict: true, currentVersion: result.current_version };
    if (result?.not_found) return { notFound: true };
    if (result?.qualification_blockers) return { qualificationBlockers: result.qualification_blockers };
    return { record: result?.record || result };
  }

  async readMissionWeather(context, missionId) { return supabaseRequest('rest/v1/rpc/ftf_read_mission_weather', { method:'POST', body:JSON.stringify({p_organisation_id:context.organisation.id,p_mission_id:missionId}), publicMessage:'Mission Weather could not be loaded.' }); }
  async readMissionWeatherForecasts(context, missionId) { return supabaseRequest('rest/v1/rpc/ftf_read_mission_weather_forecasts', { method:'POST', body:JSON.stringify({p_organisation_id:context.organisation.id,p_mission_id:missionId}), publicMessage:'Mission forecast Weather could not be loaded.' }); }
  async evaluateMissionWeather(context, missionId) { return supabaseRequest('rest/v1/rpc/ftf_evaluate_mission_weather_readiness', { method:'POST', body:JSON.stringify({p_organisation_id:context.organisation.id,p_mission_id:missionId}), publicMessage:'Mission Weather readiness could not be evaluated.' }); }
  async createMissionWeather(context,missionId,expectedVersion,payload){const result=await supabaseRequest('rest/v1/rpc/ftf_create_mission_weather_observation',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_mission_id:missionId,p_expected_version:expectedVersion,p_payload:payload}),publicMessage:'Mission Weather could not be saved.'});if(result?.conflict)return{conflict:true,currentVersion:result.current_version};if(result?.not_found)return{notFound:true};if(result?.location_forbidden)return{locationForbidden:true};if(result?.boundary_invalid)return{boundaryInvalid:true};if(result?.location_mismatch)return{locationMismatch:true};if(result?.observer_invalid)return{observerInvalid:true};if(result?.observer_unassigned)return{observerUnassigned:true};return{record:result?.record||result};}
  async createMissionWeatherForecast(context,missionId,expectedVersion,payload){const result=await supabaseRequest('rest/v1/rpc/ftf_create_mission_weather_forecast',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_mission_id:missionId,p_expected_version:expectedVersion,p_payload:payload}),publicMessage:'Mission forecast Weather could not be saved.'});if(result?.conflict)return{conflict:true,currentVersion:result.current_version};if(result?.not_found)return{notFound:true};if(result?.location_forbidden)return{locationForbidden:true};return{record:result?.record||result};}
  async selectMissionWeatherForecast(context,missionId,forecastRevisionId,expectedVersion){const result=await supabaseRequest('rest/v1/rpc/ftf_select_mission_weather_forecast',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_mission_id:missionId,p_forecast_revision_id:forecastRevisionId,p_expected_selection_version:expectedVersion}),publicMessage:'Mission forecast selection could not be saved.'});if(result?.conflict)return{conflict:true,currentVersion:result.current_version};if(result?.not_found)return{notFound:true};if(result?.location_forbidden)return{locationForbidden:true};return{record:result?.record||result};}
  async selectMissionWeather(context,missionId,observationId,expectedVersion){const result=await supabaseRequest('rest/v1/rpc/ftf_select_mission_weather_observation',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_mission_id:missionId,p_observation_id:observationId,p_expected_selection_version:expectedVersion})});if(result?.conflict)return{conflict:true,currentVersion:result.current_version};if(result?.not_found)return{notFound:true};if(result?.location_forbidden)return{locationForbidden:true};return{record:result?.record||result};}

  async readMissionChemicalPlan(context,missionId,history=false){return supabaseRequest('rest/v1/rpc/ftf_read_mission_chemical_plan',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_mission_id:missionId,p_history:history}),publicMessage:'Mission chemical plan could not be loaded.'});}
  async searchChemicalIntelligence(_context,query){return supabaseRequest('rest/v1/rpc/ftf_search_chemical_intelligence',{method:'POST',body:JSON.stringify({p_query:query,p_limit:20}),publicMessage:'Chemical Intelligence search could not be loaded.'});}
  async saveMissionChemicalPlan(context,missionId,expectedVersion,payload){const result=await supabaseRequest('rest/v1/rpc/ftf_save_mission_chemical_plan',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_mission_id:missionId,p_expected_version:expectedVersion,p_payload:payload}),publicMessage:'Mission chemical plan could not be saved.'});if(result?.conflict)return{conflict:true,currentVersion:result.current_version};if(result?.not_found)return{notFound:true};if(result?.location_forbidden)return{locationForbidden:true};return{record:result?.record||result,unmatchedReviewCreated:Boolean(result?.unmatched_review_created)};}
  async listChemicalReviews(_context,status){return supabaseRequest('rest/v1/rpc/ftf_list_chemical_reviews',{method:'POST',body:JSON.stringify({p_status:status,p_limit:100}),publicMessage:'Chemical Intelligence reviews could not be loaded.'});}
  async transitionChemicalReview(context,reviewId,expectedVersion,action,payload){const result=await supabaseRequest('rest/v1/rpc/ftf_transition_chemical_review',{method:'POST',body:JSON.stringify({p_actor_internal_user_id:context.internalUser.id,p_review_id:reviewId,p_expected_version:expectedVersion,p_action:action,p_payload:payload}),publicMessage:'Chemical Intelligence review could not be updated.'});if(result?.conflict)return{conflict:true,currentVersion:result.current_version};if(result?.not_found)return{notFound:true};return{record:result?.record||result};}

  async readMissionJsa(context,missionId,history=false){const result=await supabaseRequest('rest/v1/rpc/ftf_read_mission_jsa',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_mission_id:missionId,p_history:history}),publicMessage:'Mission JSA could not be loaded.'});return history?(Array.isArray(result)?result:[]):(Array.isArray(result)?result[0]||null:result||null);}
  async evaluateMissionJsa(context,missionId){return supabaseRequest('rest/v1/rpc/ftf_evaluate_mission_jsa_readiness',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_mission_id:missionId}),publicMessage:'Mission JSA readiness could not be evaluated.'});}
  async saveMissionJsa(context,missionId,expectedVersion,payload){const result=await supabaseRequest('rest/v1/rpc/ftf_save_mission_jsa',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_mission_id:missionId,p_expected_version:expectedVersion,p_payload:payload}),publicMessage:'Mission JSA could not be saved.'});if(result?.conflict)return{conflict:true,currentVersion:result.current_version};if(result?.not_found)return{notFound:true};if(result?.location_forbidden)return{locationForbidden:true};if(result?.lifecycle_conflict)return{lifecycleConflict:true};return{record:result?.record||result};}
  async approveMissionJsa(context,missionId,revisionId,expectedVersion){const result=await supabaseRequest('rest/v1/rpc/ftf_approve_mission_jsa',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_mission_id:missionId,p_revision_id:revisionId,p_expected_version:expectedVersion}),publicMessage:'Mission JSA could not be approved.'});if(result?.conflict)return{conflict:true,currentVersion:result.current_version};for(const key of['not_found','pic_required','pic_forbidden','readiness_blocked','policy_unsatisfied'])if(result?.[key])return{[key.replace(/_([a-z])/g,(_,c)=>c.toUpperCase())]:true,readiness:result.readiness};return{record:result?.record||result,readiness:result?.readiness};}

  async readMissionAuthorisation(context,missionId,history=false){const result=await supabaseRequest('rest/v1/rpc/ftf_read_mission_authorisation',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_mission_id:missionId,p_history:history}),publicMessage:'Mission Authorisation could not be loaded.'});return history?(Array.isArray(result)?result:[]):(Array.isArray(result)?result[0]||null:result||null);}
  async evaluateMissionReadiness(context,missionId){return supabaseRequest('rest/v1/rpc/ftf_evaluate_mission_readiness',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_mission_id:missionId}),publicMessage:'Mission readiness could not be evaluated.'});}
  async authoriseMission(context,missionId,expectedVersion,declaration){const result=await supabaseRequest('rest/v1/rpc/ftf_authorise_mission',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_mission_id:missionId,p_expected_version:expectedVersion,p_declaration:declaration}),publicMessage:'Mission could not be authorised.'});if(result?.conflict)return{conflict:true,currentVersion:result.current_version};for(const key of['not_found','location_forbidden','pic_forbidden','readiness_blocked'])if(result?.[key])return{[key.replace(/_([a-z])/g,(_,c)=>c.toUpperCase())]:true,readiness:result.readiness};return{record:result?.record||result};}
  async readMissionPack(context,missionId,history=false){const result=await supabaseRequest('rest/v1/rpc/ftf_read_mission_pack',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_mission_id:missionId,p_history:history}),publicMessage:'Mission Pack could not be loaded.'});return history?(Array.isArray(result)?result:[]):(Array.isArray(result)?result[0]||null:result||null);}
  async generateMissionPack(context,missionId,authorisationRevisionId,expectedVersion){const result=await supabaseRequest('rest/v1/rpc/ftf_generate_mission_pack',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_mission_id:missionId,p_authorisation_revision_id:authorisationRevisionId,p_expected_version:expectedVersion}),publicMessage:'Mission Pack could not be generated.'});if(result?.conflict)return{conflict:true,currentVersion:result.current_version};if(result?.not_found)return{notFound:true};if(result?.location_forbidden)return{locationForbidden:true};return{record:result?.record||result};}

  async readMissionOperationalCloseout(context,missionId){return supabaseRequest('rest/v1/rpc/ftf_read_mission_operational_closeout',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_mission_id:missionId}),publicMessage:'Mission Operational Closeout could not be loaded.'});}
  async readOrganisationBranding(context){const[organisation,logos]=await Promise.all([supabaseRequest('rest/v1/rpc/ftf_read_organisation_branding',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id}),publicMessage:'Organisation branding could not be loaded.'}),supabaseRequest(`rest/v1/organisation_logo_files?organisation_id=eq.${encodeURIComponent(context.organisation.id)}&select=id,internal_file_id,file_version,original_filename,content_type,byte_size,sha256_checksum,width,height,uploaded_at&order=uploaded_at.desc`,{publicMessage:'Organisation logo history could not be loaded.'})]);const activeId=organisation?.activeLogo?.internalFileId,activeVersion=organisation?.activeLogo?.fileVersion;return{organisation,logos:(logos||[]).map(x=>this.mapOrganisationLogo(x,activeId===x.internal_file_id&&activeVersion===x.file_version))};}
  async updateOrganisationBranding(context,expectedVersion,payload){const result=await supabaseRequest('rest/v1/rpc/ftf_update_organisation_branding',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_expected_version:expectedVersion,p_payload:payload}),publicMessage:'Organisation branding could not be saved.'});return this.mapOrganisationBrandingResult(result);}
  async storeOrganisationLogo(context,payload){const match=typeof payload.dataUrl==='string'&&payload.dataUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/);if(!match)throw Object.assign(new Error('Logo must be a base64 encoded image.'),{status:400,code:'INVALID_LOGO'});const bytes=Buffer.from(match[2],'base64'),metadata=await validateLogoFile({bytes,declaredContentType:match[1],fileName:payload.fileName}),internalFileId=crypto.randomUUID(),fileVersion=1,bucket='organisation-branding',safeName=payload.fileName.replace(/[^A-Za-z0-9._-]/g,'_'),providerKey=`${context.organisation.id}/${internalFileId}/v${fileVersion}/${safeName}`;await supabaseRequest(`storage/v1/object/${bucket}/${providerKey}`,{method:'POST',body:bytes,headers:{'Content-Type':metadata.contentType,'x-upsert':'false'},publicMessage:'Organisation logo could not be stored.'});try{const result=await supabaseRequest('rest/v1/rpc/ftf_record_organisation_logo',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_payload:{internalFileId,fileVersion,originalFilename:payload.fileName.trim(),...metadata,storageProvider:'supabase',storageBucket:bucket,providerKey,provenance:{channel:'ADMIN',uploadedAt:new Date().toISOString()}}}),publicMessage:'Organisation logo provenance could not be retained.'});if(result?.forbidden)throw Object.assign(new Error('You do not have permission for this operation.'),{status:403,code:'FORBIDDEN'});return{record:this.mapOrganisationLogo(result?.record||result,false)};}catch(error){await supabaseRequest(`storage/v1/object/${bucket}/${providerKey}`,{method:'DELETE',publicMessage:'Organisation logo cleanup failed.'}).catch(()=>{});throw error;}}
  async activateOrganisationLogo(context,internalFileId,fileVersion,expectedVersion){const result=await supabaseRequest('rest/v1/rpc/ftf_activate_organisation_logo',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_expected_version:expectedVersion,p_internal_file_id:internalFileId,p_file_version:fileVersion}),publicMessage:'Organisation logo could not be activated.'});return this.mapOrganisationBrandingResult(result);}
  async removeOrganisationLogo(context,expectedVersion){const result=await supabaseRequest('rest/v1/rpc/ftf_remove_organisation_logo',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_expected_version:expectedVersion}),publicMessage:'Organisation logo could not be removed.'});return this.mapOrganisationBrandingResult(result);}
  async requestReportArtefact(context,missionId,reportType,idempotencyKey){const result=await supabaseRequest('rest/v1/rpc/ftf_request_report_artefact',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_mission_id:missionId,p_report_type:reportType,p_idempotency_key:idempotencyKey}),publicMessage:'Report generation could not be requested.'});if(result?.completion_required)return{completionRequired:true};if(result?.operation_started)return{operationStarted:true};if(result?.not_found)return{notFound:true};if(result?.location_forbidden)return{locationForbidden:true};return result;}
  async readReportArtefacts(context,missionId,reportType){return supabaseRequest(`rest/v1/report_artefacts?${tenantFilter(context)}&mission_id=eq.${encodeURIComponent(missionId)}&report_type=eq.${encodeURIComponent(reportType)}&select=id,mission_id,report_type,version_number,status,template_version,created_at,completed_at,error_code,error_message&order=version_number.desc`,{publicMessage:'Report history could not be loaded.'});}
  async readReportOutput(context,missionId,artefactId){const artefacts=await supabaseRequest(`rest/v1/report_artefacts?${tenantFilter(context)}&mission_id=eq.${encodeURIComponent(missionId)}&id=eq.${encodeURIComponent(artefactId)}&status=eq.READY&select=id&limit=1`,{publicMessage:'Report output could not be loaded.'});if(!artefacts?.[0])return null;const rows=await supabaseRequest(`rest/v1/report_output_files?${tenantFilter(context)}&artefact_id=eq.${encodeURIComponent(artefactId)}&select=internal_file_id,file_version,original_filename,content_type,byte_size,sha256_checksum,storage_bucket,provider_key&limit=1`,{publicMessage:'Report output could not be loaded.'}),file=rows?.[0];if(!file)return null;const{supabaseUrl,serviceRoleKey}=getSupabaseConfig(),response=await fetch(`${supabaseUrl}/storage/v1/object/${file.storage_bucket}/${file.provider_key}`,{headers:{apikey:serviceRoleKey,Authorization:`Bearer ${serviceRoleKey}`}});if(!response.ok)throw Object.assign(new Error('Report output could not be downloaded.'),{statusCode:502,publicMessage:'Report output could not be downloaded.'});return{metadata:file,bytes:Buffer.from(await response.arrayBuffer())};}
  mapOrganisationLogo(x,active){return{id:x.id,internalFileId:x.internal_file_id,fileVersion:x.file_version,originalFilename:x.original_filename,contentType:x.content_type,byteSize:Number(x.byte_size),checksum:x.sha256_checksum,width:x.width,height:x.height,uploadedAt:x.uploaded_at,active:Boolean(active)};}
  mapOrganisationBrandingResult(result){if(result?.conflict)return{conflict:true,currentVersion:result.current_version};if(result?.not_found)return{notFound:true};if(result?.forbidden)return{forbidden:true};return{record:result?.record||result};}
  async createMissionOperationalImport(context,missionId,values){const bucket='mission-operational-evidence',safeName=values.fileName.replace(/[^A-Za-z0-9._-]/g,'_'),objectKey=`${context.organisation.id}/${missionId}/${crypto.randomUUID()}/${safeName}`;await supabaseRequest(`storage/v1/object/${bucket}/${objectKey}`,{method:'POST',body:values.bytes,headers:{'Content-Type':values.contentType,'x-upsert':'false'},publicMessage:'Operational source file could not be stored.'});const cleanup=()=>supabaseRequest(`storage/v1/object/${bucket}/${objectKey}`,{method:'DELETE',publicMessage:'Operational source cleanup failed.'}).catch(()=>{});try{const result=await supabaseRequest('rest/v1/rpc/ftf_create_mission_operational_import',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_mission_id:missionId,p_expected_version:values.expectedVersion,p_payload:{storageProvider:'supabase',storageBucket:bucket,storageObjectKey:objectKey,originalFilename:values.fileName,sourceFormat:values.fileType,contentType:values.contentType,fileSizeBytes:values.bytes.length,checksum:values.checksum,evidenceType:values.evidenceType,parseStatus:values.parseStatus,validationResult:values.validationResult,derivedStatistics:values.derivedStatistics,operationalGeometry:values.operationalGeometry,sourceMetadata:{parser:'server'}}}),publicMessage:'Operational import evidence could not be recorded.'});if(result?.conflict||result?.not_found||result?.location_forbidden){await cleanup();return this.mapMissionCloseoutResult(result);}return{record:result?.record||result};}catch(error){await cleanup();throw error;}}
  async saveMissionActualResources(context,missionId,values){return this.writeMissionCloseout('ftf_save_mission_actual_resources',context,missionId,values,'Actual Mission resources could not be saved.');}
  async saveMissionActualChemicals(context,missionId,values){return this.writeMissionCloseout('ftf_save_mission_actual_chemicals',context,missionId,values,'Actual Mission chemical usage could not be saved.');}
  async saveMissionOperationalEvents(context,missionId,values){const result=await supabaseRequest('rest/v1/rpc/ftf_save_mission_operational_events',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_mission_id:missionId,p_expected_version:values.expectedVersion,p_events:values.events}),publicMessage:'Mission operational events could not be saved.'});return this.mapMissionCloseoutResult(result);}
  async submitMissionOperationalEvidence(context,missionId,values){return this.writeMissionCloseout('ftf_submit_mission_operational_evidence',context,missionId,values,'Mission Operational Evidence could not be submitted.');}
  async completeMission(context,missionId,values){const result=await supabaseRequest('rest/v1/rpc/ftf_complete_mission',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_mission_id:missionId,p_operational_revision_id:values.operationalRevisionId,p_expected_version:values.expectedVersion,p_declaration:values.declaration,p_override_reason:values.overrideReason||null}),publicMessage:'Mission could not be completed.'});return this.mapMissionCloseoutResult(result);}
  async readMissionOutcomes(context,missionId){return supabaseRequest('rest/v1/rpc/ftf_read_mission_outcomes',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_mission_id:missionId}),publicMessage:'Mission Outcomes could not be loaded.'});}
  async stageMissionOutcomePhoto(context,missionId,payload){const match=typeof payload.dataUrl==='string'&&payload.dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);if(!match)throw Object.assign(new Error('Only JPEG, PNG or WebP photos are supported.'),{status:400,code:'VALIDATION_ERROR'});const bytes=Buffer.from(match[2],'base64');if(!bytes.length||bytes.length>3145728||Number(payload.sizeBytes)!==bytes.length)throw Object.assign(new Error('Photo size is invalid.'),{status:400,code:'VALIDATION_ERROR'});if(typeof payload.fileName!=='string'||!payload.fileName.trim()||/[\\/\0]/.test(payload.fileName))throw Object.assign(new Error('Photo filename is invalid.'),{status:400,code:'VALIDATION_ERROR'});const bucket='mission-outcome-photos',internalFileId=crypto.randomUUID(),safeName=payload.fileName.replace(/[^A-Za-z0-9._-]/g,'_'),providerKey=`${context.organisation.id}/${missionId}/${internalFileId}/${safeName}`,checksum=crypto.createHash('sha256').update(bytes).digest('hex');await supabaseRequest(`storage/v1/object/${bucket}/${providerKey}`,{method:'POST',body:bytes,headers:{'Content-Type':match[1],'x-upsert':'false'},publicMessage:'Mission Outcome photo could not be stored.'});try{const result=await supabaseRequest('rest/v1/rpc/ftf_stage_mission_outcome_photo',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_mission_id:missionId,p_payload:{internalFileId,originalFilename:payload.fileName.trim(),contentType:match[1],byteSize:bytes.length,checksum,providerKey,caption:String(payload.caption||'').trim()}}),publicMessage:'Mission Outcome photo could not be staged.'});return{record:result?.record||result};}catch(error){await supabaseRequest(`storage/v1/object/${bucket}/${providerKey}`,{method:'DELETE',publicMessage:'Mission Outcome photo cleanup failed.'}).catch(()=>{});throw error;}}
  async createMissionOutcomeObservation(context,missionId,payload){const result=await supabaseRequest('rest/v1/rpc/ftf_create_mission_outcome_observation',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_mission_id:missionId,p_payload:payload}),publicMessage:'Mission Outcome could not be recorded.'});if(result?.completion_required)return{completionRequired:true};return{record:result?.record||result};}
  async writeMissionOutcomeFollowUp(context,missionId,actionId,expectedVersion,payload){const result=await supabaseRequest('rest/v1/rpc/ftf_write_mission_outcome_follow_up',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_mission_id:missionId,p_action_id:actionId,p_expected_version:expectedVersion,p_payload:payload}),publicMessage:'Mission Outcome follow-up could not be saved.'});if(result?.conflict)return{conflict:true};return{record:result?.record||result};}
  async readCustomerAcceptance(context,missionId){return supabaseRequest('rest/v1/rpc/ftf_read_customer_acceptance',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_mission_id:missionId}),publicMessage:'Customer Acceptance could not be loaded.'});}
  async createCustomerAcceptance(context,missionId,payload){const result=await supabaseRequest('rest/v1/rpc/ftf_create_customer_acceptance',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_mission_id:missionId,p_payload:payload}),publicMessage:'Customer acknowledgement could not be recorded.'});return result;}
  async issueCustomerAcceptanceLink(context,missionId,payload){const token=crypto.randomBytes(32).toString('base64url'),tokenHash=crypto.createHash('sha256').update(token).digest('hex');const result=await supabaseRequest('rest/v1/rpc/ftf_issue_customer_acceptance_link',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_mission_id:missionId,p_payload:{...payload,tokenHash}}),publicMessage:'Customer acceptance link could not be issued.'});return{...result,token};}
  async revokeCustomerAcceptanceLink(context,missionId,payload){return supabaseRequest('rest/v1/rpc/ftf_revoke_customer_acceptance_link',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_mission_id:missionId,p_link_id:payload.linkId,p_expected_version:payload.expectedVersion,p_reason:payload.reason}),publicMessage:'Customer acceptance link could not be revoked.'});}
  async resolveCustomerAcceptanceLink(token,fingerprint){return supabaseRequest('rest/v1/rpc/ftf_resolve_customer_acceptance_link',{method:'POST',body:JSON.stringify({p_token_hash:crypto.createHash('sha256').update(token).digest('hex'),p_access_fingerprint:fingerprint}),publicMessage:'Customer acceptance link is unavailable.'});}
  async stageCustomerAcceptanceFile({organisationId,missionId,token,kind,fileName,contentType,bytes,captureTimestamp=null,caption=null}){const tokenHash=crypto.createHash('sha256').update(token).digest('hex');return this.stageCustomerOutcomeFile({organisationId,missionId,kind,fileName,contentType,bytes,captureTimestamp,caption,uploadTokenHash:tokenHash,channel:'SECURE_LINK'});}
  async stageInternalCustomerOutcomeFile(context,missionId,values){return this.stageCustomerOutcomeFile({organisationId:context.organisation.id,missionId,kind:values.kind,fileName:values.fileName,contentType:values.contentType,bytes:values.bytes,captureTimestamp:values.captureTimestamp,caption:values.caption,uploadedByInternalUserId:context.internalUser.id,channel:'OPERATOR'});}
  async stageCustomerOutcomeFile({organisationId,missionId,kind,fileName,contentType,bytes,captureTimestamp=null,caption=null,uploadTokenHash=null,uploadedByInternalUserId=null,channel}){const internalFileId=crypto.randomUUID(),checksum=crypto.createHash('sha256').update(bytes).digest('hex'),bucket='customer-acceptance-evidence',safeName=fileName.replace(/[^A-Za-z0-9._-]/g,'_'),providerKey=`${organisationId}/${missionId}/${internalFileId}/${safeName}`;await supabaseRequest(`storage/v1/object/${bucket}/${providerKey}`,{method:'POST',body:bytes,headers:{'Content-Type':contentType,'x-upsert':'false'},publicMessage:'Customer Outcome file could not be stored.'});try{const rows=await supabaseRequest('rest/v1/customer_outcome_pending_files',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({organisation_id:organisationId,mission_id:missionId,internal_file_id:internalFileId,kind,original_filename:fileName,content_type:contentType,byte_size:bytes.length,sha256_checksum:checksum,storage_provider:'supabase',storage_bucket:bucket,provider_key:providerKey,provenance:{channel,capturedAt:captureTimestamp||new Date().toISOString()},capture_timestamp:captureTimestamp,caption,access_classification:'MISSION_AUTHORISED_USERS',uploaded_by_internal_user_id:uploadedByInternalUserId,upload_token_hash:uploadTokenHash}),publicMessage:'Customer Outcome file provenance could not be retained.'});return{record:Array.isArray(rows)?rows[0]:rows};}catch(error){await supabaseRequest(`storage/v1/object/${bucket}/${providerKey}`,{method:'DELETE',publicMessage:'Customer Outcome file cleanup failed.'}).catch(()=>{});throw error;}}
  async submitCustomerAcceptanceLink(token,fingerprint,payload){return supabaseRequest('rest/v1/rpc/ftf_submit_customer_acceptance_link',{method:'POST',body:JSON.stringify({p_token_hash:crypto.createHash('sha256').update(token).digest('hex'),p_access_fingerprint:fingerprint,p_payload:payload}),publicMessage:'Customer acknowledgement could not be submitted.'});}
  async writeMissionCloseout(fn,context,missionId,values,publicMessage){const result=await supabaseRequest(`rest/v1/rpc/${fn}`,{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_mission_id:missionId,p_expected_version:values.expectedVersion,p_payload:values}),publicMessage});return this.mapMissionCloseoutResult(result);}
  mapMissionCloseoutResult(result){if(result?.conflict)return{conflict:true,currentVersion:result.current_version};for(const key of['not_found','location_forbidden','not_authorised','evidence_incomplete','flight_lines_required','personnel_required'])if(result?.[key])return{[key.replace(/_([a-z])/g,(_,c)=>c.toUpperCase())]:true};return{record:result?.record||result?.records||result};}

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

  async writeDelegated(operation,resource,context,entityId,expectedVersion,data){
    const result=await supabaseRequest('rest/v1/rpc/ftf_delegated_support_write',{method:'POST',body:JSON.stringify({p_session_id:context.supportSession.id,p_platform_user_id:context.platformUser.id,p_resource:resource,p_operation:operation,p_entity_id:entityId,p_expected_version:expectedVersion,p_data:data}),publicMessage:'Delegated operational support action could not be completed.'});
    if(result?.denial_code){const error=new Error(result.denial_code);error.statusCode=403;error.code=result.denial_code;error.publicMessage='The delegated Support Session does not authorise this operation.';throw error;}
    if(result?.conflict)return{conflict:true,currentVersion:result.current_version};if(result?.not_found)return{notFound:true};if(result?.archive_conflict)return{archiveConflict:true};if(result?.relationship_conflict)return{relationshipConflict:true};if(result?.location_forbidden)return{locationForbidden:true};if(result?.lifecycle_conflict)return{lifecycleConflict:true};return{record:result?.record||result};
  }
  async recordDelegatedActivity(context,operation,resource,resourceId,outcome){return supabaseRequest('rest/v1/rpc/record_delegated_support_activity',{method:'POST',body:JSON.stringify({p_session_id:context.supportSession.id,p_platform_user_id:context.platformUser.id,p_operation:operation,p_module_code:resource,p_resource_type:resource,p_resource_id:resourceId,p_outcome:outcome,p_metadata:{}}),publicMessage:'Delegated support activity could not be recorded.'});}
}

module.exports = { OperationalRepository, TABLES, tableFor };
