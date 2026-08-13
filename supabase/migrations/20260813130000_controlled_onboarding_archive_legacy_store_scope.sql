-- Forward-only correction for the controlled Production acceptance archive.
-- The accepted application runtime owns one exact legacy ftf_store row. This
-- migration binds that row into the controlled evidence before deleting it in
-- the same transaction as the existing archive implementation.

alter function public.ftf_archive_controlled_commercial_onboarding(jsonb)
  rename to ftf_archive_controlled_commercial_onboarding_without_legacy_store;

revoke all on function public.ftf_archive_controlled_commercial_onboarding_without_legacy_store(jsonb)
  from public,anon,authenticated,service_role;

create or replace function public.ftf_project_controlled_onboarding_legacy_store(
  p_organisation_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'collection',store.collection,
        'recordId',store.record_id,
        'updatedAt',store.updated_at,
        'payloadDigest',encode(sha256(convert_to(store.payload::text,'UTF8')),'hex')
      ) order by store.collection,store.record_id
    ),
    '[]'::jsonb
  )
  from public.ftf_store store
  where store.tenant_id=p_organisation_id;
$$;

revoke all on function public.ftf_project_controlled_onboarding_legacy_store(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.ftf_project_controlled_onboarding_legacy_store(uuid)
  to service_role;

create or replace function public.ftf_archive_controlled_commercial_onboarding(
  p_evidence jsonb
)
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
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_EVIDENCE_INVALID: legacyStore'
      using errcode='22023';
  end if;

  v_expected:=(p_evidence->'legacyStore')->0;
  if jsonb_typeof(v_expected)<>'object'
    or (select count(*) from jsonb_object_keys(v_expected))<>4
    or not (v_expected ?& array['collection','recordId','updatedAt','payloadDigest'])
  then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_EVIDENCE_INVALID: legacyStore row'
      using errcode='22023';
  end if;

  begin
    v_organisation_id:=(p_evidence->>'organisationId')::uuid;
    v_collection:=v_expected->>'collection';
    v_record_id:=v_expected->>'recordId';
    v_updated_at:=(v_expected->>'updatedAt')::timestamptz;
    v_payload_digest:=lower(v_expected->>'payloadDigest');
  exception when others then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_EVIDENCE_INVALID: legacyStore values'
      using errcode='22023';
  end;

  if v_organisation_id is null
    or v_collection is distinct from 'ftf_work_packs'
    or v_record_id is distinct from '__value__'
    or v_updated_at is null
    or v_payload_digest !~ '^[0-9a-f]{64}$'
  then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_LEGACY_STORE_MISMATCH'
      using errcode='55000';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_organisation_id::text)::bigint);
  perform 1 from public.ftf_store store
    where store.tenant_id=v_organisation_id
    for update;

  select
    count(*)::integer,
    count(*) filter(
      where store.collection=v_collection
        and store.record_id=v_record_id
        and store.updated_at=v_updated_at
        and encode(sha256(convert_to(store.payload::text,'UTF8')),'hex')=v_payload_digest
    )::integer
  into v_actual_count,v_matching_count
  from public.ftf_store store
  where store.tenant_id=v_organisation_id;

  if v_actual_count<>1 or v_matching_count<>1 then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_LEGACY_STORE_MISMATCH'
      using errcode='55000';
  end if;

  delete from public.ftf_store store
  where store.tenant_id=v_organisation_id
    and store.collection=v_collection
    and store.record_id=v_record_id
    and store.updated_at=v_updated_at
    and encode(sha256(convert_to(store.payload::text,'UTF8')),'hex')=v_payload_digest;
  get diagnostics v_deleted_count=row_count;
  if v_deleted_count<>1 then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_LEGACY_STORE_MISMATCH'
      using errcode='55000';
  end if;

  v_result:=public.ftf_archive_controlled_commercial_onboarding_without_legacy_store(p_evidence);
  return jsonb_set(v_result,'{archivedCounts,legacy_store}',to_jsonb(v_deleted_count),true);
end;
$$;

revoke all on function public.ftf_archive_controlled_commercial_onboarding(jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.ftf_archive_controlled_commercial_onboarding(jsonb)
  to service_role;
