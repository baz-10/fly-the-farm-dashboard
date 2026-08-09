-- NEW-ONB-001: governed Application -> Review -> Invitation -> Organisation lifecycle.
-- Public clients never write these tables. Trusted repository commands are the
-- only mutation boundary and the service role receives read access only.
-- Acceptance deliberately reuses ftf_bootstrap_production_beta_organisation,
-- whose atomic identity chain writes organisations, operating_locations,
-- internal_users, memberships, organisation_seat_allocations,
-- internal_user_seat_assignments, membership_operating_location_assignments,
-- and the compatibility ftf_profiles record. It does not create Personnel.

-- The original beta bootstrap predates role-level Weather and JSA provisioning
-- triggers. Those triggers now assign their permissions as soon as the admin
-- role is inserted, so the bootstrap's later catalogue-wide assignment must be
-- conflict-safe when it is reused after all current migrations are present.
do $migration$
declare
  v_definition text;
  v_original constant text :=
    'from public.permissions p where p.organisation_id = v_organisation_id;';
  v_replacement constant text :=
    'from public.permissions p where p.organisation_id = v_organisation_id on conflict (organisation_id, role_id, permission_id) do nothing;';
begin
  select pg_get_functiondef(
    'public.ftf_bootstrap_production_beta_organisation(uuid,text,text,text,text,text)'::regprocedure
  ) into v_definition;
  if strpos(v_definition,v_original)=0 then
    raise exception 'production beta bootstrap permission assignment contract changed';
  end if;
  execute replace(v_definition,v_original,v_replacement);
end;
$migration$;

create table public.commercial_onboarding_applications (
  id uuid primary key default gen_random_uuid(),
  application_reference text not null unique,
  business_name text not null check (length(btrim(business_name)) between 2 and 200),
  intended_administrator_name text not null check (length(btrim(intended_administrator_name)) between 2 and 200),
  intended_administrator_email text not null
    check (intended_administrator_email = lower(btrim(intended_administrator_email))),
  intended_administrator_phone text not null check (length(btrim(intended_administrator_phone)) between 5 and 50),
  submitted_payload jsonb not null,
  consent_version text not null check (length(btrim(consent_version)) between 1 and 100),
  application_notes text,
  status text not null default 'SUBMITTED'
    check (status in ('SUBMITTED','UNDER_REVIEW','APPROVED','DECLINED','WITHDRAWN')),
  approved_organisation_snapshot jsonb,
  approved_base_snapshot jsonb,
  reviewed_by_platform_user_id uuid references public.platform_users(id) on delete restrict,
  reviewed_at timestamptz,
  decision_notes text,
  row_version integer not null default 1 check (row_version > 0),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_onboarding_application_approval_evidence check (
    status <> 'APPROVED'
    or (
      approved_organisation_snapshot is not null
      and approved_base_snapshot is not null
      and reviewed_by_platform_user_id is not null
      and reviewed_at is not null
    )
  )
);

create table public.commercial_onboarding_application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null
    references public.commercial_onboarding_applications(id) on delete restrict,
  event_type text not null,
  from_status text,
  to_status text not null
    check (to_status in ('SUBMITTED','UNDER_REVIEW','APPROVED','DECLINED','WITHDRAWN')),
  actor_platform_user_id uuid references public.platform_users(id) on delete restrict,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.commercial_onboarding_invitations (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null
    references public.commercial_onboarding_applications(id) on delete restrict,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  intended_administrator_email text not null
    check (intended_administrator_email = lower(btrim(intended_administrator_email))),
  approved_organisation_snapshot jsonb not null,
  approved_base_snapshot jsonb not null,
  status text not null default 'PENDING'
    check (status in ('PENDING','SENT','ACCEPTED','EXPIRED','REVOKED')),
  issued_by_platform_user_id uuid not null references public.platform_users(id) on delete restrict,
  issuance_notes text,
  expires_at timestamptz not null,
  sent_at timestamptz,
  revoked_at timestamptz,
  revoked_by_platform_user_id uuid references public.platform_users(id) on delete restrict,
  revocation_reason text,
  accepted_at timestamptz,
  accepted_by_auth_user_id uuid references auth.users(id) on delete restrict,
  resulting_organisation_id uuid references public.organisations(id) on delete restrict,
  resulting_organisation_reference text,
  resulting_internal_user_id uuid,
  resulting_membership_id uuid,
  resulting_operating_location_id uuid,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_onboarding_invitation_acceptance_evidence check (
    status <> 'ACCEPTED'
    or (
      accepted_at is not null
      and accepted_by_auth_user_id is not null
      and resulting_organisation_id is not null
      and resulting_organisation_reference is not null
      and resulting_internal_user_id is not null
      and resulting_membership_id is not null
      and resulting_operating_location_id is not null
    )
  ),
  foreign key (resulting_organisation_id, resulting_internal_user_id)
    references public.internal_users(organisation_id,id) on delete restrict,
  foreign key (resulting_organisation_id, resulting_membership_id)
    references public.memberships(organisation_id,id) on delete restrict,
  foreign key (resulting_organisation_id, resulting_operating_location_id)
    references public.operating_locations(organisation_id,id) on delete restrict
);

create table public.commercial_onboarding_invitation_events (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null
    references public.commercial_onboarding_invitations(id) on delete restrict,
  application_id uuid not null
    references public.commercial_onboarding_applications(id) on delete restrict,
  event_type text not null,
  from_status text,
  to_status text not null
    check (to_status in ('PENDING','SENT','ACCEPTED','EXPIRED','REVOKED')),
  actor_platform_user_id uuid references public.platform_users(id) on delete restrict,
  actor_auth_user_id uuid references auth.users(id) on delete restrict,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index commercial_onboarding_applications_status_idx
  on public.commercial_onboarding_applications(status,submitted_at desc);
create index commercial_onboarding_applications_email_idx
  on public.commercial_onboarding_applications(intended_administrator_email,submitted_at desc);
create index commercial_onboarding_application_events_application_idx
  on public.commercial_onboarding_application_events(application_id,created_at);
create index commercial_onboarding_invitations_application_idx
  on public.commercial_onboarding_invitations(application_id,created_at desc);
create unique index commercial_onboarding_invitations_one_active_idx
  on public.commercial_onboarding_invitations(application_id)
  where status in ('PENDING','SENT');
create index commercial_onboarding_invitation_events_invitation_idx
  on public.commercial_onboarding_invitation_events(invitation_id,created_at);

create trigger commercial_onboarding_applications_set_update_metadata
before update on public.commercial_onboarding_applications
for each row execute function public.set_tenant_row_update_metadata();

create trigger commercial_onboarding_invitations_set_update_metadata
before update on public.commercial_onboarding_invitations
for each row execute function public.set_tenant_row_update_metadata();

create trigger commercial_onboarding_application_events_append_only
before update or delete on public.commercial_onboarding_application_events
for each row execute function public.reject_append_only_mutation();

create trigger commercial_onboarding_invitation_events_append_only
before update or delete on public.commercial_onboarding_invitation_events
for each row execute function public.reject_append_only_mutation();

create function public.ftf_preserve_consumed_commercial_invitation()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
begin
  if old.status = 'ACCEPTED' then
    raise exception 'consumed invitation evidence is immutable' using errcode='55000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger commercial_onboarding_invitations_preserve_consumed_evidence
before update or delete on public.commercial_onboarding_invitations
for each row execute function public.ftf_preserve_consumed_commercial_invitation();

alter table public.commercial_onboarding_applications enable row level security;
alter table public.commercial_onboarding_applications force row level security;
alter table public.commercial_onboarding_application_events enable row level security;
alter table public.commercial_onboarding_application_events force row level security;
alter table public.commercial_onboarding_invitations enable row level security;
alter table public.commercial_onboarding_invitations force row level security;
alter table public.commercial_onboarding_invitation_events enable row level security;
alter table public.commercial_onboarding_invitation_events force row level security;

revoke all on table
  public.commercial_onboarding_applications,
  public.commercial_onboarding_application_events,
  public.commercial_onboarding_invitations,
  public.commercial_onboarding_invitation_events
from public,anon,authenticated,service_role;

grant select on table
  public.commercial_onboarding_applications,
  public.commercial_onboarding_application_events,
  public.commercial_onboarding_invitations,
  public.commercial_onboarding_invitation_events
to service_role;

insert into public.platform_permissions(code,description,enabled) values
  ('platform.onboarding.application.read','View commercial onboarding applications.',true),
  ('platform.onboarding.application.review','Review commercial onboarding applications.',true),
  ('platform.onboarding.invitation.issue','Issue approved commercial onboarding invitations.',true),
  ('platform.onboarding.invitation.revoke','Revoke commercial onboarding invitations.',true)
on conflict(code) do update set description=excluded.description,enabled=true;

insert into public.platform_role_permissions(role_id,permission_id)
select r.id,p.id
from public.platform_roles r
join public.platform_permissions p on p.code in (
  'platform.onboarding.application.read',
  'platform.onboarding.application.review',
  'platform.onboarding.invitation.issue',
  'platform.onboarding.invitation.revoke'
)
where r.code='PLATFORM_SUPER_ADMIN' and r.is_active=true and p.enabled=true
on conflict do nothing;

create function public.ftf_platform_onboarding_permission(
  p_platform_user_id uuid,
  p_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select exists(
    select 1
    from public.platform_users u
    join public.platform_user_roles ur on ur.platform_user_id=u.id
    join public.platform_roles r on r.id=ur.role_id and r.is_active=true
    join public.platform_role_permissions rp on rp.role_id=r.id
    join public.platform_permissions p on p.id=rp.permission_id and p.enabled=true
    where u.id=p_platform_user_id
      and u.is_active=true
      and u.archived_at is null
      and p.code=p_permission_code
  );
$$;

create function public.ftf_submit_commercial_application(p_application jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_application public.commercial_onboarding_applications%rowtype;
  v_email text:=lower(btrim(coalesce(p_application->>'administratorEmail','')));
  v_base jsonb:=coalesce(p_application->'base','{}'::jsonb);
  v_reference text;
begin
  if p_application is null
    or length(btrim(coalesce(p_application->>'businessName',''))) not between 2 and 200
    or length(btrim(coalesce(p_application->>'administratorName',''))) not between 2 and 200
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or length(btrim(coalesce(p_application->>'administratorPhone',''))) not between 5 and 50
    or length(btrim(coalesce(v_base->>'name',''))) not between 2 and 200
    or length(btrim(coalesce(v_base->>'address',''))) not between 3 and 500
    or nullif(v_base->>'latitude','') is null
    or nullif(v_base->>'longitude','') is null
    or (v_base->>'latitude')::numeric not between -90 and 90
    or (v_base->>'longitude')::numeric not between -180 and 180
    or length(btrim(coalesce(v_base->>'timezone',''))) not between 1 and 100
    or length(btrim(coalesce(p_application->>'consentVersion',''))) not between 1 and 100
    or length(coalesce(p_application->>'notes','')) > 4000
  then
    return jsonb_build_object('submitted',false,'code','APPLICATION_INVALID');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_email,0));
  v_reference:='SC-APP-'||upper(substring(replace(gen_random_uuid()::text,'-','') from 1 for 12));

  insert into public.commercial_onboarding_applications(
    application_reference,business_name,intended_administrator_name,
    intended_administrator_email,intended_administrator_phone,submitted_payload,
    consent_version,application_notes
  ) values (
    v_reference,btrim(p_application->>'businessName'),
    btrim(p_application->>'administratorName'),v_email,
    btrim(p_application->>'administratorPhone'),
    jsonb_build_object(
      'businessName',btrim(p_application->>'businessName'),
      'administratorName',btrim(p_application->>'administratorName'),
      'administratorEmail',v_email,
      'administratorPhone',btrim(p_application->>'administratorPhone'),
      'base',jsonb_build_object(
        'name',btrim(v_base->>'name'),
        'address',btrim(v_base->>'address'),
        'latitude',(v_base->>'latitude')::numeric,
        'longitude',(v_base->>'longitude')::numeric,
        'timezone',btrim(v_base->>'timezone'),
        'addressSource',coalesce(nullif(btrim(v_base->>'addressSource'),''),'APPLICANT')
      ),
      'consentVersion',btrim(p_application->>'consentVersion'),
      'notes',nullif(btrim(p_application->>'notes'),'')
    ),
    btrim(p_application->>'consentVersion'),nullif(btrim(p_application->>'notes'),'')
  ) returning * into v_application;

  insert into public.commercial_onboarding_application_events(
    application_id,event_type,to_status,event_payload
  ) values (
    v_application.id,'APPLICATION_SUBMITTED','SUBMITTED',
    jsonb_build_object('applicationReference',v_application.application_reference,
      'consentVersion',v_application.consent_version)
  );
  insert into public.platform_audit_events(event_type,entity_type,entity_id,event_payload)
  values('commercial_onboarding.application_submitted','commercial_onboarding_application',
    v_application.id,jsonb_build_object('applicationReference',v_application.application_reference));
  insert into public.platform_transactional_outbox(topic,aggregate_type,aggregate_id,payload)
  values('commercial_onboarding.application.submitted','commercial_onboarding_application',
    v_application.id,jsonb_build_object('applicationId',v_application.id,
      'applicationReference',v_application.application_reference));

  return jsonb_build_object(
    'submitted',true,'application_id',v_application.id,
    'application_reference',v_application.application_reference,
    'status',v_application.status,'row_version',v_application.row_version
  );
end;
$$;

create function public.ftf_review_commercial_application(
  p_application_id uuid,
  p_platform_user_id uuid,
  p_expected_version integer,
  p_decision text,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_application public.commercial_onboarding_applications%rowtype;
  v_previous_status text;
  v_target_status text;
  v_actor_auth_user_id uuid;
begin
  if not public.ftf_platform_onboarding_permission(
    p_platform_user_id,'platform.onboarding.application.review'
  ) then
    return jsonb_build_object('reviewed',false,'code','APPLICATION_REVIEW_FORBIDDEN');
  end if;
  if length(coalesce(p_notes,'')) > 4000 then
    return jsonb_build_object('reviewed',false,'code','APPLICATION_REVIEW_INVALID');
  end if;

  v_target_status:=case upper(btrim(coalesce(p_decision,'')))
    when 'UNDER_REVIEW' then 'UNDER_REVIEW'
    when 'APPROVE' then 'APPROVED'
    when 'DECLINE' then 'DECLINED'
    else null
  end;
  if v_target_status is null then
    return jsonb_build_object('reviewed',false,'code','APPLICATION_DECISION_INVALID');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_application_id::text,0));
  select * into v_application
  from public.commercial_onboarding_applications
  where id=p_application_id for update;
  if not found then return jsonb_build_object('not_found',true); end if;
  if v_application.row_version<>p_expected_version then
    return jsonb_build_object('conflict',true,'current_version',v_application.row_version);
  end if;
  if v_application.status not in ('SUBMITTED','UNDER_REVIEW')
    or (v_application.status='UNDER_REVIEW' and v_target_status='UNDER_REVIEW')
  then
    return jsonb_build_object('conflict',true,'current_version',v_application.row_version,
      'current_status',v_application.status);
  end if;

  v_previous_status:=v_application.status;
  update public.commercial_onboarding_applications set
    status=v_target_status,
    reviewed_by_platform_user_id=p_platform_user_id,
    reviewed_at=now(),
    decision_notes=nullif(btrim(p_notes),''),
    approved_organisation_snapshot=case when v_target_status='APPROVED' then
      jsonb_build_object(
        'name',business_name,
        'referencePrefix',public.ftf_suggest_reference_prefix(business_name),
        'approvedAdministratorName',intended_administrator_name,
        'approvedAdministratorEmail',intended_administrator_email
      ) else null end,
    approved_base_snapshot=case when v_target_status='APPROVED' then submitted_payload->'base' else null end
  where id=p_application_id
  returning * into v_application;

  insert into public.commercial_onboarding_application_events(
    application_id,event_type,from_status,to_status,actor_platform_user_id,event_payload
  ) values (
    v_application.id,'APPLICATION_'||v_target_status,v_previous_status,v_target_status,
    p_platform_user_id,jsonb_build_object('notes',v_application.decision_notes,
      'rowVersion',v_application.row_version)
  );
  select auth_user_id into v_actor_auth_user_id
  from public.platform_users where id=p_platform_user_id;
  insert into public.platform_audit_events(
    actor_auth_user_id,event_type,entity_type,entity_id,event_payload
  ) values (
    v_actor_auth_user_id,'commercial_onboarding.application_'||lower(v_target_status),
    'commercial_onboarding_application',v_application.id,
    jsonb_build_object('fromStatus',v_previous_status,'toStatus',v_target_status,
      'rowVersion',v_application.row_version)
  );
  insert into public.platform_transactional_outbox(topic,aggregate_type,aggregate_id,payload)
  values('commercial_onboarding.application.'||lower(v_target_status),
    'commercial_onboarding_application',v_application.id,
    jsonb_build_object('applicationId',v_application.id,'status',v_target_status));

  return jsonb_build_object(
    'reviewed',true,'application_id',v_application.id,'status',v_application.status,
    'row_version',v_application.row_version
  );
end;
$$;

create function public.ftf_issue_commercial_invitation(
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
  if not exists(
    select 1 from public.commercial_onboarding_applications
    where id=p_application_id and status = 'APPROVED'
      and approved_organisation_snapshot is not null
      and approved_base_snapshot is not null
  ) then
    return jsonb_build_object('issued',false,'code','approved_application_required');
  end if;
  if exists(
    select 1 from public.commercial_onboarding_invitations
    where application_id=p_application_id and status in ('PENDING','SENT')
  ) then
    return jsonb_build_object('issued',false,'code','ACTIVE_INVITATION_EXISTS');
  end if;

  v_token_hash:=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  insert into public.commercial_onboarding_invitations(
    application_id,token_hash,intended_administrator_email,
    approved_organisation_snapshot,approved_base_snapshot,status,
    issued_by_platform_user_id,issuance_notes,expires_at,sent_at
  ) values (
    v_application.id,v_token_hash,v_application.intended_administrator_email,
    v_application.approved_organisation_snapshot,v_application.approved_base_snapshot,
    'SENT',p_platform_user_id,nullif(btrim(p_notes),''),p_expires_at,now()
  ) returning * into v_invitation;

  insert into public.commercial_onboarding_invitation_events(
    invitation_id,application_id,event_type,to_status,actor_platform_user_id,event_payload
  ) values (
    v_invitation.id,v_application.id,'INVITATION_ISSUED','SENT',p_platform_user_id,
    jsonb_build_object('expiresAt',v_invitation.expires_at,
      'intendedAdministratorEmail',v_invitation.intended_administrator_email)
  );
  select auth_user_id into v_actor_auth_user_id
  from public.platform_users where id=p_platform_user_id;
  insert into public.platform_audit_events(
    actor_auth_user_id,event_type,entity_type,entity_id,event_payload
  ) values (
    v_actor_auth_user_id,'commercial_onboarding.invitation_issued',
    'commercial_onboarding_invitation',v_invitation.id,
    jsonb_build_object('applicationId',v_application.id,'expiresAt',v_invitation.expires_at)
  );
  insert into public.platform_transactional_outbox(topic,aggregate_type,aggregate_id,payload)
  values('commercial_onboarding.invitation.issued','commercial_onboarding_invitation',
    v_invitation.id,jsonb_build_object('invitationId',v_invitation.id,
      'applicationId',v_application.id,'expiresAt',v_invitation.expires_at));

  return jsonb_build_object(
    'issued',true,'invitation_id',v_invitation.id,'application_id',v_application.id,
    'status',v_invitation.status,'row_version',v_invitation.row_version,
    'expires_at',v_invitation.expires_at
  );
end;
$$;

create function public.ftf_revoke_commercial_invitation(
  p_invitation_id uuid,
  p_platform_user_id uuid,
  p_expected_version integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_invitation public.commercial_onboarding_invitations%rowtype;
  v_previous_status text;
  v_actor_auth_user_id uuid;
begin
  if not public.ftf_platform_onboarding_permission(
    p_platform_user_id,'platform.onboarding.invitation.revoke'
  ) then
    return jsonb_build_object('revoked',false,'code','INVITATION_REVOKE_FORBIDDEN');
  end if;
  if length(btrim(coalesce(p_reason,''))) not between 3 and 2000 then
    return jsonb_build_object('revoked',false,'code','INVITATION_REVOKE_INVALID');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_invitation_id::text,0));
  select * into v_invitation
  from public.commercial_onboarding_invitations
  where id=p_invitation_id for update;
  if not found then return jsonb_build_object('not_found',true); end if;
  if v_invitation.row_version<>p_expected_version then
    return jsonb_build_object('conflict',true,'current_version',v_invitation.row_version);
  end if;
  if v_invitation.status not in ('PENDING','SENT') then
    return jsonb_build_object('conflict',true,'current_version',v_invitation.row_version,
      'current_status',v_invitation.status);
  end if;

  v_previous_status:=v_invitation.status;
  update public.commercial_onboarding_invitations set
    status='REVOKED',revoked_at=now(),revoked_by_platform_user_id=p_platform_user_id,
    revocation_reason=btrim(p_reason)
  where id=p_invitation_id
  returning * into v_invitation;

  insert into public.commercial_onboarding_invitation_events(
    invitation_id,application_id,event_type,from_status,to_status,
    actor_platform_user_id,event_payload
  ) values (
    v_invitation.id,v_invitation.application_id,'INVITATION_REVOKED',v_previous_status,
    'REVOKED',p_platform_user_id,jsonb_build_object('reason',v_invitation.revocation_reason)
  );
  select auth_user_id into v_actor_auth_user_id
  from public.platform_users where id=p_platform_user_id;
  insert into public.platform_audit_events(
    actor_auth_user_id,event_type,entity_type,entity_id,event_payload
  ) values (
    v_actor_auth_user_id,'commercial_onboarding.invitation_revoked',
    'commercial_onboarding_invitation',v_invitation.id,
    jsonb_build_object('reason',v_invitation.revocation_reason)
  );
  insert into public.platform_transactional_outbox(topic,aggregate_type,aggregate_id,payload)
  values('commercial_onboarding.invitation.revoked','commercial_onboarding_invitation',
    v_invitation.id,jsonb_build_object('invitationId',v_invitation.id,
      'reason',v_invitation.revocation_reason));

  return jsonb_build_object(
    'revoked',true,'invitation_id',v_invitation.id,'status',v_invitation.status,
    'row_version',v_invitation.row_version
  );
end;
$$;

create function public.ftf_accept_commercial_invitation(
  p_token_hash text,
  p_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_invitation public.commercial_onboarding_invitations%rowtype;
  v_auth_email text;
  v_bootstrap jsonb;
  v_organisation_id uuid;
  v_internal_user_id uuid;
  v_membership_id uuid;
  v_operating_location_id uuid;
  v_organisation_reference text;
begin
  if p_auth_user_id is null
    or p_token_hash is null
    or p_token_hash<>lower(p_token_hash)
    or p_token_hash!~'^[0-9a-f]{64}$'
  then
    return jsonb_build_object('accepted',false,'code','INVITATION_INVALID');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_token_hash,0));
  select * into v_invitation
  from public.commercial_onboarding_invitations
  where token_hash=p_token_hash for update;
  if not found then
    return jsonb_build_object('accepted',false,'code','INVITATION_INVALID');
  end if;
  if v_invitation.status='ACCEPTED' then
    if v_invitation.accepted_by_auth_user_id=p_auth_user_id then
      return jsonb_build_object(
        'accepted',true,'already_provisioned',true,
        'invitation_id',v_invitation.id,
        'organisation_id',v_invitation.resulting_organisation_id,
        'organisation_reference',v_invitation.resulting_organisation_reference,
        'internal_user_id',v_invitation.resulting_internal_user_id,
        'membership_id',v_invitation.resulting_membership_id,
        'operating_location_id',v_invitation.resulting_operating_location_id
      );
    end if;
    return jsonb_build_object('accepted',false,'code','INVITATION_ALREADY_ACCEPTED');
  end if;
  if v_invitation.status='REVOKED' then
    return jsonb_build_object('accepted',false,'code','INVITATION_REVOKED');
  end if;
  if v_invitation.status='EXPIRED' then
    return jsonb_build_object('accepted',false,'code','INVITATION_EXPIRED');
  end if;
  if v_invitation.status not in ('PENDING','SENT') then
    return jsonb_build_object('accepted',false,'code','INVITATION_INVALID_STATE');
  end if;
  if v_invitation.expires_at<=now() then
    update public.commercial_onboarding_invitations
    set status='EXPIRED' where id=v_invitation.id
    returning * into v_invitation;
    insert into public.commercial_onboarding_invitation_events(
      invitation_id,application_id,event_type,from_status,to_status,event_payload
    ) values (
      v_invitation.id,v_invitation.application_id,'INVITATION_EXPIRED','SENT','EXPIRED',
      jsonb_build_object('expiredAt',v_invitation.expires_at)
    );
    insert into public.platform_audit_events(event_type,entity_type,entity_id,event_payload)
    values('commercial_onboarding.invitation_expired','commercial_onboarding_invitation',
      v_invitation.id,jsonb_build_object('expiredAt',v_invitation.expires_at));
    insert into public.platform_transactional_outbox(topic,aggregate_type,aggregate_id,payload)
    values('commercial_onboarding.invitation.expired','commercial_onboarding_invitation',
      v_invitation.id,jsonb_build_object('invitationId',v_invitation.id));
    return jsonb_build_object('accepted',false,'code','INVITATION_EXPIRED');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_auth_user_id::text,0));
  select lower(email) into v_auth_email from auth.users where id=p_auth_user_id;
  if v_auth_email is null then
    return jsonb_build_object('accepted',false,'code','AUTH_IDENTITY_NOT_FOUND');
  end if;
  if v_auth_email<>v_invitation.intended_administrator_email then
    return jsonb_build_object('accepted',false,'code','INVITATION_EMAIL_MISMATCH');
  end if;
  if exists(
    select 1 from public.platform_users
    where auth_user_id=p_auth_user_id and is_active=true and archived_at is null
  ) then
    return jsonb_build_object('accepted',false,'code','PLATFORM_IDENTITY_FORBIDDEN');
  end if;
  if exists(select 1 from public.internal_users where auth_user_id=p_auth_user_id)
    or exists(select 1 from public.ftf_profiles where user_id=p_auth_user_id)
  then
    return jsonb_build_object('accepted',false,'code','ORGANISATION_IDENTITY_CONFLICT');
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
    v_invitation.id,v_invitation.application_id,'INVITATION_ACCEPTED','SENT','ACCEPTED',
    p_auth_user_id,jsonb_build_object(
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

revoke all on function public.ftf_preserve_consumed_commercial_invitation()
  from public,anon,authenticated,service_role;
revoke all on function public.ftf_platform_onboarding_permission(uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function public.ftf_submit_commercial_application(jsonb)
  from public,anon,authenticated;
revoke all on function public.ftf_review_commercial_application(uuid,uuid,integer,text,text)
  from public,anon,authenticated;
revoke all on function public.ftf_issue_commercial_invitation(uuid,uuid,integer,text,text,timestamptz)
  from public,anon,authenticated;
revoke all on function public.ftf_revoke_commercial_invitation(uuid,uuid,integer,text)
  from public,anon,authenticated;
revoke all on function public.ftf_accept_commercial_invitation(text,uuid)
  from public,anon,authenticated;

grant execute on function public.ftf_submit_commercial_application(jsonb) to service_role;
grant execute on function public.ftf_review_commercial_application(uuid,uuid,integer,text,text)
  to service_role;
grant execute on function public.ftf_issue_commercial_invitation(uuid,uuid,integer,text,text,timestamptz)
  to service_role;
grant execute on function public.ftf_revoke_commercial_invitation(uuid,uuid,integer,text)
  to service_role;
grant execute on function public.ftf_accept_commercial_invitation(text,uuid) to service_role;
