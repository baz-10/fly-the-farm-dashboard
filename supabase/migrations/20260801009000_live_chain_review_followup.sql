-- Forward-only follow-up for active-organisation boundary reads and
-- append-only boundary migration issue resolution events.

create or replace function public.ftf_read_field_boundary_versions(
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
    join public.organisations organisation
      on organisation.id = fbv.organisation_id
     and organisation.organisation_id = fbv.organisation_id
     and organisation.archived_at is null
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

revoke all on function public.ftf_read_field_boundary_versions(uuid, uuid, uuid, uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.ftf_read_field_boundary_versions(uuid, uuid, uuid, uuid, integer, integer)
  to service_role;

-- `operational_migration_issues` remains the immutable observation ledger.
-- Resolutions are separate immutable events rather than updates to its legacy
-- insert-time `resolved_at` evidence.
alter table public.operational_migration_issues
  add constraint operational_migration_issues_org_id_unique
  unique (organisation_id, id);

create table public.boundary_migration_issue_resolutions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  issue_id uuid not null,
  resolved_by_internal_user_id uuid not null,
  resolution_details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organisation_id, id),
  unique (organisation_id, issue_id),
  check (jsonb_typeof(resolution_details) = 'object'),
  foreign key (organisation_id) references public.organisations (id),
  foreign key (organisation_id, issue_id)
    references public.operational_migration_issues (organisation_id, id),
  foreign key (organisation_id, resolved_by_internal_user_id)
    references public.internal_users (organisation_id, id)
);
create index boundary_migration_issue_resolutions_reporting_idx
  on public.boundary_migration_issue_resolutions (organisation_id, created_at);
alter table public.boundary_migration_issue_resolutions enable row level security;
alter table public.boundary_migration_issue_resolutions force row level security;
create trigger boundary_migration_issue_resolutions_reject_mutation
before update or delete on public.boundary_migration_issue_resolutions
for each row execute function public.reject_append_only_mutation();
revoke all on table public.boundary_migration_issue_resolutions
  from public, anon, authenticated, service_role;
grant select on table public.boundary_migration_issue_resolutions to service_role;

create function public.ftf_record_boundary_migration_issue_resolution(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_issue_id uuid,
  p_resolution_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record jsonb;
begin
  perform pg_advisory_xact_lock(hashtext(p_organisation_id::text)::bigint);
  perform public.ftf_lock_active_organisation(p_organisation_id);
  if not public.ftf_actor_has_active_beta_seat(p_organisation_id, p_actor_internal_user_id) then
    raise exception 'active organisation actor seat required' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_resolution_details, '{}'::jsonb)) <> 'object' then
    raise exception 'resolution details must be an object' using errcode = '22023';
  end if;
  perform 1
  from public.operational_migration_issues issue
  where issue.organisation_id = p_organisation_id
    and issue.id = p_issue_id
    and issue.source_entity_type = 'field_boundary_version'
  for share;
  if not found then
    return jsonb_build_object('not_found', true);
  end if;
  if exists (
    select 1 from public.boundary_migration_issue_resolutions resolution
    where resolution.organisation_id = p_organisation_id
      and resolution.issue_id = p_issue_id
  ) then
    return jsonb_build_object('conflict', true);
  end if;
  insert into public.boundary_migration_issue_resolutions (
    organisation_id, issue_id, resolved_by_internal_user_id, resolution_details
  ) values (
    p_organisation_id, p_issue_id, p_actor_internal_user_id,
    coalesce(p_resolution_details, '{}'::jsonb)
  ) returning to_jsonb(boundary_migration_issue_resolutions) into v_record;
  return jsonb_build_object('record', v_record);
end;
$$;

revoke all on function public.ftf_record_boundary_migration_issue_resolution(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.ftf_record_boundary_migration_issue_resolution(uuid, uuid, uuid, jsonb)
  to service_role;
