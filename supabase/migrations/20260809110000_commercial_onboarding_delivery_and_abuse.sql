-- Forward-only hardening for commercial onboarding intake and invitation delivery.

create table public.commercial_onboarding_application_location_evidence (
  application_id uuid primary key
    references public.commercial_onboarding_applications(id) on delete restrict,
  location_confirmed_at timestamptz not null,
  address_source text not null check (length(btrim(address_source)) between 1 and 100),
  latitude numeric not null check (latitude between -90 and 90),
  longitude numeric not null check (longitude between -180 and 180),
  created_at timestamptz not null default now()
);

create table public.commercial_onboarding_application_requests (
  id uuid primary key default gen_random_uuid(),
  request_fingerprint_hash text not null check (request_fingerprint_hash ~ '^[0-9a-f]{64}$'),
  normalized_email_hash text not null check (normalized_email_hash ~ '^[0-9a-f]{64}$'),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  application_id uuid not null
    references public.commercial_onboarding_applications(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(request_fingerprint_hash,normalized_email_hash,payload_hash,window_started_at)
);

create index commercial_onboarding_application_requests_fingerprint_window_idx
  on public.commercial_onboarding_application_requests(request_fingerprint_hash,created_at desc);
create index commercial_onboarding_application_requests_email_window_idx
  on public.commercial_onboarding_application_requests(normalized_email_hash,created_at desc);

alter table public.commercial_onboarding_invitations
  add column delivery_status text not null default 'PREPARED'
    check (delivery_status in ('PREPARED','SENT','FAILED')),
  add column delivery_provider text,
  add column delivery_reference text,
  add column delivery_attempted_at timestamptz;

alter table public.commercial_onboarding_application_location_evidence enable row level security;
alter table public.commercial_onboarding_application_location_evidence force row level security;
alter table public.commercial_onboarding_application_requests enable row level security;
alter table public.commercial_onboarding_application_requests force row level security;

revoke all on table
  public.commercial_onboarding_application_location_evidence,
  public.commercial_onboarding_application_requests
from public,anon,authenticated;
grant select on table
  public.commercial_onboarding_application_location_evidence,
  public.commercial_onboarding_application_requests
to service_role;

alter function public.ftf_submit_commercial_application(jsonb)
  rename to ftf_submit_commercial_application_v1;
revoke all on function public.ftf_submit_commercial_application_v1(jsonb)
  from public,anon,authenticated,service_role;

create function public.ftf_submit_commercial_application(p_application jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_result jsonb;
  v_base jsonb:=coalesce(p_application->'base','{}'::jsonb);
  v_confirmed_at timestamptz;
begin
  if length(btrim(coalesce(v_base->>'locationConfirmedAt',''))) not between 10 and 100
    or length(btrim(coalesce(v_base->>'addressSource',''))) not between 1 and 100
  then
    return jsonb_build_object('submitted',false,'code','APPLICATION_INVALID');
  end if;
  begin
    v_confirmed_at:=(v_base->>'locationConfirmedAt')::timestamptz;
  exception when others then
    return jsonb_build_object('submitted',false,'code','APPLICATION_INVALID');
  end;

  v_result:=public.ftf_submit_commercial_application_v1(p_application);
  if coalesce((v_result->>'submitted')::boolean,false) then
    insert into public.commercial_onboarding_application_location_evidence(
      application_id,location_confirmed_at,address_source,latitude,longitude
    ) values (
      (v_result->>'application_id')::uuid,v_confirmed_at,btrim(v_base->>'addressSource'),
      (v_base->>'latitude')::numeric,(v_base->>'longitude')::numeric
    );
  end if;
  return v_result;
end;
$$;

create function public.ftf_submit_commercial_application_guarded(
  p_application jsonb,
  p_request_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_email_hash text;
  v_payload_hash text;
  v_window timestamptz:=date_trunc('hour',now());
  v_existing record;
  v_result jsonb;
begin
  if p_request_fingerprint !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('submitted',false,'code','APPLICATION_INVALID');
  end if;
  v_email_hash:=encode(sha256(convert_to(lower(btrim(coalesce(p_application->>'administratorEmail',''))),'UTF8')),'hex');
  v_payload_hash:=encode(sha256(convert_to(coalesce(p_application,'{}'::jsonb)::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_request_fingerprint,0));
  perform pg_advisory_xact_lock(hashtextextended(v_email_hash,1));

  select a.id,a.application_reference,a.status,a.row_version
  into v_existing
  from public.commercial_onboarding_application_requests r
  join public.commercial_onboarding_applications a on a.id=r.application_id
  where r.request_fingerprint_hash=p_request_fingerprint
    and r.normalized_email_hash=v_email_hash
    and r.payload_hash=v_payload_hash
    and r.created_at>=now()-interval '24 hours'
  order by r.created_at desc
  limit 1;
  if found then
    return jsonb_build_object(
      'submitted',true,'deduplicated',true,'application_id',v_existing.id,
      'application_reference',v_existing.application_reference,
      'status',v_existing.status,'row_version',v_existing.row_version
    );
  end if;

  if (select count(*) from public.commercial_onboarding_application_requests
      where request_fingerprint_hash=p_request_fingerprint
        and created_at>=now()-interval '1 hour')>=5
    or (select count(*) from public.commercial_onboarding_application_requests
      where normalized_email_hash=v_email_hash
        and created_at>=now()-interval '24 hours')>=3
  then
    return jsonb_build_object('submitted',false,'code','APPLICATION_RATE_LIMITED');
  end if;

  v_result:=public.ftf_submit_commercial_application(p_application);
  if coalesce((v_result->>'submitted')::boolean,false) then
    insert into public.commercial_onboarding_application_requests(
      request_fingerprint_hash,normalized_email_hash,payload_hash,window_started_at,application_id
    ) values (
      p_request_fingerprint,v_email_hash,v_payload_hash,v_window,
      (v_result->>'application_id')::uuid
    );
  end if;
  return v_result;
end;
$$;

create or replace function public.ftf_issue_commercial_invitation(
  p_application_id uuid,
  p_platform_user_id uuid,
  p_expected_application_version integer,
  p_token text,
  p_notes text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_application public.commercial_onboarding_applications%rowtype;
  v_invitation public.commercial_onboarding_invitations%rowtype;
  v_expired_invitation public.commercial_onboarding_invitations%rowtype;
  v_expired_from_status text;
  v_token_hash text;
  v_actor_auth_user_id uuid;
begin
  if not public.ftf_platform_onboarding_permission(
    p_platform_user_id,'platform.onboarding.invitation.issue'
  ) then
    return jsonb_build_object('issued',false,'code','INVITATION_ISSUE_FORBIDDEN');
  end if;
  if length(coalesce(p_token,'')) < 32
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

  select auth_user_id into v_actor_auth_user_id
  from public.platform_users where id=p_platform_user_id;
  for v_expired_invitation in
    select * from public.commercial_onboarding_invitations
    where application_id=p_application_id
      and status in ('PENDING','SENT') and expires_at<=now()
    order by created_at,id for update
  loop
    v_expired_from_status:=v_expired_invitation.status;
    update public.commercial_onboarding_invitations
    set status='EXPIRED'
    where id=v_expired_invitation.id
    returning * into v_expired_invitation;
    insert into public.commercial_onboarding_invitation_events(
      invitation_id,application_id,event_type,from_status,to_status,
      actor_platform_user_id,event_payload
    ) values(
      v_expired_invitation.id,v_expired_invitation.application_id,
      'INVITATION_EXPIRED',v_expired_from_status,'EXPIRED',p_platform_user_id,
      jsonb_build_object('expiredAt',v_expired_invitation.expires_at,
        'normalizedDuring','INVITATION_PREPARATION')
    );
    insert into public.platform_audit_events(
      actor_auth_user_id,event_type,entity_type,entity_id,event_payload
    ) values(
      v_actor_auth_user_id,'commercial_onboarding.invitation_expired',
      'commercial_onboarding_invitation',v_expired_invitation.id,
      jsonb_build_object('expiredAt',v_expired_invitation.expires_at,
        'fromStatus',v_expired_from_status)
    );
    insert into public.platform_transactional_outbox(topic,aggregate_type,aggregate_id,payload)
    values('commercial_onboarding.invitation.expired','commercial_onboarding_invitation',
      v_expired_invitation.id,jsonb_build_object('invitationId',v_expired_invitation.id,
        'fromStatus',v_expired_from_status));
  end loop;

  if exists(select 1 from public.commercial_onboarding_invitations
    where application_id=p_application_id and status='ACCEPTED') then
    return jsonb_build_object('issued',false,'code','APPLICATION_ALREADY_ACCEPTED');
  end if;
  if exists(select 1 from public.commercial_onboarding_invitations
    where application_id=p_application_id and status in ('PENDING','SENT')) then
    return jsonb_build_object('issued',false,'code','ACTIVE_INVITATION_EXISTS');
  end if;

  v_token_hash:=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  insert into public.commercial_onboarding_invitations(
    application_id,token_hash,intended_administrator_email,
    approved_organisation_snapshot,approved_base_snapshot,status,
    issued_by_platform_user_id,issuance_notes,expires_at,sent_at,delivery_status
  ) values (
    v_application.id,v_token_hash,v_application.intended_administrator_email,
    v_application.approved_organisation_snapshot,v_application.approved_base_snapshot,
    'PENDING',p_platform_user_id,nullif(btrim(p_notes),''),p_expires_at,null,'PREPARED'
  ) returning * into v_invitation;

  insert into public.commercial_onboarding_invitation_events(
    invitation_id,application_id,event_type,to_status,actor_platform_user_id,event_payload
  ) values (
    v_invitation.id,v_application.id,'INVITATION_PREPARED','PENDING',p_platform_user_id,
    jsonb_build_object('expiresAt',v_invitation.expires_at)
  );
  insert into public.platform_audit_events(
    actor_auth_user_id,event_type,entity_type,entity_id,event_payload
  ) values (
    v_actor_auth_user_id,'commercial_onboarding.invitation_prepared',
    'commercial_onboarding_invitation',v_invitation.id,
    jsonb_build_object('applicationId',v_application.id,'expiresAt',v_invitation.expires_at)
  );
  insert into public.platform_transactional_outbox(topic,aggregate_type,aggregate_id,payload)
  values('commercial_onboarding.invitation.prepared','commercial_onboarding_invitation',
    v_invitation.id,jsonb_build_object('invitationId',v_invitation.id,
      'applicationId',v_application.id,'expiresAt',v_invitation.expires_at));

  return jsonb_build_object(
    'issued',true,'invitation_id',v_invitation.id,'application_id',v_application.id,
    'status',v_invitation.status,'row_version',v_invitation.row_version,
    'expires_at',v_invitation.expires_at,
    'intended_administrator_email',v_invitation.intended_administrator_email
  );
end;
$$;

create function public.ftf_mark_commercial_invitation_delivery(
  p_invitation_id uuid,
  p_platform_user_id uuid,
  p_expected_version integer,
  p_outcome text,
  p_provider_reference text,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_invitation public.commercial_onboarding_invitations%rowtype;
  v_outcome text:=upper(btrim(coalesce(p_outcome,'')));
  v_actor_auth_user_id uuid;
  v_event_type text;
begin
  if not public.ftf_platform_onboarding_permission(
    p_platform_user_id,'platform.onboarding.invitation.issue'
  ) then
    return jsonb_build_object('delivered',false,'code','INVITATION_ISSUE_FORBIDDEN');
  end if;
  if v_outcome not in ('SENT','FAILED')
    or length(coalesce(p_provider_reference,''))>500
    or length(coalesce(p_notes,''))>2000
  then
    return jsonb_build_object('delivered',false,'code','INVITATION_DELIVERY_INVALID');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_invitation_id::text,0));
  select * into v_invitation from public.commercial_onboarding_invitations
  where id=p_invitation_id for update;
  if not found then return jsonb_build_object('not_found',true); end if;
  if v_invitation.row_version<>p_expected_version then
    return jsonb_build_object('conflict',true,'current_version',v_invitation.row_version);
  end if;
  if v_invitation.status<>'PENDING' then
    return jsonb_build_object('conflict',true,'current_version',v_invitation.row_version,
      'current_status',v_invitation.status);
  end if;

  if v_outcome='SENT' then
    update public.commercial_onboarding_invitations set
      status='SENT',sent_at=now(),delivery_status='SENT',delivery_provider='SUPABASE_AUTH',
      delivery_reference=nullif(btrim(p_provider_reference),''),delivery_attempted_at=now()
    where id=p_invitation_id returning * into v_invitation;
    v_event_type:='INVITATION_DELIVERED';
  else
    update public.commercial_onboarding_invitations set
      status='REVOKED',revoked_at=now(),revoked_by_platform_user_id=p_platform_user_id,
      revocation_reason=coalesce(nullif(btrim(p_notes),''),'Invitation delivery failed.'),
      delivery_status='FAILED',delivery_provider='SUPABASE_AUTH',
      delivery_reference=nullif(btrim(p_provider_reference),''),delivery_attempted_at=now()
    where id=p_invitation_id returning * into v_invitation;
    v_event_type:='INVITATION_DELIVERY_FAILED';
  end if;

  insert into public.commercial_onboarding_invitation_events(
    invitation_id,application_id,event_type,from_status,to_status,
    actor_platform_user_id,event_payload
  ) values (
    v_invitation.id,v_invitation.application_id,v_event_type,'PENDING',v_invitation.status,
    p_platform_user_id,jsonb_build_object('provider','SUPABASE_AUTH',
      'providerReference',v_invitation.delivery_reference,'notes',nullif(btrim(p_notes),''))
  );
  select auth_user_id into v_actor_auth_user_id from public.platform_users
  where id=p_platform_user_id;
  insert into public.platform_audit_events(
    actor_auth_user_id,event_type,entity_type,entity_id,event_payload
  ) values (
    v_actor_auth_user_id,
    case when v_outcome='SENT' then 'commercial_onboarding.invitation_delivered'
      else 'commercial_onboarding.invitation_delivery_failed' end,
    'commercial_onboarding_invitation',v_invitation.id,
    jsonb_build_object('status',v_invitation.status,'provider','SUPABASE_AUTH')
  );
  insert into public.platform_transactional_outbox(topic,aggregate_type,aggregate_id,payload)
  values(
    case when v_outcome='SENT' then 'commercial_onboarding.invitation.delivered'
      else 'commercial_onboarding.invitation.delivery_failed' end,
    'commercial_onboarding_invitation',v_invitation.id,
    jsonb_build_object('invitationId',v_invitation.id,'status',v_invitation.status)
  );
  return jsonb_build_object(
    'delivered',v_outcome='SENT','failed',v_outcome='FAILED',
    'invitation_id',v_invitation.id,'status',v_invitation.status,
    'row_version',v_invitation.row_version,'sent_at',v_invitation.sent_at
  );
end;
$$;

alter function public.ftf_accept_commercial_invitation(text,uuid)
  rename to ftf_accept_commercial_invitation_v1;
revoke all on function public.ftf_accept_commercial_invitation_v1(text,uuid)
  from public,anon,authenticated,service_role;

create function public.ftf_accept_commercial_invitation(
  p_token text,
  p_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_status text;
  v_expires_at timestamptz;
  v_token_hash text;
begin
  if p_auth_user_id is null or length(coalesce(p_token,''))<32 or length(p_token)>512 then
    return jsonb_build_object('accepted',false,'code','INVITATION_INVALID');
  end if;
  v_token_hash:=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  select status,expires_at into v_status,v_expires_at
  from public.commercial_onboarding_invitations where token_hash=v_token_hash;
  if v_status='PENDING' and v_expires_at>now() then
    return jsonb_build_object('accepted',false,'code','INVITATION_DELIVERY_PENDING');
  end if;
  return public.ftf_accept_commercial_invitation_v1(p_token,p_auth_user_id);
end;
$$;

revoke all on function public.ftf_submit_commercial_application(jsonb)
  from public,anon,authenticated;
revoke all on function public.ftf_submit_commercial_application_guarded(jsonb,text)
  from public,anon,authenticated;
revoke all on function public.ftf_issue_commercial_invitation(uuid,uuid,integer,text,text,timestamptz)
  from public,anon,authenticated;
revoke all on function public.ftf_mark_commercial_invitation_delivery(uuid,uuid,integer,text,text,text)
  from public,anon,authenticated;
revoke all on function public.ftf_accept_commercial_invitation(text,uuid)
  from public,anon,authenticated;

grant execute on function public.ftf_submit_commercial_application(jsonb) to service_role;
grant execute on function public.ftf_submit_commercial_application_guarded(jsonb,text) to service_role;
grant execute on function public.ftf_issue_commercial_invitation(uuid,uuid,integer,text,text,timestamptz)
  to service_role;
grant execute on function public.ftf_mark_commercial_invitation_delivery(uuid,uuid,integer,text,text,text)
  to service_role;
grant execute on function public.ftf_accept_commercial_invitation(text,uuid) to service_role;
