-- Checklist Library composition authority. Intentionally contains no PLATFORM_SYSTEM content seed.

insert into public.platform_permissions(code,description,enabled)values('platform.checklist_system.publish','Publish governed system Checklist compositions.',true)on conflict(code)do update set description=excluded.description,enabled=true;
insert into public.platform_role_permissions(role_id,permission_id)select role.id,permission.id from public.platform_roles role join public.platform_permissions permission on permission.code='platform.checklist_system.publish'where role.code='PLATFORM_SUPER_ADMIN'on conflict do nothing;

create table public.checklist_composition_profiles(
  id uuid primary key default gen_random_uuid(),
  authority_scope text not null check(authority_scope in('PLATFORM_SYSTEM','ORGANISATION')),
  organisation_id uuid references public.organisations(id),
  stable_code text not null,
  name text not null,
  description text,
  lifecycle_stage text not null check(lifecycle_stage in('PRE_FLIGHT','POST_FLIGHT','MAINTENANCE','GENERAL')),
  status text not null default'DRAFT'check(status in('DRAFT','PUBLISHED','RETIRED')),
  source_system_profile_id uuid references public.checklist_composition_profiles(id),
  row_version integer not null default 1 check(row_version>0),
  created_by_internal_user_id uuid references public.internal_users(id),
  created_by_platform_user_id uuid references public.platform_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint checklist_composition_profile_owner check(
    (authority_scope='PLATFORM_SYSTEM'and organisation_id is null and created_by_platform_user_id is not null and created_by_internal_user_id is null)
    or(authority_scope='ORGANISATION'and organisation_id is not null and created_by_internal_user_id is not null and created_by_platform_user_id is null)
  )
);
create unique index checklist_composition_platform_code_unique on public.checklist_composition_profiles(upper(btrim(stable_code)))where authority_scope='PLATFORM_SYSTEM'and archived_at is null;
create unique index checklist_composition_organisation_code_unique on public.checklist_composition_profiles(organisation_id,upper(btrim(stable_code)))where authority_scope='ORGANISATION'and archived_at is null;

create table public.checklist_composition_profile_versions(
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.checklist_composition_profiles(id),
  authority_scope text not null check(authority_scope in('PLATFORM_SYSTEM','ORGANISATION')),
  organisation_id uuid references public.organisations(id),
  version_number integer not null check(version_number>0),
  status text not null check(status in('DRAFT','PUBLISHED','RETIRED')),
  effective_at timestamptz,
  change_summary text not null,
  applicability jsonb not null default'{}'::jsonb check(jsonb_typeof(applicability)='object'),
  source_provenance jsonb not null default'{}'::jsonb check(jsonb_typeof(source_provenance)='object'),
  composition_digest text check(composition_digest is null or composition_digest~'^[a-f0-9]{64}$'),
  source_system_profile_version_id uuid references public.checklist_composition_profile_versions(id),
  supersedes_version_id uuid references public.checklist_composition_profile_versions(id),
  published_at timestamptz,
  created_by_internal_user_id uuid references public.internal_users(id),
  created_by_platform_user_id uuid references public.platform_users(id),
  created_at timestamptz not null default now(),
  row_version integer not null default 1 check(row_version>0),
  constraint checklist_composition_version_owner check(
    (authority_scope='PLATFORM_SYSTEM'and organisation_id is null and created_by_platform_user_id is not null and created_by_internal_user_id is null)
    or(authority_scope='ORGANISATION'and organisation_id is not null and created_by_internal_user_id is not null and created_by_platform_user_id is null)
  ),
  unique(profile_id,version_number)
);

create table public.checklist_composition_profile_modules(
  profile_version_id uuid not null references public.checklist_composition_profile_versions(id),
  ordinal integer not null check(ordinal>0),
  module_template_version_id uuid not null references public.checklist_template_versions(id),
  stable_section_code text not null,
  required boolean not null default true,
  created_at timestamptz not null default now(),
  primary key(profile_version_id,ordinal),
  unique(profile_version_id,module_template_version_id),
  unique(profile_version_id,stable_section_code)
);

alter table public.checklist_executions add column composition_profile_version_id uuid references public.checklist_composition_profile_versions(id);
alter table public.checklist_executions add column frozen_composition_snapshot jsonb;
alter table public.checklist_executions add constraint checklist_execution_composition_shape check(
  (composition_profile_version_id is null and frozen_composition_snapshot is null)
  or(composition_profile_version_id is not null and jsonb_typeof(frozen_composition_snapshot)='object')
);

alter table public.checklist_composition_profiles enable row level security;
alter table public.checklist_composition_profiles force row level security;
alter table public.checklist_composition_profile_versions enable row level security;
alter table public.checklist_composition_profile_versions force row level security;
alter table public.checklist_composition_profile_modules enable row level security;
alter table public.checklist_composition_profile_modules force row level security;
revoke all on table public.checklist_composition_profiles,public.checklist_composition_profile_versions,public.checklist_composition_profile_modules from public,anon,authenticated,service_role;
create policy checklist_composition_profiles_trusted on public.checklist_composition_profiles for all to service_role using(true)with check(true);
create policy checklist_composition_versions_trusted on public.checklist_composition_profile_versions for all to service_role using(true)with check(true);
create policy checklist_composition_modules_trusted on public.checklist_composition_profile_modules for all to service_role using(true)with check(true);

create trigger checklist_composition_versions_immutable before update or delete on public.checklist_composition_profile_versions for each row when(old.status in('PUBLISHED','RETIRED'))execute function public.reject_append_only_mutation();
create trigger checklist_composition_profiles_immutable before update or delete on public.checklist_composition_profiles for each row when(old.status in('PUBLISHED','RETIRED'))execute function public.reject_append_only_mutation();

create function public.ftf_validate_checklist_composition_version_coherence()returns trigger language plpgsql set search_path=public,pg_temp as $$
declare profile public.checklist_composition_profiles%rowtype;source_profile public.checklist_composition_profiles%rowtype;source_version public.checklist_composition_profile_versions%rowtype;prior public.checklist_composition_profile_versions%rowtype;
begin
  select*into profile from public.checklist_composition_profiles where id=new.profile_id;
  if not found or profile.authority_scope is distinct from new.authority_scope or profile.organisation_id is distinct from new.organisation_id then raise exception'CHECKLIST_COMPOSITION_AUTHORITY_COHERENCE'using errcode='22023';end if;
  if profile.source_system_profile_id is not null then
    select*into source_profile from public.checklist_composition_profiles where id=profile.source_system_profile_id and authority_scope='PLATFORM_SYSTEM'and organisation_id is null;
    select*into source_version from public.checklist_composition_profile_versions where id=new.source_system_profile_version_id and profile_id=profile.source_system_profile_id and authority_scope='PLATFORM_SYSTEM'and organisation_id is null and status in('PUBLISHED','RETIRED');
    if source_profile.id is null or source_version.id is null or profile.authority_scope<>'ORGANISATION'then raise exception'CHECKLIST_COMPOSITION_INHERITANCE_INVALID'using errcode='22023';end if;
  elsif new.source_system_profile_version_id is not null then raise exception'CHECKLIST_COMPOSITION_INHERITANCE_INVALID'using errcode='22023';
  end if;
  select*into prior from public.checklist_composition_profile_versions where profile_id=new.profile_id and status in('PUBLISHED','RETIRED')order by version_number desc limit 1;
  if prior.id is null then
    if new.version_number<>1 or new.supersedes_version_id is not null then raise exception'CHECKLIST_COMPOSITION_SUPERSESSION_INVALID'using errcode='22023';end if;
  elsif new.supersedes_version_id is distinct from prior.id or new.version_number<>prior.version_number+1 then
    raise exception'CHECKLIST_COMPOSITION_SUPERSESSION_INVALID'using errcode='22023';
  end if;
  return new;
end$$;
create trigger checklist_composition_version_coherence before insert or update on public.checklist_composition_profile_versions for each row execute function public.ftf_validate_checklist_composition_version_coherence();

create function public.ftf_checklist_platform_metadata_valid(p_value jsonb,p_depth integer default 0)returns boolean language plpgsql immutable set search_path=public,pg_temp as $$
declare entry record;scalar_value text;
begin
  if p_value is null or p_depth>5 then return false;end if;
  if jsonb_typeof(p_value)='object'then
    if(select count(*)from jsonb_object_keys(p_value))>50 then return false;end if;
    for entry in select key,value from jsonb_each(p_value)loop
      if length(entry.key)>100 or entry.key not in('authority','sourceIdentity','sourceLocator','sourceOutcome','documentTitle','documentRevision','effectiveDate','manufacturer','models','configurations','requiresMission','requiresFleetReadiness','requiresRtk','requiresCompassCalibration','requiresFlowCalibration','aircraftTypes')or not public.ftf_checklist_platform_metadata_valid(entry.value,p_depth+1)then return false;end if;
    end loop;
  elsif jsonb_typeof(p_value)='array'then
    if jsonb_array_length(p_value)>100 then return false;end if;
    for entry in select value from jsonb_array_elements(p_value)loop if not public.ftf_checklist_platform_metadata_valid(entry.value,p_depth+1)then return false;end if;end loop;
  elsif jsonb_typeof(p_value)='string'then
    scalar_value=p_value#>>'{}';if length(scalar_value)>2000 or scalar_value~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'then return false;end if;
  end if;
  return true;
end$$;

create function public.ftf_validate_checklist_multisource_sections(p_sections jsonb,p_authority_scope text)returns void language plpgsql immutable set search_path=public,pg_temp as $$
declare section jsonb;item jsonb;reference jsonb;reference_count integer;identities text[];identity text;
begin
  for section in select value from jsonb_array_elements(p_sections)loop
    for item in select value from jsonb_array_elements(section->'items')loop
      if item?'sourceReferences'then
        if jsonb_typeof(item->'sourceReferences')<>'array'or jsonb_array_length(item->'sourceReferences')not between 1 and 20 then raise exception'CHECKLIST_SOURCE_REFERENCES_INVALID'using errcode='22023';end if;
        identities='{}';reference_count=0;
        for reference in select value from jsonb_array_elements(item->'sourceReferences')loop
          identity=btrim(reference->>'sourceIdentity');reference_count=reference_count+1;
          if jsonb_typeof(reference)<>'object'or(reference->>'authorityClass')not in('DJI_MANUFACTURER','CASA_REGULATORY','SPRAY_COMMAND_WORKFLOW','ORGANISATION_STANDARD')or coalesce(length(identity),0)not between 1 and 200 or coalesce(length(btrim(reference->>'sourceLocator')),0)not between 1 and 500 or coalesce(length(btrim(reference->>'sourceOutcome')),0)not between 1 and 1000 or identity=any(identities)then raise exception'CHECKLIST_SOURCE_REFERENCES_INVALID'using errcode='22023';end if;
          identities=array_append(identities,identity);
        end loop;
        if coalesce((item->>'consolidated')::boolean,false)and reference_count<2 then raise exception'CHECKLIST_CONSOLIDATED_SOURCES_REQUIRED'using errcode='22023';end if;
      elsif p_authority_scope='PLATFORM_SYSTEM'and(item->>'authorityClass')<>'SPRAY_COMMAND_WORKFLOW'then raise exception'CHECKLIST_SOURCE_REFERENCES_REQUIRED'using errcode='22023';
      end if;
    end loop;
  end loop;
end$$;

create function public.ftf_reject_published_checklist_composition_module_mutation()returns trigger language plpgsql set search_path=public,pg_temp as $$
declare version_id uuid;version_status text;
begin
  version_id=case when tg_op='DELETE'then old.profile_version_id else new.profile_version_id end;
  select status into version_status from public.checklist_composition_profile_versions where id=version_id for share;
  if version_status in('PUBLISHED','RETIRED')then raise exception'published checklist composition modules are append-only';end if;
  return case when tg_op='DELETE'then old else new end;
end$$;

create function public.ftf_checklist_publication_module_valid(p_module jsonb,p_expected_ordinal integer)returns boolean language sql immutable set search_path=public,pg_temp as $$
  select jsonb_typeof(p_module)='object'
    and jsonb_typeof(p_module->'ordinal')='number'and(p_module->>'ordinal')~'^[1-9][0-9]{0,2}$'and(p_module->>'ordinal')::integer=p_expected_ordinal
    and jsonb_typeof(p_module->'templateVersionId')='string'and(p_module->>'templateVersionId')~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and jsonb_typeof(p_module->'stableSectionCode')='string'and length(btrim(p_module->>'stableSectionCode'))between 1 and 100
    and(not(p_module?'required')or jsonb_typeof(p_module->'required')='boolean')
$$;

create function public.ftf_publish_platform_checklist_composition(p_platform_user_id uuid,p_profile_version_id uuid,p_expected_version integer,p_payload jsonb)returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare version public.checklist_composition_profile_versions%rowtype;profile public.checklist_composition_profiles%rowtype;module jsonb;module_version public.checklist_template_versions%rowtype;module_template public.checklist_templates%rowtype;expected_ordinal integer=1;digest_value text;item_count integer;distinct_item_count integer;
begin
  if not public.ftf_platform_actor_has_permission(p_platform_user_id,'platform.checklist_system.publish')then return jsonb_build_object('forbidden',true);end if;
  select*into version from public.checklist_composition_profile_versions where id=p_profile_version_id for update;
  if not found or version.authority_scope<>'PLATFORM_SYSTEM'or version.organisation_id is not null or version.created_by_platform_user_id is null then return jsonb_build_object('not_found',true);end if;
  if version.status<>'DRAFT'or version.row_version<>p_expected_version then return jsonb_build_object('conflict',true,'currentVersion',version.row_version);end if;
  select*into profile from public.checklist_composition_profiles where id=version.profile_id for update;
  if not found or profile.authority_scope<>'PLATFORM_SYSTEM'or profile.organisation_id is not null or profile.source_system_profile_id is not null or profile.created_by_platform_user_id is null then return jsonb_build_object('composition_invalid',true,'reason','AUTHORITY_COHERENCE');end if;
  if not public.ftf_checklist_platform_metadata_valid(version.applicability)or not public.ftf_checklist_platform_metadata_valid(version.source_provenance)then return jsonb_build_object('composition_invalid',true,'reason','PLATFORM_METADATA_INVALID');end if;
  if jsonb_typeof(p_payload)<>'object'or jsonb_typeof(p_payload->'modules')<>'array'or jsonb_array_length(p_payload->'modules')not between 1 and 50 then return jsonb_build_object('composition_invalid',true,'reason','MODULES_INVALID');end if;
  for module in select value from jsonb_array_elements(p_payload->'modules')loop
    if not public.ftf_checklist_publication_module_valid(module,expected_ordinal)then return jsonb_build_object('composition_invalid',true,'reason','MODULES_INVALID');end if;
    perform pg_advisory_xact_lock(hashtextextended('checklist-module-applicability:'||(module->>'templateVersionId'),0));
    select*into module_version from public.checklist_template_versions where id=(module->>'templateVersionId')::uuid and status='PUBLISHED'and coalesce(effective_at,published_at,created_at)<=now();
    if not found then return jsonb_build_object('composition_invalid',true,'reason','MODULE_AUTHORITY');end if;
    select*into module_template from public.checklist_templates where id=module_version.template_id and status='PUBLISHED'and archived_at is null;
    if not found or module_version.authority_scope<>'PLATFORM_SYSTEM'or module_version.organisation_id is not null or module_version.created_by_platform_user_id is null or module_template.authority_scope<>'PLATFORM_SYSTEM'or module_template.organisation_id is not null then return jsonb_build_object('composition_invalid',true,'reason','MODULE_AUTHORITY');end if;
    if not public.ftf_checklist_platform_metadata_valid(module_version.source_provenance)or exists(select 1 from public.checklist_template_applicability application where application.template_version_id=module_version.id and(application.authority_scope<>'PLATFORM_SYSTEM'or application.organisation_id is not null or application.operating_location_id is not null or application.aircraft_id is not null or application.maintainable_asset_id is not null or application.asset_system_id is not null or application.component_position_id is not null or application.lifecycle_stage<>profile.lifecycle_stage or(application.manufacturer_scope is not null and upper(btrim(application.manufacturer_scope))is distinct from upper(btrim(version.applicability->>'manufacturer')))or(application.model_scope is not null and not exists(select 1 from jsonb_array_elements_text(coalesce(version.applicability->'models','[]'::jsonb))model where upper(btrim(model))=upper(btrim(application.model_scope))))or(application.configuration_code is not null and not exists(select 1 from jsonb_array_elements_text(coalesce(version.applicability->'configurations','[]'::jsonb))configuration where upper(btrim(configuration))=upper(btrim(application.configuration_code))))or not public.ftf_checklist_platform_metadata_valid(application.mission_context)))then return jsonb_build_object('composition_invalid',true,'reason','MODULE_APPLICABILITY');end if;
    perform public.ftf_validate_checklist_sections(module_version.sections,'PLATFORM_SYSTEM',module_version.source_system_template_version_id);
    perform public.ftf_validate_checklist_multisource_sections(module_version.sections,'PLATFORM_SYSTEM');
    expected_ordinal=expected_ordinal+1;
  end loop;
  for module in select value from jsonb_array_elements(p_payload->'modules')loop
    insert into public.checklist_composition_profile_modules(profile_version_id,ordinal,module_template_version_id,stable_section_code,required)values(version.id,(module->>'ordinal')::integer,(module->>'templateVersionId')::uuid,btrim(module->>'stableSectionCode'),coalesce((module->>'required')::boolean,true));
  end loop;
  select count(*),count(distinct(item->>'id'))into item_count,distinct_item_count from public.checklist_composition_profile_modules membership join public.checklist_template_versions mv on mv.id=membership.module_template_version_id cross join lateral jsonb_array_elements(mv.sections)section cross join lateral jsonb_array_elements(section->'items')item where membership.profile_version_id=version.id;
  if item_count<>distinct_item_count then raise exception'CHECKLIST_COMPOSITION_DUPLICATE_ITEM'using errcode='22023';end if;
  digest_value=public.ftf_checklist_composition_digest(version.id);
  update public.checklist_composition_profile_versions set status='PUBLISHED',published_at=now(),composition_digest=digest_value,row_version=row_version+1 where id=version.id;
  if profile.status='DRAFT'then update public.checklist_composition_profiles set status='PUBLISHED',row_version=row_version+1,updated_at=now()where id=profile.id;end if;
  insert into public.platform_audit_events(actor_auth_user_id,event_type,entity_type,entity_id,event_payload)select auth_user_id,'platform.checklist.composition.published','checklist_composition_profile_version',version.id,jsonb_build_object('compositionDigest',digest_value,'versionNumber',version.version_number)from public.platform_users where id=p_platform_user_id;
  insert into public.platform_transactional_outbox(topic,aggregate_type,aggregate_id,payload)values('platform.checklist.composition.published','checklist_composition_profile_version',version.id,jsonb_build_object('compositionDigest',digest_value,'versionNumber',version.version_number));
  return jsonb_build_object('record',jsonb_build_object('id',version.id,'profileId',profile.id,'versionNumber',version.version_number,'status','PUBLISHED','compositionDigest',digest_value,'rowVersion',version.row_version+1));
end$$;
create trigger checklist_composition_modules_immutable before insert or update or delete on public.checklist_composition_profile_modules for each row execute function public.ftf_reject_published_checklist_composition_module_mutation();
create function public.ftf_reject_published_composed_module_applicability_mutation()returns trigger language plpgsql set search_path=public,pg_temp as $$declare old_version_id uuid;new_version_id uuid;begin
  old_version_id=case when tg_op in('UPDATE','DELETE')then old.template_version_id end;new_version_id=case when tg_op in('INSERT','UPDATE')then new.template_version_id end;
  if old_version_id is not null and(new_version_id is null or old_version_id::text<=new_version_id::text)then perform pg_advisory_xact_lock(hashtextextended('checklist-module-applicability:'||old_version_id::text,0));end if;
  if new_version_id is not null and new_version_id is distinct from old_version_id then perform pg_advisory_xact_lock(hashtextextended('checklist-module-applicability:'||new_version_id::text,0));end if;
  if old_version_id is not null and new_version_id is not null and old_version_id::text>new_version_id::text then perform pg_advisory_xact_lock(hashtextextended('checklist-module-applicability:'||old_version_id::text,0));end if;
  if exists(select 1 from public.checklist_composition_profile_modules membership join public.checklist_composition_profile_versions composition_version on composition_version.id=membership.profile_version_id where membership.module_template_version_id in(old_version_id,new_version_id)and composition_version.status in('PUBLISHED','RETIRED'))then raise exception'published checklist composition applicability is append-only';end if;
  return case when tg_op='DELETE'then old else new end;
end$$;
create trigger checklist_composed_module_applicability_immutable before insert or update or delete on public.checklist_template_applicability for each row execute function public.ftf_reject_published_composed_module_applicability_mutation();

-- Canonical digest contract: SHA-256 over PostgreSQL jsonb text for the authority-only object below.
-- jsonb canonicalises object keys; ordered arrays preserve module, section and item authority order.
create function public.ftf_checklist_composition_authority(p_profile_version_id uuid)returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('schemaVersion',1,'profileId',profile.id,'profileVersionId',version.id,'profileVersionNumber',version.version_number,'lifecycleStage',profile.lifecycle_stage,'authorityScope',version.authority_scope,'organisationId',version.organisation_id,'sourceSystemProfileId',profile.source_system_profile_id,'sourceSystemProfileVersionId',version.source_system_profile_version_id,'supersedesVersionId',version.supersedes_version_id,'applicability',version.applicability,'sourceProvenance',version.source_provenance,'modules',coalesce((select jsonb_agg(jsonb_build_object('ordinal',membership.ordinal,'stableSectionCode',membership.stable_section_code,'required',membership.required,'templateId',module_version.template_id,'templateVersionId',module_version.id,'versionNumber',module_version.version_number,'authorityScope',module_version.authority_scope,'organisationId',module_version.organisation_id,'sourceSystemTemplateVersionId',module_version.source_system_template_version_id,'sourceProvenance',module_version.source_provenance,'applicability',coalesce((select jsonb_agg(jsonb_build_object('id',application.id,'authorityScope',application.authority_scope,'organisationId',application.organisation_id,'operatingLocationId',application.operating_location_id,'lifecycleStage',application.lifecycle_stage,'readinessRequired',application.readiness_required,'aircraftId',application.aircraft_id,'maintainableAssetId',application.maintainable_asset_id,'manufacturerScope',application.manufacturer_scope,'modelScope',application.model_scope,'assetSystemId',application.asset_system_id,'componentPositionId',application.component_position_id,'configurationCode',application.configuration_code,'missionContext',application.mission_context)order by application.id)from public.checklist_template_applicability application where application.template_version_id=module_version.id),'[]'::jsonb),'sections',module_version.sections)order by membership.ordinal)from public.checklist_composition_profile_modules membership join public.checklist_template_versions module_version on module_version.id=membership.module_template_version_id where membership.profile_version_id=version.id),'[]'::jsonb))
  from public.checklist_composition_profile_versions version join public.checklist_composition_profiles profile on profile.id=version.profile_id where version.id=p_profile_version_id
$$;
create function public.ftf_checklist_composition_digest(p_profile_version_id uuid)returns text language plpgsql stable security definer set search_path=public,pg_temp as $$begin return encode(digest(convert_to(public.ftf_checklist_composition_authority(p_profile_version_id)::text,'UTF8'),'sha256'),'hex');end$$;

create function public.ftf_publish_checklist_composition(p_organisation_id uuid,p_actor_internal_user_id uuid,p_profile_version_id uuid,p_expected_version integer,p_payload jsonb)returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare version public.checklist_composition_profile_versions%rowtype;profile public.checklist_composition_profiles%rowtype;module jsonb;module_version public.checklist_template_versions%rowtype;module_template public.checklist_templates%rowtype;expected_ordinal integer=1;digest_value text;item_count integer;distinct_item_count integer;
begin
  if not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'checklist_templates.publish')then return jsonb_build_object('forbidden',true);end if;
  select*into version from public.checklist_composition_profile_versions where id=p_profile_version_id for update;
  if not found or version.authority_scope<>'ORGANISATION'or version.organisation_id<>p_organisation_id then return jsonb_build_object('not_found',true);end if;
  if version.status<>'DRAFT'or version.row_version<>p_expected_version then return jsonb_build_object('conflict',true,'currentVersion',version.row_version);end if;
  select*into profile from public.checklist_composition_profiles where id=version.profile_id for update;
  if not found or profile.authority_scope<>version.authority_scope or profile.organisation_id is distinct from version.organisation_id then return jsonb_build_object('composition_invalid',true,'reason','AUTHORITY_COHERENCE');end if;
  if jsonb_typeof(p_payload)<>'object'or jsonb_typeof(p_payload->'modules')<>'array'or jsonb_array_length(p_payload->'modules')not between 1 and 50 then return jsonb_build_object('composition_invalid',true,'reason','MODULES_INVALID');end if;
  if version.source_system_profile_version_id is not null and p_payload->'modules'is distinct from(
    select coalesce(jsonb_agg(jsonb_build_object('ordinal',membership.ordinal,'templateVersionId',membership.module_template_version_id,'stableSectionCode',membership.stable_section_code,'required',membership.required)order by membership.ordinal),'[]'::jsonb)
    from public.checklist_composition_profile_modules membership where membership.profile_version_id=version.source_system_profile_version_id
  )then return jsonb_build_object('composition_invalid',true,'reason','ADOPTED_SOURCE_MISMATCH');end if;
  for module in select value from jsonb_array_elements(p_payload->'modules')loop
    if not public.ftf_checklist_publication_module_valid(module,expected_ordinal)then return jsonb_build_object('composition_invalid',true,'reason','MODULES_INVALID');end if;
    perform pg_advisory_xact_lock(hashtextextended('checklist-module-applicability:'||(module->>'templateVersionId'),0));
    select*into module_version from public.checklist_template_versions where id=(module->>'templateVersionId')::uuid and status='PUBLISHED'and coalesce(effective_at,published_at,created_at)<=now();
    if not found then return jsonb_build_object('composition_invalid',true,'reason','MODULE_AUTHORITY');end if;
    select*into module_template from public.checklist_templates where id=module_version.template_id and status='PUBLISHED'and archived_at is null;
    if not found or not(module_version.authority_scope='PLATFORM_SYSTEM'and module_version.organisation_id is null and module_template.authority_scope='PLATFORM_SYSTEM'and module_template.organisation_id is null or module_version.authority_scope='ORGANISATION'and module_version.organisation_id=p_organisation_id and module_template.authority_scope='ORGANISATION'and module_template.organisation_id=p_organisation_id)then return jsonb_build_object('composition_invalid',true,'reason','MODULE_AUTHORITY');end if;
    if module_version.source_system_template_version_id is not null and not exists(select 1 from public.checklist_template_versions source where source.id=module_version.source_system_template_version_id and source.authority_scope='PLATFORM_SYSTEM'and source.organisation_id is null and source.status in('PUBLISHED','RETIRED')and source.sections=module_version.sections)then return jsonb_build_object('composition_invalid',true,'reason','INHERITED_MODULE_MISMATCH');end if;
    if exists(select 1 from public.checklist_template_applicability application where application.template_version_id=module_version.id and(application.authority_scope<>module_version.authority_scope or application.organisation_id is distinct from module_version.organisation_id or application.lifecycle_stage<>profile.lifecycle_stage or application.mission_context<>'{}'::jsonb or(application.manufacturer_scope is not null and upper(btrim(application.manufacturer_scope))is distinct from upper(btrim(version.applicability->>'manufacturer')))or(application.model_scope is not null and not exists(select 1 from jsonb_array_elements_text(coalesce(version.applicability->'models','[]'::jsonb))model where upper(btrim(model))=upper(btrim(application.model_scope))))or(application.configuration_code is not null and not exists(select 1 from jsonb_array_elements_text(coalesce(version.applicability->'configurations','[]'::jsonb))configuration where upper(btrim(configuration))=upper(btrim(application.configuration_code))))))then return jsonb_build_object('composition_invalid',true,'reason','MODULE_APPLICABILITY');end if;
    perform public.ftf_validate_checklist_sections(module_version.sections,module_version.authority_scope,module_version.source_system_template_version_id);
    perform public.ftf_validate_checklist_multisource_sections(module_version.sections,module_version.authority_scope);
    expected_ordinal=expected_ordinal+1;
  end loop;
  for module in select value from jsonb_array_elements(p_payload->'modules')loop
    insert into public.checklist_composition_profile_modules(profile_version_id,ordinal,module_template_version_id,stable_section_code,required)values(version.id,(module->>'ordinal')::integer,(module->>'templateVersionId')::uuid,btrim(module->>'stableSectionCode'),coalesce((module->>'required')::boolean,true));
  end loop;
  select count(*),count(distinct(item->>'id'))into item_count,distinct_item_count from public.checklist_composition_profile_modules membership join public.checklist_template_versions mv on mv.id=membership.module_template_version_id cross join lateral jsonb_array_elements(mv.sections)section cross join lateral jsonb_array_elements(section->'items')item where membership.profile_version_id=version.id;
  if item_count<>distinct_item_count then raise exception'CHECKLIST_COMPOSITION_DUPLICATE_ITEM'using errcode='22023';end if;
  digest_value=public.ftf_checklist_composition_digest(version.id);
  update public.checklist_composition_profile_versions set status='PUBLISHED',published_at=now(),composition_digest=digest_value,row_version=row_version+1 where id=version.id;
  if profile.status='DRAFT'then update public.checklist_composition_profiles set status='PUBLISHED',row_version=row_version+1,updated_at=now()where id=profile.id;end if;
  insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)values(p_organisation_id,p_actor_internal_user_id,'checklist.composition.published','checklist_composition_profile_version',version.id,jsonb_build_object('compositionDigest',digest_value,'versionNumber',version.version_number));
  insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)values(p_organisation_id,'checklist.composition.published','checklist_composition_profile_version',version.id,jsonb_build_object('compositionDigest',digest_value,'versionNumber',version.version_number));
  return jsonb_build_object('record',jsonb_build_object('id',version.id,'profileId',profile.id,'versionNumber',version.version_number,'status','PUBLISHED','compositionDigest',digest_value,'rowVersion',version.row_version+1));
exception when others then raise;
end$$;

create function public.ftf_resolve_checklist_configuration(p_organisation_id uuid,p_operating_location_id uuid,p_mission_id uuid,p_aircraft_id uuid)returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare candidate_count integer;resolved text;kit_id uuid;
begin
  if p_mission_id is null or p_aircraft_id is null then return jsonb_build_object('status','UNRESOLVED');end if;
  select count(*),min(upper(btrim(k.kit_type))),min(k.id::text)::uuid into candidate_count,resolved,kit_id from public.mission_equipment_kit_assignments mission_kit join public.equipment_kits k on k.organisation_id=mission_kit.organisation_id and k.id=mission_kit.equipment_kit_id and k.operating_location_id=p_operating_location_id and k.archived_at is null join public.aircraft_equipment_kit_assignments aircraft_kit on aircraft_kit.organisation_id=mission_kit.organisation_id and aircraft_kit.equipment_kit_id=mission_kit.equipment_kit_id and aircraft_kit.aircraft_id=p_aircraft_id and aircraft_kit.operating_location_id=p_operating_location_id and aircraft_kit.unassigned_at is null and aircraft_kit.archived_at is null where mission_kit.organisation_id=p_organisation_id and mission_kit.mission_id=p_mission_id and mission_kit.operating_location_id=p_operating_location_id and mission_kit.unassigned_at is null and upper(btrim(k.kit_type))in('SPRAY','SPREAD');
  if candidate_count=0 then return jsonb_build_object('status','UNRESOLVED');elsif candidate_count>1 then return jsonb_build_object('status','AMBIGUOUS');end if;
  return jsonb_build_object('status','RESOLVED','configurationCode',resolved,'equipmentKitId',kit_id);
end$$;

create function public.ftf_lock_checklist_configuration_scope(p_organisation_id uuid,p_operating_location_id uuid)returns void language plpgsql set search_path=public,pg_temp as $$begin perform pg_advisory_xact_lock(hashtextextended('checklist-configuration:'||p_organisation_id::text||':'||p_operating_location_id::text,0));end$$;
create function public.ftf_lock_checklist_configuration_assignment_mutation()returns trigger language plpgsql set search_path=public,pg_temp as $$begin
  if tg_op<>'INSERT'then perform public.ftf_lock_checklist_configuration_scope(old.organisation_id,old.operating_location_id);end if;
  if tg_op<>'DELETE'and(tg_op='INSERT'or new.organisation_id is distinct from old.organisation_id or new.operating_location_id is distinct from old.operating_location_id)then perform public.ftf_lock_checklist_configuration_scope(new.organisation_id,new.operating_location_id);end if;
  return case when tg_op='DELETE'then old else new end;
end$$;
create trigger mission_equipment_kit_checklist_configuration_lock before insert or update or delete on public.mission_equipment_kit_assignments for each row execute function public.ftf_lock_checklist_configuration_assignment_mutation();
create trigger aircraft_equipment_kit_checklist_configuration_lock before insert or update or delete on public.aircraft_equipment_kit_assignments for each row execute function public.ftf_lock_checklist_configuration_assignment_mutation();

create function public.ftf_preview_checklist_composition(p_organisation_id uuid,p_actor_internal_user_id uuid,p_profile_version_id uuid,p_operating_location_id uuid,p_lifecycle_stage text,p_mission_id uuid,p_aircraft_id uuid,p_maintainable_asset_id uuid,p_configuration_code text)returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare version public.checklist_composition_profile_versions%rowtype;profile public.checklist_composition_profiles%rowtype;aircraft public.aircraft%rowtype;configuration jsonb;authority jsonb;sections jsonb;modules jsonb;context_evidence jsonb;actual_digest text;
begin
  if not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'checklists.execute')then return jsonb_build_object('forbidden',true);end if;
  if p_lifecycle_stage not in('PRE_FLIGHT','POST_FLIGHT','MAINTENANCE','GENERAL')then return jsonb_build_object('invalid_context',true);end if;
  if not public.ftf_checklist_asset_scope_allowed(p_organisation_id,p_actor_internal_user_id,p_operating_location_id,p_aircraft_id,p_maintainable_asset_id,null,null)then return jsonb_build_object('not_found',true);end if;
  if p_mission_id is not null and not exists(select 1 from public.missions where organisation_id=p_organisation_id and id=p_mission_id and operating_location_id=p_operating_location_id and archived_at is null)then return jsonb_build_object('not_found',true);end if;
  if p_mission_id is not null and p_aircraft_id is not null and not exists(select 1 from public.mission_aircraft_assignments where organisation_id=p_organisation_id and mission_id=p_mission_id and aircraft_id=p_aircraft_id and operating_location_id=p_operating_location_id and unassigned_at is null)then return jsonb_build_object('not_found',true);end if;
  select*into version from public.checklist_composition_profile_versions where id=p_profile_version_id and status='PUBLISHED'and coalesce(effective_at,published_at,created_at)<=now();if not found then return jsonb_build_object('not_found',true);end if;
  select*into profile from public.checklist_composition_profiles where id=version.profile_id and status='PUBLISHED'and archived_at is null;if not found or profile.authority_scope is distinct from version.authority_scope or profile.organisation_id is distinct from version.organisation_id or(profile.authority_scope='ORGANISATION'and profile.organisation_id<>p_organisation_id)then return jsonb_build_object('not_found',true);end if;
  if profile.lifecycle_stage<>p_lifecycle_stage then return jsonb_build_object('not_applicable',true);end if;
  if version.applicability?'manufacturer'or jsonb_typeof(version.applicability->'models')='array'or jsonb_typeof(version.applicability->'configurations')='array'then if p_aircraft_id is null then return jsonb_build_object('applicability_unresolved',true,'reason','AIRCRAFT_REQUIRED');end if;end if;
  if p_aircraft_id is not null then select*into aircraft from public.aircraft where organisation_id=p_organisation_id and id=p_aircraft_id and operating_location_id=p_operating_location_id and archived_at is null;if not found then return jsonb_build_object('not_found',true);end if;end if;
  if version.applicability?'requiresMission'and(version.applicability->>'requiresMission')::boolean and p_mission_id is null then return jsonb_build_object('applicability_unresolved',true,'reason','MISSION_REQUIRED');end if;
  if version.applicability?'manufacturer'and upper(btrim(version.applicability->>'manufacturer'))is distinct from upper(btrim(aircraft.manufacturer))then return jsonb_build_object('not_applicable',true);end if;
  if jsonb_typeof(version.applicability->'models')='array'and not exists(select 1 from jsonb_array_elements_text(version.applicability->'models')model where upper(btrim(model))=upper(btrim(aircraft.model)))then return jsonb_build_object('not_applicable',true);end if;
  configuration=public.ftf_resolve_checklist_configuration(p_organisation_id,p_operating_location_id,p_mission_id,p_aircraft_id);
  if configuration->>'status'='AMBIGUOUS'then return jsonb_build_object('configuration_ambiguous',true);end if;
  if p_configuration_code is not null and(configuration->>'status'<>'RESOLVED'or upper(btrim(p_configuration_code))<>configuration->>'configurationCode')then return jsonb_build_object('configuration_mismatch',true);end if;
  if jsonb_typeof(version.applicability->'configurations')='array'and(configuration->>'status'<>'RESOLVED'or not exists(select 1 from jsonb_array_elements_text(version.applicability->'configurations')value where upper(btrim(value))=configuration->>'configurationCode'))then return jsonb_build_object('applicability_unresolved',true,'reason','CONFIGURATION_UNRESOLVED');end if;
  if version.applicability?'requiresFleetReadiness'or version.applicability?'requiresRtk'or version.applicability?'requiresCompassCalibration'or version.applicability?'requiresFlowCalibration'then return jsonb_build_object('applicability_unresolved',true,'reason','AUTHORITATIVE_EVIDENCE_REQUIRED');end if;
  if exists(select 1 from public.checklist_composition_profile_modules membership where membership.profile_version_id=version.id and exists(select 1 from public.checklist_template_applicability any_application where any_application.template_version_id=membership.module_template_version_id)and not exists(select 1 from public.checklist_template_applicability application where application.template_version_id=membership.module_template_version_id and application.lifecycle_stage=p_lifecycle_stage and application.organisation_id is not distinct from case when application.authority_scope='PLATFORM_SYSTEM'then null else p_organisation_id end and(application.operating_location_id is null or application.operating_location_id=p_operating_location_id)and(application.aircraft_id is null or application.aircraft_id=p_aircraft_id)and(application.maintainable_asset_id is null or application.maintainable_asset_id=p_maintainable_asset_id)and(application.manufacturer_scope is null or upper(btrim(application.manufacturer_scope))=upper(btrim(aircraft.manufacturer)))and(application.model_scope is null or upper(btrim(application.model_scope))=upper(btrim(aircraft.model)))and(application.configuration_code is null or upper(btrim(application.configuration_code))=configuration->>'configurationCode')))then return jsonb_build_object('not_applicable',true);end if;
  authority=public.ftf_checklist_composition_authority(version.id);actual_digest=public.ftf_checklist_composition_digest(version.id);if version.composition_digest is null or actual_digest<>version.composition_digest then return jsonb_build_object('composition_invalid',true,'reason','DIGEST_MISMATCH');end if;
  modules=authority->'modules';select coalesce(jsonb_agg(jsonb_set(section,'{module}',module-'sections',true)order by(module->>'ordinal')::integer,section_ordinal),'[]'::jsonb)into sections from jsonb_array_elements(modules)module cross join lateral jsonb_array_elements(module->'sections')with ordinality source_section(section,section_ordinal);
  context_evidence=jsonb_build_array(jsonb_build_object('code','MISSION','status',case when p_mission_id is null then'UNRESOLVED'else'RESOLVED'end,'recordId',p_mission_id),jsonb_build_object('code','AIRCRAFT','status',case when p_aircraft_id is null then'UNRESOLVED'else'RESOLVED'end,'recordId',p_aircraft_id),jsonb_build_object('code','BASE','status','RESOLVED','recordId',p_operating_location_id),jsonb_build_object('code','CONFIGURATION','status',configuration->>'status','value',configuration->>'configurationCode'));
  return jsonb_build_object('schemaVersion',1,'compositionDigest',actual_digest,'profileId',profile.id,'profileVersionId',version.id,'profileVersionNumber',version.version_number,'authorityScope',version.authority_scope,'sourceSystemProfileId',profile.source_system_profile_id,'sourceSystemProfileVersionId',version.source_system_profile_version_id,'sourceProvenance',version.source_provenance,'applicability',version.applicability,'assetContext',jsonb_build_object('organisationId',p_organisation_id,'operatingLocationId',p_operating_location_id,'missionId',p_mission_id,'aircraftId',p_aircraft_id,'maintainableAssetId',p_maintainable_asset_id,'configurationCode',configuration->>'configurationCode','equipmentKitId',configuration->>'equipmentKitId'),'resolvedEvidence',context_evidence,'modules',(select coalesce(jsonb_agg(module-'sections'),'[]'::jsonb)from jsonb_array_elements(modules)module),'sections',sections);
end$$;

create function public.ftf_start_composed_checklist_execution(p_organisation_id uuid,p_actor_internal_user_id uuid,p_profile_version_id uuid,p_operating_location_id uuid,p_lifecycle_stage text,p_mission_id uuid,p_aircraft_id uuid,p_maintainable_asset_id uuid,p_configuration_code text,p_expected_composition_digest text)returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare snapshot jsonb;root_version public.checklist_template_versions%rowtype;person public.personnel%rowtype;execution public.checklist_executions%rowtype;
begin
  if p_expected_composition_digest is null or p_expected_composition_digest!~'^[a-f0-9]{64}$'then return jsonb_build_object('invalid_context',true);end if;
  perform public.ftf_lock_checklist_configuration_scope(p_organisation_id,p_operating_location_id);
  perform 1 from public.checklist_composition_profile_versions where id=p_profile_version_id for share;
  perform 1 from public.checklist_composition_profile_modules where profile_version_id=p_profile_version_id order by ordinal for share;
  perform 1 from public.mission_equipment_kit_assignments where organisation_id=p_organisation_id and mission_id=p_mission_id and unassigned_at is null for share;
  perform 1 from public.aircraft_equipment_kit_assignments where organisation_id=p_organisation_id and aircraft_id=p_aircraft_id and unassigned_at is null and archived_at is null for share;
  snapshot=public.ftf_preview_checklist_composition(p_organisation_id,p_actor_internal_user_id,p_profile_version_id,p_operating_location_id,p_lifecycle_stage,p_mission_id,p_aircraft_id,p_maintainable_asset_id,p_configuration_code);
  if snapshot?'forbidden'or snapshot?'not_found'or snapshot?'not_applicable'or snapshot?'applicability_unresolved'or snapshot?'configuration_mismatch'or snapshot?'configuration_ambiguous'or snapshot?'composition_invalid'or snapshot?'invalid_context'then return snapshot;end if;
  if snapshot->>'compositionDigest'<>p_expected_composition_digest then return jsonb_build_object('stale_composition',true,'expectedDigest',p_expected_composition_digest,'currentDigest',snapshot->>'compositionDigest');end if;
  select*into root_version from public.checklist_template_versions where id=(snapshot->'modules'->0->>'templateVersionId')::uuid for share;if not found then return jsonb_build_object('composition_invalid',true);end if;
  select*into person from public.personnel where organisation_id=p_organisation_id and internal_user_id=p_actor_internal_user_id and is_active and archived_at is null;if not found then return jsonb_build_object('ineligible_completing_personnel',true);end if;
  insert into public.checklist_executions(organisation_id,operating_location_id,mission_id,template_id,template_version_id,lifecycle_stage,completing_personnel_id,completing_personnel_snapshot,aircraft_id,maintainable_asset_id,configuration_snapshot,applicability_snapshot,frozen_checklist_snapshot,composition_profile_version_id,frozen_composition_snapshot,created_by_internal_user_id)values(p_organisation_id,p_operating_location_id,p_mission_id,root_version.template_id,root_version.id,p_lifecycle_stage,person.id,jsonb_build_object('id',person.id,'fullName',person.full_name,'internalUserId',p_actor_internal_user_id),p_aircraft_id,p_maintainable_asset_id,snapshot->'assetContext',snapshot->'applicability',snapshot,p_profile_version_id,snapshot,p_actor_internal_user_id)returning*into execution;
  insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)values(p_organisation_id,p_actor_internal_user_id,'checklist.composition.execution.started','checklist_execution',execution.id,jsonb_build_object('profileVersionId',p_profile_version_id,'compositionDigest',p_expected_composition_digest,'version',execution.row_version));
  insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)values(p_organisation_id,'checklist.composition.execution.started','checklist_execution',execution.id,jsonb_build_object('profileVersionId',p_profile_version_id,'compositionDigest',p_expected_composition_digest,'version',execution.row_version));
  return jsonb_build_object('record',to_jsonb(execution),'composition',snapshot);
end$$;

create function public.ftf_read_checklist_composition_library(p_organisation_id uuid,p_actor_internal_user_id uuid)returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare records jsonb;begin
  if not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'checklist_templates.read')then return jsonb_build_object('forbidden',true);end if;
  select coalesce(jsonb_agg(item.record order by item.authority_scope desc,item.stable_code,item.version_number desc),'[]'::jsonb)into records from(
    select profile.authority_scope,profile.stable_code,version.version_number,jsonb_build_object('profileId',profile.id,'profileVersionId',version.id,'stableCode',profile.stable_code,'name',profile.name,'lifecycleStage',profile.lifecycle_stage,'versionNumber',version.version_number,'compositionDigest',version.composition_digest,'sourceSystemProfileId',profile.source_system_profile_id,'sourceSystemProfileVersionId',version.source_system_profile_version_id,'proposedModules',(select coalesce(jsonb_agg(jsonb_build_object('ordinal',membership.ordinal,'templateVersionId',membership.module_template_version_id,'stableSectionCode',membership.stable_section_code,'required',membership.required)order by membership.ordinal),'[]'::jsonb)from public.checklist_composition_profile_modules membership where membership.profile_version_id=version.id),'updateAvailable',case when version.authority_scope='ORGANISATION'and version.source_system_profile_version_id is not null then exists(select 1 from public.checklist_composition_profile_versions newer where newer.profile_id=profile.source_system_profile_id and newer.status='PUBLISHED'and newer.version_number>(select source.version_number from public.checklist_composition_profile_versions source where source.id=version.source_system_profile_version_id))else false end)record
    from public.checklist_composition_profiles profile join public.checklist_composition_profile_versions version on version.profile_id=profile.id and version.status='PUBLISHED'where profile.status='PUBLISHED'and profile.archived_at is null and(profile.authority_scope='PLATFORM_SYSTEM'or profile.organisation_id=p_organisation_id)order by profile.authority_scope desc,profile.stable_code,version.version_number desc limit 100
  )item;
  return jsonb_build_object('records',records);
end$$;

create function public.ftf_adopt_system_checklist_composition(p_organisation_id uuid,p_actor_internal_user_id uuid,p_source_profile_version_id uuid,p_stable_code text,p_name text)returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare source_version public.checklist_composition_profile_versions%rowtype;source_profile public.checklist_composition_profiles%rowtype;profile public.checklist_composition_profiles%rowtype;version public.checklist_composition_profile_versions%rowtype;begin
  if not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'checklist_templates.author')then return jsonb_build_object('forbidden',true);end if;
  if coalesce(length(btrim(p_stable_code)),0)not between 1 and 100 or coalesce(length(btrim(p_name)),0)not between 1 and 300 then return jsonb_build_object('invalid_context',true);end if;
  select*into source_version from public.checklist_composition_profile_versions where id=p_source_profile_version_id and authority_scope='PLATFORM_SYSTEM'and organisation_id is null and status='PUBLISHED'for share;
  if not found or source_version.composition_digest is null or source_version.composition_digest<>public.ftf_checklist_composition_digest(source_version.id)then return jsonb_build_object('not_found',true);end if;
  select*into source_profile from public.checklist_composition_profiles where id=source_version.profile_id and authority_scope='PLATFORM_SYSTEM'and organisation_id is null and status='PUBLISHED'and archived_at is null for share;if not found then return jsonb_build_object('not_found',true);end if;
  insert into public.checklist_composition_profiles(authority_scope,organisation_id,stable_code,name,lifecycle_stage,status,source_system_profile_id,created_by_internal_user_id)values('ORGANISATION',p_organisation_id,btrim(p_stable_code),btrim(p_name),source_profile.lifecycle_stage,'DRAFT',source_profile.id,p_actor_internal_user_id)returning*into profile;
  insert into public.checklist_composition_profile_versions(profile_id,authority_scope,organisation_id,version_number,status,effective_at,change_summary,applicability,source_provenance,source_system_profile_version_id,created_by_internal_user_id)values(profile.id,'ORGANISATION',p_organisation_id,1,'DRAFT',source_version.effective_at,'Adopted exact system composition',source_version.applicability,jsonb_build_object('sourceSystemProfileVersionId',source_version.id,'sourceCompositionDigest',source_version.composition_digest),source_version.id,p_actor_internal_user_id)returning*into version;
  insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)values(p_organisation_id,p_actor_internal_user_id,'checklist.composition.adopted','checklist_composition_profile_version',version.id,jsonb_build_object('sourceSystemProfileVersionId',source_version.id,'sourceCompositionDigest',source_version.composition_digest));
  insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)values(p_organisation_id,'checklist.composition.adopted','checklist_composition_profile_version',version.id,jsonb_build_object('sourceSystemProfileVersionId',source_version.id,'sourceCompositionDigest',source_version.composition_digest));
  return jsonb_build_object('record',jsonb_build_object('profileId',profile.id,'profileVersionId',version.id,'sourceSystemProfileVersionId',source_version.id,'sourceCompositionDigest',source_version.composition_digest,'proposedModules',(select coalesce(jsonb_agg(jsonb_build_object('ordinal',membership.ordinal,'templateVersionId',membership.module_template_version_id,'stableSectionCode',membership.stable_section_code,'required',membership.required)order by membership.ordinal),'[]'::jsonb)from public.checklist_composition_profile_modules membership where membership.profile_version_id=source_version.id),'status','DRAFT','rowVersion',version.row_version));
end$$;

revoke all on function public.ftf_checklist_platform_metadata_valid(jsonb,integer),public.ftf_validate_checklist_multisource_sections(jsonb,text),public.ftf_checklist_publication_module_valid(jsonb,integer),public.ftf_reject_published_checklist_composition_module_mutation(),public.ftf_reject_published_composed_module_applicability_mutation(),public.ftf_checklist_composition_authority(uuid),public.ftf_checklist_composition_digest(uuid),public.ftf_publish_checklist_composition(uuid,uuid,uuid,integer,jsonb),public.ftf_publish_platform_checklist_composition(uuid,uuid,integer,jsonb),public.ftf_resolve_checklist_configuration(uuid,uuid,uuid,uuid),public.ftf_lock_checklist_configuration_scope(uuid,uuid),public.ftf_lock_checklist_configuration_assignment_mutation(),public.ftf_preview_checklist_composition(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,text),public.ftf_start_composed_checklist_execution(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,text,text),public.ftf_read_checklist_composition_library(uuid,uuid),public.ftf_adopt_system_checklist_composition(uuid,uuid,uuid,text,text)from public,anon,authenticated;
grant execute on function public.ftf_publish_checklist_composition(uuid,uuid,uuid,integer,jsonb),public.ftf_publish_platform_checklist_composition(uuid,uuid,integer,jsonb),public.ftf_preview_checklist_composition(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,text),public.ftf_start_composed_checklist_execution(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,text,text),public.ftf_read_checklist_composition_library(uuid,uuid),public.ftf_adopt_system_checklist_composition(uuid,uuid,uuid,text,text)to service_role;
