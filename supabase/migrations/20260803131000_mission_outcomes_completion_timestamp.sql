create or replace function public.ftf_create_mission_outcome_observation(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_mission_id uuid,
  p_payload jsonb
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  m public.missions%rowtype;
  c public.mission_completion_revisions%rowtype;
  p public.personnel%rowtype;
  t public.mission_outcome_observation_types%rowtype;
  md public.mission_outcome_methods%rowtype;
  cf public.mission_outcome_confidence_levels%rowtype;
  r public.mission_outcome_observations%rowtype;
  n integer;
  eligible boolean;
begin
  select * into m from public.missions where organisation_id=p_organisation_id and id=p_mission_id and archived_at is null for update;
  if not found then return jsonb_build_object('not_found',true); end if;
  if not public.ftf_operational_location_allowed(p_organisation_id,p_actor_internal_user_id,m.operating_location_id) then return jsonb_build_object('location_forbidden',true); end if;
  select * into c from public.mission_completion_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id order by version_number desc limit 1;
  if not found then return jsonb_build_object('completion_required',true); end if;
  select * into p from public.personnel where organisation_id=p_organisation_id and id=(p_payload->>'observerPersonnelId')::uuid and archived_at is null;
  if not found or not exists(select 1 from public.personnel_operating_locations x where x.organisation_id=p_organisation_id and x.personnel_id=p.id and x.operating_location_id=m.operating_location_id) then return jsonb_build_object('observer_invalid',true); end if;
  select * into t from public.mission_outcome_observation_types where code=p_payload->>'observationTypeCode' and is_active;
  if not found then return jsonb_build_object('catalogue_invalid',true); end if;
  select * into md from public.mission_outcome_methods where code=p_payload->>'methodCode' and is_active;
  if not found then return jsonb_build_object('catalogue_invalid',true); end if;
  select * into cf from public.mission_outcome_confidence_levels where code=p_payload->>'confidenceCode';
  if not found then return jsonb_build_object('catalogue_invalid',true); end if;
  if nullif(p_payload->>'supersedesObservationId','') is not null and not exists(select 1 from public.mission_outcome_observations o where o.organisation_id=p_organisation_id and o.mission_id=p_mission_id and o.id=(p_payload->>'supersedesObservationId')::uuid) then return jsonb_build_object('supersession_invalid',true); end if;
  select coalesce(max(sequence_number),0)+1 into n from public.mission_outcome_observations where organisation_id=p_organisation_id and mission_id=p_mission_id;
  eligible=coalesce(jsonb_array_length(coalesce(p_payload->'targetSpecies','[]')),0)>0 and p_payload?'controlPercentage' and cf.code in('HIGH','MEDIUM') and(length(trim(coalesce(p_payload->>'operatorNotes','')))>0 or exists(select 1 from public.mission_outcome_pending_files f where f.organisation_id=p_organisation_id and f.mission_id=p_mission_id and f.uploaded_by_internal_user_id=p_actor_internal_user_id and f.claimed_at is null and f.expires_at>now()));
  insert into public.mission_outcome_observations(
    organisation_id,operating_location_id,mission_id,completion_revision_id,sequence_number,observed_at,
    observer_personnel_id,personnel_snapshot,observation_type_id,observation_type_snapshot,method_id,
    method_snapshot,confidence_level_id,confidence_snapshot,days_since_application,inspection_time,
    approximate_area_inspected_ha,inspection_weather,crop_growth_stage,target_species,control_percentage,
    regrowth,off_target_effects,environmental_observations,customer_comments,operator_notes,
    recommended_follow_up,supersedes_observation_id,operational_knowledge_eligible,created_by_internal_user_id
  ) values (
    p_organisation_id,m.operating_location_id,m.id,c.id,n,(p_payload->>'observedAt')::timestamptz,
    p.id,jsonb_build_object('id',p.id,'name',p.full_name),t.id,to_jsonb(t),md.id,to_jsonb(md),cf.id,to_jsonb(cf),
    greatest(0,floor(extract(epoch from((p_payload->>'observedAt')::timestamptz-c.completed_at))/86400)::integer),
    nullif(p_payload->>'inspectionTime','')::time,nullif(p_payload->>'approximateAreaInspectedHa','')::numeric,
    p_payload->'inspectionWeather',p_payload->>'cropGrowthStage',array(select jsonb_array_elements_text(coalesce(p_payload->'targetSpecies','[]'))),
    nullif(p_payload->>'controlPercentage','')::numeric,p_payload->>'regrowth',p_payload->>'offTargetEffects',
    p_payload->>'environmentalObservations',p_payload->>'customerComments',p_payload->>'operatorNotes',
    p_payload->>'recommendedFollowUp',nullif(p_payload->>'supersedesObservationId','')::uuid,eligible,p_actor_internal_user_id
  ) returning * into r;
  insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)
  values(p_organisation_id,p_actor_internal_user_id,'mission.outcome_observed','mission_outcome_observation',r.id,jsonb_build_object('mission_id',m.id,'sequence',n,'completion_revision_id',c.id));
  insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)
  values(p_organisation_id,'post_mission.mission.outcome_observed','mission',m.id,jsonb_build_object('observation_id',r.id,'completion_revision_id',c.id));
  return jsonb_build_object('record',to_jsonb(r));
end$$;

revoke all on function public.ftf_create_mission_outcome_observation(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ftf_create_mission_outcome_observation(uuid,uuid,uuid,jsonb) to service_role;
