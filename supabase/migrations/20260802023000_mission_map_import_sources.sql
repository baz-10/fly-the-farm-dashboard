-- Immutable, provider-neutral source evidence for Mission map imports.
-- Supabase supplies the storage schema; the guarded dynamic statement also lets
-- the repository's portable PostgreSQL migration harness exercise this file.
do $migration$
begin
  if to_regclass('storage.buckets') is not null then
    execute $storage$
      insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
      values('mission-map-imports','mission-map-imports',false,3145728,array[
        'application/vnd.google-earth.kml+xml','application/vnd.google-earth.kmz',
        'application/zip','application/x-zip-compressed','application/octet-stream'
      ]) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types
    $storage$;
  end if;
end
$migration$;

create table public.mission_map_source_files (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, operating_location_id uuid not null,
  mission_id uuid not null, storage_provider text not null default 'supabase', storage_bucket text not null,
  storage_object_key text not null, original_filename text not null, source_format text not null check(source_format in ('kml','kmz','shapefile')),
  content_type text not null, file_size_bytes bigint not null check(file_size_bytes>0 and file_size_bytes<=3145728),
  sha256_checksum text not null check(sha256_checksum ~ '^[a-f0-9]{64}$'), original_crs text,
  transformation_metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(transformation_metadata)='object'),
  validation_result jsonb not null check(jsonb_typeof(validation_result)='object'), imported_by_internal_user_id uuid not null,
  imported_at timestamptz not null default now(), created_at timestamptz not null default now(), unique(organisation_id,id),
  unique(organisation_id,storage_bucket,storage_object_key),
  foreign key(organisation_id,mission_id) references public.missions(organisation_id,id),
  foreign key(organisation_id,operating_location_id) references public.operating_locations(organisation_id,id),
  foreign key(organisation_id,imported_by_internal_user_id) references public.internal_users(organisation_id,id)
);
create index mission_map_source_files_mission_idx on public.mission_map_source_files(organisation_id,mission_id,imported_at desc);
alter table public.mission_map_source_files enable row level security;
alter table public.mission_map_source_files force row level security;
create policy mission_map_source_files_tenant_access on public.mission_map_source_files for select to authenticated
using(public.current_user_has_organisation_access(organisation_id));
revoke all on table public.mission_map_source_files from public,anon,authenticated;
grant select,insert on table public.mission_map_source_files to service_role;

alter table public.mission_geometry_versions
  add constraint mission_geometry_source_file_fk foreign key(organisation_id,source_file_id)
  references public.mission_map_source_files(organisation_id,id);

create function public.ftf_create_mission_map_source_file(
  p_organisation_id uuid,p_actor_internal_user_id uuid,p_mission_id uuid,p_storage_provider text,p_storage_bucket text,
  p_storage_object_key text,p_original_filename text,p_source_format text,p_content_type text,p_file_size_bytes bigint,
  p_sha256_checksum text,p_original_crs text,p_transformation_metadata jsonb,p_validation_result jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_mission public.missions%rowtype;v_file public.mission_map_source_files%rowtype;
begin
  select * into v_mission from public.missions where organisation_id=p_organisation_id and id=p_mission_id and archived_at is null;
  if not found then return jsonb_build_object('not_found',true); end if;
  if lower(v_mission.status)<>'planning' then return jsonb_build_object('relationship_conflict',true); end if;
  insert into public.mission_map_source_files(
    organisation_id,operating_location_id,mission_id,storage_provider,storage_bucket,storage_object_key,original_filename,
    source_format,content_type,file_size_bytes,sha256_checksum,original_crs,transformation_metadata,validation_result,imported_by_internal_user_id
  ) values(
    p_organisation_id,v_mission.operating_location_id,p_mission_id,p_storage_provider,p_storage_bucket,p_storage_object_key,p_original_filename,
    p_source_format,p_content_type,p_file_size_bytes,p_sha256_checksum,p_original_crs,coalesce(p_transformation_metadata,'{}'::jsonb),p_validation_result,p_actor_internal_user_id
  ) returning * into v_file;
  insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)
  values(p_organisation_id,p_actor_internal_user_id,'mission_map.source_file_created','mission_map_source_file',v_file.id,
    jsonb_build_object('mission_id',p_mission_id,'source_format',p_source_format,'checksum',p_sha256_checksum));
  insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)
  values(p_organisation_id,'operational.mission_map.source_file_created','mission',p_mission_id,
    jsonb_build_object('source_file_id',v_file.id,'source_format',p_source_format,'checksum',p_sha256_checksum));
  return to_jsonb(v_file);
end;$$;

create or replace function public.ftf_read_mission_map(p_organisation_id uuid,p_mission_id uuid,p_history boolean default false)
returns setof jsonb language sql security definer set search_path=public,pg_temp as $$
  with revisions as (select r.* from public.mission_map_revisions r where r.organisation_id=p_organisation_id and r.mission_id=p_mission_id order by r.version_number desc limit case when p_history then 2147483647 else 1 end)
  select to_jsonb(r)||jsonb_build_object('geometries',coalesce((select jsonb_agg(jsonb_build_object(
    'id',g.geometry_id,'role',g.geometry_role,'geometryType',g.geometry_type,'geometry',g.canonical_geometry,
    'sourceCrs',g.source_crs,'canonicalCrs',g.canonical_crs,'sourceFileId',g.source_file_id,'provenance',g.provenance,
    'validationState',g.validation_state,'areaHectares',g.area_hectares,'lengthMetres',g.length_metres,'label',g.label,'notes',g.notes,
    'sourceFile',case when f.id is null then null else jsonb_build_object('id',f.id,'originalFilename',f.original_filename,
      'sourceFormat',f.source_format,'fileSizeBytes',f.file_size_bytes,'checksum',f.sha256_checksum,'originalCrs',f.original_crs,
      'transformationMetadata',f.transformation_metadata,'validationResult',f.validation_result,'importedAt',f.imported_at,
      'importedBy',f.imported_by_internal_user_id) end) order by g.created_at,g.geometry_id)
    from public.mission_geometry_versions g left join public.mission_map_source_files f on f.organisation_id=g.organisation_id and f.id=g.source_file_id
    where g.organisation_id=r.organisation_id and g.revision_id=r.id),'[]'::jsonb)) from revisions r;
$$;

create or replace function public.ftf_save_mission_map(p_organisation_id uuid,p_actor_internal_user_id uuid,p_mission_id uuid,p_expected_version integer,p_notes text,p_source_field_boundary_version_id uuid,p_geometries jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_mission public.missions%rowtype;v_current integer;v_revision public.mission_map_revisions%rowtype;v_item jsonb;v_record jsonb;
begin
 select * into v_mission from public.missions where organisation_id=p_organisation_id and id=p_mission_id and archived_at is null for update;
 if not found then return jsonb_build_object('not_found',true); end if;
 if lower(v_mission.status)<>'planning' then return jsonb_build_object('relationship_conflict',true); end if;
 select coalesce(max(version_number),0) into v_current from public.mission_map_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id;
 if v_current<>p_expected_version then return jsonb_build_object('conflict',true,'current_version',v_current); end if;
 if p_source_field_boundary_version_id is not null and not exists(select 1 from public.field_boundary_versions f join public.job_fields jf on jf.organisation_id=f.organisation_id and jf.field_id=f.field_id join public.jobs j on j.organisation_id=jf.organisation_id and j.id=jf.job_id where f.organisation_id=p_organisation_id and f.id=p_source_field_boundary_version_id and j.id=v_mission.job_id and f.archived_at is null and jf.archived_at is null) then return jsonb_build_object('relationship_conflict',true); end if;
 for v_item in select value from jsonb_array_elements(p_geometries) loop
  if v_item->>'sourceFileId' is not null and not exists(select 1 from public.mission_map_source_files f where f.organisation_id=p_organisation_id and f.id=(v_item->>'sourceFileId')::uuid and f.mission_id=v_mission.id and f.operating_location_id=v_mission.operating_location_id) then return jsonb_build_object('relationship_conflict',true); end if;
 end loop;
 insert into public.mission_map_revisions(organisation_id,operating_location_id,mission_id,version_number,notes,source_field_boundary_version_id,created_by_internal_user_id)
 values(p_organisation_id,v_mission.operating_location_id,p_mission_id,v_current+1,coalesce(p_notes,''),p_source_field_boundary_version_id,p_actor_internal_user_id) returning * into v_revision;
 for v_item in select value from jsonb_array_elements(p_geometries) loop
  insert into public.mission_geometry_versions(organisation_id,operating_location_id,mission_id,revision_id,geometry_id,version_number,geometry_role,geometry_type,canonical_geometry,source_crs,canonical_crs,source_file_id,provenance,validation_state,area_hectares,length_metres,label,notes,created_by_internal_user_id)
  values(p_organisation_id,v_mission.operating_location_id,p_mission_id,v_revision.id,(v_item->>'id')::uuid,v_revision.version_number,v_item->>'role',v_item->>'geometryType',v_item->'geometry',v_item->>'sourceCrs',v_item->>'canonicalCrs',nullif(v_item->>'sourceFileId','')::uuid,v_item->>'provenance',v_item->>'validationState',nullif(v_item->>'areaHectares','')::numeric,nullif(v_item->>'lengthMetres','')::numeric,coalesce(v_item->>'label',''),coalesce(v_item->>'notes',''),p_actor_internal_user_id);
 end loop;
 select * into v_record from public.ftf_read_mission_map(p_organisation_id,p_mission_id,false) limit 1;
 insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload) values(p_organisation_id,p_actor_internal_user_id,'mission_map.version_created','mission',p_mission_id,jsonb_build_object('version',v_revision.version_number,'geometry_count',jsonb_array_length(p_geometries)));
 insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload) values(p_organisation_id,'operational.mission_map.version_created','mission',p_mission_id,jsonb_build_object('version',v_revision.version_number,'revision_id',v_revision.id));
 return jsonb_build_object('record',v_record);
end;$$;

revoke all on function public.ftf_create_mission_map_source_file(uuid,uuid,uuid,text,text,text,text,text,text,bigint,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ftf_create_mission_map_source_file(uuid,uuid,uuid,text,text,text,text,text,text,bigint,text,text,jsonb,jsonb) to service_role;
