-- Restore effective CRP authority in the operational closeout projection.
-- A later rejected proposal must not displace the authorised package that
-- governs started operating days and final operational evidence.

create or replace function public.ftf_read_mission_operational_closeout(p_organisation_id uuid, p_mission_id uuid)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select case when mission.id is null then null else jsonb_build_object(
    'mission', to_jsonb(mission) - 'organisation_id',
    'authorisation', public.ftf_resolve_effective_mission_authorisation(mission.organisation_id, mission.id),
    'availableResources', jsonb_build_object(
      'aircraft', coalesce((select jsonb_agg(jsonb_build_object('id', aircraft.id, 'label', aircraft.registration || ' · ' || aircraft.model) order by aircraft.registration)
        from public.aircraft aircraft where aircraft.organisation_id = mission.organisation_id and aircraft.operating_location_id = mission.operating_location_id and aircraft.archived_at is null), '[]'::jsonb),
      'equipmentKits', coalesce((select jsonb_agg(jsonb_build_object('id', kit.id, 'label', kit.name) order by kit.name)
        from public.equipment_kits kit where kit.organisation_id = mission.organisation_id and kit.operating_location_id = mission.operating_location_id and kit.archived_at is null), '[]'::jsonb),
      'personnel', coalesce((select jsonb_agg(jsonb_build_object('id', personnel.id, 'label', personnel.full_name) order by personnel.full_name)
        from public.personnel personnel join public.personnel_operating_locations location_scope on location_scope.organisation_id = personnel.organisation_id and location_scope.personnel_id = personnel.id
        where personnel.organisation_id = mission.organisation_id and location_scope.operating_location_id = mission.operating_location_id and personnel.archived_at is null), '[]'::jsonb)),
    'imports', coalesce((select jsonb_agg(to_jsonb(import) || jsonb_build_object('attributions', coalesce((
      select jsonb_agg(jsonb_build_object('id', attribution.id, 'operating_day_id', attribution.operating_day_id,
        'aircraft_id', attribution.aircraft_id, 'confidence', attribution.attribution_confidence) order by attribution.attributed_at, attribution.id)
      from public.mission_operational_import_attributions attribution
      where attribution.organisation_id = import.organisation_id and attribution.operational_import_id = import.id
    ), '[]'::jsonb)) order by import.version_number)
      from public.mission_operational_imports import where import.organisation_id = mission.organisation_id and import.mission_id = mission.id), '[]'::jsonb),
    'operatingDays', coalesce((select jsonb_agg(jsonb_build_object(
      'id', day.id, 'work_date', day.work_date::text, 'package_revision_id', day.mission_pack_revision_id,
      'state', day.state, 'row_version', day.row_version,
      'aircraft_actuals', public.ftf_project_mission_aircraft_day_actuals(day.organisation_id, day.mission_id, day.id)
    ) order by day.work_date, day.id) from public.mission_operating_days day
      where day.organisation_id = mission.organisation_id and day.mission_id = mission.id), '[]'::jsonb),
    'resources', (select to_jsonb(resource) from public.mission_operational_resource_revisions resource
      where resource.organisation_id = mission.organisation_id and resource.mission_id = mission.id order by resource.version_number desc limit 1),
    'chemicals', (select to_jsonb(chemical) from public.mission_operational_chemical_revisions chemical
      where chemical.organisation_id = mission.organisation_id and chemical.mission_id = mission.id order by chemical.version_number desc limit 1),
    'events', coalesce((select jsonb_agg(to_jsonb(event) order by event.batch_version, event.event_index)
      from public.mission_operational_events event where event.organisation_id = mission.organisation_id and event.mission_id = mission.id), '[]'::jsonb),
    'operationalRevision', (select to_jsonb(revision) from public.mission_operational_revisions revision
      where revision.organisation_id = mission.organisation_id and revision.mission_id = mission.id order by revision.version_number desc limit 1),
    'completion', (select to_jsonb(completion) from public.mission_completion_revisions completion
      where completion.organisation_id = mission.organisation_id and completion.mission_id = mission.id order by completion.version_number desc limit 1)
  ) end
  from public.missions mission
  where mission.organisation_id = p_organisation_id and mission.id = p_mission_id and mission.archived_at is null
$$;
