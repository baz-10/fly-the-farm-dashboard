-- Forward-only trusted workflow prerequisites: immutable field boundary
-- versions, atomic job/field writes, and Planning-only mission metadata.

alter table public.field_boundary_versions add column field_id uuid;

update public.field_boundary_versions fbv
set field_id = current_fields.id
from (
  select distinct on (f.organisation_id, f.field_boundary_version_id)
    f.organisation_id, f.field_boundary_version_id, f.id
  from public.fields f
  where f.field_boundary_version_id is not null
  order by f.organisation_id, f.field_boundary_version_id, f.id
) current_fields
where current_fields.organisation_id = fbv.organisation_id
  and current_fields.field_boundary_version_id = fbv.id;

do $$
declare
  v_constraint_name text;
begin
  select conname into v_constraint_name
  from pg_constraint
  where conrelid = 'public.field_boundary_versions'::regclass
    and contype = 'u'
    and pg_get_constraintdef(oid) = 'UNIQUE (organisation_id, property_id, version_number)';
  if v_constraint_name is not null then
    execute format('alter table public.field_boundary_versions drop constraint %I', v_constraint_name);
  end if;
end;
$$;

alter table public.field_boundary_versions
  add constraint field_boundary_versions_field_fk
  foreign key (organisation_id, property_id, field_id)
  references public.fields (organisation_id, property_id, id);
alter table public.field_boundary_versions
  add constraint field_boundary_versions_field_version_unique
  unique (organisation_id, field_id, version_number);
create index field_boundary_versions_organisation_field_idx
  on public.field_boundary_versions (organisation_id, field_id, version_number desc);

alter table public.jobs add column scope text not null default '';
alter table public.jobs add column notes text not null default '';
alter table public.jobs add column requested_date date;
alter table public.jobs add column scheduled_date date;

alter table public.missions add column title text not null default '';
alter table public.missions add column description text not null default '';

-- Boundary versions are immutable. Reads remain available to the trusted
-- repository, while all creation occurs through the command below.
create trigger field_boundary_versions_reject_mutation
before update or delete on public.field_boundary_versions
for each row execute function public.reject_append_only_mutation();
revoke insert, update, delete on table public.field_boundary_versions from service_role;
revoke insert, update, delete on table public.job_fields from service_role;
grant select on table public.field_boundary_versions to service_role;
grant select on table public.job_fields to service_role;

create function public.ftf_actor_has_active_beta_seat(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.internal_users iu
    join public.memberships m
      on m.organisation_id = iu.organisation_id and m.internal_user_id = iu.id
    join public.internal_user_seat_assignments sa
      on sa.organisation_id = iu.organisation_id and sa.internal_user_id = iu.id
    join public.organisation_seat_allocations allocation
      on allocation.organisation_id = sa.organisation_id
     and allocation.id = sa.organisation_seat_allocation_id
    where iu.organisation_id = p_organisation_id
      and iu.id = p_actor_internal_user_id
      and iu.is_active = true and iu.archived_at is null
      and m.is_active = true and m.archived_at is null
      and sa.status = 'active' and sa.archived_at is null
      and allocation.allocated_seats > 0 and allocation.archived_at is null
  );
$$;

create function public.ftf_boundary_geojson_is_valid(p_geojson jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_polygons jsonb;
  v_polygon jsonb;
  v_ring jsonb;
  v_point jsonb;
  v_first jsonb;
  v_last jsonb;
  v_longitude numeric;
  v_latitude numeric;
begin
  if p_geojson is null or jsonb_typeof(p_geojson) <> 'object' then return false; end if;
  if p_geojson->>'type' not in ('Polygon', 'MultiPolygon') then return false; end if;
  if jsonb_typeof(p_geojson->'coordinates') <> 'array'
    or jsonb_array_length(p_geojson->'coordinates') = 0 then return false; end if;
  if p_geojson - 'type' - 'coordinates' <> '{}'::jsonb then return false; end if;

  if p_geojson->>'type' = 'Polygon' then
    v_polygons := jsonb_build_array(p_geojson->'coordinates');
  else
    v_polygons := p_geojson->'coordinates';
  end if;

  for v_polygon in select value from jsonb_array_elements(v_polygons)
  loop
    if jsonb_typeof(v_polygon) <> 'array' or jsonb_array_length(v_polygon) = 0 then return false; end if;
    for v_ring in select value from jsonb_array_elements(v_polygon)
    loop
      if jsonb_typeof(v_ring) <> 'array' or jsonb_array_length(v_ring) < 4 then return false; end if;
      v_first := v_ring->0;
      v_last := v_ring->(jsonb_array_length(v_ring) - 1);
      if v_first <> v_last then return false; end if;
      for v_point in select value from jsonb_array_elements(v_ring)
      loop
        if jsonb_typeof(v_point) <> 'array' or jsonb_array_length(v_point) <> 2
          or jsonb_typeof(v_point->0) <> 'number' or jsonb_typeof(v_point->1) <> 'number' then
          return false;
        end if;
        begin
          v_longitude := (v_point->>0)::numeric;
          v_latitude := (v_point->>1)::numeric;
        exception when others then
          return false;
        end;
        if v_longitude < -180 or v_longitude > 180 or v_latitude < -90 or v_latitude > 90 then
          return false;
        end if;
      end loop;
    end loop;
  end loop;
  return true;
end;
$$;

create function public.ftf_create_field_boundary_version(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_field_id uuid,
  p_property_id uuid,
  p_expected_field_version integer,
  p_boundary_geojson jsonb,
  p_captured_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_version integer;
  v_boundary_version integer;
  v_field_version integer;
  v_record jsonb;
begin
  perform pg_advisory_xact_lock(hashtext(p_organisation_id::text)::bigint);
  if not public.ftf_actor_has_active_beta_seat(p_organisation_id, p_actor_internal_user_id) then
    raise exception 'active organisation actor seat required' using errcode = '42501';
  end if;
  if p_expected_field_version is null or p_expected_field_version < 1 then
    raise exception 'expected field version is required';
  end if;
  if octet_length(p_boundary_geojson::text) > 262144 then
    raise exception 'boundary GeoJSON is too large' using errcode = '22001';
  end if;
  if not public.ftf_boundary_geojson_is_valid(p_boundary_geojson) then
    raise exception 'invalid Polygon or MultiPolygon boundary GeoJSON' using errcode = '22023';
  end if;

  select f.row_version into v_current_version
  from public.properties p
  join public.fields f
    on f.organisation_id = p.organisation_id and f.property_id = p.id
  where p.organisation_id = p_organisation_id and p.id = p_property_id
    and p.archived_at is null
    and f.id = p_field_id and f.archived_at is null
  for update of p, f;
  if v_current_version is null then
    return jsonb_build_object('relationship_conflict', true);
  end if;
  if v_current_version <> p_expected_field_version then
    return jsonb_build_object('conflict', true, 'current_version', v_current_version);
  end if;

  select coalesce(max(version_number), 0) + 1 into v_boundary_version
  from public.field_boundary_versions
  where organisation_id = p_organisation_id and field_id = p_field_id;

  insert into public.field_boundary_versions (
    organisation_id, property_id, field_id, version_number, boundary_geojson, captured_at
  ) values (
    p_organisation_id, p_property_id, p_field_id, v_boundary_version, p_boundary_geojson, p_captured_at
  ) returning to_jsonb(field_boundary_versions) into v_record;

  update public.fields f
  set field_boundary_version_id = (v_record->>'id')::uuid
  where f.organisation_id = p_organisation_id and f.id = p_field_id
    and f.property_id = p_property_id and f.row_version = p_expected_field_version
    and f.archived_at is null
  returning row_version into v_field_version;
  if v_field_version is null then
    raise exception 'field boundary version update lost its locked row';
  end if;

  insert into public.audit_events (
    organisation_id, actor_internal_user_id, event_type, entity_type, entity_id, event_payload
  ) values (
    p_organisation_id, p_actor_internal_user_id, 'field_boundary_versions.create',
    'field_boundary_versions', (v_record->>'id')::uuid,
    jsonb_build_object('record', v_record, 'field_id', p_field_id, 'field_version', v_field_version)
  );
  insert into public.transactional_outbox (
    organisation_id, topic, aggregate_type, aggregate_id, payload
  ) values (
    p_organisation_id, 'operational.field_boundary_versions.create',
    'field_boundary_versions', (v_record->>'id')::uuid,
    jsonb_build_object('record', v_record, 'field_id', p_field_id, 'field_version', v_field_version)
  );

  return jsonb_build_object('record', v_record, 'field_version', v_field_version);
end;
$$;

create function public.ftf_write_live_chain_job_unlocked(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_operation text,
  p_entity_id uuid,
  p_expected_version integer,
  p_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_version integer;
  v_current_client_id uuid;
  v_current_property_id uuid;
  v_archived_at timestamptz;
  v_record jsonb;
  v_field_ids uuid[];
  v_field_count integer;
  v_distinct_field_count integer;
  v_field_id uuid;
begin
  if p_operation not in ('create', 'update', 'archive') then raise exception 'unsupported job write'; end if;
  if p_operation <> 'create' then
    if p_entity_id is null or p_expected_version is null or p_expected_version < 1 then
      raise exception 'entity id and expected version are required';
    end if;
    select row_version, archived_at, client_id, property_id
      into v_current_version, v_archived_at, v_current_client_id, v_current_property_id
    from public.jobs where organisation_id = p_organisation_id and id = p_entity_id for update;
    if v_current_version is null or v_archived_at is not null then return jsonb_build_object('not_found', true); end if;
    if v_current_version <> p_expected_version then return jsonb_build_object('conflict', true, 'current_version', v_current_version); end if;
    if p_operation = 'archive' and exists (
      select 1 from public.missions where organisation_id = p_organisation_id and job_id = p_entity_id and archived_at is null
    ) then return jsonb_build_object('archive_conflict', true); end if;
    -- A job's tenant-bound client/property chain is immutable. Moving it would
    -- invalidate archived job_fields history under the composite foreign key.
    if p_operation = 'update' and (
      (p_data->>'client_id')::uuid is distinct from v_current_client_id
      or (p_data->>'property_id')::uuid is distinct from v_current_property_id
    ) then return jsonb_build_object('relationship_conflict', true); end if;
  end if;

  if p_operation = 'archive' then
    update public.job_fields jf set archived_at = now(), archived_by_internal_user_id = p_actor_internal_user_id
    where jf.organisation_id = p_organisation_id and jf.job_id = p_entity_id and jf.archived_at is null;
    update public.jobs j set archived_at = now(), archived_by_internal_user_id = p_actor_internal_user_id
    where j.organisation_id = p_organisation_id and j.id = p_entity_id
      and j.row_version = p_expected_version and j.archived_at is null
    returning to_jsonb(j) into v_record;
  else
    if jsonb_typeof(p_data->'field_ids') <> 'array' or jsonb_array_length(p_data->'field_ids') < 1 then
      raise exception 'at least one field id is required' using errcode = '22023';
    end if;
    select array_agg(field_id order by field_id), count(*)::integer, count(distinct field_id)::integer
    into v_field_ids, v_field_count, v_distinct_field_count
    from (
      select (value #>> '{}')::uuid as field_id
      from jsonb_array_elements(p_data->'field_ids')
    ) requested_fields;
    if v_field_count <> v_distinct_field_count or v_field_count > 100 then
      raise exception 'field ids must be unique and contain no more than 100 values' using errcode = '22023';
    end if;

    perform 1 from public.clients
    where organisation_id = p_organisation_id and id = (p_data->>'client_id')::uuid and archived_at is null
    for update;
    if not found then return jsonb_build_object('relationship_conflict', true); end if;
    perform 1 from public.properties
    where organisation_id = p_organisation_id and id = (p_data->>'property_id')::uuid
      and client_id = (p_data->>'client_id')::uuid and archived_at is null
    for update;
    if not found then return jsonb_build_object('relationship_conflict', true); end if;
    foreach v_field_id in array v_field_ids loop
      perform 1 from public.fields
      where organisation_id = p_organisation_id and id = v_field_id
        and property_id = (p_data->>'property_id')::uuid and archived_at is null
      for update;
      if not found then return jsonb_build_object('relationship_conflict', true); end if;
    end loop;

    if p_operation = 'create' then
      insert into public.jobs (
        organisation_id, client_id, property_id, reference, scope, status, notes, requested_date, scheduled_date
      ) values (
        p_organisation_id, (p_data->>'client_id')::uuid, (p_data->>'property_id')::uuid,
        p_data->>'reference', coalesce(p_data->>'scope', ''), coalesce(p_data->>'status', 'draft'),
        coalesce(p_data->>'notes', ''), nullif(p_data->>'requested_date', '')::date,
        nullif(p_data->>'scheduled_date', '')::date
      ) returning to_jsonb(jobs) into v_record;
    else
      update public.jobs j set
        client_id = (p_data->>'client_id')::uuid,
        property_id = (p_data->>'property_id')::uuid,
        reference = p_data->>'reference',
        scope = coalesce(p_data->>'scope', ''),
        status = coalesce(p_data->>'status', 'draft'),
        notes = coalesce(p_data->>'notes', ''),
        requested_date = nullif(p_data->>'requested_date', '')::date,
        scheduled_date = nullif(p_data->>'scheduled_date', '')::date
      where j.organisation_id = p_organisation_id and j.id = p_entity_id
        and j.row_version = p_expected_version and j.archived_at is null
      returning to_jsonb(j) into v_record;
    end if;

    update public.job_fields jf set
      archived_at = now(), archived_by_internal_user_id = p_actor_internal_user_id
    where jf.organisation_id = p_organisation_id
      and jf.job_id = (v_record->>'id')::uuid and jf.archived_at is null
      and not (jf.field_id = any(v_field_ids));
    foreach v_field_id in array v_field_ids loop
      insert into public.job_fields (organisation_id, property_id, job_id, field_id)
      values (p_organisation_id, (p_data->>'property_id')::uuid, (v_record->>'id')::uuid, v_field_id)
      on conflict (organisation_id, job_id, field_id) do update set
        property_id = excluded.property_id,
        archived_at = null,
        archived_by_internal_user_id = null;
    end loop;
    v_record := v_record || jsonb_build_object('field_ids', to_jsonb(v_field_ids));
  end if;

  if v_record is null then
    select row_version, archived_at into v_current_version, v_archived_at
    from public.jobs where organisation_id = p_organisation_id and id = p_entity_id;
    if v_current_version is null or v_archived_at is not null then return jsonb_build_object('not_found', true); end if;
    return jsonb_build_object('conflict', true, 'current_version', v_current_version);
  end if;
  insert into public.audit_events (organisation_id, actor_internal_user_id, event_type, entity_type, entity_id, event_payload)
  values (p_organisation_id, p_actor_internal_user_id, 'jobs.' || p_operation, 'jobs', (v_record->>'id')::uuid, jsonb_build_object('record', v_record));
  insert into public.transactional_outbox (organisation_id, topic, aggregate_type, aggregate_id, payload)
  values (p_organisation_id, 'operational.jobs.' || p_operation, 'jobs', (v_record->>'id')::uuid, jsonb_build_object('record', v_record));
  return jsonb_build_object('record', v_record);
end;
$$;

create function public.ftf_write_live_chain_mission_unlocked(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_operation text,
  p_entity_id uuid,
  p_expected_version integer,
  p_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_version integer;
  v_current_status text;
  v_archived_at timestamptz;
  v_record jsonb;
begin
  if p_operation not in ('create', 'update', 'archive') then raise exception 'unsupported mission write'; end if;
  if p_operation <> 'create' then
    if p_entity_id is null or p_expected_version is null or p_expected_version < 1 then
      raise exception 'entity id and expected version are required';
    end if;
    select row_version, status, archived_at into v_current_version, v_current_status, v_archived_at
    from public.missions where organisation_id = p_organisation_id and id = p_entity_id for update;
    if v_current_version is null or v_archived_at is not null then return jsonb_build_object('not_found', true); end if;
    if v_current_version <> p_expected_version then return jsonb_build_object('conflict', true, 'current_version', v_current_version); end if;
    if p_operation = 'update' and lower(v_current_status) <> 'planning' then
      return jsonb_build_object('lifecycle_conflict', true);
    end if;
    if p_operation = 'archive' and exists (
      select 1 from public.mission_versions where organisation_id = p_organisation_id and mission_id = p_entity_id and archived_at is null
    ) then return jsonb_build_object('archive_conflict', true); end if;
  end if;

  if p_operation = 'archive' then
    update public.missions m set archived_at = now(), archived_by_internal_user_id = p_actor_internal_user_id
    where m.organisation_id = p_organisation_id and m.id = p_entity_id
      and m.row_version = p_expected_version and m.archived_at is null
    returning to_jsonb(m) into v_record;
  else
    if coalesce(lower(p_data->>'status'), 'planning') <> 'planning' then
      raise exception 'mission API writes may only create or update Planning records' using errcode = '22023';
    end if;
    perform 1 from public.jobs
    where organisation_id = p_organisation_id and id = (p_data->>'job_id')::uuid and archived_at is null
    for update;
    if not found then return jsonb_build_object('relationship_conflict', true); end if;
    perform 1 from public.operating_locations
    where organisation_id = p_organisation_id and id = (p_data->>'operating_location_id')::uuid and archived_at is null
    for update;
    if not found then return jsonb_build_object('relationship_conflict', true); end if;
    if not exists (
      select 1 from public.membership_operating_location_assignments mla
      join public.memberships m on m.organisation_id = mla.organisation_id and m.id = mla.membership_id
      where mla.organisation_id = p_organisation_id
        and mla.operating_location_id = (p_data->>'operating_location_id')::uuid
        and mla.is_active = true and mla.archived_at is null
        and m.internal_user_id = p_actor_internal_user_id
        and m.is_active = true and m.archived_at is null
    ) then return jsonb_build_object('location_forbidden', true); end if;

    if p_operation = 'create' then
      insert into public.missions (
        organisation_id, job_id, operating_location_id, mission_number, title, description, status, scheduled_start_at
      ) values (
        p_organisation_id, (p_data->>'job_id')::uuid, (p_data->>'operating_location_id')::uuid,
        p_data->>'mission_number', coalesce(nullif(p_data->>'title', ''), p_data->>'mission_number'),
        coalesce(p_data->>'description', ''), 'planning', nullif(p_data->>'scheduled_start_at', '')::timestamptz
      ) returning to_jsonb(missions) into v_record;
    else
      update public.missions m set
        job_id = (p_data->>'job_id')::uuid,
        operating_location_id = (p_data->>'operating_location_id')::uuid,
        mission_number = p_data->>'mission_number',
        title = coalesce(nullif(p_data->>'title', ''), p_data->>'mission_number'),
        description = coalesce(p_data->>'description', ''),
        status = 'planning',
        scheduled_start_at = nullif(p_data->>'scheduled_start_at', '')::timestamptz
      where m.organisation_id = p_organisation_id and m.id = p_entity_id
        and m.row_version = p_expected_version and m.archived_at is null
      returning to_jsonb(m) into v_record;
    end if;
  end if;

  if v_record is null then
    select row_version, archived_at into v_current_version, v_archived_at
    from public.missions where organisation_id = p_organisation_id and id = p_entity_id;
    if v_current_version is null or v_archived_at is not null then return jsonb_build_object('not_found', true); end if;
    return jsonb_build_object('conflict', true, 'current_version', v_current_version);
  end if;
  insert into public.audit_events (organisation_id, actor_internal_user_id, event_type, entity_type, entity_id, event_payload)
  values (p_organisation_id, p_actor_internal_user_id, 'missions.' || p_operation, 'missions', (v_record->>'id')::uuid, jsonb_build_object('record', v_record));
  insert into public.transactional_outbox (organisation_id, topic, aggregate_type, aggregate_id, payload)
  values (p_organisation_id, 'operational.missions.' || p_operation, 'missions', (v_record->>'id')::uuid, jsonb_build_object('record', v_record));
  return jsonb_build_object('record', v_record);
end;
$$;

alter function public.ftf_write_operational_resource(uuid, uuid, text, text, uuid, integer, jsonb)
  rename to ftf_write_operational_resource_with_access_prerequisites;

create function public.ftf_write_operational_resource(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_resource text,
  p_operation text,
  p_entity_id uuid default null,
  p_expected_version integer default null,
  p_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The deterministic organisation lock precedes every target/parent lock.
  perform pg_advisory_xact_lock(hashtext(p_organisation_id::text)::bigint);
  if p_resource in ('jobs', 'missions')
    and not public.ftf_actor_has_active_beta_seat(p_organisation_id, p_actor_internal_user_id) then
    raise exception 'active organisation actor seat required' using errcode = '42501';
  end if;
  if p_resource = 'jobs' then
    return public.ftf_write_live_chain_job_unlocked(
      p_organisation_id, p_actor_internal_user_id, p_operation,
      p_entity_id, p_expected_version, p_data
    );
  end if;
  if p_resource = 'missions' then
    return public.ftf_write_live_chain_mission_unlocked(
      p_organisation_id, p_actor_internal_user_id, p_operation,
      p_entity_id, p_expected_version, p_data
    );
  end if;
  return public.ftf_write_operational_resource_with_access_prerequisites(
    p_organisation_id, p_actor_internal_user_id, p_resource, p_operation,
    p_entity_id, p_expected_version, p_data
  );
end;
$$;

revoke all on function public.ftf_actor_has_active_beta_seat(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.ftf_boundary_geojson_is_valid(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.ftf_write_live_chain_job_unlocked(uuid, uuid, text, uuid, integer, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.ftf_write_live_chain_mission_unlocked(uuid, uuid, text, uuid, integer, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.ftf_write_operational_resource_with_access_prerequisites(uuid, uuid, text, text, uuid, integer, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.ftf_create_field_boundary_version(uuid, uuid, uuid, uuid, integer, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.ftf_create_field_boundary_version(uuid, uuid, uuid, uuid, integer, jsonb, timestamptz) to service_role;
revoke all on function public.ftf_write_operational_resource(uuid, uuid, text, text, uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.ftf_write_operational_resource(uuid, uuid, text, text, uuid, integer, jsonb) to service_role;
