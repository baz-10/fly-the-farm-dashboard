-- Additive, prospective Mission-amendment authority. Existing authorised
-- package/JSA revisions remain immutable and continue to govern started days.

create table public.mission_package_amendments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  operating_location_id uuid not null,
  mission_id uuid not null,
  predecessor_pack_revision_id uuid not null,
  preparing_pack_revision_id uuid,
  classification text not null check (classification in ('ADMINISTRATIVE', 'MATERIAL')),
  changed_keys text[] not null check (cardinality(changed_keys) between 1 and 64),
  reasons text[] not null,
  before_values jsonb not null check (jsonb_typeof(before_values) = 'object' and octet_length(before_values::text) <= 65536),
  after_values jsonb not null check (jsonb_typeof(after_values) = 'object' and octet_length(after_values::text) <= 65536),
  before_digest text not null check (before_digest ~ '^[a-f0-9]{64}$'),
  after_digest text not null check (after_digest ~ '^[a-f0-9]{64}$'),
  amendment_reason text not null check (length(amendment_reason) between 1 and 2000 and amendment_reason = btrim(amendment_reason)),
  created_by_internal_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (organisation_id, id),
  foreign key (organisation_id, mission_id) references public.missions (organisation_id, id),
  foreign key (organisation_id, mission_id, predecessor_pack_revision_id)
    references public.mission_pack_revisions (organisation_id, mission_id, id),
  foreign key (organisation_id, mission_id, preparing_pack_revision_id)
    references public.mission_pack_revisions (organisation_id, mission_id, id),
  foreign key (organisation_id, operating_location_id)
    references public.operating_locations (organisation_id, id),
  foreign key (organisation_id, created_by_internal_user_id)
    references public.internal_users (organisation_id, id),
  check ((classification = 'MATERIAL' and preparing_pack_revision_id is not null and cardinality(reasons) > 0)
      or (classification = 'ADMINISTRATIVE' and preparing_pack_revision_id is null and cardinality(reasons) = 0))
);

create index mission_package_amendments_history_idx
  on public.mission_package_amendments (organisation_id, mission_id, created_at desc, id desc);

alter table public.mission_package_amendments enable row level security;
alter table public.mission_package_amendments force row level security;
create policy mission_package_amendments_tenant_read on public.mission_package_amendments
  for select to authenticated using (public.current_user_has_organisation_access(organisation_id));
revoke all on table public.mission_package_amendments from public, anon, authenticated, service_role;
create trigger mission_package_amendments_immutable before update or delete on public.mission_package_amendments
  for each row execute function public.reject_append_only_mutation();

create function public.ftf_classify_mission_amendment(p_before jsonb, p_after jsonb)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_all_keys text[];
  v_changed text[];
  v_reasons text[] := '{}'::text[];
  v_key text;
  v_reason text;
begin
  if p_before is null or p_after is null or jsonb_typeof(p_before) <> 'object' or jsonb_typeof(p_after) <> 'object'
    or (select count(*) from jsonb_object_keys(p_before)) > 64
    or (select count(*) from jsonb_object_keys(p_after)) > 64
    or octet_length(p_before::text) > 65536 or octet_length(p_after::text) > 65536 then
    raise exception 'MISSION_AMENDMENT_INPUT_INVALID' using errcode = '22023';
  end if;
  select coalesce(array_agg(key order by key), '{}'::text[]) into v_all_keys
  from (select jsonb_object_keys(p_before || p_after) key) keys;
  if cardinality(v_all_keys) > 64 then
    raise exception 'MISSION_AMENDMENT_INPUT_INVALID' using errcode = '22023';
  end if;
  select coalesce(array_agg(key order by key), '{}'::text[]) into v_changed
  from (select jsonb_object_keys(p_before || p_after) key) keys
  where (p_before ? key) is distinct from (p_after ? key)
     or p_before->key is distinct from p_after->key;

  foreach v_key in array v_changed loop
    if v_key = any(array[
      'actualFlightHours','flightBreakdown','actualHectares','actualChemicalQuantity',
      'actualWeatherEvidence','flightLineEvidenceId','completionNotes'
    ]) then continue; end if;
    v_reason := case v_key
      when 'fieldIds' then 'FIELD_SCOPE_CHANGED'
      when 'targetAreaHectares' then 'TARGET_AREA_CHANGED'
      when 'aircraftIds' then 'AIRCRAFT_ASSIGNMENT_CHANGED'
      when 'regulatedCrewIds' then 'REGULATED_CREW_CHANGED'
      when 'chemicalProductIds' then 'CHEMICAL_PRODUCT_CHANGED'
      when 'applicationMethod' then 'APPLICATION_METHOD_CHANGED'
      when 'governedRate' then 'GOVERNED_RATE_CHANGED'
      when 'jsaHazards' then 'JSA_HAZARDS_CHANGED'
      when 'jsaControls' then 'JSA_CONTROLS_CHANGED'
      when 'safetyMapFeatures' then 'SAFETY_MAP_CHANGED'
      when 'operationalPermissions' then 'OPERATIONAL_PERMISSION_CHANGED'
      else 'UNRECOGNISED_CHANGE'
    end;
    if not v_reason = any(v_reasons) then v_reasons := array_append(v_reasons, v_reason); end if;
  end loop;
  return jsonb_build_object(
    'classification', case when cardinality(v_reasons) > 0 then 'MATERIAL' else 'ADMINISTRATIVE' end,
    'reasons', to_jsonb(v_reasons), 'changed_keys', to_jsonb(v_changed)
  );
end;
$$;

revoke all on function public.ftf_classify_mission_amendment(jsonb,jsonb) from public, anon, authenticated, service_role;

create function public.ftf_derive_mission_material_changed_keys(p_before_manifest jsonb, p_after_manifest jsonb)
returns text[]
language plpgsql
immutable
security invoker
set search_path = public, pg_temp
as $$
declare v_keys text[] := '{}'::text[]; v_dimension text;
begin
  if p_before_manifest is null or p_after_manifest is null
    or jsonb_typeof(p_before_manifest) <> 'object' or jsonb_typeof(p_after_manifest) <> 'object' then
    raise exception 'MISSION_AMENDMENT_INPUT_INVALID' using errcode = '22023';
  end if;
  if p_before_manifest->'schemaVersion' is distinct from p_after_manifest->'schemaVersion' then v_keys := array_append(v_keys,'sourceManifestSchema'); end if;
  if (p_before_manifest->'mission') - 'rowVersion' is distinct from (p_after_manifest->'mission') - 'rowVersion' then v_keys := array_append(v_keys,'missionAuthority'); end if;
  if p_before_manifest->'job' is distinct from p_after_manifest->'job' then v_keys := array_append(v_keys,'jobAuthority'); end if;
  if p_before_manifest->'fieldIds' is distinct from p_after_manifest->'fieldIds' then v_keys := array_append(v_keys,'fieldIds'); end if;
  if p_before_manifest->'fieldScope' is distinct from p_after_manifest->'fieldScope' then v_keys := array_append(v_keys,'targetAreaHectares'); end if;
  if p_before_manifest->'jsa' is distinct from p_after_manifest->'jsa' then v_keys := v_keys || array['jsaControls','jsaHazards']; end if;
  if p_before_manifest->'personnel' is distinct from p_after_manifest->'personnel' then v_keys := array_append(v_keys,'regulatedCrewIds'); end if;
  if p_before_manifest->'chemicals' is distinct from p_after_manifest->'chemicals' then v_keys := v_keys || array['applicationMethod','chemicalProductIds','governedRate']; end if;
  if p_before_manifest->'map' is distinct from p_after_manifest->'map' then v_keys := array_append(v_keys,'safetyMapFeatures'); end if;
  if p_before_manifest->'weather' is distinct from p_after_manifest->'weather' then v_keys := array_append(v_keys,'weatherAuthority'); end if;
  if p_before_manifest->'aircraftAssignments' is distinct from p_after_manifest->'aircraftAssignments' then v_keys := array_append(v_keys,'aircraftIds'); end if;
  if p_before_manifest->'equipmentAssignments' is distinct from p_after_manifest->'equipmentAssignments' then v_keys := array_append(v_keys,'equipmentAssignments'); end if;
  if p_before_manifest->'readiness' is distinct from p_after_manifest->'readiness' then v_keys := array_append(v_keys,'operationalPermissions'); end if;
  for v_dimension in select jsonb_object_keys(p_before_manifest || p_after_manifest) loop
    if not v_dimension = any(array['schemaVersion','mission','job','fieldIds','fieldScope','jsa','personnel','chemicals','map','weather','aircraftAssignments','equipmentAssignments','readiness'])
      and ((p_before_manifest ? v_dimension) is distinct from (p_after_manifest ? v_dimension)
        or p_before_manifest->v_dimension is distinct from p_after_manifest->v_dimension) then
      v_keys := array_append(v_keys,'sourceManifest.' || v_dimension);
    end if;
  end loop;
  select coalesce(array_agg(key order by key), '{}'::text[]) into v_keys from unnest(v_keys) key;
  return v_keys;
end;
$$;

revoke all on function public.ftf_derive_mission_material_changed_keys(jsonb,jsonb) from public, anon, authenticated, service_role;

create function public.ftf_project_mission_amendment_values(p_manifest jsonb, p_keys text[])
returns jsonb
language plpgsql
immutable
security invoker
set search_path = public, pg_temp
as $$
declare v_result jsonb := '{}'::jsonb; v_key text; v_value jsonb;
begin
  foreach v_key in array p_keys loop
    v_value := case v_key
      when 'fieldIds' then p_manifest->'fieldIds'
      when 'targetAreaHectares' then p_manifest->'fieldScope'
      when 'aircraftIds' then p_manifest->'aircraftAssignments'
      when 'regulatedCrewIds' then p_manifest->'personnel'
      when 'chemicalProductIds' then p_manifest->'chemicals'
      when 'applicationMethod' then p_manifest->'chemicals'
      when 'governedRate' then p_manifest->'chemicals'
      when 'jsaHazards' then p_manifest->'jsa'
      when 'jsaControls' then p_manifest->'jsa'
      when 'safetyMapFeatures' then p_manifest->'map'
      when 'operationalPermissions' then p_manifest->'readiness'
      else p_manifest
    end;
    v_result := v_result || jsonb_build_object(v_key, coalesce(v_value, 'null'::jsonb));
  end loop;
  return v_result;
end;
$$;

create function public.ftf_validate_mission_administrative_evidence(
  p_organisation_id uuid, p_mission_id uuid, p_key text, p_value jsonb, p_allow_null boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_event public.audit_events%rowtype; v_event_id uuid; v_allowed text[];
begin
  if p_value = 'null'::jsonb and p_allow_null then return 'null'::jsonb; end if;
  if p_value is null or jsonb_typeof(p_value) <> 'object'
    or (select array_agg(key order by key) from jsonb_object_keys(p_value) key) <> array['auditEventId']::text[] then
    return null;
  end if;
  begin v_event_id := (p_value->>'auditEventId')::uuid; exception when others then return null; end;
  v_allowed := case p_key
    when 'actualFlightHours' then array['mission.aircraft_day.actuals_saved']
    when 'flightBreakdown' then array['mission.aircraft_day.actuals_saved']
    when 'actualHectares' then array['mission.operating_day.field_activity_saved']
    when 'actualChemicalQuantity' then array['mission.day_chemicals.confirmed']
    when 'actualWeatherEvidence' then array['mission.day_weather.frozen']
    when 'flightLineEvidenceId' then array['mission.operational_import_created']
    when 'completionNotes' then array['mission.operating_day.completed']
    else null
  end;
  if v_allowed is null then return null; end if;
  select * into v_event from public.audit_events
  where organisation_id = p_organisation_id and id = v_event_id
    and event_type = any(v_allowed) and event_payload->>'mission_id' = p_mission_id::text;
  if not found then return null; end if;
  return jsonb_build_object('auditEventId',v_event.id,'eventType',v_event.event_type,'createdAt',v_event.created_at);
end;
$$;

revoke all on function public.ftf_project_mission_amendment_values(jsonb,text[]) from public, anon, authenticated, service_role;
revoke all on function public.ftf_validate_mission_administrative_evidence(uuid,uuid,text,jsonb,boolean) from public, anon, authenticated, service_role;

create function public.ftf_create_mission_amendment(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_mission_id uuid,
  p_expected_revision integer,
  p_before jsonb,
  p_after jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mission public.missions%rowtype;
  v_predecessor public.mission_pack_revisions%rowtype;
  v_current integer;
  v_policy jsonb;
  v_changed_keys text[];
  v_key text;
  v_authoritative_before jsonb := '{}'::jsonb;
  v_authoritative_after jsonb := '{}'::jsonb;
  v_evidence jsonb;
  v_field_ids uuid[];
  v_created jsonb;
  v_fresh_manifest jsonb;
  v_authoritative_source_changed boolean;
  v_derived_material_keys text[];
  v_preparing public.mission_pack_revisions%rowtype;
  v_amendment public.mission_package_amendments%rowtype;
begin
  perform public.ftf_lock_mission_package_aggregate(p_organisation_id, p_mission_id);
  if not public.ftf_actor_has_active_beta_seat(p_organisation_id, p_actor_internal_user_id)
    or not public.ftf_actor_has_permission(p_organisation_id, p_actor_internal_user_id, 'mission.pack.generate') then
    return jsonb_build_object('forbidden', true);
  end if;
  select * into v_mission from public.missions
  where organisation_id = p_organisation_id and id = p_mission_id and archived_at is null for update;
  if not found then return jsonb_build_object('error', 'MISSION_PACKAGE_NOT_FOUND'); end if;
  if not public.ftf_operational_location_allowed(p_organisation_id, p_actor_internal_user_id, v_mission.operating_location_id) then
    return jsonb_build_object('location_forbidden', true);
  end if;
  select coalesce(max(version_number), 0) into v_current from public.mission_pack_revisions
  where organisation_id = p_organisation_id and mission_id = p_mission_id;
  if p_expected_revision is null or p_expected_revision <> v_current then
    return jsonb_build_object('error', 'MISSION_PACKAGE_VERSION_CONFLICT', 'current_version', v_current);
  end if;
  select * into v_predecessor from public.mission_pack_revisions
  where organisation_id = p_organisation_id and mission_id = p_mission_id
    and id = v_mission.current_authorised_pack_revision_id;
  if not found then return jsonb_build_object('error', 'MISSION_NOT_AUTHORISED'); end if;
  if p_reason is null or length(p_reason) not between 1 and 2000 or p_reason <> btrim(p_reason) then
    return jsonb_build_object('error', 'MISSION_AMENDMENT_REASON_INVALID');
  end if;
  begin
    v_policy := public.ftf_classify_mission_amendment(p_before, p_after);
  exception when sqlstate '22023' then
    return jsonb_build_object('error', 'MISSION_AMENDMENT_INPUT_INVALID');
  end;
  if jsonb_array_length(v_policy->'changed_keys') = 0 then
    return jsonb_build_object('error', 'MISSION_AMENDMENT_NO_CHANGE');
  end if;
  select array_agg(value order by value) into v_changed_keys from jsonb_array_elements_text(v_policy->'changed_keys') value;

  select array_agg(field_id order by field_order) into v_field_ids from public.mission_pack_fields
  where organisation_id = p_organisation_id and mission_id = p_mission_id and pack_revision_id = v_predecessor.id;
  if p_after ? 'fieldIds' then
    begin
      select array_agg(value::uuid order by ordinal) into v_field_ids
      from jsonb_array_elements_text(p_after->'fieldIds') with ordinality fields(value, ordinal);
    exception when others then
      return jsonb_build_object('error', 'MISSION_AMENDMENT_AFTER_MISMATCH');
    end;
  end if;
  v_fresh_manifest := public.ftf_build_mission_package_source_manifest(p_organisation_id, p_mission_id, v_field_ids);
  if v_fresh_manifest is null then return jsonb_build_object('error', 'MISSION_AMENDMENT_AFTER_MISMATCH'); end if;
  -- Authorisation advances the Mission row version when it installs the
  -- effective package pointer; that self-referential pointer write is not an
  -- operational amendment. Compare all other frozen authority inputs.
  v_authoritative_source_changed := (coalesce(v_predecessor.source_manifest, '{}'::jsonb) #- '{mission,rowVersion}')
    is distinct from (v_fresh_manifest #- '{mission,rowVersion}');
  if v_authoritative_source_changed then
    v_derived_material_keys := public.ftf_derive_mission_material_changed_keys(v_predecessor.source_manifest,v_fresh_manifest);
    if v_changed_keys is distinct from v_derived_material_keys then
      return jsonb_build_object('error', 'MISSION_AMENDMENT_KEY_SET_MISMATCH');
    end if;
    v_authoritative_before := public.ftf_project_mission_amendment_values(v_predecessor.source_manifest, v_derived_material_keys);
    v_authoritative_after := public.ftf_project_mission_amendment_values(v_fresh_manifest, v_derived_material_keys);
    if p_before <> v_authoritative_before then return jsonb_build_object('error', 'MISSION_AMENDMENT_BEFORE_MISMATCH'); end if;
    if p_after <> v_authoritative_after then return jsonb_build_object('error', 'MISSION_AMENDMENT_AFTER_MISMATCH'); end if;
    v_policy := public.ftf_classify_mission_amendment(v_authoritative_before,v_authoritative_after);
    v_created := public.ftf_save_mission_package_scope(
      p_organisation_id, p_actor_internal_user_id, p_mission_id, v_current, to_jsonb(v_field_ids)
    );
    if v_created ? 'error' or v_created ? 'forbidden' or v_created ? 'location_forbidden' then return v_created; end if;
    select * into v_preparing from public.mission_pack_revisions
    where organisation_id = p_organisation_id and mission_id = p_mission_id
      and id = (v_created#>>'{record,id}')::uuid and package_state = 'PREPARING';
    if not found then return jsonb_build_object('error', 'MISSION_AMENDMENT_AFTER_MISMATCH'); end if;
    if v_preparing.source_manifest <> v_fresh_manifest then return jsonb_build_object('error', 'MISSION_AMENDMENT_AFTER_MISMATCH'); end if;
  else
    if v_policy->>'classification' <> 'ADMINISTRATIVE' then
      return jsonb_build_object('error', 'MISSION_AMENDMENT_KEY_SET_MISMATCH');
    end if;
    foreach v_key in array v_changed_keys loop
      v_evidence := public.ftf_validate_mission_administrative_evidence(
        p_organisation_id,p_mission_id,v_key,p_before->v_key,true
      );
      if v_evidence is null then return jsonb_build_object('error', 'MISSION_AMENDMENT_EVIDENCE_INVALID'); end if;
      v_authoritative_before := v_authoritative_before || jsonb_build_object(v_key,v_evidence);
      v_evidence := public.ftf_validate_mission_administrative_evidence(
        p_organisation_id,p_mission_id,v_key,p_after->v_key,false
      );
      if v_evidence is null then return jsonb_build_object('error', 'MISSION_AMENDMENT_EVIDENCE_INVALID'); end if;
      v_authoritative_after := v_authoritative_after || jsonb_build_object(v_key,v_evidence);
    end loop;
  end if;

  insert into public.mission_package_amendments(
    organisation_id, operating_location_id, mission_id, predecessor_pack_revision_id,
    preparing_pack_revision_id, classification, changed_keys, reasons, before_values, after_values, before_digest,
    after_digest, amendment_reason, created_by_internal_user_id
  ) values (
    p_organisation_id, v_mission.operating_location_id, p_mission_id, v_predecessor.id,
    v_preparing.id, v_policy->>'classification', array(select jsonb_array_elements_text(v_policy->'changed_keys')),
    array(select jsonb_array_elements_text(v_policy->'reasons')),
    v_authoritative_before, v_authoritative_after,
    encode(sha256(convert_to(v_authoritative_before::text, 'UTF8')), 'hex'), encode(sha256(convert_to(v_authoritative_after::text, 'UTF8')), 'hex'),
    p_reason, p_actor_internal_user_id
  ) returning * into v_amendment;
  insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)
  values(p_organisation_id,p_actor_internal_user_id,'mission.amendment_recorded','mission',p_mission_id,
    jsonb_build_object('amendment_id',v_amendment.id,'classification',v_amendment.classification,
      'changed_keys',v_policy->'changed_keys','reasons',v_policy->'reasons','predecessor_pack_revision_id',v_predecessor.id,
      'preparing_pack_revision_id',v_preparing.id));
  insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)
  values(p_organisation_id,'operational.mission.amendment_recorded','mission',p_mission_id,
    jsonb_build_object('amendment_id',v_amendment.id,'classification',v_amendment.classification,
      'predecessor_pack_revision_id',v_predecessor.id,'preparing_pack_revision_id',v_preparing.id));
  return v_policy || jsonb_build_object('before_values',v_authoritative_before,'after_values',v_authoritative_after,
    'package_revision', case when v_preparing.id is null then null else v_created end);
end;
$$;

revoke all on function public.ftf_create_mission_amendment(uuid,uuid,uuid,integer,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function public.ftf_create_mission_amendment(uuid,uuid,uuid,integer,jsonb,jsonb,text) to service_role;

create function public.ftf_read_mission_amendment_history(
  p_organisation_id uuid, p_actor_internal_user_id uuid, p_mission_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_mission public.missions%rowtype;
begin
  if not public.ftf_actor_has_active_beta_seat(p_organisation_id,p_actor_internal_user_id)
    or not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'mission.pack.read') then
    return jsonb_build_object('forbidden',true);
  end if;
  select * into v_mission from public.missions
  where organisation_id=p_organisation_id and id=p_mission_id and archived_at is null;
  if not found then return jsonb_build_object('error','MISSION_PACKAGE_NOT_FOUND'); end if;
  if not public.ftf_operational_location_allowed(p_organisation_id,p_actor_internal_user_id,v_mission.operating_location_id) then
    return jsonb_build_object('location_forbidden',true);
  end if;
  return jsonb_build_object('records',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',amendment.id,'missionId',amendment.mission_id,
      'predecessorPackRevisionId',amendment.predecessor_pack_revision_id,
      'preparingPackRevisionId',amendment.preparing_pack_revision_id,
      'classification',amendment.classification,'changedKeys',to_jsonb(amendment.changed_keys),
      'reasons',to_jsonb(amendment.reasons),'beforeValues',amendment.before_values,
      'afterValues',amendment.after_values,'amendmentReason',amendment.amendment_reason,
      'createdByInternalUserId',amendment.created_by_internal_user_id,'createdAt',amendment.created_at
    ) order by amendment.created_at desc,amendment.id desc)
    from (select * from public.mission_package_amendments
      where organisation_id=p_organisation_id and mission_id=p_mission_id
      order by created_at desc,id desc limit 100) amendment
  ),'[]'::jsonb));
end;
$$;

revoke all on function public.ftf_read_mission_amendment_history(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.ftf_read_mission_amendment_history(uuid,uuid,uuid) to service_role;
