-- Authoritative maintainable-asset relationships, meters, systems and component positions.

create table public.asset_attachment_periods (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null,
  parent_asset_id uuid not null, child_asset_id uuid not null, position_label text not null,
  attached_at timestamptz not null, detached_at timestamptz,
  attached_by_internal_user_id uuid not null, detached_by_internal_user_id uuid,
  attach_parent_meter_snapshot jsonb, detach_parent_meter_snapshot jsonb,
  row_version integer not null default 1 check (row_version > 0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organisation_id, id),
  foreign key (organisation_id, parent_asset_id) references public.maintainable_asset_registry(organisation_id, id),
  foreign key (organisation_id, child_asset_id) references public.maintainable_asset_registry(organisation_id, id),
  foreign key (organisation_id, attached_by_internal_user_id) references public.internal_users(organisation_id, id),
  foreign key (organisation_id, detached_by_internal_user_id) references public.internal_users(organisation_id, id),
  check (parent_asset_id <> child_asset_id), check (detached_at is null or detached_at >= attached_at)
);
create unique index asset_attachment_periods_one_active_parent on public.asset_attachment_periods(child_asset_id) where detached_at is null;
create index asset_attachment_periods_parent_history on public.asset_attachment_periods(organisation_id, parent_asset_id, attached_at desc);

create function public.ftf_guard_asset_attachment_period() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_parent_org uuid; v_child_org uuid; v_cycle boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('asset-attachment:' || new.organisation_id::text, 0));
  select organisation_id into v_parent_org from public.maintainable_asset_registry where id=new.parent_asset_id for update;
  select organisation_id into v_child_org from public.maintainable_asset_registry where id=new.child_asset_id for update;
  if v_parent_org is distinct from new.organisation_id or v_child_org is distinct from new.organisation_id then
    raise exception 'ATTACHMENT_ORGANISATION_MISMATCH' using errcode='23503';
  end if;
  if new.detached_at is null then
    with recursive ancestors(asset_id) as (
      select new.parent_asset_id union all
      select period.parent_asset_id from public.asset_attachment_periods period join ancestors on period.child_asset_id=ancestors.asset_id
       where period.organisation_id=new.organisation_id and period.detached_at is null
    ) select exists(select 1 from ancestors where asset_id=new.child_asset_id) into v_cycle;
    if v_cycle then raise exception 'ATTACHMENT_CYCLE' using errcode='23514'; end if;
  end if;
  if exists(select 1 from public.asset_attachment_periods period where period.organisation_id=new.organisation_id
    and period.child_asset_id=new.child_asset_id and period.id<>new.id
    and tstzrange(period.attached_at,period.detached_at,'[)') && tstzrange(new.attached_at,new.detached_at,'[)')) then
    raise exception 'ATTACHMENT_PERIOD_OVERLAP' using errcode='23P01';
  end if;
  return new;
end; $$;
create trigger asset_attachment_periods_guard before insert or update on public.asset_attachment_periods for each row execute function public.ftf_guard_asset_attachment_period();

create table public.asset_meter_definitions (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, maintainable_asset_id uuid not null,
  meter_type text not null check (meter_type in ('odometer', 'engine_hours', 'flight_hours', 'cycles', 'missions', 'area', 'custom')),
  name text not null, unit text not null, precision_scale integer not null default 1 check (precision_scale between 0 and 6),
  monotonic boolean not null default true, source_policy text not null check (source_policy in ('MANUAL', 'MISSION_DERIVED', 'MIXED')),
  created_by_internal_user_id uuid not null, archived_at timestamptz, row_version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organisation_id,id),
  unique(organisation_id, maintainable_asset_id, name),
  foreign key (organisation_id, maintainable_asset_id) references public.maintainable_asset_registry(organisation_id,id),
  foreign key (organisation_id, created_by_internal_user_id) references public.internal_users(organisation_id,id)
);
create table public.asset_meter_readings (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, meter_definition_id uuid not null,
  recorded_at timestamptz not null, value numeric(20,6) not null check(value >= 0), source text not null check(source in ('MANUAL','MISSION','IMPORT','CORRECTION')),
  source_system text not null, source_record_id text not null, evidence jsonb not null default '{}'::jsonb,
  recorded_by_internal_user_id uuid not null, supersedes_reading_id uuid, correction_reason text,
  created_at timestamptz not null default now(), unique(organisation_id,id),
  unique (organisation_id, meter_definition_id, source_system, source_record_id),
  foreign key (organisation_id,meter_definition_id) references public.asset_meter_definitions(organisation_id,id),
  foreign key (organisation_id,recorded_by_internal_user_id) references public.internal_users(organisation_id,id),
  foreign key (organisation_id,supersedes_reading_id) references public.asset_meter_readings(organisation_id,id),
  check ((supersedes_reading_id is null and source <> 'CORRECTION') or (supersedes_reading_id is not null and source='CORRECTION' and length(btrim(correction_reason)) > 0))
);
create function public.ftf_reject_meter_reading_mutation() returns trigger language plpgsql as $$
begin raise exception 'METER_READING_IMMUTABLE' using errcode='55000'; end; $$;
create trigger asset_meter_readings_immutable before update or delete on public.asset_meter_readings for each row execute function public.ftf_reject_meter_reading_mutation();

create table public.asset_systems (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, maintainable_asset_id uuid,
  parent_system_id uuid, system_code text not null, name text not null, model_scope text,
  authority text not null default 'ORGANISATION' check(authority in ('MANUFACTURER','ORGANISATION')),
  created_by_internal_user_id uuid not null, archived_at timestamptz, row_version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organisation_id,id),
  unique(organisation_id,maintainable_asset_id,system_code),
  foreign key(organisation_id,maintainable_asset_id) references public.maintainable_asset_registry(organisation_id,id),
  foreign key(organisation_id,parent_system_id) references public.asset_systems(organisation_id,id),
  foreign key(organisation_id,created_by_internal_user_id) references public.internal_users(organisation_id,id)
);
create function public.ftf_guard_asset_system_hierarchy() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_cycle boolean; v_parent public.asset_systems%rowtype;
begin
  if new.parent_system_id is null then return new; end if;
  select * into v_parent from public.asset_systems where organisation_id=new.organisation_id and id=new.parent_system_id for update;
  if not found or v_parent.archived_at is not null or v_parent.maintainable_asset_id is distinct from new.maintainable_asset_id or v_parent.model_scope is distinct from new.model_scope then
    raise exception 'SYSTEM_HIERARCHY_SCOPE_MISMATCH' using errcode='23514';
  end if;
  with recursive ancestors(id) as (select new.parent_system_id union all select s.parent_system_id from public.asset_systems s join ancestors a on s.id=a.id where s.parent_system_id is not null)
  select exists(select 1 from ancestors where id=new.id) into v_cycle;
  if v_cycle then raise exception 'SYSTEM_HIERARCHY_CYCLE' using errcode='23514'; end if;
  return new;
end; $$;
create trigger asset_systems_guard before insert or update on public.asset_systems for each row execute function public.ftf_guard_asset_system_hierarchy();

create table public.component_positions (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, system_id uuid not null,
  position_code text not null, name text not null, model_scope text, required boolean not null default false,
  created_by_internal_user_id uuid not null, archived_at timestamptz, row_version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organisation_id,id),
  unique(organisation_id,system_id,position_code), foreign key(organisation_id,system_id) references public.asset_systems(organisation_id,id),
  foreign key(organisation_id,created_by_internal_user_id) references public.internal_users(organisation_id,id)
);

alter table public.asset_attachment_periods enable row level security;
alter table public.asset_attachment_periods force row level security;
revoke all on table public.asset_attachment_periods from public, anon, authenticated;
grant select on table public.asset_attachment_periods to service_role;
alter table public.asset_meter_definitions enable row level security;
alter table public.asset_meter_definitions force row level security;
revoke all on table public.asset_meter_definitions from public, anon, authenticated;
grant select on table public.asset_meter_definitions to service_role;
alter table public.asset_meter_readings enable row level security;
alter table public.asset_meter_readings force row level security;
revoke all on table public.asset_meter_readings from public, anon, authenticated;
grant select on table public.asset_meter_readings to service_role;
alter table public.asset_systems enable row level security;
alter table public.asset_systems force row level security;
revoke all on table public.asset_systems from public, anon, authenticated;
grant select on table public.asset_systems to service_role;
alter table public.component_positions enable row level security;
alter table public.component_positions force row level security;
revoke all on table public.component_positions from public, anon, authenticated;
grant select on table public.component_positions to service_role;

create function public.ftf_provision_asset_maintenance_permissions() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.code <> 'admin' then return new; end if;
  insert into public.permissions(organisation_id,code,description) select new.organisation_id,* from (values
    ('asset_attachments.manage','Manage asset attachments'),('asset_meters.read','View asset meters'),
    ('asset_meters.manage','Manage asset meters'),('asset_systems.manage','Manage asset systems and positions')) p(code,description)
    on conflict(organisation_id,code) do nothing;
  insert into public.role_permissions(organisation_id,role_id,permission_id) select new.organisation_id,new.id,p.id from public.permissions p
    where p.organisation_id=new.organisation_id and p.code in ('asset_attachments.manage','asset_meters.read','asset_meters.manage','asset_systems.manage')
    on conflict do nothing; return new;
end; $$;
create trigger roles_provision_asset_maintenance_permissions after insert on public.roles for each row execute function public.ftf_provision_asset_maintenance_permissions();
insert into public.permissions(organisation_id,code,description) select o.id,p.code,p.description from public.organisations o cross join (values
 ('asset_attachments.manage','Manage asset attachments'),('asset_meters.read','View asset meters'),('asset_meters.manage','Manage asset meters'),('asset_systems.manage','Manage asset systems and positions')) p(code,description)
 where o.archived_at is null on conflict(organisation_id,code) do nothing;
insert into public.role_permissions(organisation_id,role_id,permission_id) select r.organisation_id,r.id,p.id from public.roles r join public.permissions p on p.organisation_id=r.organisation_id
 where r.code='admin' and r.archived_at is null and p.code in ('asset_attachments.manage','asset_meters.read','asset_meters.manage','asset_systems.manage') on conflict do nothing;

create function public.ftf_maintenance_asset_location_allowed(p_organisation_id uuid,p_actor_internal_user_id uuid,p_asset_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce((
    select public.ftf_operational_location_allowed(p_organisation_id,p_actor_internal_user_id,
      coalesce(aircraft.operating_location_id,equipment.operating_location_id,fleet.operating_location_id))
    from public.maintainable_asset_registry registry
    left join public.aircraft aircraft on aircraft.organisation_id=registry.organisation_id and aircraft.id=registry.aircraft_id and aircraft.archived_at is null
    left join public.equipment_kits equipment on equipment.organisation_id=registry.organisation_id and equipment.id=registry.equipment_kit_id and equipment.archived_at is null
    left join public.fleet_assets fleet on fleet.organisation_id=registry.organisation_id and fleet.id=registry.fleet_asset_id and fleet.archived_at is null
    where registry.organisation_id=p_organisation_id and registry.id=p_asset_id and registry.tracking_state='ACTIVE'
  ),false);
$$;

create view public.aircraft_maintenance_meter_compatibility as
select aircraft.organisation_id,aircraft.id aircraft_id,registry.id maintainable_asset_id,
  coalesce((select reading.value from public.asset_meter_definitions meter join public.asset_meter_readings reading on reading.organisation_id=meter.organisation_id and reading.meter_definition_id=meter.id
    where meter.organisation_id=aircraft.organisation_id and meter.maintainable_asset_id=registry.id and meter.meter_type='flight_hours'
      and not exists(select 1 from public.asset_meter_readings correction where correction.supersedes_reading_id=reading.id)
    order by reading.recorded_at desc,reading.created_at desc limit 1),aircraft.total_flight_hours) total_flight_hours,
  case when exists(select 1 from public.asset_meter_definitions meter where meter.organisation_id=aircraft.organisation_id and meter.maintainable_asset_id=registry.id and meter.meter_type='flight_hours') then 'AUTHORITATIVE_METER' else 'AIRCRAFT_COMPATIBILITY' end authority_source
from public.aircraft aircraft join public.maintainable_asset_registry registry on registry.organisation_id=aircraft.organisation_id and registry.aircraft_id=aircraft.id
where aircraft.archived_at is null;
revoke all on public.aircraft_maintenance_meter_compatibility from public,anon,authenticated;
grant select on public.aircraft_maintenance_meter_compatibility to service_role;

create function public.ftf_read_asset_maintenance_workspace(p_organisation_id uuid,p_actor_internal_user_id uuid,p_asset_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_meter_ids uuid[]; v_system_ids uuid[];
begin
  if not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'asset_meters.read') then return jsonb_build_object('forbidden',true); end if;
  if not public.ftf_maintenance_asset_location_allowed(p_organisation_id,p_actor_internal_user_id,p_asset_id) then return jsonb_build_object('not_found',true); end if;
  select coalesce(array_agg(id),array[]::uuid[]) into v_meter_ids from public.asset_meter_definitions where organisation_id=p_organisation_id and maintainable_asset_id=p_asset_id and archived_at is null;
  select coalesce(array_agg(id),array[]::uuid[]) into v_system_ids from public.asset_systems where organisation_id=p_organisation_id and maintainable_asset_id=p_asset_id and archived_at is null;
  return jsonb_build_object(
    'attachments',(select coalesce(jsonb_agg(to_jsonb(period) order by attached_at desc),'[]'::jsonb) from public.asset_attachment_periods period where organisation_id=p_organisation_id and (parent_asset_id=p_asset_id or child_asset_id=p_asset_id)),
    'meters',(select coalesce(jsonb_agg(to_jsonb(meter)),'[]'::jsonb) from public.asset_meter_definitions meter where meter.id=any(v_meter_ids)),
    'readings',(select coalesce(jsonb_agg(to_jsonb(reading) order by recorded_at desc),'[]'::jsonb) from public.asset_meter_readings reading where reading.meter_definition_id=any(v_meter_ids)),
    'systems',(select coalesce(jsonb_agg(to_jsonb(system)),'[]'::jsonb) from public.asset_systems system where system.id=any(v_system_ids)),
    'positions',(select coalesce(jsonb_agg(to_jsonb(position)),'[]'::jsonb) from public.component_positions position where position.system_id=any(v_system_ids) and position.archived_at is null));
end; $$;

create function public.ftf_write_asset_maintenance_command(p_organisation_id uuid,p_actor_internal_user_id uuid,p_command text,p_entity_id uuid default null,p_expected_version integer default null,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_record jsonb; v_last numeric; v_meter public.asset_meter_definitions%rowtype; v_existing public.asset_meter_readings%rowtype; v_attachment public.asset_attachment_periods%rowtype;
begin
  perform public.ftf_lock_active_organisation(p_organisation_id);
  if not public.ftf_actor_has_active_beta_seat(p_organisation_id,p_actor_internal_user_id) then raise exception 'active organisation actor seat required' using errcode='42501'; end if;
  if p_command in ('attach','detach') and not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'asset_attachments.manage') then return jsonb_build_object('forbidden',true); end if;
  if p_command in ('record_reading','correct_reading') and not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'asset_meters.manage') then return jsonb_build_object('forbidden',true); end if;
  if p_command='attach' then
    if not public.ftf_maintenance_asset_location_allowed(p_organisation_id,p_actor_internal_user_id,(p_data->>'parent_asset_id')::uuid)
      or not public.ftf_maintenance_asset_location_allowed(p_organisation_id,p_actor_internal_user_id,(p_data->>'child_asset_id')::uuid) then return jsonb_build_object('location_forbidden',true); end if;
    insert into public.asset_attachment_periods(organisation_id,parent_asset_id,child_asset_id,position_label,attached_at,attached_by_internal_user_id,attach_parent_meter_snapshot)
    values(p_organisation_id,(p_data->>'parent_asset_id')::uuid,(p_data->>'child_asset_id')::uuid,btrim(p_data->>'position_label'),(p_data->>'attached_at')::timestamptz,p_actor_internal_user_id,p_data->'meter_snapshot') returning to_jsonb(asset_attachment_periods.*) into v_record;
  elsif p_command='detach' then
    select * into v_attachment from public.asset_attachment_periods where organisation_id=p_organisation_id and id=p_entity_id and detached_at is null for update;
    if not found then return jsonb_build_object('not_found',true); end if;
    if v_attachment.row_version<>p_expected_version then return jsonb_build_object('conflict',true,'current_version',v_attachment.row_version); end if;
    if not public.ftf_maintenance_asset_location_allowed(p_organisation_id,p_actor_internal_user_id,v_attachment.parent_asset_id)
      or not public.ftf_maintenance_asset_location_allowed(p_organisation_id,p_actor_internal_user_id,v_attachment.child_asset_id) then return jsonb_build_object('location_forbidden',true); end if;
    update public.asset_attachment_periods set detached_at=(p_data->>'detached_at')::timestamptz,detached_by_internal_user_id=p_actor_internal_user_id,
      detach_parent_meter_snapshot=p_data->'meter_snapshot',row_version=row_version+1,updated_at=now()
    where organisation_id=p_organisation_id and id=p_entity_id returning to_jsonb(asset_attachment_periods.*) into v_record;
  elsif p_command in ('record_reading','correct_reading') then
    select * into v_meter from public.asset_meter_definitions where organisation_id=p_organisation_id and id=(p_data->>'meter_definition_id')::uuid and archived_at is null for update;
    if not found then return jsonb_build_object('not_found',true); end if;
    if not public.ftf_maintenance_asset_location_allowed(p_organisation_id,p_actor_internal_user_id,v_meter.maintainable_asset_id) then return jsonb_build_object('location_forbidden',true); end if;
    if p_command='record_reading' and ((v_meter.source_policy='MANUAL' and upper(coalesce(p_data->>'source',''))<>'MANUAL') or (v_meter.source_policy='MISSION_DERIVED' and upper(coalesce(p_data->>'source',''))<>'MISSION')) then raise exception 'METER_SOURCE_NOT_ALLOWED' using errcode='22023'; end if;
    select * into v_existing from public.asset_meter_readings where organisation_id=p_organisation_id and meter_definition_id=v_meter.id and source_system=p_data->>'source_system' and source_record_id=p_data->>'source_record_id';
    if found then return jsonb_build_object('record',to_jsonb(v_existing),'idempotent',true); end if;
    select r.value into v_last from public.asset_meter_readings r where r.organisation_id=p_organisation_id and r.meter_definition_id=v_meter.id and not exists(select 1 from public.asset_meter_readings c where c.supersedes_reading_id=r.id) order by r.recorded_at desc,r.created_at desc limit 1;
    if v_meter.monotonic and p_command='record_reading' and v_last is not null and (p_data->>'value')::numeric < v_last then raise exception 'METER_VALUE_REQUIRES_CORRECTION' using errcode='22023'; end if;
    if p_command='correct_reading' and not exists(select 1 from public.asset_meter_readings target where target.organisation_id=p_organisation_id and target.id=(p_data->>'supersedes_reading_id')::uuid and target.meter_definition_id=v_meter.id and not exists(select 1 from public.asset_meter_readings prior where prior.supersedes_reading_id=target.id)) then raise exception 'METER_CORRECTION_TARGET_INVALID' using errcode='22023'; end if;
    insert into public.asset_meter_readings(organisation_id,meter_definition_id,recorded_at,value,source,source_system,source_record_id,evidence,recorded_by_internal_user_id,supersedes_reading_id,correction_reason)
    values(p_organisation_id,v_meter.id,(p_data->>'recorded_at')::timestamptz,(p_data->>'value')::numeric,case when p_command='correct_reading' then 'CORRECTION' else upper(p_data->>'source') end,
      p_data->>'source_system',p_data->>'source_record_id',coalesce(p_data->'evidence','{}'::jsonb),p_actor_internal_user_id,case when p_command='correct_reading' then (p_data->>'supersedes_reading_id')::uuid end,p_data->>'correction_reason') returning to_jsonb(asset_meter_readings.*) into v_record;
  else raise exception 'unsupported asset maintenance command' using errcode='22023'; end if;
  if v_record is null then return jsonb_build_object('not_found',true); end if;
  insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload) values(p_organisation_id,p_actor_internal_user_id,'asset_maintenance.'||p_command,'maintainable_asset',coalesce(p_entity_id,(v_record->>'id')::uuid),jsonb_build_object('command',p_command));
  insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload) values(p_organisation_id,'operational.asset_maintenance.'||p_command,'maintainable_asset',coalesce(p_entity_id,(v_record->>'id')::uuid),jsonb_build_object('command',p_command));
  return jsonb_build_object('record',v_record);
exception when unique_violation then return jsonb_build_object('relationship_conflict',true); end; $$;

revoke all on function public.ftf_guard_asset_attachment_period() from public,anon,authenticated,service_role;
revoke all on function public.ftf_reject_meter_reading_mutation() from public,anon,authenticated,service_role;
revoke all on function public.ftf_guard_asset_system_hierarchy() from public,anon,authenticated,service_role;
revoke all on function public.ftf_provision_asset_maintenance_permissions() from public,anon,authenticated,service_role;
revoke all on function public.ftf_maintenance_asset_location_allowed(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.ftf_maintenance_asset_location_allowed(uuid,uuid,uuid) to service_role;
revoke all on function public.ftf_read_asset_maintenance_workspace(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.ftf_read_asset_maintenance_workspace(uuid,uuid,uuid) to service_role;
revoke all on function public.ftf_write_asset_maintenance_command(uuid,uuid,text,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.ftf_write_asset_maintenance_command(uuid,uuid,text,uuid,integer,jsonb) to service_role;
