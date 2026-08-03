-- Immutable, reproducible location provenance for manual Mission Weather.
alter table public.mission_weather_observations
  add column location_source text,
  add column location_captured_at timestamptz,
  add column location_accuracy_m numeric,
  add column location_failure_reason text,
  add column mission_map_revision_id uuid,
  add column mission_boundary_geometry_id uuid,
  add column centroid_calculation_version text;

update public.mission_weather_observations
set location_source='LEGACY_RECORDED',location_captured_at=coalesce(observed_at,created_at);

alter table public.mission_weather_observations
  alter column location_source set not null,
  alter column location_captured_at set not null,
  add constraint mission_weather_location_source_check check(location_source in('DEVICE_GPS','MISSION_BOUNDARY','PROVIDER_LOCATION','LEGACY_RECORDED')),
  add constraint mission_weather_location_accuracy_check check(location_accuracy_m is null or location_accuracy_m>=0),
  add constraint mission_weather_boundary_provenance_check check(
    (location_source='MISSION_BOUNDARY' and mission_map_revision_id is not null and mission_boundary_geometry_id is not null and centroid_calculation_version='POLYGON_CENTROID_V1')
    or (location_source<>'MISSION_BOUNDARY' and mission_map_revision_id is null and mission_boundary_geometry_id is null and centroid_calculation_version is null)
  ),
  add foreign key(organisation_id,mission_map_revision_id,mission_boundary_geometry_id)
    references public.mission_geometry_versions(organisation_id,revision_id,geometry_id);

create or replace function public.ftf_mission_polygon_centroid(p_geometry jsonb)
returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$
declare
  v_ring jsonb;v_count integer;v_i integer;v_x1 numeric;v_y1 numeric;v_x2 numeric;v_y2 numeric;
  v_cross numeric;v_area_twice numeric=0;v_x_sum numeric=0;v_y_sum numeric=0;
begin
  if p_geometry->>'type'<>'Polygon' or jsonb_typeof(p_geometry->'coordinates')<>'array' then return null;end if;
  v_ring=p_geometry->'coordinates'->0;
  if jsonb_typeof(v_ring)<>'array' then return null;end if;
  v_count=jsonb_array_length(v_ring);if v_count<4 or v_ring->0<>v_ring->(v_count-1) then return null;end if;
  for v_i in 0..v_count-2 loop
    begin
      v_x1=(v_ring->v_i->>0)::numeric;v_y1=(v_ring->v_i->>1)::numeric;
      v_x2=(v_ring->(v_i+1)->>0)::numeric;v_y2=(v_ring->(v_i+1)->>1)::numeric;
    exception when others then return null;end;
    if v_x1 not between -180 and 180 or v_x2 not between -180 and 180 or v_y1 not between -90 and 90 or v_y2 not between -90 and 90 then return null;end if;
    v_cross=v_x1*v_y2-v_x2*v_y1;v_area_twice=v_area_twice+v_cross;
    v_x_sum=v_x_sum+(v_x1+v_x2)*v_cross;v_y_sum=v_y_sum+(v_y1+v_y2)*v_cross;
  end loop;
  if abs(v_area_twice)<0.000000000001 then return null;end if;
  return jsonb_build_object('longitude',round(v_x_sum/(3*v_area_twice),6),'latitude',round(v_y_sum/(3*v_area_twice),6));
end$$;

create or replace function public.ftf_create_mission_weather_observation(p_organisation_id uuid,p_actor_internal_user_id uuid,p_mission_id uuid,p_expected_version integer,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_mission public.missions%rowtype;v_policy public.organisation_weather_policies%rowtype;v_observer public.personnel%rowtype;v_current integer;
 v_calculated_delta numeric;v_authoritative_delta numeric;v_variance numeric;v_variance_warning boolean;v_delta_mode text;
 v_record public.mission_weather_observations%rowtype;v_source text;v_location_source text;v_map public.mission_map_revisions%rowtype;
 v_boundary public.mission_geometry_versions%rowtype;v_centroid jsonb;v_latitude numeric;v_longitude numeric;
begin
 select * into v_mission from public.missions where organisation_id=p_organisation_id and id=p_mission_id and archived_at is null for update;
 if not found then return jsonb_build_object('not_found',true);end if;
 if not exists(select 1 from public.memberships m join public.membership_operating_location_assignments a on a.organisation_id=m.organisation_id and a.membership_id=m.id where m.organisation_id=p_organisation_id and m.internal_user_id=p_actor_internal_user_id and m.is_active and m.archived_at is null and a.operating_location_id=v_mission.operating_location_id and a.is_active and a.archived_at is null)then return jsonb_build_object('location_forbidden',true);end if;
 select * into v_policy from public.organisation_weather_policies where organisation_id=p_organisation_id;
 select coalesce(max(version_number),0)into v_current from public.mission_weather_observations where organisation_id=p_organisation_id and mission_id=p_mission_id;
 if v_current<>p_expected_version then return jsonb_build_object('conflict',true,'current_version',v_current);end if;
 v_source=upper(coalesce(p_payload->>'source',''));
 if v_source not in('MANUAL','OPEN_METEO')then raise exception 'weather source is invalid';end if;
 if v_source='MANUAL' then
  select * into v_observer from public.personnel where organisation_id=p_organisation_id and id=(p_payload->>'observerPersonnelId')::uuid and archived_at is null and is_active;
  if not found then return jsonb_build_object('observer_invalid',true);end if;
  if not exists(select 1 from public.personnel_operating_locations where organisation_id=p_organisation_id and personnel_id=v_observer.id and operating_location_id=v_mission.operating_location_id)then return jsonb_build_object('observer_invalid',true);end if;
  if v_policy.require_mission_assignment and not exists(select 1 from public.mission_personnel_assignments a join public.mission_personnel_revisions r on r.organisation_id=a.organisation_id and r.id=a.revision_id where a.organisation_id=p_organisation_id and a.mission_id=p_mission_id and a.personnel_id=v_observer.id and r.version_number=(select max(version_number)from public.mission_personnel_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id))then return jsonb_build_object('observer_unassigned',true);end if;
 end if;
 if nullif(trim(p_payload->>'observationLocation'),'') is null or nullif(p_payload->>'observedAt','') is null or nullif(p_payload->>'locationCapturedAt','') is null or (p_payload->>'temperatureC') is null or (p_payload->>'relativeHumidity') is null or (p_payload->>'windSpeedKmh') is null or (p_payload->>'windDirectionDegrees') is null or nullif(p_payload->>'inversionAssessment','') is null then raise exception 'required weather fields are missing';end if;
 v_location_source=upper(coalesce(p_payload->>'locationSource',case when v_source='OPEN_METEO'then'PROVIDER_LOCATION'else''end));
 if v_location_source='MISSION_BOUNDARY' then
  if nullif(p_payload->>'missionMapRevisionId','') is null or nullif(p_payload->>'missionBoundaryGeometryId','') is null or p_payload->>'centroidCalculationVersion'<>'POLYGON_CENTROID_V1' then return jsonb_build_object('boundary_invalid',true);end if;
  select * into v_map from public.mission_map_revisions where organisation_id=p_organisation_id and id=(p_payload->>'missionMapRevisionId')::uuid and mission_id=p_mission_id and operating_location_id=v_mission.operating_location_id;
  if not found then return jsonb_build_object('boundary_invalid',true);end if;
  select * into v_boundary from public.mission_geometry_versions where organisation_id=p_organisation_id and revision_id=v_map.id and geometry_id=(p_payload->>'missionBoundaryGeometryId')::uuid and mission_id=p_mission_id and operating_location_id=v_mission.operating_location_id and geometry_role in('operational_boundary','treatment_area') and geometry_type='Polygon' and validation_state='valid';
  if not found then return jsonb_build_object('boundary_invalid',true);end if;
  v_centroid=public.ftf_mission_polygon_centroid(v_boundary.canonical_geometry);if v_centroid is null then return jsonb_build_object('boundary_invalid',true);end if;
  v_latitude=(v_centroid->>'latitude')::numeric;v_longitude=(v_centroid->>'longitude')::numeric;
  if abs(v_latitude-(p_payload->>'latitude')::numeric)>0.00001 or abs(v_longitude-(p_payload->>'longitude')::numeric)>0.00001 then return jsonb_build_object('location_mismatch',true);end if;
 elsif v_location_source in('DEVICE_GPS','PROVIDER_LOCATION') then
  v_latitude=(p_payload->>'latitude')::numeric;v_longitude=(p_payload->>'longitude')::numeric;
 else raise exception 'location source is invalid';end if;
 v_calculated_delta=public.ftf_calculate_delta_t((p_payload->>'temperatureC')::numeric,(p_payload->>'relativeHumidity')::numeric);
 v_delta_mode=upper(coalesce(nullif(p_payload->>'deltaTMode',''),'CALCULATED'));
 if v_delta_mode not in('CALCULATED','KESTREL_MEASURED')then raise exception 'Delta T mode is invalid';end if;
 if v_delta_mode='KESTREL_MEASURED' then if nullif(p_payload->>'deltaTC','') is null then raise exception 'Kestrel Delta T is required';end if;v_authoritative_delta=(p_payload->>'deltaTC')::numeric;if v_authoritative_delta < -20 or v_authoritative_delta > 40 then raise exception 'Kestrel Delta T is outside the accepted range';end if;else v_authoritative_delta=v_calculated_delta;end if;
 v_variance=round(v_authoritative_delta-v_calculated_delta,1);v_variance_warning=abs(v_variance)>0.3;
 insert into public.mission_weather_observations(organisation_id,operating_location_id,mission_id,version_number,source,provider_identifier,observer_personnel_id,observation_location,latitude,longitude,location_source,location_captured_at,location_accuracy_m,location_failure_reason,mission_map_revision_id,mission_boundary_geometry_id,centroid_calculation_version,observed_at,retrieved_at,temperature_c,relative_humidity,delta_t_c,delta_t_source,calculated_delta_t_c,delta_t_variance_c,delta_t_variance_warning,wind_speed_kmh,wind_direction_degrees,precipitation_mm,cloud_description,inversion_assessment,inversion_assessment_source,inversion_assessor_personnel_id,inversion_assessed_at,inversion_notes,manual_reason,notes,provider_snapshot,transformation_metadata,created_by_internal_user_id)
 values(p_organisation_id,v_mission.operating_location_id,p_mission_id,v_current+1,v_source,nullif(p_payload->>'providerIdentifier',''),case when v_source='MANUAL'then v_observer.id else null end,p_payload->>'observationLocation',v_latitude,v_longitude,v_location_source,(p_payload->>'locationCapturedAt')::timestamptz,case when v_location_source='DEVICE_GPS'then nullif(p_payload->>'locationAccuracyM','')::numeric else null end,nullif(p_payload->>'locationFailureReason',''),case when v_location_source='MISSION_BOUNDARY'then v_map.id else null end,case when v_location_source='MISSION_BOUNDARY'then v_boundary.geometry_id else null end,case when v_location_source='MISSION_BOUNDARY'then'POLYGON_CENTROID_V1'else null end,(p_payload->>'observedAt')::timestamptz,nullif(p_payload->>'retrievedAt','')::timestamptz,(p_payload->>'temperatureC')::numeric,(p_payload->>'relativeHumidity')::numeric,v_authoritative_delta,v_delta_mode,v_calculated_delta,v_variance,v_variance_warning,(p_payload->>'windSpeedKmh')::numeric,(p_payload->>'windDirectionDegrees')::numeric,coalesce((p_payload->>'precipitationMm')::numeric,0),nullif(p_payload->>'cloudDescription',''),p_payload->>'inversionAssessment',coalesce(nullif(p_payload->>'inversionAssessmentSource',''),v_source),coalesce(nullif(p_payload->>'inversionAssessorPersonnelId','')::uuid,case when v_source='MANUAL'then v_observer.id else null end),coalesce(nullif(p_payload->>'inversionAssessedAt','')::timestamptz,(p_payload->>'observedAt')::timestamptz),nullif(p_payload->>'inversionNotes',''),nullif(p_payload->>'manualReason',''),nullif(p_payload->>'notes',''),p_payload->'providerSnapshot',coalesce(p_payload->'transformationMetadata','{}'::jsonb),p_actor_internal_user_id)returning * into v_record;
 insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)values(p_organisation_id,p_actor_internal_user_id,'mission.weather_observed','mission_weather_observation',v_record.id,jsonb_build_object('mission_id',p_mission_id,'version',v_record.version_number,'source',v_source,'location_source',v_record.location_source,'mission_map_revision_id',v_record.mission_map_revision_id,'mission_boundary_geometry_id',v_record.mission_boundary_geometry_id,'delta_t_source',v_record.delta_t_source,'delta_t_c',v_record.delta_t_c,'calculated_delta_t_c',v_record.calculated_delta_t_c,'delta_t_variance_warning',v_record.delta_t_variance_warning));
 insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)values(p_organisation_id,'operational.mission.weather_observed','mission',p_mission_id,jsonb_build_object('observation_id',v_record.id,'version',v_record.version_number,'source',v_source,'location_source',v_record.location_source,'mission_map_revision_id',v_record.mission_map_revision_id,'mission_boundary_geometry_id',v_record.mission_boundary_geometry_id,'delta_t_source',v_record.delta_t_source,'delta_t_c',v_record.delta_t_c,'calculated_delta_t_c',v_record.calculated_delta_t_c,'delta_t_variance_warning',v_record.delta_t_variance_warning));
 return jsonb_build_object('record',to_jsonb(v_record));
end$$;

revoke all on function public.ftf_mission_polygon_centroid(jsonb) from public,anon,authenticated;
grant execute on function public.ftf_mission_polygon_centroid(jsonb) to service_role;
