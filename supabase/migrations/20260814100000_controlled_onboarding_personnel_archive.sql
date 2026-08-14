-- Extend only the controlled-acceptance archive boundary for one integrity-bound
-- Personnel topology. The historical zero-Personnel contract remains the default.

do $$
declare
  v_oid oid:=to_regprocedure('public.ftf_archive_controlled_commercial_onboarding_without_legacy_sto(jsonb)');
  v_source text;
  v_old constant text:='or exists(select 1 from public.personnel where organisation_id=v_organisation_id)';
  v_new constant text:='or exists(select 1 from public.personnel where organisation_id=v_organisation_id and archived_at is null)';
begin
  if v_oid is null then raise exception 'CONTROLLED_PERSONNEL_ARCHIVE_BASELINE_MISMATCH' using errcode='55000'; end if;
  select prosrc into v_source from pg_proc where oid=v_oid;
  if strpos(v_source,v_old)=0 or strpos(replace(v_source,v_old,''),v_old)>0 then
    raise exception 'CONTROLLED_PERSONNEL_ARCHIVE_BASELINE_MISMATCH' using errcode='55000';
  end if;
  v_source:=replace(v_source,v_old,v_new);
  execute format($definition$
    create or replace function public.ftf_archive_controlled_commercial_onboarding_without_legacy_sto(p_evidence jsonb)
    returns jsonb language plpgsql security definer set search_path = public, pg_temp as %L
  $definition$,v_source);
end;
$$;

alter function public.ftf_archive_controlled_commercial_onboarding(jsonb)
  rename to ftf_archive_controlled_onboarding_without_personnel;
revoke all on function public.ftf_archive_controlled_onboarding_without_personnel(jsonb)
  from public,anon,authenticated,service_role;

create function public.ftf_archive_controlled_commercial_onboarding(p_evidence jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_organisation_id uuid;
  v_internal_user_id uuid;
  v_personnel_evidence jsonb;
  v_person public.personnel%rowtype;
  v_personnel_id uuid;
  v_row_version integer;
  v_created_at timestamptz;
  v_base_links jsonb;
  v_role_links jsonb;
  v_count integer;
  v_deleted integer;
  v_archive jsonb;
  v_result jsonb;
begin
  if jsonb_typeof(p_evidence)<>'object' then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_EVIDENCE_INVALID: personnel' using errcode='22023';
  end if;
  begin
    v_organisation_id:=(p_evidence->>'organisationId')::uuid;
    v_internal_user_id:=(p_evidence->>'internalUserId')::uuid;
  exception when others then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_EVIDENCE_INVALID: personnel values' using errcode='22023';
  end;
  if v_organisation_id is null or v_internal_user_id is null then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_EVIDENCE_INVALID: personnel values' using errcode='22023';
  end if;

  v_personnel_evidence:=p_evidence->'personnel';
  if v_personnel_evidence is null or jsonb_typeof(v_personnel_evidence)='null' then
    if exists(select 1 from public.personnel where organisation_id=v_organisation_id) then
      raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_PERSONNEL_MISMATCH' using errcode='55000';
    end if;
    return public.ftf_archive_controlled_onboarding_without_personnel(p_evidence);
  end if;

  perform pg_advisory_xact_lock(hashtext(v_organisation_id::text)::bigint);
  perform public.ftf_lock_active_organisation(v_organisation_id);
  perform 1 from public.personnel where organisation_id=v_organisation_id for update;

  if jsonb_typeof(v_personnel_evidence)<>'object'
    or (select count(*) from jsonb_object_keys(v_personnel_evidence))<>9
    or not (v_personnel_evidence ?& array[
      'personnelId','rowVersion','createdAt','createdByInternalUserId','updatedByInternalUserId',
      'engagementStatus','baseLinks','roleLinks','creationAuditId'
    ])
    or jsonb_typeof(v_personnel_evidence->'baseLinks')<>'array'
    or jsonb_typeof(v_personnel_evidence->'roleLinks')<>'array'
    or jsonb_array_length(v_personnel_evidence->'baseLinks')<>1
    or jsonb_array_length(v_personnel_evidence->'roleLinks')<>7
  then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_EVIDENCE_INVALID: personnel topology' using errcode='22023';
  end if;
  begin
    v_personnel_id:=(v_personnel_evidence->>'personnelId')::uuid;
    v_row_version:=(v_personnel_evidence->>'rowVersion')::integer;
    v_created_at:=(v_personnel_evidence->>'createdAt')::timestamptz;
  exception when others then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_EVIDENCE_INVALID: personnel identity' using errcode='22023';
  end;
  v_base_links:=v_personnel_evidence->'baseLinks';
  v_role_links:=v_personnel_evidence->'roleLinks';

  select * into v_person from public.personnel
  where organisation_id=v_organisation_id and id=v_personnel_id
    and archived_at is null and is_active
    and internal_user_id is null and membership_id is null
    and engagement_status='employee'
    and full_name like 'SC ACCEPTANCE — %'
    and row_version=v_row_version and created_at=v_created_at
    and created_by_internal_user_id=v_internal_user_id
    and updated_by_internal_user_id=v_internal_user_id
    and (v_personnel_evidence->>'createdByInternalUserId')::uuid=v_internal_user_id
    and (v_personnel_evidence->>'updatedByInternalUserId')::uuid=v_internal_user_id
    and v_personnel_evidence->>'engagementStatus'='employee';
  if not found or (select count(*) from public.personnel where organisation_id=v_organisation_id)<>1 then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_PERSONNEL_MISMATCH' using errcode='55000';
  end if;
  if not exists(select 1 from public.organisations where id=v_organisation_id and created_at<=v_person.created_at)
    or (select count(*) from public.personnel_credentials where organisation_id=v_organisation_id and personnel_id=v_personnel_id)<>0
    or (select count(*) from public.personnel_evidence where organisation_id=v_organisation_id and personnel_id=v_personnel_id)<>0
    or (select count(*) from public.mission_personnel_assignments where organisation_id=v_organisation_id and personnel_id=v_personnel_id)<>0
  then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_PERSONNEL_MISMATCH' using errcode='55000';
  end if;

  select count(*) into v_count from public.personnel_operating_locations link
  where link.organisation_id=v_organisation_id and link.personnel_id=v_personnel_id
    and exists(select 1 from jsonb_array_elements(v_base_links) expected
      where (expected->>'id')::uuid=link.id
        and (expected->>'operatingLocationId')::uuid=link.operating_location_id)
    and link.operating_location_id=(p_evidence->>'operatingLocationId')::uuid
    and link.created_by_internal_user_id=v_internal_user_id;
  if v_count<>1 or (select count(*) from public.personnel_operating_locations where organisation_id=v_organisation_id and personnel_id=v_personnel_id)<>1 then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_PERSONNEL_MISMATCH' using errcode='55000';
  end if;

  select count(*) into v_count from public.personnel_operational_roles link
  where link.organisation_id=v_organisation_id and link.personnel_id=v_personnel_id
    and exists(select 1 from jsonb_array_elements(v_role_links) expected
      where (expected->>'id')::uuid=link.id and expected->>'roleCode'=link.role_code)
    and link.created_by_internal_user_id=v_internal_user_id;
  if v_count<>7 or (select count(*) from public.personnel_operational_roles where organisation_id=v_organisation_id and personnel_id=v_personnel_id)<>7
    or (select array_agg(role_code order by role_code) from public.personnel_operational_roles
      where organisation_id=v_organisation_id and personnel_id=v_personnel_id)
      is distinct from array['chemical_operator','ground_crew','loader','observer','pilot','pilot_in_command','supervisor']::text[]
    or (select array_agg(value->>'roleCode' order by value->>'roleCode') from jsonb_array_elements(v_role_links) value)
      is distinct from array['chemical_operator','ground_crew','loader','observer','pilot','pilot_in_command','supervisor']::text[]
  then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_PERSONNEL_MISMATCH' using errcode='55000';
  end if;

  if (select count(*) from public.audit_events audit
      where audit.organisation_id=v_organisation_id and audit.id=(v_personnel_evidence->>'creationAuditId')::uuid
        and audit.actor_internal_user_id=v_internal_user_id and audit.event_type='personnel.create'
        and audit.entity_type='personnel' and audit.entity_id=v_personnel_id
        and audit.created_at>=v_person.created_at)<>1
  then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_PERSONNEL_MISMATCH' using errcode='55000';
  end if;

  delete from public.personnel_operational_roles link
  where link.organisation_id=v_organisation_id and link.personnel_id=v_personnel_id
    and exists(select 1 from jsonb_array_elements(v_role_links) expected where (expected->>'id')::uuid=link.id);
  get diagnostics v_deleted=row_count;
  if v_deleted<>7 then raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_PERSONNEL_MISMATCH' using errcode='55000'; end if;
  delete from public.personnel_operating_locations link
  where link.organisation_id=v_organisation_id and link.personnel_id=v_personnel_id
    and exists(select 1 from jsonb_array_elements(v_base_links) expected where (expected->>'id')::uuid=link.id);
  get diagnostics v_deleted=row_count;
  if v_deleted<>1 then raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_PERSONNEL_MISMATCH' using errcode='55000'; end if;

  v_archive:=public.ftf_write_personnel(v_organisation_id,v_internal_user_id,'archive',v_personnel_id,v_row_version,'{}'::jsonb);
  if v_archive->'record' is null or (v_archive->'record'->>'archived_at') is null
    or (v_archive->'record'->>'is_active')::boolean
  then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_PERSONNEL_MISMATCH' using errcode='55000';
  end if;
  if (select count(*) from public.audit_events audit
      where audit.organisation_id=v_organisation_id and audit.entity_type='personnel'
        and audit.entity_id=v_personnel_id and audit.event_type='personnel.archive')<>1
    or (select count(*) from public.transactional_outbox outbox
      where outbox.organisation_id=v_organisation_id and outbox.aggregate_type='personnel'
        and outbox.aggregate_id=v_personnel_id and outbox.topic='operational.personnel.archive')<>1
  then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_PERSONNEL_MISMATCH' using errcode='55000';
  end if;
  v_result:=public.ftf_archive_controlled_onboarding_without_personnel(p_evidence-'personnel');
  return jsonb_set(v_result,'{archivedCounts,personnel}',to_jsonb(1),true)
    ||jsonb_build_object('personnelId',v_personnel_id,'personnelArchiveEvidence',
      jsonb_build_object('auditCount',1,'outboxCount',1));
end;
$$;

revoke all on function public.ftf_archive_controlled_commercial_onboarding(jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.ftf_archive_controlled_commercial_onboarding(jsonb) to service_role;
