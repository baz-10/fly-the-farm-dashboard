-- Additive Mission scope/CRP authority. The existing mission_pack_revisions
-- and mission_authorisation_revisions remain the only package and decision
-- streams. No Production application is authorised by this migration file.

alter table public.mission_pack_revisions
  alter column authorisation_revision_id drop not null,
  alter column authorisation_version drop not null,
  add column job_id uuid,
  add column package_state text,
  add column jsa_revision_id uuid,
  add column evidence_digest text,
  add column source_manifest jsonb,
  add column submitted_at timestamptz,
  add constraint mission_pack_revisions_package_state_check
    check (package_state is null or package_state in ('PREPARING', 'AWAITING_CRP_APPROVAL')),
  add constraint mission_pack_revisions_evidence_digest_check
    check (evidence_digest is null or evidence_digest ~ '^[a-f0-9]{64}$'),
  add constraint mission_pack_revisions_source_manifest_check
    check (source_manifest is null or jsonb_typeof(source_manifest) = 'object'),
  add constraint mission_pack_revisions_job_fk
    foreign key (organisation_id, job_id) references public.jobs (organisation_id, id),
  add constraint mission_pack_revisions_jsa_fk
    foreign key (organisation_id, jsa_revision_id) references public.mission_jsa_revisions (organisation_id, id),
  add constraint mission_pack_revisions_mission_identity unique (organisation_id, mission_id, id);

alter table public.mission_authorisation_revisions
  add column mission_pack_revision_id uuid,
  add column decision text not null default 'AUTHORISED',
  add column evidence_digest text,
  add constraint mission_authorisation_revisions_decision_check
    check (decision in ('AUTHORISED', 'REJECTED')),
  add constraint mission_authorisation_revisions_evidence_digest_check
    check (evidence_digest is null or evidence_digest ~ '^[a-f0-9]{64}$'),
  add constraint mission_authorisation_revisions_pack_fk
    foreign key (organisation_id, mission_id, mission_pack_revision_id)
      references public.mission_pack_revisions (organisation_id, mission_id, id),
  add constraint mission_authorisation_revisions_one_decision
    unique (organisation_id, mission_pack_revision_id);

alter table public.missions
  add column current_authorised_pack_revision_id uuid,
  add constraint missions_current_authorised_pack_fk
    foreign key (organisation_id, id, current_authorised_pack_revision_id)
      references public.mission_pack_revisions (organisation_id, mission_id, id);

create table public.mission_pack_fields (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  operating_location_id uuid not null,
  mission_id uuid not null,
  job_id uuid not null,
  pack_revision_id uuid not null,
  property_id uuid not null,
  field_id uuid not null,
  field_order integer not null check (field_order > 0),
  created_at timestamptz not null default now(),
  unique (organisation_id, id),
  unique (organisation_id, pack_revision_id, field_id),
  unique (organisation_id, pack_revision_id, field_order),
  foreign key (organisation_id, mission_id, pack_revision_id)
    references public.mission_pack_revisions (organisation_id, mission_id, id),
  foreign key (organisation_id, mission_id)
    references public.missions (organisation_id, id),
  foreign key (organisation_id, job_id)
    references public.jobs (organisation_id, id),
  foreign key (organisation_id, property_id, field_id)
    references public.fields (organisation_id, property_id, id),
  foreign key (organisation_id, operating_location_id)
    references public.operating_locations (organisation_id, id)
);

create index mission_pack_fields_history_idx
  on public.mission_pack_fields (organisation_id, mission_id, pack_revision_id, field_order);

alter table public.mission_pack_fields enable row level security;
alter table public.mission_pack_fields force row level security;
create policy mission_pack_fields_tenant_read on public.mission_pack_fields
  for select to authenticated
  using (public.current_user_has_organisation_access(organisation_id));
revoke all on table public.mission_pack_fields from public, anon, authenticated, service_role;
revoke insert, update, delete on table public.mission_pack_revisions from service_role;
revoke insert, update, delete on table public.mission_authorisation_revisions from service_role;

create trigger mission_pack_revisions_immutable
  before update or delete on public.mission_pack_revisions
  for each row execute function public.reject_append_only_mutation();
create trigger mission_authorisation_revisions_immutable
  before update or delete on public.mission_authorisation_revisions
  for each row execute function public.reject_append_only_mutation();
create trigger mission_pack_fields_immutable
  before update or delete on public.mission_pack_fields
  for each row execute function public.reject_append_only_mutation();

-- Keep the established Mission Authorisation endpoints compatible while the
-- focused API shares their canonical streams. Rejections are decisions, not
-- effective authorisations; preparing/rejected packages are not legacy packs.
create or replace function public.ftf_read_mission_authorisation(
  p_organisation_id uuid,
  p_mission_id uuid,
  p_history boolean default false
)
returns setof jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select to_jsonb(a)
  from public.mission_authorisation_revisions a
  where a.organisation_id = p_organisation_id
    and a.mission_id = p_mission_id
    and a.decision = 'AUTHORISED'
  order by a.version_number desc
  limit case when p_history then 2147483647 else 1 end
$$;

create or replace function public.ftf_read_mission_pack(
  p_organisation_id uuid,
  p_mission_id uuid,
  p_history boolean default false
)
returns setof jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select case
    when decision.id is null then to_jsonb(package)
    else to_jsonb(package) || jsonb_build_object(
      'authorisation_revision_id', decision.id,
      'authorisation_version', decision.version_number
    )
  end
  from public.mission_pack_revisions package
  left join public.mission_authorisation_revisions decision
    on decision.organisation_id = package.organisation_id
   and decision.mission_pack_revision_id = package.id
   and decision.decision = 'AUTHORISED'
  where package.organisation_id = p_organisation_id
    and package.mission_id = p_mission_id
    and (package.package_state is null or decision.id is not null)
  order by package.version_number desc
  limit case when p_history then 2147483647 else 1 end
$$;

create or replace function public.ftf_generate_mission_pack(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_mission_id uuid,
  p_authorisation_revision_id uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  a public.mission_authorisation_revisions%rowtype;
  current integer;
  p public.mission_pack_revisions%rowtype;
begin
  select * into a from public.mission_authorisation_revisions
  where organisation_id = p_organisation_id
    and mission_id = p_mission_id
    and id = p_authorisation_revision_id
    and decision = 'AUTHORISED';
  if not found then return jsonb_build_object('not_found', true); end if;
  if not public.ftf_operational_location_allowed(p_organisation_id, p_actor_internal_user_id, a.operating_location_id) then
    return jsonb_build_object('location_forbidden', true);
  end if;
  select coalesce(max(version_number), 0) into current from public.mission_pack_revisions
  where organisation_id = p_organisation_id and mission_id = p_mission_id;
  if current <> p_expected_version then
    return jsonb_build_object('conflict', true, 'current_version', current);
  end if;
  insert into public.mission_pack_revisions (
    organisation_id, operating_location_id, mission_id, version_number,
    authorisation_revision_id, authorisation_version, pack_snapshot,
    generated_by_internal_user_id
  ) values (
    p_organisation_id, a.operating_location_id, p_mission_id, current + 1,
    a.id, a.version_number,
    jsonb_build_object(
      'schemaVersion', 1,
      'title', 'Spray Command Mission Pack',
      'authorisation', to_jsonb(a),
      'evidence', a.evidence_manifest,
      'readiness', a.readiness_snapshot
    ),
    p_actor_internal_user_id
  ) returning * into p;
  insert into public.audit_events (
    organisation_id, actor_internal_user_id, event_type, entity_type, entity_id, event_payload
  ) values (
    p_organisation_id, p_actor_internal_user_id, 'mission.pack_generated', 'mission', p_mission_id,
    jsonb_build_object('pack_revision_id', p.id, 'authorisation_revision_id', a.id, 'version', p.version_number)
  );
  insert into public.transactional_outbox (organisation_id, topic, aggregate_type, aggregate_id, payload)
  values (
    p_organisation_id, 'completion.mission.pack_generated', 'mission', p_mission_id,
    jsonb_build_object('pack_revision_id', p.id, 'authorisation_revision_id', a.id, 'version', p.version_number)
  );
  return jsonb_build_object('record', to_jsonb(p));
end;
$$;

create function public.ftf_build_mission_package_source_manifest(
  p_organisation_id uuid,
  p_mission_id uuid,
  p_field_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mission public.missions%rowtype;
  v_job public.jobs%rowtype;
  v_jsa public.mission_jsa_revisions%rowtype;
  v_personnel public.mission_personnel_revisions%rowtype;
  v_chemicals public.mission_chemical_plan_revisions%rowtype;
  v_map public.mission_map_revisions%rowtype;
  v_weather public.mission_weather_selections%rowtype;
  v_readiness jsonb;
begin
  select * into v_mission
  from public.missions
  where organisation_id = p_organisation_id and id = p_mission_id and archived_at is null;
  if not found then return null; end if;
  select * into v_job
  from public.jobs
  where organisation_id = p_organisation_id and id = v_mission.job_id and archived_at is null;
  if not found then return null; end if;

  select * into v_jsa from public.mission_jsa_revisions
  where organisation_id = p_organisation_id and mission_id = p_mission_id
  order by version_number desc limit 1;
  select * into v_personnel from public.mission_personnel_revisions
  where organisation_id = p_organisation_id and mission_id = p_mission_id
  order by version_number desc limit 1;
  select * into v_chemicals from public.mission_chemical_plan_revisions
  where organisation_id = p_organisation_id and mission_id = p_mission_id
  order by version_number desc limit 1;
  select * into v_map from public.mission_map_revisions
  where organisation_id = p_organisation_id and mission_id = p_mission_id
  order by version_number desc limit 1;
  select * into v_weather from public.mission_weather_selections
  where organisation_id = p_organisation_id and mission_id = p_mission_id
  order by selection_version desc limit 1;
  v_readiness := public.ftf_evaluate_mission_readiness(p_organisation_id, p_mission_id, now());

  return jsonb_build_object(
    'schemaVersion', 'MISSION_PACKAGE_SOURCE_V1',
    'mission', jsonb_build_object('id', v_mission.id, 'rowVersion', v_mission.row_version),
    'job', jsonb_build_object('id', v_job.id, 'rowVersion', v_job.row_version, 'clientId', v_job.client_id),
    'fieldIds', to_jsonb(p_field_ids),
    'fieldScope', coalesce((
      select jsonb_agg(jsonb_build_object(
        'jobFieldId', job_field.id,
        'jobFieldRowVersion', job_field.row_version,
        'fieldId', field.id,
        'fieldRowVersion', field.row_version,
        'propertyId', property.id,
        'propertyRowVersion', property.row_version,
        'targetAreaHectares', job_field.target_area_hectares
      ) order by requested.field_order)
      from unnest(p_field_ids) with ordinality requested(field_id, field_order)
      join public.job_fields job_field
        on job_field.organisation_id = p_organisation_id
       and job_field.job_id = v_job.id
       and job_field.field_id = requested.field_id
       and job_field.archived_at is null
      join public.fields field
        on field.organisation_id = job_field.organisation_id
       and field.id = job_field.field_id
       and field.property_id = job_field.property_id
       and field.archived_at is null
      join public.properties property
        on property.organisation_id = field.organisation_id
       and property.id = field.property_id
       and property.client_id = v_job.client_id
       and property.archived_at is null
    ), '[]'::jsonb),
    'jsa', case when v_jsa.id is null then null else jsonb_build_object('id', v_jsa.id, 'version', v_jsa.version_number) end,
    'personnel', case when v_personnel.id is null then null else jsonb_build_object('id', v_personnel.id, 'version', v_personnel.version_number) end,
    'chemicals', case when v_chemicals.id is null then null else jsonb_build_object('id', v_chemicals.id, 'version', v_chemicals.version_number) end,
    'map', case when v_map.id is null then null else jsonb_build_object('id', v_map.id, 'version', v_map.version_number) end,
    'weather', case when v_weather.id is null then null else jsonb_build_object('selectionId', v_weather.id, 'selectionVersion', v_weather.selection_version, 'observationId', v_weather.observation_id, 'observationVersion', v_weather.observation_version) end,
    'aircraftAssignments', coalesce((
      select jsonb_agg(jsonb_build_object('id', assignment.id, 'aircraftId', assignment.aircraft_id, 'aircraftRowVersion', aircraft.row_version) order by assignment.id)
      from public.mission_aircraft_assignments assignment
      join public.aircraft aircraft
        on aircraft.organisation_id = assignment.organisation_id and aircraft.id = assignment.aircraft_id
      where assignment.organisation_id = p_organisation_id
        and assignment.mission_id = p_mission_id
        and assignment.unassigned_at is null
    ), '[]'::jsonb),
    'equipmentAssignments', coalesce((
      select jsonb_agg(jsonb_build_object('id', assignment.id, 'equipmentKitId', assignment.equipment_kit_id, 'equipmentKitRowVersion', equipment_kit.row_version) order by assignment.id)
      from public.mission_equipment_kit_assignments assignment
      join public.equipment_kits equipment_kit
        on equipment_kit.organisation_id = assignment.organisation_id and equipment_kit.id = assignment.equipment_kit_id
      where assignment.organisation_id = p_organisation_id
        and assignment.mission_id = p_mission_id
        and assignment.unassigned_at is null
    ), '[]'::jsonb),
    'readiness', jsonb_build_object(
      'ready', coalesce((v_readiness->>'ready')::boolean, false),
      'overallState', v_readiness->>'overallState',
      'blockerCodes', coalesce((select jsonb_agg(item->>'code' order by item->>'code') from jsonb_array_elements(coalesce(v_readiness->'blockers', '[]'::jsonb)) item), '[]'::jsonb),
      'warningCodes', coalesce((select jsonb_agg(item->>'code' order by item->>'code') from jsonb_array_elements(coalesce(v_readiness->'warnings', '[]'::jsonb)) item), '[]'::jsonb)
    )
  );
end;
$$;

create function public.ftf_mission_package_digest(p_manifest jsonb)
returns text
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
  select encode(digest(convert_to(p_manifest::text, 'UTF8'), 'sha256'), 'hex')
$$;

create function public.ftf_save_mission_package_scope(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_mission_id uuid,
  p_expected_revision integer,
  p_field_ids jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mission public.missions%rowtype;
  v_job public.jobs%rowtype;
  v_current integer;
  v_count integer;
  v_distinct integer;
  v_valid boolean;
  v_resolved integer;
  v_field_ids uuid[];
  v_manifest jsonb;
  v_digest text;
  v_jsa_id uuid;
  v_readiness jsonb;
  v_pack public.mission_pack_revisions%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext(p_organisation_id::text)::bigint);
  perform pg_advisory_xact_lock(hashtext(p_organisation_id::text), hashtext(p_mission_id::text));
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
  select * into v_job from public.jobs
  where organisation_id = p_organisation_id and id = v_mission.job_id and archived_at is null for update;
  if not found then return jsonb_build_object('error', 'MISSION_PACKAGE_NOT_FOUND'); end if;
  select coalesce(max(version_number), 0) into v_current from public.mission_pack_revisions
  where organisation_id = p_organisation_id and mission_id = p_mission_id;
  if p_expected_revision is null or p_expected_revision < 0 or v_current <> p_expected_revision then
    return jsonb_build_object('error', 'MISSION_PACKAGE_VERSION_CONFLICT', 'current_version', v_current);
  end if;
  if jsonb_typeof(p_field_ids) <> 'array' or jsonb_array_length(p_field_ids) = 0 then
    return jsonb_build_object('error', 'MISSION_SCOPE_EMPTY');
  end if;
  select count(*)::integer, count(distinct raw_id)::integer,
    bool_and(raw_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
  into v_count, v_distinct, v_valid
  from jsonb_array_elements_text(p_field_ids) requested(raw_id);
  if v_count > 100 or not coalesce(v_valid, false) then return jsonb_build_object('error', 'MISSION_SCOPE_FIELD_INVALID'); end if;
  if v_count <> v_distinct then return jsonb_build_object('error', 'MISSION_SCOPE_FIELD_DUPLICATE'); end if;
  select array_agg(raw_id::uuid order by field_order) into v_field_ids
  from jsonb_array_elements_text(p_field_ids) with ordinality requested(raw_id, field_order);

  select count(*)::integer into v_resolved
  from unnest(v_field_ids) requested(field_id)
  join public.job_fields job_field
    on job_field.organisation_id = p_organisation_id and job_field.job_id = v_job.id
   and job_field.field_id = requested.field_id and job_field.archived_at is null
  join public.fields field
    on field.organisation_id = job_field.organisation_id and field.id = job_field.field_id
   and field.property_id = job_field.property_id and field.archived_at is null
  join public.properties property
    on property.organisation_id = field.organisation_id and property.id = field.property_id
   and property.client_id = v_job.client_id and property.archived_at is null;
  if v_resolved <> v_count then return jsonb_build_object('error', 'MISSION_SCOPE_FIELD_NOT_IN_JOB'); end if;

  v_manifest := public.ftf_build_mission_package_source_manifest(p_organisation_id, p_mission_id, v_field_ids);
  v_jsa_id := nullif(v_manifest#>>'{jsa,id}', '')::uuid;
  if v_jsa_id is null then return jsonb_build_object('error', 'MISSION_PACKAGE_JSA_REQUIRED'); end if;
  v_readiness := public.ftf_evaluate_mission_readiness(p_organisation_id, p_mission_id, now());
  v_digest := public.ftf_mission_package_digest(v_manifest);
  insert into public.mission_pack_revisions (
    organisation_id, operating_location_id, mission_id, version_number,
    authorisation_revision_id, authorisation_version, pack_snapshot,
    generated_by_internal_user_id, job_id, package_state, jsa_revision_id,
    evidence_digest, source_manifest
  ) values (
    p_organisation_id, v_mission.operating_location_id, p_mission_id, v_current + 1,
    null, null, jsonb_build_object('schemaVersion', 2, 'packageState', 'PREPARING', 'sourceManifest', v_manifest, 'readiness', v_readiness),
    p_actor_internal_user_id, v_job.id, 'PREPARING', v_jsa_id, v_digest, v_manifest
  ) returning * into v_pack;
  insert into public.mission_pack_fields (
    organisation_id, operating_location_id, mission_id, job_id, pack_revision_id, property_id, field_id, field_order
  )
  select p_organisation_id, v_mission.operating_location_id, p_mission_id, v_job.id, v_pack.id,
    field.property_id, requested.field_id, requested.field_order::integer
  from unnest(v_field_ids) with ordinality requested(field_id, field_order)
  join public.fields field on field.organisation_id = p_organisation_id and field.id = requested.field_id;
  insert into public.audit_events (organisation_id, actor_internal_user_id, event_type, entity_type, entity_id, event_payload)
  values (p_organisation_id, p_actor_internal_user_id, 'mission.package_scope_saved', 'mission', p_mission_id,
    jsonb_build_object('package_revision_id', v_pack.id, 'revision', v_pack.version_number, 'field_ids', to_jsonb(v_field_ids), 'jsa_revision_id', v_jsa_id, 'evidence_digest', v_digest));
  insert into public.transactional_outbox (organisation_id, topic, aggregate_type, aggregate_id, payload)
  values (p_organisation_id, 'operational.mission.package_scope_saved', 'mission', p_mission_id,
    jsonb_build_object('package_revision_id', v_pack.id, 'revision', v_pack.version_number, 'field_ids', to_jsonb(v_field_ids), 'jsa_revision_id', v_jsa_id, 'evidence_digest', v_digest));
  return jsonb_build_object('record', to_jsonb(v_pack), 'field_ids', to_jsonb(v_field_ids), 'effective_state', 'PREPARING');
end;
$$;

create function public.ftf_submit_mission_package(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_mission_id uuid,
  p_package_revision_id uuid,
  p_expected_revision integer,
  p_evidence_digest text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mission public.missions%rowtype;
  v_source public.mission_pack_revisions%rowtype;
  v_pack public.mission_pack_revisions%rowtype;
  v_current integer;
  v_field_ids uuid[];
  v_manifest jsonb;
  v_fresh_digest text;
  v_readiness jsonb;
begin
  perform pg_advisory_xact_lock(hashtext(p_organisation_id::text)::bigint);
  perform pg_advisory_xact_lock(hashtext(p_organisation_id::text), hashtext(p_mission_id::text));
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
  if v_current <> p_expected_revision then
    return jsonb_build_object('error', 'MISSION_PACKAGE_VERSION_CONFLICT', 'current_version', v_current);
  end if;
  select * into v_source from public.mission_pack_revisions
  where organisation_id = p_organisation_id and mission_id = p_mission_id
    and id = p_package_revision_id and version_number = p_expected_revision
    and package_state = 'PREPARING' for update;
  if not found then return jsonb_build_object('error', 'MISSION_PACKAGE_VERSION_CONFLICT', 'current_version', v_current); end if;
  select array_agg(field_id order by field_order) into v_field_ids from public.mission_pack_fields
  where organisation_id = p_organisation_id and mission_id = p_mission_id and pack_revision_id = v_source.id;
  v_manifest := public.ftf_build_mission_package_source_manifest(p_organisation_id, p_mission_id, v_field_ids);
  v_fresh_digest := public.ftf_mission_package_digest(v_manifest);
  if v_manifest is null or p_evidence_digest is null or p_evidence_digest !~ '^[a-f0-9]{64}$' or p_evidence_digest <> v_source.evidence_digest
    or v_fresh_digest <> v_source.evidence_digest or nullif(v_manifest#>>'{jsa,id}', '')::uuid <> v_source.jsa_revision_id then
    return jsonb_build_object('error', 'MISSION_PACKAGE_EVIDENCE_STALE', 'current_version', v_current, 'current_digest', v_fresh_digest);
  end if;
  v_readiness := public.ftf_evaluate_mission_readiness(p_organisation_id, p_mission_id, now());
  if not coalesce((v_readiness->>'ready')::boolean, false) then
    return jsonb_build_object('readiness_blocked', true, 'readiness', v_readiness);
  end if;
  insert into public.mission_pack_revisions (
    organisation_id, operating_location_id, mission_id, version_number,
    authorisation_revision_id, authorisation_version, pack_snapshot,
    generated_by_internal_user_id, job_id, package_state, jsa_revision_id,
    evidence_digest, source_manifest, submitted_at
  ) values (
    p_organisation_id, v_source.operating_location_id, p_mission_id, v_current + 1,
    null, null, jsonb_build_object('schemaVersion', 2, 'packageState', 'AWAITING_CRP_APPROVAL', 'sourceManifest', v_manifest, 'readiness', v_readiness),
    p_actor_internal_user_id, v_source.job_id, 'AWAITING_CRP_APPROVAL', v_source.jsa_revision_id,
    v_source.evidence_digest, v_manifest, now()
  ) returning * into v_pack;
  insert into public.mission_pack_fields (
    organisation_id, operating_location_id, mission_id, job_id, pack_revision_id, property_id, field_id, field_order
  ) select organisation_id, operating_location_id, mission_id, job_id, v_pack.id, property_id, field_id, field_order
    from public.mission_pack_fields
    where organisation_id = p_organisation_id and mission_id = p_mission_id and pack_revision_id = v_source.id;
  insert into public.audit_events (organisation_id, actor_internal_user_id, event_type, entity_type, entity_id, event_payload)
  values (p_organisation_id, p_actor_internal_user_id, 'mission.package_submitted', 'mission', p_mission_id,
    jsonb_build_object('package_revision_id', v_pack.id, 'revision', v_pack.version_number, 'preparing_revision_id', v_source.id, 'evidence_digest', v_pack.evidence_digest));
  insert into public.transactional_outbox (organisation_id, topic, aggregate_type, aggregate_id, payload)
  values (p_organisation_id, 'operational.mission.package_submitted', 'mission', p_mission_id,
    jsonb_build_object('package_revision_id', v_pack.id, 'revision', v_pack.version_number, 'preparing_revision_id', v_source.id, 'evidence_digest', v_pack.evidence_digest));
  return jsonb_build_object('record', to_jsonb(v_pack), 'field_ids', to_jsonb(v_field_ids), 'effective_state', 'AWAITING_CRP_APPROVAL');
end;
$$;

create function public.ftf_decide_mission_package(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_mission_id uuid,
  p_package_revision_id uuid,
  p_expected_revision integer,
  p_evidence_digest text,
  p_decision text,
  p_declaration text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mission public.missions%rowtype;
  v_pack public.mission_pack_revisions%rowtype;
  v_person public.personnel%rowtype;
  v_current integer;
  v_authorisation_version integer;
  v_field_ids uuid[];
  v_manifest jsonb;
  v_fresh_digest text;
  v_readiness jsonb;
  v_decision text;
  v_record public.mission_authorisation_revisions%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext(p_organisation_id::text)::bigint);
  perform pg_advisory_xact_lock(hashtext(p_organisation_id::text), hashtext(p_mission_id::text));
  if not public.ftf_actor_has_active_beta_seat(p_organisation_id, p_actor_internal_user_id)
    or not public.ftf_actor_has_permission(p_organisation_id, p_actor_internal_user_id, 'mission.authorisation.authorise') then
    return jsonb_build_object('forbidden', true);
  end if;
  select * into v_mission from public.missions
  where organisation_id = p_organisation_id and id = p_mission_id and archived_at is null for update;
  if not found then return jsonb_build_object('error', 'MISSION_PACKAGE_NOT_FOUND'); end if;
  if not public.ftf_operational_location_allowed(p_organisation_id, p_actor_internal_user_id, v_mission.operating_location_id) then
    return jsonb_build_object('location_forbidden', true);
  end if;
  select * into v_person from public.personnel personnel
  where personnel.organisation_id = p_organisation_id
    and personnel.internal_user_id = p_actor_internal_user_id
    and personnel.is_active
    and personnel.archived_at is null
    and exists (
      select 1 from public.personnel_operating_locations personnel_location
      where personnel_location.organisation_id = personnel.organisation_id
        and personnel_location.personnel_id = personnel.id
        and personnel_location.operating_location_id = v_mission.operating_location_id
    );
  if not found then return jsonb_build_object('error', 'MISSION_CRP_INELIGIBLE'); end if;
  select coalesce(max(version_number), 0) into v_current from public.mission_pack_revisions
  where organisation_id = p_organisation_id and mission_id = p_mission_id;
  select * into v_pack from public.mission_pack_revisions
  where organisation_id = p_organisation_id and mission_id = p_mission_id
    and id = p_package_revision_id and version_number = p_expected_revision
    and package_state = 'AWAITING_CRP_APPROVAL' for update;
  if not found or v_current <> p_expected_revision then
    return jsonb_build_object('error', 'MISSION_PACKAGE_VERSION_CONFLICT', 'current_version', v_current);
  end if;
  if exists (
    select 1 from public.mission_authorisation_revisions
    where organisation_id = p_organisation_id and mission_pack_revision_id = p_package_revision_id
  ) then return jsonb_build_object('error', 'MISSION_PACKAGE_DECISION_CONFLICT'); end if;
  v_decision := upper(coalesce(p_decision, ''));
  if v_decision not in ('AUTHORISED', 'REJECTED') then return jsonb_build_object('error', 'MISSION_PACKAGE_DECISION_INVALID'); end if;
  if nullif(trim(p_declaration), '') is null or length(trim(p_declaration)) > 2000 then
    return jsonb_build_object('error', 'MISSION_PACKAGE_DECLARATION_INVALID');
  end if;
  select array_agg(field_id order by field_order) into v_field_ids from public.mission_pack_fields
  where organisation_id = p_organisation_id and mission_id = p_mission_id and pack_revision_id = v_pack.id;
  v_manifest := public.ftf_build_mission_package_source_manifest(p_organisation_id, p_mission_id, v_field_ids);
  v_fresh_digest := public.ftf_mission_package_digest(v_manifest);
  if v_manifest is null or p_evidence_digest is null or p_evidence_digest !~ '^[a-f0-9]{64}$' or p_evidence_digest <> v_pack.evidence_digest
    or v_fresh_digest <> v_pack.evidence_digest or nullif(v_manifest#>>'{jsa,id}', '')::uuid <> v_pack.jsa_revision_id then
    return jsonb_build_object('error', 'MISSION_PACKAGE_EVIDENCE_STALE', 'current_version', v_current, 'current_digest', v_fresh_digest);
  end if;
  v_readiness := public.ftf_evaluate_mission_readiness(p_organisation_id, p_mission_id, now());
  if v_decision = 'AUTHORISED' and not coalesce((v_readiness->>'ready')::boolean, false) then
    return jsonb_build_object('readiness_blocked', true, 'readiness', v_readiness);
  end if;
  select coalesce(max(version_number), 0) into v_authorisation_version
  from public.mission_authorisation_revisions
  where organisation_id = p_organisation_id and mission_id = p_mission_id;
  insert into public.mission_authorisation_revisions (
    organisation_id, operating_location_id, mission_id, version_number,
    evidence_manifest, readiness_snapshot, declaration,
    authorised_personnel_id, authorised_personnel_snapshot,
    authorised_by_internal_user_id, mission_pack_revision_id, decision, evidence_digest
  ) values (
    p_organisation_id, v_mission.operating_location_id, p_mission_id, v_authorisation_version + 1,
    v_manifest, v_readiness, trim(p_declaration),
    v_person.id, to_jsonb(v_person) - 'organisation_id' - 'private_notes',
    p_actor_internal_user_id, v_pack.id, v_decision, v_pack.evidence_digest
  ) returning * into v_record;
  if v_decision = 'AUTHORISED' then
    update public.missions
    set current_authorised_pack_revision_id = v_pack.id,
        row_version = row_version + 1,
        updated_at = now()
    where organisation_id = p_organisation_id and id = p_mission_id;
  end if;
  insert into public.audit_events (organisation_id, actor_internal_user_id, event_type, entity_type, entity_id, event_payload)
  values (p_organisation_id, p_actor_internal_user_id,
    case when v_decision = 'AUTHORISED' then 'mission.package_authorised' else 'mission.package_rejected' end,
    'mission', p_mission_id,
    jsonb_build_object('decision_revision_id', v_record.id, 'package_revision_id', v_pack.id, 'package_revision', v_pack.version_number, 'evidence_digest', v_pack.evidence_digest));
  insert into public.transactional_outbox (organisation_id, topic, aggregate_type, aggregate_id, payload)
  values (p_organisation_id,
    case when v_decision = 'AUTHORISED' then 'preflight.mission.package_authorised' else 'preflight.mission.package_rejected' end,
    'mission', p_mission_id,
    jsonb_build_object('decision_revision_id', v_record.id, 'package_revision_id', v_pack.id, 'package_revision', v_pack.version_number, 'evidence_digest', v_pack.evidence_digest));
  return jsonb_build_object('record', to_jsonb(v_record));
end;
$$;

create function public.ftf_read_mission_package_history(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_mission_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_mission public.missions%rowtype;
begin
  if not public.ftf_actor_has_active_beta_seat(p_organisation_id, p_actor_internal_user_id)
    or not (
      public.ftf_actor_has_permission(p_organisation_id, p_actor_internal_user_id, 'mission.pack.read')
      or public.ftf_actor_has_permission(p_organisation_id, p_actor_internal_user_id, 'mission.authorisation.read')
    ) then return jsonb_build_object('forbidden', true); end if;
  select * into v_mission from public.missions
  where organisation_id = p_organisation_id and id = p_mission_id and archived_at is null;
  if not found then return jsonb_build_object('error', 'MISSION_PACKAGE_NOT_FOUND'); end if;
  if not public.ftf_operational_location_allowed(p_organisation_id, p_actor_internal_user_id, v_mission.operating_location_id) then
    return jsonb_build_object('location_forbidden', true);
  end if;
  return jsonb_build_object(
    'mission_id', p_mission_id,
    'packages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', package.id,
        'mission_id', package.mission_id,
        'revision_number', package.version_number,
        'field_ids', coalesce((select jsonb_agg(field.field_id order by field.field_order) from public.mission_pack_fields field where field.organisation_id = package.organisation_id and field.pack_revision_id = package.id), '[]'::jsonb),
        'jsa_revision_id', package.jsa_revision_id,
        'evidence_digest', package.evidence_digest,
        'state', coalesce(decision.decision, package.package_state),
        'created_at', package.generated_at
      ) order by package.version_number desc)
      from (
        select * from public.mission_pack_revisions
        where organisation_id = p_organisation_id and mission_id = p_mission_id
          and package_state is not null
        order by version_number desc
        limit 100
      ) package
      left join public.mission_authorisation_revisions decision
        on decision.organisation_id = package.organisation_id and decision.mission_pack_revision_id = package.id
    ), '[]'::jsonb),
    'decisions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', decision.id,
        'package_revision_id', decision.mission_pack_revision_id,
        'decision', decision.decision,
        'decided_by_internal_user_id', decision.authorised_by_internal_user_id,
        'decided_at', decision.authorised_at,
        'declaration', decision.declaration
      ) order by decision.version_number desc)
      from (
        select * from public.mission_authorisation_revisions
        where organisation_id = p_organisation_id and mission_id = p_mission_id
          and mission_pack_revision_id is not null
        order by version_number desc
        limit 100
      ) decision
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.ftf_build_mission_package_source_manifest(uuid, uuid, uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.ftf_mission_package_digest(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.ftf_save_mission_package_scope(uuid, uuid, uuid, integer, jsonb) from public, anon, authenticated;
revoke all on function public.ftf_submit_mission_package(uuid, uuid, uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.ftf_decide_mission_package(uuid, uuid, uuid, uuid, integer, text, text, text) from public, anon, authenticated;
revoke all on function public.ftf_read_mission_package_history(uuid, uuid, uuid) from public, anon, authenticated;

grant execute on function public.ftf_save_mission_package_scope(uuid, uuid, uuid, integer, jsonb) to service_role;
grant execute on function public.ftf_submit_mission_package(uuid, uuid, uuid, uuid, integer, text) to service_role;
grant execute on function public.ftf_decide_mission_package(uuid, uuid, uuid, uuid, integer, text, text, text) to service_role;
grant execute on function public.ftf_read_mission_package_history(uuid, uuid, uuid) to service_role;
