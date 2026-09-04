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
  select * into v_client from public.clients where organisation_id=p_organisation_id and id=v_job.client_id and archived_at is null;
  select * into v_effective_pack from public.mission_pack_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id and id=v_mission.current_authorised_pack_revision_id for update;
  select * into v_effective_approval from public.mission_authorisation_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id
    and mission_pack_revision_id=v_effective_pack.id and decision='AUTHORISED' order by version_number desc,id desc limit 1;
  if v_job.id is null or v_client.id is null or v_effective_pack.id is null or v_effective_approval.id is null
    or v_job.client_id<>v_client.id or v_effective_pack.operating_location_id<>v_mission.operating_location_id
    or v_effective_approval.operating_location_id<>v_mission.operating_location_id then
    raise exception 'MISSION_REPORT_EVIDENCE_INVALID: authority' using errcode='22023';
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
  v_daily:=public.ftf_build_mission_daily_evidence_manifest_before_report_evidence(p_organisation_id,p_mission_id);
  v_report:=public.ftf_build_mission_report_evidence_manifest(p_organisation_id,p_mission_id);
  if v_daily is null or jsonb_typeof(v_daily)<>'object' or v_report is null or jsonb_typeof(v_report)<>'object' then
    raise exception 'MISSION_REPORT_EVIDENCE_INVALID: manifest' using errcode='22023';
  end if;
  return v_daily||jsonb_build_object('reportEvidence',v_report);
end $$;

revoke all on function public.ftf_build_mission_daily_evidence_manifest_before_report_evidence(uuid,uuid),
  public.ftf_build_mission_report_evidence_manifest(uuid,uuid),public.ftf_build_mission_daily_evidence_manifest(uuid,uuid)
  from public,anon,authenticated,service_role;
