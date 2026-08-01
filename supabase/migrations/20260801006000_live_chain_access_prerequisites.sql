-- Forward-only live-chain access prerequisites: internal beta seats, explicit
-- membership/location scope, and trusted operating-location writes.

create table public.organisation_seat_allocations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  allocated_seats integer not null check (allocated_seats >= 0),
  allocation_source text not null,
  archived_at timestamptz,
  archived_by_internal_user_id uuid,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, id),
  unique (organisation_id),
  foreign key (organisation_id) references public.organisations (id),
  foreign key (organisation_id, archived_by_internal_user_id) references public.internal_users (organisation_id, id)
);

create table public.internal_user_seat_assignments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  organisation_seat_allocation_id uuid not null,
  internal_user_id uuid not null,
  membership_id uuid not null,
  status text not null check (status in ('active', 'inactive', 'revoked')),
  assignment_source text not null,
  assigned_at timestamptz not null default now(),
  revoked_at timestamptz,
  archived_at timestamptz,
  archived_by_internal_user_id uuid,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, id),
  unique (organisation_id, internal_user_id),
  foreign key (organisation_id, organisation_seat_allocation_id) references public.organisation_seat_allocations (organisation_id, id),
  foreign key (organisation_id, internal_user_id) references public.internal_users (organisation_id, id),
  foreign key (organisation_id, membership_id) references public.memberships (organisation_id, id),
  foreign key (organisation_id, archived_by_internal_user_id) references public.internal_users (organisation_id, id)
);

create table public.membership_operating_location_assignments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  membership_id uuid not null,
  operating_location_id uuid not null,
  is_active boolean not null default true,
  assignment_source text not null,
  archived_at timestamptz,
  archived_by_internal_user_id uuid,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, id),
  unique (organisation_id, membership_id, operating_location_id),
  foreign key (organisation_id, membership_id) references public.memberships (organisation_id, id),
  foreign key (organisation_id, operating_location_id) references public.operating_locations (organisation_id, id),
  foreign key (organisation_id, archived_by_internal_user_id) references public.internal_users (organisation_id, id)
);

create index organisation_seat_allocations_organisation_idx on public.organisation_seat_allocations (organisation_id);
create index organisation_seat_allocations_archived_by_idx on public.organisation_seat_allocations (organisation_id, archived_by_internal_user_id);
create index internal_user_seat_assignments_user_idx on public.internal_user_seat_assignments (organisation_id, internal_user_id);
create index internal_user_seat_assignments_membership_idx on public.internal_user_seat_assignments (organisation_id, membership_id);
create index internal_user_seat_assignments_allocation_idx on public.internal_user_seat_assignments (organisation_id, organisation_seat_allocation_id);
create index internal_user_seat_assignments_archived_by_idx on public.internal_user_seat_assignments (organisation_id, archived_by_internal_user_id);
create index membership_location_assignments_membership_idx on public.membership_operating_location_assignments (organisation_id, membership_id);
create index membership_location_assignments_location_idx on public.membership_operating_location_assignments (organisation_id, operating_location_id);
create index membership_location_assignments_archived_by_idx on public.membership_operating_location_assignments (organisation_id, archived_by_internal_user_id);

create trigger organisation_seat_allocations_set_update_metadata before update on public.organisation_seat_allocations for each row execute function public.set_tenant_row_update_metadata();
create trigger internal_user_seat_assignments_set_update_metadata before update on public.internal_user_seat_assignments for each row execute function public.set_tenant_row_update_metadata();
create trigger membership_operating_location_assignments_set_update_metadata before update on public.membership_operating_location_assignments for each row execute function public.set_tenant_row_update_metadata();

alter table public.organisation_seat_allocations enable row level security;
alter table public.organisation_seat_allocations force row level security;
alter table public.internal_user_seat_assignments enable row level security;
alter table public.internal_user_seat_assignments force row level security;
alter table public.membership_operating_location_assignments enable row level security;
alter table public.membership_operating_location_assignments force row level security;

revoke all on table public.organisation_seat_allocations from public, anon, authenticated;
revoke all on table public.internal_user_seat_assignments from public, anon, authenticated;
revoke all on table public.membership_operating_location_assignments from public, anon, authenticated;
grant select, insert, update, delete on table public.organisation_seat_allocations to service_role;
grant select, insert, update, delete on table public.internal_user_seat_assignments to service_role;
grant select, insert, update, delete on table public.membership_operating_location_assignments to service_role;

-- Existing active internal beta users receive explicit, traceable assignments.
-- No subscription or payment state is inferred or created.
insert into public.organisation_seat_allocations (organisation_id, allocated_seats, allocation_source)
select o.id, count(distinct iu.id)::integer, 'internal_beta_migration_20260801'
from public.organisations o
left join public.internal_users iu
  on iu.organisation_id = o.id
 and iu.is_active = true
 and iu.archived_at is null
 and exists (
   select 1 from public.memberships m
   where m.organisation_id = iu.organisation_id
     and m.internal_user_id = iu.id
     and m.is_active = true
     and m.archived_at is null
 )
where o.archived_at is null
group by o.id;

insert into public.internal_user_seat_assignments (
  organisation_id, organisation_seat_allocation_id, internal_user_id,
  membership_id, status, assignment_source
)
select active_members.organisation_id, osa.id, active_members.internal_user_id,
       active_members.membership_id, 'active', 'internal_beta_migration_20260801'
from (
  select distinct on (m.organisation_id, m.internal_user_id)
    m.organisation_id, m.internal_user_id, m.id as membership_id
  from public.memberships m
  join public.internal_users iu
    on iu.organisation_id = m.organisation_id
   and iu.id = m.internal_user_id
  where m.is_active = true and m.archived_at is null
    and iu.is_active = true and iu.archived_at is null
  order by m.organisation_id, m.internal_user_id, m.id
) active_members
join public.organisation_seat_allocations osa
  on osa.organisation_id = active_members.organisation_id;

insert into public.membership_operating_location_assignments (
  organisation_id, membership_id, operating_location_id, assignment_source
)
select m.organisation_id, m.id, ol.id, 'internal_beta_migration_20260801'
from public.memberships m
join public.internal_users iu
  on iu.organisation_id = m.organisation_id and iu.id = m.internal_user_id
join public.operating_locations ol
  on ol.organisation_id = m.organisation_id and ol.archived_at is null
where m.is_active = true and m.archived_at is null
  and iu.is_active = true and iu.archived_at is null;

insert into public.audit_events (
  organisation_id, event_type, entity_type, entity_id, event_payload
)
select osa.organisation_id, 'beta_access.migrated', 'organisation_seat_allocation', osa.id,
       jsonb_build_object('allocation_source', osa.allocation_source, 'allocated_seats', osa.allocated_seats)
from public.organisation_seat_allocations osa;

insert into public.transactional_outbox (
  organisation_id, topic, aggregate_type, aggregate_id, payload
)
select osa.organisation_id, 'operational.beta_access.migrated', 'organisation_seat_allocation', osa.id,
       jsonb_build_object('allocation_source', osa.allocation_source, 'allocated_seats', osa.allocated_seats)
from public.organisation_seat_allocations osa;

create function public.ftf_seed_internal_beta_access(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation_id uuid;
  v_required_seats integer;
  v_seat_count integer;
  v_location_count integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_organisation_id::text)::bigint);
  if not exists (
    select 1 from public.internal_users iu
    join public.memberships m on m.organisation_id = iu.organisation_id and m.internal_user_id = iu.id
    where iu.organisation_id = p_organisation_id and iu.id = p_actor_internal_user_id
      and iu.is_active = true and iu.archived_at is null
      and m.is_active = true and m.archived_at is null
  ) then
    raise exception 'active organisation actor required' using errcode = '42501';
  end if;

  select count(distinct iu.id)::integer into v_required_seats
  from public.internal_users iu
  where iu.organisation_id = p_organisation_id
    and iu.is_active = true and iu.archived_at is null
    and exists (
      select 1 from public.memberships m
      where m.organisation_id = iu.organisation_id and m.internal_user_id = iu.id
        and m.is_active = true and m.archived_at is null
    );

  insert into public.organisation_seat_allocations (organisation_id, allocated_seats, allocation_source)
  values (p_organisation_id, v_required_seats, 'internal_beta_controlled_seed')
  on conflict (organisation_id) do update
    set allocated_seats = greatest(public.organisation_seat_allocations.allocated_seats, excluded.allocated_seats)
  returning id into v_allocation_id;

  insert into public.internal_user_seat_assignments (
    organisation_id, organisation_seat_allocation_id, internal_user_id,
    membership_id, status, assignment_source
  )
  select active_members.organisation_id, v_allocation_id, active_members.internal_user_id,
         active_members.membership_id, 'active', 'internal_beta_controlled_seed'
  from (
    select distinct on (m.organisation_id, m.internal_user_id)
      m.organisation_id, m.internal_user_id, m.id as membership_id
    from public.memberships m
    join public.internal_users iu
      on iu.organisation_id = m.organisation_id and iu.id = m.internal_user_id
    where m.organisation_id = p_organisation_id
      and m.is_active = true and m.archived_at is null
      and iu.is_active = true and iu.archived_at is null
    order by m.organisation_id, m.internal_user_id, m.id
  ) active_members
  on conflict (organisation_id, internal_user_id) do nothing;

  insert into public.membership_operating_location_assignments (
    organisation_id, membership_id, operating_location_id, assignment_source
  )
  select m.organisation_id, m.id, ol.id, 'internal_beta_controlled_seed'
  from public.memberships m
  join public.internal_users iu
    on iu.organisation_id = m.organisation_id and iu.id = m.internal_user_id
  join public.operating_locations ol
    on ol.organisation_id = m.organisation_id and ol.archived_at is null
  where m.organisation_id = p_organisation_id
    and m.is_active = true and m.archived_at is null
    and iu.is_active = true and iu.archived_at is null
  on conflict (organisation_id, membership_id, operating_location_id) do nothing;

  select count(*)::integer into v_seat_count
  from public.internal_user_seat_assignments
  where organisation_id = p_organisation_id and status = 'active' and archived_at is null;
  select count(*)::integer into v_location_count
  from public.membership_operating_location_assignments
  where organisation_id = p_organisation_id and is_active = true and archived_at is null;

  insert into public.audit_events (organisation_id, actor_internal_user_id, event_type, entity_type, entity_id, event_payload)
  values (p_organisation_id, p_actor_internal_user_id, 'beta_access.seeded', 'organisation_seat_allocation', v_allocation_id,
    jsonb_build_object('seat_assignments', v_seat_count, 'location_assignments', v_location_count));
  insert into public.transactional_outbox (organisation_id, topic, aggregate_type, aggregate_id, payload)
  values (p_organisation_id, 'operational.beta_access.seeded', 'organisation_seat_allocation', v_allocation_id,
    jsonb_build_object('seat_assignments', v_seat_count, 'location_assignments', v_location_count));

  return jsonb_build_object(
    'allocation_id', v_allocation_id,
    'allocated_seats', v_required_seats,
    'seat_assignments', v_seat_count,
    'location_assignments', v_location_count
  );
end;
$$;

revoke all on function public.ftf_seed_internal_beta_access(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ftf_seed_internal_beta_access(uuid, uuid) to service_role;

-- Replace only the public trusted wrapper. Existing clients/properties/fields/
-- jobs/missions behavior remains in the previous private implementation.
create or replace function public.ftf_write_operational_resource(
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
  v_current_version integer;
  v_archived_at timestamptz;
  v_record jsonb;
begin
  -- One deterministic organisation lock is always acquired before row locks.
  perform pg_advisory_xact_lock(hashtext(p_organisation_id::text)::bigint);

  if not exists (
    select 1 from public.internal_users iu
    join public.memberships m on m.organisation_id = iu.organisation_id and m.internal_user_id = iu.id
    join public.internal_user_seat_assignments sa
      on sa.organisation_id = iu.organisation_id and sa.internal_user_id = iu.id
    join public.organisation_seat_allocations allocation
      on allocation.organisation_id = sa.organisation_id
     and allocation.id = sa.organisation_seat_allocation_id
    where iu.organisation_id = p_organisation_id and iu.id = p_actor_internal_user_id
      and iu.is_active = true and iu.archived_at is null
      and m.is_active = true and m.archived_at is null
      and sa.status = 'active' and sa.archived_at is null
      and allocation.allocated_seats > 0 and allocation.archived_at is null
  ) then
    raise exception 'active organisation actor seat required' using errcode = '42501';
  end if;

  if p_resource = 'missions' and p_operation <> 'archive' and not exists (
    select 1 from public.membership_operating_location_assignments mla
    join public.memberships m
      on m.organisation_id = mla.organisation_id and m.id = mla.membership_id
    join public.operating_locations ol
      on ol.organisation_id = mla.organisation_id and ol.id = mla.operating_location_id
    where mla.organisation_id = p_organisation_id
      and mla.operating_location_id = (p_data->>'operating_location_id')::uuid
      and mla.is_active = true and mla.archived_at is null
      and m.internal_user_id = p_actor_internal_user_id
      and m.is_active = true and m.archived_at is null
      and ol.archived_at is null
  ) then
    return jsonb_build_object('location_forbidden', true);
  end if;

  if p_resource <> 'operating_locations' then
    return public.ftf_write_operational_resource_unlocked(
      p_organisation_id, p_actor_internal_user_id, p_resource, p_operation,
      p_entity_id, p_expected_version, p_data
    );
  end if;

  if p_operation not in ('create', 'update', 'archive') then
    raise exception 'unsupported operating location write';
  end if;
  if p_operation <> 'create' then
    if p_entity_id is null or p_expected_version is null or p_expected_version < 1 then
      raise exception 'entity id and expected version are required';
    end if;
    select row_version, archived_at into v_current_version, v_archived_at
    from public.operating_locations
    where organisation_id = p_organisation_id and id = p_entity_id
    for update;
    if v_current_version is null or v_archived_at is not null then
      return jsonb_build_object('not_found', true);
    end if;
    if v_current_version <> p_expected_version then
      return jsonb_build_object('conflict', true, 'current_version', v_current_version);
    end if;
    if p_operation = 'archive' and exists (
      select 1 from public.missions
      where organisation_id = p_organisation_id
        and operating_location_id = p_entity_id and archived_at is null
    ) then
      return jsonb_build_object('archive_conflict', true);
    end if;
  end if;

  if p_operation = 'create' then
    insert into public.operating_locations (organisation_id, name, address, timezone)
    values (p_organisation_id, p_data->>'name', p_data->>'address', coalesce(nullif(p_data->>'timezone', ''), 'Australia/Brisbane'))
    returning to_jsonb(operating_locations) into v_record;
  elsif p_operation = 'update' then
    update public.operating_locations ol set
      name = p_data->>'name',
      address = p_data->>'address',
      timezone = coalesce(nullif(p_data->>'timezone', ''), 'Australia/Brisbane')
    where ol.organisation_id = p_organisation_id and ol.id = p_entity_id
      and ol.row_version = p_expected_version and ol.archived_at is null
    returning to_jsonb(ol) into v_record;
  else
    update public.membership_operating_location_assignments mla set
      is_active = false, archived_at = now(), archived_by_internal_user_id = p_actor_internal_user_id
    where mla.organisation_id = p_organisation_id
      and mla.operating_location_id = p_entity_id and mla.archived_at is null;
    update public.operating_locations ol set
      archived_at = now(), archived_by_internal_user_id = p_actor_internal_user_id
    where ol.organisation_id = p_organisation_id and ol.id = p_entity_id
      and ol.row_version = p_expected_version and ol.archived_at is null
    returning to_jsonb(ol) into v_record;
  end if;

  if v_record is null then
    select row_version, archived_at into v_current_version, v_archived_at
    from public.operating_locations
    where organisation_id = p_organisation_id and id = p_entity_id;
    if v_current_version is null or v_archived_at is not null then
      return jsonb_build_object('not_found', true);
    end if;
    return jsonb_build_object('conflict', true, 'current_version', v_current_version);
  end if;

  insert into public.audit_events (organisation_id, actor_internal_user_id, event_type, entity_type, entity_id, event_payload)
  values (p_organisation_id, p_actor_internal_user_id, 'operating_locations.' || p_operation, 'operating_locations', (v_record->>'id')::uuid, jsonb_build_object('record', v_record));
  insert into public.transactional_outbox (organisation_id, topic, aggregate_type, aggregate_id, payload)
  values (p_organisation_id, 'operational.operating_locations.' || p_operation, 'operating_locations', (v_record->>'id')::uuid, jsonb_build_object('record', v_record));

  return jsonb_build_object('record', v_record);
end;
$$;

revoke all on function public.ftf_write_operational_resource(uuid, uuid, text, text, uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.ftf_write_operational_resource(uuid, uuid, text, text, uuid, integer, jsonb) to service_role;
