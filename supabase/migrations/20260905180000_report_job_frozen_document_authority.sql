-- Worker-safe, exact-job capability: authorisation was established when the
-- immutable artefact/job was requested. Rendering must not depend on later
-- seat or role changes and cannot enumerate another report or completion.
create function public.ftf_bind_report_request_authority() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_type_permission text;
begin
  v_type_permission:=case new.report_type when 'MISSION_PACK' then 'mission.pack.generate' when 'MISSION_SUMMARY' then 'mission.summary.generate' when 'MISSION_RECORD' then 'mission.record.generate' end;
  if v_type_permission is null or not public.ftf_actor_has_active_beta_seat(new.organisation_id,new.requested_by_internal_user_id)
    or not public.ftf_actor_has_permission(new.organisation_id,new.requested_by_internal_user_id,'reports.generate')
    or not public.ftf_actor_has_permission(new.organisation_id,new.requested_by_internal_user_id,v_type_permission)
    or not public.ftf_operational_location_allowed(new.organisation_id,new.requested_by_internal_user_id,new.operating_location_id) then
    raise exception 'REPORT_REQUEST_FORBIDDEN' using errcode='42501'; end if;
  return new;
end $$;
create trigger report_artefact_request_authority before insert on public.report_artefacts
for each row execute function public.ftf_bind_report_request_authority();
revoke all on function public.ftf_bind_report_request_authority() from public,anon,authenticated,service_role;

create function public.ftf_read_report_job_frozen_document(
  p_job_id uuid,p_artefact_id uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_job public.report_generation_jobs%rowtype; v_artefact public.report_artefacts%rowtype;
  v_completion public.mission_completion_revisions%rowtype; v_completion_id uuid;
  v_digest text; v_manifest_digest text; v_expected jsonb;
begin
  select * into v_job from public.report_generation_jobs where id=p_job_id and artefact_id=p_artefact_id and status='GENERATING';
  if not found then return jsonb_build_object('error','REPORT_JOB_NOT_GENERATING'); end if;
  select * into v_artefact from public.report_artefacts where id=p_artefact_id and organisation_id=v_job.organisation_id
    and report_type in('MISSION_SUMMARY','MISSION_RECORD') and status='GENERATING';
  if not found then return jsonb_build_object('error','REPORT_ARTEFACT_NOT_FOUND'); end if;
  begin v_completion_id:=(v_artefact.evidence_manifest#>>'{completionRevision,id}')::uuid;
  exception when others then return jsonb_build_object('error','REPORT_COMPLETION_ID_INVALID'); end;
  if v_completion_id is null then return jsonb_build_object('error','REPORT_COMPLETION_ID_INVALID'); end if;
  select * into v_completion from public.mission_completion_revisions where id=v_completion_id
    and organisation_id=v_artefact.organisation_id and operating_location_id=v_artefact.operating_location_id
    and mission_id=v_artefact.mission_id;
  if not found then return jsonb_build_object('error','REPORT_COMPLETION_NOT_FOUND'); end if;
  if v_completion.report_document_era<2 then return jsonb_build_object('status','HISTORICAL_REPORT_DOCUMENT_UNAVAILABLE','completionRevisionId',v_completion.id); end if;
  if v_completion.report_document_era<>2 or v_completion.report_document_schema_version<>2
    or v_completion.report_document_text is null or v_completion.report_document_digest is null then
    raise exception 'MISSION_REPORT_DOCUMENT_INTEGRITY_FAILED' using errcode='22000'; end if;
  v_manifest_digest:=encode(digest(convert_to(v_completion.daily_evidence_manifest::text,'UTF8'),'sha256'),'hex');
  v_expected:=public.ftf_compose_complete_mission_report_document(v_completion);
  v_digest:=encode(digest(convert_to(v_completion.report_document_text,'UTF8'),'sha256'),'hex');
  if v_manifest_digest<>v_completion.daily_evidence_digest or v_completion.report_document_text is distinct from v_expected::text
    or v_digest<>v_completion.report_document_digest then raise exception 'MISSION_REPORT_DOCUMENT_INTEGRITY_FAILED' using errcode='22000'; end if;
  return jsonb_build_object('status','AVAILABLE','completionRevisionId',v_completion.id,
    'documentText',v_completion.report_document_text,'documentDigest',v_completion.report_document_digest);
end $$;
revoke all on function public.ftf_read_report_job_frozen_document(uuid,uuid) from public,anon,authenticated;
grant execute on function public.ftf_read_report_job_frozen_document(uuid,uuid) to service_role;
