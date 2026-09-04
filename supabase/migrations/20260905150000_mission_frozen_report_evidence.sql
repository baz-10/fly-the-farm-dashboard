-- Forward-only enrichment of the canonical completion manifest. This creates
-- no report authority: deterministic reports consume the immutable FINAL row.

alter function public.ftf_build_mission_daily_evidence_manifest(uuid,uuid)
  rename to ftf_build_mission_daily_evidence_manifest_before_report_evidence;

create function public.ftf_build_mission_report_evidence_manifest(
  p_organisation_id uuid,p_mission_id uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_mission public.missions%rowtype; v_job public.jobs%rowtype; v_client public.clients%rowtype;
  v_effective_pack public.mission_pack_revisions%rowtype; v_effective_approval public.mission_authorisation_revisions%rowtype;
  v_manifest jsonb;
begin
  perform public.ftf_lock_mission_package_aggregate_allow_final(p_organisation_id,p_mission_id);
  select * into v_mission from public.missions where organisation_id=p_organisation_id and id=p_mission_id and archived_at is null for update;
  if not found then raise exception 'MISSION_REPORT_EVIDENCE_INVALID: mission' using errcode='22023'; end if;
  select * into v_job from public.jobs where organisation_id=p_organisation_id and id=v_mission.job_id and archived_at is null for update;
  select * into v_client from public.clients where organisation_id=p_organisation_id and id=v_job.client_id and archived_at is null for update;
  select * into v_effective_pack from public.mission_pack_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id and id=v_mission.current_authorised_pack_revision_id for update;
  select * into v_effective_approval from public.mission_authorisation_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id
    and mission_pack_revision_id=v_effective_pack.id and decision='AUTHORISED' order by version_number desc,id desc limit 1;
  if v_job.id is null or v_client.id is null or v_effective_pack.id is null or v_effective_approval.id is null
    or v_job.client_id<>v_client.id or v_effective_pack.operating_location_id<>v_mission.operating_location_id
    or v_effective_approval.operating_location_id<>v_mission.operating_location_id then
    raise exception 'MISSION_REPORT_EVIDENCE_INVALID: authority' using errcode='22023';
  end if;

  -- MISSION_REPORT_EVIDENCE_LOCK_ORDER_V1. All display and operational rows
  -- are locked before either half of the canonical completion manifest is
  -- constructed. The table order and each row's UUID order are fixed.
  -- lock rows: jobs (already locked above)
  -- lock rows: clients
  perform client.id from public.clients client where client.organisation_id=p_organisation_id and client.id=v_client.id order by client.id for update;
  -- lock rows: properties
  -- lock referenced rows: properties
  perform property.id from public.properties property where property.organisation_id=p_organisation_id and (
    exists(select 1 from public.mission_pack_fields scope where scope.organisation_id=p_organisation_id and scope.mission_id=p_mission_id and scope.property_id=property.id)
    or exists(select 1 from public.fields field where field.organisation_id=p_organisation_id and field.property_id=property.id and (
      exists(select 1 from public.mission_day_field_activity activity where activity.organisation_id=p_organisation_id and activity.mission_id=p_mission_id and activity.field_id=field.id)
      or exists(select 1 from public.mission_flight_actuals flight where flight.organisation_id=p_organisation_id and flight.mission_id=p_mission_id and flight.field_id=field.id)
      or exists(select 1 from public.mission_day_chemical_lines line where line.organisation_id=p_organisation_id and line.mission_id=p_mission_id and line.field_id=field.id)))) order by property.id for update;
  -- lock rows: fields
  -- lock referenced rows: fields
  perform field.id from public.fields field where field.organisation_id=p_organisation_id and (
    exists(select 1 from public.mission_pack_fields scope where scope.organisation_id=p_organisation_id and scope.mission_id=p_mission_id and scope.field_id=field.id)
    or exists(select 1 from public.mission_day_field_activity activity where activity.organisation_id=p_organisation_id and activity.mission_id=p_mission_id and activity.field_id=field.id)
    or exists(select 1 from public.mission_flight_actuals flight where flight.organisation_id=p_organisation_id and flight.mission_id=p_mission_id and flight.field_id=field.id)
    or exists(select 1 from public.mission_day_chemical_lines line where line.organisation_id=p_organisation_id and line.mission_id=p_mission_id and line.field_id=field.id)) order by field.id for update;
  -- lock rows: aircraft
  -- lock referenced rows: aircraft
  perform aircraft.id from public.aircraft aircraft where aircraft.organisation_id=p_organisation_id and (
    exists(select 1 from public.mission_aircraft_day_actuals actual where actual.organisation_id=p_organisation_id
      and actual.mission_id=p_mission_id and actual.aircraft_id=aircraft.id)
    or exists(select 1 from public.mission_day_chemical_lines line where line.organisation_id=p_organisation_id
      and line.mission_id=p_mission_id and line.aircraft_id=aircraft.id)
    or exists(select 1 from public.mission_operational_import_attributions attribution where attribution.organisation_id=p_organisation_id
      and attribution.mission_id=p_mission_id and attribution.aircraft_id=aircraft.id)) order by aircraft.id for update;
  -- lock rows: mission_aircraft_assignments
  -- lock referenced rows: mission_aircraft_assignments
  perform assignment.id from public.mission_aircraft_assignments assignment where assignment.organisation_id=p_organisation_id and (
    assignment.mission_id=p_mission_id or exists(select 1 from public.mission_aircraft_day_actuals actual
      where actual.organisation_id=p_organisation_id and actual.mission_id=p_mission_id
        and actual.mission_aircraft_assignment_id=assignment.id)) order by assignment.id for update;
  -- lock rows: mission_pack_revisions
  perform pack.id from public.mission_pack_revisions pack where pack.organisation_id=p_organisation_id and pack.mission_id=p_mission_id order by pack.id for update;
  -- lock rows: mission_pack_fields
  perform scope.id from public.mission_pack_fields scope where scope.organisation_id=p_organisation_id and scope.mission_id=p_mission_id order by scope.id for update;
  -- lock rows: job_fields
  perform scope.id from public.job_fields scope where scope.organisation_id=p_organisation_id and scope.job_id=v_job.id order by scope.id for update;
  -- lock rows: mission_authorisation_revisions
  perform decision.id from public.mission_authorisation_revisions decision where decision.organisation_id=p_organisation_id and decision.mission_id=p_mission_id order by decision.id for update;
  -- lock rows: mission_jsa_revisions
  perform jsa.id from public.mission_jsa_revisions jsa where jsa.organisation_id=p_organisation_id and jsa.mission_id=p_mission_id order by jsa.id for update;
  -- lock rows: mission_operating_days
  perform day.id from public.mission_operating_days day where day.organisation_id=p_organisation_id and day.mission_id=p_mission_id order by day.id for update;
  -- lock rows: mission_day_jsa_reviews
  perform review.id from public.mission_day_jsa_reviews review where review.organisation_id=p_organisation_id and review.mission_id=p_mission_id order by review.id for update;
  -- lock rows: mission_day_field_activity
  perform activity.id from public.mission_day_field_activity activity where activity.organisation_id=p_organisation_id and activity.mission_id=p_mission_id order by activity.id for update;
  -- lock rows: mission_aircraft_day_actuals
  perform actual.id from public.mission_aircraft_day_actuals actual where actual.organisation_id=p_organisation_id and actual.mission_id=p_mission_id order by actual.id for update;
  -- lock rows: mission_flight_actuals
  perform flight.id from public.mission_flight_actuals flight where flight.organisation_id=p_organisation_id and flight.mission_id=p_mission_id order by flight.id for update;
  -- lock rows: mission_day_chemical_revisions
  perform revision.id from public.mission_day_chemical_revisions revision where revision.organisation_id=p_organisation_id and revision.mission_id=p_mission_id order by revision.id for update;
  -- lock rows: mission_day_chemical_lines
  perform line.id from public.mission_day_chemical_lines line where line.organisation_id=p_organisation_id and line.mission_id=p_mission_id order by line.id for update;
  -- lock rows: mission_day_weather_reports
  perform weather.id from public.mission_day_weather_reports weather where weather.organisation_id=p_organisation_id and weather.mission_id=p_mission_id order by weather.id for update;
  -- lock rows: mission_weather_observations
  perform observation.id from public.mission_weather_observations observation where observation.organisation_id=p_organisation_id and exists(
    select 1 from public.mission_day_weather_reports weather where weather.organisation_id=p_organisation_id
      and weather.mission_id=p_mission_id and weather.source_weather_observation_id=observation.id) order by observation.id for update;
  -- lock rows: mission_operational_import_attributions
  perform attribution.id from public.mission_operational_import_attributions attribution where attribution.organisation_id=p_organisation_id and attribution.mission_id=p_mission_id order by attribution.id for update;
  -- lock rows: mission_operational_imports
  -- lock referenced rows: mission_operational_imports
  perform import.id from public.mission_operational_imports import where import.organisation_id=p_organisation_id and (
    import.mission_id=p_mission_id or exists(select 1 from public.mission_flight_actuals flight where flight.organisation_id=p_organisation_id
      and flight.mission_id=p_mission_id and flight.source_import_id=import.id)
    or exists(select 1 from public.mission_operational_import_attributions attribution where attribution.organisation_id=p_organisation_id
      and attribution.mission_id=p_mission_id and attribution.operational_import_id=import.id)) order by import.id for update;
  -- lock rows: mission_chemical_plan_revisions
  -- lock referenced rows: mission_chemical_plan_revisions
  perform revision.id from public.mission_chemical_plan_revisions revision where revision.organisation_id=p_organisation_id and (
    revision.mission_id=p_mission_id or exists(select 1 from public.mission_day_chemical_revisions actual where actual.organisation_id=p_organisation_id
      and actual.mission_id=p_mission_id and actual.planned_chemical_revision_id=revision.id)) order by revision.id for update;
  -- lock rows: mission_chemical_plan_lines
  -- lock referenced rows: mission_chemical_plan_lines
  perform line.id from public.mission_chemical_plan_lines line where line.organisation_id=p_organisation_id and (
    line.mission_id=p_mission_id or exists(select 1 from public.mission_day_chemical_lines actual where actual.organisation_id=p_organisation_id
      and actual.mission_id=p_mission_id and actual.planned_line_id=line.id)) order by line.id for update;
  -- lock rows: mission_package_amendments
  perform amendment.id from public.mission_package_amendments amendment where amendment.organisation_id=p_organisation_id and amendment.mission_id=p_mission_id order by amendment.id for update;

  if exists(select 1 from public.mission_pack_revisions row where row.organisation_id=p_organisation_id and row.mission_id=p_mission_id and row.operating_location_id<>v_mission.operating_location_id)
    or exists(select 1 from public.mission_authorisation_revisions row where row.organisation_id=p_organisation_id and row.mission_id=p_mission_id and row.operating_location_id<>v_mission.operating_location_id)
    or exists(select 1 from public.mission_jsa_revisions row where row.organisation_id=p_organisation_id and row.mission_id=p_mission_id and row.operating_location_id<>v_mission.operating_location_id)
    or exists(select 1 from public.mission_pack_fields row where row.organisation_id=p_organisation_id and row.mission_id=p_mission_id and row.operating_location_id<>v_mission.operating_location_id)
    or exists(select 1 from public.mission_operating_days row where row.organisation_id=p_organisation_id and row.mission_id=p_mission_id and row.operating_location_id<>v_mission.operating_location_id)
    or exists(select 1 from public.mission_day_jsa_reviews row where row.organisation_id=p_organisation_id and row.mission_id=p_mission_id and row.operating_location_id<>v_mission.operating_location_id)
    or exists(select 1 from public.mission_day_field_activity row where row.organisation_id=p_organisation_id and row.mission_id=p_mission_id and row.operating_location_id<>v_mission.operating_location_id)
    or exists(select 1 from public.mission_aircraft_day_actuals row where row.organisation_id=p_organisation_id and row.mission_id=p_mission_id and row.operating_location_id<>v_mission.operating_location_id)
    or exists(select 1 from public.mission_flight_actuals row where row.organisation_id=p_organisation_id and row.mission_id=p_mission_id and row.operating_location_id<>v_mission.operating_location_id)
    or exists(select 1 from public.mission_day_chemical_revisions row where row.organisation_id=p_organisation_id and row.mission_id=p_mission_id and row.operating_location_id<>v_mission.operating_location_id)
    or exists(select 1 from public.mission_day_chemical_lines row where row.organisation_id=p_organisation_id and row.mission_id=p_mission_id and row.operating_location_id<>v_mission.operating_location_id)
    or exists(select 1 from public.mission_day_weather_reports row where row.organisation_id=p_organisation_id and row.mission_id=p_mission_id and row.operating_location_id<>v_mission.operating_location_id)
    or exists(select 1 from public.mission_operational_import_attributions row where row.organisation_id=p_organisation_id and row.mission_id=p_mission_id and row.operating_location_id<>v_mission.operating_location_id)
    or exists(select 1 from public.mission_operational_imports row where row.organisation_id=p_organisation_id and row.mission_id=p_mission_id and row.operating_location_id<>v_mission.operating_location_id)
    or exists(select 1 from public.mission_chemical_plan_revisions row where row.organisation_id=p_organisation_id and row.mission_id=p_mission_id and row.operating_location_id<>v_mission.operating_location_id)
    or exists(select 1 from public.mission_package_amendments row where row.organisation_id=p_organisation_id and row.mission_id=p_mission_id and row.operating_location_id<>v_mission.operating_location_id)
    or exists(select 1 from public.aircraft row where row.organisation_id=p_organisation_id and row.operating_location_id<>v_mission.operating_location_id
      and exists(select 1 from public.mission_aircraft_day_actuals actual where actual.organisation_id=p_organisation_id and actual.mission_id=p_mission_id and actual.aircraft_id=row.id))
    or exists(select 1 from public.mission_day_weather_reports weather join public.mission_weather_observations observation
      on observation.organisation_id=weather.organisation_id and observation.id=weather.source_weather_observation_id
      where weather.organisation_id=p_organisation_id and weather.mission_id=p_mission_id and observation.operating_location_id<>v_mission.operating_location_id)
    or exists(select 1 from public.mission_operational_import_attributions attribution join public.mission_operational_imports import
      on import.organisation_id=attribution.organisation_id and import.id=attribution.operational_import_id
      where attribution.organisation_id=p_organisation_id and attribution.mission_id=p_mission_id
        and import.operating_location_id<>v_mission.operating_location_id)
    or v_effective_pack.jsa_revision_id is null
    or not exists(select 1 from public.mission_jsa_revisions jsa where jsa.organisation_id=p_organisation_id and jsa.mission_id=p_mission_id
      and jsa.id=v_effective_pack.jsa_revision_id and jsa.operating_location_id=v_mission.operating_location_id) then
    raise exception 'MISSION_REPORT_EVIDENCE_INVALID: base' using errcode='22023';
  end if;

  -- reference: field_activity_field
  if exists(select 1 from public.mission_operating_days day where day.organisation_id=p_organisation_id and day.mission_id=p_mission_id
      and (not exists(select 1 from public.mission_pack_revisions pack where pack.organisation_id=p_organisation_id and pack.mission_id=p_mission_id
          and pack.id=day.mission_pack_revision_id and pack.operating_location_id=v_mission.operating_location_id)
        or not exists(select 1 from public.mission_jsa_revisions jsa where jsa.organisation_id=p_organisation_id and jsa.mission_id=p_mission_id
          and jsa.id=day.jsa_revision_id and jsa.operating_location_id=v_mission.operating_location_id)))
    or exists(select 1 from public.mission_pack_fields scope join public.fields field
        on field.organisation_id=scope.organisation_id and field.id=scope.field_id
      join public.properties property on property.organisation_id=field.organisation_id and property.id=field.property_id
      where scope.organisation_id=p_organisation_id and scope.mission_id=p_mission_id
        and (scope.job_id<>v_job.id or scope.property_id<>property.id or property.client_id<>v_client.id
          or not exists(select 1 from public.job_fields job_scope where job_scope.organisation_id=p_organisation_id
            and job_scope.job_id=v_job.id and job_scope.property_id=property.id and job_scope.field_id=field.id)))
    or exists(select 1 from public.mission_aircraft_day_actuals actual join public.mission_operating_days day
        on day.organisation_id=actual.organisation_id and day.mission_id=actual.mission_id and day.id=actual.operating_day_id
      where actual.organisation_id=p_organisation_id and actual.mission_id=p_mission_id
        and actual.mission_pack_revision_id<>day.mission_pack_revision_id)
    or exists(select 1 from public.mission_day_chemical_revisions revision join public.mission_operating_days day
        on day.organisation_id=revision.organisation_id and day.mission_id=revision.mission_id and day.id=revision.operating_day_id
      where revision.organisation_id=p_organisation_id and revision.mission_id=p_mission_id
        and (revision.mission_pack_revision_id<>day.mission_pack_revision_id
          or revision.planned_chemical_revision_id<>public.ftf_mission_day_planned_chemical_revision_id(p_organisation_id,p_mission_id,day.id)))
    or exists(select 1 from public.mission_day_weather_reports weather join public.mission_operating_days day
        on day.organisation_id=weather.organisation_id and day.mission_id=weather.mission_id and day.id=weather.operating_day_id
      where weather.organisation_id=p_organisation_id and weather.mission_id=p_mission_id
        and weather.mission_pack_revision_id<>day.mission_pack_revision_id)
    or exists(select 1 from public.mission_authorisation_revisions decision where decision.organisation_id=p_organisation_id
      and decision.mission_id=p_mission_id and decision.mission_pack_revision_id is not null
      and not exists(select 1 from public.mission_pack_revisions pack where pack.organisation_id=p_organisation_id
        and pack.mission_id=p_mission_id and pack.id=decision.mission_pack_revision_id))
    or exists(select 1 from public.mission_aircraft_day_actuals actual where actual.organisation_id=p_organisation_id and actual.mission_id=p_mission_id
      and (actual.mission_aircraft_assignment_id is null or not exists(select 1 from public.mission_aircraft_assignments assignment
        where assignment.organisation_id=p_organisation_id and assignment.id=actual.mission_aircraft_assignment_id
          and assignment.mission_id=p_mission_id and assignment.operating_location_id=v_mission.operating_location_id
          and assignment.aircraft_id=actual.aircraft_id and (
            (actual.signed_off_at is null and assignment.unassigned_at is null)
            or (actual.signed_off_at is not null and assignment.assigned_at<=actual.signed_off_at
              and (assignment.unassigned_at is null or assignment.unassigned_at>=actual.signed_off_at))))))
    -- reference: aircraft_day_assignment
    or exists(select 1 from public.mission_day_field_activity activity join public.mission_operating_days day
      on day.organisation_id=activity.organisation_id and day.mission_id=activity.mission_id and day.id=activity.operating_day_id
      where activity.organisation_id=p_organisation_id and activity.mission_id=p_mission_id
      and not exists(select 1 from public.mission_pack_fields scope where scope.organisation_id=p_organisation_id and scope.mission_id=p_mission_id
        and scope.pack_revision_id=day.mission_pack_revision_id and scope.field_id=activity.field_id))
    -- reference: flight_field
    or exists(select 1 from public.mission_flight_actuals flight join public.mission_operating_days day
        on day.organisation_id=flight.organisation_id and day.mission_id=flight.mission_id and day.id=flight.operating_day_id
      where flight.organisation_id=p_organisation_id and flight.mission_id=p_mission_id and flight.field_id is not null
      and not exists(select 1 from public.mission_pack_fields scope where scope.organisation_id=p_organisation_id and scope.mission_id=p_mission_id
        and scope.pack_revision_id=day.mission_pack_revision_id and scope.field_id=flight.field_id))
    -- reference: chemical_line_field
    or exists(select 1 from public.mission_day_chemical_lines line join public.mission_operating_days day
        on day.organisation_id=line.organisation_id and day.mission_id=line.mission_id and day.id=line.operating_day_id
      where line.organisation_id=p_organisation_id and line.mission_id=p_mission_id
      and not exists(select 1 from public.mission_pack_fields scope where scope.organisation_id=p_organisation_id and scope.mission_id=p_mission_id
        and scope.pack_revision_id=day.mission_pack_revision_id and scope.field_id=line.field_id))
    -- reference: flight_source_import
    or exists(select 1 from public.mission_flight_actuals flight where flight.organisation_id=p_organisation_id and flight.mission_id=p_mission_id and flight.source_import_id is not null
      and not exists(select 1 from public.mission_operational_imports import where import.organisation_id=p_organisation_id and import.mission_id=p_mission_id
        and import.operating_location_id=v_mission.operating_location_id and import.id=flight.source_import_id))
    -- reference: attribution_import
    or exists(select 1 from public.mission_operational_import_attributions attribution where attribution.organisation_id=p_organisation_id and attribution.mission_id=p_mission_id
      and not exists(select 1 from public.mission_operational_imports import where import.organisation_id=p_organisation_id and import.mission_id=p_mission_id
        and import.operating_location_id=v_mission.operating_location_id and import.id=attribution.operational_import_id))
    -- reference: attribution_aircraft
    or exists(select 1 from public.mission_operational_import_attributions attribution where attribution.organisation_id=p_organisation_id and attribution.mission_id=p_mission_id
      and attribution.aircraft_id is not null and not exists(select 1 from public.mission_aircraft_day_actuals actual join public.aircraft aircraft
        on aircraft.organisation_id=actual.organisation_id and aircraft.id=actual.aircraft_id
        where actual.organisation_id=p_organisation_id and actual.mission_id=p_mission_id and actual.aircraft_id=attribution.aircraft_id
          and aircraft.operating_location_id=v_mission.operating_location_id))
    or exists(select 1 from public.mission_operational_import_attributions attribution where attribution.organisation_id=p_organisation_id
      and attribution.mission_id=p_mission_id and attribution.operating_day_id is not null and attribution.aircraft_id is not null
      and not exists(select 1 from public.mission_aircraft_day_actuals actual where actual.organisation_id=p_organisation_id
        and actual.mission_id=p_mission_id and actual.operating_day_id=attribution.operating_day_id
        and actual.aircraft_id=attribution.aircraft_id))
    -- reference: weather_source_observation
    or exists(select 1 from public.mission_day_weather_reports weather where weather.organisation_id=p_organisation_id and weather.mission_id=p_mission_id
      and not exists(select 1 from public.mission_weather_observations observation where observation.organisation_id=p_organisation_id
        and observation.mission_id=p_mission_id and observation.operating_location_id=v_mission.operating_location_id
        and observation.id=weather.source_weather_observation_id))
    -- reference: aircraft_identity
    or exists(select 1 from public.mission_aircraft_day_actuals actual where actual.organisation_id=p_organisation_id and actual.mission_id=p_mission_id
      and not exists(select 1 from public.aircraft aircraft where aircraft.organisation_id=p_organisation_id and aircraft.id=actual.aircraft_id
        and aircraft.operating_location_id=v_mission.operating_location_id))
    or exists(select 1 from public.mission_day_jsa_reviews review join public.mission_operating_days day
        on day.organisation_id=review.organisation_id and day.mission_id=review.mission_id and day.id=review.operating_day_id
      where review.organisation_id=p_organisation_id and review.mission_id=p_mission_id
        and (review.jsa_revision_id<>day.jsa_revision_id or not exists(select 1 from public.mission_jsa_revisions jsa
          where jsa.organisation_id=p_organisation_id and jsa.mission_id=p_mission_id and jsa.id=review.jsa_revision_id
            and jsa.operating_location_id=v_mission.operating_location_id)))
    or exists(select 1 from public.mission_day_chemical_lines line join public.mission_day_chemical_revisions revision
        on revision.organisation_id=line.organisation_id and revision.id=line.revision_id
      where line.organisation_id=p_organisation_id and line.mission_id=p_mission_id
        and (revision.mission_id<>p_mission_id or revision.operating_day_id<>line.operating_day_id))
    -- reference: chemical_planned_line
    or exists(select 1 from public.mission_day_chemical_lines line join public.mission_day_chemical_revisions revision
        on revision.organisation_id=line.organisation_id and revision.id=line.revision_id
      join public.mission_operating_days day on day.organisation_id=line.organisation_id and day.mission_id=line.mission_id and day.id=line.operating_day_id
      where line.organisation_id=p_organisation_id and line.mission_id=p_mission_id and (
        revision.mission_pack_revision_id<>day.mission_pack_revision_id
        or revision.planned_chemical_revision_id<>public.ftf_mission_day_planned_chemical_revision_id(p_organisation_id,p_mission_id,day.id)
        or (line.planned_line_id is not null and not exists(select 1 from public.mission_chemical_plan_lines planned
          where planned.organisation_id=p_organisation_id and planned.id=line.planned_line_id and planned.mission_id=p_mission_id
            and planned.revision_id=revision.planned_chemical_revision_id))))
    -- reference: chemical_aircraft_participation
    or exists(select 1 from public.mission_day_chemical_lines line where line.organisation_id=p_organisation_id
      and line.mission_id=p_mission_id and line.aircraft_id is not null and not exists(
        select 1 from public.mission_aircraft_day_actuals actual join public.aircraft aircraft
          on aircraft.organisation_id=actual.organisation_id and aircraft.id=actual.aircraft_id
        where actual.organisation_id=p_organisation_id and actual.mission_id=p_mission_id
          and actual.operating_day_id=line.operating_day_id and actual.aircraft_id=line.aircraft_id
          and aircraft.operating_location_id=v_mission.operating_location_id))
    or exists(select 1 from public.mission_chemical_plan_lines line join public.mission_chemical_plan_revisions revision
        on revision.organisation_id=line.organisation_id and revision.id=line.revision_id
      where line.organisation_id=p_organisation_id and line.mission_id=p_mission_id
        and (revision.mission_id<>p_mission_id or line.mission_id<>revision.mission_id)) then
    raise exception 'MISSION_REPORT_EVIDENCE_INVALID: reference' using errcode='22023';
  end if;

  -- Preconstruction collection bounds. The one-mebibyte final check below is
  -- defense in depth, not the first bound applied to nested evidence.
  -- bound: operating_days
  -- bound: field_activities
  -- bound: day_jsa_reviews
  -- bound: aircraft_day_actuals
  -- bound: flight_actuals
  -- bound: chemical_revisions
  -- bound: chemical_lines
  -- bound: weather_reports
  -- bound: weather_observations
  -- bound: weather_gaps
  -- bound: import_attributions
  -- bound: package_history
  -- bound: decision_history
  -- bound: jsa_history
  -- bound: planned_chemical_revisions
  -- bound: planned_chemical_lines
  -- bound: flight_line_imports
  -- bound: exception_history
  if (select count(*) from public.mission_operating_days where organisation_id=p_organisation_id and mission_id=p_mission_id)>366
    or (select count(*) from public.mission_day_field_activity where organisation_id=p_organisation_id and mission_id=p_mission_id)>5000
    or (select count(*) from public.mission_day_jsa_reviews where organisation_id=p_organisation_id and mission_id=p_mission_id)>366
    or (select count(*) from public.mission_aircraft_day_actuals where organisation_id=p_organisation_id and mission_id=p_mission_id)>5000
    or (select count(*) from public.mission_flight_actuals where organisation_id=p_organisation_id and mission_id=p_mission_id)>10000
    or (select count(*) from public.mission_day_chemical_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id)>1000
    or (select count(*) from public.mission_day_chemical_lines where organisation_id=p_organisation_id and mission_id=p_mission_id)>10000
    or (select count(*) from public.mission_day_weather_reports where organisation_id=p_organisation_id and mission_id=p_mission_id)>366
    or (select coalesce(sum(jsonb_array_length(hourly_observations)),0) from public.mission_day_weather_reports where organisation_id=p_organisation_id and mission_id=p_mission_id)>10000
    or (select coalesce(sum(jsonb_array_length(coverage_gaps)),0) from public.mission_day_weather_reports where organisation_id=p_organisation_id and mission_id=p_mission_id)>10000
    or (select count(*) from public.mission_operational_import_attributions where organisation_id=p_organisation_id and mission_id=p_mission_id)>5000
    or (select count(*) from public.mission_pack_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id)>64
    or (select count(*) from public.mission_authorisation_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id)>64
    or (select count(*) from public.mission_jsa_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id)>64
    or (select count(*) from public.mission_chemical_plan_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id)>64
    or (select count(*) from public.mission_chemical_plan_lines where organisation_id=p_organisation_id and mission_id=p_mission_id)>200
    or (select count(*) from public.mission_operational_imports where organisation_id=p_organisation_id and mission_id=p_mission_id and evidence_type in ('FINAL_KML','FLIGHT_LINES'))>200
    or (select count(*) from public.mission_package_amendments where organisation_id=p_organisation_id and mission_id=p_mission_id)>100 then
    raise exception 'MISSION_REPORT_EVIDENCE_BOUND_EXCEEDED' using errcode='22023';
  end if;
  if (select coalesce(sum(cardinality(changed_keys)),0) from public.mission_package_amendments where organisation_id=p_organisation_id and mission_id=p_mission_id)>6400
    or (select coalesce(sum(cardinality(reasons)),0) from public.mission_package_amendments where organisation_id=p_organisation_id and mission_id=p_mission_id)>6400 then
    raise exception 'MISSION_REPORT_EVIDENCE_BOUND_EXCEEDED' using errcode='22023';
  end if;
  if not exists(select 1 from public.mission_pack_fields where organisation_id=p_organisation_id and mission_id=p_mission_id and pack_revision_id=v_effective_pack.id)
    or exists(select 1 from public.mission_pack_fields scope join public.fields field on field.organisation_id=scope.organisation_id and field.id=scope.field_id
      join public.properties property on property.organisation_id=field.organisation_id and property.id=field.property_id
      where scope.organisation_id=p_organisation_id and scope.mission_id=p_mission_id and scope.pack_revision_id=v_effective_pack.id
        and (scope.operating_location_id<>v_mission.operating_location_id or property.client_id<>v_client.id)) then
    raise exception 'MISSION_REPORT_EVIDENCE_INVALID: scope' using errcode='22023';
  end if;
  if (select count(*) from public.mission_pack_fields where organisation_id=p_organisation_id and mission_id=p_mission_id and pack_revision_id=v_effective_pack.id)>200
    or (select count(*) from public.mission_pack_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id)>64
    or (select count(*) from public.mission_authorisation_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id)>64
    or (select count(*) from public.mission_jsa_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id)>64
    or (select count(distinct aircraft_id) from public.mission_aircraft_day_actuals where organisation_id=p_organisation_id and mission_id=p_mission_id)>200
    or (select count(*) from public.mission_chemical_plan_lines where organisation_id=p_organisation_id and mission_id=p_mission_id)>200
    or (select count(*) from public.mission_operational_imports where organisation_id=p_organisation_id and mission_id=p_mission_id and evidence_type in ('FINAL_KML','FLIGHT_LINES'))>200
    or (select count(*) from public.mission_package_amendments where organisation_id=p_organisation_id and mission_id=p_mission_id)>100 then
    raise exception 'MISSION_REPORT_EVIDENCE_BOUND_EXCEEDED' using errcode='22023';
  end if;
  if exists(select 1 from public.mission_operating_days where organisation_id=p_organisation_id and mission_id=p_mission_id and operating_location_id<>v_mission.operating_location_id)
    or exists(select 1 from public.mission_aircraft_day_actuals where organisation_id=p_organisation_id and mission_id=p_mission_id and operating_location_id<>v_mission.operating_location_id)
    or exists(select 1 from public.mission_day_chemical_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id and operating_location_id<>v_mission.operating_location_id)
    or exists(select 1 from public.mission_day_weather_reports where organisation_id=p_organisation_id and mission_id=p_mission_id and operating_location_id<>v_mission.operating_location_id) then
    raise exception 'MISSION_REPORT_EVIDENCE_INVALID: base' using errcode='22023';
  end if;

  v_manifest := jsonb_build_object(
    'schemaVersion',1,
    'scope',jsonb_build_object(
      'mission',jsonb_build_object('id',v_mission.id,'missionNumber',v_mission.mission_number,'operatingLocationId',v_mission.operating_location_id),
      'job',jsonb_build_object('id',v_job.id,'reference',v_job.reference),
      'client',jsonb_build_object('id',v_client.id,'name',v_client.name),
      'properties',coalesce((select jsonb_agg(jsonb_build_object('id',grouped.property_id,'name',grouped.property_name,'address',grouped.address,'fields',grouped.fields) order by grouped.property_name,grouped.property_id) from (
        select property.id property_id,property.name property_name,property.address,
          jsonb_agg(jsonb_build_object('id',field.id,'name',field.name,'areaHectares',field.area_hectares::text,'targetHectares',job_scope.target_area_hectares::text,'fieldOrder',scope.field_order) order by scope.field_order,field.id) fields
        from public.mission_pack_fields scope join public.fields field on field.organisation_id=scope.organisation_id and field.id=scope.field_id
        join public.properties property on property.organisation_id=field.organisation_id and property.id=field.property_id
        left join public.job_fields job_scope on job_scope.organisation_id=scope.organisation_id and job_scope.job_id=scope.job_id and job_scope.field_id=scope.field_id
        where scope.organisation_id=p_organisation_id and scope.mission_id=p_mission_id and scope.pack_revision_id=v_effective_pack.id
        group by property.id,property.name,property.address
      ) grouped),'[]'::jsonb)
    ),
    'governance',jsonb_build_object(
      'effectivePackage',jsonb_build_object('id',v_effective_pack.id,'revisionNumber',v_effective_pack.version_number,'evidenceDigest',v_effective_pack.evidence_digest),
      'packageHistory',coalesce((select jsonb_agg(jsonb_build_object('id',pack.id,'revisionNumber',pack.version_number,'state',pack.package_state,'evidenceDigest',pack.evidence_digest,'generatedAt',pack.generated_at,'submittedAt',pack.submitted_at) order by pack.version_number,pack.id) from public.mission_pack_revisions pack where pack.organisation_id=p_organisation_id and pack.mission_id=p_mission_id),'[]'::jsonb),
      'decisionHistory',coalesce((select jsonb_agg(jsonb_build_object('id',decision.id,'revisionNumber',decision.version_number,'packageRevisionId',decision.mission_pack_revision_id,'decision',decision.decision,'evidenceDigest',decision.evidence_digest,'personnelId',decision.authorised_personnel_id,'decidedAt',decision.authorised_at) order by decision.version_number,decision.id) from public.mission_authorisation_revisions decision where decision.organisation_id=p_organisation_id and decision.mission_id=p_mission_id),'[]'::jsonb),
      'effectiveApproval',jsonb_build_object('id',v_effective_approval.id,'revisionNumber',v_effective_approval.version_number,'personnelId',v_effective_approval.authorised_personnel_id,'decidedAt',v_effective_approval.authorised_at),
      'governingJsa',jsonb_build_object('id',v_effective_pack.jsa_revision_id,'versionNumber',(select jsa.version_number from public.mission_jsa_revisions jsa where jsa.organisation_id=p_organisation_id and jsa.id=v_effective_pack.jsa_revision_id)),
      'jsaHistory',coalesce((select jsonb_agg(jsonb_build_object('id',jsa.id,'versionNumber',jsa.version_number,'templateVersion',jsa.template_version,'policyVersion',jsa.policy_version,'createdAt',jsa.created_at) order by jsa.version_number,jsa.id) from public.mission_jsa_revisions jsa where jsa.organisation_id=p_organisation_id and jsa.mission_id=p_mission_id),'[]'::jsonb)
    ),
    'aircraft',coalesce((select jsonb_agg(jsonb_build_object('id',aircraft.id,'registration',aircraft.registration,'manufacturer',aircraft.manufacturer,'model',aircraft.model,'serialNumber',aircraft.serial_number,
      'dailyParticipation',(select jsonb_agg(jsonb_build_object('operatingDayId',actual.operating_day_id,'totalFlightHours',actual.total_flight_hours::text,'totalSource',actual.total_source,'reconciliationStatus',actual.reconciliation_status) order by day.work_date,actual.operating_day_id)
        from public.mission_aircraft_day_actuals actual join public.mission_operating_days day on day.organisation_id=actual.organisation_id and day.id=actual.operating_day_id
        where actual.organisation_id=p_organisation_id and actual.mission_id=p_mission_id and actual.aircraft_id=aircraft.id)) order by aircraft.registration,aircraft.id)
      from public.aircraft aircraft where aircraft.organisation_id=p_organisation_id and exists(select 1 from public.mission_aircraft_day_actuals actual where actual.organisation_id=p_organisation_id and actual.mission_id=p_mission_id and actual.aircraft_id=aircraft.id)),'[]'::jsonb),
    'plannedChemicals',coalesce((select jsonb_agg(jsonb_build_object('revisionId',revision.id,'revisionNumber',revision.version_number,'treatmentAreaHectares',revision.treatment_area_ha::text,
      'lines',(select jsonb_agg(jsonb_build_object('id',line.id,'lineNumber',line.line_number,'productName',line.product_name,'manufacturer',line.manufacturer,'apvmaNumber',line.apvma_number,'rate',line.rate::text,'rateUnit',line.rate_unit,'totalQuantity',line.total_product_quantity::text,'quantityUnit',line.total_product_unit,'productSnapshot',line.snapshot) order by line.line_number,line.id) from public.mission_chemical_plan_lines line where line.organisation_id=revision.organisation_id and line.revision_id=revision.id)) order by revision.version_number,revision.id)
      from public.mission_chemical_plan_revisions revision where revision.organisation_id=p_organisation_id and revision.mission_id=p_mission_id and exists(select 1 from public.mission_operating_days day where day.organisation_id=p_organisation_id and day.mission_id=p_mission_id and public.ftf_mission_day_planned_chemical_revision_id(p_organisation_id,p_mission_id,day.id)=revision.id)),'[]'::jsonb),
    'flightLineEvidence',coalesce((select jsonb_agg(jsonb_build_object('id',import.id,'versionNumber',import.version_number,'filename',import.original_filename,'digest',import.sha256_checksum,'format',import.source_format,'evidenceType',import.evidence_type,'importedAt',import.imported_at) order by import.version_number,import.id) from public.mission_operational_imports import where import.organisation_id=p_organisation_id and import.mission_id=p_mission_id and import.evidence_type in ('FINAL_KML','FLIGHT_LINES')),'[]'::jsonb),
    'exceptionHistory',coalesce((select jsonb_agg(jsonb_build_object('id',amendment.id,'classification',amendment.classification,'changedKeys',amendment.changed_keys,'reasons',amendment.reasons,'reason',amendment.amendment_reason,'beforeDigest',amendment.before_digest,'afterDigest',amendment.after_digest,'createdAt',amendment.created_at) order by amendment.created_at,amendment.id) from public.mission_package_amendments amendment where amendment.organisation_id=p_organisation_id and amendment.mission_id=p_mission_id),'[]'::jsonb)
  );
  if octet_length(v_manifest::text)>1048576 then raise exception 'MISSION_REPORT_EVIDENCE_BOUND_EXCEEDED' using errcode='22023'; end if;
  return v_manifest;
end $$;

create function public.ftf_build_mission_daily_evidence_manifest(
  p_organisation_id uuid,p_mission_id uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_daily jsonb; v_report jsonb;
begin
  v_report:=public.ftf_build_mission_report_evidence_manifest(p_organisation_id,p_mission_id);
  v_daily:=public.ftf_build_mission_daily_evidence_manifest_before_report_evidence(p_organisation_id,p_mission_id);
  if v_daily is null or jsonb_typeof(v_daily)<>'object' or v_report is null or jsonb_typeof(v_report)<>'object' then
    raise exception 'MISSION_REPORT_EVIDENCE_INVALID: manifest' using errcode='22023';
  end if;
  return v_daily||jsonb_build_object('reportEvidence',v_report);
end $$;

revoke all on function public.ftf_build_mission_daily_evidence_manifest_before_report_evidence(uuid,uuid),
  public.ftf_build_mission_report_evidence_manifest(uuid,uuid),public.ftf_build_mission_daily_evidence_manifest(uuid,uuid)
  from public,anon,authenticated,service_role;
