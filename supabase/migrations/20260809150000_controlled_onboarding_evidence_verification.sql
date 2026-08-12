-- Purpose-built, read-only evidence projection for controlled commercial-onboarding acceptance.
-- This function deliberately exposes neither outbox payloads nor an enumeration surface.
create or replace function public.ftf_verify_controlled_commercial_onboarding_evidence(
  p_evidence jsonb
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_application_id uuid;
  v_invitation_id uuid;
  v_organisation_id uuid;
  v_application_reference text;
  v_records jsonb;
  v_expected jsonb;
  v_result jsonb := '{}'::jsonb;
  v_definition jsonb;
  v_resource text;
  v_topic text;
  v_id uuid;
  v_count integer;
begin
  if jsonb_typeof(p_evidence) <> 'object'
    or jsonb_typeof(coalesce(p_evidence->'records','null'::jsonb)) <> 'object'
  then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_EVIDENCE_INVALID'
      using errcode='22023';
  end if;

  begin
    v_application_id := (p_evidence->>'applicationId')::uuid;
    v_invitation_id := (p_evidence->>'invitationId')::uuid;
    v_organisation_id := (p_evidence->>'organisationId')::uuid;
  exception when others then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_EVIDENCE_INVALID'
      using errcode='22023';
  end;
  v_application_reference := p_evidence->>'applicationReference';
  v_records := p_evidence->'records';
  if v_application_id is null or v_invitation_id is null or v_organisation_id is null
    or nullif(btrim(v_application_reference),'') is null
  then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_EVIDENCE_INVALID'
      using errcode='22023';
  end if;

  if not exists(
    select 1
    from public.commercial_onboarding_applications application
    join public.commercial_onboarding_invitations invitation
      on invitation.application_id=application.id
    where application.id=v_application_id
      and application.application_reference=v_application_reference
      and application.application_reference like 'SC-APP-%'
      and application.business_name like 'SC ACCEPTANCE — %'
      and application.status='APPROVED'
      and invitation.id=v_invitation_id
      and invitation.status='ACCEPTED'
      and invitation.resulting_organisation_id=v_organisation_id
  ) then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_PROVENANCE_MISMATCH'
      using errcode='42501';
  end if;

  v_expected := jsonb_build_array(
    jsonb_build_object('resource','clients','topic','operational.clients.create'),
    jsonb_build_object('resource','properties','topic','operational.properties.create'),
    jsonb_build_object('resource','fields','topic','operational.fields.create'),
    jsonb_build_object('resource','jobs','topic','operational.jobs.create'),
    jsonb_build_object('resource','missions','topic','operational.missions.create')
  );

  for v_definition in select value from jsonb_array_elements(v_expected)
  loop
    v_resource := v_definition->>'resource';
    v_topic := v_definition->>'topic';
    if jsonb_typeof(coalesce(v_records->v_resource,'null'::jsonb)) <> 'array'
      or jsonb_array_length(v_records->v_resource) <> 1
    then
      raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_EVIDENCE_INVALID: %',v_resource
        using errcode='22023';
    end if;
    begin
      v_id := ((v_records->v_resource->0)->>'id')::uuid;
    exception when others then
      raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_EVIDENCE_INVALID: %',v_resource
        using errcode='22023';
    end;

    execute format(
      'select count(*) from public.%I where id=$1 and organisation_id=$2 and '
      || case v_resource when 'jobs' then 'scope' when 'missions' then 'title' else 'name' end
      || ' like ''SC ACCEPTANCE — %%''',v_resource
    ) into v_count using v_id,v_organisation_id;
    if v_count <> 1 then
      raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_PROVENANCE_MISMATCH: %',v_resource
        using errcode='42501';
    end if;

    select count(*) into v_count
    from public.transactional_outbox outbox
    where outbox.organisation_id=v_organisation_id
      and outbox.topic=v_topic
      and outbox.aggregate_type=v_resource
      and outbox.aggregate_id=v_id;
    if v_count <> 1 then
      raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_OUTBOX_MISMATCH: %',v_resource
        using errcode='55000';
    end if;
    v_result := v_result || jsonb_build_object(v_resource,jsonb_build_object('present',true));
  end loop;

  select count(*) into v_count
  from public.transactional_outbox outbox
  where outbox.organisation_id=v_organisation_id
    and outbox.topic='commercial_onboarding.accepted'
    and outbox.aggregate_type='commercial_onboarding_invitation'
    and outbox.aggregate_id=v_invitation_id;
  if v_count <> 1 then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_OUTBOX_MISMATCH: acceptance'
      using errcode='55000';
  end if;
  v_result := jsonb_build_object('acceptance',jsonb_build_object('present',true),'resources',v_result);

  select count(*) into v_count
  from public.transactional_outbox outbox
  where outbox.organisation_id=v_organisation_id
    and outbox.topic='commercial_onboarding.acceptance_archived'
    and outbox.aggregate_type='organisation'
    and outbox.aggregate_id=v_organisation_id;
  return v_result || jsonb_build_object('archive',jsonb_build_object('present',v_count=1));
end;
$$;

revoke all on function public.ftf_verify_controlled_commercial_onboarding_evidence(jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.ftf_verify_controlled_commercial_onboarding_evidence(jsonb)
  to service_role;
