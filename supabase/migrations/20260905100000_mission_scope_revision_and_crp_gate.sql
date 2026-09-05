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

-- One lock order governs every read/check/write of the Mission package
-- aggregate. Material evidence triggers below take the same organisation lock
-- (and Mission lock when one is present), so a package digest cannot race an
-- old route or a direct table writer.
create function public.ftf_lock_mission_package_aggregate(
  p_organisation_id uuid,
  p_mission_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_organisation_id is null then raise exception 'MISSION_PACKAGE_LOCK_ORGANISATION_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtext(p_organisation_id::text)::bigint);
  if p_mission_id is not null then
    perform pg_advisory_xact_lock(hashtext(p_organisation_id::text), hashtext(p_mission_id::text));
    perform 1 from public.missions
      where organisation_id = p_organisation_id and id = p_mission_id
      for update;
  end if;
end;
$$;

create function public.ftf_project_mission_authorisation_evidence(
  p_evidence_manifest jsonb,
  p_readiness_snapshot jsonb
)
returns jsonb
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
  select case
    when coalesce(p_evidence_manifest, '{}'::jsonb) ? 'planning'
      then coalesce(p_evidence_manifest, '{}'::jsonb)
           || jsonb_build_object(
             'sourceManifest', coalesce(p_evidence_manifest->'sourceManifest', p_evidence_manifest->'source_manifest'),
             'planning', coalesce(p_evidence_manifest->'planning', '{}'::jsonb) || jsonb_build_object(
               'map', case when coalesce(p_evidence_manifest#>'{planning,map}', 'null'::jsonb) = 'null'::jsonb then p_evidence_manifest#>'{sourceManifest,map}' else p_evidence_manifest#>'{planning,map}' end,
               'chemicals', case when coalesce(p_evidence_manifest#>'{planning,chemicals}', 'null'::jsonb) = 'null'::jsonb then p_evidence_manifest#>'{sourceManifest,chemicals}' else p_evidence_manifest#>'{planning,chemicals}' end,
               'personnel', case when coalesce(p_evidence_manifest#>'{planning,personnel}', 'null'::jsonb) = 'null'::jsonb then p_evidence_manifest#>'{sourceManifest,personnel}' else p_evidence_manifest#>'{planning,personnel}' end,
               'aircraft', case when coalesce(p_evidence_manifest#>'{planning,aircraft}', 'null'::jsonb) = 'null'::jsonb then coalesce(p_evidence_manifest#>'{sourceManifest,aircraftAssignments}', '[]'::jsonb) else p_evidence_manifest#>'{planning,aircraft}' end,
               'equipmentKits', case when coalesce(p_evidence_manifest#>'{planning,equipmentKits}', 'null'::jsonb) = 'null'::jsonb then coalesce(p_evidence_manifest#>'{sourceManifest,equipmentAssignments}', '[]'::jsonb) else p_evidence_manifest#>'{planning,equipmentKits}' end,
               'fieldScope', coalesce(p_evidence_manifest#>'{planning,fieldScope}', p_evidence_manifest#>'{sourceManifest,fieldScope}', '[]'::jsonb),
               'fieldIds', coalesce(p_evidence_manifest#>'{planning,fieldIds}', p_evidence_manifest#>'{sourceManifest,fieldIds}', '[]'::jsonb)
             ),
             'readiness', p_readiness_snapshot
           )
    else jsonb_build_object(
      'schemaVersion', 2,
      'sourceManifest', coalesce(p_evidence_manifest, '{}'::jsonb),
      'planning', jsonb_build_object(
        'map', p_evidence_manifest->'map',
        'chemicals', p_evidence_manifest->'chemicals',
        'aircraft', coalesce(p_evidence_manifest->'aircraftAssignments', '[]'::jsonb),
        'equipmentKits', coalesce(p_evidence_manifest->'equipmentAssignments', '[]'::jsonb),
        'personnel', p_evidence_manifest->'personnel',
        'fieldScope', coalesce(p_evidence_manifest->'fieldScope', '[]'::jsonb),
        'fieldIds', coalesce(p_evidence_manifest->'fieldIds', '[]'::jsonb)
      ),
      'preflight', jsonb_build_object(
        'observedWeather', p_evidence_manifest->'weather',
        'jsa', p_evidence_manifest->'jsa'
      ),
      'readiness', p_readiness_snapshot
    )
  end
$$;

create function public.ftf_project_mission_pack(
  p_organisation_id uuid,
  p_mission_id uuid,
  p_pack_revision_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select to_jsonb(package)
    || jsonb_build_object(
      'authorisation_revision_id', decision.id,
      'authorisation_version', decision.version_number,
      'pack_snapshot', coalesce(package.pack_snapshot, '{}'::jsonb)
        || jsonb_build_object(
          'authorisation', to_jsonb(decision)
            || jsonb_build_object('evidence_manifest', public.ftf_project_mission_authorisation_evidence(decision.evidence_manifest, decision.readiness_snapshot)),
          'evidence', public.ftf_project_mission_authorisation_evidence(decision.evidence_manifest, decision.readiness_snapshot),
          'readiness', decision.readiness_snapshot,
          'sourceManifest', coalesce(package.source_manifest, decision.evidence_manifest->'sourceManifest', decision.evidence_manifest->'source_manifest')
        )
    )
  from public.mission_pack_revisions package
  join lateral (
    select authorisation.*
    from public.mission_authorisation_revisions authorisation
    where authorisation.organisation_id = package.organisation_id
      and authorisation.mission_id = package.mission_id
      and authorisation.decision = 'AUTHORISED'
      and (
        authorisation.mission_pack_revision_id = package.id
        or (authorisation.mission_pack_revision_id is null and authorisation.id = package.authorisation_revision_id)
      )
    order by case when authorisation.mission_pack_revision_id = package.id then 0 else 1 end,
      authorisation.version_number desc
    limit 1
  ) decision on true
  where package.organisation_id = p_organisation_id
    and package.mission_id = p_mission_id
    and package.id = p_pack_revision_id
$$;

create function public.ftf_resolve_effective_mission_authorisation(
  p_organisation_id uuid,
  p_mission_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select to_jsonb(authorisation)
    || jsonb_build_object(
      'evidence_manifest', public.ftf_project_mission_authorisation_evidence(authorisation.evidence_manifest, authorisation.readiness_snapshot),
      'effective_pack_revision_id', package.id
    )
  from public.missions mission
  join public.mission_pack_revisions package
    on package.organisation_id = mission.organisation_id
   and package.mission_id = mission.id
   and package.id = mission.current_authorised_pack_revision_id
  join public.mission_authorisation_revisions authorisation
    on authorisation.organisation_id = package.organisation_id
   and authorisation.mission_id = package.mission_id
   and authorisation.decision = 'AUTHORISED'
   and (
     authorisation.mission_pack_revision_id = package.id
     or (authorisation.mission_pack_revision_id is null and authorisation.id = package.authorisation_revision_id)
   )
  where mission.organisation_id = p_organisation_id
    and mission.id = p_mission_id
  order by case when authorisation.mission_pack_revision_id = package.id then 0 else 1 end,
    authorisation.version_number desc
  limit 1
$$;

-- Establish the pointer for packs created by the pre-scope API before this
-- additive migration. Rejections can never become the effective authority.
with effective as (
  select distinct on (package.organisation_id, package.mission_id)
    package.organisation_id, package.mission_id, package.id
  from public.mission_pack_revisions package
  join public.mission_authorisation_revisions authorisation
    on authorisation.organisation_id = package.organisation_id
   and authorisation.mission_id = package.mission_id
   and authorisation.decision = 'AUTHORISED'
   and (
     authorisation.mission_pack_revision_id = package.id
     or (authorisation.mission_pack_revision_id is null and authorisation.id = package.authorisation_revision_id)
   )
  order by package.organisation_id, package.mission_id, package.version_number desc
)
update public.missions mission
set current_authorised_pack_revision_id = effective.id
from effective
where mission.organisation_id = effective.organisation_id
  and mission.id = effective.mission_id
  and mission.current_authorised_pack_revision_id is null;

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
  select authority
  from (
    select public.ftf_resolve_effective_mission_authorisation(p_organisation_id, p_mission_id) authority,
      2147483647 version_number
    where not p_history
    union all
    select to_jsonb(a) || jsonb_build_object(
      'evidence_manifest', public.ftf_project_mission_authorisation_evidence(a.evidence_manifest, a.readiness_snapshot)
    ), a.version_number
    from public.mission_authorisation_revisions a
    where p_history
      and a.organisation_id = p_organisation_id
      and a.mission_id = p_mission_id
      and a.decision = 'AUTHORISED'
  ) authorised
  where authority is not null
  order by version_number desc
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
  select projected
  from (
    select public.ftf_project_mission_pack(p_organisation_id, p_mission_id, mission.current_authorised_pack_revision_id) projected,
      2147483647 version_number
    from public.missions mission
    where not p_history
      and mission.organisation_id = p_organisation_id
      and mission.id = p_mission_id
    union all
    select public.ftf_project_mission_pack(package.organisation_id, package.mission_id, package.id), package.version_number
    from public.mission_pack_revisions package
    where p_history
      and package.organisation_id = p_organisation_id
      and package.mission_id = p_mission_id
  ) packs
  where projected is not null
  order by version_number desc
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
  perform public.ftf_lock_mission_package_aggregate(p_organisation_id, p_mission_id);
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
  update public.missions
  set current_authorised_pack_revision_id = p.id,
      row_version = row_version + 1,
      updated_at = now()
  where organisation_id = p_organisation_id and id = p_mission_id;
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
  select encode(sha256(convert_to(p_manifest::text, 'UTF8')), 'hex')
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
  v_readiness := public.ftf_evaluate_mission_readiness(p_organisation_id, p_mission_id, now());
  if not coalesce((v_readiness->>'ready')::boolean, false) then
    return jsonb_build_object('readiness_blocked', true, 'readiness', v_readiness);
  end if;
  -- This is deliberately the final validation before the immutable insert.
  v_manifest := public.ftf_build_mission_package_source_manifest(p_organisation_id, p_mission_id, v_field_ids);
  v_fresh_digest := public.ftf_mission_package_digest(v_manifest);
  if v_manifest is null or p_evidence_digest is null or p_evidence_digest !~ '^[a-f0-9]{64}$' or p_evidence_digest <> v_source.evidence_digest
    or v_fresh_digest <> v_source.evidence_digest or nullif(v_manifest#>>'{jsa,id}', '')::uuid <> v_source.jsa_revision_id then
    return jsonb_build_object('error', 'MISSION_PACKAGE_EVIDENCE_STALE', 'current_version', v_current, 'current_digest', v_fresh_digest);
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
  v_legacy_evidence jsonb;
  v_decision text;
  v_record public.mission_authorisation_revisions%rowtype;
begin
  perform public.ftf_lock_mission_package_aggregate(p_organisation_id, p_mission_id);
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
  v_readiness := public.ftf_evaluate_mission_readiness(p_organisation_id, p_mission_id, now());
  if v_decision = 'AUTHORISED' and not coalesce((v_readiness->>'ready')::boolean, false) then
    return jsonb_build_object('readiness_blocked', true, 'readiness', v_readiness);
  end if;
  v_legacy_evidence := public.ftf_build_mission_evidence_manifest(p_organisation_id, p_mission_id, now());
  -- This is deliberately the final validation before the immutable decision.
  v_manifest := public.ftf_build_mission_package_source_manifest(p_organisation_id, p_mission_id, v_field_ids);
  v_fresh_digest := public.ftf_mission_package_digest(v_manifest);
  if v_manifest is null or p_evidence_digest is null or p_evidence_digest !~ '^[a-f0-9]{64}$' or p_evidence_digest <> v_pack.evidence_digest
    or v_fresh_digest <> v_pack.evidence_digest or nullif(v_manifest#>>'{jsa,id}', '')::uuid <> v_pack.jsa_revision_id then
    return jsonb_build_object('error', 'MISSION_PACKAGE_EVIDENCE_STALE', 'current_version', v_current, 'current_digest', v_fresh_digest);
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
    coalesce(v_legacy_evidence, '{}'::jsonb) || jsonb_build_object('schemaVersion', 2, 'sourceManifest', v_manifest),
    v_readiness, trim(p_declaration),
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
    -- Includes legacy pack versions so callers can always recover the exact
    -- optimistic-concurrency value even when legacy rows are not decodable as
    -- the focused MissionPackageRevision contract.
    'current_revision', coalesce((
      select max(version_number) from public.mission_pack_revisions
      where organisation_id = p_organisation_id and mission_id = p_mission_id
    ), 0),
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
          and mission_pack_revision_id in (
            select id from public.mission_pack_revisions
            where organisation_id = p_organisation_id and mission_id = p_mission_id
              and package_state is not null
            order by version_number desc
            limit 100
          )
        order by version_number desc
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

create function public.ftf_lock_mission_material_evidence()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old_row jsonb;
  v_new_row jsonb;
  v_scope record;
begin
  v_old_row := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new_row := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  -- Platform-owned reference rows have no organisation and cannot affect an
  -- organisation-scoped Mission until they are frozen into a local revision.
  -- UPDATE may move evidence between aggregates, so lock every distinct OLD
  -- and NEW scope in a stable order. INSERT and DELETE contribute one scope.
  for v_scope in
    select distinct scope.organisation_id, scope.mission_id
    from (
      select
        nullif(v_old_row->>'organisation_id', '')::uuid as organisation_id,
        nullif(v_old_row->>'mission_id', '')::uuid as mission_id
      where v_old_row is not null
      union all
      select
        nullif(v_new_row->>'organisation_id', '')::uuid as organisation_id,
        nullif(v_new_row->>'mission_id', '')::uuid as mission_id
      where v_new_row is not null
    ) scope
    where scope.organisation_id is not null
    order by scope.organisation_id, scope.mission_id nulls first
  loop
    perform public.ftf_lock_mission_package_aggregate(v_scope.organisation_id, v_scope.mission_id);
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $mission_material_lock_triggers$
declare
  v_table text;
begin
  foreach v_table in array array[
    'missions', 'jobs', 'job_fields', 'fields', 'properties',
    'mission_jsa_revisions', 'mission_jsa_responses', 'mission_hazard_instances',
    'mission_risk_control_instances', 'mission_jsa_attachments', 'mission_jsa_approvals',
    'mission_personnel_revisions', 'mission_personnel_assignments',
    'mission_chemical_plan_revisions', 'mission_chemical_plan_lines',
    'mission_map_revisions', 'mission_geometry_versions', 'mission_map_source_files',
    'mission_weather_observations', 'mission_weather_selections',
    'mission_weather_forecast_revisions', 'mission_weather_forecast_selections',
    'mission_aircraft_assignments', 'mission_equipment_kit_assignments',
    'aircraft', 'equipment_kits', 'personnel', 'personnel_operating_locations',
    'organisation_weather_policies', 'checklist_templates', 'checklist_template_versions',
    'checklist_template_applicability', 'checklist_executions', 'checklist_execution_evidence',
    'checklist_corrective_actions',
    'maintainable_asset_registry', 'asset_systems', 'component_positions',
    'internal_users', 'memberships', 'membership_operating_location_assignments',
    'internal_user_seat_assignments', 'organisation_seat_allocations',
    'roles', 'permissions', 'role_permissions'
  ] loop
    if to_regclass('public.' || v_table) is not null then
      execute format(
        'create trigger mission_package_aggregate_lock before insert or update or delete on public.%I for each row execute function public.ftf_lock_mission_material_evidence()',
        v_table
      );
    end if;
  end loop;
end;
$mission_material_lock_triggers$;

revoke all on function public.ftf_lock_mission_package_aggregate(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.ftf_project_mission_authorisation_evidence(jsonb, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.ftf_project_mission_pack(uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.ftf_resolve_effective_mission_authorisation(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.ftf_lock_mission_material_evidence() from public, anon, authenticated, service_role;

-- The legacy authorisation command remains supported, but now enters the same
-- aggregate lock before it evaluates readiness and freezes evidence.
create or replace function public.ftf_authorise_mission(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_mission_id uuid,
  p_expected_version integer,
  p_declaration text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mission public.missions%rowtype;
  v_current integer;
  v_readiness jsonb;
  v_evidence jsonb;
  v_pic jsonb;
  v_person public.personnel%rowtype;
  v_authorisation public.mission_authorisation_revisions%rowtype;
begin
  perform public.ftf_lock_mission_package_aggregate(p_organisation_id, p_mission_id);
  select * into v_mission from public.missions
  where organisation_id = p_organisation_id and id = p_mission_id and archived_at is null;
  if not found then return jsonb_build_object('not_found', true); end if;
  if not public.ftf_operational_location_allowed(p_organisation_id, p_actor_internal_user_id, v_mission.operating_location_id) then
    return jsonb_build_object('location_forbidden', true);
  end if;
  select coalesce(max(version_number), 0) into v_current
  from public.mission_authorisation_revisions
  where organisation_id = p_organisation_id and mission_id = p_mission_id;
  if v_current <> p_expected_version then return jsonb_build_object('conflict', true, 'current_version', v_current); end if;
  v_readiness := public.ftf_evaluate_mission_readiness(p_organisation_id, p_mission_id, now());
  if not coalesce((v_readiness->>'ready')::boolean, false) then
    return jsonb_build_object('readiness_blocked', true, 'readiness', v_readiness);
  end if;
  v_evidence := v_readiness->'evidenceManifest';
  select item into v_pic
  from jsonb_array_elements(coalesce(v_evidence#>'{planning,personnel,assignments}', '[]'::jsonb)) item
  where coalesce(item->>'assignmentRole', item->>'assignment_role') = 'pilot_in_command'
  limit 1;
  select * into v_person from public.personnel
  where organisation_id = p_organisation_id
    and id = coalesce(nullif(v_pic->>'personnelId', ''), nullif(v_pic->>'personnel_id', ''))::uuid
    and internal_user_id = p_actor_internal_user_id
    and is_active and archived_at is null;
  if not found then return jsonb_build_object('pic_forbidden', true); end if;
  insert into public.mission_authorisation_revisions(
    organisation_id, operating_location_id, mission_id, version_number,
    evidence_manifest, readiness_snapshot, declaration,
    authorised_personnel_id, authorised_personnel_snapshot, authorised_by_internal_user_id,
    decision
  ) values (
    p_organisation_id, v_mission.operating_location_id, p_mission_id, v_current + 1,
    v_evidence, v_readiness, p_declaration,
    v_person.id, coalesce(v_pic->'snapshot', to_jsonb(v_person) - 'organisation_id'), p_actor_internal_user_id,
    'AUTHORISED'
  ) returning * into v_authorisation;
  insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)
  values(p_organisation_id,p_actor_internal_user_id,'mission.authorised','mission',p_mission_id,
    jsonb_build_object('authorisation_revision_id',v_authorisation.id,'version',v_authorisation.version_number,'evidence_schema_version',1));
  insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)
  values(p_organisation_id,'preflight.mission.authorised','mission',p_mission_id,
    jsonb_build_object('authorisation_revision_id',v_authorisation.id,'version',v_authorisation.version_number));
  return jsonb_build_object('record', to_jsonb(v_authorisation));
end;
$$;

create or replace function public.ftf_read_mission_operational_closeout(
  p_organisation_id uuid,
  p_mission_id uuid
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select case when mission.id is null then null else jsonb_build_object(
    'mission', to_jsonb(mission) - 'organisation_id',
    'authorisation', public.ftf_resolve_effective_mission_authorisation(mission.organisation_id, mission.id),
    'availableResources', jsonb_build_object(
      'aircraft', coalesce((select jsonb_agg(jsonb_build_object('id',aircraft.id,'label',aircraft.registration||' · '||aircraft.model) order by aircraft.registration) from public.aircraft aircraft where aircraft.organisation_id=mission.organisation_id and aircraft.operating_location_id=mission.operating_location_id and aircraft.archived_at is null),'[]'::jsonb),
      'equipmentKits', coalesce((select jsonb_agg(jsonb_build_object('id',kit.id,'label',kit.name) order by kit.name) from public.equipment_kits kit where kit.organisation_id=mission.organisation_id and kit.operating_location_id=mission.operating_location_id and kit.archived_at is null),'[]'::jsonb),
      'personnel', coalesce((select jsonb_agg(jsonb_build_object('id',person.id,'label',person.full_name) order by person.full_name) from public.personnel person join public.personnel_operating_locations location on location.organisation_id=person.organisation_id and location.personnel_id=person.id where person.organisation_id=mission.organisation_id and location.operating_location_id=mission.operating_location_id and person.archived_at is null),'[]'::jsonb)
    ),
    'imports', coalesce((select jsonb_agg(to_jsonb(item) order by item.version_number) from public.mission_operational_imports item where item.organisation_id=mission.organisation_id and item.mission_id=mission.id),'[]'::jsonb),
    'resources', (select to_jsonb(item) from public.mission_operational_resource_revisions item where item.organisation_id=mission.organisation_id and item.mission_id=mission.id order by item.version_number desc limit 1),
    'chemicals', (select to_jsonb(item) from public.mission_operational_chemical_revisions item where item.organisation_id=mission.organisation_id and item.mission_id=mission.id order by item.version_number desc limit 1),
    'events', coalesce((select jsonb_agg(to_jsonb(item) order by item.batch_version,item.event_index) from public.mission_operational_events item where item.organisation_id=mission.organisation_id and item.mission_id=mission.id),'[]'::jsonb),
    'operationalRevision', (select to_jsonb(item) from public.mission_operational_revisions item where item.organisation_id=mission.organisation_id and item.mission_id=mission.id order by item.version_number desc limit 1),
    'completion', (select to_jsonb(item) from public.mission_completion_revisions item where item.organisation_id=mission.organisation_id and item.mission_id=mission.id order by item.version_number desc limit 1)
  ) end
  from public.missions mission
  where mission.organisation_id=p_organisation_id and mission.id=p_mission_id and mission.archived_at is null
$$;

create or replace function public.ftf_save_mission_actual_resources(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_mission_id uuid,
  p_expected_version integer,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mission public.missions%rowtype;
  v_current integer;
  v_record public.mission_operational_resource_revisions%rowtype;
  v_authority jsonb;
  v_planning jsonb;
begin
  perform public.ftf_lock_mission_package_aggregate(p_organisation_id, p_mission_id);
  select * into v_mission from public.missions where organisation_id=p_organisation_id and id=p_mission_id and archived_at is null;
  if not found then return jsonb_build_object('not_found',true); end if;
  if not public.ftf_operational_location_allowed(p_organisation_id,p_actor_internal_user_id,v_mission.operating_location_id) then return jsonb_build_object('location_forbidden',true); end if;
  select coalesce(max(version_number),0) into v_current from public.mission_operational_resource_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id;
  if v_current<>p_expected_version then return jsonb_build_object('conflict',true,'current_version',v_current); end if;
  v_authority := public.ftf_resolve_effective_mission_authorisation(p_organisation_id,p_mission_id);
  if v_authority is null or v_authority->>'decision'<>'AUTHORISED' then return jsonb_build_object('not_authorised',true); end if;
  v_planning := v_authority#>'{evidence_manifest,planning}';
  if v_planning is null then return jsonb_build_object('not_authorised',true); end if;
  insert into public.mission_operational_resource_revisions(organisation_id,operating_location_id,mission_id,version_number,actual_resources,planned_resources_snapshot,recorded_by_internal_user_id)
  values(p_organisation_id,v_mission.operating_location_id,p_mission_id,v_current+1,p_payload,v_planning,p_actor_internal_user_id) returning * into v_record;
  insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload) values(p_organisation_id,p_actor_internal_user_id,'mission.actual_resources_saved','mission',p_mission_id,jsonb_build_object('revision_id',v_record.id,'version',v_record.version_number));
  insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload) values(p_organisation_id,'operational.mission.resources_recorded','mission',p_mission_id,jsonb_build_object('revision_id',v_record.id,'version',v_record.version_number));
  return jsonb_build_object('record',to_jsonb(v_record));
end;
$$;

create or replace function public.ftf_save_mission_actual_chemicals(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_mission_id uuid,
  p_expected_version integer,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mission public.missions%rowtype;
  v_current integer;
  v_record public.mission_operational_chemical_revisions%rowtype;
  v_authority jsonb;
  v_chemicals jsonb;
begin
  perform public.ftf_lock_mission_package_aggregate(p_organisation_id, p_mission_id);
  select * into v_mission from public.missions where organisation_id=p_organisation_id and id=p_mission_id and archived_at is null;
  if not found then return jsonb_build_object('not_found',true); end if;
  if not public.ftf_operational_location_allowed(p_organisation_id,p_actor_internal_user_id,v_mission.operating_location_id) then return jsonb_build_object('location_forbidden',true); end if;
  select coalesce(max(version_number),0) into v_current from public.mission_operational_chemical_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id;
  if v_current<>p_expected_version then return jsonb_build_object('conflict',true,'current_version',v_current); end if;
  v_authority := public.ftf_resolve_effective_mission_authorisation(p_organisation_id,p_mission_id);
  if v_authority is null or v_authority->>'decision'<>'AUTHORISED' then return jsonb_build_object('not_authorised',true); end if;
  v_chemicals := v_authority#>'{evidence_manifest,planning,chemicals}';
  if v_chemicals is null then return jsonb_build_object('not_authorised',true); end if;
  insert into public.mission_operational_chemical_revisions(organisation_id,operating_location_id,mission_id,version_number,changed_from_plan,actual_usage,planned_chemicals_snapshot,recorded_by_internal_user_id)
  values(p_organisation_id,v_mission.operating_location_id,p_mission_id,v_current+1,coalesce((p_payload->>'changedFromPlan')::boolean,false),p_payload,v_chemicals,p_actor_internal_user_id) returning * into v_record;
  insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload) values(p_organisation_id,p_actor_internal_user_id,'mission.actual_chemicals_saved','mission',p_mission_id,jsonb_build_object('revision_id',v_record.id,'version',v_record.version_number));
  insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload) values(p_organisation_id,'operational.mission.chemicals_recorded','mission',p_mission_id,jsonb_build_object('revision_id',v_record.id,'version',v_record.version_number));
  return jsonb_build_object('record',to_jsonb(v_record));
end;
$$;

create or replace function public.ftf_submit_mission_operational_evidence(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_mission_id uuid,
  p_expected_version integer,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mission public.missions%rowtype;
  v_current integer;
  v_authority jsonb;
  v_resources public.mission_operational_resource_revisions%rowtype;
  v_chemicals public.mission_operational_chemical_revisions%rowtype;
  v_record public.mission_operational_revisions%rowtype;
  v_imports uuid[];
  v_events uuid[];
begin
  perform public.ftf_lock_mission_package_aggregate(p_organisation_id, p_mission_id);
  select * into v_mission from public.missions where organisation_id=p_organisation_id and id=p_mission_id and archived_at is null;
  if not found then return jsonb_build_object('not_found',true); end if;
  if not public.ftf_operational_location_allowed(p_organisation_id,p_actor_internal_user_id,v_mission.operating_location_id) then return jsonb_build_object('location_forbidden',true); end if;
  v_authority := public.ftf_resolve_effective_mission_authorisation(p_organisation_id,p_mission_id);
  if v_authority is null or v_authority->>'decision'<>'AUTHORISED' then return jsonb_build_object('not_authorised',true); end if;
  select * into v_resources from public.mission_operational_resource_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id order by version_number desc limit 1;
  select * into v_chemicals from public.mission_operational_chemical_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id order by version_number desc limit 1;
  if v_resources.id is null or v_chemicals.id is null then return jsonb_build_object('evidence_incomplete',true); end if;
  select coalesce(array_agg(id order by version_number),'{}') into v_imports from public.mission_operational_imports where organisation_id=p_organisation_id and mission_id=p_mission_id and parse_status<>'REJECTED';
  select coalesce(array_agg(id order by batch_version,event_index),'{}') into v_events from public.mission_operational_events where organisation_id=p_organisation_id and mission_id=p_mission_id and batch_version=(select max(batch_version) from public.mission_operational_events where organisation_id=p_organisation_id and mission_id=p_mission_id);
  if cardinality(v_events)=0 then return jsonb_build_object('evidence_incomplete',true); end if;
  select coalesce(max(version_number),0) into v_current from public.mission_operational_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id;
  if v_current<>p_expected_version then return jsonb_build_object('conflict',true,'current_version',v_current); end if;
  insert into public.mission_operational_revisions(organisation_id,operating_location_id,mission_id,version_number,authorisation_revision_id,source_file_ids,resource_revision_id,chemical_revision_id,event_ids,review_snapshot,operator_notes,submitted_by_internal_user_id)
  values(p_organisation_id,v_mission.operating_location_id,p_mission_id,v_current+1,(v_authority->>'id')::uuid,v_imports,v_resources.id,v_chemicals.id,v_events,p_payload,trim(coalesce(p_payload->>'notes','')),p_actor_internal_user_id) returning * into v_record;
  insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload) values(p_organisation_id,p_actor_internal_user_id,'mission.operational_evidence_submitted','mission',p_mission_id,jsonb_build_object('revision_id',v_record.id,'version',v_record.version_number));
  insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload) values(p_organisation_id,'operational.mission.evidence_submitted','mission',p_mission_id,jsonb_build_object('revision_id',v_record.id,'version',v_record.version_number));
  return jsonb_build_object('record',to_jsonb(v_record));
end;
$$;

create or replace function public.ftf_complete_mission(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_mission_id uuid,
  p_operational_revision_id uuid,
  p_expected_version integer,
  p_declaration text,
  p_override_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mission public.missions%rowtype;
  v_operational public.mission_operational_revisions%rowtype;
  v_authority jsonb;
  v_person public.personnel%rowtype;
  v_current integer;
  v_has_lines boolean;
  v_override boolean;
  v_record public.mission_completion_revisions%rowtype;
  v_snapshot jsonb;
begin
  perform public.ftf_lock_mission_package_aggregate(p_organisation_id, p_mission_id);
  select * into v_mission from public.missions where organisation_id=p_organisation_id and id=p_mission_id and archived_at is null;
  if not found then return jsonb_build_object('not_found',true); end if;
  if not public.ftf_operational_location_allowed(p_organisation_id,p_actor_internal_user_id,v_mission.operating_location_id) then return jsonb_build_object('location_forbidden',true); end if;
  select * into v_operational from public.mission_operational_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id and id=p_operational_revision_id;
  if not found then return jsonb_build_object('not_found',true); end if;
  v_authority := public.ftf_resolve_effective_mission_authorisation(p_organisation_id,p_mission_id);
  if v_authority is null or v_authority->>'decision'<>'AUTHORISED' or (v_authority->>'id')::uuid<>v_operational.authorisation_revision_id then
    return jsonb_build_object('not_authorised',true);
  end if;
  select exists(select 1 from public.mission_operational_imports item where item.organisation_id=p_organisation_id and item.id=any(v_operational.source_file_ids) and item.evidence_type in('FINAL_KML','FLIGHT_LINES') and item.parse_status='PARSED') into v_has_lines;
  v_override := not v_has_lines;
  if v_override and length(trim(coalesce(p_override_reason,'')))=0 then return jsonb_build_object('flight_lines_required',true); end if;
  select * into v_person from public.personnel where organisation_id=p_organisation_id and internal_user_id=p_actor_internal_user_id and archived_at is null;
  if v_override and not found then return jsonb_build_object('personnel_required',true); end if;
  select coalesce(max(version_number),0) into v_current from public.mission_completion_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id;
  if v_current<>p_expected_version then return jsonb_build_object('conflict',true,'current_version',v_current); end if;
  v_snapshot := jsonb_build_object('schemaVersion',1,'planningAndPreflightAuthorisation',v_authority,'operationalEvidence',to_jsonb(v_operational),'completedAt',now(),'flightLinesEvidenceAvailable',v_has_lines,'historicalFlag',case when v_override then'FLIGHT_LINES_OVERRIDE'else null end);
  insert into public.mission_completion_revisions(organisation_id,operating_location_id,mission_id,version_number,authorisation_revision_id,operational_revision_id,completion_snapshot,declaration,flight_lines_override,override_reason,override_personnel_id,completed_by_internal_user_id)
  values(p_organisation_id,v_mission.operating_location_id,p_mission_id,v_current+1,(v_authority->>'id')::uuid,v_operational.id,v_snapshot,trim(p_declaration),v_override,nullif(trim(coalesce(p_override_reason,'')),''),case when v_override then v_person.id else null end,p_actor_internal_user_id) returning * into v_record;
  insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload) values(p_organisation_id,p_actor_internal_user_id,'mission.completed','mission',p_mission_id,jsonb_build_object('completion_revision_id',v_record.id,'version',v_record.version_number,'flight_lines_override',v_override));
  insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload) values(p_organisation_id,'completion.mission.completed','mission',p_mission_id,jsonb_build_object('completion_revision_id',v_record.id,'version',v_record.version_number,'flight_lines_override',v_override));
  return jsonb_build_object('record',to_jsonb(v_record));
end;
$$;

create or replace function public.ftf_request_report_artefact(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_mission_id uuid,
  p_report_type text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mission public.missions%rowtype;
  v_existing public.report_artefacts%rowtype;
  v_completion public.mission_completion_revisions%rowtype;
  v_version integer;
  v_artefact public.report_artefacts%rowtype;
  v_branding jsonb;
  v_evidence jsonb;
  v_pack jsonb;
begin
  select * into v_existing from public.report_artefacts where organisation_id=p_organisation_id and idempotency_key=p_idempotency_key;
  if found then return jsonb_build_object('artefact',to_jsonb(v_existing),'reused',true); end if;
  select * into v_mission from public.missions where organisation_id=p_organisation_id and id=p_mission_id and archived_at is null;
  if not found then return jsonb_build_object('not_found',true); end if;
  if not public.ftf_operational_location_allowed(p_organisation_id,p_actor_internal_user_id,v_mission.operating_location_id) then return jsonb_build_object('location_forbidden',true); end if;
  if p_report_type='MISSION_PACK' and exists(select 1 from public.mission_operational_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id) then return jsonb_build_object('operation_started',true); end if;
  if p_report_type in('MISSION_SUMMARY','MISSION_RECORD') then
    select * into v_completion from public.mission_completion_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id order by version_number desc limit 1;
    if not found then return jsonb_build_object('completion_required',true); end if;
  end if;
  if p_report_type='MISSION_RECORD' then
    v_evidence:=jsonb_build_object('schemaVersion',1,'missionId',v_mission.id,'completionRevision',to_jsonb(v_completion),'missionOutcomes',coalesce((select jsonb_agg(to_jsonb(item) order by item.sequence_number) from public.mission_outcome_observations item where item.organisation_id=p_organisation_id and item.mission_id=v_mission.id),'[]'::jsonb),'customerOutcomes',coalesce((select jsonb_agg(to_jsonb(item) order by item.sequence_number) from public.customer_acceptance_records item where item.organisation_id=p_organisation_id and item.mission_id=v_mission.id),'[]'::jsonb));
  elsif p_report_type='MISSION_SUMMARY' then
    v_evidence:=jsonb_build_object('schemaVersion',1,'missionId',v_mission.id,'mission',to_jsonb(v_mission)-'organisation_id','completionRevision',to_jsonb(v_completion),'operationalRevision',(select to_jsonb(item) from public.mission_operational_revisions item where item.organisation_id=p_organisation_id and item.id=v_completion.operational_revision_id),'actualResources',(select to_jsonb(item) from public.mission_operational_resource_revisions item join public.mission_operational_revisions operational on operational.resource_revision_id=item.id where operational.organisation_id=p_organisation_id and operational.id=v_completion.operational_revision_id),'actualChemicals',(select to_jsonb(item) from public.mission_operational_chemical_revisions item join public.mission_operational_revisions operational on operational.chemical_revision_id=item.id where operational.organisation_id=p_organisation_id and operational.id=v_completion.operational_revision_id),'imports',coalesce((select jsonb_agg(to_jsonb(item) order by item.version_number) from public.mission_operational_imports item join public.mission_operational_revisions operational on item.id=any(operational.source_file_ids) where operational.organisation_id=p_organisation_id and operational.id=v_completion.operational_revision_id),'[]'::jsonb),'events',coalesce((select jsonb_agg(to_jsonb(item) order by item.event_index) from public.mission_operational_events item join public.mission_operational_revisions operational on item.id=any(operational.event_ids) where operational.organisation_id=p_organisation_id and operational.id=v_completion.operational_revision_id),'[]'::jsonb),'customerOutcomes',coalesce((select jsonb_agg(to_jsonb(item) order by item.sequence_number) from public.customer_acceptance_records item where item.organisation_id=p_organisation_id and item.mission_id=v_mission.id),'[]'::jsonb));
  else
    -- Reports must never select a newer PREPARING or REJECTED row.
    v_pack := public.ftf_project_mission_pack(p_organisation_id,p_mission_id,v_mission.current_authorised_pack_revision_id);
    if v_pack is null
      or public.ftf_resolve_effective_mission_authorisation(p_organisation_id,p_mission_id)->>'decision'<>'AUTHORISED' then
      return jsonb_build_object('not_authorised',true);
    end if;
    v_evidence:=jsonb_build_object('schemaVersion',1,'missionId',v_mission.id,'missionPackRevision',v_pack);
  end if;
  v_branding:=public.ftf_read_organisation_branding(p_organisation_id)||jsonb_build_object('attribution','Generated by Spray Command');
  select coalesce(max(version_number),0)+1 into v_version from public.report_artefacts where organisation_id=p_organisation_id and mission_id=v_mission.id and report_type=p_report_type;
  insert into public.report_artefacts(organisation_id,operating_location_id,mission_id,report_type,version_number,template_version,idempotency_key,branding_snapshot,evidence_manifest,requested_by_internal_user_id)
  values(p_organisation_id,v_mission.operating_location_id,v_mission.id,p_report_type,v_version,case when p_report_type='MISSION_PACK'then 3 when p_report_type='MISSION_SUMMARY'then 1 else 2 end,p_idempotency_key,v_branding,v_evidence,p_actor_internal_user_id) returning * into v_artefact;
  insert into public.report_generation_jobs(organisation_id,artefact_id) values(p_organisation_id,v_artefact.id);
  insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload) values(p_organisation_id,p_actor_internal_user_id,'report.requested','report_artefact',v_artefact.id,jsonb_build_object('report_type',p_report_type,'version',v_version));
  insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload) values(p_organisation_id,'reports.generation.requested','report_artefact',v_artefact.id,jsonb_build_object('report_type',p_report_type,'version',v_version));
  return jsonb_build_object('artefact',to_jsonb(v_artefact),'reused',false);
end;
$$;

-- Existing evidence RPCs are wrapped at their public boundary so they acquire
-- the aggregate lock before any of their historical row locks or validation
-- reads. The table triggers remain the fail-safe for direct writes.
alter function public.ftf_save_mission_map(uuid,uuid,uuid,integer,text,uuid,jsonb)
  rename to ftf_save_mission_map_before_package_lock;
create function public.ftf_save_mission_map(
  p_organisation_id uuid,p_actor_internal_user_id uuid,p_mission_id uuid,p_expected_version integer,
  p_notes text,p_source_field_boundary_version_id uuid,p_geometries jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.ftf_lock_mission_package_aggregate(p_organisation_id,p_mission_id);
  return public.ftf_save_mission_map_before_package_lock(p_organisation_id,p_actor_internal_user_id,p_mission_id,p_expected_version,p_notes,p_source_field_boundary_version_id,p_geometries);
end;$$;

alter function public.ftf_create_mission_map_source_file(uuid,uuid,uuid,text,text,text,text,text,text,bigint,text,text,jsonb,jsonb)
  rename to ftf_create_mission_map_source_file_before_package_lock;
create function public.ftf_create_mission_map_source_file(
  p_organisation_id uuid,p_actor_internal_user_id uuid,p_mission_id uuid,p_storage_provider text,p_storage_bucket text,
  p_storage_object_key text,p_original_filename text,p_source_format text,p_content_type text,p_file_size_bytes bigint,
  p_sha256_checksum text,p_original_crs text,p_transformation_metadata jsonb,p_validation_result jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.ftf_lock_mission_package_aggregate(p_organisation_id,p_mission_id);
  return public.ftf_create_mission_map_source_file_before_package_lock(p_organisation_id,p_actor_internal_user_id,p_mission_id,p_storage_provider,p_storage_bucket,p_storage_object_key,p_original_filename,p_source_format,p_content_type,p_file_size_bytes,p_sha256_checksum,p_original_crs,p_transformation_metadata,p_validation_result);
end;$$;

alter function public.ftf_save_mission_personnel(uuid,uuid,uuid,integer,jsonb)
  rename to ftf_save_mission_personnel_before_package_lock;
create function public.ftf_save_mission_personnel(
  p_organisation_id uuid,p_actor_internal_user_id uuid,p_mission_id uuid,p_expected_version integer,p_assignments jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.ftf_lock_mission_package_aggregate(p_organisation_id,p_mission_id);
  return public.ftf_save_mission_personnel_before_package_lock(p_organisation_id,p_actor_internal_user_id,p_mission_id,p_expected_version,p_assignments);
end;$$;

alter function public.ftf_save_mission_chemical_plan(uuid,uuid,uuid,integer,jsonb)
  rename to ftf_save_mission_chemical_plan_before_package_lock;
create function public.ftf_save_mission_chemical_plan(
  p_organisation_id uuid,p_actor_internal_user_id uuid,p_mission_id uuid,p_expected_version integer,p_payload jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.ftf_lock_mission_package_aggregate(p_organisation_id,p_mission_id);
  return public.ftf_save_mission_chemical_plan_before_package_lock(p_organisation_id,p_actor_internal_user_id,p_mission_id,p_expected_version,p_payload);
end;$$;

alter function public.ftf_save_mission_jsa(uuid,uuid,uuid,integer,jsonb)
  rename to ftf_save_mission_jsa_before_package_lock;
create function public.ftf_save_mission_jsa(
  p_organisation_id uuid,p_actor_internal_user_id uuid,p_mission_id uuid,p_expected_version integer,p_payload jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.ftf_lock_mission_package_aggregate(p_organisation_id,p_mission_id);
  return public.ftf_save_mission_jsa_before_package_lock(p_organisation_id,p_actor_internal_user_id,p_mission_id,p_expected_version,p_payload);
end;$$;

alter function public.ftf_approve_mission_jsa(uuid,uuid,uuid,uuid,integer)
  rename to ftf_approve_mission_jsa_before_package_lock;
create function public.ftf_approve_mission_jsa(
  p_organisation_id uuid,p_actor_internal_user_id uuid,p_mission_id uuid,p_revision_id uuid,p_expected_version integer
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.ftf_lock_mission_package_aggregate(p_organisation_id,p_mission_id);
  return public.ftf_approve_mission_jsa_before_package_lock(p_organisation_id,p_actor_internal_user_id,p_mission_id,p_revision_id,p_expected_version);
end;$$;

alter function public.ftf_create_mission_weather_observation(uuid,uuid,uuid,integer,jsonb)
  rename to ftf_create_mission_weather_observation_before_package_lock;
create function public.ftf_create_mission_weather_observation(
  p_organisation_id uuid,p_actor_internal_user_id uuid,p_mission_id uuid,p_expected_version integer,p_payload jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.ftf_lock_mission_package_aggregate(p_organisation_id,p_mission_id);
  return public.ftf_create_mission_weather_observation_before_package_lock(p_organisation_id,p_actor_internal_user_id,p_mission_id,p_expected_version,p_payload);
end;$$;

alter function public.ftf_select_mission_weather_observation(uuid,uuid,uuid,uuid,integer)
  rename to ftf_select_mission_weather_observation_before_package_lock;
create function public.ftf_select_mission_weather_observation(
  p_organisation_id uuid,p_actor_internal_user_id uuid,p_mission_id uuid,p_observation_id uuid,p_expected_selection_version integer
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.ftf_lock_mission_package_aggregate(p_organisation_id,p_mission_id);
  return public.ftf_select_mission_weather_observation_before_package_lock(p_organisation_id,p_actor_internal_user_id,p_mission_id,p_observation_id,p_expected_selection_version);
end;$$;

alter function public.ftf_create_mission_weather_forecast(uuid,uuid,uuid,integer,jsonb)
  rename to ftf_create_mission_weather_forecast_before_package_lock;
create function public.ftf_create_mission_weather_forecast(
  p_organisation_id uuid,p_actor_internal_user_id uuid,p_mission_id uuid,p_expected_version integer,p_payload jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.ftf_lock_mission_package_aggregate(p_organisation_id,p_mission_id);
  return public.ftf_create_mission_weather_forecast_before_package_lock(p_organisation_id,p_actor_internal_user_id,p_mission_id,p_expected_version,p_payload);
end;$$;

alter function public.ftf_select_mission_weather_forecast(uuid,uuid,uuid,uuid,integer)
  rename to ftf_select_mission_weather_forecast_before_package_lock;
create function public.ftf_select_mission_weather_forecast(
  p_organisation_id uuid,p_actor_internal_user_id uuid,p_mission_id uuid,p_forecast_revision_id uuid,p_expected_selection_version integer
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.ftf_lock_mission_package_aggregate(p_organisation_id,p_mission_id);
  return public.ftf_select_mission_weather_forecast_before_package_lock(p_organisation_id,p_actor_internal_user_id,p_mission_id,p_forecast_revision_id,p_expected_selection_version);
end;$$;

revoke all on function public.ftf_save_mission_map_before_package_lock(uuid,uuid,uuid,integer,text,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.ftf_create_mission_map_source_file_before_package_lock(uuid,uuid,uuid,text,text,text,text,text,text,bigint,text,text,jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.ftf_save_mission_personnel_before_package_lock(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.ftf_save_mission_chemical_plan_before_package_lock(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.ftf_save_mission_jsa_before_package_lock(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.ftf_approve_mission_jsa_before_package_lock(uuid,uuid,uuid,uuid,integer) from public,anon,authenticated,service_role;
revoke all on function public.ftf_create_mission_weather_observation_before_package_lock(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.ftf_select_mission_weather_observation_before_package_lock(uuid,uuid,uuid,uuid,integer) from public,anon,authenticated,service_role;
revoke all on function public.ftf_create_mission_weather_forecast_before_package_lock(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.ftf_select_mission_weather_forecast_before_package_lock(uuid,uuid,uuid,uuid,integer) from public,anon,authenticated,service_role;
revoke all on function public.ftf_save_mission_map(uuid,uuid,uuid,integer,text,uuid,jsonb),public.ftf_create_mission_map_source_file(uuid,uuid,uuid,text,text,text,text,text,text,bigint,text,text,jsonb,jsonb),public.ftf_save_mission_personnel(uuid,uuid,uuid,integer,jsonb),public.ftf_save_mission_chemical_plan(uuid,uuid,uuid,integer,jsonb),public.ftf_save_mission_jsa(uuid,uuid,uuid,integer,jsonb),public.ftf_approve_mission_jsa(uuid,uuid,uuid,uuid,integer),public.ftf_create_mission_weather_observation(uuid,uuid,uuid,integer,jsonb),public.ftf_select_mission_weather_observation(uuid,uuid,uuid,uuid,integer),public.ftf_create_mission_weather_forecast(uuid,uuid,uuid,integer,jsonb),public.ftf_select_mission_weather_forecast(uuid,uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.ftf_save_mission_map(uuid,uuid,uuid,integer,text,uuid,jsonb),public.ftf_create_mission_map_source_file(uuid,uuid,uuid,text,text,text,text,text,text,bigint,text,text,jsonb,jsonb),public.ftf_save_mission_personnel(uuid,uuid,uuid,integer,jsonb),public.ftf_save_mission_chemical_plan(uuid,uuid,uuid,integer,jsonb),public.ftf_save_mission_jsa(uuid,uuid,uuid,integer,jsonb),public.ftf_approve_mission_jsa(uuid,uuid,uuid,uuid,integer),public.ftf_create_mission_weather_observation(uuid,uuid,uuid,integer,jsonb),public.ftf_select_mission_weather_observation(uuid,uuid,uuid,uuid,integer),public.ftf_create_mission_weather_forecast(uuid,uuid,uuid,integer,jsonb),public.ftf_select_mission_weather_forecast(uuid,uuid,uuid,uuid,integer) to service_role;
