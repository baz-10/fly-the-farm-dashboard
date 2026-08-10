-- Forward-only upgrade: allow a provider link to be resent without waiting for
-- Spray Command's independent invitation acceptance window to elapse.

alter function public.ftf_issue_commercial_invitation(uuid,uuid,integer,text,text,timestamptz)
  rename to ftf_issue_commercial_invitation_before_immediate_resend;
revoke all on function public.ftf_issue_commercial_invitation_before_immediate_resend(uuid,uuid,integer,text,text,timestamptz)
  from public,anon,authenticated,service_role;

create function public.ftf_issue_commercial_invitation(
  p_application_id uuid,
  p_platform_user_id uuid,
  p_expected_application_version integer,
  p_token text,
  p_notes text,
  p_expires_at timestamptz,
  p_replace_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_application public.commercial_onboarding_applications%rowtype;
  v_invitation public.commercial_onboarding_invitations%rowtype;
  v_actor_auth_user_id uuid;
  v_from_status text;
begin
  if not coalesce(p_replace_active,false) then
    return public.ftf_issue_commercial_invitation_before_immediate_resend(
      p_application_id,p_platform_user_id,p_expected_application_version,
      p_token,p_notes,p_expires_at
    );
  end if;
  if not public.ftf_platform_onboarding_permission(
    p_platform_user_id,'platform.onboarding.invitation.issue'
  ) then
    return jsonb_build_object('issued',false,'code','INVITATION_ISSUE_FORBIDDEN');
  end if;
  if length(coalesce(p_token,''))<32
    or p_expires_at is null or p_expires_at<=now()
    or length(coalesce(p_notes,''))>4000
  then
    return jsonb_build_object('issued',false,'code','INVITATION_INVALID');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_application_id::text,0));
  select * into v_application
  from public.commercial_onboarding_applications
  where id=p_application_id for update;
  if not found then return jsonb_build_object('not_found',true); end if;
  if v_application.row_version<>p_expected_application_version then
    return jsonb_build_object('conflict',true,'current_version',v_application.row_version);
  end if;
  if v_application.status<>'APPROVED'
    or v_application.approved_organisation_snapshot is null
    or v_application.approved_base_snapshot is null
  then
    return jsonb_build_object('issued',false,'code','approved_application_required');
  end if;
  if exists(select 1 from public.commercial_onboarding_invitations
    where application_id=p_application_id and status='ACCEPTED') then
    return jsonb_build_object('issued',false,'code','APPLICATION_ALREADY_ACCEPTED');
  end if;

  select auth_user_id into v_actor_auth_user_id
  from public.platform_users where id=p_platform_user_id;
  for v_invitation in
    select * from public.commercial_onboarding_invitations
    where application_id=p_application_id and status in ('PENDING','SENT')
    order by created_at,id for update
  loop
    v_from_status:=v_invitation.status;
    update public.commercial_onboarding_invitations set
      status='REVOKED',revoked_at=now(),revoked_by_platform_user_id=p_platform_user_id,
      revocation_reason='REPLACED_BY_RESEND'
    where id=v_invitation.id returning * into v_invitation;
    insert into public.commercial_onboarding_invitation_events(
      invitation_id,application_id,event_type,from_status,to_status,
      actor_platform_user_id,event_payload
    ) values(
      v_invitation.id,v_invitation.application_id,'INVITATION_REPLACED',
      v_from_status,'REVOKED',p_platform_user_id,
      jsonb_build_object('reason','REPLACED_BY_RESEND')
    );
    insert into public.platform_audit_events(
      actor_auth_user_id,event_type,entity_type,entity_id,event_payload
    ) values(
      v_actor_auth_user_id,'commercial_onboarding.invitation_replaced',
      'commercial_onboarding_invitation',v_invitation.id,
      jsonb_build_object('applicationId',p_application_id,'fromStatus',v_from_status)
    );
    insert into public.platform_transactional_outbox(topic,aggregate_type,aggregate_id,payload)
    values(
      'commercial_onboarding.invitation.replaced','commercial_onboarding_invitation',
      v_invitation.id,jsonb_build_object('invitationId',v_invitation.id,
        'applicationId',p_application_id)
    );
  end loop;

  return public.ftf_issue_commercial_invitation_before_immediate_resend(
    p_application_id,p_platform_user_id,p_expected_application_version,
    p_token,p_notes,p_expires_at
  );
end;
$$;

revoke all on function public.ftf_issue_commercial_invitation(uuid,uuid,integer,text,text,timestamptz,boolean)
  from public,anon,authenticated;
grant execute on function public.ftf_issue_commercial_invitation(uuid,uuid,integer,text,text,timestamptz,boolean)
  to service_role;
