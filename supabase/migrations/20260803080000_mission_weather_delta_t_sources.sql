-- Preserve Delta T provenance for calculated and on-site Kestrel evidence.
alter table public.mission_weather_observations
 add column delta_t_source text,
 add column calculated_delta_t_c numeric(5,1),
 add column delta_t_variance_c numeric(5,1),
 add column delta_t_variance_warning boolean;

update public.mission_weather_observations
set delta_t_source='CALCULATED',calculated_delta_t_c=delta_t_c,delta_t_variance_c=0,delta_t_variance_warning=false;

alter table public.mission_weather_observations
 alter column delta_t_source set not null,
 alter column calculated_delta_t_c set not null,
 alter column delta_t_variance_c set not null,
 alter column delta_t_variance_warning set not null,
 alter column delta_t_variance_warning set default false,
 add constraint mission_weather_delta_t_source_check check(delta_t_source in('CALCULATED','KESTREL_MEASURED')),
 add constraint mission_weather_calculated_delta_consistency check(delta_t_source<>'CALCULATED' or delta_t_c=calculated_delta_t_c),
 add constraint mission_weather_delta_t_variance_consistency check(delta_t_variance_c=delta_t_c-calculated_delta_t_c),
 add constraint mission_weather_delta_t_warning_consistency check(delta_t_variance_warning=(abs(delta_t_variance_c)>0.3));

create or replace function public.ftf_create_mission_weather_observation(p_organisation_id uuid,p_actor_internal_user_id uuid,p_mission_id uuid,p_expected_version integer,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_mission public.missions%rowtype;v_policy public.organisation_weather_policies%rowtype;v_observer public.personnel%rowtype;v_current integer;
 v_calculated_delta numeric;v_authoritative_delta numeric;v_variance numeric;v_variance_warning boolean;v_delta_mode text;
 v_record public.mission_weather_observations%rowtype;v_source text;
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
 if nullif(trim(p_payload->>'observationLocation'),'') is null or nullif(p_payload->>'observedAt','') is null or (p_payload->>'temperatureC') is null or (p_payload->>'relativeHumidity') is null or (p_payload->>'windSpeedKmh') is null or (p_payload->>'windDirectionDegrees') is null or nullif(p_payload->>'inversionAssessment','') is null then raise exception 'required weather fields are missing';end if;
 v_calculated_delta=public.ftf_calculate_delta_t((p_payload->>'temperatureC')::numeric,(p_payload->>'relativeHumidity')::numeric);
 v_delta_mode=upper(coalesce(nullif(p_payload->>'deltaTMode',''),'CALCULATED'));
 if v_delta_mode not in('CALCULATED','KESTREL_MEASURED')then raise exception 'Delta T mode is invalid';end if;
 if v_delta_mode='KESTREL_MEASURED' then
  if nullif(p_payload->>'deltaTC','') is null then raise exception 'Kestrel Delta T is required';end if;
  v_authoritative_delta=(p_payload->>'deltaTC')::numeric;
  if v_authoritative_delta < -20 or v_authoritative_delta > 40 then raise exception 'Kestrel Delta T is outside the accepted range';end if;
 else v_authoritative_delta=v_calculated_delta;end if;
 v_variance=round(v_authoritative_delta-v_calculated_delta,1);v_variance_warning=abs(v_variance)>0.3;
 insert into public.mission_weather_observations(organisation_id,operating_location_id,mission_id,version_number,source,provider_identifier,observer_personnel_id,observation_location,latitude,longitude,observed_at,retrieved_at,temperature_c,relative_humidity,delta_t_c,delta_t_source,calculated_delta_t_c,delta_t_variance_c,delta_t_variance_warning,wind_speed_kmh,wind_direction_degrees,precipitation_mm,cloud_description,inversion_assessment,inversion_assessment_source,inversion_assessor_personnel_id,inversion_assessed_at,inversion_notes,manual_reason,notes,provider_snapshot,transformation_metadata,created_by_internal_user_id)
 values(p_organisation_id,v_mission.operating_location_id,p_mission_id,v_current+1,v_source,nullif(p_payload->>'providerIdentifier',''),case when v_source='MANUAL'then v_observer.id else null end,p_payload->>'observationLocation',(p_payload->>'latitude')::numeric,(p_payload->>'longitude')::numeric,(p_payload->>'observedAt')::timestamptz,nullif(p_payload->>'retrievedAt','')::timestamptz,(p_payload->>'temperatureC')::numeric,(p_payload->>'relativeHumidity')::numeric,v_authoritative_delta,v_delta_mode,v_calculated_delta,v_variance,v_variance_warning,(p_payload->>'windSpeedKmh')::numeric,(p_payload->>'windDirectionDegrees')::numeric,coalesce((p_payload->>'precipitationMm')::numeric,0),nullif(p_payload->>'cloudDescription',''),p_payload->>'inversionAssessment',coalesce(nullif(p_payload->>'inversionAssessmentSource',''),v_source),coalesce(nullif(p_payload->>'inversionAssessorPersonnelId','')::uuid,case when v_source='MANUAL'then v_observer.id else null end),coalesce(nullif(p_payload->>'inversionAssessedAt','')::timestamptz,(p_payload->>'observedAt')::timestamptz),nullif(p_payload->>'inversionNotes',''),nullif(p_payload->>'manualReason',''),nullif(p_payload->>'notes',''),p_payload->'providerSnapshot',coalesce(p_payload->'transformationMetadata','{}'::jsonb),p_actor_internal_user_id)returning * into v_record;
 insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)values(p_organisation_id,p_actor_internal_user_id,'mission.weather_observed','mission_weather_observation',v_record.id,jsonb_build_object('mission_id',p_mission_id,'version',v_record.version_number,'source',v_source,'delta_t_source',v_record.delta_t_source,'delta_t_c',v_record.delta_t_c,'calculated_delta_t_c',v_record.calculated_delta_t_c,'delta_t_variance_warning',v_record.delta_t_variance_warning));
 insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)values(p_organisation_id,'operational.mission.weather_observed','mission',p_mission_id,jsonb_build_object('observation_id',v_record.id,'version',v_record.version_number,'source',v_source,'delta_t_source',v_record.delta_t_source,'delta_t_c',v_record.delta_t_c,'calculated_delta_t_c',v_record.calculated_delta_t_c,'delta_t_variance_warning',v_record.delta_t_variance_warning));
 return jsonb_build_object('record',to_jsonb(v_record));
end$$;
