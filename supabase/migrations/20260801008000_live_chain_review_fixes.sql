-- Forward-only review fixes for boundary ownership/history, seat capacity,
-- active-parent reads, and active-organisation write locking.

create table public.operational_migration_issues (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  issue_code text not null,
  source_entity_type text not null,
  source_entity_id uuid not null,
  related_entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organisation_id, issue_code, source_entity_id, related_entity_id),
  foreign key (organisation_id) references public.organisations (id)
);
create index operational_migration_issues_reporting_idx
  on public.operational_migration_issues (organisation_id, issue_code, resolved_at);
alter table public.operational_migration_issues enable row level security;
alter table public.operational_migration_issues force row level security;
create trigger operational_migration_issues_reject_mutation
before update or delete on public.operational_migration_issues
for each row execute function public.reject_append_only_mutation();
revoke all on table public.operational_migration_issues from public, anon, authenticated;
grant select on table public.operational_migration_issues to service_role;

-- Preserve historical versions that 070 could not assign without guessing.
-- They stay in the repository but are excluded by the active-parent read RPC.
insert into public.operational_migration_issues (
  organisation_id, issue_code, source_entity_type, source_entity_id, details
)
select fbv.organisation_id, 'legacy_boundary_unassigned', 'field_boundary_version', fbv.id,
  jsonb_build_object(
    'property_id', fbv.property_id,
    'version_number', fbv.version_number,
    'policy', 'preserved_unassigned_excluded_from_operational_history'
  )
from public.field_boundary_versions fbv
where fbv.field_id is null;

-- Migration 070 deterministically assigned a shared current boundary to the
-- lowest field UUID. Duplicate that immutable source for every other field,
-- then point each field at its own preserved copy.
do $$
declare
  v_shared record;
  v_new_boundary_id uuid;
  v_version_number integer;
begin
  for v_shared in
    select fbv.*, f.id as target_field_id
    from public.field_boundary_versions fbv
    join public.fields f
      on f.organisation_id = fbv.organisation_id
     and f.property_id = fbv.property_id
     and f.field_boundary_version_id = fbv.id
    where fbv.field_id is not null and f.id <> fbv.field_id
    order by fbv.organisation_id, fbv.id, f.id
  loop
    if exists (
      select 1 from public.field_boundary_versions existing
      where existing.organisation_id = v_shared.organisation_id
        and existing.field_id = v_shared.target_field_id
        and existing.version_number = v_shared.version_number
    ) then
      select coalesce(max(existing.version_number), 0) + 1 into v_version_number
      from public.field_boundary_versions existing
      where existing.organisation_id = v_shared.organisation_id
        and existing.field_id = v_shared.target_field_id;
    else
      v_version_number := v_shared.version_number;
    end if;

    insert into public.field_boundary_versions (
      organisation_id, property_id, field_id, version_number,
      boundary_geojson, captured_at, archived_at,
      archived_by_internal_user_id, created_at, updated_at
    ) values (
      v_shared.organisation_id, v_shared.property_id, v_shared.target_field_id,
      v_version_number, v_shared.boundary_geojson, v_shared.captured_at,
      v_shared.archived_at, v_shared.archived_by_internal_user_id,
      v_shared.created_at, v_shared.updated_at
    ) returning id into v_new_boundary_id;

    update public.fields f
    set field_boundary_version_id = v_new_boundary_id
    where f.organisation_id = v_shared.organisation_id
      and f.id = v_shared.target_field_id
      and f.field_boundary_version_id = v_shared.id;

    insert into public.operational_migration_issues (
      organisation_id, issue_code, source_entity_type, source_entity_id,
      related_entity_id, details, resolved_at
    ) values (
      v_shared.organisation_id, 'legacy_shared_boundary_repaired',
      'field_boundary_version', v_shared.id, v_shared.target_field_id,
      jsonb_build_object(
        'duplicate_boundary_version_id', v_new_boundary_id,
        'source_version_number', v_shared.version_number,
        'assigned_version_number', v_version_number,
        'policy', 'deterministic_per_field_duplication'
      ), now()
    );
  end loop;
end;
$$;

-- The current pointer must reference a boundary owned by that exact field.
alter table public.field_boundary_versions
  add constraint field_boundary_versions_field_pointer_unique
  unique (organisation_id, property_id, field_id, id);

do $$
declare
  v_constraint_name text;
begin
  select conname into v_constraint_name
  from pg_constraint
  where conrelid = 'public.fields'::regclass
    and confrelid = 'public.field_boundary_versions'::regclass
    and contype = 'f';
  if v_constraint_name is not null then
    execute format('alter table public.fields drop constraint %I', v_constraint_name);
  end if;
end;
$$;

alter table public.fields
  add constraint fields_current_boundary_same_field_fk
  foreign key (organisation_id, property_id, id, field_boundary_version_id)
  references public.field_boundary_versions (organisation_id, property_id, field_id, id);

create or replace function public.ftf_actor_has_active_beta_seat(
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
      and (
        select count(*)
        from public.internal_user_seat_assignments ranked
        where ranked.organisation_id = sa.organisation_id
          and ranked.status = 'active' and ranked.archived_at is null
          and (
            ranked.assigned_at < sa.assigned_at
            or (ranked.assigned_at = sa.assigned_at and ranked.id <= sa.id)
          )
      ) <= allocation.allocated_seats
  );
$$;

create function public.ftf_lock_active_organisation(p_organisation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1 from public.organisations organisation
  where organisation.id = p_organisation_id
    and organisation.organisation_id = p_organisation_id
    and organisation.archived_at is null
  for update;
  if not found then
    raise exception 'active organisation required' using errcode = '42501';
  end if;
end;
$$;

create function public.ftf_read_field_boundary_versions(
  p_organisation_id uuid,
  p_entity_id uuid default null,
  p_field_id uuid default null,
  p_property_id uuid default null,
  p_offset integer default 0,
  p_limit integer default 25
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(rows.record order by rows.version_number desc), '[]'::jsonb)
  from (
    select to_jsonb(fbv) as record, fbv.version_number
    from public.field_boundary_versions fbv
    join public.fields f
      on f.organisation_id = fbv.organisation_id
     and f.property_id = fbv.property_id
     and f.id = fbv.field_id
    join public.properties p
      on p.organisation_id = f.organisation_id and p.id = f.property_id
    where fbv.organisation_id = p_organisation_id
      and fbv.archived_at is null
      and f.archived_at is null
      and p.archived_at is null
      and (p_entity_id is null or fbv.id = p_entity_id)
      and (p_field_id is null or fbv.field_id = p_field_id)
      and (p_property_id is null or fbv.property_id = p_property_id)
    order by fbv.version_number desc, fbv.id
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
  ) rows;
$$;

alter function public.ftf_write_operational_resource(uuid, uuid, text, text, uuid, integer, jsonb)
  rename to ftf_write_operational_resource_before_review_fixes;

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
  v_current_boundary_id uuid;
  v_data jsonb := coalesce(p_data, '{}'::jsonb);
begin
  perform pg_advisory_xact_lock(hashtext(p_organisation_id::text)::bigint);
  perform public.ftf_lock_active_organisation(p_organisation_id);
  if not public.ftf_actor_has_active_beta_seat(p_organisation_id, p_actor_internal_user_id) then
    raise exception 'active organisation actor seat required' using errcode = '42501';
  end if;

  if p_resource = 'fields' and p_operation <> 'archive' then
    if v_data ? 'field_boundary_version_id' then
      raise exception 'field boundary pointer is managed by the boundary command' using errcode = '22023';
    end if;
    if p_operation = 'update' then
      select field_boundary_version_id into v_current_boundary_id
      from public.fields
      where organisation_id = p_organisation_id and id = p_entity_id;
    end if;
    v_data := v_data || jsonb_build_object('field_boundary_version_id', v_current_boundary_id);
  end if;

  return public.ftf_write_operational_resource_before_review_fixes(
    p_organisation_id, p_actor_internal_user_id, p_resource, p_operation,
    p_entity_id, p_expected_version, v_data
  );
end;
$$;

alter function public.ftf_create_field_boundary_version(uuid, uuid, uuid, uuid, integer, jsonb, timestamptz)
  rename to ftf_create_field_boundary_version_before_review_fixes;

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
begin
  perform pg_advisory_xact_lock(hashtext(p_organisation_id::text)::bigint);
  perform public.ftf_lock_active_organisation(p_organisation_id);
  if not public.ftf_actor_has_active_beta_seat(p_organisation_id, p_actor_internal_user_id) then
    raise exception 'active organisation actor seat required' using errcode = '42501';
  end if;
  return public.ftf_create_field_boundary_version_before_review_fixes(
    p_organisation_id, p_actor_internal_user_id, p_field_id, p_property_id,
    p_expected_field_version, p_boundary_geojson, p_captured_at
  );
end;
$$;

alter function public.ftf_seed_internal_beta_access(uuid, uuid)
  rename to ftf_seed_internal_beta_access_before_review_fixes;

create function public.ftf_seed_internal_beta_access(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext(p_organisation_id::text)::bigint);
  perform public.ftf_lock_active_organisation(p_organisation_id);
  return public.ftf_seed_internal_beta_access_before_review_fixes(
    p_organisation_id, p_actor_internal_user_id
  );
end;
$$;

revoke all on function public.ftf_lock_active_organisation(uuid) from public, anon, authenticated, service_role;
revoke all on function public.ftf_actor_has_active_beta_seat(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.ftf_write_operational_resource_before_review_fixes(uuid, uuid, text, text, uuid, integer, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.ftf_create_field_boundary_version_before_review_fixes(uuid, uuid, uuid, uuid, integer, jsonb, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.ftf_seed_internal_beta_access_before_review_fixes(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.ftf_read_field_boundary_versions(uuid, uuid, uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.ftf_read_field_boundary_versions(uuid, uuid, uuid, uuid, integer, integer) to service_role;
revoke all on function public.ftf_write_operational_resource(uuid, uuid, text, text, uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.ftf_write_operational_resource(uuid, uuid, text, text, uuid, integer, jsonb) to service_role;
revoke all on function public.ftf_create_field_boundary_version(uuid, uuid, uuid, uuid, integer, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.ftf_create_field_boundary_version(uuid, uuid, uuid, uuid, integer, jsonb, timestamptz) to service_role;
revoke all on function public.ftf_seed_internal_beta_access(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ftf_seed_internal_beta_access(uuid, uuid) to service_role;
