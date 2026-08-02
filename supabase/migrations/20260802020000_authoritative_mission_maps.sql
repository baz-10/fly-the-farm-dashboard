-- Versioned, first-class Mission planning geometry. Mission edits never mutate Field boundaries.
create table public.mission_map_revisions (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, operating_location_id uuid not null,
  mission_id uuid not null, version_number integer not null check(version_number>0), notes text not null default '',
  source_field_boundary_version_id uuid, created_by_internal_user_id uuid not null, created_at timestamptz not null default now(),
  unique(organisation_id,mission_id,version_number), unique(organisation_id,id),
  foreign key(organisation_id,mission_id) references public.missions(organisation_id,id),
  foreign key(organisation_id,operating_location_id) references public.operating_locations(organisation_id,id),
  foreign key(organisation_id,source_field_boundary_version_id) references public.field_boundary_versions(organisation_id,id),
  foreign key(organisation_id,created_by_internal_user_id) references public.internal_users(organisation_id,id)
);
create table public.mission_geometry_versions (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, operating_location_id uuid not null,
  mission_id uuid not null, revision_id uuid not null, geometry_id uuid not null, version_number integer not null check(version_number>0),
  geometry_role text not null check(geometry_role in ('operational_boundary','treatment_area','exclusion_zone','no_fly_zone','obstacle','corridor','access_route','staging_area','launch_point','landing_point','water_point','point_annotation','line_annotation','polygon_annotation','imported_source_geometry','regulatory_overlay','safety_overlay')),
  geometry_type text not null check(geometry_type in ('Point','LineString','Polygon','MultiPolygon')),
  canonical_geometry jsonb not null check(jsonb_typeof(canonical_geometry)='object'), source_crs text not null default 'EPSG:4326', canonical_crs text not null default 'EPSG:4326',
  source_file_id uuid, provenance text not null, validation_state text not null check(validation_state in ('valid','requires_review','invalid')),
  area_hectares numeric, length_metres numeric, label text not null default '', notes text not null default '', created_by_internal_user_id uuid not null, created_at timestamptz not null default now(),
  unique(organisation_id,revision_id,geometry_id), unique(organisation_id,id),
  foreign key(organisation_id,mission_id) references public.missions(organisation_id,id),
  foreign key(organisation_id,revision_id) references public.mission_map_revisions(organisation_id,id),
  foreign key(organisation_id,operating_location_id) references public.operating_locations(organisation_id,id),
  foreign key(organisation_id,created_by_internal_user_id) references public.internal_users(organisation_id,id)
);
create index mission_map_revisions_current_idx on public.mission_map_revisions(organisation_id,mission_id,version_number desc);
create index mission_geometry_history_idx on public.mission_geometry_versions(organisation_id,mission_id,geometry_id,version_number desc);
alter table public.mission_map_revisions enable row level security; alter table public.mission_map_revisions force row level security;
alter table public.mission_geometry_versions enable row level security; alter table public.mission_geometry_versions force row level security;
create policy mission_map_revision_tenant_access on public.mission_map_revisions for all to authenticated using(public.current_user_has_organisation_access(organisation_id)) with check(public.current_user_has_organisation_access(organisation_id));
create policy mission_geometry_tenant_access on public.mission_geometry_versions for all to authenticated using(public.current_user_has_organisation_access(organisation_id)) with check(public.current_user_has_organisation_access(organisation_id));
revoke all on public.mission_map_revisions,public.mission_geometry_versions from public,anon,authenticated;
grant select,insert on public.mission_map_revisions,public.mission_geometry_versions to service_role;

insert into public.permissions(organisation_id,code,description)
select o.id,v.code,v.description from public.organisations o cross join (values
 ('mission_maps.read','View authoritative Mission planning maps'),('mission_maps.update','Create a versioned Mission planning map revision')) v(code,description)
on conflict(organisation_id,code) do update set description=excluded.description;
insert into public.role_permissions(organisation_id,role_id,permission_id)
select r.organisation_id,r.id,p.id from public.roles r join public.permissions p on p.organisation_id=r.organisation_id
where lower(r.name) in ('admin','administrator','owner') and p.code in ('mission_maps.read','mission_maps.update')
on conflict do nothing;

create function public.ftf_read_mission_map(p_organisation_id uuid,p_mission_id uuid,p_history boolean default false)
returns setof jsonb language sql security definer set search_path=public,pg_temp as $$
  with revisions as (select r.* from public.mission_map_revisions r where r.organisation_id=p_organisation_id and r.mission_id=p_mission_id order by r.version_number desc limit case when p_history then 2147483647 else 1 end)
  select to_jsonb(r)||jsonb_build_object('geometries',coalesce((select jsonb_agg(jsonb_build_object(
    'id',g.geometry_id,'role',g.geometry_role,'geometryType',g.geometry_type,'geometry',g.canonical_geometry,
    'sourceCrs',g.source_crs,'canonicalCrs',g.canonical_crs,'sourceFileId',g.source_file_id,'provenance',g.provenance,
    'validationState',g.validation_state,'areaHectares',g.area_hectares,'lengthMetres',g.length_metres,'label',g.label,'notes',g.notes) order by g.created_at,g.geometry_id)
    from public.mission_geometry_versions g where g.organisation_id=r.organisation_id and g.revision_id=r.id),'[]'::jsonb)) from revisions r;
$$;

create function public.ftf_save_mission_map(p_organisation_id uuid,p_actor_internal_user_id uuid,p_mission_id uuid,p_expected_version integer,p_notes text,p_source_field_boundary_version_id uuid,p_geometries jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_mission public.missions%rowtype;v_current integer;v_revision public.mission_map_revisions%rowtype;v_item jsonb;v_record jsonb;
begin
 select * into v_mission from public.missions where organisation_id=p_organisation_id and id=p_mission_id and archived_at is null for update;
 if not found then return jsonb_build_object('not_found',true); end if;
 if lower(v_mission.status)<>'planning' then return jsonb_build_object('relationship_conflict',true); end if;
 select coalesce(max(version_number),0) into v_current from public.mission_map_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id;
 if v_current<>p_expected_version then return jsonb_build_object('conflict',true,'current_version',v_current); end if;
 if p_source_field_boundary_version_id is not null and not exists(select 1 from public.field_boundary_versions f join public.job_fields jf on jf.organisation_id=f.organisation_id and jf.field_id=f.field_id join public.jobs j on j.organisation_id=jf.organisation_id and j.id=jf.job_id where f.organisation_id=p_organisation_id and f.id=p_source_field_boundary_version_id and j.id=v_mission.job_id and f.archived_at is null and jf.archived_at is null) then return jsonb_build_object('relationship_conflict',true); end if;
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
revoke all on function public.ftf_read_mission_map(uuid,uuid,boolean),public.ftf_save_mission_map(uuid,uuid,uuid,integer,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ftf_read_mission_map(uuid,uuid,boolean),public.ftf_save_mission_map(uuid,uuid,uuid,integer,text,uuid,jsonb) to service_role;
