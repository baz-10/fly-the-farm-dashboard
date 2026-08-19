-- Authoritative relational Fleet asset identity and maintainable-asset composition.
-- Existing Work Pack snapshots remain immutable evidence; controlled backfill is explicit and dry-run first.

create table public.fleet_assets (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  operating_location_id uuid not null,
  asset_type text not null check (asset_type in ('truck', 'trailer', 'generator', 'crane', 'pump', 'compressor', 'other')),
  asset_identifier text not null check (length(btrim(asset_identifier)) between 1 and 120),
  registration text,
  vin text,
  serial_number text,
  normalised_registration text generated always as (nullif(upper(regexp_replace(btrim(registration), '[^A-Z0-9]', '', 'g')), '')) stored,
  normalised_vin text generated always as (nullif(upper(regexp_replace(btrim(vin), '[^A-Z0-9]', '', 'g')), '')) stored,
  normalised_serial_number text generated always as (nullif(upper(regexp_replace(btrim(serial_number), '[^A-Z0-9]', '', 'g')), '')) stored,
  manufacturer text,
  model text,
  manufacture_year integer check (manufacture_year is null or manufacture_year between 1900 and 2200),
  status text not null default 'available' check (status in ('available', 'assigned', 'maintenance', 'retired')),
  notes text not null default '',
  source_system text,
  source_record_id text,
  source_digest text check (source_digest is null or source_digest ~ '^[a-f0-9]{64}$'),
  created_by_internal_user_id uuid not null,
  updated_by_internal_user_id uuid not null,
  archived_at timestamptz,
  archived_by_internal_user_id uuid,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, id),
  foreign key (organisation_id) references public.organisations(id),
  foreign key (organisation_id, operating_location_id) references public.operating_locations(organisation_id, id),
  foreign key (organisation_id, created_by_internal_user_id) references public.internal_users(organisation_id, id),
  foreign key (organisation_id, updated_by_internal_user_id) references public.internal_users(organisation_id, id),
  foreign key (organisation_id, archived_by_internal_user_id) references public.internal_users(organisation_id, id),
  check (asset_type not in ('truck', 'trailer') or registration is not null),
  check (registration is null or length(btrim(registration)) between 1 and 40),
  check (vin is null or length(btrim(vin)) between 1 and 80),
  check (serial_number is null or length(btrim(serial_number)) between 1 and 120),
  check (manufacturer is null or length(btrim(manufacturer)) between 1 and 120),
  check (model is null or length(btrim(model)) between 1 and 120)
);

create unique index fleet_assets_active_identifier_unique
  on public.fleet_assets(organisation_id, upper(btrim(asset_identifier))) where archived_at is null;
create unique index fleet_assets_active_registration_unique
  on public.fleet_assets(organisation_id, normalised_registration)
  where archived_at is null and normalised_registration is not null;
create unique index fleet_assets_active_vin_unique
  on public.fleet_assets(organisation_id, normalised_vin)
  where archived_at is null and normalised_vin is not null;
create unique index fleet_assets_active_serial_unique
  on public.fleet_assets(organisation_id, normalised_serial_number)
  where archived_at is null and normalised_serial_number is not null;
create unique index fleet_assets_source_unique
  on public.fleet_assets(organisation_id, source_system, source_record_id)
  where source_system is not null and source_record_id is not null;
create index fleet_assets_location_status_idx
  on public.fleet_assets(organisation_id, operating_location_id, asset_type, status) where archived_at is null;

create trigger fleet_assets_set_update_metadata before update on public.fleet_assets
for each row execute function public.set_tenant_row_update_metadata();

alter table public.fleet_assets enable row level security;
alter table public.fleet_assets force row level security;
revoke all on table public.fleet_assets from public, anon, authenticated;
grant select, insert, update, delete on table public.fleet_assets to service_role;

create table public.maintainable_asset_registry (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  aircraft_id uuid,
  equipment_kit_id uuid,
  fleet_asset_id uuid,
  tracking_state text not null default 'ACTIVE' check (tracking_state in ('ACTIVE', 'HISTORY_ONLY')),
  created_by_internal_user_id uuid not null,
  updated_by_internal_user_id uuid not null,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, id),
  unique (organisation_id, aircraft_id),
  unique (organisation_id, equipment_kit_id),
  unique (organisation_id, fleet_asset_id),
  foreign key (organisation_id) references public.organisations(id),
  foreign key (organisation_id, aircraft_id) references public.aircraft(organisation_id, id),
  foreign key (organisation_id, equipment_kit_id) references public.equipment_kits(organisation_id, id),
  foreign key (organisation_id, fleet_asset_id) references public.fleet_assets(organisation_id, id),
  foreign key (organisation_id, created_by_internal_user_id) references public.internal_users(organisation_id, id),
  foreign key (organisation_id, updated_by_internal_user_id) references public.internal_users(organisation_id, id),
  check (num_nonnulls(aircraft_id, equipment_kit_id, fleet_asset_id) = 1)
);

create trigger maintainable_asset_registry_set_update_metadata before update on public.maintainable_asset_registry
for each row execute function public.set_tenant_row_update_metadata();
alter table public.maintainable_asset_registry enable row level security;
alter table public.maintainable_asset_registry force row level security;
revoke all on table public.maintainable_asset_registry from public, anon, authenticated;
grant select, insert, update on table public.maintainable_asset_registry to service_role;

insert into public.maintainable_asset_registry(
  organisation_id, aircraft_id, created_by_internal_user_id, updated_by_internal_user_id
)
select aircraft.organisation_id, aircraft.id, aircraft.created_by_internal_user_id, aircraft.updated_by_internal_user_id
from public.aircraft aircraft
where aircraft.archived_at is null
on conflict (organisation_id, aircraft_id) do nothing;

insert into public.maintainable_asset_registry(
  organisation_id, equipment_kit_id, created_by_internal_user_id, updated_by_internal_user_id
)
select equipment.organisation_id, equipment.id, equipment.created_by_internal_user_id, equipment.updated_by_internal_user_id
from public.equipment_kits equipment
where equipment.archived_at is null
on conflict (organisation_id, equipment_kit_id) do nothing;

create function public.ftf_provision_fleet_asset_admin_permissions()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.code <> 'admin' then return new; end if;
  insert into public.permissions(organisation_id, code, description)
  select new.organisation_id, code, description from (values
    ('fleet_assets.read', 'View Fleet assets'),
    ('fleet_assets.create', 'Create Fleet assets'),
    ('fleet_assets.update', 'Update Fleet assets'),
    ('fleet_assets.archive', 'Archive Fleet assets')
  ) values_to_add(code, description)
  on conflict (organisation_id, code) do nothing;
  insert into public.role_permissions(organisation_id, role_id, permission_id)
  select new.organisation_id, new.id, permission.id
  from public.permissions permission
  where permission.organisation_id = new.organisation_id and permission.code like 'fleet_assets.%'
  on conflict (organisation_id, role_id, permission_id) do nothing;
  return new;
end;
$$;

create trigger roles_provision_fleet_asset_admin_permissions
after insert on public.roles for each row execute function public.ftf_provision_fleet_asset_admin_permissions();

insert into public.permissions(organisation_id, code, description)
select organisation.id, values_to_add.code, values_to_add.description
from public.organisations organisation
cross join (values
  ('fleet_assets.read', 'View Fleet assets'),
  ('fleet_assets.create', 'Create Fleet assets'),
  ('fleet_assets.update', 'Update Fleet assets'),
  ('fleet_assets.archive', 'Archive Fleet assets')
) values_to_add(code, description)
where organisation.archived_at is null
on conflict (organisation_id, code) do nothing;

insert into public.role_permissions(organisation_id, role_id, permission_id)
select role.organisation_id, role.id, permission.id
from public.roles role
join public.permissions permission on permission.organisation_id = role.organisation_id
  and permission.code like 'fleet_assets.%'
where role.code = 'admin' and role.archived_at is null
on conflict (organisation_id, role_id, permission_id) do nothing;

create function public.ftf_fleet_asset_has_active_work_pack_dependency(
  p_organisation_id uuid,
  p_fleet_asset_id uuid
) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.ftf_store store
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(store.payload->'templates') = 'array' then store.payload->'templates' else '[]'::jsonb end
    ) template
    where store.tenant_id = p_organisation_id
      and store.collection = 'ftf_work_packs'
      and store.record_id = '__value__'
      and coalesce(template->>'status', 'active') <> 'archived'
      and (
        (jsonb_typeof(template->'assetIds') = 'array' and template->'assetIds' ? p_fleet_asset_id::text)
        or (template->>'truckId' = p_fleet_asset_id::text)
      )
  );
$$;

create function public.ftf_guard_current_work_pack_fleet_references()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_template jsonb;
  v_asset_id_text text;
  v_asset_id uuid;
begin
  if new.collection <> 'ftf_work_packs' or new.record_id <> '__value__' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('fleet-work-pack:' || new.tenant_id::text, 0));
  for v_template in select value from jsonb_array_elements(
    case when jsonb_typeof(new.payload->'templates') = 'array' then new.payload->'templates' else '[]'::jsonb end
  ) loop
    if coalesce(v_template->>'status', 'active') <> 'archived' then
      for v_asset_id_text in
        select value from jsonb_array_elements_text(
          case when jsonb_typeof(v_template->'assetIds') = 'array' then v_template->'assetIds' else '[]'::jsonb end
        )
        union
        select v_template->>'truckId' where nullif(v_template->>'truckId', '') is not null
      loop
        if v_asset_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
          v_asset_id := v_asset_id_text::uuid;
          if not exists (select 1 from public.fleet_assets asset
            where asset.organisation_id = new.tenant_id and asset.id = v_asset_id and asset.archived_at is null) then
            raise exception 'WORK_PACK_FLEET_ASSET_UNAVAILABLE' using errcode = '23503';
          end if;
        end if;
      end loop;
    end if;
  end loop;
  return new;
end;
$$;

create trigger ftf_store_guard_current_work_pack_fleet_references
before insert or update of payload on public.ftf_store
for each row execute function public.ftf_guard_current_work_pack_fleet_references();

alter function public.ftf_write_operational_resource(uuid, uuid, text, text, uuid, integer, jsonb)
  rename to ftf_write_operational_resource_before_fleet_assets;

create function public.ftf_write_operational_resource(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_resource text,
  p_operation text,
  p_entity_id uuid default null,
  p_expected_version integer default null,
  p_data jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_record public.fleet_assets%rowtype;
  v_location_id uuid;
begin
  if p_resource <> 'fleet-assets' then
    return public.ftf_write_operational_resource_before_fleet_assets(
      p_organisation_id, p_actor_internal_user_id, p_resource, p_operation,
      p_entity_id, p_expected_version, p_data
    );
  end if;
  perform public.ftf_lock_active_organisation(p_organisation_id);
  if not public.ftf_actor_has_active_beta_seat(p_organisation_id, p_actor_internal_user_id) then
    raise exception 'active organisation actor seat required' using errcode = '42501';
  end if;
  if p_operation not in ('create', 'update', 'archive') then
    raise exception 'unsupported Fleet asset operation' using errcode = '22023';
  end if;
  if not public.ftf_actor_has_permission(p_organisation_id, p_actor_internal_user_id, 'fleet_assets.' || p_operation) then
    return jsonb_build_object('forbidden', true);
  end if;
  if p_operation in ('update', 'archive') then
    select * into v_record from public.fleet_assets
      where organisation_id = p_organisation_id and id = p_entity_id and archived_at is null for update;
    if not found then return jsonb_build_object('not_found', true); end if;
    if v_record.row_version <> p_expected_version then
      return jsonb_build_object('conflict', true, 'current_version', v_record.row_version);
    end if;
  end if;
  v_location_id := case when p_operation = 'archive' then v_record.operating_location_id
    else nullif(p_data->>'operating_location_id', '')::uuid end;
  if not public.ftf_operational_location_allowed(p_organisation_id, p_actor_internal_user_id, v_location_id) then
    return jsonb_build_object('location_forbidden', true);
  end if;
  if p_operation = 'create' then
    insert into public.fleet_assets(
      organisation_id, operating_location_id, asset_type, asset_identifier, registration, vin, serial_number,
      manufacturer, model, manufacture_year, status, notes, source_system, source_record_id, source_digest,
      created_by_internal_user_id, updated_by_internal_user_id
    ) values (
      p_organisation_id, v_location_id, lower(btrim(p_data->>'asset_type')), btrim(p_data->>'asset_identifier'),
      nullif(upper(btrim(p_data->>'registration')), ''), nullif(upper(btrim(p_data->>'vin')), ''),
      nullif(upper(btrim(p_data->>'serial_number')), ''), nullif(btrim(p_data->>'manufacturer'), ''),
      nullif(btrim(p_data->>'model'), ''), nullif(p_data->>'manufacture_year', '')::integer,
      lower(btrim(p_data->>'status')), coalesce(p_data->>'notes', ''),
      nullif(p_data->>'source_system', ''), nullif(p_data->>'source_record_id', ''), nullif(p_data->>'source_digest', ''),
      p_actor_internal_user_id, p_actor_internal_user_id
    ) returning * into v_record;
    insert into public.maintainable_asset_registry(
      organisation_id, fleet_asset_id, created_by_internal_user_id, updated_by_internal_user_id
    ) values (p_organisation_id, v_record.id, p_actor_internal_user_id, p_actor_internal_user_id);
  elsif p_operation = 'update' then
    update public.fleet_assets set
      operating_location_id = v_location_id,
      asset_type = lower(btrim(p_data->>'asset_type')),
      asset_identifier = btrim(p_data->>'asset_identifier'),
      registration = nullif(upper(btrim(p_data->>'registration')), ''),
      vin = nullif(upper(btrim(p_data->>'vin')), ''),
      serial_number = nullif(upper(btrim(p_data->>'serial_number')), ''),
      manufacturer = nullif(btrim(p_data->>'manufacturer'), ''), model = nullif(btrim(p_data->>'model'), ''),
      manufacture_year = nullif(p_data->>'manufacture_year', '')::integer,
      status = lower(btrim(p_data->>'status')), notes = coalesce(p_data->>'notes', ''),
      updated_by_internal_user_id = p_actor_internal_user_id
    where organisation_id = p_organisation_id and id = p_entity_id returning * into v_record;
  else
    perform pg_advisory_xact_lock(hashtextextended('fleet-work-pack:' || p_organisation_id::text, 0));
    if public.ftf_fleet_asset_has_active_work_pack_dependency(p_organisation_id, v_record.id) then
      return jsonb_build_object('archive_conflict', true);
    end if;
    update public.fleet_assets set archived_at = now(), archived_by_internal_user_id = p_actor_internal_user_id,
      updated_by_internal_user_id = p_actor_internal_user_id
    where organisation_id = p_organisation_id and id = p_entity_id returning * into v_record;
    update public.maintainable_asset_registry set tracking_state = 'HISTORY_ONLY', updated_by_internal_user_id = p_actor_internal_user_id
      where organisation_id = p_organisation_id and fleet_asset_id = v_record.id;
  end if;
  insert into public.audit_events(organisation_id, actor_internal_user_id, event_type, entity_type, entity_id, event_payload)
  values (p_organisation_id, p_actor_internal_user_id, 'fleet_asset.' || p_operation, 'fleet_asset', v_record.id,
    jsonb_build_object('version', v_record.row_version, 'assetType', v_record.asset_type, 'operatingLocationId', v_record.operating_location_id));
  insert into public.transactional_outbox(organisation_id, topic, aggregate_type, aggregate_id, payload)
  values (p_organisation_id, 'operational.fleet_asset.' || p_operation, 'fleet_asset', v_record.id,
    jsonb_build_object('version', v_record.row_version, 'assetType', v_record.asset_type, 'operatingLocationId', v_record.operating_location_id));
  return jsonb_build_object('record', to_jsonb(v_record));
exception
  when unique_violation then return jsonb_build_object('identity_conflict', true);
end;
$$;

create function public.ftf_backfill_fleet_assets_from_work_pack(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_operating_location_id uuid,
  p_expected_snapshot_digest text,
  p_apply boolean default false
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_payload jsonb;
  v_assets jsonb;
  v_source_count integer;
  v_ambiguity_count integer;
  v_create_count integer;
  v_asset jsonb;
  v_result jsonb;
  v_current_snapshot_digest text;
  v_source_to_canonical jsonb;
  v_current_templates jsonb;
begin
  if not public.ftf_actor_has_permission(p_organisation_id, p_actor_internal_user_id, 'fleet_assets.create') then
    return jsonb_build_object('forbidden', true);
  end if;
  if not public.ftf_operational_location_allowed(p_organisation_id, p_actor_internal_user_id, p_operating_location_id) then
    return jsonb_build_object('location_forbidden', true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('fleet-work-pack:' || p_organisation_id::text, 0));
  select payload into v_payload from public.ftf_store
    where tenant_id = p_organisation_id and collection = 'ftf_work_packs' and record_id = '__value__'
    for update;
  v_payload := coalesce(v_payload, '{}'::jsonb);
  v_current_snapshot_digest := encode(digest(convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex');
  if p_apply and (p_expected_snapshot_digest is null or v_current_snapshot_digest <> p_expected_snapshot_digest) then
    raise exception 'FLEET_ASSET_BACKFILL_SOURCE_CHANGED' using errcode = '40001';
  end if;
  if not p_apply and p_expected_snapshot_digest is not null
    and v_current_snapshot_digest <> p_expected_snapshot_digest then
    raise exception 'FLEET_ASSET_BACKFILL_SOURCE_CHANGED' using errcode = '40001';
  end if;
  v_assets := case when jsonb_typeof(v_payload->'assets') = 'array' then v_payload->'assets'
    when jsonb_typeof(v_payload->'trucks') = 'array' then (
      select coalesce(jsonb_agg(item || jsonb_build_object('assetType', 'truck')), '[]'::jsonb)
      from jsonb_array_elements(v_payload->'trucks') item
    ) else '[]'::jsonb end;
  v_source_count := jsonb_array_length(v_assets);
  select count(*) into v_ambiguity_count from (
    select upper(regexp_replace(btrim(item->>'registration'), '[^A-Z0-9]', '', 'g')) identity_value
    from jsonb_array_elements(v_assets) item
    where nullif(btrim(item->>'registration'), '') is not null group by 1 having count(*) > 1
    union all
    select upper(regexp_replace(btrim(item->>'vin'), '[^A-Z0-9]', '', 'g'))
    from jsonb_array_elements(v_assets) item
    where nullif(btrim(item->>'vin'), '') is not null group by 1 having count(*) > 1
  ) ambiguity;
  if v_ambiguity_count > 0 then
    raise exception 'AMBIGUOUS_FLEET_ASSET_SOURCE' using errcode = '22023';
  end if;
  select count(*) into v_create_count from jsonb_array_elements(v_assets) item
  where not exists (
    select 1 from public.fleet_assets asset where asset.organisation_id = p_organisation_id
      and asset.source_system = 'ftf_work_packs' and asset.source_record_id = item->>'id'
  );
  if not p_apply then
    return jsonb_build_object('applied', false, 'sourceCount', v_source_count, 'createCount', v_create_count,
      'ambiguityCount', 0, 'snapshotDigest', v_current_snapshot_digest);
  end if;
  for v_asset in select value from jsonb_array_elements(v_assets) loop
    if not exists (select 1 from public.fleet_assets asset where asset.organisation_id = p_organisation_id
      and asset.source_system = 'ftf_work_packs' and asset.source_record_id = v_asset->>'id') then
      v_result := public.ftf_write_operational_resource(p_organisation_id, p_actor_internal_user_id, 'fleet-assets', 'create', null, null,
        jsonb_build_object(
          'operating_location_id', p_operating_location_id, 'asset_type', lower(coalesce(v_asset->>'assetType', 'truck')),
          'asset_identifier', coalesce(nullif(btrim(v_asset->>'name'), ''), nullif(btrim(v_asset->>'registration'), ''), v_asset->>'id'),
          'registration', nullif(btrim(v_asset->>'registration'), ''), 'vin', nullif(btrim(v_asset->>'vin'), ''),
          'serial_number', nullif(btrim(v_asset->>'serialNumber'), ''), 'manufacturer', nullif(btrim(v_asset->>'manufacturer'), ''),
          'model', nullif(btrim(v_asset->>'model'), ''), 'manufacture_year', v_asset->>'year',
          'status', coalesce(v_asset->>'status', 'available'), 'notes', coalesce(v_asset->>'operationalNotes', ''),
          'source_system', 'ftf_work_packs', 'source_record_id', v_asset->>'id',
          'source_digest', encode(digest(convert_to(v_asset::text, 'UTF8'), 'sha256'), 'hex')
        ));
      if coalesce((v_result->>'identity_conflict')::boolean, false) then
        raise exception 'AMBIGUOUS_FLEET_ASSET_MATCH' using errcode = '22023';
      end if;
    end if;
  end loop;
  select coalesce(jsonb_object_agg(asset.source_record_id, asset.id::text), '{}'::jsonb)
    into v_source_to_canonical
    from public.fleet_assets asset
   where asset.organisation_id = p_organisation_id
     and asset.source_system = 'ftf_work_packs'
     and asset.source_record_id is not null
     and asset.archived_at is null;
  if jsonb_typeof(v_payload->'templates') = 'array' then
    select coalesce(jsonb_agg(
      template || jsonb_build_object(
        'assetIds', case when jsonb_typeof(template->'assetIds') = 'array' then (
          select coalesce(jsonb_agg(to_jsonb(coalesce(v_source_to_canonical->>source_id, source_id))), '[]'::jsonb)
          from jsonb_array_elements_text(template->'assetIds') as source_ids(source_id)
        ) else '[]'::jsonb end,
        'truckId', coalesce(v_source_to_canonical->>(template->>'truckId'), template->>'truckId', '')
      )
    ), '[]'::jsonb) into v_current_templates
    from jsonb_array_elements(v_payload->'templates') template;
    update public.ftf_store
       set payload = jsonb_set(payload, '{templates}', v_current_templates, true), updated_at = now()
     where tenant_id = p_organisation_id and collection = 'ftf_work_packs' and record_id = '__value__';
  end if;
  return jsonb_build_object('applied', true, 'sourceCount', v_source_count, 'createCount', v_create_count,
    'ambiguityCount', 0, 'snapshotDigest', v_current_snapshot_digest);
end;
$$;

revoke all on function public.ftf_provision_fleet_asset_admin_permissions() from public, anon, authenticated, service_role;
revoke all on function public.ftf_guard_current_work_pack_fleet_references() from public, anon, authenticated, service_role;
revoke all on function public.ftf_fleet_asset_has_active_work_pack_dependency(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ftf_fleet_asset_has_active_work_pack_dependency(uuid, uuid) to service_role;
revoke all on function public.ftf_write_operational_resource_before_fleet_assets(uuid, uuid, text, text, uuid, integer, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.ftf_write_operational_resource(uuid, uuid, text, text, uuid, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.ftf_write_operational_resource(uuid, uuid, text, text, uuid, integer, jsonb) to service_role;
revoke all on function public.ftf_backfill_fleet_assets_from_work_pack(uuid, uuid, uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.ftf_backfill_fleet_assets_from_work_pack(uuid, uuid, uuid, text, boolean) to service_role;
