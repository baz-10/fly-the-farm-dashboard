-- Additive daily chemical and weather evidence under the existing Mission,
-- authorised package, operating-day, chemical-plan and Weather authorities.
-- Proposed plan values are projected, never copied into actual tables until an
-- operator explicitly confirms them. No Production application is authorised.

alter table public.mission_chemical_plan_revisions
  add constraint mission_chemical_plan_revisions_mission_identity
    unique (organisation_id, mission_id, id);

create table public.mission_day_chemical_revisions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  operating_location_id uuid not null,
  mission_id uuid not null,
  operating_day_id uuid not null,
  mission_pack_revision_id uuid not null,
  planned_chemical_revision_id uuid not null,
  revision_number integer not null check (revision_number > 0),
  confirmation_state text not null default 'CONFIRMED' check (confirmation_state = 'CONFIRMED'),
  changed_from_plan boolean not null,
  material_variance boolean not null,
  operation_started_at_confirmation timestamptz,
  notes text check (notes is null or length(notes) between 1 and 4000),
  confirmed_by_internal_user_id uuid not null,
  confirmed_at timestamptz not null default now(),
  unique (organisation_id, id),
  unique (organisation_id, mission_id, operating_day_id, revision_number),
  foreign key (organisation_id, mission_id, operating_day_id)
    references public.mission_operating_days (organisation_id, mission_id, id),
  foreign key (organisation_id, mission_id, mission_pack_revision_id)
    references public.mission_pack_revisions (organisation_id, mission_id, id),
  foreign key (organisation_id, mission_id, planned_chemical_revision_id)
    references public.mission_chemical_plan_revisions (organisation_id, mission_id, id),
  foreign key (organisation_id, operating_location_id)
    references public.operating_locations (organisation_id, id),
  foreign key (organisation_id, confirmed_by_internal_user_id)
    references public.internal_users (organisation_id, id)
);

create table public.mission_day_chemical_lines (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  operating_location_id uuid not null,
  mission_id uuid not null,
  operating_day_id uuid not null,
  revision_id uuid not null,
  line_number integer not null check (line_number > 0),
  field_id uuid not null,
  planned_line_id uuid,
  platform_product_id uuid,
  platform_product_version_id uuid,
  register_entry_id uuid,
  product_name text not null check (length(btrim(product_name)) between 1 and 500),
  normalised_product_name text not null check (length(normalised_product_name) > 0),
  manufacturer text,
  apvma_number text,
  active_ingredient text,
  formulation text,
  rate numeric(18,6) not null check (rate > 0),
  rate_unit text not null check (rate_unit in ('L_HA', 'ML_HA', 'KG_HA', 'G_HA')),
  applied_quantity numeric(18,6) not null check (applied_quantity > 0),
  quantity_unit text not null check (quantity_unit in ('L', 'ML', 'KG', 'G')),
  batch_lot text check (batch_lot is null or length(batch_lot) between 1 and 200),
  aircraft_id uuid,
  product_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organisation_id, id),
  unique (organisation_id, revision_id, line_number),
  foreign key (organisation_id, revision_id)
    references public.mission_day_chemical_revisions (organisation_id, id),
  foreign key (organisation_id, mission_id, operating_day_id)
    references public.mission_operating_days (organisation_id, mission_id, id),
  foreign key (organisation_id, field_id) references public.fields (organisation_id, id),
  foreign key (organisation_id, planned_line_id) references public.mission_chemical_plan_lines (organisation_id, id),
  foreign key (platform_product_version_id, platform_product_id)
    references public.platform_chemical_product_versions (id, product_id),
  foreign key (organisation_id, register_entry_id)
    references public.organisation_chemical_register (organisation_id, id),
  foreign key (organisation_id, aircraft_id) references public.aircraft (organisation_id, id),
  foreign key (organisation_id, operating_location_id)
    references public.operating_locations (organisation_id, id),
  check ((platform_product_id is null) = (platform_product_version_id is null)),
  check (planned_line_id is not null or platform_product_version_id is not null),
  check (quantity_unit = case rate_unit when 'L_HA' then 'L' when 'ML_HA' then 'ML' when 'KG_HA' then 'KG' else 'G' end)
);

create table public.mission_day_weather_reports (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  operating_location_id uuid not null,
  mission_id uuid not null,
  operating_day_id uuid not null,
  mission_pack_revision_id uuid not null,
  coverage text not null check (coverage in ('ACTUAL_INTERVAL', 'FULL_DAY')),
  interval_start_at timestamptz not null,
  interval_end_at timestamptz not null,
  timezone text not null check (length(btrim(timezone)) between 1 and 100),
  source text not null check (source in ('OPEN_METEO', 'MANUAL')),
  source_weather_observation_id uuid not null,
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  provider_identifier text,
  provider_retrieved_at timestamptz,
  hourly_observations jsonb not null,
  inversion_inputs jsonb not null,
  inversion_results jsonb not null,
  coverage_gaps jsonb not null,
  source_metadata jsonb not null,
  manual_reason text,
  source_digest text not null check (source_digest ~ '^[a-f0-9]{64}$'),
  recorded_by_internal_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (organisation_id, id),
  unique (organisation_id, mission_id, operating_day_id),
  foreign key (organisation_id, mission_id, operating_day_id)
    references public.mission_operating_days (organisation_id, mission_id, id),
  foreign key (organisation_id, mission_id, mission_pack_revision_id)
    references public.mission_pack_revisions (organisation_id, mission_id, id),
  foreign key (organisation_id, source_weather_observation_id)
    references public.mission_weather_observations (organisation_id, id),
  foreign key (organisation_id, operating_location_id)
    references public.operating_locations (organisation_id, id),
  foreign key (organisation_id, recorded_by_internal_user_id)
    references public.internal_users (organisation_id, id),
  check (interval_end_at > interval_start_at),
  check (jsonb_typeof(hourly_observations) = 'array' and jsonb_array_length(hourly_observations) between 1 and 1000),
  check (jsonb_typeof(inversion_inputs) = 'object'),
  check (jsonb_typeof(inversion_results) = 'object'),
  check (jsonb_typeof(coverage_gaps) = 'array' and jsonb_array_length(coverage_gaps) <= 1000),
  check (jsonb_typeof(source_metadata) = 'object'),
  check ((source = 'OPEN_METEO' and provider_identifier is not null and provider_retrieved_at is not null and manual_reason is null)
    or (source = 'MANUAL' and provider_identifier is null and provider_retrieved_at is null and manual_reason is not null and length(manual_reason) between 1 and 4000))
);

create index mission_day_chemical_history_idx
  on public.mission_day_chemical_revisions (organisation_id, mission_id, operating_day_id, revision_number desc);
create index mission_day_chemical_lines_field_idx
  on public.mission_day_chemical_lines (organisation_id, mission_id, operating_day_id, field_id, line_number);
create index mission_day_weather_history_idx
  on public.mission_day_weather_reports (organisation_id, mission_id, operating_day_id, created_at);

alter table public.mission_day_chemical_revisions enable row level security;
alter table public.mission_day_chemical_revisions force row level security;
alter table public.mission_day_chemical_lines enable row level security;
alter table public.mission_day_chemical_lines force row level security;
alter table public.mission_day_weather_reports enable row level security;
alter table public.mission_day_weather_reports force row level security;
create policy mission_day_chemical_revisions_tenant_read on public.mission_day_chemical_revisions
  for select to authenticated using (public.current_user_has_organisation_access(organisation_id));
create policy mission_day_chemical_lines_tenant_read on public.mission_day_chemical_lines
  for select to authenticated using (public.current_user_has_organisation_access(organisation_id));
create policy mission_day_weather_reports_tenant_read on public.mission_day_weather_reports
  for select to authenticated using (public.current_user_has_organisation_access(organisation_id));
revoke all on table public.mission_day_chemical_revisions from public, anon, authenticated, service_role;
revoke all on table public.mission_day_chemical_lines from public, anon, authenticated, service_role;
revoke all on table public.mission_day_weather_reports from public, anon, authenticated, service_role;

create trigger mission_day_chemical_revisions_immutable before update or delete on public.mission_day_chemical_revisions
  for each row execute function public.reject_append_only_mutation();
create trigger mission_day_chemical_lines_immutable before update or delete on public.mission_day_chemical_lines
  for each row execute function public.reject_append_only_mutation();
create trigger mission_day_weather_reports_immutable before update or delete on public.mission_day_weather_reports
  for each row execute function public.reject_append_only_mutation();

create function public.ftf_mission_day_planned_chemical_revision_id(
  p_organisation_id uuid, p_mission_id uuid, p_operating_day_id uuid
)
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    nullif(pack.source_manifest#>>'{chemicals,id}', '')::uuid,
    nullif(pack.pack_snapshot#>>'{evidence,planning,chemicals,id}', '')::uuid
  )
  from public.mission_operating_days day
  join public.mission_pack_revisions pack
    on pack.organisation_id = day.organisation_id and pack.mission_id = day.mission_id and pack.id = day.mission_pack_revision_id
  where day.organisation_id = p_organisation_id and day.mission_id = p_mission_id and day.id = p_operating_day_id
$$;

create function public.ftf_project_mission_day_chemical_actuals(
  p_organisation_id uuid, p_mission_id uuid, p_operating_day_id uuid
)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'mission_id', day.mission_id,
    'operating_day_id', day.id,
    'package_revision_id', day.mission_pack_revision_id,
    'planned_chemical_revision_id', planned.id,
    'day_version', day.row_version,
    'current_revision', coalesce((select max(r.revision_number) from public.mission_day_chemical_revisions r
      where r.organisation_id = day.organisation_id and r.mission_id = day.mission_id and r.operating_day_id = day.id), 0),
    'proposals', coalesce((select jsonb_agg(jsonb_build_object(
      'planned_line_id', line.id, 'product_name', line.product_name,
      'platform_product_id', line.platform_product_id, 'platform_product_version_id', line.platform_product_version_id,
      'register_entry_id', line.register_entry_id, 'rate', line.rate::numeric(18,6)::text,
      'rate_unit', line.rate_unit, 'planned_quantity', line.total_product_quantity::numeric(18,6)::text,
      'quantity_unit', line.total_product_unit, 'product_snapshot', line.snapshot
    ) order by line.line_number) from public.mission_chemical_plan_lines line
      where line.organisation_id = day.organisation_id and line.mission_id = day.mission_id and line.revision_id = planned.id), '[]'::jsonb),
    'actual', (select jsonb_build_object(
      'id', revision.id, 'mission_id', revision.mission_id, 'operating_day_id', revision.operating_day_id,
      'package_revision_id', revision.mission_pack_revision_id, 'planned_chemical_revision_id', revision.planned_chemical_revision_id,
      'revision_number', revision.revision_number, 'confirmation_state', revision.confirmation_state,
      'changed_from_plan', revision.changed_from_plan, 'material_variance', revision.material_variance,
      'operation_started_at_confirmation', revision.operation_started_at_confirmation, 'notes', revision.notes,
      'confirmed_by_internal_user_id', revision.confirmed_by_internal_user_id, 'confirmed_at', revision.confirmed_at,
      'lines', coalesce((select jsonb_agg(jsonb_build_object(
        'id', actual_line.id, 'field_id', actual_line.field_id, 'planned_line_id', actual_line.planned_line_id,
        'platform_product_id', actual_line.platform_product_id, 'platform_product_version_id', actual_line.platform_product_version_id,
        'register_entry_id', actual_line.register_entry_id, 'product_name', actual_line.product_name,
        'rate', actual_line.rate::numeric(18,6)::text, 'rate_unit', actual_line.rate_unit,
        'applied_quantity', actual_line.applied_quantity::numeric(18,6)::text, 'quantity_unit', actual_line.quantity_unit,
        'batch_lot', actual_line.batch_lot, 'aircraft_id', actual_line.aircraft_id,
        'product_snapshot', actual_line.product_snapshot
      ) order by actual_line.line_number) from public.mission_day_chemical_lines actual_line
        where actual_line.organisation_id = revision.organisation_id and actual_line.revision_id = revision.id), '[]'::jsonb)
    ) from public.mission_day_chemical_revisions revision
      where revision.organisation_id = day.organisation_id and revision.mission_id = day.mission_id and revision.operating_day_id = day.id
      order by revision.revision_number desc limit 1)
  )
  from public.mission_operating_days day
  join public.mission_chemical_plan_revisions planned
    on planned.organisation_id = day.organisation_id and planned.mission_id = day.mission_id
   and planned.id = public.ftf_mission_day_planned_chemical_revision_id(day.organisation_id, day.mission_id, day.id)
  where day.organisation_id = p_organisation_id and day.mission_id = p_mission_id and day.id = p_operating_day_id
$$;

create function public.ftf_read_mission_day_chemical_actuals(
  p_organisation_id uuid, p_actor_internal_user_id uuid, p_mission_id uuid, p_operating_day_id uuid
)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_day public.mission_operating_days%rowtype; v_result jsonb;
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
  v_result := public.ftf_project_mission_day_chemical_actuals(p_organisation_id, p_mission_id, p_operating_day_id);
  if v_result is null then return jsonb_build_object('error', 'MISSION_DAY_CHEMICAL_PLAN_NOT_FOUND'); end if;
  return v_result;
end;
$$;

create function public.ftf_confirm_mission_day_chemical_actuals(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_mission_id uuid,
  p_operating_day_id uuid,
  p_expected_day_version integer,
  p_expected_revision integer,
  p_lines jsonb,
  p_notes text default null
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_mission public.missions%rowtype; v_day public.mission_operating_days%rowtype;
  v_planned_revision_id uuid; v_current integer; v_item jsonb; v_planned public.mission_chemical_plan_lines%rowtype;
  v_product_version public.platform_chemical_product_versions%rowtype;
  v_revision public.mission_day_chemical_revisions%rowtype; v_index integer := 0;
  v_material boolean := false; v_item_material boolean; v_field_id uuid; v_aircraft_id uuid;
  v_planned_line_id uuid; v_platform_product_id uuid; v_platform_product_version_id uuid; v_register_entry_id uuid;
  v_rate numeric(18,6); v_quantity numeric(18,6); v_rate_unit text; v_quantity_unit text;
  v_product_name text; v_batch_lot text; v_snapshot jsonb;
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
  if p_expected_day_version is null or p_expected_day_version < 1 or v_day.row_version <> p_expected_day_version then
    return jsonb_build_object('error', 'MISSION_OPERATING_DAY_VERSION_CONFLICT', 'current_version', v_day.row_version);
  end if;
  select coalesce(max(revision_number), 0) into v_current from public.mission_day_chemical_revisions
    where organisation_id = p_organisation_id and mission_id = p_mission_id and operating_day_id = p_operating_day_id;
  if p_expected_revision is null or p_expected_revision < 0 or v_current <> p_expected_revision then
    return jsonb_build_object('error', 'MISSION_DAY_CHEMICAL_REVISION_CONFLICT', 'current_version', v_current);
  end if;
  v_planned_revision_id := public.ftf_mission_day_planned_chemical_revision_id(p_organisation_id, p_mission_id, p_operating_day_id);
  if v_planned_revision_id is null or not exists (select 1 from public.mission_chemical_plan_revisions
    where organisation_id = p_organisation_id and mission_id = p_mission_id and id = v_planned_revision_id) then
    return jsonb_build_object('error', 'MISSION_DAY_CHEMICAL_PLAN_NOT_FOUND');
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 200
    or (p_notes is not null and (length(p_notes) not between 1 and 4000 or p_notes <> btrim(p_notes))) then
    return jsonb_build_object('error', 'MISSION_DAY_CHEMICAL_INPUT_INVALID');
  end if;

  for v_item in select value from jsonb_array_elements(p_lines) loop
    if jsonb_typeof(v_item) <> 'object' or (select count(*) from jsonb_object_keys(v_item)) <> 12
      or not (v_item ?& array['fieldId','plannedLineId','platformProductId','platformProductVersionId','registerEntryId','productName','rate','rateUnit','appliedQuantity','quantityUnit','batchLot','aircraftId'])
      or jsonb_typeof(v_item->'batchLot') not in ('string','null')
      or coalesce(v_item->>'rate', '') !~ '^(0|[1-9][0-9]{0,11})\.[0-9]{6}$'
      or coalesce(v_item->>'appliedQuantity', '') !~ '^(0|[1-9][0-9]{0,11})\.[0-9]{6}$' then
      return jsonb_build_object('error', 'MISSION_DAY_CHEMICAL_INPUT_INVALID');
    end if;
    v_field_id := nullif(v_item->>'fieldId', '')::uuid;
    if not exists (select 1 from public.mission_pack_fields scope
      where scope.organisation_id = p_organisation_id and scope.mission_id = p_mission_id
        and scope.pack_revision_id = v_day.mission_pack_revision_id and scope.field_id = v_field_id) then
      return jsonb_build_object('error', 'MISSION_DAY_FIELD_INVALID');
    end if;
    v_planned_line_id := nullif(v_item->>'plannedLineId', '')::uuid;
    v_platform_product_id := nullif(v_item->>'platformProductId', '')::uuid;
    v_platform_product_version_id := nullif(v_item->>'platformProductVersionId', '')::uuid;
    v_register_entry_id := nullif(v_item->>'registerEntryId', '')::uuid;
    v_product_name := btrim(coalesce(v_item->>'productName', ''));
    v_rate := (v_item->>'rate')::numeric(18,6); v_quantity := (v_item->>'appliedQuantity')::numeric(18,6);
    v_rate_unit := upper(coalesce(v_item->>'rateUnit', '')); v_quantity_unit := upper(coalesce(v_item->>'quantityUnit', ''));
    v_batch_lot := nullif(btrim(v_item->>'batchLot'), ''); v_aircraft_id := nullif(v_item->>'aircraftId', '')::uuid;
    if v_product_name = '' or length(v_product_name) > 500 or v_rate <= 0 or v_quantity <= 0
      or v_rate_unit not in ('L_HA','ML_HA','KG_HA','G_HA')
      or v_quantity_unit <> (case v_rate_unit when 'L_HA' then 'L' when 'ML_HA' then 'ML' when 'KG_HA' then 'KG' else 'G' end)
      or (v_batch_lot is not null and length(v_batch_lot) > 200)
      or ((v_platform_product_id is null) <> (v_platform_product_version_id is null)) then
      return jsonb_build_object('error', 'MISSION_DAY_CHEMICAL_INPUT_INVALID');
    end if;
    v_item_material := false; v_snapshot := '{}'::jsonb;
    if v_planned_line_id is not null then
      select * into v_planned from public.mission_chemical_plan_lines
        where organisation_id = p_organisation_id and mission_id = p_mission_id
          and revision_id = v_planned_revision_id and id = v_planned_line_id;
      if not found or public.ftf_normalise_chemical_name(v_product_name) <> v_planned.normalised_product_name
        or v_platform_product_id is distinct from v_planned.platform_product_id
        or v_platform_product_version_id is distinct from v_planned.platform_product_version_id
        or v_register_entry_id is distinct from v_planned.register_entry_id then
        return jsonb_build_object('error', 'MISSION_DAY_CHEMICAL_INPUT_INVALID');
      end if;
      v_product_name := v_planned.product_name; v_platform_product_id := v_planned.platform_product_id;
      v_platform_product_version_id := v_planned.platform_product_version_id; v_register_entry_id := v_planned.register_entry_id;
      v_snapshot := v_planned.snapshot;
      v_item_material := v_rate <> v_planned.rate::numeric(18,6) or v_rate_unit <> v_planned.rate_unit;
    else
      if v_platform_product_version_id is null then return jsonb_build_object('error', 'MISSION_DAY_CHEMICAL_INPUT_INVALID'); end if;
      select version.* into v_product_version
      from public.platform_chemical_product_versions version join public.platform_chemical_products product on product.id = version.product_id
      where version.id = v_platform_product_version_id and version.product_id = v_platform_product_id and product.status = 'VERIFIED';
      if not found or public.ftf_normalise_chemical_name(v_product_name) <> public.ftf_normalise_chemical_name(v_product_version.display_name) then
        return jsonb_build_object('error', 'MISSION_DAY_CHEMICAL_INPUT_INVALID');
      end if;
      if v_register_entry_id is not null and not exists (select 1 from public.organisation_chemical_register entry
        where entry.organisation_id = p_organisation_id and entry.id = v_register_entry_id and entry.archived_at is null
          and (entry.operating_location_id is null or entry.operating_location_id = v_day.operating_location_id)
          and entry.platform_product_version_id = v_platform_product_version_id) then
        return jsonb_build_object('error', 'MISSION_DAY_CHEMICAL_INPUT_INVALID');
      end if;
      v_product_name := v_product_version.display_name;
      v_snapshot := to_jsonb(v_product_version);
      v_item_material := true;
    end if;
    if v_aircraft_id is not null and not exists (select 1 from public.aircraft aircraft
      join public.mission_pack_revisions pack
        on pack.organisation_id = aircraft.organisation_id and pack.mission_id = p_mission_id
       and pack.id = v_day.mission_pack_revision_id
      cross join lateral jsonb_array_elements(coalesce(pack.source_manifest->'aircraftAssignments', '[]'::jsonb)) item(assignment)
      where aircraft.organisation_id = p_organisation_id and aircraft.id = v_aircraft_id
        and aircraft.operating_location_id = v_day.operating_location_id
        and nullif(assignment->>'aircraftId', '')::uuid = aircraft.id) then
      return jsonb_build_object('error', 'MISSION_DAY_AIRCRAFT_INVALID');
    end if;
    v_material := v_material or v_item_material;
  end loop;
  if v_material and v_day.actual_started_at is null then
    return jsonb_build_object('error', 'MISSION_REAUTHORISATION_REQUIRED');
  end if;

  insert into public.mission_day_chemical_revisions (
    organisation_id, operating_location_id, mission_id, operating_day_id, mission_pack_revision_id,
    planned_chemical_revision_id, revision_number, changed_from_plan, material_variance,
    operation_started_at_confirmation, notes, confirmed_by_internal_user_id
  ) values (p_organisation_id, v_day.operating_location_id, p_mission_id, v_day.id, v_day.mission_pack_revision_id,
    v_planned_revision_id, v_current + 1, v_material, v_material, v_day.actual_started_at, p_notes, p_actor_internal_user_id)
  returning * into v_revision;

  for v_item in select value from jsonb_array_elements(p_lines) loop
    v_index := v_index + 1;
    v_field_id := (v_item->>'fieldId')::uuid; v_planned_line_id := nullif(v_item->>'plannedLineId', '')::uuid;
    v_platform_product_id := nullif(v_item->>'platformProductId', '')::uuid;
    v_platform_product_version_id := nullif(v_item->>'platformProductVersionId', '')::uuid;
    v_register_entry_id := nullif(v_item->>'registerEntryId', '')::uuid;
    v_product_name := btrim(v_item->>'productName'); v_rate := (v_item->>'rate')::numeric(18,6);
    v_quantity := (v_item->>'appliedQuantity')::numeric(18,6); v_rate_unit := upper(v_item->>'rateUnit');
    v_quantity_unit := upper(v_item->>'quantityUnit'); v_batch_lot := nullif(btrim(v_item->>'batchLot'), '');
    v_aircraft_id := nullif(v_item->>'aircraftId', '')::uuid;
    if v_planned_line_id is not null then
      select * into v_planned from public.mission_chemical_plan_lines where organisation_id = p_organisation_id and id = v_planned_line_id;
      v_product_name := v_planned.product_name; v_platform_product_id := v_planned.platform_product_id;
      v_platform_product_version_id := v_planned.platform_product_version_id; v_register_entry_id := v_planned.register_entry_id;
      v_snapshot := v_planned.snapshot;
      insert into public.mission_day_chemical_lines (
        organisation_id, operating_location_id, mission_id, operating_day_id, revision_id, line_number, field_id,
        planned_line_id, platform_product_id, platform_product_version_id, register_entry_id, product_name,
        normalised_product_name, manufacturer, apvma_number, active_ingredient, formulation, rate, rate_unit,
        applied_quantity, quantity_unit, batch_lot, aircraft_id, product_snapshot
      ) values (p_organisation_id, v_day.operating_location_id, p_mission_id, v_day.id, v_revision.id, v_index, v_field_id,
        v_planned.id, v_platform_product_id, v_platform_product_version_id, v_register_entry_id, v_product_name,
        v_planned.normalised_product_name, v_planned.manufacturer, v_planned.apvma_number, v_planned.active_ingredient,
        v_planned.formulation, v_rate, v_rate_unit, v_quantity, v_quantity_unit, v_batch_lot, v_aircraft_id, v_snapshot);
    else
      select version.* into v_product_version
      from public.platform_chemical_product_versions version join public.platform_chemical_products product on product.id = version.product_id
      where version.id = v_platform_product_version_id and version.product_id = v_platform_product_id;
      v_product_name := v_product_version.display_name;
      v_snapshot := to_jsonb(v_product_version);
      insert into public.mission_day_chemical_lines (
        organisation_id, operating_location_id, mission_id, operating_day_id, revision_id, line_number, field_id,
        platform_product_id, platform_product_version_id, register_entry_id, product_name, normalised_product_name,
        manufacturer, apvma_number, active_ingredient, formulation, rate, rate_unit, applied_quantity,
        quantity_unit, batch_lot, aircraft_id, product_snapshot
      ) values (p_organisation_id, v_day.operating_location_id, p_mission_id, v_day.id, v_revision.id, v_index, v_field_id,
        v_platform_product_id, v_platform_product_version_id, v_register_entry_id, v_product_name,
        public.ftf_normalise_chemical_name(v_product_name), v_product_version.manufacturer, v_product_version.apvma_number,
        v_product_version.active_ingredient, v_product_version.formulation, v_rate, v_rate_unit, v_quantity,
        v_quantity_unit, v_batch_lot, v_aircraft_id, v_snapshot);
    end if;
  end loop;
  insert into public.audit_events (organisation_id, actor_internal_user_id, event_type, entity_type, entity_id, event_payload)
    values (p_organisation_id, p_actor_internal_user_id, 'mission.day_chemicals.confirmed', 'mission_operating_day', v_day.id,
      jsonb_build_object('mission_id', p_mission_id, 'revision_id', v_revision.id, 'revision_number', v_revision.revision_number,
        'package_revision_id', v_day.mission_pack_revision_id, 'planned_chemical_revision_id', v_planned_revision_id,
        'changed_from_plan', v_material, 'line_count', jsonb_array_length(p_lines)));
  insert into public.transactional_outbox (organisation_id, topic, aggregate_type, aggregate_id, payload)
    values (p_organisation_id, 'operational.mission.day_chemicals_confirmed', 'mission', p_mission_id,
      jsonb_build_object('operating_day_id', v_day.id, 'revision_id', v_revision.id, 'revision_number', v_revision.revision_number,
        'package_revision_id', v_day.mission_pack_revision_id, 'changed_from_plan', v_material));
  return public.ftf_project_mission_day_chemical_actuals(p_organisation_id, p_mission_id, p_operating_day_id);
exception when invalid_text_representation or numeric_value_out_of_range then
  return jsonb_build_object('error', 'MISSION_DAY_CHEMICAL_INPUT_INVALID');
end;
$$;

create function public.ftf_mission_day_weather_context(
  p_organisation_id uuid, p_mission_id uuid, p_operating_day_id uuid, p_coverage text
)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_day public.mission_operating_days%rowtype; v_observation public.mission_weather_observations%rowtype;
  v_observation_id uuid; v_start timestamptz; v_end timestamptz; v_coverage text; v_context jsonb;
begin
  select * into v_day from public.mission_operating_days
    where organisation_id = p_organisation_id and mission_id = p_mission_id and id = p_operating_day_id;
  if not found then return jsonb_build_object('error', 'MISSION_OPERATING_DAY_NOT_FOUND'); end if;
  v_coverage := upper(coalesce(p_coverage, ''));
  if v_coverage = 'ACTUAL_INTERVAL' then
    if v_day.actual_started_at is null or v_day.actual_finished_at is null or v_day.actual_finished_at <= v_day.actual_started_at then
      return jsonb_build_object('error', 'MISSION_DAY_ACTUAL_INTERVAL_REQUIRED');
    end if;
    v_start := v_day.actual_started_at; v_end := v_day.actual_finished_at;
  elsif v_coverage = 'FULL_DAY' then
    v_start := v_day.work_date::timestamp at time zone v_day.timezone;
    v_end := (v_day.work_date + 1)::timestamp at time zone v_day.timezone;
  else return jsonb_build_object('error', 'MISSION_DAY_WEATHER_COVERAGE_INVALID'); end if;
  select coalesce(nullif(pack.source_manifest#>>'{weather,observationId}', '')::uuid,
      nullif(pack.pack_snapshot#>>'{evidence,preflight,observedWeather,id}', '')::uuid)
    into v_observation_id from public.mission_pack_revisions pack
    where pack.organisation_id = v_day.organisation_id and pack.mission_id = v_day.mission_id and pack.id = v_day.mission_pack_revision_id;
  select * into v_observation from public.mission_weather_observations
    where organisation_id = p_organisation_id and mission_id = p_mission_id and id = v_observation_id;
  if not found or v_observation.operating_location_id <> v_day.operating_location_id then
    return jsonb_build_object('error', 'MISSION_DAY_WEATHER_LOCATION_REQUIRED');
  end if;
  v_context := jsonb_build_object('mission_id', v_day.mission_id, 'operating_day_id', v_day.id,
    'package_revision_id', v_day.mission_pack_revision_id, 'day_version', v_day.row_version,
    'coverage', v_coverage,
    'interval_start_at', to_char(v_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'interval_end_at', to_char(v_end at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'timezone', v_day.timezone,
    'source_weather_observation_id', v_observation.id, 'source_weather_observation_version', v_observation.version_number,
    'source_weather_observation_source', v_observation.source,
    'latitude', v_observation.latitude::numeric(9,6)::text,
    'longitude', v_observation.longitude::numeric(9,6)::text);
  return v_context || jsonb_build_object('context_digest',
    encode(sha256(convert_to(v_context::text, 'UTF8')), 'hex'));
end;
$$;

create function public.ftf_project_mission_day_weather_report(
  p_organisation_id uuid, p_mission_id uuid, p_operating_day_id uuid
)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', report.id, 'mission_id', report.mission_id, 'operating_day_id', report.operating_day_id,
    'package_revision_id', report.mission_pack_revision_id, 'coverage', report.coverage,
    'interval_start_at', to_char(report.interval_start_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'interval_end_at', to_char(report.interval_end_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'timezone', report.timezone,
    'source', report.source, 'source_weather_observation_id', report.source_weather_observation_id,
    'latitude', report.latitude::numeric(9,6)::text, 'longitude', report.longitude::numeric(9,6)::text,
    'provider_identifier', report.provider_identifier, 'provider_retrieved_at', report.provider_retrieved_at,
    'hourly_observations', report.hourly_observations, 'inversion_inputs', report.inversion_inputs,
    'inversion_results', report.inversion_results, 'coverage_gaps', report.coverage_gaps,
    'source_metadata', report.source_metadata, 'manual_reason', report.manual_reason,
    'source_digest', report.source_digest, 'recorded_by_internal_user_id', report.recorded_by_internal_user_id,
    'created_at', report.created_at)
  from public.mission_day_weather_reports report
  where report.organisation_id = p_organisation_id and report.mission_id = p_mission_id and report.operating_day_id = p_operating_day_id
$$;

create function public.ftf_prepare_mission_day_weather_capture(
  p_organisation_id uuid, p_actor_internal_user_id uuid, p_mission_id uuid, p_operating_day_id uuid, p_coverage text
)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_day public.mission_operating_days%rowtype; v_existing jsonb;
begin
  if not public.ftf_actor_has_active_beta_seat(p_organisation_id, p_actor_internal_user_id)
    or not public.ftf_actor_has_permission(p_organisation_id, p_actor_internal_user_id, 'mission.operational.write') then
    return jsonb_build_object('forbidden', true);
  end if;
  select * into v_day from public.mission_operating_days
    where organisation_id = p_organisation_id and mission_id = p_mission_id and id = p_operating_day_id;
  if not found then return jsonb_build_object('error', 'MISSION_OPERATING_DAY_NOT_FOUND'); end if;
  if not public.ftf_operational_location_allowed(p_organisation_id, p_actor_internal_user_id, v_day.operating_location_id) then
    return jsonb_build_object('location_forbidden', true);
  end if;
  v_existing := public.ftf_project_mission_day_weather_report(p_organisation_id, p_mission_id, p_operating_day_id);
  if v_existing is not null then return jsonb_build_object('frozen', true, 'report', v_existing); end if;
  return public.ftf_mission_day_weather_context(p_organisation_id, p_mission_id, p_operating_day_id, p_coverage);
end;
$$;

create function public.ftf_read_mission_day_weather_report(
  p_organisation_id uuid, p_actor_internal_user_id uuid, p_mission_id uuid, p_operating_day_id uuid
)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
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
  return jsonb_build_object('report', public.ftf_project_mission_day_weather_report(p_organisation_id, p_mission_id, p_operating_day_id));
end;
$$;

create function public.ftf_freeze_mission_day_weather_report(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_mission_id uuid,
  p_operating_day_id uuid,
  p_expected_day_version integer,
  p_expected_context_digest text,
  p_coverage text,
  p_evidence jsonb
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_mission public.missions%rowtype; v_day public.mission_operating_days%rowtype; v_context jsonb;
  v_existing public.mission_day_weather_reports%rowtype; v_report public.mission_day_weather_reports%rowtype;
  v_source text; v_digest_payload jsonb; v_digest text; v_observation jsonb; v_observed_at timestamptz;
  v_gap jsonb; v_gap_at timestamptz; v_bucket_start timestamptz; v_expected_count integer; v_covered_count integer;
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
  if p_expected_day_version is null or p_expected_day_version < 1 or v_day.row_version <> p_expected_day_version then
    return jsonb_build_object('error', 'MISSION_OPERATING_DAY_VERSION_CONFLICT', 'current_version', v_day.row_version);
  end if;
  select * into v_existing from public.mission_day_weather_reports
    where organisation_id = p_organisation_id and mission_id = p_mission_id and operating_day_id = p_operating_day_id;
  if found then return jsonb_build_object('error', 'MISSION_DAY_WEATHER_ALREADY_FROZEN', 'current_digest', v_existing.source_digest); end if;
  v_context := public.ftf_mission_day_weather_context(p_organisation_id, p_mission_id, p_operating_day_id, p_coverage);
  if v_context ? 'error' then return v_context; end if;
  if p_expected_context_digest is null or p_expected_context_digest !~ '^[a-f0-9]{64}$'
    or p_expected_context_digest <> v_context->>'context_digest' then
    return jsonb_build_object('error', 'MISSION_DAY_WEATHER_CONTEXT_CONFLICT', 'current_digest', v_context->>'context_digest');
  end if;
  v_bucket_start := date_trunc('hour', (v_context->>'interval_start_at')::timestamptz);
  if v_bucket_start < (v_context->>'interval_start_at')::timestamptz then v_bucket_start := v_bucket_start + interval '1 hour'; end if;
  if jsonb_typeof(p_evidence) <> 'object' or (select count(*) from jsonb_object_keys(p_evidence)) <> 9
    or not (p_evidence ?& array['source','providerIdentifier','providerRetrievedAt','hourlyObservations','inversionInputs','inversionResults','coverageGaps','manualReason','sourceMetadata'])
    or jsonb_typeof(p_evidence->'hourlyObservations') <> 'array'
    or jsonb_array_length(p_evidence->'hourlyObservations') not between 1 and 1000
    or jsonb_typeof(p_evidence->'inversionInputs') <> 'object'
    or jsonb_typeof(p_evidence->'inversionResults') <> 'object'
    or jsonb_typeof(p_evidence->'coverageGaps') <> 'array' or jsonb_array_length(p_evidence->'coverageGaps') > 1000
    or jsonb_typeof(p_evidence->'sourceMetadata') <> 'object' then
    return jsonb_build_object('error', 'MISSION_DAY_WEATHER_INPUT_INVALID');
  end if;
  v_source := upper(coalesce(p_evidence->>'source', ''));
  if v_source not in ('OPEN_METEO','MANUAL')
    or (v_source = 'OPEN_METEO' and (nullif(btrim(p_evidence->>'providerIdentifier'), '') is null
      or p_evidence->>'providerIdentifier' <> btrim(p_evidence->>'providerIdentifier')
      or nullif(p_evidence->>'providerRetrievedAt', '') is null or p_evidence->>'manualReason' is not null))
    or (v_source = 'MANUAL' and (p_evidence->>'providerIdentifier' is not null
      or p_evidence->>'providerRetrievedAt' is not null or nullif(btrim(p_evidence->>'manualReason'), '') is null
      or p_evidence->>'manualReason' <> btrim(p_evidence->>'manualReason') or length(p_evidence->>'manualReason') > 4000)) then
    return jsonb_build_object('error', 'MISSION_DAY_WEATHER_INPUT_INVALID');
  end if;
  for v_observation in select value from jsonb_array_elements(p_evidence->'hourlyObservations') loop
    if jsonb_typeof(v_observation) <> 'object'
      or (select count(*) from jsonb_object_keys(v_observation)) <> 7
      or not (v_observation ?& array['observedAt','temperatureC','relativeHumidity','dewPointC','windSpeedKmh','windDirectionDegrees','precipitationMm'])
      or nullif(v_observation->>'observedAt', '') is null
      or jsonb_typeof(v_observation->'temperatureC') not in ('number','null')
      or jsonb_typeof(v_observation->'relativeHumidity') not in ('number','null')
      or jsonb_typeof(v_observation->'dewPointC') not in ('number','null')
      or jsonb_typeof(v_observation->'windSpeedKmh') not in ('number','null')
      or jsonb_typeof(v_observation->'windDirectionDegrees') not in ('number','null')
      or jsonb_typeof(v_observation->'precipitationMm') not in ('number','null')
      or (jsonb_typeof(v_observation->'temperatureC') = 'null'
        and jsonb_typeof(v_observation->'relativeHumidity') = 'null'
        and jsonb_typeof(v_observation->'dewPointC') = 'null'
        and jsonb_typeof(v_observation->'windSpeedKmh') = 'null'
        and jsonb_typeof(v_observation->'windDirectionDegrees') = 'null'
        and jsonb_typeof(v_observation->'precipitationMm') = 'null') then
      return jsonb_build_object('error', 'MISSION_DAY_WEATHER_INPUT_INVALID');
    end if;
    if (jsonb_typeof(v_observation->'temperatureC') = 'number' and (v_observation->>'temperatureC')::numeric not between -100 and 100)
      or (jsonb_typeof(v_observation->'relativeHumidity') = 'number' and (v_observation->>'relativeHumidity')::numeric not between 0 and 100)
      or (jsonb_typeof(v_observation->'dewPointC') = 'number' and (v_observation->>'dewPointC')::numeric not between -150 and 100)
      or (jsonb_typeof(v_observation->'windSpeedKmh') = 'number' and (v_observation->>'windSpeedKmh')::numeric not between 0 and 500)
      or (jsonb_typeof(v_observation->'windDirectionDegrees') = 'number' and ((v_observation->>'windDirectionDegrees')::numeric < 0 or (v_observation->>'windDirectionDegrees')::numeric >= 360))
      or (jsonb_typeof(v_observation->'precipitationMm') = 'number' and (v_observation->>'precipitationMm')::numeric not between 0 and 10000) then
      return jsonb_build_object('error', 'MISSION_DAY_WEATHER_INPUT_INVALID');
    end if;
    v_observed_at := (v_observation->>'observedAt')::timestamptz;
    if v_observed_at < v_bucket_start or v_observed_at >= (v_context->>'interval_end_at')::timestamptz
      or date_trunc('hour', v_observed_at) <> v_observed_at then
      return jsonb_build_object('error', 'MISSION_DAY_WEATHER_OBSERVATION_OUTSIDE_INTERVAL');
    end if;
  end loop;
  for v_gap in select value from jsonb_array_elements(p_evidence->'coverageGaps') loop
    if jsonb_typeof(v_gap) <> 'object' or (select count(*) from jsonb_object_keys(v_gap)) <> 2
      or not (v_gap ?& array['observedAt','reason']) or nullif(v_gap->>'observedAt', '') is null
      or nullif(btrim(v_gap->>'reason'), '') is null or v_gap->>'reason' <> btrim(v_gap->>'reason')
      or length(v_gap->>'reason') > 1000 then
      return jsonb_build_object('error', 'MISSION_DAY_WEATHER_INPUT_INVALID');
    end if;
    v_gap_at := (v_gap->>'observedAt')::timestamptz;
    if v_gap_at < v_bucket_start or v_gap_at >= (v_context->>'interval_end_at')::timestamptz
      or date_trunc('hour', v_gap_at) <> v_gap_at then
      return jsonb_build_object('error', 'MISSION_DAY_WEATHER_INPUT_INVALID');
    end if;
  end loop;
  if exists (select 1 from (
      select (item->>'observedAt')::timestamptz as bucket
      from jsonb_array_elements(p_evidence->'hourlyObservations') item
    ) observations group by bucket having count(*) > 1)
    or exists (select 1 from (
      select (item->>'observedAt')::timestamptz as bucket
      from jsonb_array_elements(p_evidence->'coverageGaps') item
    ) gaps group by bucket having count(*) > 1)
    or exists (
      select 1 from jsonb_array_elements(p_evidence->'hourlyObservations') observation
      join jsonb_array_elements(p_evidence->'coverageGaps') gap
        on (gap->>'observedAt')::timestamptz = (observation->>'observedAt')::timestamptz
    ) then
    return jsonb_build_object('error', 'MISSION_DAY_WEATHER_INPUT_INVALID');
  end if;
  select count(*)::integer into v_expected_count
  from generate_series(v_bucket_start, (v_context->>'interval_end_at')::timestamptz - interval '1 microsecond', interval '1 hour');
  select count(*)::integer into v_covered_count from (
    select (item->>'observedAt')::timestamptz as bucket from jsonb_array_elements(p_evidence->'hourlyObservations') item
    union all
    select (item->>'observedAt')::timestamptz as bucket from jsonb_array_elements(p_evidence->'coverageGaps') item
  ) covered;
  if v_expected_count = 0 or v_covered_count <> v_expected_count then
    return jsonb_build_object('error', 'MISSION_DAY_WEATHER_INPUT_INVALID');
  end if;
  v_digest_payload := jsonb_build_object(
    'schemaVersion', 'MISSION_DAY_WEATHER_REPORT_V1', 'missionId', p_mission_id, 'operatingDayId', p_operating_day_id,
    'packageRevisionId', v_day.mission_pack_revision_id, 'coverage', v_context->>'coverage',
    'intervalStartAt', v_context->>'interval_start_at', 'intervalEndAt', v_context->>'interval_end_at',
    'timezone', v_context->>'timezone', 'sourceWeatherObservationId', v_context->>'source_weather_observation_id',
    'latitude', v_context->>'latitude', 'longitude', v_context->>'longitude', 'evidence', p_evidence);
  v_digest := encode(sha256(convert_to(v_digest_payload::text, 'UTF8')), 'hex');
  insert into public.mission_day_weather_reports (
    organisation_id, operating_location_id, mission_id, operating_day_id, mission_pack_revision_id, coverage,
    interval_start_at, interval_end_at, timezone, source, source_weather_observation_id, latitude, longitude,
    provider_identifier, provider_retrieved_at, hourly_observations, inversion_inputs, inversion_results,
    coverage_gaps, source_metadata, manual_reason, source_digest, recorded_by_internal_user_id
  ) values (p_organisation_id, v_day.operating_location_id, p_mission_id, v_day.id, v_day.mission_pack_revision_id,
    v_context->>'coverage', (v_context->>'interval_start_at')::timestamptz, (v_context->>'interval_end_at')::timestamptz,
    v_context->>'timezone', v_source, (v_context->>'source_weather_observation_id')::uuid,
    (v_context->>'latitude')::numeric(9,6), (v_context->>'longitude')::numeric(9,6),
    case when v_source = 'OPEN_METEO' then btrim(p_evidence->>'providerIdentifier') else null end,
    case when v_source = 'OPEN_METEO' then (p_evidence->>'providerRetrievedAt')::timestamptz else null end,
    p_evidence->'hourlyObservations', p_evidence->'inversionInputs', p_evidence->'inversionResults',
    p_evidence->'coverageGaps', p_evidence->'sourceMetadata',
    case when v_source = 'MANUAL' then btrim(p_evidence->>'manualReason') else null end,
    v_digest, p_actor_internal_user_id) returning * into v_report;
  insert into public.audit_events (organisation_id, actor_internal_user_id, event_type, entity_type, entity_id, event_payload)
    values (p_organisation_id, p_actor_internal_user_id, 'mission.day_weather.frozen', 'mission_operating_day', v_day.id,
      jsonb_build_object('mission_id', p_mission_id, 'report_id', v_report.id, 'package_revision_id', v_day.mission_pack_revision_id,
        'coverage', v_report.coverage, 'interval_start_at', v_report.interval_start_at,
        'interval_end_at', v_report.interval_end_at, 'source', v_report.source, 'source_digest', v_report.source_digest));
  insert into public.transactional_outbox (organisation_id, topic, aggregate_type, aggregate_id, payload)
    values (p_organisation_id, 'operational.mission.day_weather_frozen', 'mission', p_mission_id,
      jsonb_build_object('operating_day_id', v_day.id, 'report_id', v_report.id, 'package_revision_id', v_day.mission_pack_revision_id,
        'coverage', v_report.coverage, 'source', v_report.source, 'source_digest', v_report.source_digest));
  return jsonb_build_object('report', public.ftf_project_mission_day_weather_report(p_organisation_id, p_mission_id, p_operating_day_id));
exception when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
  return jsonb_build_object('error', 'MISSION_DAY_WEATHER_INPUT_INVALID');
end;
$$;

revoke all on function public.ftf_mission_day_planned_chemical_revision_id(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.ftf_project_mission_day_chemical_actuals(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.ftf_mission_day_weather_context(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.ftf_project_mission_day_weather_report(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.ftf_read_mission_day_chemical_actuals(uuid,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.ftf_confirm_mission_day_chemical_actuals(uuid,uuid,uuid,uuid,integer,integer,jsonb,text) from public,anon,authenticated;
revoke all on function public.ftf_prepare_mission_day_weather_capture(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.ftf_read_mission_day_weather_report(uuid,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.ftf_freeze_mission_day_weather_report(uuid,uuid,uuid,uuid,integer,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.ftf_read_mission_day_chemical_actuals(uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.ftf_confirm_mission_day_chemical_actuals(uuid,uuid,uuid,uuid,integer,integer,jsonb,text) to service_role;
grant execute on function public.ftf_prepare_mission_day_weather_capture(uuid,uuid,uuid,uuid,text) to service_role;
grant execute on function public.ftf_read_mission_day_weather_report(uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.ftf_freeze_mission_day_weather_report(uuid,uuid,uuid,uuid,integer,text,text,jsonb) to service_role;
