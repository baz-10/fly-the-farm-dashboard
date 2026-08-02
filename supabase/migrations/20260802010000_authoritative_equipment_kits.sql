-- Authoritative Equipment Kit aggregate and mission-readiness relationships.

create table public.equipment_kits (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  operating_location_id uuid not null,
  name text not null check (length(btrim(name)) > 0),
  kit_type text not null check (length(btrim(kit_type)) > 0),
  description text not null default '',
  status text not null check (status in ('available', 'assigned', 'maintenance', 'calibration', 'unavailable')),
  specifications jsonb not null default '{}'::jsonb check (jsonb_typeof(specifications) = 'object'),
  components jsonb not null default '[]'::jsonb check (jsonb_typeof(components) = 'array'),
  operational_data jsonb not null default '{}'::jsonb check (jsonb_typeof(operational_data) = 'object'),
  financial_data jsonb not null default '{}'::jsonb check (jsonb_typeof(financial_data) = 'object'),
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
  foreign key (organisation_id, archived_by_internal_user_id) references public.internal_users (organisation_id, id)
);

create unique index equipment_kits_active_name_unique
  on public.equipment_kits (organisation_id, operating_location_id, lower(name)) where archived_at is null;
create unique index equipment_kits_source_record_unique
  on public.equipment_kits (organisation_id, source_system, source_record_id)
  where source_system is not null and source_record_id is not null;
create index equipment_kits_location_status_idx
  on public.equipment_kits (organisation_id, operating_location_id, status) where archived_at is null;

create table public.equipment_kit_aircraft_compatibility (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  operating_location_id uuid not null,
  equipment_kit_id uuid not null,
  aircraft_id uuid not null,
  created_by_internal_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (organisation_id, equipment_kit_id, aircraft_id),
  foreign key (organisation_id, equipment_kit_id) references public.equipment_kits (organisation_id, id),
  foreign key (organisation_id, aircraft_id) references public.aircraft (organisation_id, id),
  foreign key (organisation_id, operating_location_id) references public.operating_locations (organisation_id, id),
  foreign key (organisation_id, created_by_internal_user_id) references public.internal_users (organisation_id, id)
);

create table public.aircraft_equipment_kit_assignments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  operating_location_id uuid not null,
  aircraft_id uuid not null,
  equipment_kit_id uuid not null,
  configuration_name text not null check (length(btrim(configuration_name)) > 0),
  configuration_data jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration_data)='object'),
  assigned_by_internal_user_id uuid not null,
  unassigned_by_internal_user_id uuid,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz,
  archived_at timestamptz,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, id),
  foreign key (organisation_id, aircraft_id) references public.aircraft (organisation_id, id),
  foreign key (organisation_id, equipment_kit_id) references public.equipment_kits (organisation_id, id),
  foreign key (organisation_id, operating_location_id) references public.operating_locations (organisation_id, id),
  foreign key (organisation_id, assigned_by_internal_user_id) references public.internal_users (organisation_id, id),
  foreign key (organisation_id, unassigned_by_internal_user_id) references public.internal_users (organisation_id, id),
  check ((unassigned_at is null) = (unassigned_by_internal_user_id is null))
);

create unique index aircraft_equipment_active_kit_unique
  on public.aircraft_equipment_kit_assignments (organisation_id, equipment_kit_id)
  where unassigned_at is null and archived_at is null;
create index aircraft_equipment_active_aircraft_idx
  on public.aircraft_equipment_kit_assignments (organisation_id, operating_location_id, aircraft_id)
  where unassigned_at is null and archived_at is null;

create trigger equipment_kits_set_update_metadata before update on public.equipment_kits
for each row execute function public.set_tenant_row_update_metadata();
create trigger aircraft_equipment_assignments_set_update_metadata before update on public.aircraft_equipment_kit_assignments
for each row execute function public.set_tenant_row_update_metadata();

alter table public.equipment_kits enable row level security;
alter table public.equipment_kits force row level security;
alter table public.equipment_kit_aircraft_compatibility enable row level security;
alter table public.equipment_kit_aircraft_compatibility force row level security;
alter table public.aircraft_equipment_kit_assignments enable row level security;
alter table public.aircraft_equipment_kit_assignments force row level security;
revoke all on table public.equipment_kits, public.equipment_kit_aircraft_compatibility,
  public.aircraft_equipment_kit_assignments from public, anon, authenticated;
grant select, insert, update, delete on table public.equipment_kits,
  public.equipment_kit_aircraft_compatibility, public.aircraft_equipment_kit_assignments to service_role;

create function public.ftf_validate_equipment_relationships()
returns trigger language plpgsql set search_path = public as $$
declare v_kit_location uuid; v_aircraft_location uuid;
begin
  select operating_location_id into v_kit_location from public.equipment_kits
    where organisation_id = new.organisation_id and id = new.equipment_kit_id and archived_at is null;
  select operating_location_id into v_aircraft_location from public.aircraft
    where organisation_id = new.organisation_id and id = new.aircraft_id and archived_at is null;
  if v_kit_location is null or v_aircraft_location is null or v_kit_location <> new.operating_location_id
     or v_aircraft_location <> new.operating_location_id then
    raise exception 'equipment relationship must use active resources in the same operating location' using errcode='23514';
  end if;
  return new;
end; $$;

create trigger equipment_compatibility_validate before insert or update on public.equipment_kit_aircraft_compatibility
for each row execute function public.ftf_validate_equipment_relationships();
create trigger aircraft_equipment_assignment_validate before insert or update of organisation_id, operating_location_id, aircraft_id, equipment_kit_id
on public.aircraft_equipment_kit_assignments for each row execute function public.ftf_validate_equipment_relationships();

create function public.ftf_provision_equipment_kit_admin_permissions()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.code <> 'admin' then return new; end if;
  insert into public.permissions (organisation_id, code, description)
  select new.organisation_id, code, description from (values
    ('equipment_kits.read','View equipment kits'),('equipment_kits.create','Create equipment kits'),
    ('equipment_kits.update','Update equipment kits'),('equipment_kits.archive','Archive equipment kits'),
    ('equipment_kits.assign','Manage aircraft compatibility and assignments')
  ) v(code,description) on conflict (organisation_id,code) do nothing;
  insert into public.role_permissions (organisation_id,role_id,permission_id)
  select new.organisation_id,new.id,p.id from public.permissions p
    where p.organisation_id=new.organisation_id and p.code like 'equipment_kits.%'
  on conflict (organisation_id,role_id,permission_id) do nothing;
  return new;
end; $$;

create trigger roles_provision_equipment_kit_admin_permissions after insert on public.roles
for each row execute function public.ftf_provision_equipment_kit_admin_permissions();

insert into public.permissions (organisation_id,code,description)
select o.id,v.code,v.description from public.organisations o cross join (values
  ('equipment_kits.read','View equipment kits'),('equipment_kits.create','Create equipment kits'),
  ('equipment_kits.update','Update equipment kits'),('equipment_kits.archive','Archive equipment kits'),
  ('equipment_kits.assign','Manage aircraft compatibility and assignments')) v(code,description)
where o.archived_at is null on conflict (organisation_id,code) do nothing;
insert into public.role_permissions (organisation_id,role_id,permission_id)
select r.organisation_id,r.id,p.id from public.roles r join public.permissions p
  on p.organisation_id=r.organisation_id and p.code like 'equipment_kits.%'
where r.code='admin' and r.archived_at is null on conflict (organisation_id,role_id,permission_id) do nothing;

alter function public.ftf_write_operational_resource(uuid,uuid,text,text,uuid,integer,jsonb)
  rename to ftf_write_operational_resource_before_equipment_kits;

create function public.ftf_write_operational_resource(
  p_organisation_id uuid, p_actor_internal_user_id uuid, p_resource text, p_operation text,
  p_entity_id uuid default null, p_expected_version integer default null, p_data jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_record public.equipment_kits%rowtype; v_location_id uuid; v_aircraft_id uuid;
  v_assignment public.aircraft_equipment_kit_assignments%rowtype; v_compatibility jsonb;
  v_aircraft_ids jsonb; v_active_assignment jsonb;
begin
  if p_resource <> 'equipment-kits' then
    return public.ftf_write_operational_resource_before_equipment_kits(p_organisation_id,p_actor_internal_user_id,
      p_resource,p_operation,p_entity_id,p_expected_version,p_data);
  end if;
  perform pg_advisory_xact_lock(hashtext(p_organisation_id::text)::bigint);
  perform public.ftf_lock_active_organisation(p_organisation_id);
  if not public.ftf_actor_has_active_beta_seat(p_organisation_id,p_actor_internal_user_id) then
    raise exception 'active organisation actor seat required' using errcode='42501';
  end if;
  if p_operation not in ('create','update','archive','assign','unassign') then
    raise exception 'unsupported equipment kit operation' using errcode='22023';
  end if;
  if p_operation in ('update','archive','assign') then
    select * into v_record from public.equipment_kits where organisation_id=p_organisation_id
      and id=p_entity_id and archived_at is null for update;
    if not found then return jsonb_build_object('not_found',true); end if;
  end if;
  if p_operation='unassign' then
    select * into v_assignment from public.aircraft_equipment_kit_assignments
      where organisation_id=p_organisation_id and id=p_entity_id and unassigned_at is null and archived_at is null for update;
    if not found then return jsonb_build_object('not_found',true); end if;
    v_location_id:=v_assignment.operating_location_id;
  elsif p_operation='create' or p_operation='update' then
    begin v_location_id:=(p_data->>'operating_location_id')::uuid;
    exception when others then return jsonb_build_object('relationship_conflict',true); end;
  else v_location_id:=v_record.operating_location_id;
  end if;
  if not exists (select 1 from public.membership_operating_location_assignments a
    join public.memberships m on m.organisation_id=a.organisation_id and m.id=a.membership_id
    where a.organisation_id=p_organisation_id and a.operating_location_id=v_location_id and a.is_active
      and a.archived_at is null and m.internal_user_id=p_actor_internal_user_id and m.is_active and m.archived_at is null)
    then return jsonb_build_object('location_forbidden',true); end if;

  if p_operation='create' then
    insert into public.equipment_kits (organisation_id,operating_location_id,name,kit_type,description,status,
      specifications,components,operational_data,financial_data,notes,source_system,source_record_id,
      created_by_internal_user_id,updated_by_internal_user_id)
    values (p_organisation_id,v_location_id,btrim(p_data->>'name'),btrim(p_data->>'kit_type'),coalesce(p_data->>'description',''),
      p_data->>'status',coalesce(p_data->'specifications','{}'),coalesce(p_data->'components','[]'),
      coalesce(p_data->'operational_data','{}'),coalesce(p_data->'financial_data','{}'),coalesce(p_data->>'notes',''),
      nullif(p_data->>'source_system',''),nullif(p_data->>'source_record_id',''),p_actor_internal_user_id,p_actor_internal_user_id)
    returning * into v_record;
  elsif p_operation='update' then
    if v_record.row_version<>p_expected_version then return jsonb_build_object('conflict',true,'current_version',v_record.row_version); end if;
    update public.equipment_kits set operating_location_id=v_location_id,name=btrim(p_data->>'name'),kit_type=btrim(p_data->>'kit_type'),
      description=coalesce(p_data->>'description',''),status=p_data->>'status',specifications=coalesce(p_data->'specifications','{}'),
      components=coalesce(p_data->'components','[]'),operational_data=coalesce(p_data->'operational_data','{}'),
      financial_data=coalesce(p_data->'financial_data','{}'),notes=coalesce(p_data->>'notes',''),updated_by_internal_user_id=p_actor_internal_user_id
      where organisation_id=p_organisation_id and id=p_entity_id returning * into v_record;
  elsif p_operation='archive' then
    if v_record.row_version<>p_expected_version then return jsonb_build_object('conflict',true,'current_version',v_record.row_version); end if;
    if exists(select 1 from public.aircraft_equipment_kit_assignments where organisation_id=p_organisation_id
      and equipment_kit_id=v_record.id and unassigned_at is null and archived_at is null)
      then return jsonb_build_object('assignment_conflict',true); end if;
    update public.equipment_kits set archived_at=now(),archived_by_internal_user_id=p_actor_internal_user_id,
      updated_by_internal_user_id=p_actor_internal_user_id where organisation_id=p_organisation_id and id=p_entity_id returning * into v_record;
  elsif p_operation='assign' then
    begin v_aircraft_id:=(p_data->>'aircraft_id')::uuid; exception when others then return jsonb_build_object('relationship_conflict',true); end;
    if v_record.status<>'available' then return jsonb_build_object('unavailable',true); end if;
    if not exists(select 1 from public.equipment_kit_aircraft_compatibility where organisation_id=p_organisation_id
      and equipment_kit_id=v_record.id and aircraft_id=v_aircraft_id and operating_location_id=v_location_id)
      then return jsonb_build_object('incompatible',true); end if;
    if not exists(select 1 from public.aircraft where organisation_id=p_organisation_id and id=v_aircraft_id
      and operating_location_id=v_location_id and archived_at is null and status='operational'
      and serviceability_state='serviceable' and mission_ready=true)
      then return jsonb_build_object('aircraft_not_ready',true); end if;
    insert into public.aircraft_equipment_kit_assignments (organisation_id,operating_location_id,aircraft_id,equipment_kit_id,configuration_name,configuration_data,assigned_by_internal_user_id)
      values(p_organisation_id,v_location_id,v_aircraft_id,v_record.id,coalesce(nullif(btrim(p_data->>'configuration_name'),''),v_record.name),
        coalesce(p_data->'configuration_data','{}'),p_actor_internal_user_id) returning * into v_assignment;
  else
    if v_assignment.row_version<>p_expected_version then return jsonb_build_object('conflict',true,'current_version',v_assignment.row_version); end if;
    update public.aircraft_equipment_kit_assignments set unassigned_at=now(),unassigned_by_internal_user_id=p_actor_internal_user_id
      where organisation_id=p_organisation_id and id=p_entity_id returning * into v_assignment;
  end if;

  if p_operation in ('create','update') then
    delete from public.equipment_kit_aircraft_compatibility where organisation_id=p_organisation_id and equipment_kit_id=v_record.id;
    for v_aircraft_id in select value::uuid from jsonb_array_elements_text(coalesce(p_data->'compatible_aircraft_ids','[]')) loop
      insert into public.equipment_kit_aircraft_compatibility (organisation_id,operating_location_id,equipment_kit_id,aircraft_id,created_by_internal_user_id)
      values(p_organisation_id,v_location_id,v_record.id,v_aircraft_id,p_actor_internal_user_id);
    end loop;
  end if;
  if p_operation in ('assign','unassign') then
    v_compatibility:=to_jsonb(v_assignment);
  else
    select coalesce(jsonb_agg(c.aircraft_id order by c.aircraft_id),'[]'::jsonb) into v_aircraft_ids
      from public.equipment_kit_aircraft_compatibility c
      where c.organisation_id=p_organisation_id and c.equipment_kit_id=v_record.id;
    select to_jsonb(a) into v_active_assignment from public.aircraft_equipment_kit_assignments a
      where a.organisation_id=p_organisation_id and a.equipment_kit_id=v_record.id
        and a.unassigned_at is null and a.archived_at is null limit 1;
    v_compatibility:=to_jsonb(v_record)||jsonb_build_object('compatible_aircraft_ids',v_aircraft_ids,'active_assignment',v_active_assignment);
  end if;
  insert into public.audit_events (organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)
    values(p_organisation_id,p_actor_internal_user_id,'equipment_kit.'||p_operation,'equipment_kit',
      case when p_operation='unassign' then v_assignment.equipment_kit_id else v_record.id end,jsonb_build_object('record',v_compatibility));
  insert into public.transactional_outbox (organisation_id,topic,aggregate_type,aggregate_id,payload)
    values(p_organisation_id,'operational.equipment_kit.'||p_operation,'equipment_kit',
      case when p_operation='unassign' then v_assignment.equipment_kit_id else v_record.id end,jsonb_build_object('record',v_compatibility));
  return jsonb_build_object('record',v_compatibility);
end; $$;

revoke all on function public.ftf_validate_equipment_relationships() from public,anon,authenticated;
revoke all on function public.ftf_provision_equipment_kit_admin_permissions() from public,anon,authenticated;
revoke all on function public.ftf_write_operational_resource_before_equipment_kits(uuid,uuid,text,text,uuid,integer,jsonb)
  from public,anon,authenticated,service_role;
revoke all on function public.ftf_write_operational_resource(uuid,uuid,text,text,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.ftf_write_operational_resource(uuid,uuid,text,text,uuid,integer,jsonb) to service_role;
