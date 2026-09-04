-- Authoritative per-aircraft daily time and optional flight details. The
-- existing Mission closeout/import stream and Fleet meter ledger remain the
-- canonical parent and downstream authorities. No Production application is
-- authorised by this migration file.

do $migration$
begin
  if to_regclass('storage.buckets') is not null then
    execute $storage$
      update storage.buckets
      set allowed_mime_types = array[
        'application/vnd.google-earth.kml+xml',
        'application/vnd.google-earth.kmz',
        'text/plain',
        'text/csv',
        'application/octet-stream'
      ]
      where id = 'mission-operational-evidence'
    $storage$;
  end if;
end
$migration$;

create table public.mission_aircraft_day_actuals (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  operating_location_id uuid not null,
  mission_id uuid not null,
  operating_day_id uuid not null,
  mission_pack_revision_id uuid not null,
  mission_aircraft_assignment_id uuid,
  aircraft_id uuid not null,
  declared_total_hours numeric(10,4),
  total_flight_hours numeric(10,4) not null,
  flights_total_hours numeric(10,4) not null default 0,
  total_source text not null check (total_source in ('DECLARED', 'DERIVED_FROM_FLIGHTS')),
  reconciliation_status text not null check (reconciliation_status in ('TOTAL_ONLY', 'FLIGHTS_ONLY', 'RECONCILED', 'MISMATCH')),
  row_version integer not null default 1 check (row_version > 0),
  recorded_by_internal_user_id uuid not null,
  updated_by_internal_user_id uuid not null,
  signed_off_at timestamptz,
  signed_off_by_internal_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, id),
  unique (organisation_id, operating_day_id, aircraft_id),
  unique (organisation_id, mission_id, operating_day_id, id, aircraft_id),
  foreign key (organisation_id, mission_id, operating_day_id)
    references public.mission_operating_days (organisation_id, mission_id, id),
  foreign key (organisation_id, mission_id, mission_pack_revision_id)
    references public.mission_pack_revisions (organisation_id, mission_id, id),
  foreign key (organisation_id, mission_aircraft_assignment_id)
    references public.mission_aircraft_assignments (organisation_id, id),
  foreign key (organisation_id, aircraft_id)
    references public.aircraft (organisation_id, id),
  foreign key (organisation_id, operating_location_id)
    references public.operating_locations (organisation_id, id),
  foreign key (organisation_id, recorded_by_internal_user_id)
    references public.internal_users (organisation_id, id),
  foreign key (organisation_id, updated_by_internal_user_id)
    references public.internal_users (organisation_id, id),
  foreign key (organisation_id, signed_off_by_internal_user_id)
    references public.internal_users (organisation_id, id),
  check (declared_total_hours is null or declared_total_hours >= 0),
  check (total_flight_hours >= 0 and flights_total_hours >= 0),
  check ((total_source = 'DECLARED' and declared_total_hours is not null and total_flight_hours = declared_total_hours)
    or (total_source = 'DERIVED_FROM_FLIGHTS' and declared_total_hours is null and total_flight_hours = flights_total_hours)),
  check ((signed_off_at is null) = (signed_off_by_internal_user_id is null))
);

create table public.mission_flight_actuals (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  operating_location_id uuid not null,
  mission_id uuid not null,
  operating_day_id uuid not null,
  aircraft_day_actual_id uuid not null,
  aircraft_id uuid not null,
  flight_index integer not null check (flight_index > 0),
  duration_hours numeric(10,4) not null check (duration_hours >= 0),
  started_at timestamptz,
  finished_at timestamptz,
  field_id uuid,
  source_import_id uuid,
  recorded_by_internal_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (organisation_id, id),
  unique (organisation_id, aircraft_day_actual_id, flight_index),
  foreign key (organisation_id, mission_id, operating_day_id, aircraft_day_actual_id, aircraft_id)
    references public.mission_aircraft_day_actuals (organisation_id, mission_id, operating_day_id, id, aircraft_id),
  foreign key (organisation_id, field_id)
    references public.fields (organisation_id, id),
  foreign key (organisation_id, source_import_id)
    references public.mission_operational_imports (organisation_id, id),
  foreign key (organisation_id, operating_location_id)
    references public.operating_locations (organisation_id, id),
  foreign key (organisation_id, recorded_by_internal_user_id)
    references public.internal_users (organisation_id, id),
  check (finished_at is null or started_at is not null),
  check (finished_at is null or finished_at >= started_at)
);

create table public.mission_operational_import_attributions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  operating_location_id uuid not null,
  mission_id uuid not null,
  operational_import_id uuid not null,
  operating_day_id uuid,
  aircraft_id uuid,
  attribution_confidence text not null check (attribution_confidence in ('OPERATOR_CONFIRMED', 'SOURCE_METADATA')),
  attributed_by_internal_user_id uuid not null,
  attributed_at timestamptz not null default now(),
  unique (organisation_id, id),
  unique (organisation_id, operational_import_id, operating_day_id, aircraft_id),
  foreign key (organisation_id, operational_import_id)
    references public.mission_operational_imports (organisation_id, id),
  foreign key (organisation_id, mission_id, operating_day_id)
    references public.mission_operating_days (organisation_id, mission_id, id),
  foreign key (organisation_id, aircraft_id)
    references public.aircraft (organisation_id, id),
  foreign key (organisation_id, operating_location_id)
    references public.operating_locations (organisation_id, id),
  foreign key (organisation_id, attributed_by_internal_user_id)
    references public.internal_users (organisation_id, id),
  check (num_nonnulls(operating_day_id, aircraft_id) > 0)
);

create index mission_aircraft_day_actuals_day_idx
  on public.mission_aircraft_day_actuals (organisation_id, mission_id, operating_day_id, aircraft_id);
create index mission_flight_actuals_day_idx
  on public.mission_flight_actuals (organisation_id, mission_id, operating_day_id, aircraft_id, flight_index);
create index mission_operational_import_attributions_import_idx
  on public.mission_operational_import_attributions (organisation_id, mission_id, operational_import_id);

alter table public.mission_aircraft_day_actuals enable row level security;
alter table public.mission_aircraft_day_actuals force row level security;
alter table public.mission_flight_actuals enable row level security;
alter table public.mission_flight_actuals force row level security;
alter table public.mission_operational_import_attributions enable row level security;
alter table public.mission_operational_import_attributions force row level security;

create policy mission_aircraft_day_actuals_tenant_read on public.mission_aircraft_day_actuals
  for select to authenticated using (public.current_user_has_organisation_access(organisation_id));
create policy mission_flight_actuals_tenant_read on public.mission_flight_actuals
  for select to authenticated using (public.current_user_has_organisation_access(organisation_id));
create policy mission_operational_import_attributions_tenant_read on public.mission_operational_import_attributions
  for select to authenticated using (public.current_user_has_organisation_access(organisation_id));

revoke all on table public.mission_aircraft_day_actuals from public, anon, authenticated, service_role;
revoke all on table public.mission_flight_actuals from public, anon, authenticated, service_role;
revoke all on table public.mission_operational_import_attributions from public, anon, authenticated, service_role;

create function public.ftf_guard_mission_aircraft_day_actual_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_day_state text;
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'MISSION_AIRCRAFT_DAY_DELETE_FORBIDDEN';
  end if;
  if old.signed_off_at is not null then
    raise exception using errcode = '55000', message = 'MISSION_AIRCRAFT_DAY_SIGNED_OFF_IMMUTABLE';
  end if;
  if new.organisation_id <> old.organisation_id
    or new.operating_location_id <> old.operating_location_id
    or new.mission_id <> old.mission_id
    or new.operating_day_id <> old.operating_day_id
    or new.mission_pack_revision_id <> old.mission_pack_revision_id
    or new.aircraft_id <> old.aircraft_id
    or new.recorded_by_internal_user_id <> old.recorded_by_internal_user_id
    or new.created_at <> old.created_at then
    raise exception using errcode = '55000', message = 'MISSION_AIRCRAFT_DAY_AUTHORITY_IMMUTABLE';
  end if;
  if new.signed_off_at is not null and old.signed_off_at is null then
    select state into v_day_state from public.mission_operating_days
      where organisation_id = new.organisation_id and mission_id = new.mission_id and id = new.operating_day_id;
    if v_day_state <> 'SIGNED_OFF'
      or coalesce(current_setting('app.mission_aircraft_projection', true), '') <> 'allowed' then
      raise exception using errcode = '55000', message = 'MISSION_AIRCRAFT_DAY_SIGNOFF_COMMAND_REQUIRED';
    end if;
  end if;
  return new;
end;
$$;

create function public.ftf_guard_mission_flight_actual_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_signed_off_at timestamptz; v_day_state text; v_actual_id uuid; v_organisation_id uuid;
begin
  v_actual_id := case when tg_op = 'DELETE' then old.aircraft_day_actual_id else new.aircraft_day_actual_id end;
  v_organisation_id := case when tg_op = 'DELETE' then old.organisation_id else new.organisation_id end;
  select actual.signed_off_at, day.state into v_signed_off_at, v_day_state
  from public.mission_aircraft_day_actuals actual
  join public.mission_operating_days day on day.organisation_id = actual.organisation_id and day.id = actual.operating_day_id
  where actual.organisation_id = v_organisation_id and actual.id = v_actual_id;
  if v_signed_off_at is not null or v_day_state = 'SIGNED_OFF' then
    raise exception using errcode = '55000', message = 'MISSION_AIRCRAFT_DAY_SIGNED_OFF_IMMUTABLE';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create function public.ftf_guard_mission_aircraft_actuals_on_day_signoff()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.state = 'SIGNED_OFF' and old.state <> 'SIGNED_OFF' then
    if not exists (
      select 1 from public.mission_aircraft_day_actuals actual
      where actual.organisation_id = new.organisation_id
        and actual.mission_id = new.mission_id
        and actual.operating_day_id = new.id
    ) then
      raise exception using errcode = '23514', message = 'MISSION_AIRCRAFT_DAY_REQUIRED';
    end if;
    if exists (
      select 1 from public.mission_aircraft_day_actuals actual
      where actual.organisation_id = new.organisation_id
        and actual.mission_id = new.mission_id
        and actual.operating_day_id = new.id
        and actual.reconciliation_status = 'MISMATCH'
    ) then
      raise exception using errcode = '23514', message = 'AIRCRAFT_FLIGHT_TOTAL_MISMATCH';
    end if;
  end if;
  return new;
end;
$$;

create trigger mission_aircraft_day_actuals_mutation_guard
  before update or delete on public.mission_aircraft_day_actuals
  for each row execute function public.ftf_guard_mission_aircraft_day_actual_mutation();
create trigger mission_aircraft_day_actuals_set_update_metadata
  before update on public.mission_aircraft_day_actuals
  for each row execute function public.set_tenant_row_update_metadata();
create trigger mission_flight_actuals_mutation_guard
  before insert or update or delete on public.mission_flight_actuals
  for each row execute function public.ftf_guard_mission_flight_actual_mutation();
create trigger mission_operational_import_attributions_immutable
  before update or delete on public.mission_operational_import_attributions
  for each row execute function public.reject_append_only_mutation();
create trigger mission_operating_days_aircraft_actuals_signoff_guard
  before update of state on public.mission_operating_days
  for each row execute function public.ftf_guard_mission_aircraft_actuals_on_day_signoff();

create function public.ftf_project_mission_aircraft_day_actuals(
  p_organisation_id uuid,
  p_mission_id uuid,
  p_operating_day_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'mission_id', day.mission_id,
    'operating_day_id', day.id,
    'package_revision_id', day.mission_pack_revision_id,
    'day_version', day.row_version,
    'total_aircraft_hours', coalesce((select sum(actual.total_flight_hours)::numeric(10,4)::text
      from public.mission_aircraft_day_actuals actual
      where actual.organisation_id = day.organisation_id and actual.mission_id = day.mission_id and actual.operating_day_id = day.id), '0.0000'),
    'ready_for_sign_off', coalesce((select count(*) > 0 and bool_and(actual.reconciliation_status <> 'MISMATCH')
      from public.mission_aircraft_day_actuals actual
      where actual.organisation_id = day.organisation_id and actual.mission_id = day.mission_id and actual.operating_day_id = day.id), false),
    'actuals', coalesce((select jsonb_agg(
      jsonb_build_object(
        'id', actual.id,
        'mission_id', actual.mission_id,
        'operating_day_id', actual.operating_day_id,
        'package_revision_id', actual.mission_pack_revision_id,
        'aircraft_id', actual.aircraft_id,
        'mission_aircraft_assignment_id', actual.mission_aircraft_assignment_id,
        'declared_total_hours', actual.declared_total_hours::text,
        'total_flight_hours', actual.total_flight_hours::text,
        'flights_total_hours', actual.flights_total_hours::text,
        'total_source', actual.total_source,
        'reconciliation_status', actual.reconciliation_status,
        'row_version', actual.row_version,
        'signed_off_at', actual.signed_off_at,
        'signed_off_by_internal_user_id', actual.signed_off_by_internal_user_id,
        'flights', coalesce((select jsonb_agg(jsonb_build_object(
          'id', flight.id,
          'aircraft_day_actual_id', flight.aircraft_day_actual_id,
          'mission_id', flight.mission_id,
          'operating_day_id', flight.operating_day_id,
          'aircraft_id', flight.aircraft_id,
          'flight_index', flight.flight_index,
          'duration_hours', flight.duration_hours::text,
          'started_at', flight.started_at,
          'finished_at', flight.finished_at,
          'field_id', flight.field_id,
          'source_import_id', flight.source_import_id
        ) order by flight.flight_index)
        from public.mission_flight_actuals flight
        where flight.organisation_id = actual.organisation_id and flight.aircraft_day_actual_id = actual.id), '[]'::jsonb)
      ) order by actual.aircraft_id)
      from public.mission_aircraft_day_actuals actual
      where actual.organisation_id = day.organisation_id and actual.mission_id = day.mission_id and actual.operating_day_id = day.id), '[]'::jsonb)
  )
  from public.mission_operating_days day
  where day.organisation_id = p_organisation_id and day.mission_id = p_mission_id and day.id = p_operating_day_id
$$;

create function public.ftf_read_mission_aircraft_day_actuals(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_mission_id uuid,
  p_operating_day_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_day public.mission_operating_days%rowtype;
begin
  if not public.ftf_actor_has_active_beta_seat(p_organisation_id, p_actor_internal_user_id)
    or not public.ftf_actor_has_permission(p_organisation_id, p_actor_internal_user_id, 'mission.operational.read') then
    return jsonb_build_object('forbidden', true);
  end if;
  select * into v_day from public.mission_operating_days
  where organisation_id = p_organisation_id and mission_id = p_mission_id and id = p_operating_day_id;
  if not found then return jsonb_build_object('error', 'MISSION_OPERATING_DAY_NOT_FOUND'); end if;
  if not public.ftf_operational_location_allowed(p_organisation_id, p_actor_internal_user_id, v_day.operating_location_id) then
    return jsonb_build_object('location_forbidden', true);
  end if;
  return public.ftf_project_mission_aircraft_day_actuals(p_organisation_id, p_mission_id, p_operating_day_id);
end;
$$;

create function public.ftf_save_mission_aircraft_day_actuals(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_mission_id uuid,
  p_operating_day_id uuid,
  p_expected_version integer,
  p_total_aircraft_hours text,
  p_aircraft_totals jsonb,
  p_flights jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mission public.missions%rowtype;
  v_day public.mission_operating_days%rowtype;
  v_total jsonb;
  v_flight jsonb;
  v_aircraft_id uuid;
  v_assignment_id uuid;
  v_declared_text text;
  v_declared numeric(10,4);
  v_flights_total numeric(10,4);
  v_effective_total numeric(10,4);
  v_all_total numeric := 0;
  v_flight_count integer;
  v_index integer;
  v_actual public.mission_aircraft_day_actuals%rowtype;
  v_started_at timestamptz;
  v_finished_at timestamptz;
begin
  perform public.ftf_lock_mission_package_aggregate(p_organisation_id, p_mission_id);
  if not public.ftf_actor_has_active_beta_seat(p_organisation_id, p_actor_internal_user_id)
    or not public.ftf_actor_has_permission(p_organisation_id, p_actor_internal_user_id, 'mission.operational.write') then
    return jsonb_build_object('forbidden', true);
  end if;
  select * into v_mission from public.missions
  where organisation_id = p_organisation_id and id = p_mission_id and archived_at is null for update;
  if not found then return jsonb_build_object('error', 'MISSION_OPERATING_DAY_NOT_FOUND'); end if;
  if not public.ftf_operational_location_allowed(p_organisation_id, p_actor_internal_user_id, v_mission.operating_location_id) then
    return jsonb_build_object('location_forbidden', true);
  end if;
  select * into v_day from public.mission_operating_days
  where organisation_id = p_organisation_id and mission_id = p_mission_id and id = p_operating_day_id for update;
  if not found then return jsonb_build_object('error', 'MISSION_OPERATING_DAY_NOT_FOUND'); end if;
  if p_expected_version is null or p_expected_version < 1 or v_day.row_version <> p_expected_version then
    return jsonb_build_object('error', 'MISSION_OPERATING_DAY_VERSION_CONFLICT', 'current_version', v_day.row_version);
  end if;
  if v_day.state = 'SIGNED_OFF' then return jsonb_build_object('error', 'MISSION_OPERATING_DAY_SIGNED_OFF'); end if;
  if p_total_aircraft_hours is null or p_total_aircraft_hours !~ '^(0|[1-9][0-9]{0,5})\.[0-9]{4}$'
    or jsonb_typeof(p_aircraft_totals) <> 'array' or jsonb_array_length(p_aircraft_totals) not between 1 and 50
    or jsonb_typeof(p_flights) <> 'array' or jsonb_array_length(p_flights) > 500 then
    return jsonb_build_object('error', 'MISSION_AIRCRAFT_DAY_INPUT_INVALID');
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_aircraft_totals) total
    where jsonb_typeof(total) <> 'object'
      or (select count(*) from jsonb_object_keys(total)) <> 2
      or not (total ? 'aircraftId' and total ? 'totalFlightHours')
  ) or exists (
    select 1 from jsonb_array_elements(p_aircraft_totals) total
    group by lower(total->>'aircraftId') having count(*) > 1
  ) or exists (
    select 1 from public.mission_aircraft_day_actuals actual
    where actual.organisation_id = p_organisation_id and actual.mission_id = p_mission_id and actual.operating_day_id = p_operating_day_id
      and not exists (select 1 from jsonb_array_elements(p_aircraft_totals) total where lower(total->>'aircraftId') = lower(actual.aircraft_id::text))
  ) then return jsonb_build_object('error', 'MISSION_AIRCRAFT_DAY_INPUT_INVALID'); end if;
  if exists (
    select 1 from jsonb_array_elements(p_flights) flight
    where jsonb_typeof(flight) <> 'object'
      or (select count(*) from jsonb_object_keys(flight)) <> 6
      or not (flight ? 'aircraftId' and flight ? 'durationHours' and flight ? 'startedAt'
        and flight ? 'finishedAt' and flight ? 'fieldId' and flight ? 'sourceImportId')
      or coalesce(flight->>'durationHours', '') !~ '^(0|[1-9][0-9]{0,5})\.[0-9]{4}$'
      or not exists (select 1 from jsonb_array_elements(p_aircraft_totals) total where lower(total->>'aircraftId') = lower(flight->>'aircraftId'))
  ) then return jsonb_build_object('error', 'MISSION_AIRCRAFT_DAY_INPUT_INVALID'); end if;

  -- Validate the complete request and calculate fixed-scale totals before any
  -- row changes, so every rejection remains atomic.
  for v_total in select value from jsonb_array_elements(p_aircraft_totals) loop
    v_aircraft_id := (v_total->>'aircraftId')::uuid;
    if not exists (
      select 1 from public.aircraft aircraft
      where aircraft.organisation_id = p_organisation_id and aircraft.id = v_aircraft_id
        and aircraft.operating_location_id = v_day.operating_location_id and aircraft.archived_at is null
    ) then return jsonb_build_object('error', 'MISSION_DAY_AIRCRAFT_NOT_AUTHORISED'); end if;
    select assignment.id into v_assignment_id from public.mission_aircraft_assignments assignment
    where assignment.organisation_id = p_organisation_id and assignment.mission_id = p_mission_id
      and assignment.operating_location_id = v_day.operating_location_id and assignment.aircraft_id = v_aircraft_id
    order by (assignment.unassigned_at is null) desc, assignment.assigned_at desc limit 1;
    if v_assignment_id is null and not exists (
      select 1 from public.mission_operational_resource_revisions resource,
        lateral jsonb_array_elements_text(coalesce(resource.actual_resources->'aircraftIds', '[]'::jsonb)) actual_aircraft(id)
      where resource.organisation_id = p_organisation_id and resource.mission_id = p_mission_id
        and actual_aircraft.id = v_aircraft_id::text
        and resource.version_number = (select max(latest.version_number) from public.mission_operational_resource_revisions latest
          where latest.organisation_id = p_organisation_id and latest.mission_id = p_mission_id)
    ) then return jsonb_build_object('error', 'MISSION_DAY_AIRCRAFT_NOT_AUTHORISED'); end if;
    v_declared_text := v_total->>'totalFlightHours';
    if v_declared_text is not null and v_declared_text !~ '^(0|[1-9][0-9]{0,5})\.[0-9]{4}$' then
      return jsonb_build_object('error', 'MISSION_AIRCRAFT_DAY_INPUT_INVALID');
    end if;
    select coalesce(sum((flight->>'durationHours')::numeric), 0)::numeric(10,4), count(*)
      into v_flights_total, v_flight_count
    from jsonb_array_elements(p_flights) flight where (flight->>'aircraftId')::uuid = v_aircraft_id;
    if v_declared_text is null and v_flight_count = 0 then
      return jsonb_build_object('error', 'MISSION_AIRCRAFT_DAY_INPUT_INVALID');
    end if;
    v_declared := case when v_declared_text is null then null else v_declared_text::numeric(10,4) end;
    v_effective_total := coalesce(v_declared, v_flights_total);
    v_all_total := v_all_total + v_effective_total;
    if v_all_total > 999999.9999 then return jsonb_build_object('error', 'MISSION_AIRCRAFT_DAY_INPUT_INVALID'); end if;
  end loop;
  if v_all_total::numeric(10,4) <> p_total_aircraft_hours::numeric(10,4) then
    return jsonb_build_object('error', 'AIRCRAFT_DAY_TOTAL_MISMATCH');
  end if;

  for v_flight in select value from jsonb_array_elements(p_flights) loop
    v_aircraft_id := (v_flight->>'aircraftId')::uuid;
    if v_flight->>'fieldId' is not null and not exists (
      select 1 from public.mission_pack_fields field_scope
      where field_scope.organisation_id = p_organisation_id and field_scope.mission_id = p_mission_id
        and field_scope.pack_revision_id = v_day.mission_pack_revision_id and field_scope.field_id = (v_flight->>'fieldId')::uuid
    ) then return jsonb_build_object('error', 'MISSION_FLIGHT_FIELD_NOT_AUTHORISED'); end if;
    if v_flight->>'sourceImportId' is not null and not exists (
      select 1 from public.mission_operational_imports import
      join public.mission_operational_import_attributions attribution
        on attribution.organisation_id = import.organisation_id
       and attribution.mission_id = import.mission_id
       and attribution.operational_import_id = import.id
       and attribution.operating_day_id = v_day.id
       and attribution.aircraft_id = v_aircraft_id
      where import.organisation_id = p_organisation_id and import.mission_id = p_mission_id
        and import.operating_location_id = v_day.operating_location_id
        and import.id = (v_flight->>'sourceImportId')::uuid
    ) then return jsonb_build_object('error', 'MISSION_FLIGHT_IMPORT_NOT_FOUND'); end if;
    v_started_at := nullif(v_flight->>'startedAt', '')::timestamptz;
    v_finished_at := nullif(v_flight->>'finishedAt', '')::timestamptz;
    if v_finished_at is not null and (v_started_at is null or v_finished_at < v_started_at) then
      return jsonb_build_object('error', 'MISSION_AIRCRAFT_DAY_INPUT_INVALID');
    end if;
  end loop;

  for v_total in select value from jsonb_array_elements(p_aircraft_totals) loop
    v_aircraft_id := (v_total->>'aircraftId')::uuid;
    select assignment.id into v_assignment_id from public.mission_aircraft_assignments assignment
    where assignment.organisation_id = p_organisation_id and assignment.mission_id = p_mission_id
      and assignment.operating_location_id = v_day.operating_location_id and assignment.aircraft_id = v_aircraft_id
    order by (assignment.unassigned_at is null) desc, assignment.assigned_at desc limit 1;
    v_declared_text := v_total->>'totalFlightHours';
    select coalesce(sum((flight->>'durationHours')::numeric), 0)::numeric(10,4), count(*)
      into v_flights_total, v_flight_count
    from jsonb_array_elements(p_flights) flight where (flight->>'aircraftId')::uuid = v_aircraft_id;
    v_declared := case when v_declared_text is null then null else v_declared_text::numeric(10,4) end;
    v_effective_total := coalesce(v_declared, v_flights_total);
    insert into public.mission_aircraft_day_actuals (
      organisation_id, operating_location_id, mission_id, operating_day_id, mission_pack_revision_id,
      mission_aircraft_assignment_id, aircraft_id, declared_total_hours, total_flight_hours, flights_total_hours,
      total_source, reconciliation_status, recorded_by_internal_user_id, updated_by_internal_user_id
    ) values (
      p_organisation_id, v_day.operating_location_id, p_mission_id, v_day.id, v_day.mission_pack_revision_id,
      v_assignment_id, v_aircraft_id, v_declared, v_effective_total, v_flights_total,
      case when v_declared is null then 'DERIVED_FROM_FLIGHTS' else 'DECLARED' end,
      case when v_declared is null then 'FLIGHTS_ONLY'
        when v_flight_count = 0 then 'TOTAL_ONLY'
        when v_declared = v_flights_total then 'RECONCILED' else 'MISMATCH' end,
      p_actor_internal_user_id, p_actor_internal_user_id
    ) on conflict (organisation_id, operating_day_id, aircraft_id) do update set
      mission_aircraft_assignment_id = excluded.mission_aircraft_assignment_id,
      declared_total_hours = excluded.declared_total_hours,
      total_flight_hours = excluded.total_flight_hours,
      flights_total_hours = excluded.flights_total_hours,
      total_source = excluded.total_source,
      reconciliation_status = excluded.reconciliation_status,
      updated_by_internal_user_id = excluded.updated_by_internal_user_id
    returning * into v_actual;
    delete from public.mission_flight_actuals
    where organisation_id = p_organisation_id and aircraft_day_actual_id = v_actual.id;
    v_index := 0;
    for v_flight in select value from jsonb_array_elements(p_flights) flight
      where (value->>'aircraftId')::uuid = v_aircraft_id loop
      v_index := v_index + 1;
      insert into public.mission_flight_actuals (
        organisation_id, operating_location_id, mission_id, operating_day_id, aircraft_day_actual_id,
        aircraft_id, flight_index, duration_hours, started_at, finished_at, field_id, source_import_id,
        recorded_by_internal_user_id
      ) values (
        p_organisation_id, v_day.operating_location_id, p_mission_id, v_day.id, v_actual.id,
        v_aircraft_id, v_index, (v_flight->>'durationHours')::numeric(10,4),
        nullif(v_flight->>'startedAt', '')::timestamptz, nullif(v_flight->>'finishedAt', '')::timestamptz,
        nullif(v_flight->>'fieldId', '')::uuid, nullif(v_flight->>'sourceImportId', '')::uuid,
        p_actor_internal_user_id
      );
    end loop;
  end loop;
  update public.mission_operating_days set updated_by_internal_user_id = p_actor_internal_user_id
  where organisation_id = p_organisation_id and mission_id = p_mission_id and id = p_operating_day_id
  returning * into v_day;
  insert into public.audit_events (organisation_id, actor_internal_user_id, event_type, entity_type, entity_id, event_payload)
  values (p_organisation_id, p_actor_internal_user_id, 'mission.aircraft_day.actuals_saved', 'mission_operating_day', v_day.id,
    jsonb_build_object('mission_id', p_mission_id, 'package_revision_id', v_day.mission_pack_revision_id,
      'aircraft_count', jsonb_array_length(p_aircraft_totals), 'total_aircraft_hours', p_total_aircraft_hours, 'day_version', v_day.row_version));
  insert into public.transactional_outbox (organisation_id, topic, aggregate_type, aggregate_id, payload)
  values (p_organisation_id, 'operational.mission.aircraft_day_actuals_saved', 'mission', p_mission_id,
    jsonb_build_object('operating_day_id', v_day.id, 'package_revision_id', v_day.mission_pack_revision_id,
      'aircraft_count', jsonb_array_length(p_aircraft_totals), 'total_aircraft_hours', p_total_aircraft_hours, 'day_version', v_day.row_version));
  return public.ftf_project_mission_aircraft_day_actuals(p_organisation_id, p_mission_id, p_operating_day_id);
exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow then
  return jsonb_build_object('error', 'MISSION_AIRCRAFT_DAY_INPUT_INVALID');
end;
$$;

create function public.ftf_reconcile_mission_aircraft_day_actuals(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_mission_id uuid,
  p_operating_day_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_day public.mission_operating_days%rowtype;
begin
  perform public.ftf_lock_mission_package_aggregate(p_organisation_id, p_mission_id);
  if not public.ftf_actor_has_active_beta_seat(p_organisation_id, p_actor_internal_user_id)
    or not public.ftf_actor_has_permission(p_organisation_id, p_actor_internal_user_id, 'mission.operational.write') then
    return jsonb_build_object('forbidden', true);
  end if;
  select * into v_day from public.mission_operating_days
  where organisation_id = p_organisation_id and mission_id = p_mission_id and id = p_operating_day_id for update;
  if not found then return jsonb_build_object('error', 'MISSION_OPERATING_DAY_NOT_FOUND'); end if;
  if not public.ftf_operational_location_allowed(p_organisation_id, p_actor_internal_user_id, v_day.operating_location_id) then
    return jsonb_build_object('location_forbidden', true);
  end if;
  if not exists (select 1 from public.mission_aircraft_day_actuals where organisation_id = p_organisation_id and operating_day_id = p_operating_day_id) then
    return jsonb_build_object('error', 'MISSION_AIRCRAFT_DAY_REQUIRED');
  end if;
  if exists (select 1 from public.mission_aircraft_day_actuals where organisation_id = p_organisation_id and operating_day_id = p_operating_day_id and reconciliation_status = 'MISMATCH') then
    return jsonb_build_object('error', 'AIRCRAFT_FLIGHT_TOTAL_MISMATCH');
  end if;
  return public.ftf_project_mission_aircraft_day_actuals(p_organisation_id, p_mission_id, p_operating_day_id);
end;
$$;

create function public.ftf_project_signed_off_aircraft_day_actuals(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_mission_id uuid,
  p_operating_day_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_day public.mission_operating_days%rowtype;
  v_actual public.mission_aircraft_day_actuals%rowtype;
  v_meter public.asset_meter_definitions%rowtype;
  v_baseline numeric;
  v_result jsonb;
  v_projected integer := 0;
  v_idempotent integer := 0;
begin
  perform public.ftf_lock_mission_package_aggregate(p_organisation_id, p_mission_id);
  if not public.ftf_actor_has_active_beta_seat(p_organisation_id, p_actor_internal_user_id)
    or not public.ftf_actor_has_permission(p_organisation_id, p_actor_internal_user_id, 'mission.completion.complete')
    or not public.ftf_actor_has_permission(p_organisation_id, p_actor_internal_user_id, 'asset_meters.manage') then
    return jsonb_build_object('forbidden', true);
  end if;
  select * into v_day from public.mission_operating_days
  where organisation_id = p_organisation_id and mission_id = p_mission_id and id = p_operating_day_id for update;
  if not found then return jsonb_build_object('error', 'MISSION_OPERATING_DAY_NOT_FOUND'); end if;
  if not public.ftf_operational_location_allowed(p_organisation_id, p_actor_internal_user_id, v_day.operating_location_id) then
    return jsonb_build_object('location_forbidden', true);
  end if;
  if v_day.state <> 'SIGNED_OFF' then return jsonb_build_object('error', 'MISSION_OPERATING_DAY_NOT_SIGNED_OFF'); end if;
  if not exists (select 1 from public.mission_aircraft_day_actuals where organisation_id = p_organisation_id and operating_day_id = p_operating_day_id) then
    return jsonb_build_object('error', 'MISSION_AIRCRAFT_DAY_REQUIRED');
  end if;
  if exists (select 1 from public.mission_aircraft_day_actuals where organisation_id = p_organisation_id and operating_day_id = p_operating_day_id and reconciliation_status = 'MISMATCH') then
    return jsonb_build_object('error', 'AIRCRAFT_FLIGHT_TOTAL_MISMATCH');
  end if;
  if exists (
    select 1 from public.mission_aircraft_day_actuals actual
    left join public.maintainable_asset_registry registry on registry.organisation_id = actual.organisation_id
      and registry.aircraft_id = actual.aircraft_id and registry.tracking_state = 'ACTIVE'
    left join public.asset_meter_definitions meter on meter.organisation_id = registry.organisation_id
      and meter.maintainable_asset_id = registry.id and meter.meter_type = 'flight_hours' and meter.archived_at is null
    where actual.organisation_id = p_organisation_id and actual.operating_day_id = p_operating_day_id and meter.id is null
  ) then return jsonb_build_object('error', 'AIRCRAFT_FLIGHT_HOURS_METER_REQUIRED'); end if;
  perform set_config('app.mission_aircraft_projection', 'allowed', true);
  update public.mission_aircraft_day_actuals set signed_off_at = coalesce(signed_off_at, now()),
    signed_off_by_internal_user_id = coalesce(signed_off_by_internal_user_id, p_actor_internal_user_id),
    updated_by_internal_user_id = p_actor_internal_user_id
  where organisation_id = p_organisation_id and mission_id = p_mission_id and operating_day_id = p_operating_day_id
    and signed_off_at is null;
  for v_actual in select * from public.mission_aircraft_day_actuals
    where organisation_id = p_organisation_id and mission_id = p_mission_id and operating_day_id = p_operating_day_id
    order by aircraft_id loop
    select meter.* into v_meter from public.maintainable_asset_registry registry
    join public.asset_meter_definitions meter on meter.organisation_id = registry.organisation_id
      and meter.maintainable_asset_id = registry.id and meter.meter_type = 'flight_hours' and meter.archived_at is null
    where registry.organisation_id = p_organisation_id and registry.aircraft_id = v_actual.aircraft_id and registry.tracking_state = 'ACTIVE'
    order by meter.created_at, meter.id limit 1 for update of meter;
    select coalesce((select reading.value from public.asset_meter_readings reading
      where reading.organisation_id = p_organisation_id and reading.meter_definition_id = v_meter.id
        and not exists (select 1 from public.asset_meter_readings correction where correction.supersedes_reading_id = reading.id)
      order by reading.recorded_at desc, reading.created_at desc limit 1), aircraft.total_flight_hours)
    into v_baseline from public.aircraft aircraft
    where aircraft.organisation_id = p_organisation_id and aircraft.id = v_actual.aircraft_id;
    v_result := public.ftf_write_asset_maintenance_command(
      p_organisation_id, p_actor_internal_user_id, 'record_reading', null, null,
      jsonb_build_object(
        'meter_definition_id', v_meter.id,
        'recorded_at', v_day.actual_finished_at,
        'value', (v_baseline + v_actual.total_flight_hours)::numeric(20,6),
        'source', 'MISSION',
        'source_system', 'mission_aircraft_day_actual',
        'source_record_id', v_actual.id::text,
        'evidence', jsonb_build_object('missionId', p_mission_id, 'operatingDayId', p_operating_day_id,
          'aircraftDayActualId', v_actual.id, 'dailyFlightHours', v_actual.total_flight_hours::text)
      )
    );
    if coalesce((v_result->>'idempotent')::boolean, false) then v_idempotent := v_idempotent + 1;
    else v_projected := v_projected + 1; end if;
  end loop;
  if v_projected > 0 then
    insert into public.audit_events (organisation_id, actor_internal_user_id, event_type, entity_type, entity_id, event_payload)
    values (p_organisation_id, p_actor_internal_user_id, 'mission.aircraft_day.fleet_projected', 'mission_operating_day', p_operating_day_id,
      jsonb_build_object('mission_id', p_mission_id, 'projected_count', v_projected));
    insert into public.transactional_outbox (organisation_id, topic, aggregate_type, aggregate_id, payload)
    values (p_organisation_id, 'operational.mission.aircraft_day_fleet_projected', 'mission', p_mission_id,
      jsonb_build_object('operating_day_id', p_operating_day_id, 'projected_count', v_projected));
  end if;
  return jsonb_build_object('projected_count', v_projected, 'idempotent_count', v_idempotent);
end;
$$;

-- Extend the existing immutable Operational Closeout file command. The file
-- row and stored bytes remain singular; attribution is a separate bounded
-- append-only relation. Geometry statistics never become flight-time evidence.
create or replace function public.ftf_create_mission_operational_import(
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
  v_record public.mission_operational_imports%rowtype;
  v_attribution jsonb;
  v_attributions jsonb := coalesce(p_payload->'attributions', '[]'::jsonb);
  v_day_id uuid;
  v_aircraft_id uuid;
begin
  perform public.ftf_lock_mission_package_aggregate(p_organisation_id, p_mission_id);
  if not public.ftf_actor_has_active_beta_seat(p_organisation_id, p_actor_internal_user_id)
    or not public.ftf_actor_has_permission(p_organisation_id, p_actor_internal_user_id, 'mission.operational.write') then
    return jsonb_build_object('forbidden', true);
  end if;
  select * into v_mission from public.missions
  where organisation_id = p_organisation_id and id = p_mission_id and archived_at is null for update;
  if not found then return jsonb_build_object('not_found', true); end if;
  if not public.ftf_operational_location_allowed(p_organisation_id, p_actor_internal_user_id, v_mission.operating_location_id) then
    return jsonb_build_object('location_forbidden', true);
  end if;
  if jsonb_typeof(v_attributions) <> 'array' or jsonb_array_length(v_attributions) > 100 then
    return jsonb_build_object('attribution_invalid', true);
  end if;
  for v_attribution in select value from jsonb_array_elements(v_attributions) loop
    if jsonb_typeof(v_attribution) <> 'object'
      or (select count(*) from jsonb_object_keys(v_attribution)) <> 3
      or not (v_attribution ? 'operatingDayId' and v_attribution ? 'aircraftId' and v_attribution ? 'confidence')
      or coalesce(v_attribution->>'confidence', '') not in ('OPERATOR_CONFIRMED', 'SOURCE_METADATA')
      or (v_attribution->>'operatingDayId' is null and v_attribution->>'aircraftId' is null) then
      return jsonb_build_object('attribution_invalid', true);
    end if;
    v_day_id := nullif(v_attribution->>'operatingDayId', '')::uuid;
    v_aircraft_id := nullif(v_attribution->>'aircraftId', '')::uuid;
    if v_day_id is not null and not exists (select 1 from public.mission_operating_days day
      where day.organisation_id = p_organisation_id and day.mission_id = p_mission_id
        and day.operating_location_id = v_mission.operating_location_id and day.id = v_day_id) then
      return jsonb_build_object('attribution_invalid', true);
    end if;
    if v_aircraft_id is not null and not exists (
      select 1 from public.aircraft aircraft
      where aircraft.organisation_id = p_organisation_id and aircraft.operating_location_id = v_mission.operating_location_id
        and aircraft.id = v_aircraft_id and aircraft.archived_at is null
        and (exists (select 1 from public.mission_aircraft_assignments assignment
          where assignment.organisation_id = p_organisation_id and assignment.mission_id = p_mission_id and assignment.aircraft_id = aircraft.id)
          or exists (select 1 from public.mission_aircraft_day_actuals actual
            where actual.organisation_id = p_organisation_id and actual.mission_id = p_mission_id and actual.aircraft_id = aircraft.id))
    ) then return jsonb_build_object('attribution_invalid', true); end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(v_attributions) attribution
    group by attribution->>'operatingDayId', attribution->>'aircraftId' having count(*) > 1) then
    return jsonb_build_object('attribution_invalid', true);
  end if;
  select coalesce(max(version_number), 0) into v_current from public.mission_operational_imports
  where organisation_id = p_organisation_id and mission_id = p_mission_id;
  if v_current <> p_expected_version then return jsonb_build_object('conflict', true, 'current_version', v_current); end if;
  insert into public.mission_operational_imports (
    organisation_id, operating_location_id, mission_id, version_number, storage_provider, storage_bucket,
    storage_object_key, original_filename, source_format, content_type, file_size_bytes, sha256_checksum,
    evidence_type, parse_status, validation_result, derived_statistics, operational_geometry, source_metadata,
    imported_by_internal_user_id
  ) values (
    p_organisation_id, v_mission.operating_location_id, p_mission_id, v_current + 1,
    p_payload->>'storageProvider', p_payload->>'storageBucket', p_payload->>'storageObjectKey',
    p_payload->>'originalFilename', upper(p_payload->>'sourceFormat'), p_payload->>'contentType',
    (p_payload->>'fileSizeBytes')::bigint, p_payload->>'checksum', upper(p_payload->>'evidenceType'),
    upper(p_payload->>'parseStatus'), coalesce(p_payload->'validationResult', '{}'::jsonb),
    coalesce(p_payload->'derivedStatistics', '{}'::jsonb), p_payload->'operationalGeometry',
    coalesce(p_payload->'sourceMetadata', '{}'::jsonb), p_actor_internal_user_id
  ) returning * into v_record;
  for v_attribution in select value from jsonb_array_elements(v_attributions) loop
    insert into public.mission_operational_import_attributions (
      organisation_id, operating_location_id, mission_id, operational_import_id, operating_day_id,
      aircraft_id, attribution_confidence, attributed_by_internal_user_id
    ) values (
      p_organisation_id, v_mission.operating_location_id, p_mission_id, v_record.id,
      nullif(v_attribution->>'operatingDayId', '')::uuid, nullif(v_attribution->>'aircraftId', '')::uuid,
      v_attribution->>'confidence', p_actor_internal_user_id
    );
  end loop;
  insert into public.audit_events (organisation_id, actor_internal_user_id, event_type, entity_type, entity_id, event_payload)
  values (p_organisation_id, p_actor_internal_user_id, 'mission.operational_import_created', 'mission', p_mission_id,
    jsonb_build_object('import_id', v_record.id, 'version', v_record.version_number, 'checksum', v_record.sha256_checksum,
      'attribution_count', jsonb_array_length(v_attributions)));
  insert into public.transactional_outbox (organisation_id, topic, aggregate_type, aggregate_id, payload)
  values (p_organisation_id, 'operational.mission.file_imported', 'mission', p_mission_id,
    jsonb_build_object('import_id', v_record.id, 'version', v_record.version_number,
      'evidence_type', v_record.evidence_type, 'attribution_count', jsonb_array_length(v_attributions)));
  return jsonb_build_object('record', to_jsonb(v_record) || jsonb_build_object('attributions', coalesce((
    select jsonb_agg(jsonb_build_object('id', attribution.id, 'operating_day_id', attribution.operating_day_id,
      'aircraft_id', attribution.aircraft_id, 'confidence', attribution.attribution_confidence) order by attribution.attributed_at, attribution.id)
    from public.mission_operational_import_attributions attribution
    where attribution.organisation_id = p_organisation_id and attribution.operational_import_id = v_record.id
  ), '[]'::jsonb)));
exception when invalid_text_representation then return jsonb_build_object('attribution_invalid', true);
end;
$$;

create or replace function public.ftf_read_mission_operational_closeout(p_organisation_id uuid, p_mission_id uuid)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select case when mission.id is null then null else jsonb_build_object(
    'mission', to_jsonb(mission) - 'organisation_id',
    'authorisation', (select to_jsonb(authorisation) from public.mission_authorisation_revisions authorisation
      where authorisation.organisation_id = mission.organisation_id and authorisation.mission_id = mission.id order by authorisation.version_number desc limit 1),
    'availableResources', jsonb_build_object(
      'aircraft', coalesce((select jsonb_agg(jsonb_build_object('id', aircraft.id, 'label', aircraft.registration || ' · ' || aircraft.model) order by aircraft.registration)
        from public.aircraft aircraft where aircraft.organisation_id = mission.organisation_id and aircraft.operating_location_id = mission.operating_location_id and aircraft.archived_at is null), '[]'::jsonb),
      'equipmentKits', coalesce((select jsonb_agg(jsonb_build_object('id', kit.id, 'label', kit.name) order by kit.name)
        from public.equipment_kits kit where kit.organisation_id = mission.organisation_id and kit.operating_location_id = mission.operating_location_id and kit.archived_at is null), '[]'::jsonb),
      'personnel', coalesce((select jsonb_agg(jsonb_build_object('id', personnel.id, 'label', personnel.full_name) order by personnel.full_name)
        from public.personnel personnel join public.personnel_operating_locations location_scope on location_scope.organisation_id = personnel.organisation_id and location_scope.personnel_id = personnel.id
        where personnel.organisation_id = mission.organisation_id and location_scope.operating_location_id = mission.operating_location_id and personnel.archived_at is null), '[]'::jsonb)),
    'imports', coalesce((select jsonb_agg(to_jsonb(import) || jsonb_build_object('attributions', coalesce((
      select jsonb_agg(jsonb_build_object('id', attribution.id, 'operating_day_id', attribution.operating_day_id,
        'aircraft_id', attribution.aircraft_id, 'confidence', attribution.attribution_confidence) order by attribution.attributed_at, attribution.id)
      from public.mission_operational_import_attributions attribution
      where attribution.organisation_id = import.organisation_id and attribution.operational_import_id = import.id
    ), '[]'::jsonb)) order by import.version_number)
      from public.mission_operational_imports import where import.organisation_id = mission.organisation_id and import.mission_id = mission.id), '[]'::jsonb),
    'operatingDays', coalesce((select jsonb_agg(jsonb_build_object(
      'id', day.id, 'work_date', day.work_date::text, 'package_revision_id', day.mission_pack_revision_id,
      'state', day.state, 'row_version', day.row_version,
      'aircraft_actuals', public.ftf_project_mission_aircraft_day_actuals(day.organisation_id, day.mission_id, day.id)
    ) order by day.work_date, day.id) from public.mission_operating_days day
      where day.organisation_id = mission.organisation_id and day.mission_id = mission.id), '[]'::jsonb),
    'resources', (select to_jsonb(resource) from public.mission_operational_resource_revisions resource
      where resource.organisation_id = mission.organisation_id and resource.mission_id = mission.id order by resource.version_number desc limit 1),
    'chemicals', (select to_jsonb(chemical) from public.mission_operational_chemical_revisions chemical
      where chemical.organisation_id = mission.organisation_id and chemical.mission_id = mission.id order by chemical.version_number desc limit 1),
    'events', coalesce((select jsonb_agg(to_jsonb(event) order by event.batch_version, event.event_index)
      from public.mission_operational_events event where event.organisation_id = mission.organisation_id and event.mission_id = mission.id), '[]'::jsonb),
    'operationalRevision', (select to_jsonb(revision) from public.mission_operational_revisions revision
      where revision.organisation_id = mission.organisation_id and revision.mission_id = mission.id order by revision.version_number desc limit 1),
    'completion', (select to_jsonb(completion) from public.mission_completion_revisions completion
      where completion.organisation_id = mission.organisation_id and completion.mission_id = mission.id order by completion.version_number desc limit 1)
  ) end
  from public.missions mission
  where mission.organisation_id = p_organisation_id and mission.id = p_mission_id and mission.archived_at is null
$$;

revoke all on function public.ftf_guard_mission_aircraft_day_actual_mutation() from public, anon, authenticated, service_role;
revoke all on function public.ftf_guard_mission_flight_actual_mutation() from public, anon, authenticated, service_role;
revoke all on function public.ftf_guard_mission_aircraft_actuals_on_day_signoff() from public, anon, authenticated, service_role;
revoke all on function public.ftf_project_mission_aircraft_day_actuals(uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.ftf_read_mission_aircraft_day_actuals(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.ftf_save_mission_aircraft_day_actuals(uuid, uuid, uuid, uuid, integer, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.ftf_reconcile_mission_aircraft_day_actuals(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.ftf_project_signed_off_aircraft_day_actuals(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.ftf_read_mission_aircraft_day_actuals(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.ftf_save_mission_aircraft_day_actuals(uuid, uuid, uuid, uuid, integer, text, jsonb, jsonb) to service_role;
grant execute on function public.ftf_reconcile_mission_aircraft_day_actuals(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.ftf_project_signed_off_aircraft_day_actuals(uuid, uuid, uuid, uuid) to service_role;
