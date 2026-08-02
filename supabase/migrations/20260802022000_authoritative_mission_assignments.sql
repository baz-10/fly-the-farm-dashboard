-- Authoritative, historical Aircraft and Equipment Kit assignments for Draft Missions.

create table public.mission_aircraft_assignments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  operating_location_id uuid not null,
  mission_id uuid not null,
  aircraft_id uuid not null,
  assigned_by_internal_user_id uuid not null,
  unassigned_by_internal_user_id uuid,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, id),
  foreign key (organisation_id, operating_location_id) references public.operating_locations (organisation_id, id),
  foreign key (organisation_id, mission_id) references public.missions (organisation_id, id),
  foreign key (organisation_id, aircraft_id) references public.aircraft (organisation_id, id),
  foreign key (organisation_id, assigned_by_internal_user_id) references public.internal_users (organisation_id, id),
  foreign key (organisation_id, unassigned_by_internal_user_id) references public.internal_users (organisation_id, id),
  check ((unassigned_at is null) = (unassigned_by_internal_user_id is null))
);

create table public.mission_equipment_kit_assignments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  operating_location_id uuid not null,
  mission_id uuid not null,
  equipment_kit_id uuid not null,
  assigned_by_internal_user_id uuid not null,
  unassigned_by_internal_user_id uuid,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, id),
  foreign key (organisation_id, operating_location_id) references public.operating_locations (organisation_id, id),
  foreign key (organisation_id, mission_id) references public.missions (organisation_id, id),
  foreign key (organisation_id, equipment_kit_id) references public.equipment_kits (organisation_id, id),
  foreign key (organisation_id, assigned_by_internal_user_id) references public.internal_users (organisation_id, id),
  foreign key (organisation_id, unassigned_by_internal_user_id) references public.internal_users (organisation_id, id),
  check ((unassigned_at is null) = (unassigned_by_internal_user_id is null))
);

create unique index mission_aircraft_current_unique on public.mission_aircraft_assignments
  (organisation_id, mission_id, aircraft_id) where unassigned_at is null;
create unique index mission_equipment_kit_current_unique on public.mission_equipment_kit_assignments
  (organisation_id, mission_id, equipment_kit_id) where unassigned_at is null;
create index mission_aircraft_history_idx on public.mission_aircraft_assignments
  (organisation_id, operating_location_id, mission_id, assigned_at desc);
create index mission_equipment_kit_history_idx on public.mission_equipment_kit_assignments
  (organisation_id, operating_location_id, mission_id, assigned_at desc);

create trigger mission_aircraft_assignments_set_update_metadata before update on public.mission_aircraft_assignments
for each row execute function public.set_tenant_row_update_metadata();
create trigger mission_equipment_kit_assignments_set_update_metadata before update on public.mission_equipment_kit_assignments
for each row execute function public.set_tenant_row_update_metadata();

alter table public.mission_aircraft_assignments enable row level security;
alter table public.mission_aircraft_assignments force row level security;
alter table public.mission_equipment_kit_assignments enable row level security;
alter table public.mission_equipment_kit_assignments force row level security;
create policy mission_aircraft_assignment_tenant_access on public.mission_aircraft_assignments for all to authenticated
  using (public.current_user_has_organisation_access(organisation_id))
  with check (public.current_user_has_organisation_access(organisation_id));
create policy mission_equipment_kit_assignment_tenant_access on public.mission_equipment_kit_assignments for all to authenticated
  using (public.current_user_has_organisation_access(organisation_id))
  with check (public.current_user_has_organisation_access(organisation_id));
revoke all on public.mission_aircraft_assignments, public.mission_equipment_kit_assignments from public, anon, authenticated;
grant select, insert, update on public.mission_aircraft_assignments, public.mission_equipment_kit_assignments to service_role;

alter function public.ftf_write_live_chain_mission_unlocked(uuid, uuid, text, uuid, integer, jsonb)
  rename to ftf_write_live_chain_mission_before_assignments;

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
  v_result jsonb;
  v_record jsonb;
  v_mission_id uuid;
  v_location_id uuid;
  v_aircraft_ids uuid[] := array(select jsonb_array_elements_text(coalesce(p_data->'aircraft_ids', '[]'::jsonb))::uuid);
  v_kit_ids uuid[] := array(select jsonb_array_elements_text(coalesce(p_data->'equipment_kit_ids', '[]'::jsonb))::uuid);
begin
  v_result := public.ftf_write_live_chain_mission_before_assignments(
    p_organisation_id, p_actor_internal_user_id, p_operation, p_entity_id, p_expected_version, p_data
  );
  if not (v_result ? 'record') or p_operation = 'archive' then return v_result; end if;
  v_record := v_result->'record';
  v_mission_id := (v_record->>'id')::uuid;
  v_location_id := (v_record->>'operating_location_id')::uuid;

  if not exists (
    select 1 from public.membership_operating_location_assignments mla
    join public.memberships m on m.organisation_id=mla.organisation_id and m.id=mla.membership_id
    where mla.organisation_id=p_organisation_id and mla.operating_location_id=v_location_id
      and mla.is_active and mla.archived_at is null and m.internal_user_id=p_actor_internal_user_id
      and m.is_active and m.archived_at is null
  ) then return jsonb_build_object('location_forbidden', true); end if;

  if exists (
    select 1 from unnest(v_aircraft_ids) requested(id)
    left join public.aircraft a on a.organisation_id=p_organisation_id and a.id=requested.id
      and a.operating_location_id=v_location_id and a.archived_at is null
      and a.status='operational' and a.mission_ready=true and a.serviceability_state='serviceable'
    where a.id is null
  ) then raise exception 'Mission Aircraft must be active, serviceable, mission ready and location scoped' using errcode='23514'; end if;

  if exists (
    select 1 from unnest(v_kit_ids) requested(id)
    left join public.equipment_kits k on k.organisation_id=p_organisation_id and k.id=requested.id
      and k.operating_location_id=v_location_id and k.archived_at is null and k.status='available'
    where k.id is null
  ) then raise exception 'Mission Equipment Kit must be active, available and location scoped' using errcode='23514'; end if;

  if exists (
    select 1 from unnest(v_kit_ids) requested(kit_id)
    where not exists (
      select 1 from public.equipment_kit_aircraft_compatibility compatibility
      where compatibility.organisation_id=p_organisation_id
        and compatibility.equipment_kit_id=requested.kit_id
        and compatibility.aircraft_id=any(v_aircraft_ids)
    )
  ) then raise exception 'Mission Equipment Kit is incompatible with selected Aircraft' using errcode='23514'; end if;

  update public.mission_aircraft_assignments set unassigned_at=now(), unassigned_by_internal_user_id=p_actor_internal_user_id
    where organisation_id=p_organisation_id and mission_id=v_mission_id and unassigned_at is null
      and not (aircraft_id=any(v_aircraft_ids));
  insert into public.mission_aircraft_assignments
    (organisation_id, operating_location_id, mission_id, aircraft_id, assigned_by_internal_user_id)
    select p_organisation_id, v_location_id, v_mission_id, requested.id, p_actor_internal_user_id
    from unnest(v_aircraft_ids) requested(id)
    where not exists (select 1 from public.mission_aircraft_assignments current_assignment
      where current_assignment.organisation_id=p_organisation_id and current_assignment.mission_id=v_mission_id
        and current_assignment.aircraft_id=requested.id and current_assignment.unassigned_at is null);

  update public.mission_equipment_kit_assignments set unassigned_at=now(), unassigned_by_internal_user_id=p_actor_internal_user_id
    where organisation_id=p_organisation_id and mission_id=v_mission_id and unassigned_at is null
      and not (equipment_kit_id=any(v_kit_ids));
  insert into public.mission_equipment_kit_assignments
    (organisation_id, operating_location_id, mission_id, equipment_kit_id, assigned_by_internal_user_id)
    select p_organisation_id, v_location_id, v_mission_id, requested.id, p_actor_internal_user_id
    from unnest(v_kit_ids) requested(id)
    where not exists (select 1 from public.mission_equipment_kit_assignments current_assignment
      where current_assignment.organisation_id=p_organisation_id and current_assignment.mission_id=v_mission_id
        and current_assignment.equipment_kit_id=requested.id and current_assignment.unassigned_at is null);

  v_record := v_record || jsonb_build_object('aircraft_ids', to_jsonb(v_aircraft_ids), 'equipment_kit_ids', to_jsonb(v_kit_ids));
  insert into public.audit_events (organisation_id, actor_internal_user_id, event_type, entity_type, entity_id, event_payload)
    values (p_organisation_id, p_actor_internal_user_id, 'missions.assignments_updated', 'missions', v_mission_id,
      jsonb_build_object('aircraft_ids', v_aircraft_ids, 'equipment_kit_ids', v_kit_ids));
  insert into public.transactional_outbox (organisation_id, topic, aggregate_type, aggregate_id, payload)
    values (p_organisation_id, 'operational.missions.assignments_updated', 'missions', v_mission_id,
      jsonb_build_object('aircraft_ids', v_aircraft_ids, 'equipment_kit_ids', v_kit_ids));
  return jsonb_build_object('record', v_record);
end;
$$;

revoke all on function public.ftf_write_live_chain_mission_before_assignments(uuid, uuid, text, uuid, integer, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.ftf_write_live_chain_mission_unlocked(uuid, uuid, text, uuid, integer, jsonb) from public, anon, authenticated, service_role;
