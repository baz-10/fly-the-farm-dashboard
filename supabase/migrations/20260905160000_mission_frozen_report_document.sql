-- Representation-safe frozen report document. PostgreSQL jsonb::text is the
-- deterministic serialization contract: UTF-8, stable key ordering and the
-- canonical decimal strings already carried by reportEvidence remain strings.

alter table public.mission_completion_revisions
  add column report_document_text text,
  add column report_document_digest text,
  add constraint mission_completion_report_document_pair check (
    (report_document_text is null and report_document_digest is null)
    or (report_document_text is not null and report_document_digest ~ '^[0-9a-f]{64}$'
      and octet_length(convert_to(report_document_text,'UTF8')) between 2 and 1048576
      and jsonb_typeof(report_document_text::jsonb)='object'));

create or replace function public.ftf_final_signoff_mission(
  p_organisation_id uuid, p_actor_internal_user_id uuid, p_mission_id uuid,
  p_expected_revision integer, p_declaration text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_mission public.missions%rowtype; v_job public.jobs%rowtype; v_pack public.mission_pack_revisions%rowtype;
  v_auth public.mission_authorisation_revisions%rowtype; v_operational public.mission_operational_revisions%rowtype;
  v_completion public.mission_completion_revisions%rowtype; v_manifest jsonb; v_digest text; v_blockers jsonb; v_current integer;
  v_report_document_text text; v_report_document_digest text;
begin
  perform public.ftf_lock_active_organisation(p_organisation_id);
  perform public.ftf_lock_mission_package_aggregate_allow_final(p_organisation_id,p_mission_id);
  if not public.ftf_actor_has_active_beta_seat(p_organisation_id,p_actor_internal_user_id)
    or not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'mission.completion.complete') then return jsonb_build_object('forbidden',true); end if;
  select * into v_mission from public.missions where organisation_id=p_organisation_id and id=p_mission_id and archived_at is null for update;
  if not found then return jsonb_build_object('error','MISSION_NOT_FOUND'); end if;
  if not public.ftf_operational_location_allowed(p_organisation_id,p_actor_internal_user_id,v_mission.operating_location_id) then return jsonb_build_object('location_forbidden',true); end if;
  select * into v_pack from public.mission_pack_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id and id=v_mission.current_authorised_pack_revision_id for update;
  perform 1 from public.mission_operating_days where organisation_id=p_organisation_id and mission_id=p_mission_id order by work_date,id for update;
  select * into v_job from public.jobs where organisation_id=p_organisation_id and id=v_mission.job_id and archived_at is null for update;
  select coalesce(max(version_number),0) into v_current from public.mission_completion_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id;
  if v_current > 0 then
    select * into v_completion from public.mission_completion_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id and version_number=v_current;
    if v_completion.daily_evidence_digest is not null and v_completion.declaration=p_declaration
      and p_expected_revision in (v_current,v_current-1) then
      return jsonb_build_object('record',to_jsonb(v_completion),'idempotent',true);
    end if;
  end if;
  if p_expected_revision is null or p_expected_revision<>v_current then return jsonb_build_object('error','MISSION_COMPLETION_VERSION_CONFLICT','current_version',v_current); end if;
  if p_declaration is null or p_declaration<>btrim(p_declaration) or length(p_declaration) not between 1 and 2000 then return jsonb_build_object('error','MISSION_FINAL_DECLARATION_INVALID'); end if;
  v_blockers:=public.ftf_mission_final_signoff_blockers(p_organisation_id,p_mission_id);
  if jsonb_array_length(v_blockers)>0 then return jsonb_build_object('error',(v_blockers->0->>'code'),'readiness',jsonb_build_object('blockers',v_blockers)); end if;
  select * into v_auth from public.mission_authorisation_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id and mission_pack_revision_id=v_pack.id and decision='AUTHORISED' order by version_number desc limit 1;
  select * into v_operational from public.mission_operational_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id order by version_number desc limit 1;
  v_manifest:=public.ftf_build_mission_daily_evidence_manifest(p_organisation_id,p_mission_id);
  v_digest:=encode(digest(convert_to(v_manifest::text,'UTF8'),'sha256'),'hex');
  if jsonb_typeof(v_manifest->'reportEvidence')<>'object' then raise exception 'MISSION_REPORT_DOCUMENT_INVALID' using errcode='22023'; end if;
  v_report_document_text := (v_manifest->'reportEvidence')::text;
  if octet_length(convert_to(v_report_document_text,'UTF8'))>1048576 then raise exception 'MISSION_REPORT_DOCUMENT_BOUND_EXCEEDED' using errcode='22023'; end if;
  v_report_document_digest:=encode(digest(convert_to(v_report_document_text,'UTF8'),'sha256'),'hex');
  insert into public.mission_completion_revisions(organisation_id,operating_location_id,mission_id,version_number,authorisation_revision_id,operational_revision_id,completion_snapshot,declaration,completed_by_internal_user_id,daily_evidence_manifest,daily_evidence_digest,report_document_text,report_document_digest)
  values(p_organisation_id,v_mission.operating_location_id,p_mission_id,v_current+1,v_auth.id,v_operational.id,
    jsonb_build_object('schemaVersion',2,'planningAndPreflightAuthorisation',to_jsonb(v_auth),'operationalEvidence',to_jsonb(v_operational),'dailyEvidenceDigest',v_digest,'reportDocumentDigest',v_report_document_digest,'completedAt',now()),
    p_declaration,p_actor_internal_user_id,v_manifest,v_digest,v_report_document_text,v_report_document_digest) returning * into v_completion;
  insert into public.mission_final_projection_sources(organisation_id,operating_location_id,mission_id,completion_revision_id,projection_type,source_digest,source_manifest)
    values(p_organisation_id,v_mission.operating_location_id,p_mission_id,v_completion.id,'FLEET',v_digest,jsonb_build_object('dailyEvidenceDigest',v_digest,'days',v_manifest->'days')),
      (p_organisation_id,v_mission.operating_location_id,p_mission_id,v_completion.id,'FINANCIAL',v_digest,jsonb_build_object('dailyEvidenceDigest',v_digest,'operationalDays',v_manifest->'operationalDays','actualWorkHours',v_manifest->'actualWorkHours','totalAircraftHours',v_manifest->'totalAircraftHours'))
    on conflict (organisation_id,completion_revision_id,projection_type) do nothing;
  update public.missions set status='completed',row_version=row_version+1,updated_at=now() where organisation_id=p_organisation_id and id=p_mission_id;
  update public.jobs set status='completion_review',row_version=row_version+1,updated_at=now() where organisation_id=p_organisation_id and id=v_job.id and lower(status)<>'closed';
  insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload) values
    (p_organisation_id,p_actor_internal_user_id,'mission.final_signed_off','mission',p_mission_id,jsonb_build_object('completion_revision_id',v_completion.id,'version',v_completion.version_number,'daily_evidence_digest',v_digest,'report_document_digest',v_report_document_digest));
  insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload) values
    (p_organisation_id,'completion.mission.final_signed_off','mission',p_mission_id,jsonb_build_object('completion_revision_id',v_completion.id,'version',v_completion.version_number,'daily_evidence_digest',v_digest,'report_document_digest',v_report_document_digest));
  return jsonb_build_object('record',to_jsonb(v_completion));
end $$;

create function public.ftf_read_mission_frozen_report_document(
  p_organisation_id uuid,p_actor_internal_user_id uuid,p_mission_id uuid,p_completion_revision_id uuid default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_mission public.missions%rowtype; v_completion public.mission_completion_revisions%rowtype; v_digest text;
begin
  if not public.ftf_actor_has_active_beta_seat(p_organisation_id,p_actor_internal_user_id)
    or not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'mission.operational.read') then return jsonb_build_object('forbidden',true); end if;
  select * into v_mission from public.missions where organisation_id=p_organisation_id and id=p_mission_id and archived_at is null;
  if not found then return jsonb_build_object('error','MISSION_NOT_FOUND'); end if;
  if not public.ftf_operational_location_allowed(p_organisation_id,p_actor_internal_user_id,v_mission.operating_location_id) then return jsonb_build_object('location_forbidden',true); end if;
  select * into v_completion from public.mission_completion_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id
    and operating_location_id=v_mission.operating_location_id
    and (p_completion_revision_id is null or id=p_completion_revision_id) order by version_number desc limit 1;
  if not found then return jsonb_build_object('error','MISSION_COMPLETION_NOT_FOUND'); end if;
  if v_completion.report_document_text is null and v_completion.report_document_digest is null then
    return jsonb_build_object('status','HISTORICAL_REPORT_DOCUMENT_UNAVAILABLE','completionRevisionId',v_completion.id);
  end if;
  if v_completion.report_document_text is null or v_completion.report_document_digest is null
    or jsonb_typeof(v_completion.report_document_text::jsonb)<>'object' then raise exception 'MISSION_REPORT_DOCUMENT_INTEGRITY_FAILED' using errcode='22000'; end if;
  v_digest:=encode(digest(convert_to(v_completion.report_document_text,'UTF8'),'sha256'),'hex');
  if v_digest<>v_completion.report_document_digest then raise exception 'MISSION_REPORT_DOCUMENT_INTEGRITY_FAILED' using errcode='22000'; end if;
  return jsonb_build_object('status','AVAILABLE','completionRevisionId',v_completion.id,
    'documentText',v_completion.report_document_text,'documentDigest',v_completion.report_document_digest);
end $$;

revoke all on function public.ftf_read_mission_frozen_report_document(uuid,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.ftf_final_signoff_mission(uuid,uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.ftf_read_mission_frozen_report_document(uuid,uuid,uuid,uuid),
  public.ftf_final_signoff_mission(uuid,uuid,uuid,integer,text) to service_role;
