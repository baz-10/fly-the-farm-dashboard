-- Reconcile the live authority installed by 20260813130000 without rewriting
-- historical migration evidence. PostgreSQL truncated the 65-byte helper name
-- to the deliberate 63-byte identity used below.

revoke all on function public.ftf_archive_controlled_commercial_onboarding_without_legacy_sto(jsonb)
  from public,anon,authenticated,service_role;

create or replace function public.ftf_project_controlled_onboarding_legacy_store(p_evidence jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_application_id uuid;
  v_invitation_id uuid;
  v_organisation_id uuid;
  v_application_reference text;
  v_count integer;
  v_result jsonb;
begin
  if jsonb_typeof(p_evidence)<>'object' then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_EVIDENCE_INVALID: legacyStore projection' using errcode='22023';
  end if;
  begin
    v_application_id:=(p_evidence->>'applicationId')::uuid;
    v_invitation_id:=(p_evidence->>'invitationId')::uuid;
    v_organisation_id:=(p_evidence->>'organisationId')::uuid;
  exception when others then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_EVIDENCE_INVALID: legacyStore projection' using errcode='22023';
  end;
  v_application_reference:=p_evidence->>'applicationReference';
  if v_application_id is null or v_invitation_id is null or v_organisation_id is null
    or nullif(btrim(v_application_reference),'') is null
    or not exists(
      select 1
      from public.commercial_onboarding_applications application
      join public.commercial_onboarding_invitations invitation on invitation.application_id=application.id
      where application.id=v_application_id
        and application.application_reference=v_application_reference
        and application.application_reference like 'SC-APP-%'
        and application.business_name like 'SC ACCEPTANCE — %'
        and application.status='APPROVED'
        and invitation.id=v_invitation_id
        and invitation.status='ACCEPTED'
        and invitation.resulting_organisation_id=v_organisation_id
    )
  then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_PROVENANCE_MISMATCH: legacyStore projection' using errcode='55000';
  end if;

  select count(*)::integer,
    coalesce(jsonb_agg(jsonb_build_object(
      'collection',store.collection,
      'recordId',store.record_id,
      'updatedAt',store.updated_at,
      'payloadDigest',encode(sha256(convert_to(store.payload::text,'UTF8')),'hex')
    ) order by store.collection,store.record_id),'[]'::jsonb)
  into v_count,v_result
  from public.ftf_store store
  where store.tenant_id=v_organisation_id
    and store.collection='ftf_work_packs'
    and store.record_id='__value__';

  if v_count<>1 or (select count(*) from public.ftf_store where tenant_id=v_organisation_id)<>1 then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_LEGACY_STORE_MISMATCH' using errcode='55000';
  end if;
  return v_result;
end;
$$;

revoke all on function public.ftf_project_controlled_onboarding_legacy_store(jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.ftf_project_controlled_onboarding_legacy_store(jsonb) to service_role;

-- The service-role REST runtime continues to require CRUD. Remove only the
-- unintended owner-like privileges observed in Production.
revoke truncate,references,trigger on table public.ftf_store from service_role;
grant select,insert,update,delete on table public.ftf_store to service_role;

create or replace function public.ftf_archive_controlled_commercial_onboarding(p_evidence jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_organisation_id uuid;
  v_expected jsonb;
  v_collection text;
  v_record_id text;
  v_payload_digest text;
  v_updated_at timestamptz;
  v_actual_count integer;
  v_matching_count integer;
  v_deleted_count integer;
  v_result jsonb;
begin
  if jsonb_typeof(p_evidence)<>'object'
    or jsonb_typeof(coalesce(p_evidence->'legacyStore','null'::jsonb))<>'array'
    or jsonb_array_length(p_evidence->'legacyStore')<>1
  then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_EVIDENCE_INVALID: legacyStore' using errcode='22023';
  end if;
  v_expected:=(p_evidence->'legacyStore')->0;
  if jsonb_typeof(v_expected)<>'object'
    or (select count(*) from jsonb_object_keys(v_expected))<>4
    or not (v_expected ?& array['collection','recordId','updatedAt','payloadDigest'])
  then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_EVIDENCE_INVALID: legacyStore row' using errcode='22023';
  end if;
  begin
    v_organisation_id:=(p_evidence->>'organisationId')::uuid;
    v_collection:=v_expected->>'collection';
    v_record_id:=v_expected->>'recordId';
    v_updated_at:=(v_expected->>'updatedAt')::timestamptz;
    v_payload_digest:=lower(v_expected->>'payloadDigest');
  exception when others then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_EVIDENCE_INVALID: legacyStore values' using errcode='22023';
  end;
  if v_organisation_id is null or v_collection is distinct from 'ftf_work_packs'
    or v_record_id is distinct from '__value__' or v_updated_at is null
    or v_payload_digest !~ '^[0-9a-f]{64}$'
  then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_LEGACY_STORE_MISMATCH' using errcode='55000';
  end if;
  perform pg_advisory_xact_lock(hashtext(v_organisation_id::text)::bigint);
  perform 1 from public.ftf_store store where store.tenant_id=v_organisation_id for update;
  select count(*)::integer,count(*) filter(where store.collection=v_collection
    and store.record_id=v_record_id and store.updated_at=v_updated_at
    and encode(sha256(convert_to(store.payload::text,'UTF8')),'hex')=v_payload_digest)::integer
  into v_actual_count,v_matching_count from public.ftf_store store where store.tenant_id=v_organisation_id;
  if v_actual_count<>1 or v_matching_count<>1 then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_LEGACY_STORE_MISMATCH' using errcode='55000';
  end if;
  delete from public.ftf_store store where store.tenant_id=v_organisation_id
    and store.collection=v_collection and store.record_id=v_record_id and store.updated_at=v_updated_at
    and encode(sha256(convert_to(store.payload::text,'UTF8')),'hex')=v_payload_digest;
  get diagnostics v_deleted_count=row_count;
  if v_deleted_count<>1 then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_LEGACY_STORE_MISMATCH' using errcode='55000';
  end if;
  v_result:=public.ftf_archive_controlled_commercial_onboarding_without_legacy_sto(p_evidence);
  return jsonb_set(v_result,'{archivedCounts,legacy_store}',to_jsonb(v_deleted_count),true);
end;
$$;

revoke all on function public.ftf_archive_controlled_commercial_onboarding(jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.ftf_archive_controlled_commercial_onboarding(jsonb) to service_role;
