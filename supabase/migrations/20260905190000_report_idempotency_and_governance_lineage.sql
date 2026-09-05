-- Bind idempotent report reuse to the same authority/scope as creation.
alter function public.ftf_request_report_artefact(uuid,uuid,uuid,text,text)
  rename to ftf_request_report_artefact_before_scope_bound_reuse;

create function public.ftf_request_report_artefact(
  p_organisation_id uuid,p_actor_internal_user_id uuid,p_mission_id uuid,p_report_type text,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_mission public.missions%rowtype; v_existing public.report_artefacts%rowtype; v_permission text;
begin
  v_permission:=case p_report_type when 'MISSION_PACK' then 'mission.pack.generate' when 'MISSION_SUMMARY' then 'mission.summary.generate' when 'MISSION_RECORD' then 'mission.record.generate' end;
  if v_permission is null or not public.ftf_actor_has_active_beta_seat(p_organisation_id,p_actor_internal_user_id)
    or not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'reports.generate')
    or not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,v_permission) then
    return jsonb_build_object('forbidden',true); end if;
  select * into v_mission from public.missions where organisation_id=p_organisation_id and id=p_mission_id and archived_at is null;
  if not found then return jsonb_build_object('not_found',true); end if;
  if not public.ftf_operational_location_allowed(p_organisation_id,p_actor_internal_user_id,v_mission.operating_location_id) then
    return jsonb_build_object('location_forbidden',true); end if;
  perform pg_advisory_xact_lock(hashtextextended('report-idempotency:'||p_organisation_id::text||':'||p_idempotency_key,0));
  select * into v_existing from public.report_artefacts where organisation_id=p_organisation_id and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.mission_id<>v_mission.id or v_existing.report_type<>p_report_type
      or v_existing.operating_location_id<>v_mission.operating_location_id
      or v_existing.requested_by_internal_user_id<>p_actor_internal_user_id then
      return jsonb_build_object('conflict',true,'error','REPORT_IDEMPOTENCY_SCOPE_MISMATCH'); end if;
    return jsonb_build_object('artefact',to_jsonb(v_existing),'reused',true);
  end if;
  return public.ftf_request_report_artefact_before_scope_bound_reuse(
    p_organisation_id,p_actor_internal_user_id,p_mission_id,p_report_type,p_idempotency_key);
end $$;
revoke all on function public.ftf_request_report_artefact_before_scope_bound_reuse(uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.ftf_request_report_artefact(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.ftf_request_report_artefact(uuid,uuid,uuid,text,text) to service_role;

-- Add exact immutable governance lineage to all newly frozen report manifests.
alter function public.ftf_build_mission_report_evidence_manifest(uuid,uuid)
  rename to ftf_build_mission_report_evidence_manifest_before_explicit_lineage;
create function public.ftf_build_mission_report_evidence_manifest(p_organisation_id uuid,p_mission_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_manifest jsonb; v_effective_package uuid; v_effective_approval uuid;
begin
  v_manifest:=public.ftf_build_mission_report_evidence_manifest_before_explicit_lineage(p_organisation_id,p_mission_id);
  v_effective_package:=(v_manifest#>>'{governance,effectivePackage,id}')::uuid;
  v_effective_approval:=(v_manifest#>>'{governance,effectiveApproval,id}')::uuid;
  v_manifest:=jsonb_set(v_manifest,'{governance,effectivePackage}',
    (v_manifest#>'{governance,effectivePackage}')||jsonb_build_object('jsaRevisionId',(select jsa_revision_id from public.mission_pack_revisions where organisation_id=p_organisation_id and id=v_effective_package)));
  v_manifest:=jsonb_set(v_manifest,'{governance,effectiveApproval}',
    (v_manifest#>'{governance,effectiveApproval}')||jsonb_build_object('packageRevisionId',(select mission_pack_revision_id from public.mission_authorisation_revisions where organisation_id=p_organisation_id and id=v_effective_approval)));
  v_manifest:=jsonb_set(v_manifest,'{governance,packageHistory}',coalesce((select jsonb_agg(item||jsonb_build_object('jsaRevisionId',pack.jsa_revision_id) order by (item->>'revisionNumber')::integer,item->>'id')
    from jsonb_array_elements(v_manifest#>'{governance,packageHistory}') item join public.mission_pack_revisions pack
      on pack.organisation_id=p_organisation_id and pack.id=(item->>'id')::uuid),'[]'::jsonb));
  return v_manifest;
end $$;
revoke all on function public.ftf_build_mission_report_evidence_manifest_before_explicit_lineage(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.ftf_build_mission_report_evidence_manifest(uuid,uuid) from public,anon,authenticated,service_role;
