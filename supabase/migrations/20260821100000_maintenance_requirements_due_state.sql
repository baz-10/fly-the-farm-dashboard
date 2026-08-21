-- Authoritative versioned maintenance requirements and deterministic as-of due-state projection.
-- This migration is additive. Due state is advisory planning state and never mutates asset availability.

create table public.maintenance_requirements (
  id uuid primary key default gen_random_uuid(),
  owner_scope text not null check (owner_scope in ('PLATFORM','ORGANISATION')),
  organisation_id uuid,
  requirement_code text not null check (length(btrim(requirement_code)) between 1 and 120),
  created_by_internal_user_id uuid,
  created_by_platform_user_id uuid,
  created_at timestamptz not null default now(),
  constraint maintenance_requirements_owner_coherent check (
    (owner_scope='PLATFORM' and organisation_id is null and created_by_platform_user_id is not null and created_by_internal_user_id is null)
    or (owner_scope='ORGANISATION' and organisation_id is not null and created_by_internal_user_id is not null and created_by_platform_user_id is null)
  ),
  foreign key (organisation_id) references public.organisations(id),
  foreign key (organisation_id,created_by_internal_user_id) references public.internal_users(organisation_id,id),
  foreign key (created_by_platform_user_id) references public.platform_users(id)
);
create unique index maintenance_requirements_platform_code_unique on public.maintenance_requirements(upper(btrim(requirement_code))) where owner_scope='PLATFORM';
create unique index maintenance_requirements_org_code_unique on public.maintenance_requirements(organisation_id,upper(btrim(requirement_code))) where owner_scope='ORGANISATION';

create table public.maintenance_requirement_versions (
  id uuid primary key default gen_random_uuid(),
  maintenance_requirement_id uuid not null references public.maintenance_requirements(id),
  version_number integer not null check (version_number > 0),
  requirement_name text not null check (length(btrim(requirement_name)) between 1 and 240),
  requirement_kind text not null check (requirement_kind in ('SERVICE','INSPECTION','REPLACEMENT','CALIBRATION','ONE_TIME','CONDITION_BASED')),
  authority_type text not null check (authority_type in ('MANUFACTURER','ORGANISATION_STANDARD','CONDITION_BASED')),
  lifecycle_state text not null default 'PROPOSED' check (lifecycle_state in ('PROPOSED','REVIEWED','APPROVED','EFFECTIVE','SUPERSEDED')),
  threshold_policy text not null check (threshold_policy='ANY'),
  scope_type text not null check (scope_type in ('ASSET','MODEL','SYSTEM','COMPONENT_POSITION','COMPONENT_TYPE')),
  organisation_id uuid,
  maintainable_asset_id uuid,
  system_id uuid,
  component_position_id uuid,
  manufacturer_scope text,
  model_scope text,
  component_type_scope text,
  evidence jsonb not null check (jsonb_typeof(evidence)='object' and evidence<>'{}'::jsonb),
  supersedes_version_id uuid references public.maintenance_requirement_versions(id),
  reviewed_by_internal_user_id uuid,
  reviewed_by_platform_user_id uuid,
  reviewed_at timestamptz,
  review_evidence jsonb,
  approved_by_internal_user_id uuid,
  approved_by_platform_user_id uuid,
  approved_at timestamptz,
  approval_evidence jsonb,
  effective_from timestamptz,
  effective_to timestamptz,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (maintenance_requirement_id,version_number),
  foreign key (organisation_id,maintainable_asset_id) references public.maintainable_asset_registry(organisation_id,id),
  foreign key (organisation_id,system_id) references public.asset_systems(organisation_id,id),
  foreign key (organisation_id,component_position_id) references public.component_positions(organisation_id,id),
  foreign key (organisation_id,reviewed_by_internal_user_id) references public.internal_users(organisation_id,id),
  foreign key (organisation_id,approved_by_internal_user_id) references public.internal_users(organisation_id,id),
  foreign key (reviewed_by_platform_user_id) references public.platform_users(id),
  foreign key (approved_by_platform_user_id) references public.platform_users(id),
  check (effective_to is null or (effective_from is not null and effective_to>effective_from))
);
create unique index maintenance_requirement_versions_one_effective on public.maintenance_requirement_versions(maintenance_requirement_id) where lifecycle_state='EFFECTIVE';

create table public.maintenance_requirement_thresholds (
  id uuid primary key default gen_random_uuid(),
  maintenance_requirement_version_id uuid not null references public.maintenance_requirement_versions(id),
  sequence_number integer not null check (sequence_number > 0),
  threshold_type text not null check (threshold_type in ('CALENDAR','METER','CONDITION','ONE_TIME','COMPONENT')),
  meter_type text check (meter_type in ('odometer','engine_hours','flight_hours','cycles','missions','area','custom')),
  meter_definition_id uuid references public.asset_meter_definitions(id),
  interval_value numeric(20,6) check (interval_value is null or interval_value > 0),
  unit_code text,
  due_soon_value numeric(20,6) check (due_soon_value is null or due_soon_value >= 0),
  condition_definition jsonb,
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence)='object'),
  created_at timestamptz not null default now(),
  unique (maintenance_requirement_version_id,sequence_number),
  constraint maintenance_requirement_threshold_typed check (
    (threshold_type='CALENDAR' and meter_type is null and meter_definition_id is null and interval_value is not null and unit_code in ('DAY','WEEK','MONTH','YEAR') and condition_definition is null)
    or (threshold_type='METER' and meter_type is not null and interval_value is not null and unit_code is not null and condition_definition is null)
    or (threshold_type='CONDITION' and meter_type is null and meter_definition_id is null and interval_value is null and unit_code is null and due_soon_value is null and jsonb_typeof(condition_definition)='object' and condition_definition<>'{}'::jsonb)
    or (threshold_type='ONE_TIME' and meter_type is null and meter_definition_id is null and interval_value is null and unit_code is null and due_soon_value is null and condition_definition is null)
    or (threshold_type='COMPONENT' and meter_type is null and meter_definition_id is null and interval_value is not null and unit_code is not null and condition_definition is null)
  )
);

create function public.ftf_guard_maintenance_requirement_threshold_type() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare definition public.asset_meter_definitions%rowtype;
begin
  if new.threshold_type='METER' and new.due_soon_value is not null and new.interval_value is not null and new.due_soon_value>=new.interval_value then
    raise exception 'MAINTENANCE_REQUIREMENT_THRESHOLD_TYPED_INVALID' using errcode='22023';
  end if;
  if new.threshold_type='METER' and not (
    (new.meter_type='odometer' and lower(new.unit_code) in ('km','mi'))
    or (new.meter_type in ('engine_hours','flight_hours') and lower(new.unit_code) in ('h','hr','hours'))
    or (new.meter_type='cycles' and lower(new.unit_code) in ('cycle','cycles'))
    or (new.meter_type='missions' and lower(new.unit_code) in ('mission','missions'))
    or (new.meter_type='area' and lower(new.unit_code) in ('ha','acre','acres','m2','km2'))
    or (new.meter_type='custom' and nullif(btrim(new.unit_code),'') is not null)
  ) then raise exception 'MAINTENANCE_REQUIREMENT_THRESHOLD_TYPED_INVALID' using errcode='22023'; end if;
  if new.meter_definition_id is not null then
    select * into definition from public.asset_meter_definitions where id=new.meter_definition_id and archived_at is null;
    if not found or definition.meter_type<>new.meter_type or lower(btrim(definition.unit))<>lower(btrim(new.unit_code)) then
      raise exception 'MAINTENANCE_REQUIREMENT_THRESHOLD_TYPED_INVALID' using errcode='22023';
    end if;
  end if;
  return new;
end; $$;
create trigger maintenance_requirement_thresholds_typed before insert or update on public.maintenance_requirement_thresholds for each row execute function public.ftf_guard_maintenance_requirement_threshold_type();

create table public.asset_maintenance_requirement_baselines (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  maintainable_asset_id uuid not null,
  maintenance_requirement_threshold_id uuid not null references public.maintenance_requirement_thresholds(id),
  baseline_type text not null check (baseline_type in ('PREVIOUS_COMPLETION','COMMISSIONING','METER','ONE_TIME')),
  baseline_value numeric(20,6),
  baseline_date date,
  evidence jsonb not null check (jsonb_typeof(evidence)='object' and evidence<>'{}'::jsonb),
  recorded_by_internal_user_id uuid not null,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organisation_id,id),
  foreign key (organisation_id,maintainable_asset_id) references public.maintainable_asset_registry(organisation_id,id),
  foreign key (organisation_id,recorded_by_internal_user_id) references public.internal_users(organisation_id,id),
  check (num_nonnulls(baseline_value,baseline_date)=1)
);
create index asset_maintenance_requirement_baselines_lookup on public.asset_maintenance_requirement_baselines(organisation_id,maintainable_asset_id,maintenance_requirement_threshold_id,recorded_at desc);

alter table public.service_template_requirement_links
  add constraint service_template_requirement_links_requirement_version_fk
  foreign key (maintenance_requirement_version_id) references public.maintenance_requirement_versions(id);

create function public.ftf_guard_maintenance_requirement_version_scope() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare stable public.maintenance_requirements%rowtype; scoped_system public.asset_systems%rowtype; scoped_position public.component_positions%rowtype;
begin
  select * into stable from public.maintenance_requirements where id=new.maintenance_requirement_id;
  if not found or new.organisation_id is distinct from stable.organisation_id then
    raise exception 'MAINTENANCE_REQUIREMENT_SCOPE_CONTRADICTION' using errcode='23514';
  end if;
  if stable.owner_scope='PLATFORM' then
    if new.authority_type='ORGANISATION_STANDARD' or new.organisation_id is not null or new.scope_type not in ('MODEL','COMPONENT_TYPE') then
      raise exception 'MAINTENANCE_REQUIREMENT_SCOPE_CONTRADICTION' using errcode='23514';
    end if;
  elsif new.authority_type='MANUFACTURER' then
    raise exception 'MANUFACTURER_REQUIREMENT_REQUIRES_PLATFORM_AUTHORITY' using errcode='42501';
  end if;
  if (new.scope_type='ASSET' and (new.maintainable_asset_id is null or num_nonnulls(new.system_id,new.component_position_id,new.manufacturer_scope,new.model_scope,new.component_type_scope)>0))
    or (new.scope_type='MODEL' and (new.manufacturer_scope is null or new.model_scope is null or num_nonnulls(new.maintainable_asset_id,new.system_id,new.component_position_id,new.component_type_scope)>0))
    or (new.scope_type='SYSTEM' and (new.maintainable_asset_id is null or new.system_id is null or num_nonnulls(new.component_position_id,new.manufacturer_scope,new.model_scope,new.component_type_scope)>0))
    or (new.scope_type='COMPONENT_POSITION' and (new.maintainable_asset_id is null or new.system_id is null or new.component_position_id is null or num_nonnulls(new.manufacturer_scope,new.model_scope,new.component_type_scope)>0))
    or (new.scope_type='COMPONENT_TYPE' and (new.component_type_scope is null or num_nonnulls(new.maintainable_asset_id,new.system_id,new.component_position_id,new.manufacturer_scope,new.model_scope)>0)) then
    raise exception 'MAINTENANCE_REQUIREMENT_SCOPE_CONTRADICTION' using errcode='23514';
  end if;
  if new.system_id is not null then
    select * into scoped_system from public.asset_systems where organisation_id=new.organisation_id and id=new.system_id and archived_at is null;
    if not found or scoped_system.maintainable_asset_id is distinct from new.maintainable_asset_id then raise exception 'MAINTENANCE_REQUIREMENT_SCOPE_CONTRADICTION' using errcode='23514'; end if;
  end if;
  if new.component_position_id is not null then
    select * into scoped_position from public.component_positions where organisation_id=new.organisation_id and id=new.component_position_id and archived_at is null;
    if not found or scoped_position.system_id is distinct from new.system_id then raise exception 'MAINTENANCE_REQUIREMENT_SCOPE_CONTRADICTION' using errcode='23514'; end if;
  end if;
  return new;
end; $$;
create trigger maintenance_requirement_versions_scope before insert or update on public.maintenance_requirement_versions for each row execute function public.ftf_guard_maintenance_requirement_version_scope();

create function public.ftf_guard_maintenance_requirement_version_mutation() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if old.lifecycle_state='SUPERSEDED' or (old.lifecycle_state='EFFECTIVE' and (
    tg_op='DELETE' or new.lifecycle_state<>'SUPERSEDED'
    or (to_jsonb(new)-array['lifecycle_state','effective_to','row_version','updated_at'])<>(to_jsonb(old)-array['lifecycle_state','effective_to','row_version','updated_at'])
  )) then raise exception 'MAINTENANCE_REQUIREMENT_VERSION_IMMUTABLE' using errcode='55000'; end if;
  return new;
end; $$;
create trigger maintenance_requirement_versions_immutable before update or delete on public.maintenance_requirement_versions for each row execute function public.ftf_guard_maintenance_requirement_version_mutation();

create function public.ftf_guard_maintenance_requirement_threshold_mutation() returns trigger
language plpgsql set search_path=public,pg_temp as $$
declare state text;
begin
  select lifecycle_state into state from public.maintenance_requirement_versions where id=coalesce(old.maintenance_requirement_version_id,new.maintenance_requirement_version_id);
  if state<>'PROPOSED' then raise exception 'MAINTENANCE_REQUIREMENT_THRESHOLD_IMMUTABLE' using errcode='55000'; end if;
  return coalesce(new,old);
end; $$;
create trigger maintenance_requirement_thresholds_immutable before update or delete on public.maintenance_requirement_thresholds for each row execute function public.ftf_guard_maintenance_requirement_threshold_mutation();

create function public.ftf_reject_maintenance_baseline_mutation() returns trigger language plpgsql as $$
begin raise exception 'MAINTENANCE_REQUIREMENT_BASELINE_IMMUTABLE' using errcode='55000'; end; $$;
create trigger asset_maintenance_requirement_baselines_immutable before update or delete on public.asset_maintenance_requirement_baselines for each row execute function public.ftf_reject_maintenance_baseline_mutation();

alter table public.maintenance_requirements enable row level security;
alter table public.maintenance_requirements force row level security;
revoke all on table public.maintenance_requirements from public, anon, authenticated, service_role;
alter table public.maintenance_requirement_versions enable row level security;
alter table public.maintenance_requirement_versions force row level security;
revoke all on table public.maintenance_requirement_versions from public, anon, authenticated, service_role;
alter table public.maintenance_requirement_thresholds enable row level security;
alter table public.maintenance_requirement_thresholds force row level security;
revoke all on table public.maintenance_requirement_thresholds from public, anon, authenticated, service_role;
alter table public.asset_maintenance_requirement_baselines enable row level security;
alter table public.asset_maintenance_requirement_baselines force row level security;
revoke all on table public.asset_maintenance_requirement_baselines from public, anon, authenticated, service_role;

insert into public.platform_permissions(code,description,enabled) values
  ('platform.maintenance_requirements.publish','Author and publish manufacturer maintenance requirements.',true)
on conflict(code) do update set description=excluded.description,enabled=true;
insert into public.platform_role_permissions(role_id,permission_id)
select role.id,permission.id from public.platform_roles role join public.platform_permissions permission on permission.code='platform.maintenance_requirements.publish' and permission.enabled
where role.code='PLATFORM_SUPER_ADMIN' and role.is_active on conflict do nothing;

create function public.ftf_provision_maintenance_requirement_permissions() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.code<>'admin' then return new; end if;
  insert into public.permissions(organisation_id,code,description) select new.organisation_id,* from (values
    ('maintenance_requirements.read','View authoritative maintenance due state'),
    ('maintenance_requirements.manage','Propose and maintain organisation requirements'),
    ('maintenance_requirements.review','Review and approve organisation requirements'),
    ('maintenance_requirements.publish','Make approved organisation requirements effective')) p(code,description) on conflict do nothing;
  insert into public.role_permissions(organisation_id,role_id,permission_id)
    select new.organisation_id,new.id,p.id from public.permissions p where p.organisation_id=new.organisation_id and p.code like 'maintenance_requirements.%' on conflict do nothing;
  return new;
end; $$;
create trigger roles_provision_maintenance_requirement_permissions after insert on public.roles for each row execute function public.ftf_provision_maintenance_requirement_permissions();
insert into public.permissions(organisation_id,code,description)
select organisation.id,p.code,p.description from public.organisations organisation cross join (values
  ('maintenance_requirements.read','View authoritative maintenance due state'),
  ('maintenance_requirements.manage','Propose and maintain organisation requirements'),
  ('maintenance_requirements.review','Review and approve organisation requirements'),
  ('maintenance_requirements.publish','Make approved organisation requirements effective')) p(code,description)
where organisation.archived_at is null on conflict do nothing;
insert into public.role_permissions(organisation_id,role_id,permission_id)
select role.organisation_id,role.id,permission.id from public.roles role join public.permissions permission on permission.organisation_id=role.organisation_id
where role.code='admin' and role.archived_at is null and permission.code like 'maintenance_requirements.%' on conflict do nothing;

create function public.ftf_insert_maintenance_requirement(
  p_owner_scope text,p_organisation_id uuid,p_actor_internal_user_id uuid,p_platform_user_id uuid,p_definition jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare stable public.maintenance_requirements%rowtype; version public.maintenance_requirement_versions%rowtype; threshold jsonb; sequence integer:=0; thresholds jsonb; next_version integer; kit_owner_scope text; kit_organisation_id uuid;
begin
  if p_definition is null or jsonb_typeof(p_definition)<>'object' or nullif(btrim(p_definition->>'requirementCode'),'') is null
    or nullif(btrim(p_definition->>'requirementName'),'') is null or p_definition->>'thresholdPolicy' is distinct from 'ANY' then
    if p_definition->>'thresholdPolicy' is distinct from 'ANY' then raise exception 'REQUIREMENT_THRESHOLD_POLICY_UNSUPPORTED' using errcode='22023'; end if;
    raise exception 'MAINTENANCE_REQUIREMENT_DEFINITION_INVALID' using errcode='22023';
  end if;
  if jsonb_typeof(p_definition->'thresholds')<>'array' or jsonb_array_length(p_definition->'thresholds')=0 then raise exception 'MAINTENANCE_REQUIREMENT_THRESHOLDS_REQUIRED' using errcode='22023'; end if;
  if p_owner_scope='ORGANISATION' and p_definition->>'authorityType'='MANUFACTURER' then raise exception 'MANUFACTURER_REQUIREMENT_REQUIRES_PLATFORM_AUTHORITY' using errcode='42501'; end if;
  if p_owner_scope='PLATFORM' and p_definition->>'authorityType' not in ('MANUFACTURER','CONDITION_BASED') then raise exception 'PLATFORM_REQUIREMENT_AUTHORITY_INVALID' using errcode='42501'; end if;
  select * into stable from public.maintenance_requirements existing where existing.owner_scope=p_owner_scope and existing.organisation_id is not distinct from p_organisation_id
    and upper(btrim(existing.requirement_code))=upper(btrim(p_definition->>'requirementCode')) for update;
  if not found then
    insert into public.maintenance_requirements(owner_scope,organisation_id,requirement_code,created_by_internal_user_id,created_by_platform_user_id)
      values(p_owner_scope,p_organisation_id,btrim(p_definition->>'requirementCode'),p_actor_internal_user_id,p_platform_user_id) returning * into stable;
    next_version:=1;
  else
    select coalesce(max(existing.version_number),0)+1 into next_version from public.maintenance_requirement_versions existing where existing.maintenance_requirement_id=stable.id;
  end if;
  insert into public.maintenance_requirement_versions(
    maintenance_requirement_id,version_number,requirement_name,requirement_kind,authority_type,threshold_policy,scope_type,organisation_id,
    maintainable_asset_id,system_id,component_position_id,manufacturer_scope,model_scope,component_type_scope,evidence,supersedes_version_id)
  values(stable.id,next_version,btrim(p_definition->>'requirementName'),p_definition->>'requirementKind',p_definition->>'authorityType','ANY',p_definition->>'scopeType',p_organisation_id,
    nullif(p_definition->>'maintainableAssetId','')::uuid,nullif(p_definition->>'systemId','')::uuid,nullif(p_definition->>'componentPositionId','')::uuid,
    nullif(btrim(p_definition->>'manufacturerScope'),''),nullif(btrim(p_definition->>'modelScope'),''),nullif(btrim(p_definition->>'componentTypeScope'),''),p_definition->'evidence',
    nullif(p_definition->>'supersedesVersionId','')::uuid) returning * into version;
  for threshold in select value from jsonb_array_elements(p_definition->'thresholds') loop
    sequence:=sequence+1;
    insert into public.maintenance_requirement_thresholds(maintenance_requirement_version_id,sequence_number,threshold_type,meter_type,meter_definition_id,interval_value,unit_code,due_soon_value,condition_definition,evidence)
    values(version.id,sequence,threshold->>'thresholdType',threshold->>'meterType',nullif(threshold->>'meterDefinitionId','')::uuid,
      nullif(threshold->>'intervalValue','')::numeric,threshold->>'unitCode',nullif(threshold->>'dueSoonValue','')::numeric,threshold->'conditionDefinition',coalesce(threshold->'evidence','{}'::jsonb));
  end loop;
  if nullif(p_definition->>'serviceKitVersionId','') is not null then
    select template.owner_scope,template.organisation_id into kit_owner_scope,kit_organisation_id
      from public.service_template_versions kit join public.service_templates template on template.id=kit.service_template_id
      where kit.id=(p_definition->>'serviceKitVersionId')::uuid;
    if not found or (kit_owner_scope='ORGANISATION' and kit_organisation_id is distinct from p_organisation_id) then
      raise exception 'SERVICE_KIT_VERSION_SCOPE_INVALID' using errcode='23514';
    end if;
    insert into public.service_template_requirement_links(service_template_version_id,maintenance_requirement_version_id,disposition)
      values((p_definition->>'serviceKitVersionId')::uuid,version.id,'REQUIRED');
  end if;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.sequence_number),'[]'::jsonb) into thresholds from public.maintenance_requirement_thresholds t where t.maintenance_requirement_version_id=version.id;
  return jsonb_build_object('record',jsonb_build_object('requirement',to_jsonb(stable),'version',to_jsonb(version),'thresholds',thresholds));
end; $$;

create function public.ftf_propose_organisation_maintenance_requirement(p_organisation_id uuid,p_actor_internal_user_id uuid,p_definition jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; version_id uuid;
begin
  perform public.ftf_lock_active_organisation(p_organisation_id);
  if not public.ftf_actor_has_active_beta_seat(p_organisation_id,p_actor_internal_user_id) or not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'maintenance_requirements.manage') then return jsonb_build_object('forbidden',true); end if;
  result:=public.ftf_insert_maintenance_requirement('ORGANISATION',p_organisation_id,p_actor_internal_user_id,null,p_definition); version_id:=(result#>>'{record,version,id}')::uuid;
  insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload) values(p_organisation_id,p_actor_internal_user_id,'maintenance_requirement.proposed','maintenance_requirement_version',version_id,jsonb_build_object('authorityType',p_definition->>'authorityType'));
  insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload) values(p_organisation_id,'operational.maintenance_requirement.proposed','maintenance_requirement_version',version_id,jsonb_build_object('state','PROPOSED'));
  return result;
end; $$;

create function public.ftf_propose_platform_maintenance_requirement(p_platform_user_id uuid,p_definition jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; version_id uuid;
begin
  if not public.ftf_platform_actor_has_permission(p_platform_user_id,'platform.maintenance_requirements.publish') then return jsonb_build_object('forbidden',true); end if;
  result:=public.ftf_insert_maintenance_requirement('PLATFORM',null,null,p_platform_user_id,p_definition); version_id:=(result#>>'{record,version,id}')::uuid;
  insert into public.platform_audit_events(actor_auth_user_id,event_type,entity_type,entity_id,event_payload) select auth_user_id,'platform.maintenance_requirement.proposed','maintenance_requirement_version',version_id,jsonb_build_object('authorityType',p_definition->>'authorityType') from public.platform_users where id=p_platform_user_id;
  insert into public.platform_transactional_outbox(topic,aggregate_type,aggregate_id,payload) values('platform.maintenance_requirement.proposed','maintenance_requirement_version',version_id,jsonb_build_object('state','PROPOSED'));
  return result;
end; $$;

create function public.ftf_transition_maintenance_requirement(
  p_owner_scope text,p_organisation_id uuid,p_actor_internal_user_id uuid,p_platform_user_id uuid,p_version_id uuid,p_expected_version integer,p_target_state text,p_transition_evidence jsonb,p_effective_from timestamptz
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare version public.maintenance_requirement_versions%rowtype; stable public.maintenance_requirements%rowtype; prior public.maintenance_requirement_versions%rowtype; event_name text;
begin
  select v.* into version from public.maintenance_requirement_versions v join public.maintenance_requirements r on r.id=v.maintenance_requirement_id
    where v.id=p_version_id and r.owner_scope=p_owner_scope and r.organisation_id is not distinct from p_organisation_id for update;
  if not found then return jsonb_build_object('not_found',true); end if;
  select * into stable from public.maintenance_requirements where id=version.maintenance_requirement_id;
  if version.row_version<>p_expected_version then return jsonb_build_object('conflict',true,'current_version',version.row_version); end if;
  if p_target_state='REVIEWED' then
    if version.lifecycle_state<>'PROPOSED' then raise exception 'REQUIREMENT_LIFECYCLE_TRANSITION_INVALID' using errcode='22023'; end if;
    if p_transition_evidence is null or jsonb_typeof(p_transition_evidence)<>'object' or p_transition_evidence='{}'::jsonb then raise exception 'REQUIREMENT_REVIEW_EVIDENCE_REQUIRED' using errcode='22023'; end if;
    update public.maintenance_requirement_versions set lifecycle_state='REVIEWED',reviewed_by_internal_user_id=p_actor_internal_user_id,reviewed_by_platform_user_id=p_platform_user_id,reviewed_at=now(),review_evidence=p_transition_evidence,row_version=row_version+1,updated_at=now() where id=p_version_id returning * into version;
  elsif p_target_state='APPROVED' then
    if version.lifecycle_state<>'REVIEWED' then raise exception 'REQUIREMENT_LIFECYCLE_TRANSITION_INVALID' using errcode='22023'; end if;
    if p_transition_evidence is null or jsonb_typeof(p_transition_evidence)<>'object' or p_transition_evidence='{}'::jsonb then raise exception 'REQUIREMENT_APPROVAL_EVIDENCE_REQUIRED' using errcode='22023'; end if;
    update public.maintenance_requirement_versions set lifecycle_state='APPROVED',approved_by_internal_user_id=p_actor_internal_user_id,approved_by_platform_user_id=p_platform_user_id,approved_at=now(),approval_evidence=p_transition_evidence,row_version=row_version+1,updated_at=now() where id=p_version_id returning * into version;
  elsif p_target_state='EFFECTIVE' then
    if version.lifecycle_state<>'APPROVED' or p_effective_from is null then raise exception 'REQUIREMENT_LIFECYCLE_TRANSITION_INVALID' using errcode='22023'; end if;
    if version.authority_type='MANUFACTURER' and (version.approved_by_platform_user_id is null or version.approval_evidence is null or version.approval_evidence='{}'::jsonb) then raise exception 'MANUFACTURER_REQUIREMENT_APPROVAL_REQUIRED' using errcode='42501'; end if;
    if exists(select 1 from public.service_template_requirement_links link join public.service_template_versions kit on kit.id=link.service_template_version_id
      where link.maintenance_requirement_version_id=version.id and not public.ftf_version_historically_effective_at(kit.lifecycle_state,kit.effective_from,kit.effective_to,p_effective_from)) then
      raise exception 'SERVICE_KIT_VERSION_NOT_EFFECTIVE' using errcode='23514';
    end if;
    if version.supersedes_version_id is not null then
      select * into prior from public.maintenance_requirement_versions where id=version.supersedes_version_id and maintenance_requirement_id=version.maintenance_requirement_id for update;
      if not found or prior.lifecycle_state<>'EFFECTIVE' or prior.effective_from>p_effective_from or (prior.effective_to is not null and prior.effective_to<=p_effective_from) then raise exception 'MAINTENANCE_REQUIREMENT_SUPERSESSION_INVALID' using errcode='23514'; end if;
      update public.maintenance_requirement_versions set lifecycle_state='SUPERSEDED',effective_to=p_effective_from,row_version=row_version+1,updated_at=now() where id=prior.id;
    elsif exists(select 1 from public.maintenance_requirement_versions current where current.maintenance_requirement_id=version.maintenance_requirement_id and current.lifecycle_state='EFFECTIVE') then
      raise exception 'MAINTENANCE_REQUIREMENT_SUPERSESSION_INVALID' using errcode='23514';
    end if;
    update public.maintenance_requirement_versions set lifecycle_state='EFFECTIVE',effective_from=p_effective_from,row_version=row_version+1,updated_at=now() where id=p_version_id returning * into version;
  else raise exception 'REQUIREMENT_LIFECYCLE_TRANSITION_INVALID' using errcode='22023'; end if;
  event_name:=lower(p_target_state);
  if p_owner_scope='ORGANISATION' then
    insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload) values(p_organisation_id,p_actor_internal_user_id,'maintenance_requirement.'||event_name,'maintenance_requirement_version',version.id,jsonb_build_object('state',version.lifecycle_state,'rowVersion',version.row_version));
    insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload) values(p_organisation_id,'operational.maintenance_requirement.'||event_name,'maintenance_requirement_version',version.id,jsonb_build_object('state',version.lifecycle_state));
  else
    insert into public.platform_audit_events(actor_auth_user_id,event_type,entity_type,entity_id,event_payload) select auth_user_id,'platform.maintenance_requirement.'||event_name,'maintenance_requirement_version',version.id,jsonb_build_object('state',version.lifecycle_state,'rowVersion',version.row_version) from public.platform_users where id=p_platform_user_id;
    insert into public.platform_transactional_outbox(topic,aggregate_type,aggregate_id,payload) values('platform.maintenance_requirement.'||event_name,'maintenance_requirement_version',version.id,jsonb_build_object('state',version.lifecycle_state));
  end if;
  return jsonb_build_object('record',to_jsonb(version));
end; $$;

create function public.ftf_review_organisation_maintenance_requirement_version(p_organisation_id uuid,p_actor_internal_user_id uuid,p_version_id uuid,p_expected_version integer,p_review_evidence jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ begin perform public.ftf_lock_active_organisation(p_organisation_id); if not public.ftf_actor_has_active_beta_seat(p_organisation_id,p_actor_internal_user_id) or not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'maintenance_requirements.review') then return jsonb_build_object('forbidden',true); end if; return public.ftf_transition_maintenance_requirement('ORGANISATION',p_organisation_id,p_actor_internal_user_id,null,p_version_id,p_expected_version,'REVIEWED',p_review_evidence,null); end; $$;
create function public.ftf_approve_organisation_maintenance_requirement_version(p_organisation_id uuid,p_actor_internal_user_id uuid,p_version_id uuid,p_expected_version integer,p_approval_evidence jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ begin perform public.ftf_lock_active_organisation(p_organisation_id); if not public.ftf_actor_has_active_beta_seat(p_organisation_id,p_actor_internal_user_id) or not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'maintenance_requirements.review') then return jsonb_build_object('forbidden',true); end if; return public.ftf_transition_maintenance_requirement('ORGANISATION',p_organisation_id,p_actor_internal_user_id,null,p_version_id,p_expected_version,'APPROVED',p_approval_evidence,null); end; $$;
create function public.ftf_make_organisation_maintenance_requirement_effective(p_organisation_id uuid,p_actor_internal_user_id uuid,p_version_id uuid,p_expected_version integer,p_effective_from timestamptz)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ begin perform public.ftf_lock_active_organisation(p_organisation_id); if not public.ftf_actor_has_active_beta_seat(p_organisation_id,p_actor_internal_user_id) or not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'maintenance_requirements.publish') then return jsonb_build_object('forbidden',true); end if; return public.ftf_transition_maintenance_requirement('ORGANISATION',p_organisation_id,p_actor_internal_user_id,null,p_version_id,p_expected_version,'EFFECTIVE',null,p_effective_from); end; $$;

create function public.ftf_review_platform_maintenance_requirement_version(p_platform_user_id uuid,p_version_id uuid,p_expected_version integer,p_review_evidence jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ begin if not public.ftf_platform_actor_has_permission(p_platform_user_id,'platform.maintenance_requirements.publish') then return jsonb_build_object('forbidden',true); end if; return public.ftf_transition_maintenance_requirement('PLATFORM',null,null,p_platform_user_id,p_version_id,p_expected_version,'REVIEWED',p_review_evidence,null); end; $$;
create function public.ftf_approve_platform_maintenance_requirement_version(p_platform_user_id uuid,p_version_id uuid,p_expected_version integer,p_approval_evidence jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ begin if not public.ftf_platform_actor_has_permission(p_platform_user_id,'platform.maintenance_requirements.publish') then return jsonb_build_object('forbidden',true); end if; return public.ftf_transition_maintenance_requirement('PLATFORM',null,null,p_platform_user_id,p_version_id,p_expected_version,'APPROVED',p_approval_evidence,null); end; $$;
create function public.ftf_make_platform_maintenance_requirement_effective(p_platform_user_id uuid,p_version_id uuid,p_expected_version integer,p_effective_from timestamptz)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ begin if not public.ftf_platform_actor_has_permission(p_platform_user_id,'platform.maintenance_requirements.publish') then return jsonb_build_object('forbidden',true); end if; return public.ftf_transition_maintenance_requirement('PLATFORM',null,null,p_platform_user_id,p_version_id,p_expected_version,'EFFECTIVE',null,p_effective_from); end; $$;

create function public.ftf_record_asset_maintenance_requirement_baseline(
  p_organisation_id uuid,p_actor_internal_user_id uuid,p_maintainable_asset_id uuid,p_threshold_id uuid,p_baseline_type text,p_baseline_value numeric,p_baseline_date date,p_evidence jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare threshold public.maintenance_requirement_thresholds%rowtype; baseline public.asset_maintenance_requirement_baselines%rowtype;
begin
  perform public.ftf_lock_active_organisation(p_organisation_id);
  if not public.ftf_actor_has_active_beta_seat(p_organisation_id,p_actor_internal_user_id) or not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'maintenance_requirements.manage') or not public.ftf_maintenance_asset_location_allowed(p_organisation_id,p_actor_internal_user_id,p_maintainable_asset_id) then return jsonb_build_object('not_found',true); end if;
  select t.* into threshold from public.maintenance_requirement_thresholds t
    join public.maintenance_requirement_versions version on version.id=t.maintenance_requirement_version_id
    join public.maintenance_requirements stable on stable.id=version.maintenance_requirement_id
    join public.maintainable_asset_registry registry on registry.organisation_id=p_organisation_id and registry.id=p_maintainable_asset_id and registry.tracking_state='ACTIVE'
    left join public.fleet_assets fleet on fleet.organisation_id=registry.organisation_id and fleet.id=registry.fleet_asset_id and fleet.archived_at is null
    left join public.aircraft aircraft on aircraft.organisation_id=registry.organisation_id and aircraft.id=registry.aircraft_id and aircraft.archived_at is null
    left join public.equipment_kits equipment on equipment.organisation_id=registry.organisation_id and equipment.id=registry.equipment_kit_id and equipment.archived_at is null
    where t.id=p_threshold_id and (stable.owner_scope='PLATFORM' or stable.organisation_id=p_organisation_id)
      and ((version.scope_type='ASSET' and version.maintainable_asset_id=p_maintainable_asset_id)
        or (version.scope_type='MODEL' and upper(btrim(version.manufacturer_scope))=upper(btrim(coalesce(fleet.manufacturer,aircraft.manufacturer,equipment.specifications->>'manufacturer')))
          and upper(btrim(version.model_scope))=upper(btrim(coalesce(fleet.model,aircraft.model,equipment.specifications->>'model'))))
        or (version.scope_type in ('SYSTEM','COMPONENT_POSITION') and version.maintainable_asset_id=p_maintainable_asset_id));
  if not found then return jsonb_build_object('not_found',true); end if;
  if p_evidence is null or jsonb_typeof(p_evidence)<>'object' or p_evidence='{}'::jsonb or num_nonnulls(p_baseline_value,p_baseline_date)<>1
    or (threshold.threshold_type='CALENDAR' and p_baseline_date is null) or (threshold.threshold_type='METER' and p_baseline_value is null) then raise exception 'MAINTENANCE_REQUIREMENT_BASELINE_INVALID' using errcode='22023'; end if;
  insert into public.asset_maintenance_requirement_baselines(organisation_id,maintainable_asset_id,maintenance_requirement_threshold_id,baseline_type,baseline_value,baseline_date,evidence,recorded_by_internal_user_id)
    values(p_organisation_id,p_maintainable_asset_id,p_threshold_id,p_baseline_type,p_baseline_value,p_baseline_date,p_evidence,p_actor_internal_user_id) returning * into baseline;
  insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload) values(p_organisation_id,p_actor_internal_user_id,'maintenance_requirement.baseline_recorded','asset_maintenance_requirement_baseline',baseline.id,jsonb_build_object('thresholdId',p_threshold_id,'assetId',p_maintainable_asset_id));
  insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload) values(p_organisation_id,'operational.maintenance_requirement.baseline_recorded','asset_maintenance_requirement_baseline',baseline.id,jsonb_build_object('thresholdId',p_threshold_id,'assetId',p_maintainable_asset_id));
  return jsonb_build_object('record',to_jsonb(baseline));
end; $$;

create function public.ftf_project_asset_maintenance_due_state(p_organisation_id uuid,p_maintainable_asset_id uuid,p_as_of timestamptz,p_timezone text)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
with asset_identity as (
  select registry.id,
    coalesce(fleet.manufacturer,aircraft.manufacturer,equipment.specifications->>'manufacturer') manufacturer,
    coalesce(fleet.model,aircraft.model,equipment.specifications->>'model') model
  from public.maintainable_asset_registry registry
  left join public.fleet_assets fleet on fleet.organisation_id=registry.organisation_id and fleet.id=registry.fleet_asset_id and fleet.archived_at is null
  left join public.aircraft aircraft on aircraft.organisation_id=registry.organisation_id and aircraft.id=registry.aircraft_id and aircraft.archived_at is null
  left join public.equipment_kits equipment on equipment.organisation_id=registry.organisation_id and equipment.id=registry.equipment_kit_id and equipment.archived_at is null
  where registry.organisation_id=p_organisation_id and registry.id=p_maintainable_asset_id and registry.tracking_state='ACTIVE'
), applicable_versions as (
  select stable.requirement_code,stable.owner_scope,version.*
  from public.maintenance_requirements stable join public.maintenance_requirement_versions version on version.maintenance_requirement_id=stable.id cross join asset_identity asset
  where version.lifecycle_state in ('EFFECTIVE','SUPERSEDED') and version.effective_from<=p_as_of and (version.effective_to is null or version.effective_to>p_as_of)
    and (stable.owner_scope='PLATFORM' or stable.organisation_id=p_organisation_id)
    and ((version.scope_type='ASSET' and version.maintainable_asset_id=p_maintainable_asset_id)
      or (version.scope_type='MODEL' and upper(btrim(version.manufacturer_scope))=upper(btrim(asset.manufacturer)) and upper(btrim(version.model_scope))=upper(btrim(asset.model)))
      or (version.scope_type in ('SYSTEM','COMPONENT_POSITION') and version.maintainable_asset_id=p_maintainable_asset_id))
), threshold_calculation as (
  select version.id version_id,threshold.id threshold_id,threshold.sequence_number,threshold.threshold_type,threshold.meter_type,threshold.unit_code,
    threshold.interval_value,threshold.due_soon_value,baseline.baseline_value,baseline.baseline_date,baseline.baseline_type,baseline.evidence baseline_evidence,
    reading.value current_value,reading.recorded_at current_recorded_at,reading.authority_source current_authority_source,
    case when threshold.threshold_type='ONE_TIME' and baseline.baseline_date is not null then baseline.baseline_date
      when threshold.threshold_type='CALENDAR' and baseline.baseline_date is not null then
        (baseline.baseline_date + case threshold.unit_code when 'DAY' then make_interval(days=>threshold.interval_value::integer) when 'WEEK' then make_interval(weeks=>threshold.interval_value::integer) when 'MONTH' then make_interval(months=>threshold.interval_value::integer) when 'YEAR' then make_interval(years=>threshold.interval_value::integer) end)::date
    end due_date,
    case when threshold.threshold_type='METER' and baseline.baseline_value is not null and reading.value is not null then baseline.baseline_value+threshold.interval_value end due_value
  from applicable_versions version join public.maintenance_requirement_thresholds threshold on threshold.maintenance_requirement_version_id=version.id
  left join lateral (select b.* from public.asset_maintenance_requirement_baselines b where b.organisation_id=p_organisation_id and b.maintainable_asset_id=p_maintainable_asset_id and b.maintenance_requirement_threshold_id=threshold.id and b.recorded_at<=p_as_of order by b.recorded_at desc,b.id desc limit 1) baseline on true
  left join lateral (
    select candidate.value,candidate.recorded_at,candidate.authority_source from (
      select reading.value,reading.recorded_at,'AUTHORITATIVE_METER'::text authority_source,1 authority_rank,reading.created_at
      from public.asset_meter_readings reading join public.asset_meter_definitions definition on definition.organisation_id=reading.organisation_id and definition.id=reading.meter_definition_id
      where reading.organisation_id=p_organisation_id and definition.maintainable_asset_id=p_maintainable_asset_id and definition.archived_at is null
        and definition.meter_type=threshold.meter_type and (threshold.meter_definition_id is null or threshold.meter_definition_id=definition.id) and reading.recorded_at<=p_as_of
        and not exists(select 1 from public.asset_meter_readings correction where correction.organisation_id=reading.organisation_id and correction.supersedes_reading_id=reading.id and correction.recorded_at<=p_as_of)
      union all
      select aircraft.total_flight_hours,aircraft.updated_at,'AIRCRAFT_COMPATIBILITY'::text,2,aircraft.updated_at
      from public.maintainable_asset_registry registry join public.aircraft aircraft on aircraft.organisation_id=registry.organisation_id and aircraft.id=registry.aircraft_id
      where registry.organisation_id=p_organisation_id and registry.id=p_maintainable_asset_id and threshold.meter_type='flight_hours'
        and aircraft.archived_at is null and aircraft.total_flight_hours is not null and aircraft.updated_at<=p_as_of
    ) candidate order by candidate.authority_rank,candidate.recorded_at desc,candidate.created_at desc limit 1
  ) reading on threshold.threshold_type='METER'
), threshold_states as (
  select calculation.*,
    case
      when threshold_type='CALENDAR' and baseline_date is null then 'INSUFFICIENT_DATA'
      when threshold_type='CALENDAR' and (timezone(p_timezone,p_as_of))::date>due_date then 'OVERDUE'
      when threshold_type='CALENDAR' and (timezone(p_timezone,p_as_of))::date=due_date then 'DUE'
      when threshold_type='CALENDAR' and due_soon_value is not null and due_date-(timezone(p_timezone,p_as_of))::date<=due_soon_value then 'DUE_SOON'
      when threshold_type='CALENDAR' then 'CURRENT'
      when threshold_type='ONE_TIME' and baseline_date is null then 'INSUFFICIENT_DATA'
      when threshold_type='ONE_TIME' and (timezone(p_timezone,p_as_of))::date>due_date then 'OVERDUE'
      when threshold_type='ONE_TIME' and (timezone(p_timezone,p_as_of))::date=due_date then 'DUE'
      when threshold_type='ONE_TIME' then 'CURRENT'
      when threshold_type='METER' and (baseline_value is null or current_value is null) then 'INSUFFICIENT_DATA'
      when threshold_type='METER' and current_value>due_value then 'OVERDUE'
      when threshold_type='METER' and current_value=due_value then 'DUE'
      when threshold_type='METER' and due_soon_value is not null and due_value-current_value<=due_soon_value then 'DUE_SOON'
      when threshold_type='METER' then 'CURRENT'
      else 'INSUFFICIENT_DATA'
    end state,
    case when threshold_type in ('CALENDAR','ONE_TIME') and due_date is not null then due_date-(timezone(p_timezone,p_as_of))::date
      when threshold_type='METER' and due_value is not null and current_value is not null then due_value-current_value end remaining
  from threshold_calculation calculation
), requirement_states as (
  select version.id version_id,
    case when bool_or(state='OVERDUE') then 'OVERDUE' when bool_or(state='DUE') then 'DUE' when bool_or(state='INSUFFICIENT_DATA') then 'INSUFFICIENT_DATA' when bool_or(state='DUE_SOON') then 'DUE_SOON' else 'CURRENT' end state,
    (array_agg(threshold_id order by remaining asc nulls last,sequence_number))[1] controlling_threshold_id,
    jsonb_agg(jsonb_build_object('thresholdId',threshold_id,'sequenceNumber',sequence_number,'thresholdType',threshold_type,'meterType',meter_type,'unitCode',unit_code,'intervalValue',interval_value,'dueSoonValue',due_soon_value,'baselineType',baseline_type,'baselineValue',baseline_value,'baselineDate',baseline_date,'currentValue',current_value,'currentRecordedAt',current_recorded_at,'currentAuthoritySource',current_authority_source,'dueValue',due_value,'dueDate',due_date,'remaining',remaining,'state',state,'baselineEvidence',baseline_evidence) order by sequence_number) thresholds
  from applicable_versions version join threshold_states state on state.version_id=version.id group by version.id
), rows as (
  select jsonb_build_object('requirementId',version.maintenance_requirement_id,'requirementVersionId',version.id,'requirementCode',version.requirement_code,'requirementName',version.requirement_name,'requirementKind',version.requirement_kind,'authorityType',version.authority_type,'authorityScope',version.owner_scope,'lifecycleState',version.lifecycle_state,'effectiveFrom',version.effective_from,'effectiveTo',version.effective_to,'thresholdPolicy','ANY','state',state.state,'controllingThresholdId',state.controlling_threshold_id,'thresholds',state.thresholds,'evidence',version.evidence,'serviceKitVersionId',kit.service_template_version_id) row
  from applicable_versions version join requirement_states state on state.version_id=version.id
  left join lateral (select link.service_template_version_id from public.service_template_requirement_links link where link.maintenance_requirement_version_id=version.id order by link.created_at,link.id limit 1) kit on true
)
select jsonb_build_object('assetId',p_maintainable_asset_id,'asOf',p_as_of,'timezone',p_timezone,'requirements',coalesce(jsonb_agg(row order by row->>'requirementCode'),'[]'::jsonb)) from rows;
$$;

create function public.ftf_read_asset_maintenance_due_state(p_organisation_id uuid,p_actor_internal_user_id uuid,p_maintainable_asset_id uuid,p_as_of timestamptz)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_timezone text; result jsonb; attached jsonb;
begin
  if p_as_of is null or not public.ftf_actor_has_active_beta_seat(p_organisation_id,p_actor_internal_user_id) or not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'maintenance_requirements.read')
    or not public.ftf_maintenance_asset_location_allowed(p_organisation_id,p_actor_internal_user_id,p_maintainable_asset_id) then return jsonb_build_object('not_found',true); end if;
  select location.timezone into v_timezone from public.maintainable_asset_registry registry
    left join public.aircraft aircraft on aircraft.organisation_id=registry.organisation_id and aircraft.id=registry.aircraft_id
    left join public.equipment_kits equipment on equipment.organisation_id=registry.organisation_id and equipment.id=registry.equipment_kit_id
    left join public.fleet_assets fleet on fleet.organisation_id=registry.organisation_id and fleet.id=registry.fleet_asset_id
    join public.operating_locations location on location.organisation_id=registry.organisation_id and location.id=coalesce(aircraft.operating_location_id,equipment.operating_location_id,fleet.operating_location_id)
    where registry.organisation_id=p_organisation_id and registry.id=p_maintainable_asset_id and registry.tracking_state='ACTIVE' and location.archived_at is null;
  if v_timezone is null then return jsonb_build_object('not_found',true); end if;
  if not (v_timezone='UTC' or v_timezone like '%/%') or not exists(select 1 from pg_timezone_names zone where zone.name=v_timezone) then
    raise exception 'MAINTENANCE_REQUIREMENT_IANA_TIMEZONE_REQUIRED' using errcode='22023';
  end if;
  -- Calendar arithmetic below is independent of browser, server and runner timezone settings.
  perform timezone(v_timezone,p_as_of);
  result:=public.ftf_project_asset_maintenance_due_state(p_organisation_id,p_maintainable_asset_id,p_as_of,v_timezone);
  select coalesce(jsonb_agg(jsonb_build_object('registryId',period.child_asset_id,'dueState',public.ftf_project_asset_maintenance_due_state(p_organisation_id,period.child_asset_id,p_as_of,child_location.timezone)) order by period.position_label,period.child_asset_id),'[]'::jsonb) into attached
  from public.asset_attachment_periods period join public.maintainable_asset_registry child on child.organisation_id=period.organisation_id and child.id=period.child_asset_id and child.tracking_state='ACTIVE'
    left join public.aircraft child_aircraft on child_aircraft.organisation_id=child.organisation_id and child_aircraft.id=child.aircraft_id
    left join public.equipment_kits child_equipment on child_equipment.organisation_id=child.organisation_id and child_equipment.id=child.equipment_kit_id
    left join public.fleet_assets child_fleet on child_fleet.organisation_id=child.organisation_id and child_fleet.id=child.fleet_asset_id
    join public.operating_locations child_location on child_location.organisation_id=child.organisation_id and child_location.id=coalesce(child_aircraft.operating_location_id,child_equipment.operating_location_id,child_fleet.operating_location_id)
  where period.organisation_id=p_organisation_id and period.parent_asset_id=p_maintainable_asset_id and period.attached_at<=p_as_of and (period.detached_at is null or period.detached_at>p_as_of)
    and public.ftf_maintenance_asset_location_allowed(p_organisation_id,p_actor_internal_user_id,child.id);
  return result || jsonb_build_object('attachedAssetSummaries',attached);
end; $$;

revoke all on function public.ftf_guard_maintenance_requirement_version_scope() from public,anon,authenticated,service_role;
revoke all on function public.ftf_guard_maintenance_requirement_threshold_type() from public,anon,authenticated,service_role;
revoke all on function public.ftf_guard_maintenance_requirement_version_mutation() from public,anon,authenticated,service_role;
revoke all on function public.ftf_guard_maintenance_requirement_threshold_mutation() from public,anon,authenticated,service_role;
revoke all on function public.ftf_reject_maintenance_baseline_mutation() from public,anon,authenticated,service_role;
revoke all on function public.ftf_provision_maintenance_requirement_permissions() from public,anon,authenticated,service_role;
revoke all on function public.ftf_insert_maintenance_requirement(text,uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.ftf_transition_maintenance_requirement(text,uuid,uuid,uuid,uuid,integer,text,jsonb,timestamptz) from public,anon,authenticated,service_role;
revoke all on function public.ftf_project_asset_maintenance_due_state(uuid,uuid,timestamptz,text) from public,anon,authenticated,service_role;
revoke all on function public.ftf_propose_organisation_maintenance_requirement(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ftf_propose_organisation_maintenance_requirement(uuid,uuid,jsonb) to service_role;
revoke all on function public.ftf_review_organisation_maintenance_requirement_version(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.ftf_review_organisation_maintenance_requirement_version(uuid,uuid,uuid,integer,jsonb) to service_role;
revoke all on function public.ftf_approve_organisation_maintenance_requirement_version(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.ftf_approve_organisation_maintenance_requirement_version(uuid,uuid,uuid,integer,jsonb) to service_role;
revoke all on function public.ftf_make_organisation_maintenance_requirement_effective(uuid,uuid,uuid,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.ftf_make_organisation_maintenance_requirement_effective(uuid,uuid,uuid,integer,timestamptz) to service_role;
revoke all on function public.ftf_propose_platform_maintenance_requirement(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ftf_propose_platform_maintenance_requirement(uuid,jsonb) to service_role;
revoke all on function public.ftf_review_platform_maintenance_requirement_version(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.ftf_review_platform_maintenance_requirement_version(uuid,uuid,integer,jsonb) to service_role;
revoke all on function public.ftf_approve_platform_maintenance_requirement_version(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.ftf_approve_platform_maintenance_requirement_version(uuid,uuid,integer,jsonb) to service_role;
revoke all on function public.ftf_make_platform_maintenance_requirement_effective(uuid,uuid,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.ftf_make_platform_maintenance_requirement_effective(uuid,uuid,integer,timestamptz) to service_role;
revoke all on function public.ftf_record_asset_maintenance_requirement_baseline(uuid,uuid,uuid,uuid,text,numeric,date,jsonb) from public,anon,authenticated;
grant execute on function public.ftf_record_asset_maintenance_requirement_baseline(uuid,uuid,uuid,uuid,text,numeric,date,jsonb) to service_role;
revoke all on function public.ftf_read_asset_maintenance_due_state(uuid,uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.ftf_read_asset_maintenance_due_state(uuid,uuid,uuid,timestamptz) to service_role;
