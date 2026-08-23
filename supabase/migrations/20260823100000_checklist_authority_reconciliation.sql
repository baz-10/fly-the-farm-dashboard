-- Checklist authority reconciliation. Extends the existing Checklist aggregate; no prepared content is seeded.

alter table public.checklist_templates add column authority_scope text not null default 'ORGANISATION'
  check(authority_scope in ('PLATFORM_SYSTEM','ORGANISATION'));
alter table public.checklist_templates add column created_by_platform_user_id uuid references public.platform_users(id);
alter table public.checklist_templates add column updated_by_platform_user_id uuid references public.platform_users(id);
alter table public.checklist_templates alter column organisation_id drop not null;
alter table public.checklist_templates add constraint checklist_template_authority_owner check(
  (authority_scope='PLATFORM_SYSTEM' and organisation_id is null and created_by_platform_user_id is not null and updated_by_platform_user_id is not null)
  or (authority_scope='ORGANISATION' and organisation_id is not null and created_by_platform_user_id is null and updated_by_platform_user_id is null));
alter table public.checklist_templates drop constraint if exists checklist_templates_organisation_id_stable_code_key;
create unique index checklist_templates_platform_stable_code_unique on public.checklist_templates(upper(btrim(stable_code)))
  where authority_scope='PLATFORM_SYSTEM' and archived_at is null;
create unique index checklist_templates_organisation_stable_code_unique on public.checklist_templates(organisation_id,upper(btrim(stable_code)))
  where authority_scope='ORGANISATION' and archived_at is null;
-- Historical mapping is metadata-only: existing rows are equivalent to set authority_scope='ORGANISATION'.
update public.checklist_templates set authority_scope='ORGANISATION' where authority_scope is null;

alter table public.checklist_template_versions add column authority_scope text not null default 'ORGANISATION'
  check(authority_scope in ('PLATFORM_SYSTEM','ORGANISATION'));
alter table public.checklist_template_versions add column source_system_template_version_id uuid references public.checklist_template_versions(id);
alter table public.checklist_template_versions add column source_provenance jsonb not null default '{}'::jsonb
  check(jsonb_typeof(source_provenance)='object');
alter table public.checklist_template_versions alter column organisation_id drop not null;
alter table public.checklist_template_versions alter column created_by_internal_user_id drop not null;
alter table public.checklist_template_versions add column created_by_platform_user_id uuid references public.platform_users(id);
alter table public.checklist_template_versions add constraint checklist_template_version_authority_owner check(
  (authority_scope='PLATFORM_SYSTEM' and organisation_id is null and created_by_platform_user_id is not null and created_by_internal_user_id is null)
  or (authority_scope='ORGANISATION' and organisation_id is not null and created_by_internal_user_id is not null and created_by_platform_user_id is null));

create table public.checklist_template_applicability(
  id uuid primary key default gen_random_uuid(),
  template_version_id uuid not null references public.checklist_template_versions(id),
  authority_scope text not null check(authority_scope in ('PLATFORM_SYSTEM','ORGANISATION')),
  organisation_id uuid references public.organisations(id),
  operating_location_id uuid references public.operating_locations(id),
  lifecycle_stage text not null,
  readiness_required boolean not null default false,
  aircraft_id uuid references public.aircraft(id),
  maintainable_asset_id uuid references public.maintainable_asset_registry(id),
  manufacturer_scope text,
  model_scope text,
  asset_system_id uuid references public.asset_systems(id),
  component_position_id uuid references public.component_positions(id),
  configuration_code text,
  mission_context jsonb not null default '{}'::jsonb check(jsonb_typeof(mission_context)='object'),
  created_at timestamptz not null default now(),
  check((authority_scope='PLATFORM_SYSTEM' and organisation_id is null and readiness_required=false)
    or (authority_scope='ORGANISATION' and organisation_id is not null)),
  unique(template_version_id,id)
);

alter table public.checklist_executions add column aircraft_id uuid references public.aircraft(id);
alter table public.checklist_executions add column maintainable_asset_id uuid references public.maintainable_asset_registry(id);
alter table public.checklist_executions add column asset_system_id uuid references public.asset_systems(id);
alter table public.checklist_executions add column component_position_id uuid references public.component_positions(id);
alter table public.checklist_executions add column configuration_snapshot jsonb;
alter table public.checklist_executions add column applicability_snapshot jsonb;
alter table public.checklist_executions add column frozen_checklist_snapshot jsonb;
alter table public.checklist_executions add constraint checklist_execution_frozen_shapes check(
  (configuration_snapshot is null or jsonb_typeof(configuration_snapshot)='object') and
  (applicability_snapshot is null or jsonb_typeof(applicability_snapshot)='object') and
  (frozen_checklist_snapshot is null or jsonb_typeof(frozen_checklist_snapshot)='object'));

create table public.checklist_findings(
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  operating_location_id uuid not null references public.operating_locations(id),
  execution_id uuid not null references public.checklist_executions(id),
  frozen_item_id text not null,
  aircraft_id uuid references public.aircraft(id),
  maintainable_asset_id uuid references public.maintainable_asset_registry(id),
  asset_system_id uuid references public.asset_systems(id),
  component_position_id uuid references public.component_positions(id),
  response_value jsonb not null,
  finding_text text,
  criticality text not null check(criticality in ('ROUTINE','IMPORTANT','CRITICAL')),
  evidence_ids uuid[] not null default '{}',
  handoff_state text not null default 'DEFECT_HANDOFF_PENDING' check(handoff_state='DEFECT_HANDOFF_PENDING'),
  observed_by_internal_user_id uuid not null references public.internal_users(id),
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(organisation_id,execution_id,frozen_item_id)
);

alter table public.checklist_template_applicability enable row level security;
alter table public.checklist_template_applicability force row level security;
alter table public.checklist_findings enable row level security;
alter table public.checklist_findings force row level security;
revoke all on table public.checklist_template_applicability,public.checklist_findings from public,anon,authenticated,service_role;
create policy checklist_template_applicability_trusted on public.checklist_template_applicability for all to service_role using(true) with check(true);
create policy checklist_findings_trusted on public.checklist_findings for all to service_role using(true) with check(true);
create trigger checklist_findings_immutable before update or delete on public.checklist_findings
  for each row execute function public.reject_append_only_mutation();

create function public.ftf_provision_checklist_authority_permissions() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.permissions(organisation_id,code,description) select new.organisation_id,* from(values
    ('checklist_templates.read','View applicable Checklist templates'),
    ('checklist_templates.author','Author organisation Checklist templates'),
    ('checklist_templates.publish','Publish organisation Checklist versions'),
    ('checklists.execute','Start and complete applicable Checklists'),
    ('checklists.read_completed','View completed Checklist evidence'),
    ('checklist_findings.manage','Review Checklist findings'))p(code,description) on conflict(organisation_id,code)do nothing;
  if new.code='admin' then
    insert into public.role_permissions(organisation_id,role_id,permission_id)
    select new.organisation_id,new.id,p.id from public.permissions p where p.organisation_id=new.organisation_id
      and p.code in('checklist_templates.read','checklist_templates.author','checklist_templates.publish','checklists.execute','checklists.read_completed','checklist_findings.manage')
    on conflict do nothing;
  end if;
  return new;
end$$;
create trigger roles_provision_checklist_authority_permissions after insert on public.roles
  for each row execute function public.ftf_provision_checklist_authority_permissions();
insert into public.permissions(organisation_id,code,description) select o.id,p.code,p.description from public.organisations o cross join(values
  ('checklist_templates.read','View applicable Checklist templates'),
  ('checklist_templates.author','Author organisation Checklist templates'),
  ('checklist_templates.publish','Publish organisation Checklist versions'),
  ('checklists.execute','Start and complete applicable Checklists'),
  ('checklists.read_completed','View completed Checklist evidence'),
  ('checklist_findings.manage','Review Checklist findings'))p(code,description) on conflict(organisation_id,code)do nothing;
insert into public.role_permissions(organisation_id,role_id,permission_id)
select r.organisation_id,r.id,p.id from public.roles r join public.permissions p on p.organisation_id=r.organisation_id
where r.code='admin'and r.archived_at is null and p.code in('checklist_templates.read','checklist_templates.author','checklist_templates.publish','checklists.execute','checklists.read_completed','checklist_findings.manage') on conflict do nothing;

create function public.ftf_validate_checklist_sections(p_sections jsonb,p_authority_scope text,p_source_system_version_id uuid default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare section jsonb;item jsonb;source_item jsonb;seen text[]='{}';source_seen text[]='{}';item_id text;authority text;response_type text;
begin
  if jsonb_typeof(p_sections)<>'array' or jsonb_array_length(p_sections)=0 then raise exception 'CHECKLIST_SECTIONS_INVALID' using errcode='22023';end if;
  for section in select value from jsonb_array_elements(p_sections)loop
    if jsonb_typeof(section)<>'object'or jsonb_typeof(section->'items')<>'array'then raise exception 'CHECKLIST_SECTION_INVALID'using errcode='22023';end if;
    for item in select value from jsonb_array_elements(section->'items')loop
      item_id=btrim(item->>'id');authority=item->>'authorityClass';response_type=item->>'responseType';
      if jsonb_typeof(item)<>'object'or coalesce(item_id,'')=''or item_id=any(seen)then raise exception 'CHECKLIST_ITEM_ID_INVALID'using errcode='22023';end if;
      seen=array_append(seen,item_id);
      if authority not in('DJI_MANUFACTURER','CASA_REGULATORY','SPRAY_COMMAND_WORKFLOW','ORGANISATION_STANDARD')then raise exception 'CHECKLIST_ITEM_AUTHORITY_INVALID'using errcode='22023';end if;
      if response_type not in('CHECK','PASS_DEFECT_NA','YES_NO_NA','NUMERIC','TEXT','SELECTION')then raise exception 'CHECKLIST_RESPONSE_TYPE_INVALID'using errcode='22023';end if;
      if p_authority_scope='ORGANISATION'and authority<>'ORGANISATION_STANDARD'and (p_source_system_version_id is null or nullif(item->>'sourceItemId','')is null)then
        raise exception 'CHECKLIST_ITEM_PROVENANCE_REQUIRED'using errcode='22023';
      end if;
      if p_authority_scope='ORGANISATION'and authority<>'ORGANISATION_STANDARD'then
        if item->>'sourceItemId'=any(source_seen)then raise exception 'CHECKLIST_ITEM_PROVENANCE_DUPLICATE'using errcode='22023';end if;
        source_seen=array_append(source_seen,item->>'sourceItemId');
        select source_item_row.value into source_item from public.checklist_template_versions source_version cross join jsonb_array_elements(source_version.sections)source_section cross join jsonb_array_elements(source_section->'items')source_item_row(value)
        where source_version.id=p_source_system_version_id and source_version.authority_scope='PLATFORM_SYSTEM'and source_version.status='PUBLISHED'and source_item_row.value->>'id'=item->>'sourceItemId'limit 1;
        if source_item is null or source_item->>'authorityClass'is distinct from authority or source_item->>'prompt'is distinct from item->>'prompt'or source_item->>'responseType'is distinct from response_type
          or coalesce((source_item->>'required')::boolean,true)is distinct from coalesce((item->>'required')::boolean,true)
          or coalesce((source_item->>'allowNA')::boolean,false)is distinct from coalesce((item->>'allowNA')::boolean,false)
          or coalesce((source_item->>'evidenceRequired')::boolean,false)is distinct from coalesce((item->>'evidenceRequired')::boolean,false)
          or coalesce(source_item->'options','[]'::jsonb)is distinct from coalesce(item->'options','[]'::jsonb)
          or coalesce(source_item->>'criticality','ROUTINE')is distinct from coalesce(item->>'criticality','ROUTINE')
          or coalesce(source_item->>'findingPrompt','')is distinct from coalesce(item->>'findingPrompt','')then raise exception 'CHECKLIST_ITEM_PROVENANCE_INVALID'using errcode='22023';end if;
      end if;
      if p_authority_scope='ORGANISATION'and authority='ORGANISATION_STANDARD'and nullif(item->>'sourceItemId','')is not null then
        raise exception 'CHECKLIST_ITEM_FALSE_AUTHORITY_INHERITANCE'using errcode='22023';
      end if;
      if coalesce((item->>'allowNA')::boolean,false)and response_type not in('PASS_DEFECT_NA','YES_NO_NA')then raise exception 'CHECKLIST_NA_NOT_ALLOWED'using errcode='22023';end if;
      if response_type='SELECTION'and(jsonb_typeof(item->'options')<>'array'or jsonb_array_length(item->'options')=0)then raise exception 'CHECKLIST_SELECTION_OPTIONS_REQUIRED'using errcode='22023';end if;
    end loop;
  end loop;
end$$;

create function public.ftf_checklist_asset_scope_allowed(p_organisation_id uuid,p_actor_internal_user_id uuid,p_operating_location_id uuid,p_aircraft_id uuid,p_asset_id uuid,p_system_id uuid,p_position_id uuid)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare registry public.maintainable_asset_registry%rowtype;system public.asset_systems%rowtype;position public.component_positions%rowtype;
begin
  if not public.ftf_operational_location_allowed(p_organisation_id,p_actor_internal_user_id,p_operating_location_id)then return false;end if;
  if p_aircraft_id is not null and not exists(select 1 from public.aircraft a where a.organisation_id=p_organisation_id and a.id=p_aircraft_id and a.operating_location_id=p_operating_location_id and a.archived_at is null)then return false;end if;
  if p_asset_id is not null then
    if not public.ftf_maintenance_asset_location_allowed(p_organisation_id,p_actor_internal_user_id,p_asset_id)then return false;end if;
    select*into registry from public.maintainable_asset_registry where organisation_id=p_organisation_id and id=p_asset_id and tracking_state='ACTIVE';if not found then return false;end if;
    if p_aircraft_id is not null and registry.aircraft_id is distinct from p_aircraft_id then return false;end if;
    if registry.aircraft_id is not null and not exists(select 1 from public.aircraft a where a.organisation_id=p_organisation_id and a.id=registry.aircraft_id and a.operating_location_id=p_operating_location_id and a.archived_at is null)then return false;end if;
    if registry.equipment_kit_id is not null and not exists(select 1 from public.equipment_kits k where k.organisation_id=p_organisation_id and k.id=registry.equipment_kit_id and k.operating_location_id=p_operating_location_id and k.archived_at is null)then return false;end if;
    if registry.fleet_asset_id is not null and not exists(select 1 from public.fleet_assets f where f.organisation_id=p_organisation_id and f.id=registry.fleet_asset_id and f.operating_location_id=p_operating_location_id and f.archived_at is null)then return false;end if;
  elsif p_system_id is not null or p_position_id is not null then return false;
  end if;
  if p_system_id is not null then select*into system from public.asset_systems where organisation_id=p_organisation_id and id=p_system_id and maintainable_asset_id=p_asset_id and archived_at is null;if not found then return false;end if;end if;
  if p_position_id is not null then select*into position from public.component_positions where organisation_id=p_organisation_id and id=p_position_id and system_id=p_system_id and archived_at is null;if not found then return false;end if;end if;
  return true;
end$$;

create function public.ftf_read_applicable_checklist_templates(p_organisation_id uuid,p_actor_internal_user_id uuid,p_operating_location_id uuid,p_lifecycle_stage text,p_mission_id uuid default null,p_aircraft_id uuid default null,p_maintainable_asset_id uuid default null,p_configuration_code text default null,p_asset_system_id uuid default null,p_component_position_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare m public.missions%rowtype;
begin
  if not(public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'checklist_templates.read')or public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'checklists.execute'))then return jsonb_build_object('forbidden',true);end if;
  if not public.ftf_checklist_asset_scope_allowed(p_organisation_id,p_actor_internal_user_id,p_operating_location_id,p_aircraft_id,p_maintainable_asset_id,p_asset_system_id,p_component_position_id)then return jsonb_build_object('not_found',true);end if;
  if p_mission_id is not null then select*into m from public.missions where organisation_id=p_organisation_id and id=p_mission_id and operating_location_id=p_operating_location_id and archived_at is null;if not found then return jsonb_build_object('not_found',true);end if;
    if p_aircraft_id is not null and not exists(select 1 from public.mission_aircraft_assignments where organisation_id=p_organisation_id and mission_id=p_mission_id and aircraft_id=p_aircraft_id and unassigned_at is null)then return jsonb_build_object('not_found',true);end if;
  end if;
  return jsonb_build_object('records',coalesce((select jsonb_agg(jsonb_build_object('template',to_jsonb(t),'version',to_jsonb(v),'applicability',to_jsonb(a))order by t.name)
    from public.checklist_template_applicability a join public.checklist_template_versions v on v.id=a.template_version_id join public.checklist_templates t on t.id=v.template_id
    where v.status='PUBLISHED'and coalesce(v.effective_at,v.published_at,v.created_at)<=now()and t.archived_at is null and a.lifecycle_stage=p_lifecycle_stage
      and not exists(select 1 from public.checklist_template_versions newer where newer.template_id=v.template_id and newer.status='PUBLISHED'and coalesce(newer.effective_at,newer.published_at,newer.created_at)<=now()and newer.version_number>v.version_number)
      and((a.authority_scope='PLATFORM_SYSTEM')or(a.authority_scope='ORGANISATION'and a.organisation_id=p_organisation_id))
      and(a.operating_location_id is null or a.operating_location_id=p_operating_location_id)
      and(a.aircraft_id is null or a.aircraft_id=p_aircraft_id)
      and(a.maintainable_asset_id is null or a.maintainable_asset_id=p_maintainable_asset_id)
      and(a.asset_system_id is null or a.asset_system_id=p_asset_system_id)
      and(a.component_position_id is null or a.component_position_id=p_component_position_id)
      and(a.configuration_code is null or a.configuration_code=p_configuration_code)
      and(a.manufacturer_scope is null or exists(select 1 from public.aircraft ax where ax.organisation_id=p_organisation_id and ax.id=p_aircraft_id and upper(btrim(ax.manufacturer))=upper(btrim(a.manufacturer_scope))))
      and(a.model_scope is null or exists(select 1 from public.aircraft ax where ax.organisation_id=p_organisation_id and ax.id=p_aircraft_id and upper(btrim(ax.model))=upper(btrim(a.model_scope))))
      and a.mission_context='{}'::jsonb),'[]'::jsonb));
end$$;

create function public.ftf_start_checklist_execution(p_organisation_id uuid,p_actor_internal_user_id uuid,p_template_version_id uuid,p_operating_location_id uuid,p_mission_id uuid,p_aircraft_id uuid,p_maintainable_asset_id uuid,p_asset_system_id uuid,p_component_position_id uuid,p_configuration jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.checklist_template_versions%rowtype;t public.checklist_templates%rowtype;p public.personnel%rowtype;e public.checklist_executions%rowtype;a public.checklist_template_applicability%rowtype;snapshot jsonb;
begin
  if not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'checklists.execute')then return jsonb_build_object('forbidden',true);end if;
  if not public.ftf_checklist_asset_scope_allowed(p_organisation_id,p_actor_internal_user_id,p_operating_location_id,p_aircraft_id,p_maintainable_asset_id,p_asset_system_id,p_component_position_id)then return jsonb_build_object('not_found',true);end if;
  if p_mission_id is not null and not exists(select 1 from public.missions m where m.organisation_id=p_organisation_id and m.id=p_mission_id and m.operating_location_id=p_operating_location_id and m.archived_at is null)then return jsonb_build_object('not_found',true);end if;
  if p_mission_id is not null and p_aircraft_id is not null and not exists(select 1 from public.mission_aircraft_assignments ma where ma.organisation_id=p_organisation_id and ma.mission_id=p_mission_id and ma.aircraft_id=p_aircraft_id and ma.operating_location_id=p_operating_location_id and ma.unassigned_at is null)then return jsonb_build_object('not_found',true);end if;
  select*into v from public.checklist_template_versions current_version where id=p_template_version_id and status='PUBLISHED'and coalesce(effective_at,published_at,created_at)<=now()
    and not exists(select 1 from public.checklist_template_versions newer where newer.template_id=current_version.template_id and newer.status='PUBLISHED'and coalesce(newer.effective_at,newer.published_at,newer.created_at)<=now()and newer.version_number>current_version.version_number)for share;if not found then return jsonb_build_object('not_found',true);end if;
  select*into t from public.checklist_templates where id=v.template_id and archived_at is null;if not found or(t.authority_scope='ORGANISATION'and t.organisation_id<>p_organisation_id)then return jsonb_build_object('not_found',true);end if;
  select*into a from public.checklist_template_applicability where template_version_id=v.id
    and((authority_scope='PLATFORM_SYSTEM')or(organisation_id=p_organisation_id))and(operating_location_id is null or operating_location_id=p_operating_location_id)
    and lifecycle_stage=p_configuration->>'lifecycleStage'
    and(aircraft_id is null or aircraft_id=p_aircraft_id)and(maintainable_asset_id is null or maintainable_asset_id=p_maintainable_asset_id)
    and(asset_system_id is null or asset_system_id=p_asset_system_id)and(component_position_id is null or component_position_id=p_component_position_id)
    and(configuration_code is null or configuration_code=nullif(p_configuration->>'configurationCode',''))
    and(manufacturer_scope is null or exists(select 1 from public.aircraft ax where ax.organisation_id=p_organisation_id and ax.id=p_aircraft_id and upper(btrim(ax.manufacturer))=upper(btrim(manufacturer_scope))))
    and(model_scope is null or exists(select 1 from public.aircraft ax where ax.organisation_id=p_organisation_id and ax.id=p_aircraft_id and upper(btrim(ax.model))=upper(btrim(model_scope))))
    and mission_context='{}'::jsonb order by id limit 1;
  if not found then return jsonb_build_object('not_applicable',true);end if;
  select*into p from public.personnel where organisation_id=p_organisation_id and internal_user_id=p_actor_internal_user_id and is_active and archived_at is null;if not found then return jsonb_build_object('ineligible_completing_personnel',true);end if;
  perform public.ftf_validate_checklist_sections(v.sections,v.authority_scope,v.source_system_template_version_id);
  snapshot=jsonb_build_object('schemaVersion',1,'templateId',t.id,'templateVersionId',v.id,'versionNumber',v.version_number,'authorityScope',v.authority_scope,'sourceSystemTemplateVersionId',v.source_system_template_version_id,'sections',v.sections,'sourceProvenance',v.source_provenance,'applicability',to_jsonb(a),'assetContext',jsonb_build_object('operatingLocationId',p_operating_location_id,'missionId',p_mission_id,'aircraftId',p_aircraft_id,'maintainableAssetId',p_maintainable_asset_id,'assetSystemId',p_asset_system_id,'componentPositionId',p_component_position_id,'configuration',coalesce(p_configuration,'{}'::jsonb)),'startedByInternalUserId',p_actor_internal_user_id,'startedAt',now());
  insert into public.checklist_executions(organisation_id,operating_location_id,mission_id,template_id,template_version_id,lifecycle_stage,completing_personnel_id,completing_personnel_snapshot,aircraft_id,maintainable_asset_id,asset_system_id,component_position_id,configuration_snapshot,applicability_snapshot,frozen_checklist_snapshot,created_by_internal_user_id)
  values(p_organisation_id,p_operating_location_id,p_mission_id,t.id,v.id,a.lifecycle_stage,p.id,jsonb_build_object('id',p.id,'fullName',p.full_name,'internalUserId',p_actor_internal_user_id),p_aircraft_id,p_maintainable_asset_id,p_asset_system_id,p_component_position_id,coalesce(p_configuration,'{}'),to_jsonb(a),snapshot,p_actor_internal_user_id)returning*into e;
  insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)values(p_organisation_id,p_actor_internal_user_id,'checklist.execution.started','checklist_execution',e.id,jsonb_build_object('templateVersionId',v.id,'version',e.row_version));
  insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)values(p_organisation_id,'checklist.execution.started','checklist_execution',e.id,jsonb_build_object('templateVersionId',v.id,'version',e.row_version));
  return jsonb_build_object('record',to_jsonb(e));
end$$;

create function public.ftf_complete_checklist_execution(p_organisation_id uuid,p_actor_internal_user_id uuid,p_execution_id uuid,p_expected_version integer,p_responses jsonb,p_signoff jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.checklist_executions%rowtype;section jsonb;item jsonb;v_item_id text;response jsonb;response_text text;response_type text;required boolean;allow_na boolean;failure boolean;findings integer=0;evidence uuid[];valid_keys text[]='{}';option_found boolean;
begin
  if not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'checklists.execute')then return jsonb_build_object('forbidden',true);end if;
  select*into e from public.checklist_executions where organisation_id=p_organisation_id and id=p_execution_id for update;if not found then return jsonb_build_object('not_found',true);end if;
  if e.status<>'DRAFT'or e.row_version<>p_expected_version then return jsonb_build_object('conflict',true,'current_version',e.row_version);end if;
  if e.frozen_checklist_snapshot is null then return jsonb_build_object('historical_draft_reconciliation_required',true);end if;
  if not public.ftf_checklist_asset_scope_allowed(p_organisation_id,p_actor_internal_user_id,e.operating_location_id,e.aircraft_id,e.maintainable_asset_id,e.asset_system_id,e.component_position_id)then return jsonb_build_object('not_found',true);end if;
  if jsonb_typeof(p_responses)<>'object'then raise exception 'CHECKLIST_RESPONSE_INVALID'using errcode='22023';end if;
  if coalesce(p_signoff->>'internalUserId','')<>p_actor_internal_user_id::text then raise exception 'CHECKLIST_SIGNOFF_INVALID'using errcode='22023';end if;
  for section in select value from jsonb_array_elements(e.frozen_checklist_snapshot->'sections')loop
    for item in select value from jsonb_array_elements(section->'items')loop
      v_item_id=item->>'id';valid_keys=array_append(valid_keys,v_item_id);response=p_responses->v_item_id;required=coalesce((item->>'required')::boolean,true);allow_na=coalesce((item->>'allowNA')::boolean,false);response_type=item->>'responseType';
      if response is null then if required then raise exception 'CHECKLIST_REQUIRED_RESPONSE_MISSING: %',v_item_id using errcode='22023';else continue;end if;end if;
      if jsonb_typeof(response)not in('string','number')then raise exception 'CHECKLIST_RESPONSE_INVALID: %',v_item_id using errcode='22023';end if;
      response_text=case when jsonb_typeof(response)='string'then response#>>'{}'else response::text end;
      if response_text='N_A'and not allow_na then raise exception 'CHECKLIST_NA_NOT_ALLOWED: %',v_item_id using errcode='22023';end if;
      if response_type='CHECK'and response_text<>'CHECKED'then raise exception 'CHECKLIST_RESPONSE_INVALID: %',v_item_id using errcode='22023';
      elsif response_type='PASS_DEFECT_NA'and response_text not in('PASS','DEFECT','N_A')then raise exception 'CHECKLIST_RESPONSE_INVALID: %',v_item_id using errcode='22023';
      elsif response_type='YES_NO_NA'and response_text not in('YES','NO','N_A')then raise exception 'CHECKLIST_RESPONSE_INVALID: %',v_item_id using errcode='22023';
      elsif response_type='NUMERIC'and(jsonb_typeof(response)not in('number','string')or response_text!~'^-?[0-9]+(\.[0-9]{1,6})?$')then raise exception 'CHECKLIST_RESPONSE_INVALID: %',v_item_id using errcode='22023';
      elsif response_type='TEXT'and(required and length(btrim(response_text))=0 or length(response_text)>2000)then raise exception 'CHECKLIST_RESPONSE_INVALID: %',v_item_id using errcode='22023';
      elsif response_type='SELECTION'then select exists(select 1 from jsonb_array_elements_text(item->'options')x where x=response_text)into option_found;if not option_found then raise exception 'CHECKLIST_RESPONSE_INVALID: %',v_item_id using errcode='22023';end if;end if;
      select coalesce(array_agg(checklist_evidence.id),'{}')into evidence from public.checklist_execution_evidence checklist_evidence where checklist_evidence.organisation_id=p_organisation_id and checklist_evidence.execution_id=e.id and checklist_evidence.item_id=v_item_id;
      if coalesce((item->>'evidenceRequired')::boolean,false)and cardinality(evidence)=0 then raise exception 'CHECKLIST_REQUIRED_EVIDENCE_MISSING: %',v_item_id using errcode='22023';end if;
      failure=response_text='DEFECT'or(response_type='YES_NO_NA'and response_text='NO');
      if failure then
        insert into public.checklist_findings(organisation_id,operating_location_id,execution_id,frozen_item_id,aircraft_id,maintainable_asset_id,asset_system_id,component_position_id,response_value,finding_text,criticality,evidence_ids,observed_by_internal_user_id)
        values(p_organisation_id,e.operating_location_id,e.id,v_item_id,e.aircraft_id,e.maintainable_asset_id,e.asset_system_id,e.component_position_id,response,nullif(item->>'findingPrompt',''),coalesce(item->>'criticality','ROUTINE'),evidence,p_actor_internal_user_id);
        findings=findings+1;
      end if;
    end loop;
  end loop;
  if exists(select 1 from jsonb_object_keys(p_responses)x where not(x=any(valid_keys)))then raise exception 'CHECKLIST_RESPONSE_INVALID'using errcode='22023';end if;
  update public.checklist_executions set responses=p_responses,failure_summary=case when findings>0 then jsonb_build_array(jsonb_build_object('findingCount',findings,'handoffState','DEFECT_HANDOFF_PENDING'))else'[]'::jsonb end,signoff_snapshot=p_signoff,status='SUBMITTED',completed_at=now(),row_version=row_version+1,updated_at=now()where id=e.id returning*into e;
  insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)values(p_organisation_id,p_actor_internal_user_id,'checklist.execution.completed','checklist_execution',e.id,jsonb_build_object('version',e.row_version,'findingCount',findings));
  insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)values(p_organisation_id,'checklist.execution.completed','checklist_execution',e.id,jsonb_build_object('version',e.row_version,'findingCount',findings));
  return jsonb_build_object('record',to_jsonb(e),'findingCount',findings,'handoffState',case when findings>0 then'DEFECT_HANDOFF_PENDING'else null end);
end$$;

create function public.ftf_read_checklist_execution_authority(p_organisation_id uuid,p_actor_internal_user_id uuid,p_execution_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare e public.checklist_executions%rowtype;begin
  select*into e from public.checklist_executions where organisation_id=p_organisation_id and id=p_execution_id;if not found then return jsonb_build_object('not_found',true);end if;
  if not(public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'checklists.read_completed')or(e.status='DRAFT'and public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'checklists.execute')))then return jsonb_build_object('forbidden',true);end if;
  if not public.ftf_operational_location_allowed(p_organisation_id,p_actor_internal_user_id,e.operating_location_id)then return jsonb_build_object('not_found',true);end if;
  return jsonb_build_object('record',to_jsonb(e),'findings',coalesce((select jsonb_agg(to_jsonb(f)order by f.created_at)from public.checklist_findings f where f.organisation_id=p_organisation_id and f.execution_id=e.id),'[]'::jsonb));end$$;

-- Existing customer commands remain organisation-only while callers migrate to the narrower endpoints.
create or replace function public.ftf_write_checklist_template(p_organisation_id uuid,p_actor_internal_user_id uuid,p_operation text,p_template_id uuid,p_expected_version integer,p_payload jsonb)returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare v public.checklist_templates%rowtype;begin
 if not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'checklist_templates.author')then return jsonb_build_object('forbidden',true);end if;
 if p_operation='CREATE'then insert into public.checklist_templates(organisation_id,authority_scope,stable_code,name,description,category,owner_personnel_id,operating_location_ids,applicable_operation_types,applicable_aircraft_types,applicable_equipment_ids,applicable_lifecycle_stages)values(p_organisation_id,'ORGANISATION',p_payload->>'stableCode',p_payload->>'name',nullif(p_payload->>'description',''),p_payload->>'category',nullif(p_payload->>'ownerPersonnelId','')::uuid,coalesce((select array_agg(x::uuid)from jsonb_array_elements_text(coalesce(p_payload->'operatingLocationIds','[]'))x),'{}'),coalesce((select array_agg(x)from jsonb_array_elements_text(coalesce(p_payload->'applicableOperationTypes','[]'))x),'{}'),coalesce((select array_agg(x)from jsonb_array_elements_text(coalesce(p_payload->'applicableAircraftTypes','[]'))x),'{}'),coalesce((select array_agg(x::uuid)from jsonb_array_elements_text(coalesce(p_payload->'applicableEquipmentIds','[]'))x),'{}'),coalesce((select array_agg(x)from jsonb_array_elements_text(coalesce(p_payload->'applicableLifecycleStages','[]'))x),'{}'))returning*into v;
 elsif p_operation='UPDATE'then update public.checklist_templates set name=p_payload->>'name',description=nullif(p_payload->>'description',''),category=p_payload->>'category',row_version=row_version+1,updated_at=now()where organisation_id=p_organisation_id and authority_scope='ORGANISATION'and id=p_template_id and row_version=p_expected_version and status='DRAFT'returning*into v;if not found then return jsonb_build_object('conflict',true);end if;else return jsonb_build_object('unsupported_operation',true);end if;
 insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)values(p_organisation_id,p_actor_internal_user_id,'checklist.template.'||lower(p_operation),'checklist_template',v.id,jsonb_build_object('version',v.row_version));insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)values(p_organisation_id,'checklist.template.'||lower(p_operation),'checklist_template',v.id,jsonb_build_object('version',v.row_version));return jsonb_build_object('record',to_jsonb(v));end$$;

create or replace function public.ftf_publish_checklist_template(p_organisation_id uuid,p_actor_internal_user_id uuid,p_template_id uuid,p_expected_version integer,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.checklist_templates%rowtype;v public.checklist_template_versions%rowtype;n integer;previous uuid;source_version uuid;app jsonb;
begin
  if not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'checklist_templates.publish')then return jsonb_build_object('forbidden',true);end if;
  select*into t from public.checklist_templates where organisation_id=p_organisation_id and authority_scope='ORGANISATION'and id=p_template_id and row_version=p_expected_version for update;
  if not found then return jsonb_build_object('conflict',true);end if;
  source_version=nullif(p_payload->>'sourceSystemTemplateVersionId','')::uuid;
  if source_version is not null and not exists(select 1 from public.checklist_template_versions sv join public.checklist_templates st on st.id=sv.template_id where sv.id=source_version and sv.authority_scope='PLATFORM_SYSTEM'and sv.status='PUBLISHED'and st.authority_scope='PLATFORM_SYSTEM'and st.archived_at is null)then return jsonb_build_object('source_not_found',true);end if;
  perform public.ftf_validate_checklist_sections(p_payload->'sections','ORGANISATION',source_version);
  if jsonb_typeof(p_payload->'applicability')<>'array'or jsonb_array_length(p_payload->'applicability')=0 then raise exception 'CHECKLIST_APPLICABILITY_REQUIRED'using errcode='22023';end if;
  select id into previous from public.checklist_template_versions where organisation_id=p_organisation_id and template_id=p_template_id and status='PUBLISHED'order by version_number desc limit 1;
  select coalesce(max(version_number),0)+1 into n from public.checklist_template_versions where template_id=p_template_id;
  insert into public.checklist_template_versions(organisation_id,template_id,version_number,status,effective_at,review_due_date,owner_personnel_id,approver_personnel_id,change_summary,sections,visibility_rules,signoff_policy,supersedes_version_id,published_at,published_by_internal_user_id,created_by_internal_user_id,authority_scope,source_system_template_version_id,source_provenance)
  values(p_organisation_id,p_template_id,n,'PUBLISHED',coalesce(nullif(p_payload->>'effectiveAt','')::timestamptz,now()),nullif(p_payload->>'reviewDueDate','')::date,t.owner_personnel_id,nullif(p_payload->>'approverPersonnelId','')::uuid,p_payload->>'changeSummary',p_payload->'sections',coalesce(p_payload->'visibilityRules','[]'),coalesce(p_payload->'signoffPolicy','{}'),previous,now(),p_actor_internal_user_id,p_actor_internal_user_id,'ORGANISATION',source_version,case when source_version is null then'{}'::jsonb else jsonb_build_object('sourceSystemTemplateVersionId',source_version,'sourceAuthority',(select source_provenance from public.checklist_template_versions where id=source_version),'clonedAt',now(),'clonedByInternalUserId',p_actor_internal_user_id)end)returning*into v;
  for app in select value from jsonb_array_elements(p_payload->'applicability')loop
    if nullif(app->>'operatingLocationId','')is not null and not public.ftf_operational_location_allowed(p_organisation_id,p_actor_internal_user_id,(app->>'operatingLocationId')::uuid)then raise exception 'CHECKLIST_BASE_NOT_ALLOWED'using errcode='42501';end if;
    if not public.ftf_checklist_asset_scope_allowed(p_organisation_id,p_actor_internal_user_id,(app->>'operatingLocationId')::uuid,nullif(app->>'aircraftId','')::uuid,nullif(app->>'maintainableAssetId','')::uuid,nullif(app->>'assetSystemId','')::uuid,nullif(app->>'componentPositionId','')::uuid)then raise exception 'CHECKLIST_APPLICABILITY_SCOPE_INVALID'using errcode='42501';end if;
    if coalesce(app->'missionContext','{}'::jsonb)<>'{}'::jsonb then raise exception 'CHECKLIST_MISSION_CONTEXT_NOT_YET_GOVERNED'using errcode='22023';end if;
    if coalesce((app->>'readinessRequired')::boolean,false)and exists(select 1 from public.maintainable_asset_registry registry where registry.organisation_id=p_organisation_id and registry.id=nullif(app->>'maintainableAssetId','')::uuid and registry.fleet_asset_id is not null)then raise exception 'CHECKLIST_FLEET_READINESS_ASSIGNMENT_AUTHORITY_REQUIRED'using errcode='22023';end if;
    if nullif(app->>'manufacturer','')is not null and not exists(select 1 from public.aircraft ax where ax.organisation_id=p_organisation_id and ax.id=nullif(app->>'aircraftId','')::uuid and upper(btrim(ax.manufacturer))=upper(btrim(app->>'manufacturer')))then raise exception 'CHECKLIST_APPLICABILITY_IDENTITY_INVALID'using errcode='22023';end if;
    if nullif(app->>'model','')is not null and not exists(select 1 from public.aircraft ax where ax.organisation_id=p_organisation_id and ax.id=nullif(app->>'aircraftId','')::uuid and upper(btrim(ax.model))=upper(btrim(app->>'model')))then raise exception 'CHECKLIST_APPLICABILITY_IDENTITY_INVALID'using errcode='22023';end if;
    insert into public.checklist_template_applicability(template_version_id,authority_scope,organisation_id,operating_location_id,lifecycle_stage,readiness_required,aircraft_id,maintainable_asset_id,manufacturer_scope,model_scope,asset_system_id,component_position_id,configuration_code,mission_context)
    values(v.id,'ORGANISATION',p_organisation_id,nullif(app->>'operatingLocationId','')::uuid,app->>'lifecycleStage',coalesce((app->>'readinessRequired')::boolean,false),nullif(app->>'aircraftId','')::uuid,nullif(app->>'maintainableAssetId','')::uuid,nullif(app->>'manufacturer',''),nullif(app->>'model',''),nullif(app->>'assetSystemId','')::uuid,nullif(app->>'componentPositionId','')::uuid,nullif(app->>'configurationCode',''),coalesce(app->'missionContext','{}'));
  end loop;
  update public.checklist_templates set status='PUBLISHED',row_version=row_version+1,updated_at=now()where id=t.id;
  insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)values(p_organisation_id,p_actor_internal_user_id,'checklist.template.published','checklist_template_version',v.id,jsonb_build_object('version',n,'sourceSystemTemplateVersionId',source_version));
  insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)values(p_organisation_id,'checklist.template.published','checklist_template',p_template_id,jsonb_build_object('versionId',v.id,'version',n));
  return jsonb_build_object('record',to_jsonb(v));
end$$;

create function public.ftf_save_checklist_execution_draft(p_organisation_id uuid,p_actor_internal_user_id uuid,p_execution_id uuid,p_expected_version integer,p_responses jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare e public.checklist_executions%rowtype;begin
  if not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'checklists.execute')then return jsonb_build_object('forbidden',true);end if;
  select*into e from public.checklist_executions where organisation_id=p_organisation_id and id=p_execution_id for update;
  if not found or not public.ftf_operational_location_allowed(p_organisation_id,p_actor_internal_user_id,e.operating_location_id)then return jsonb_build_object('not_found',true);end if;
  if e.status<>'DRAFT'or e.row_version<>p_expected_version then return jsonb_build_object('conflict',true,'current_version',e.row_version);end if;
  if jsonb_typeof(p_responses)<>'object'then raise exception 'CHECKLIST_RESPONSE_INVALID'using errcode='22023';end if;
  update public.checklist_executions set responses=p_responses,row_version=row_version+1,updated_at=now()where id=e.id returning*into e;
  insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)values(p_organisation_id,p_actor_internal_user_id,'checklist.execution.draft_saved','checklist_execution',e.id,jsonb_build_object('version',e.row_version));
  return jsonb_build_object('record',to_jsonb(e));
end$$;

create function public.ftf_read_mission_checklist_executions(p_organisation_id uuid,p_actor_internal_user_id uuid,p_mission_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare m public.missions%rowtype;begin
  if not(public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'checklists.read_completed')or public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'checklists.execute'))then return jsonb_build_object('forbidden',true);end if;
  select*into m from public.missions where organisation_id=p_organisation_id and id=p_mission_id and archived_at is null;
  if not found or not public.ftf_operational_location_allowed(p_organisation_id,p_actor_internal_user_id,m.operating_location_id)then return jsonb_build_object('not_found',true);end if;
  return jsonb_build_object('records',coalesce((select jsonb_agg(to_jsonb(e)order by e.created_at desc)from public.checklist_executions e where e.organisation_id=p_organisation_id and e.mission_id=p_mission_id),'[]'));
end$$;

create or replace function public.ftf_record_checklist_execution_evidence(p_organisation_id uuid,p_actor_internal_user_id uuid,p_execution_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare e public.checklist_executions%rowtype;v public.checklist_execution_evidence%rowtype;item_exists boolean;begin
  if not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'checklists.execute')then return jsonb_build_object('forbidden',true);end if;
  select*into e from public.checklist_executions where organisation_id=p_organisation_id and id=p_execution_id and status='DRAFT'for update;
  if not found or not public.ftf_operational_location_allowed(p_organisation_id,p_actor_internal_user_id,e.operating_location_id)then return jsonb_build_object('execution_unavailable',true);end if;
  select exists(select 1 from jsonb_array_elements(e.frozen_checklist_snapshot->'sections')s cross join jsonb_array_elements(s->'items')i where i->>'id'=p_payload->>'itemId')into item_exists;
  if not item_exists then raise exception 'CHECKLIST_ITEM_NOT_IN_FROZEN_EXECUTION'using errcode='22023';end if;
  insert into public.checklist_execution_evidence(organisation_id,execution_id,item_id,evidence_kind,internal_file_id,file_version,original_filename,content_type,byte_size,sha256_checksum,provenance,created_by_internal_user_id)
  values(p_organisation_id,p_execution_id,p_payload->>'itemId',p_payload->>'evidenceKind',(p_payload->>'internalFileId')::uuid,(p_payload->>'fileVersion')::integer,p_payload->>'originalFilename',p_payload->>'contentType',(p_payload->>'sizeBytes')::bigint,p_payload->>'checksumSha256',p_payload->'provenance',p_actor_internal_user_id)returning*into v;
  insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)values(p_organisation_id,p_actor_internal_user_id,'checklist.evidence.recorded','checklist_execution_evidence',v.id,jsonb_build_object('executionId',p_execution_id,'itemId',v.item_id,'checksum',v.sha256_checksum));
  insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)values(p_organisation_id,'checklist.evidence.recorded','checklist_execution',p_execution_id,jsonb_build_object('evidenceId',v.id,'itemId',v.item_id));
  return jsonb_build_object('record',to_jsonb(v));
end$$;

create function public.ftf_update_checklist_corrective_action(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_action_id uuid,
  p_expected_version integer,
  p_status text,
  p_resolution_notes text,
  p_resolved_by_personnel_id uuid
)returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare action public.checklist_corrective_actions%rowtype;execution public.checklist_executions%rowtype;resolver public.personnel%rowtype;
begin
  if not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'checklist_findings.manage')then return jsonb_build_object('forbidden',true);end if;
  if p_status<>'RESOLVED'or length(btrim(coalesce(p_resolution_notes,'')))not between 1 and 2000 or p_resolved_by_personnel_id is null then raise exception 'CHECKLIST_CORRECTIVE_ACTION_UPDATE_INVALID'using errcode='22023';end if;
  select*into action from public.checklist_corrective_actions where organisation_id=p_organisation_id and id=p_action_id for update;
  if not found then return jsonb_build_object('not_found',true);end if;
  select*into execution from public.checklist_executions where organisation_id=p_organisation_id and id=action.execution_id;
  if not found or not public.ftf_operational_location_allowed(p_organisation_id,p_actor_internal_user_id,execution.operating_location_id)then return jsonb_build_object('not_found',true);end if;
  if not exists(select 1 from public.checklist_findings finding where finding.organisation_id=p_organisation_id and finding.execution_id=action.execution_id and finding.frozen_item_id=action.item_id)then return jsonb_build_object('not_found',true);end if;
  select*into resolver from public.personnel where organisation_id=p_organisation_id and id=p_resolved_by_personnel_id and is_active and archived_at is null;
  if not found then raise exception 'CHECKLIST_RESOLVING_PERSONNEL_INVALID'using errcode='22023';end if;
  if action.row_version<>p_expected_version or action.status not in('OPEN','IN_PROGRESS')then return jsonb_build_object('conflict',true,'current_version',action.row_version);end if;
  update public.checklist_corrective_actions set status='RESOLVED',resolution_notes=btrim(p_resolution_notes),resolved_at=now(),resolved_by_personnel_id=resolver.id,row_version=row_version+1,updated_at=now(),updated_by_internal_user_id=p_actor_internal_user_id where id=action.id returning*into action;
  insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)values(p_organisation_id,p_actor_internal_user_id,'checklist.corrective_action.resolved','checklist_corrective_action',action.id,jsonb_build_object('executionId',action.execution_id,'itemId',action.item_id,'version',action.row_version));
  insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)values(p_organisation_id,'checklist.corrective_action.resolved','checklist_corrective_action',action.id,jsonb_build_object('executionId',action.execution_id,'itemId',action.item_id,'version',action.row_version));
  return jsonb_build_object('record',to_jsonb(action));
end$$;

create or replace function public.ftf_evaluate_mission_checklist_readiness(p_organisation_id uuid,p_mission_id uuid,p_lifecycle_stage text)returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
with mission_scope as(select*from public.missions where organisation_id=p_organisation_id and id=p_mission_id and archived_at is null),candidate as(
 select a.template_version_id,v.template_id,v.version_number,row_number()over(partition by v.template_id order by v.version_number desc)rank from mission_scope m join public.checklist_template_applicability a on a.organisation_id=p_organisation_id and a.operating_location_id=m.operating_location_id and a.lifecycle_stage=p_lifecycle_stage and a.readiness_required
 join public.checklist_template_versions v on v.id=a.template_version_id and v.status='PUBLISHED'and coalesce(v.effective_at,v.published_at,v.created_at)<=now()join public.checklist_templates t on t.id=v.template_id and t.authority_scope='ORGANISATION'and t.archived_at is null
 where(a.aircraft_id is null or exists(select 1 from public.mission_aircraft_assignments ma where ma.organisation_id=p_organisation_id and ma.mission_id=p_mission_id and ma.aircraft_id=a.aircraft_id and ma.unassigned_at is null))
 and(a.maintainable_asset_id is null or exists(select 1 from public.maintainable_asset_registry registry where registry.organisation_id=p_organisation_id and registry.id=a.maintainable_asset_id and registry.tracking_state='ACTIVE'and((registry.aircraft_id is not null and exists(select 1 from public.mission_aircraft_assignments ma where ma.organisation_id=p_organisation_id and ma.mission_id=p_mission_id and ma.aircraft_id=registry.aircraft_id and ma.unassigned_at is null))or(registry.equipment_kit_id is not null and exists(select 1 from public.mission_equipment_kit_assignments mk where mk.organisation_id=p_organisation_id and mk.mission_id=p_mission_id and mk.equipment_kit_id=registry.equipment_kit_id and mk.unassigned_at is null)))))
 and(a.asset_system_id is null or exists(select 1 from public.asset_systems system where system.organisation_id=p_organisation_id and system.id=a.asset_system_id and system.maintainable_asset_id=a.maintainable_asset_id and system.archived_at is null))
 and(a.component_position_id is null or exists(select 1 from public.component_positions position where position.organisation_id=p_organisation_id and position.id=a.component_position_id and position.system_id=a.asset_system_id and position.archived_at is null))
 and a.configuration_code is null
 and(a.manufacturer_scope is null or exists(select 1 from public.mission_aircraft_assignments ma join public.aircraft ax on ax.organisation_id=ma.organisation_id and ax.id=ma.aircraft_id and ax.archived_at is null where ma.organisation_id=p_organisation_id and ma.mission_id=p_mission_id and ma.unassigned_at is null and upper(btrim(ax.manufacturer))=upper(btrim(a.manufacturer_scope))))
 and(a.model_scope is null or exists(select 1 from public.mission_aircraft_assignments ma join public.aircraft ax on ax.organisation_id=ma.organisation_id and ax.id=ma.aircraft_id and ax.archived_at is null where ma.organisation_id=p_organisation_id and ma.mission_id=p_mission_id and ma.unassigned_at is null and upper(btrim(ax.model))=upper(btrim(a.model_scope))))
 and a.mission_context='{}'::jsonb
),required as(select*from candidate where rank=1),latest as(select distinct on(e.template_id,e.template_version_id)e.*from public.checklist_executions e where e.organisation_id=p_organisation_id and e.mission_id=p_mission_id and e.lifecycle_stage=p_lifecycle_stage order by e.template_id,e.template_version_id,e.created_at desc),blockers as(
 select jsonb_build_object('code','MANDATORY_CHECKLIST_INCOMPLETE','templateId',r.template_id,'templateVersionId',r.template_version_id)b from required r left join latest e on e.template_id=r.template_id and e.template_version_id=r.template_version_id where e.id is null or e.status<>'SUBMITTED'
)select jsonb_build_object('ready',count(*)=0,'blockers',coalesce(jsonb_agg(b),'[]'::jsonb))from blockers$$;

revoke all on function public.ftf_provision_checklist_authority_permissions(),public.ftf_validate_checklist_sections(jsonb,text,uuid),public.ftf_checklist_asset_scope_allowed(uuid,uuid,uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.ftf_read_applicable_checklist_templates(uuid,uuid,uuid,text,uuid,uuid,uuid,text,uuid,uuid),public.ftf_start_checklist_execution(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb),public.ftf_save_checklist_execution_draft(uuid,uuid,uuid,integer,jsonb),public.ftf_complete_checklist_execution(uuid,uuid,uuid,integer,jsonb,jsonb),public.ftf_read_checklist_execution_authority(uuid,uuid,uuid),public.ftf_read_mission_checklist_executions(uuid,uuid,uuid),public.ftf_update_checklist_corrective_action(uuid,uuid,uuid,integer,text,text,uuid)from public,anon,authenticated;
grant execute on function public.ftf_read_applicable_checklist_templates(uuid,uuid,uuid,text,uuid,uuid,uuid,text,uuid,uuid),public.ftf_start_checklist_execution(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb),public.ftf_save_checklist_execution_draft(uuid,uuid,uuid,integer,jsonb),public.ftf_complete_checklist_execution(uuid,uuid,uuid,integer,jsonb,jsonb),public.ftf_read_checklist_execution_authority(uuid,uuid,uuid),public.ftf_read_mission_checklist_executions(uuid,uuid,uuid),public.ftf_update_checklist_corrective_action(uuid,uuid,uuid,integer,text,text,uuid)to service_role;
revoke all on function public.ftf_write_checklist_execution(uuid,uuid,text,uuid,integer,jsonb),public.ftf_write_checklist_corrective_action(uuid,uuid,text,uuid,integer,jsonb)from service_role;
