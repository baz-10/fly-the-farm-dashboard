-- First-class Aircraft aggregate for Production Beta mission readiness.

create table public.aircraft (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  operating_location_id uuid not null,
  registration text not null check (registration = upper(btrim(registration)) and registration ~ '^[A-Z0-9-]+$'),
  manufacturer text not null check (length(btrim(manufacturer)) > 0),
  model text not null check (length(btrim(model)) > 0),
  serial_number text not null check (length(btrim(serial_number)) > 0),
  activation_date date,
  status text not null check (status in ('operational', 'maintenance', 'retired', 'inspection')),
  serviceability_state text not null check (serviceability_state in ('serviceable', 'unserviceable', 'inspection_required', 'maintenance_required')),
  mission_ready boolean not null default false,
  mtow numeric(10,3) not null check (mtow > 0),
  max_altitude numeric(10,3) not null check (max_altitude > 0),
  max_wind_speed numeric(10,3) not null check (max_wind_speed > 0),
  total_flight_hours numeric(12,2) not null default 0 check (total_flight_hours >= 0),
  hours_since_last_service numeric(12,2) not null default 0 check (hours_since_last_service >= 0),
  last_inspection date,
  next_inspection_due date,
  last_major_service date,
  next_major_service_due date,
  insurance_policy_number text not null,
  insurance_provider text not null,
  insurance_expiry_date date not null,
  insurance_coverage_amount numeric(16,2) not null check (insurance_coverage_amount >= 0),
  hull_value numeric(16,2) not null check (hull_value >= 0),
  min_operating_temp numeric(8,2) not null,
  max_operating_temp numeric(8,2) not null,
  max_payload_weight numeric(10,3) not null check (max_payload_weight > 0 and max_payload_weight <= mtow),
  battery_cycles integer check (battery_cycles is null or battery_cycles >= 0),
  max_flight_time numeric(10,2) not null check (max_flight_time > 0),
  service_range numeric(10,2) not null check (service_range > 0),
  minimum_crew_size integer not null check (minimum_crew_size > 0),
  documentation jsonb not null default '{"manuals":[],"certificates":[],"logbooks":[],"complianceChecks":{"casaCompliant":false,"lastCasaInspection":"","nextCasaInspectionDue":""}}'::jsonb,
  notes text not null default '',
  source_system text,
  source_record_id text,
  created_by_internal_user_id uuid not null,
  updated_by_internal_user_id uuid not null,
  archived_at timestamptz,
  archived_by_internal_user_id uuid,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, id),
  foreign key (organisation_id) references public.organisations (id),
  foreign key (organisation_id, operating_location_id) references public.operating_locations (organisation_id, id),
  foreign key (organisation_id, created_by_internal_user_id) references public.internal_users (organisation_id, id),
  foreign key (organisation_id, updated_by_internal_user_id) references public.internal_users (organisation_id, id),
  foreign key (organisation_id, archived_by_internal_user_id) references public.internal_users (organisation_id, id),
  check (min_operating_temp < max_operating_temp),
  check (not mission_ready or (status = 'operational' and serviceability_state = 'serviceable')),
  check (jsonb_typeof(documentation) = 'object'
    and jsonb_typeof(documentation->'manuals') = 'array'
    and jsonb_typeof(documentation->'certificates') = 'array'
    and jsonb_typeof(documentation->'logbooks') = 'array'
    and jsonb_typeof(documentation->'complianceChecks') = 'object')
);

create unique index aircraft_active_registration_unique
  on public.aircraft (organisation_id, registration) where archived_at is null;
create unique index aircraft_active_serial_unique
  on public.aircraft (organisation_id, serial_number) where archived_at is null;
create unique index aircraft_source_record_unique
  on public.aircraft (organisation_id, source_system, source_record_id)
  where source_system is not null and source_record_id is not null;
create index aircraft_location_readiness_idx
  on public.aircraft (organisation_id, operating_location_id, mission_ready, status)
  where archived_at is null;
create index aircraft_maintenance_due_idx
  on public.aircraft (organisation_id, next_inspection_due, next_major_service_due)
  where archived_at is null;
create index aircraft_insurance_expiry_idx
  on public.aircraft (organisation_id, insurance_expiry_date)
  where archived_at is null;

create trigger aircraft_set_update_metadata before update on public.aircraft
for each row execute function public.set_tenant_row_update_metadata();

alter table public.aircraft enable row level security;
alter table public.aircraft force row level security;
revoke all on table public.aircraft from public, anon, authenticated;
grant select, insert, update, delete on table public.aircraft to service_role;

alter function public.ftf_write_operational_resource(uuid, uuid, text, text, uuid, integer, jsonb)
  rename to ftf_write_operational_resource_before_aircraft;

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
declare
  v_record public.aircraft%rowtype;
  v_location_id uuid;
begin
  if p_resource <> 'aircraft' then
    return public.ftf_write_operational_resource_before_aircraft(
      p_organisation_id, p_actor_internal_user_id, p_resource, p_operation,
      p_entity_id, p_expected_version, p_data
    );
  end if;

  perform pg_advisory_xact_lock(hashtext(p_organisation_id::text)::bigint);
  perform public.ftf_lock_active_organisation(p_organisation_id);
  if not public.ftf_actor_has_active_beta_seat(p_organisation_id, p_actor_internal_user_id) then
    raise exception 'active organisation actor seat required' using errcode = '42501';
  end if;
  if p_operation not in ('create', 'update', 'archive') then
    raise exception 'unsupported aircraft operation' using errcode = '22023';
  end if;

  if p_operation in ('update', 'archive') then
    select * into v_record from public.aircraft
      where organisation_id = p_organisation_id and id = p_entity_id and archived_at is null
      for update;
    if not found then return jsonb_build_object('not_found', true); end if;
    if p_operation = 'archive' then v_location_id := v_record.operating_location_id; end if;
  end if;
  if p_operation <> 'archive' then
    begin v_location_id := (p_data->>'operating_location_id')::uuid;
    exception when others then return jsonb_build_object('relationship_conflict', true); end;
  else
    v_location_id := v_record.operating_location_id;
  end if;

  if not exists (
    select 1
    from public.operating_locations location
    join public.membership_operating_location_assignments assignment
      on assignment.organisation_id = location.organisation_id
     and assignment.operating_location_id = location.id
     and assignment.is_active = true and assignment.archived_at is null
    join public.memberships membership
      on membership.organisation_id = assignment.organisation_id
     and membership.id = assignment.membership_id
     and membership.internal_user_id = p_actor_internal_user_id
     and membership.is_active = true and membership.archived_at is null
    where location.organisation_id = p_organisation_id and location.id = v_location_id
      and location.archived_at is null
  ) then
    return jsonb_build_object('location_forbidden', true);
  end if;

  if p_operation = 'create' then
    insert into public.aircraft (
      organisation_id, operating_location_id, registration, manufacturer, model, serial_number,
      activation_date, status, serviceability_state, mission_ready, mtow, max_altitude, max_wind_speed,
      total_flight_hours, hours_since_last_service, last_inspection, next_inspection_due,
      last_major_service, next_major_service_due, insurance_policy_number, insurance_provider,
      insurance_expiry_date, insurance_coverage_amount, hull_value, min_operating_temp,
      max_operating_temp, max_payload_weight, battery_cycles, max_flight_time, service_range,
      minimum_crew_size, documentation, notes, source_system, source_record_id,
      created_by_internal_user_id, updated_by_internal_user_id
    ) values (
      p_organisation_id, v_location_id, upper(btrim(p_data->>'registration')), btrim(p_data->>'manufacturer'),
      btrim(p_data->>'model'), btrim(p_data->>'serial_number'), (p_data->>'activation_date')::date,
      p_data->>'status', p_data->>'serviceability_state', (p_data->>'mission_ready')::boolean,
      (p_data->>'mtow')::numeric, (p_data->>'max_altitude')::numeric, (p_data->>'max_wind_speed')::numeric,
      coalesce((p_data->>'total_flight_hours')::numeric, 0), coalesce((p_data->>'hours_since_last_service')::numeric, 0),
      (p_data->>'last_inspection')::date, (p_data->>'next_inspection_due')::date,
      (p_data->>'last_major_service')::date, (p_data->>'next_major_service_due')::date,
      btrim(p_data->>'insurance_policy_number'), btrim(p_data->>'insurance_provider'),
      (p_data->>'insurance_expiry_date')::date, (p_data->>'insurance_coverage_amount')::numeric,
      (p_data->>'hull_value')::numeric, (p_data->>'min_operating_temp')::numeric,
      (p_data->>'max_operating_temp')::numeric, (p_data->>'max_payload_weight')::numeric,
      (p_data->>'battery_cycles')::integer, (p_data->>'max_flight_time')::numeric,
      (p_data->>'service_range')::numeric, (p_data->>'minimum_crew_size')::integer,
      coalesce(p_data->'documentation', '{}'::jsonb), coalesce(p_data->>'notes', ''),
      nullif(p_data->>'source_system', ''), nullif(p_data->>'source_record_id', ''),
      p_actor_internal_user_id, p_actor_internal_user_id
    ) returning * into v_record;
  elsif p_operation = 'update' then
    if v_record.row_version <> p_expected_version then
      return jsonb_build_object('conflict', true, 'current_version', v_record.row_version);
    end if;
    update public.aircraft set
      operating_location_id = v_location_id, registration = upper(btrim(p_data->>'registration')),
      manufacturer = btrim(p_data->>'manufacturer'), model = btrim(p_data->>'model'),
      serial_number = btrim(p_data->>'serial_number'), activation_date = (p_data->>'activation_date')::date,
      status = p_data->>'status', serviceability_state = p_data->>'serviceability_state',
      mission_ready = (p_data->>'mission_ready')::boolean, mtow = (p_data->>'mtow')::numeric,
      max_altitude = (p_data->>'max_altitude')::numeric, max_wind_speed = (p_data->>'max_wind_speed')::numeric,
      total_flight_hours = (p_data->>'total_flight_hours')::numeric,
      hours_since_last_service = (p_data->>'hours_since_last_service')::numeric,
      last_inspection = (p_data->>'last_inspection')::date, next_inspection_due = (p_data->>'next_inspection_due')::date,
      last_major_service = (p_data->>'last_major_service')::date, next_major_service_due = (p_data->>'next_major_service_due')::date,
      insurance_policy_number = btrim(p_data->>'insurance_policy_number'), insurance_provider = btrim(p_data->>'insurance_provider'),
      insurance_expiry_date = (p_data->>'insurance_expiry_date')::date,
      insurance_coverage_amount = (p_data->>'insurance_coverage_amount')::numeric, hull_value = (p_data->>'hull_value')::numeric,
      min_operating_temp = (p_data->>'min_operating_temp')::numeric, max_operating_temp = (p_data->>'max_operating_temp')::numeric,
      max_payload_weight = (p_data->>'max_payload_weight')::numeric, battery_cycles = (p_data->>'battery_cycles')::integer,
      max_flight_time = (p_data->>'max_flight_time')::numeric, service_range = (p_data->>'service_range')::numeric,
      minimum_crew_size = (p_data->>'minimum_crew_size')::integer, documentation = p_data->'documentation',
      notes = coalesce(p_data->>'notes', ''), updated_by_internal_user_id = p_actor_internal_user_id
    where organisation_id = p_organisation_id and id = p_entity_id returning * into v_record;
  else
    if v_record.row_version <> p_expected_version then
      return jsonb_build_object('conflict', true, 'current_version', v_record.row_version);
    end if;
    update public.aircraft set archived_at = now(), archived_by_internal_user_id = p_actor_internal_user_id,
      updated_by_internal_user_id = p_actor_internal_user_id
    where organisation_id = p_organisation_id and id = p_entity_id returning * into v_record;
  end if;

  insert into public.audit_events (
    organisation_id, actor_internal_user_id, event_type, entity_type, entity_id, event_payload
  ) values (
    p_organisation_id, p_actor_internal_user_id, 'aircraft.' || p_operation, 'aircraft', v_record.id,
    jsonb_build_object('record', to_jsonb(v_record))
  );
  insert into public.transactional_outbox (
    organisation_id, topic, aggregate_type, aggregate_id, payload
  ) values (
    p_organisation_id, 'operational.aircraft.' || p_operation, 'aircraft', v_record.id,
    jsonb_build_object('record', to_jsonb(v_record))
  );
  return jsonb_build_object('record', to_jsonb(v_record));
end;
$$;

revoke all on function public.ftf_write_operational_resource_before_aircraft(uuid, uuid, text, text, uuid, integer, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.ftf_write_operational_resource(uuid, uuid, text, text, uuid, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.ftf_write_operational_resource(uuid, uuid, text, text, uuid, integer, jsonb)
  to service_role;
