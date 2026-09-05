-- Forward-only correction: the exact report document is the complete frozen
-- input, composed only from the canonical completion manifest and identity.

alter table public.mission_completion_revisions drop constraint mission_completion_report_document_pair;
alter table public.mission_completion_revisions alter column report_document_era set default 2;
alter table public.mission_completion_revisions add constraint mission_completion_report_document_pair check (
  (report_document_era=0 and report_document_text is null and report_document_digest is null and report_document_schema_version is null)
  or (report_document_era in (1,2) and report_document_text is not null and report_document_digest~'^[0-9a-f]{64}$'
    and report_document_schema_version=report_document_era
    and octet_length(convert_to(report_document_text,'UTF8')) between 2 and 1048576
    and jsonb_typeof(report_document_text::jsonb)='object'));

create function public.ftf_compose_complete_mission_report_document(
  p_completion public.mission_completion_revisions
) returns jsonb language plpgsql stable set search_path=public,pg_temp as $$
begin
  if p_completion.daily_evidence_manifest is null or p_completion.daily_evidence_digest is null
    or jsonb_typeof(p_completion.daily_evidence_manifest->'reportEvidence')<>'object'
    or jsonb_typeof(p_completion.daily_evidence_manifest->'days')<>'array' then
    raise exception 'MISSION_REPORT_DOCUMENT_INVALID' using errcode='22023';
  end if;
  return jsonb_build_object(
    'schemaVersion',2,
    'reportEvidence',p_completion.daily_evidence_manifest->'reportEvidence',
    'dailyEvidence',p_completion.daily_evidence_manifest-'reportEvidence',
    'finalCompletion',jsonb_build_object(
      'id',p_completion.id,'missionId',p_completion.mission_id,'versionNumber',p_completion.version_number,
      'authorisationRevisionId',p_completion.authorisation_revision_id,'operationalRevisionId',p_completion.operational_revision_id,
      'declaration',p_completion.declaration,'completedByInternalUserId',p_completion.completed_by_internal_user_id,
      'completedAt',p_completion.completed_at,'dailyEvidenceDigest',p_completion.daily_evidence_digest));
end $$;

create function public.ftf_freeze_complete_mission_report_document() returns trigger language plpgsql
security definer set search_path=public,pg_temp as $$
declare v_document jsonb; v_text text; v_manifest_digest text;
begin
  if new.daily_evidence_digest is null then
    new.report_document_era:=0; new.report_document_schema_version:=null;
    new.report_document_text:=null; new.report_document_digest:=null;
    return new;
  end if;
  v_manifest_digest:=encode(digest(convert_to(new.daily_evidence_manifest::text,'UTF8'),'sha256'),'hex');
  if v_manifest_digest<>new.daily_evidence_digest then raise exception 'MISSION_REPORT_DOCUMENT_INTEGRITY_FAILED' using errcode='22000'; end if;
  v_document:=public.ftf_compose_complete_mission_report_document(new);
  v_text:=v_document::text;
  if octet_length(convert_to(v_text,'UTF8'))>1048576 then raise exception 'MISSION_REPORT_DOCUMENT_BOUND_EXCEEDED' using errcode='22023'; end if;
  new.report_document_era:=2; new.report_document_schema_version:=2;
  new.report_document_text:=v_text;
  new.report_document_digest:=encode(digest(convert_to(v_text,'UTF8'),'sha256'),'hex');
  return new;
end $$;

create trigger mission_completion_report_document_freeze before insert on public.mission_completion_revisions
for each row execute function public.ftf_freeze_complete_mission_report_document();

create or replace function public.ftf_read_mission_frozen_report_document(
  p_organisation_id uuid,p_actor_internal_user_id uuid,p_mission_id uuid,p_completion_revision_id uuid default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_mission public.missions%rowtype; v_completion public.mission_completion_revisions%rowtype;
  v_digest text; v_manifest_digest text; v_expected jsonb;
begin
  if not public.ftf_actor_has_active_beta_seat(p_organisation_id,p_actor_internal_user_id)
    or not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'mission.operational.read') then return jsonb_build_object('forbidden',true); end if;
  select * into v_mission from public.missions where organisation_id=p_organisation_id and id=p_mission_id and archived_at is null;
  if not found then return jsonb_build_object('error','MISSION_NOT_FOUND'); end if;
  if not public.ftf_operational_location_allowed(p_organisation_id,p_actor_internal_user_id,v_mission.operating_location_id) then return jsonb_build_object('location_forbidden',true); end if;
  select * into v_completion from public.mission_completion_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id
    and operating_location_id=v_mission.operating_location_id and (p_completion_revision_id is null or id=p_completion_revision_id)
    order by version_number desc limit 1;
  if not found then return jsonb_build_object('error','MISSION_COMPLETION_NOT_FOUND'); end if;
  if v_completion.report_document_era<2 then return jsonb_build_object('status','HISTORICAL_REPORT_DOCUMENT_UNAVAILABLE','completionRevisionId',v_completion.id); end if;
  if v_completion.report_document_era<>2 or v_completion.report_document_schema_version<>2
    or v_completion.report_document_text is null or v_completion.report_document_digest is null then
    raise exception 'MISSION_REPORT_DOCUMENT_INTEGRITY_FAILED' using errcode='22000';
  end if;
  v_manifest_digest:=encode(digest(convert_to(v_completion.daily_evidence_manifest::text,'UTF8'),'sha256'),'hex');
  v_expected:=public.ftf_compose_complete_mission_report_document(v_completion);
  if v_manifest_digest<>v_completion.daily_evidence_digest
    or v_completion.report_document_text is distinct from v_expected::text then
    raise exception 'MISSION_REPORT_DOCUMENT_INTEGRITY_FAILED' using errcode='22000';
  end if;
  v_digest:=encode(digest(convert_to(v_completion.report_document_text,'UTF8'),'sha256'),'hex');
  if v_digest<>v_completion.report_document_digest then raise exception 'MISSION_REPORT_DOCUMENT_INTEGRITY_FAILED' using errcode='22000'; end if;
  return jsonb_build_object('status','AVAILABLE','completionRevisionId',v_completion.id,
    'documentText',v_completion.report_document_text,'documentDigest',v_completion.report_document_digest);
end $$;

revoke all on function public.ftf_compose_complete_mission_report_document(public.mission_completion_revisions),
  public.ftf_freeze_complete_mission_report_document() from public,anon,authenticated,service_role;
revoke all on function public.ftf_read_mission_frozen_report_document(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.ftf_read_mission_frozen_report_document(uuid,uuid,uuid,uuid) to service_role;
