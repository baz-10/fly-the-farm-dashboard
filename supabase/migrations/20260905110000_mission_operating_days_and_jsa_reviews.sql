-- Additive Mission operating-day authority. This migration binds every day to
-- the existing current authorised Mission package and its existing JSA
-- revision. It creates no parallel package, JSA, closeout or sign-off stream.
-- No Production application is authorised by this migration file.

alter table public.mission_jsa_revisions
  add constraint mission_jsa_revisions_mission_identity
    unique (organisation_id, mission_id, id);

create table public.mission_operating_days (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  operating_location_id uuid not null,
  mission_id uuid not null,
  work_date date not null,
  timezone text not null check (length(btrim(timezone)) between 1 and 100),
  mission_pack_revision_id uuid not null,
  jsa_revision_id uuid not null,
  state text not null default 'DRAFT'
    check (state in ('DRAFT', 'READY', 'IN_PROGRESS', 'COMPLETED', 'SIGNED_OFF')),
  actual_started_at timestamptz,
  actual_finished_at timestamptz,
  notes text check (notes is null or length(notes) between 1 and 4000),
  row_version integer not null default 1 check (row_version > 0),
  created_by_internal_user_id uuid not null,
  updated_by_internal_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, id),
  unique (organisation_id, mission_id, id),
  unique (organisation_id, mission_id, work_date),
  foreign key (organisation_id, mission_id)
    references public.missions (organisation_id, id),
  foreign key (organisation_id, operating_location_id)
    references public.operating_locations (organisation_id, id),
  foreign key (organisation_id, mission_id, mission_pack_revision_id)
    references public.mission_pack_revisions (organisation_id, mission_id, id),
  foreign key (organisation_id, mission_id, jsa_revision_id)
    references public.mission_jsa_revisions (organisation_id, mission_id, id),
  foreign key (organisation_id, created_by_internal_user_id)
    references public.internal_users (organisation_id, id),
  foreign key (organisation_id, updated_by_internal_user_id)
    references public.internal_users (organisation_id, id),
  check (actual_finished_at is null or actual_started_at is not null),
  check (actual_finished_at is null or actual_finished_at >= actual_started_at),
  check ((state in ('DRAFT', 'READY') and actual_started_at is null and actual_finished_at is null)
    or (state = 'IN_PROGRESS' and actual_started_at is not null and actual_finished_at is null)
    or (state in ('COMPLETED', 'SIGNED_OFF') and actual_started_at is not null and actual_finished_at is not null))
);

create table public.mission_day_jsa_reviews (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  operating_location_id uuid not null,
  mission_id uuid not null,
  operating_day_id uuid not null,
  jsa_revision_id uuid not null,
  outcome text not null check (outcome in ('CONDITIONS_COVERED', 'CHANGE_DECLARED')),
  notes text check (notes is null or length(notes) between 1 and 4000),
  reviewed_by_internal_user_id uuid not null,
  reviewed_at timestamptz not null default now(),
  unique (organisation_id, id),
  unique (organisation_id, operating_day_id, jsa_revision_id),
  foreign key (organisation_id, mission_id, operating_day_id)
    references public.mission_operating_days (organisation_id, mission_id, id),
  foreign key (organisation_id, mission_id, jsa_revision_id)
    references public.mission_jsa_revisions (organisation_id, mission_id, id),
  foreign key (organisation_id, operating_location_id)
    references public.operating_locations (organisation_id, id),
  foreign key (organisation_id, reviewed_by_internal_user_id)
    references public.internal_users (organisation_id, id)
);

create table public.mission_day_field_activity (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  operating_location_id uuid not null,
  mission_id uuid not null,
  operating_day_id uuid not null,
  field_id uuid not null,
  hectares_attempted numeric(18,6) check (hectares_attempted is null or hectares_attempted >= 0),
  hectares_completed numeric(18,6) check (hectares_completed is null or hectares_completed >= 0),
  started_at timestamptz,
  finished_at timestamptz,
  status text not null check (status in ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'NOT_WORKED')),
  notes text check (notes is null or length(notes) between 1 and 4000),
  row_version integer not null default 1 check (row_version > 0),
  created_by_internal_user_id uuid not null,
  updated_by_internal_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, id),
  unique (organisation_id, operating_day_id, field_id),
  foreign key (organisation_id, mission_id, operating_day_id)
    references public.mission_operating_days (organisation_id, mission_id, id),
  foreign key (organisation_id, field_id)
    references public.fields (organisation_id, id),
  foreign key (organisation_id, operating_location_id)
    references public.operating_locations (organisation_id, id),
  foreign key (organisation_id, created_by_internal_user_id)
    references public.internal_users (organisation_id, id),
  foreign key (organisation_id, updated_by_internal_user_id)
    references public.internal_users (organisation_id, id),
  check (finished_at is null or started_at is not null),
  check (finished_at is null or finished_at >= started_at)
);

create index mission_operating_days_history_idx
  on public.mission_operating_days (organisation_id, mission_id, work_date, id);
create index mission_day_jsa_reviews_day_idx
  on public.mission_day_jsa_reviews (organisation_id, mission_id, operating_day_id);
create index mission_day_field_activity_day_idx
  on public.mission_day_field_activity (organisation_id, mission_id, operating_day_id, created_at, id);

alter table public.mission_operating_days enable row level security;
alter table public.mission_operating_days force row level security;
alter table public.mission_day_jsa_reviews enable row level security;
alter table public.mission_day_jsa_reviews force row level security;
alter table public.mission_day_field_activity enable row level security;
alter table public.mission_day_field_activity force row level security;

create policy mission_operating_days_tenant_read on public.mission_operating_days
  for select to authenticated
  using (public.current_user_has_organisation_access(organisation_id));
create policy mission_day_jsa_reviews_tenant_read on public.mission_day_jsa_reviews
  for select to authenticated
  using (public.current_user_has_organisation_access(organisation_id));
create policy mission_day_field_activity_tenant_read on public.mission_day_field_activity
  for select to authenticated
  using (public.current_user_has_organisation_access(organisation_id));

revoke all on table public.mission_operating_days from public, anon, authenticated, service_role;
revoke all on table public.mission_day_jsa_reviews from public, anon, authenticated, service_role;
revoke all on table public.mission_day_field_activity from public, anon, authenticated, service_role;

create function public.ftf_guard_mission_operating_day_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'MISSION_OPERATING_DAY_DELETE_FORBIDDEN';
  end if;
  if old.state = 'SIGNED_OFF' then
    raise exception using errcode = '55000', message = 'MISSION_OPERATING_DAY_SIGNED_OFF_IMMUTABLE';
  end if;
  if new.organisation_id <> old.organisation_id
    or new.operating_location_id <> old.operating_location_id
    or new.mission_id <> old.mission_id
    or new.work_date <> old.work_date
    or new.timezone <> old.timezone
    or new.mission_pack_revision_id <> old.mission_pack_revision_id
    or new.jsa_revision_id <> old.jsa_revision_id
    or new.created_by_internal_user_id <> old.created_by_internal_user_id
    or new.created_at <> old.created_at then
    raise exception using errcode = '55000', message = 'MISSION_OPERATING_DAY_AUTHORITY_IMMUTABLE';
  end if;
  if new.state <> old.state and not (
    (old.state = 'DRAFT' and new.state = 'READY')
    or (old.state = 'READY' and new.state = 'IN_PROGRESS')
    or (old.state = 'IN_PROGRESS' and new.state = 'COMPLETED')
    or (old.state = 'COMPLETED' and new.state = 'SIGNED_OFF')
  ) then
    raise exception using errcode = '55000', message = 'MISSION_OPERATING_DAY_STATE_TRANSITION_INVALID';
  end if;
  if new.state = 'SIGNED_OFF'
    and old.state <> 'SIGNED_OFF'
    and coalesce(current_setting('app.mission_operating_day_signoff', true), '') <> 'allowed' then
    raise exception using errcode = '55000', message = 'MISSION_OPERATING_DAY_SIGNOFF_COMMAND_REQUIRED';
  end if;
  return new;
end;
$$;

create function public.ftf_guard_mission_operating_day_child_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_day_id uuid;
  v_organisation_id uuid;
  v_state text;
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'MISSION_OPERATING_DAY_EVIDENCE_DELETE_FORBIDDEN';
  end if;
  v_day_id := new.operating_day_id;
  v_organisation_id := new.organisation_id;
  select state into v_state
  from public.mission_operating_days
  where organisation_id = v_organisation_id and id = v_day_id;
  if v_state = 'SIGNED_OFF' then
    raise exception using errcode = '55000', message = 'MISSION_OPERATING_DAY_SIGNED_OFF_IMMUTABLE';
  end if;
  return new;
end;
$$;

create trigger mission_operating_days_mutation_guard
  before update or delete on public.mission_operating_days
  for each row execute function public.ftf_guard_mission_operating_day_mutation();
create trigger mission_operating_days_set_update_metadata
  before update on public.mission_operating_days
  for each row execute function public.set_tenant_row_update_metadata();
create trigger mission_day_field_activity_mutation_guard
  before insert or update or delete on public.mission_day_field_activity
  for each row execute function public.ftf_guard_mission_operating_day_child_mutation();
create trigger mission_day_field_activity_set_update_metadata
  before update on public.mission_day_field_activity
  for each row execute function public.set_tenant_row_update_metadata();
create trigger mission_day_jsa_reviews_mutation_guard
  before insert on public.mission_day_jsa_reviews
  for each row execute function public.ftf_guard_mission_operating_day_child_mutation();
create trigger mission_day_jsa_reviews_immutable
  before update or delete on public.mission_day_jsa_reviews
  for each row execute function public.reject_append_only_mutation();

create function public.ftf_project_mission_operating_day(
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
    'id', day.id,
    'mission_id', day.mission_id,
    'work_date', day.work_date::text,
    'timezone', day.timezone,
    'package_revision_id', day.mission_pack_revision_id,
    'jsa_revision_id', day.jsa_revision_id,
    'state', day.state,
    'actual_started_at', day.actual_started_at,
    'actual_finished_at', day.actual_finished_at,
    'notes', day.notes,
    'row_version', day.row_version,
    'created_at', day.created_at,
    'updated_at', day.updated_at,
    'jsa_review', (
      select jsonb_build_object(
        'id', review.id,
        'operating_day_id', review.operating_day_id,
        'mission_id', review.mission_id,
        'jsa_revision_id', review.jsa_revision_id,
        'outcome', review.outcome,
        'notes', review.notes,
        'reviewed_by_internal_user_id', review.reviewed_by_internal_user_id,
        'reviewed_at', review.reviewed_at
      )
      from public.mission_day_jsa_reviews review
      where review.organisation_id = day.organisation_id
        and review.mission_id = day.mission_id
        and review.operating_day_id = day.id
        and review.jsa_revision_id = day.jsa_revision_id
      order by review.reviewed_at desc, review.id desc
      limit 1
    ),
    'field_activities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', activity.id,
        'operating_day_id', activity.operating_day_id,
        'mission_id', activity.mission_id,
        'field_id', activity.field_id,
        'hectares_attempted', activity.hectares_attempted::text,
        'hectares_completed', activity.hectares_completed::text,
        'started_at', activity.started_at,
        'finished_at', activity.finished_at,
        'status', activity.status,
        'notes', activity.notes,
        'row_version', activity.row_version,
        'created_at', activity.created_at,
        'updated_at', activity.updated_at
      ) order by activity.created_at, activity.id)
      from public.mission_day_field_activity activity
      where activity.organisation_id = day.organisation_id
        and activity.mission_id = day.mission_id
        and activity.operating_day_id = day.id
    ), '[]'::jsonb)
  )
  from public.mission_operating_days day
  where day.organisation_id = p_organisation_id
    and day.mission_id = p_mission_id
    and day.id = p_operating_day_id
$$;

create function public.ftf_create_mission_operating_day(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_mission_id uuid,
  p_work_date date,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mission public.missions%rowtype;
  v_location public.operating_locations%rowtype;
  v_pack public.mission_pack_revisions%rowtype;
  v_authority jsonb;
  v_latest_package_version integer;
  v_day public.mission_operating_days%rowtype;
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
  if p_work_date is null or (p_notes is not null and (length(p_notes) not between 1 and 4000 or p_notes <> btrim(p_notes))) then
    return jsonb_build_object('error', 'MISSION_OPERATING_DAY_INPUT_INVALID');
  end if;
  select * into v_location from public.operating_locations
  where organisation_id = p_organisation_id and id = v_mission.operating_location_id and archived_at is null;
  select * into v_pack from public.mission_pack_revisions
  where organisation_id = p_organisation_id and mission_id = p_mission_id
    and id = v_mission.current_authorised_pack_revision_id and jsa_revision_id is not null;
  v_authority := public.ftf_resolve_effective_mission_authorisation(p_organisation_id, p_mission_id);
  if v_pack.id is null or v_authority is null
    or v_authority->>'decision' <> 'AUTHORISED'
    or nullif(v_authority->>'effective_pack_revision_id', '')::uuid <> v_pack.id then
    return jsonb_build_object('error', 'MISSION_NOT_AUTHORISED');
  end if;
  select coalesce(max(version_number), 0) into v_latest_package_version
  from public.mission_pack_revisions
  where organisation_id = p_organisation_id and mission_id = p_mission_id and package_state is not null;
  if v_latest_package_version <> v_pack.version_number then
    return jsonb_build_object('error', 'MISSION_PACKAGE_STALE');
  end if;
  if not exists (
    select 1 from public.mission_pack_fields
    where organisation_id = p_organisation_id and mission_id = p_mission_id and pack_revision_id = v_pack.id
  ) then return jsonb_build_object('error', 'MISSION_SCOPE_EMPTY'); end if;
  if exists (
    select 1 from public.mission_operating_days
    where organisation_id = p_organisation_id and mission_id = p_mission_id and work_date = p_work_date
  ) then return jsonb_build_object('error', 'MISSION_OPERATING_DATE_CONFLICT'); end if;
  insert into public.mission_operating_days (
    organisation_id, operating_location_id, mission_id, work_date, timezone,
    mission_pack_revision_id, jsa_revision_id, notes,
    created_by_internal_user_id, updated_by_internal_user_id
  ) values (
    p_organisation_id, v_mission.operating_location_id, p_mission_id, p_work_date, v_location.timezone,
    v_pack.id, v_pack.jsa_revision_id, p_notes,
    p_actor_internal_user_id, p_actor_internal_user_id
  ) returning * into v_day;
  insert into public.audit_events (organisation_id, actor_internal_user_id, event_type, entity_type, entity_id, event_payload)
  values (p_organisation_id, p_actor_internal_user_id, 'mission.operating_day.created', 'mission_operating_day', v_day.id,
    jsonb_build_object('mission_id', p_mission_id, 'work_date', v_day.work_date, 'timezone', v_day.timezone, 'package_revision_id', v_pack.id, 'jsa_revision_id', v_pack.jsa_revision_id));
  insert into public.transactional_outbox (organisation_id, topic, aggregate_type, aggregate_id, payload)
  values (p_organisation_id, 'operational.mission.day_created', 'mission', p_mission_id,
    jsonb_build_object('operating_day_id', v_day.id, 'work_date', v_day.work_date, 'package_revision_id', v_pack.id, 'jsa_revision_id', v_pack.jsa_revision_id));
  return jsonb_build_object('day', public.ftf_project_mission_operating_day(p_organisation_id, p_mission_id, v_day.id));
exception when unique_violation then
  return jsonb_build_object('error', 'MISSION_OPERATING_DATE_CONFLICT');
end;
$$;

create function public.ftf_review_mission_day_jsa(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_mission_id uuid,
  p_operating_day_id uuid,
  p_expected_version integer,
  p_outcome text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mission public.missions%rowtype;
  v_day public.mission_operating_days%rowtype;
  v_pack public.mission_pack_revisions%rowtype;
  v_authority jsonb;
  v_latest_package_version integer;
  v_review public.mission_day_jsa_reviews%rowtype;
  v_outcome text;
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
  if v_day.state <> 'DRAFT' then return jsonb_build_object('error', 'JSA_DAY_REVIEW_CONFLICT'); end if;
  select * into v_pack from public.mission_pack_revisions
  where organisation_id = p_organisation_id and mission_id = p_mission_id
    and id = v_mission.current_authorised_pack_revision_id and jsa_revision_id is not null;
  v_authority := public.ftf_resolve_effective_mission_authorisation(p_organisation_id, p_mission_id);
  if v_pack.id is null or v_authority is null or v_authority->>'decision' <> 'AUTHORISED' then
    return jsonb_build_object('error', 'MISSION_NOT_AUTHORISED');
  end if;
  select coalesce(max(version_number), 0) into v_latest_package_version
  from public.mission_pack_revisions
  where organisation_id = p_organisation_id and mission_id = p_mission_id and package_state is not null;
  if v_day.mission_pack_revision_id <> v_pack.id or v_day.jsa_revision_id <> v_pack.jsa_revision_id
    or v_latest_package_version <> v_pack.version_number then
    return jsonb_build_object('error', 'MISSION_PACKAGE_STALE');
  end if;
  v_outcome := upper(coalesce(p_outcome, ''));
  if v_outcome not in ('CONDITIONS_COVERED', 'CHANGE_DECLARED')
    or (p_notes is not null and (length(p_notes) not between 1 and 4000 or p_notes <> btrim(p_notes))) then
    return jsonb_build_object('error', 'MISSION_DAY_JSA_REVIEW_INVALID');
  end if;
  insert into public.mission_day_jsa_reviews (
    organisation_id, operating_location_id, mission_id, operating_day_id,
    jsa_revision_id, outcome, notes, reviewed_by_internal_user_id
  ) values (
    p_organisation_id, v_day.operating_location_id, p_mission_id, v_day.id,
    v_day.jsa_revision_id, v_outcome, p_notes, p_actor_internal_user_id
  ) returning * into v_review;
  update public.mission_operating_days
  set state = case when v_outcome = 'CONDITIONS_COVERED' then 'READY' else state end,
      updated_by_internal_user_id = p_actor_internal_user_id
  where organisation_id = p_organisation_id and mission_id = p_mission_id and id = v_day.id
  returning * into v_day;
  insert into public.audit_events (organisation_id, actor_internal_user_id, event_type, entity_type, entity_id, event_payload)
  values (p_organisation_id, p_actor_internal_user_id, 'mission.operating_day.jsa_reviewed', 'mission_operating_day', v_day.id,
    jsonb_build_object('mission_id', p_mission_id, 'review_id', v_review.id, 'jsa_revision_id', v_review.jsa_revision_id, 'outcome', v_review.outcome, 'day_version', v_day.row_version));
  insert into public.transactional_outbox (organisation_id, topic, aggregate_type, aggregate_id, payload)
  values (p_organisation_id, 'operational.mission.day_jsa_reviewed', 'mission', p_mission_id,
    jsonb_build_object('operating_day_id', v_day.id, 'review_id', v_review.id, 'jsa_revision_id', v_review.jsa_revision_id, 'outcome', v_review.outcome, 'day_version', v_day.row_version));
  return jsonb_build_object('day', public.ftf_project_mission_operating_day(p_organisation_id, p_mission_id, v_day.id));
exception when unique_violation then
  return jsonb_build_object('error', 'JSA_DAY_REVIEW_CONFLICT');
end;
$$;

create function public.ftf_start_mission_operating_day(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_mission_id uuid,
  p_operating_day_id uuid,
  p_expected_version integer,
  p_started_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mission public.missions%rowtype;
  v_day public.mission_operating_days%rowtype;
  v_pack public.mission_pack_revisions%rowtype;
  v_authority jsonb;
  v_readiness jsonb;
  v_latest_package_version integer;
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
  select * into v_pack from public.mission_pack_revisions
  where organisation_id = p_organisation_id and mission_id = p_mission_id
    and id = v_mission.current_authorised_pack_revision_id and jsa_revision_id is not null;
  v_authority := public.ftf_resolve_effective_mission_authorisation(p_organisation_id, p_mission_id);
  if v_pack.id is null or v_authority is null or v_authority->>'decision' <> 'AUTHORISED' then
    return jsonb_build_object('error', 'MISSION_NOT_AUTHORISED');
  end if;
  select coalesce(max(version_number), 0) into v_latest_package_version
  from public.mission_pack_revisions
  where organisation_id = p_organisation_id and mission_id = p_mission_id and package_state is not null;
  if v_day.mission_pack_revision_id <> v_pack.id or v_day.jsa_revision_id <> v_pack.jsa_revision_id
    or v_latest_package_version <> v_pack.version_number then
    return jsonb_build_object('error', 'MISSION_PACKAGE_STALE');
  end if;
  if not exists (
    select 1 from public.mission_day_jsa_reviews review
    where review.organisation_id = p_organisation_id
      and review.mission_id = p_mission_id
      and review.operating_day_id = v_day.id
      and review.jsa_revision_id = v_day.jsa_revision_id
      and review.outcome = 'CONDITIONS_COVERED'
  ) then return jsonb_build_object('error', 'JSA_DAY_REVIEW_REQUIRED'); end if;
  if v_day.state <> 'READY' then return jsonb_build_object('error', 'MISSION_OPERATING_DAY_STATE_INVALID'); end if;
  if p_started_at is null or timezone(v_day.timezone, p_started_at)::date <> v_day.work_date then
    return jsonb_build_object('error', 'MISSION_OPERATING_TIME_INVALID');
  end if;
  v_readiness := public.ftf_evaluate_mission_readiness(p_organisation_id, p_mission_id, now());
  if not coalesce((v_readiness->>'ready')::boolean, false) then
    return jsonb_build_object('readiness_blocked', true, 'readiness', v_readiness);
  end if;
  update public.mission_operating_days
  set state = 'IN_PROGRESS', actual_started_at = p_started_at,
      updated_by_internal_user_id = p_actor_internal_user_id
  where organisation_id = p_organisation_id and mission_id = p_mission_id and id = v_day.id
  returning * into v_day;
  insert into public.audit_events (organisation_id, actor_internal_user_id, event_type, entity_type, entity_id, event_payload)
  values (p_organisation_id, p_actor_internal_user_id, 'mission.operating_day.started', 'mission_operating_day', v_day.id,
    jsonb_build_object('mission_id', p_mission_id, 'started_at', v_day.actual_started_at, 'package_revision_id', v_day.mission_pack_revision_id, 'jsa_revision_id', v_day.jsa_revision_id, 'day_version', v_day.row_version));
  insert into public.transactional_outbox (organisation_id, topic, aggregate_type, aggregate_id, payload)
  values (p_organisation_id, 'operational.mission.day_started', 'mission', p_mission_id,
    jsonb_build_object('operating_day_id', v_day.id, 'started_at', v_day.actual_started_at, 'package_revision_id', v_day.mission_pack_revision_id, 'jsa_revision_id', v_day.jsa_revision_id, 'day_version', v_day.row_version));
  return jsonb_build_object('day', public.ftf_project_mission_operating_day(p_organisation_id, p_mission_id, v_day.id));
end;
$$;

create function public.ftf_save_mission_day_field_activity(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_mission_id uuid,
  p_operating_day_id uuid,
  p_activity_id uuid,
  p_expected_version integer,
  p_field_id uuid,
  p_hectares_attempted text,
  p_hectares_completed text,
  p_started_at timestamptz,
  p_finished_at timestamptz,
  p_status text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mission public.missions%rowtype;
  v_day public.mission_operating_days%rowtype;
  v_activity public.mission_day_field_activity%rowtype;
  v_status text;
  v_current integer;
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
  if v_day.state = 'SIGNED_OFF' then return jsonb_build_object('error', 'MISSION_OPERATING_DAY_SIGNED_OFF'); end if;
  if not exists (
    select 1 from public.mission_pack_fields
    where organisation_id = p_organisation_id
      and mission_id = p_mission_id
      and pack_revision_id = v_day.mission_pack_revision_id
      and field_id = p_field_id
  ) then return jsonb_build_object('error', 'MISSION_DAY_FIELD_NOT_AUTHORISED'); end if;
  v_status := upper(coalesce(p_status, ''));
  if v_status not in ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'NOT_WORKED')
    or (p_hectares_attempted is not null and p_hectares_attempted !~ '^(0|[1-9][0-9]{0,11})\.[0-9]{6}$')
    or (p_hectares_completed is not null and p_hectares_completed !~ '^(0|[1-9][0-9]{0,11})\.[0-9]{6}$')
    or (p_finished_at is not null and (p_started_at is null or p_finished_at < p_started_at))
    or (p_notes is not null and (length(p_notes) not between 1 and 4000 or p_notes <> btrim(p_notes))) then
    return jsonb_build_object('error', 'MISSION_FIELD_ACTIVITY_INPUT_INVALID');
  end if;
  if p_activity_id is null then
    if p_expected_version is null or p_expected_version <> 0 then
      return jsonb_build_object('error', 'MISSION_FIELD_ACTIVITY_VERSION_CONFLICT', 'current_version', 0);
    end if;
    if exists (
      select 1 from public.mission_day_field_activity
      where organisation_id = p_organisation_id and operating_day_id = v_day.id and field_id = p_field_id
    ) then return jsonb_build_object('error', 'MISSION_FIELD_ACTIVITY_CONFLICT'); end if;
    insert into public.mission_day_field_activity (
      organisation_id, operating_location_id, mission_id, operating_day_id, field_id,
      hectares_attempted, hectares_completed, started_at, finished_at, status, notes,
      created_by_internal_user_id, updated_by_internal_user_id
    ) values (
      p_organisation_id, v_day.operating_location_id, p_mission_id, v_day.id, p_field_id,
      p_hectares_attempted::numeric(18,6), p_hectares_completed::numeric(18,6),
      p_started_at, p_finished_at, v_status, p_notes,
      p_actor_internal_user_id, p_actor_internal_user_id
    ) returning * into v_activity;
  else
    select row_version into v_current from public.mission_day_field_activity
    where organisation_id = p_organisation_id and mission_id = p_mission_id
      and operating_day_id = v_day.id and id = p_activity_id;
    if v_current is null then return jsonb_build_object('error', 'MISSION_FIELD_ACTIVITY_NOT_FOUND'); end if;
    if p_expected_version is null or p_expected_version < 1 or v_current <> p_expected_version then
      return jsonb_build_object('error', 'MISSION_FIELD_ACTIVITY_VERSION_CONFLICT', 'current_version', v_current);
    end if;
    update public.mission_day_field_activity
    set hectares_attempted = p_hectares_attempted::numeric(18,6),
        hectares_completed = p_hectares_completed::numeric(18,6),
        started_at = p_started_at,
        finished_at = p_finished_at,
        status = v_status,
        notes = p_notes,
        updated_by_internal_user_id = p_actor_internal_user_id
    where organisation_id = p_organisation_id and mission_id = p_mission_id
      and operating_day_id = v_day.id and id = p_activity_id and field_id = p_field_id
      and row_version = p_expected_version
    returning * into v_activity;
    if v_activity.id is null then return jsonb_build_object('error', 'MISSION_FIELD_ACTIVITY_NOT_FOUND'); end if;
  end if;
  update public.mission_operating_days
  set updated_by_internal_user_id = p_actor_internal_user_id
  where organisation_id = p_organisation_id and mission_id = p_mission_id and id = v_day.id
  returning * into v_day;
  insert into public.audit_events (organisation_id, actor_internal_user_id, event_type, entity_type, entity_id, event_payload)
  values (p_organisation_id, p_actor_internal_user_id, 'mission.operating_day.field_activity_saved', 'mission_operating_day', v_day.id,
    jsonb_build_object('mission_id', p_mission_id, 'activity_id', v_activity.id, 'field_id', v_activity.field_id, 'activity_version', v_activity.row_version, 'day_version', v_day.row_version));
  insert into public.transactional_outbox (organisation_id, topic, aggregate_type, aggregate_id, payload)
  values (p_organisation_id, 'operational.mission.day_field_activity_saved', 'mission', p_mission_id,
    jsonb_build_object('operating_day_id', v_day.id, 'activity_id', v_activity.id, 'field_id', v_activity.field_id, 'activity_version', v_activity.row_version, 'day_version', v_day.row_version));
  return jsonb_build_object('day', public.ftf_project_mission_operating_day(p_organisation_id, p_mission_id, v_day.id));
exception when unique_violation then
  return jsonb_build_object('error', 'MISSION_FIELD_ACTIVITY_CONFLICT');
end;
$$;

create function public.ftf_complete_mission_operating_day(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_mission_id uuid,
  p_operating_day_id uuid,
  p_expected_version integer,
  p_finished_at timestamptz,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mission public.missions%rowtype;
  v_day public.mission_operating_days%rowtype;
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
  if v_day.state <> 'IN_PROGRESS' then return jsonb_build_object('error', 'MISSION_OPERATING_DAY_STATE_INVALID'); end if;
  if p_finished_at is null or p_finished_at < v_day.actual_started_at
    or (p_notes is not null and (length(p_notes) not between 1 and 4000 or p_notes <> btrim(p_notes))) then
    return jsonb_build_object('error', 'MISSION_OPERATING_TIME_INVALID');
  end if;
  if not exists (
    select 1 from public.mission_day_field_activity
    where organisation_id = p_organisation_id and mission_id = p_mission_id and operating_day_id = v_day.id
  ) then return jsonb_build_object('error', 'MISSION_DAY_FIELD_ACTIVITY_REQUIRED'); end if;
  update public.mission_operating_days
  set state = 'COMPLETED', actual_finished_at = p_finished_at,
      notes = coalesce(p_notes, notes), updated_by_internal_user_id = p_actor_internal_user_id
  where organisation_id = p_organisation_id and mission_id = p_mission_id and id = v_day.id
  returning * into v_day;
  insert into public.audit_events (organisation_id, actor_internal_user_id, event_type, entity_type, entity_id, event_payload)
  values (p_organisation_id, p_actor_internal_user_id, 'mission.operating_day.completed', 'mission_operating_day', v_day.id,
    jsonb_build_object('mission_id', p_mission_id, 'finished_at', v_day.actual_finished_at, 'package_revision_id', v_day.mission_pack_revision_id, 'jsa_revision_id', v_day.jsa_revision_id, 'day_version', v_day.row_version));
  insert into public.transactional_outbox (organisation_id, topic, aggregate_type, aggregate_id, payload)
  values (p_organisation_id, 'operational.mission.day_completed', 'mission', p_mission_id,
    jsonb_build_object('operating_day_id', v_day.id, 'finished_at', v_day.actual_finished_at, 'package_revision_id', v_day.mission_pack_revision_id, 'jsa_revision_id', v_day.jsa_revision_id, 'day_version', v_day.row_version));
  return jsonb_build_object('day', public.ftf_project_mission_operating_day(p_organisation_id, p_mission_id, v_day.id));
end;
$$;

create function public.ftf_read_mission_operating_days(
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
    or not public.ftf_actor_has_permission(p_organisation_id, p_actor_internal_user_id, 'mission.operational.read')
    then return jsonb_build_object('forbidden', true); end if;
  select * into v_mission from public.missions
  where organisation_id = p_organisation_id and id = p_mission_id and archived_at is null;
  if not found then return jsonb_build_object('error', 'MISSION_OPERATING_DAY_NOT_FOUND'); end if;
  if not public.ftf_operational_location_allowed(p_organisation_id, p_actor_internal_user_id, v_mission.operating_location_id) then
    return jsonb_build_object('location_forbidden', true);
  end if;
  return jsonb_build_object(
    'mission_id', p_mission_id,
    'days', coalesce((
      select jsonb_agg(public.ftf_project_mission_operating_day(p_organisation_id, p_mission_id, bounded.id) order by bounded.work_date, bounded.id)
      from (
        select id, work_date from public.mission_operating_days
        where organisation_id = p_organisation_id and mission_id = p_mission_id
        order by work_date, id
        limit 366
      ) bounded
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.ftf_guard_mission_operating_day_mutation() from public, anon, authenticated, service_role;
revoke all on function public.ftf_guard_mission_operating_day_child_mutation() from public, anon, authenticated, service_role;
revoke all on function public.ftf_project_mission_operating_day(uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.ftf_create_mission_operating_day(uuid, uuid, uuid, date, text) from public, anon, authenticated;
revoke all on function public.ftf_review_mission_day_jsa(uuid, uuid, uuid, uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public.ftf_start_mission_operating_day(uuid, uuid, uuid, uuid, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.ftf_save_mission_day_field_activity(uuid, uuid, uuid, uuid, uuid, integer, uuid, text, text, timestamptz, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.ftf_complete_mission_operating_day(uuid, uuid, uuid, uuid, integer, timestamptz, text) from public, anon, authenticated;
revoke all on function public.ftf_read_mission_operating_days(uuid, uuid, uuid) from public, anon, authenticated;

grant execute on function public.ftf_create_mission_operating_day(uuid, uuid, uuid, date, text) to service_role;
grant execute on function public.ftf_review_mission_day_jsa(uuid, uuid, uuid, uuid, integer, text, text) to service_role;
grant execute on function public.ftf_start_mission_operating_day(uuid, uuid, uuid, uuid, integer, timestamptz) to service_role;
grant execute on function public.ftf_save_mission_day_field_activity(uuid, uuid, uuid, uuid, uuid, integer, uuid, text, text, timestamptz, timestamptz, text, text) to service_role;
grant execute on function public.ftf_complete_mission_operating_day(uuid, uuid, uuid, uuid, integer, timestamptz, text) to service_role;
grant execute on function public.ftf_read_mission_operating_days(uuid, uuid, uuid) to service_role;
