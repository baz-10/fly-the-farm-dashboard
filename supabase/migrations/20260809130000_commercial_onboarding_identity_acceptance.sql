-- FIX-ONB-005: accept provider-authenticated onboarding by a non-secret
-- invitation identifier. Password mutation is guarded by the read-only
-- preflight, while final provisioning rechecks every condition transactionally.

create function public.ftf_preflight_commercial_invitation(
  p_invitation_id uuid,
  p_auth_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_invitation public.commercial_onboarding_invitations%rowtype;
  v_auth_email text;
  v_active_count integer;
begin
  if p_invitation_id is null or p_auth_user_id is null then
    return jsonb_build_object('eligible',false,'code','INVITATION_INVALID');
  end if;

  select * into v_invitation
  from public.commercial_onboarding_invitations
  where id=p_invitation_id;
  if not found then
    return jsonb_build_object('eligible',false,'code','INVITATION_INVALID');
  end if;

  select lower(btrim(email)) into v_auth_email
  from auth.users where id=p_auth_user_id;
  if v_auth_email is null then
    return jsonb_build_object('eligible',false,'code','AUTH_IDENTITY_NOT_FOUND');
  end if;

  if v_invitation.status='ACCEPTED' then
    if v_invitation.accepted_by_auth_user_id=p_auth_user_id
      and v_auth_email=v_invitation.intended_administrator_email
    then
      return jsonb_build_object(
        'eligible',true,'already_provisioned',true,
        'invitation_id',v_invitation.id,
        'organisation_id',v_invitation.resulting_organisation_id,
        'organisation_reference',v_invitation.resulting_organisation_reference,
        'internal_user_id',v_invitation.resulting_internal_user_id,
        'membership_id',v_invitation.resulting_membership_id,
        'operating_location_id',v_invitation.resulting_operating_location_id
      );
    end if;
    return jsonb_build_object('eligible',false,'code','INVITATION_ALREADY_ACCEPTED');
  end if;

  if v_auth_email<>v_invitation.intended_administrator_email then
    return jsonb_build_object('eligible',false,'code','INVITATION_EMAIL_MISMATCH');
  end if;
  if exists(select 1 from public.platform_users where auth_user_id=p_auth_user_id) then
    return jsonb_build_object('eligible',false,'code','PLATFORM_IDENTITY_FORBIDDEN');
  end if;
  if exists(select 1 from public.internal_users where auth_user_id=p_auth_user_id)
    or exists(select 1 from public.ftf_profiles where user_id=p_auth_user_id)
  then
    return jsonb_build_object('eligible',false,'code','ORGANISATION_IDENTITY_CONFLICT');
  end if;
  if v_invitation.status='REVOKED' then
    return jsonb_build_object('eligible',false,'code','INVITATION_REVOKED');
  end if;
  if v_invitation.status='EXPIRED' or v_invitation.expires_at<=now() then
    return jsonb_build_object('eligible',false,'code','INVITATION_EXPIRED');
  end if;
  if v_invitation.status='PENDING' then
    return jsonb_build_object('eligible',false,'code','INVITATION_DELIVERY_PENDING');
  end if;
  if v_invitation.status<>'SENT'
    or v_invitation.delivery_protocol_version<2
    or v_invitation.delivery_status<>'SENT'
    or v_invitation.delivery_provider<>'SUPABASE_AUTH'
  then
    return jsonb_build_object('eligible',false,'code','INVITATION_INVALID_STATE');
  end if;

  select count(*)::integer into v_active_count
  from public.commercial_onboarding_invitations i
  where i.intended_administrator_email=v_auth_email
    and i.status='SENT'
    and i.delivery_protocol_version>=2
    and i.delivery_status='SENT'
    and i.delivery_provider='SUPABASE_AUTH'
    and i.expires_at>now();
  if v_active_count<>1 then
    return jsonb_build_object('eligible',false,'code','INVITATION_AMBIGUOUS');
  end if;

  return jsonb_build_object(
    'eligible',true,'already_provisioned',false,
    'invitation_id',v_invitation.id
  );
end;
$$;

create function public.ftf_accept_commercial_invitation_by_id(
  p_invitation_id uuid,
  p_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_invitation public.commercial_onboarding_invitations%rowtype;
  v_preflight jsonb;
  v_bootstrap jsonb;
  v_organisation_id uuid;
  v_internal_user_id uuid;
  v_membership_id uuid;
  v_operating_location_id uuid;
  v_organisation_reference text;
  v_previous_status text;
begin
  if p_invitation_id is null or p_auth_user_id is null then
    return jsonb_build_object('accepted',false,'code','INVITATION_INVALID');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_invitation_id::text,0));
  select * into v_invitation
  from public.commercial_onboarding_invitations
  where id=p_invitation_id for update;
  if not found then
    return jsonb_build_object('accepted',false,'code','INVITATION_INVALID');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_auth_user_id::text,0));

  if v_invitation.status in ('PENDING','SENT') and v_invitation.expires_at<=now() then
    v_previous_status:=v_invitation.status;
    update public.commercial_onboarding_invitations
    set status='EXPIRED' where id=v_invitation.id
    returning * into v_invitation;
    insert into public.commercial_onboarding_invitation_events(
      invitation_id,application_id,event_type,from_status,to_status,event_payload
    ) values (
      v_invitation.id,v_invitation.application_id,'INVITATION_EXPIRED',
      v_previous_status,'EXPIRED',jsonb_build_object('expiredAt',v_invitation.expires_at)
    );
    insert into public.platform_audit_events(event_type,entity_type,entity_id,event_payload)
    values('commercial_onboarding.invitation_expired','commercial_onboarding_invitation',
      v_invitation.id,jsonb_build_object('expiredAt',v_invitation.expires_at));
    insert into public.platform_transactional_outbox(topic,aggregate_type,aggregate_id,payload)
    values('commercial_onboarding.invitation.expired','commercial_onboarding_invitation',
      v_invitation.id,jsonb_build_object('invitationId',v_invitation.id));
    return jsonb_build_object('accepted',false,'code','INVITATION_EXPIRED');
  end if;

  v_preflight:=public.ftf_preflight_commercial_invitation(p_invitation_id,p_auth_user_id);
  if not coalesce((v_preflight->>'eligible')::boolean,false) then
    return jsonb_build_object('accepted',false,'code',coalesce(v_preflight->>'code','INVITATION_INVALID'));
  end if;
  if coalesce((v_preflight->>'already_provisioned')::boolean,false) then
    return jsonb_build_object('accepted',true) || (v_preflight-'eligible');
  end if;

  v_bootstrap:=public.ftf_bootstrap_production_beta_organisation(
    p_auth_user_id,
    v_invitation.approved_organisation_snapshot->>'name',
    v_invitation.approved_organisation_snapshot->>'approvedAdministratorName',
    v_invitation.approved_base_snapshot->>'name',
    v_invitation.approved_base_snapshot->>'address',
    v_invitation.approved_base_snapshot->>'timezone'
  );
  v_organisation_id:=(v_bootstrap->>'organisation_id')::uuid;
  v_internal_user_id:=(v_bootstrap->>'internal_user_id')::uuid;
  v_membership_id:=(v_bootstrap->>'membership_id')::uuid;
  v_operating_location_id:=(v_bootstrap->>'operating_location_id')::uuid;
  if v_organisation_id is null or v_internal_user_id is null
    or v_membership_id is null or v_operating_location_id is null
    or coalesce((v_bootstrap->>'already_provisioned')::boolean,true)
  then
    raise exception 'COMMERCIAL_ONBOARDING_PROVISIONING_FAILED' using errcode='55000';
  end if;

  update public.roles
  set name='Organisation Administrator'
  where organisation_id=v_organisation_id and code='admin' and archived_at is null;
  select reference_prefix into v_organisation_reference
  from public.organisations where id=v_organisation_id;

  v_previous_status:=v_invitation.status;
  update public.commercial_onboarding_invitations set
    status='ACCEPTED',accepted_at=now(),accepted_by_auth_user_id=p_auth_user_id,
    resulting_organisation_id=v_organisation_id,
    resulting_organisation_reference=v_organisation_reference,
    resulting_internal_user_id=v_internal_user_id,
    resulting_membership_id=v_membership_id,
    resulting_operating_location_id=v_operating_location_id
  where id=v_invitation.id
  returning * into v_invitation;

  insert into public.commercial_onboarding_invitation_events(
    invitation_id,application_id,event_type,from_status,to_status,
    actor_auth_user_id,event_payload
  ) values (
    v_invitation.id,v_invitation.application_id,'INVITATION_ACCEPTED',
    v_previous_status,'ACCEPTED',p_auth_user_id,jsonb_build_object(
      'organisationId',v_organisation_id,
      'organisationReference',v_organisation_reference,
      'internalUserId',v_internal_user_id,
      'membershipId',v_membership_id,
      'operatingLocationId',v_operating_location_id
    )
  );
  insert into public.audit_events(
    organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload
  ) values (
    v_organisation_id,v_internal_user_id,'commercial_onboarding.accepted',
    'commercial_onboarding_invitation',v_invitation.id,
    jsonb_build_object('applicationId',v_invitation.application_id,
      'organisationReference',v_organisation_reference,
      'operatingLocationId',v_operating_location_id)
  );
  insert into public.transactional_outbox(
    organisation_id,topic,aggregate_type,aggregate_id,payload
  ) values (
    v_organisation_id,'commercial_onboarding.accepted','commercial_onboarding_invitation',
    v_invitation.id,jsonb_build_object('invitationId',v_invitation.id,
      'applicationId',v_invitation.application_id,'organisationId',v_organisation_id,
      'internalUserId',v_internal_user_id)
  );
  insert into public.platform_audit_events(event_type,entity_type,entity_id,event_payload)
  values('commercial_onboarding.invitation_accepted','commercial_onboarding_invitation',
    v_invitation.id,jsonb_build_object('organisationId',v_organisation_id,
      'organisationReference',v_organisation_reference));
  insert into public.platform_transactional_outbox(topic,aggregate_type,aggregate_id,payload)
  values('commercial_onboarding.invitation.accepted','commercial_onboarding_invitation',
    v_invitation.id,jsonb_build_object('invitationId',v_invitation.id,
      'organisationId',v_organisation_id));

  return jsonb_build_object(
    'accepted',true,'already_provisioned',false,'invitation_id',v_invitation.id,
    'organisation_id',v_organisation_id,
    'organisation_reference',v_organisation_reference,
    'internal_user_id',v_internal_user_id,'membership_id',v_membership_id,
    'operating_location_id',v_operating_location_id
  );
end;
$$;

revoke all on function public.ftf_preflight_commercial_invitation(uuid,uuid)
  from public,anon,authenticated;
revoke all on function public.ftf_accept_commercial_invitation_by_id(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.ftf_preflight_commercial_invitation(uuid,uuid) to service_role;
grant execute on function public.ftf_accept_commercial_invitation_by_id(uuid,uuid) to service_role;
