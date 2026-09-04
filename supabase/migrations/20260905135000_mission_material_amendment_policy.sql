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
  select coalesce(array_agg(key order by key), '{}'::text[]) into v_changed
  from (select jsonb_object_keys(p_before || p_after) key) keys
  where (p_before ? key) is distinct from (p_after ? key)
     or p_before->key is distinct from p_after->key;

  foreach v_key in array v_changed loop
    if v_key = any(array[
      'actualFlightHours','flightBreakdown','actualHectares','actualChemicalQuantity',
      'actualWeatherEvidence','flightLineEvidenceId','receipts','completionNotes','nonSafetyCorrections'
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
  v_field_ids uuid[];
  v_created jsonb;
  v_fresh_manifest jsonb;
  v_authoritative_source_changed boolean;
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

  select array_agg(field_id order by field_order) into v_field_ids from public.mission_pack_fields
  where organisation_id = p_organisation_id and mission_id = p_mission_id and pack_revision_id = v_predecessor.id;
  if p_before ? 'fieldIds' and p_before->'fieldIds' <> to_jsonb(v_field_ids) then
    return jsonb_build_object('error', 'MISSION_AMENDMENT_BEFORE_MISMATCH');
  end if;
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
  if v_authoritative_source_changed and v_policy->>'classification' = 'ADMINISTRATIVE' then
    v_policy := jsonb_set(v_policy, '{classification}', '"MATERIAL"'::jsonb);
    v_policy := jsonb_set(v_policy, '{reasons}', '["UNRECOGNISED_CHANGE"]'::jsonb);
  end if;
  if v_policy->>'classification' = 'MATERIAL' then
    v_created := public.ftf_save_mission_package_scope(
      p_organisation_id, p_actor_internal_user_id, p_mission_id, v_current, to_jsonb(v_field_ids)
    );
    if v_created ? 'error' or v_created ? 'forbidden' or v_created ? 'location_forbidden' then return v_created; end if;
    select * into v_preparing from public.mission_pack_revisions
    where organisation_id = p_organisation_id and mission_id = p_mission_id
      and id = (v_created#>>'{record,id}')::uuid and package_state = 'PREPARING';
    if not found then return jsonb_build_object('error', 'MISSION_AMENDMENT_AFTER_MISMATCH'); end if;
  end if;

  insert into public.mission_package_amendments(
    organisation_id, operating_location_id, mission_id, predecessor_pack_revision_id,
    preparing_pack_revision_id, classification, changed_keys, reasons, before_digest,
    after_digest, amendment_reason, created_by_internal_user_id
  ) values (
    p_organisation_id, v_mission.operating_location_id, p_mission_id, v_predecessor.id,
    v_preparing.id, v_policy->>'classification', array(select jsonb_array_elements_text(v_policy->'changed_keys')),
    array(select jsonb_array_elements_text(v_policy->'reasons')),
    encode(digest(p_before::text, 'sha256'), 'hex'), encode(digest(p_after::text, 'sha256'), 'hex'),
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
  return v_policy || jsonb_build_object('package_revision', case when v_preparing.id is null then null else v_created end);
end;
$$;

revoke all on function public.ftf_create_mission_amendment(uuid,uuid,uuid,integer,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function public.ftf_create_mission_amendment(uuid,uuid,uuid,integer,jsonb,jsonb,text) to service_role;
