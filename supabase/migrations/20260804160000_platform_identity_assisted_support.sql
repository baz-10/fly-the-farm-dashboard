-- Spray Command platform identities are deliberately independent of tenant identities.
create table public.platform_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  email text not null,
  display_name text not null,
  is_active boolean not null default true,
  archived_at timestamptz,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (auth_user_id)
);
create unique index platform_users_email_unique_idx on public.platform_users(lower(email));

create table public.platform_roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.platform_permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.platform_role_permissions (
  role_id uuid not null references public.platform_roles(id) on delete restrict,
  permission_id uuid not null references public.platform_permissions(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table public.platform_user_roles (
  platform_user_id uuid not null references public.platform_users(id) on delete restrict,
  role_id uuid not null references public.platform_roles(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  assigned_by_platform_user_id uuid references public.platform_users(id) on delete restrict,
  primary key (platform_user_id, role_id)
);

create table public.platform_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_auth_user_id uuid references auth.users(id) on delete restrict,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.platform_transactional_outbox (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  payload jsonb not null,
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

insert into public.platform_roles(code,name) values
  ('PLATFORM_SUPER_ADMIN','Platform Super Administrator'),
  ('PLATFORM_SUPPORT','Platform Support')
on conflict(code) do nothing;

insert into public.platform_permissions(code,description,enabled) values
  ('platform.super_admin','Manage Spray Command platform configuration.',true),
  ('platform.support.session','Start approved organisation support sessions.',true),
  ('platform.break_glass','Emergency tenant access; reserved and disabled.',false)
on conflict(code) do nothing;

insert into public.platform_role_permissions(role_id,permission_id)
select r.id,p.id from public.platform_roles r cross join public.platform_permissions p
where r.code='PLATFORM_SUPER_ADMIN' and p.code in('platform.super_admin','platform.support.session') and p.enabled=true
on conflict do nothing;

create or replace function public.reconcile_platform_identity(
  p_auth_user_id uuid,
  p_expected_email text,
  p_display_name text,
  p_platform_role_code text,
  p_actor_auth_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_auth_email text;
  v_existing public.platform_users%rowtype;
  v_platform_user_id uuid;
  v_role_id uuid;
  v_tenant_access_count integer;
begin
  if p_expected_email is null or lower(trim(p_expected_email))<>p_expected_email then
    return jsonb_build_object('status','IDENTITY_AMBIGUOUS','reason','EXPECTED_EMAIL_NOT_NORMALIZED');
  end if;

  execute 'select lower(email) from auth.users where id=$1' into v_auth_email using p_auth_user_id;
  if v_auth_email is null or v_auth_email<>p_expected_email then
    return jsonb_build_object('status','IDENTITY_AMBIGUOUS','reason','AUTH_ID_EMAIL_MISMATCH');
  end if;

  select * into v_existing from public.platform_users where auth_user_id=p_auth_user_id;
  if found and lower(v_existing.email)<>p_expected_email then
    return jsonb_build_object('status','IDENTITY_AMBIGUOUS','reason','PLATFORM_EMAIL_MISMATCH');
  end if;

  select count(*)::integer into v_tenant_access_count
  from public.internal_users iu
  where iu.auth_user_id=p_auth_user_id
    and (
      exists(select 1 from public.memberships m where m.organisation_id=iu.organisation_id and m.internal_user_id=iu.id and m.is_active=true and m.archived_at is null)
      or exists(select 1 from public.internal_user_seat_assignments s where s.organisation_id=iu.organisation_id and s.internal_user_id=iu.id and s.status='active' and s.archived_at is null)
      or exists(select 1 from public.personnel pe where pe.organisation_id=iu.organisation_id and pe.internal_user_id=iu.id and pe.archived_at is null)
    );
  if v_tenant_access_count>0 then
    return jsonb_build_object('status','TENANT_ACCESS_PRESENT','reason','CONTROLLED_RECONCILIATION_REQUIRED');
  end if;

  select id into v_role_id from public.platform_roles where code=p_platform_role_code and is_active=true;
  if v_role_id is null then
    return jsonb_build_object('status','ROLE_NOT_FOUND');
  end if;

  insert into public.platform_users(auth_user_id,email,display_name)
  values(p_auth_user_id,p_expected_email,trim(p_display_name))
  on conflict(auth_user_id) do update set display_name=excluded.display_name,updated_at=now()
  returning id into v_platform_user_id;

  insert into public.platform_user_roles(platform_user_id,role_id)
  values(v_platform_user_id,v_role_id) on conflict do nothing;

  if not found then
    return jsonb_build_object('status','ALREADY_RECONCILED','platform_user_id',v_platform_user_id);
  end if;

  insert into public.platform_audit_events(actor_auth_user_id,event_type,entity_type,entity_id,event_payload)
  values(p_actor_auth_user_id,'platform.identity.reconciled','platform_user',v_platform_user_id,jsonb_build_object('email',p_expected_email,'role',p_platform_role_code));
  insert into public.platform_transactional_outbox(topic,aggregate_type,aggregate_id,payload)
  values('platform.identity.reconciled','platform_user',v_platform_user_id,jsonb_build_object('platformUserId',v_platform_user_id,'role',p_platform_role_code));
  return jsonb_build_object('status','RECONCILED','platform_user_id',v_platform_user_id);
end;
$$;

alter table public.platform_users enable row level security;
alter table public.platform_roles enable row level security;
alter table public.platform_permissions enable row level security;
alter table public.platform_role_permissions enable row level security;
alter table public.platform_user_roles enable row level security;
alter table public.platform_audit_events enable row level security;
alter table public.platform_transactional_outbox enable row level security;

revoke all on function public.reconcile_platform_identity(uuid,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.reconcile_platform_identity(uuid,text,text,text,uuid) to service_role;

-- Organisation Assisted Support is delegated evidence, never a tenant membership.
create table public.organisation_support_policy_versions(
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  version_number integer not null check(version_number>0),
  approval_model text not null check(approval_model in('SAME_ADMIN','DIFFERENT_ADMIN','MULTI_ADMIN')),
  required_approvals integer not null default 1 check(required_approvals between 1 and 5),
  default_duration_minutes integer not null default 120 check(default_duration_minutes between 15 and 1440),
  effective_at timestamptz not null default now(),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  unique(organisation_id,version_number),unique(organisation_id,id)
);

insert into public.organisation_support_policy_versions(organisation_id,version_number,approval_model,required_approvals,default_duration_minutes)
select id,1,'SAME_ADMIN',1,120 from public.organisations on conflict(organisation_id,version_number)do nothing;

create function public.provision_default_support_policy()returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into public.organisation_support_policy_versions(organisation_id,version_number,approval_model,required_approvals,default_duration_minutes)values(new.id,1,'SAME_ADMIN',1,120)on conflict do nothing;
 return new;
end$$;
create trigger organisations_default_support_policy after insert on public.organisations for each row execute function public.provision_default_support_policy();

create table public.support_requests(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null references public.organisations(id) on delete restrict,
 requested_by_internal_user_id uuid not null,reason text not null check(length(trim(reason))between 3 and 2000),
 access_mode text not null check(access_mode in('READ_ONLY','READ_WRITE')),
 scope_type text not null check(scope_type in('ORGANISATION','MISSION','JOB','MODULE')),
 mission_id uuid,job_id uuid,module_code text,requested_duration_minutes integer not null check(requested_duration_minutes between 15 and 1440),
 policy_version_id uuid not null,state text not null default'PENDING'check(state in('PENDING','APPROVED','REJECTED','CANCELLED')),
 approved_duration_minutes integer,approved_at timestamptz,row_version integer not null default 1 check(row_version>0),
 requested_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organisation_id,id),
 foreign key(organisation_id,requested_by_internal_user_id)references public.internal_users(organisation_id,id),
 foreign key(organisation_id,policy_version_id)references public.organisation_support_policy_versions(organisation_id,id),
 foreign key(organisation_id,mission_id)references public.missions(organisation_id,id),
 foreign key(organisation_id,job_id)references public.jobs(organisation_id,id),
 check((scope_type='MISSION'and mission_id is not null and job_id is null and module_code is null)or(scope_type='JOB'and job_id is not null and mission_id is null and module_code is null)or(scope_type='MODULE'and module_code is not null and mission_id is null and job_id is null)or(scope_type='ORGANISATION'and mission_id is null and job_id is null and module_code is null))
);

create table public.support_approval_events(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,support_request_id uuid not null,
 approved_by_internal_user_id uuid not null,decision text not null check(decision in('APPROVE','REJECT')),
 decision_notes text,requester_is_approver boolean not null,request_timestamp timestamptz not null,approval_timestamp timestamptz not null default now(),
 approved_access_mode text not null,approved_scope_type text not null,approved_duration_minutes integer not null,
 approved_expiry_basis text not null default'SESSION_START',policy_snapshot jsonb not null,
 unique(organisation_id,id),
 foreign key(organisation_id,support_request_id)references public.support_requests(organisation_id,id),
 foreign key(organisation_id,approved_by_internal_user_id)references public.internal_users(organisation_id,id)
);

create table public.support_sessions(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,support_request_id uuid not null,
 platform_user_id uuid not null references public.platform_users(id) on delete restrict,access_mode text not null check(access_mode in('READ_ONLY','READ_WRITE')),
 scope_type text not null,mission_id uuid,job_id uuid,module_code text,reason text not null,
 state text not null default'ACTIVE'check(state in('ACTIVE','ENDED','REVOKED','EXPIRED')),
 started_at timestamptz not null default now(),expires_at timestamptz not null,ended_at timestamptz,
 ended_by_internal_user_id uuid,end_reason text,row_version integer not null default 1 check(row_version>0),created_at timestamptz not null default now(),
 unique(organisation_id,id),foreign key(organisation_id,support_request_id)references public.support_requests(organisation_id,id),
 foreign key(organisation_id,mission_id)references public.missions(organisation_id,id),foreign key(organisation_id,job_id)references public.jobs(organisation_id,id),
 foreign key(organisation_id,ended_by_internal_user_id)references public.internal_users(organisation_id,id),check(expires_at>started_at)
);

create unique index one_active_support_session_per_request on public.support_sessions(support_request_id)where state='ACTIVE';

create table public.support_activity_events(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,support_session_id uuid not null,
 platform_user_id uuid not null references public.platform_users(id) on delete restrict,activity_type text not null,
 module_code text,resource_type text,resource_id uuid,operation text not null,outcome text not null,
 occurred_at timestamptz not null default now(),metadata jsonb not null default'{}'::jsonb,
 foreign key(organisation_id,support_session_id)references public.support_sessions(organisation_id,id)
);

create table public.organisation_notifications(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null references public.organisations(id) on delete restrict,
 event_type text not null,entity_type text not null,entity_id uuid not null,title text not null,message text not null,
 delivery_state text not null default'PENDING'check(delivery_state in('PENDING','DELIVERED','FAILED')),
 created_at timestamptz not null default now(),delivered_at timestamptz
);

alter table public.audit_events add column actor_type text not null default'ORGANISATION_USER'check(actor_type in('ORGANISATION_USER','PLATFORM_SUPPORT','SYSTEM'));
alter table public.audit_events add column actor_platform_user_id uuid references public.platform_users(id) on delete restrict;
alter table public.audit_events add column support_session_id uuid;
alter table public.audit_events add column authority_snapshot jsonb;
alter table public.audit_events add constraint audit_events_support_session_fk foreign key(organisation_id,support_session_id)references public.support_sessions(organisation_id,id);

create or replace function public.support_actor_is_admin(p_organisation_id uuid,p_actor_internal_user_id uuid)returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.memberships m join public.roles r on r.organisation_id=m.organisation_id and r.id=m.role_id where m.organisation_id=p_organisation_id and m.internal_user_id=p_actor_internal_user_id and m.is_active and m.archived_at is null and r.code='admin'and r.archived_at is null)
$$;

create function public.create_support_request(p_organisation_id uuid,p_requester_internal_user_id uuid,p_reason text,p_access_mode text,p_scope_type text,p_mission_id uuid,p_job_id uuid,p_module_code text,p_duration_minutes integer)returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_policy public.organisation_support_policy_versions%rowtype;v_request public.support_requests%rowtype;
begin
 if not public.support_actor_is_admin(p_organisation_id,p_requester_internal_user_id)then raise exception'SUPPORT_REQUEST_FORBIDDEN';end if;
 select*into v_policy from public.organisation_support_policy_versions where organisation_id=p_organisation_id and effective_at<=now()and retired_at is null order by version_number desc limit 1;
 if not found then raise exception'SUPPORT_POLICY_MISSING';end if;
 insert into public.support_requests(organisation_id,requested_by_internal_user_id,reason,access_mode,scope_type,mission_id,job_id,module_code,requested_duration_minutes,policy_version_id)
 values(p_organisation_id,p_requester_internal_user_id,trim(p_reason),p_access_mode,p_scope_type,p_mission_id,p_job_id,nullif(trim(p_module_code),''),coalesce(p_duration_minutes,v_policy.default_duration_minutes),v_policy.id)returning*into v_request;
 insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)values(p_organisation_id,p_requester_internal_user_id,'support.requested','support_request',v_request.id,jsonb_build_object('mode',v_request.access_mode,'scope',v_request.scope_type,'durationMinutes',v_request.requested_duration_minutes));
 insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)values(p_organisation_id,'platform.support.requested','support_request',v_request.id,jsonb_build_object('supportRequestId',v_request.id));
 return jsonb_build_object('request_id',v_request.id,'state',v_request.state,'row_version',v_request.row_version,'requested_at',v_request.requested_at);
end$$;

create function public.decide_support_request(p_organisation_id uuid,p_approver_internal_user_id uuid,p_request_id uuid,p_expected_version integer,p_decision text,p_notes text)returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_request public.support_requests%rowtype;v_policy public.organisation_support_policy_versions%rowtype;v_event public.support_approval_events%rowtype;v_satisfied boolean:=false;v_count integer;
begin
 if not public.support_actor_is_admin(p_organisation_id,p_approver_internal_user_id)then raise exception'SUPPORT_APPROVAL_FORBIDDEN';end if;
 select*into v_request from public.support_requests where organisation_id=p_organisation_id and id=p_request_id for update;if not found then return jsonb_build_object('not_found',true);end if;
 if v_request.row_version<>p_expected_version then return jsonb_build_object('conflict',true,'current_version',v_request.row_version);end if;
 if v_request.state<>'PENDING'then return jsonb_build_object('conflict',true,'current_version',v_request.row_version);end if;
 select*into v_policy from public.organisation_support_policy_versions where organisation_id=p_organisation_id and id=v_request.policy_version_id;
 insert into public.support_approval_events(organisation_id,support_request_id,approved_by_internal_user_id,decision,decision_notes,requester_is_approver,request_timestamp,approved_access_mode,approved_scope_type,approved_duration_minutes,policy_snapshot)
 values(p_organisation_id,v_request.id,p_approver_internal_user_id,p_decision,nullif(trim(p_notes),''),p_approver_internal_user_id=v_request.requested_by_internal_user_id,v_request.requested_at,v_request.access_mode,v_request.scope_type,v_request.requested_duration_minutes,jsonb_build_object('policyVersionId',v_policy.id,'version',v_policy.version_number,'approvalModel',v_policy.approval_model,'requiredApprovals',v_policy.required_approvals))returning*into v_event;
 if p_decision='REJECT'then update public.support_requests set state='REJECTED',row_version=row_version+1,updated_at=now()where id=v_request.id;
 else
  select count(distinct approved_by_internal_user_id)::int into v_count from public.support_approval_events where organisation_id=p_organisation_id and support_request_id=v_request.id and decision='APPROVE';
  v_satisfied=(v_policy.approval_model='SAME_ADMIN'and v_count>=v_policy.required_approvals)or(v_policy.approval_model='DIFFERENT_ADMIN'and p_approver_internal_user_id<>v_request.requested_by_internal_user_id and v_count>=v_policy.required_approvals)or(v_policy.approval_model='MULTI_ADMIN'and v_count>=v_policy.required_approvals);
  if v_satisfied then update public.support_requests set state='APPROVED',approved_duration_minutes=requested_duration_minutes,approved_at=now(),row_version=row_version+1,updated_at=now()where id=v_request.id;end if;
 end if;
 insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)values(p_organisation_id,p_approver_internal_user_id,'support.approval_decided','support_request',v_request.id,jsonb_build_object('approvalEventId',v_event.id,'decision',p_decision,'requesterIsApprover',v_event.requester_is_approver));
 insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)values(p_organisation_id,'platform.support.approval_decided','support_request',v_request.id,jsonb_build_object('approvalEventId',v_event.id,'decision',p_decision));
 if v_satisfied then insert into public.organisation_notifications(organisation_id,event_type,entity_type,entity_id,title,message)values(p_organisation_id,'SUPPORT_GRANTED','support_request',v_request.id,'Support access granted','Approved support access is ready to be started.');end if;
 return jsonb_build_object('approval_id',v_event.id,'requester_is_approver',v_event.requester_is_approver,'state',case when p_decision='REJECT'then'REJECTED'when v_satisfied then'APPROVED'else'PENDING'end,'approval_timestamp',v_event.approval_timestamp);
end$$;

create function public.start_support_session(p_platform_user_id uuid,p_request_id uuid)returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_request public.support_requests%rowtype;v_session public.support_sessions%rowtype;v_started timestamptz:=now();
begin
 if not exists(select 1 from public.platform_user_roles ur join public.platform_role_permissions rp on rp.role_id=ur.role_id join public.platform_permissions p on p.id=rp.permission_id where ur.platform_user_id=p_platform_user_id and p.code='platform.support.session'and p.enabled=true)then raise exception'PLATFORM_SUPPORT_FORBIDDEN';end if;
 select*into v_request from public.support_requests where id=p_request_id and state='APPROVED'for update;if not found then return jsonb_build_object('not_approved',true);end if;
 insert into public.support_sessions(organisation_id,support_request_id,platform_user_id,access_mode,scope_type,mission_id,job_id,module_code,reason,started_at,expires_at)
 values(v_request.organisation_id,v_request.id,p_platform_user_id,v_request.access_mode,v_request.scope_type,v_request.mission_id,v_request.job_id,v_request.module_code,v_request.reason,v_started,v_started+(v_request.approved_duration_minutes||' minutes')::interval)returning*into v_session;
 insert into public.audit_events(organisation_id,event_type,entity_type,entity_id,event_payload,actor_type,actor_platform_user_id,support_session_id,authority_snapshot)values(v_session.organisation_id,'support.session_started','support_session',v_session.id,jsonb_build_object('platformUserId',p_platform_user_id,'expiresAt',v_session.expires_at),'PLATFORM_SUPPORT',p_platform_user_id,v_session.id,jsonb_build_object('requestId',v_request.id,'mode',v_session.access_mode,'scopeType',v_session.scope_type,'missionId',v_session.mission_id,'jobId',v_session.job_id,'moduleCode',v_session.module_code,'reason',v_session.reason,'approvedBy',(select approved_by_internal_user_id from public.support_approval_events where support_request_id=v_request.id and decision='APPROVE'order by approval_timestamp desc limit 1)));
 insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)values(v_session.organisation_id,'platform.support.session_started','support_session',v_session.id,jsonb_build_object('platformUserId',p_platform_user_id,'expiresAt',v_session.expires_at));
 insert into public.organisation_notifications(organisation_id,event_type,entity_type,entity_id,title,message)values(v_session.organisation_id,'SUPPORT_STARTED','support_session',v_session.id,'Support session started','An approved Spray Command support session has started.');
 return jsonb_build_object('session_id',v_session.id,'state',v_session.state,'started_at',v_session.started_at,'expires_at',v_session.expires_at,'access_mode',v_session.access_mode,'scope_type',v_session.scope_type,'mission_id',v_session.mission_id,'job_id',v_session.job_id,'module_code',v_session.module_code,'organisation_id',v_session.organisation_id);
exception when unique_violation then return jsonb_build_object('conflict',true,'reason','SESSION_ALREADY_ACTIVE');
end$$;

create function public.support_access_allowed(p_session_id uuid,p_organisation_id uuid,p_operation text,p_module_code text,p_mission_id uuid,p_job_id uuid,p_at_time timestamptz)returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_session public.support_sessions%rowtype;v_scope boolean;
begin
 select*into v_session from public.support_sessions where id=p_session_id and organisation_id=p_organisation_id;if not found then return jsonb_build_object('allowed',false,'denial_code','SUPPORT_SESSION_NOT_FOUND');end if;
 if v_session.state<>'ACTIVE'then return jsonb_build_object('allowed',false,'denial_code','SUPPORT_SESSION_'||v_session.state);end if;
 if p_at_time>=v_session.expires_at then return jsonb_build_object('allowed',false,'denial_code','SUPPORT_SESSION_EXPIRED');end if;
 if upper(p_operation)='WRITE'and v_session.access_mode='READ_ONLY'then return jsonb_build_object('allowed',false,'denial_code','SUPPORT_READ_ONLY');end if;
 v_scope=v_session.scope_type='ORGANISATION'or(v_session.scope_type='MODULE'and v_session.module_code=p_module_code)or(v_session.scope_type='MISSION'and v_session.mission_id=p_mission_id)or(v_session.scope_type='JOB'and v_session.job_id=p_job_id);
 if not v_scope then return jsonb_build_object('allowed',false,'denial_code','SUPPORT_SCOPE_MISMATCH');end if;
 return jsonb_build_object('allowed',true,'denial_code',null,'access_mode',v_session.access_mode,'scope_type',v_session.scope_type);
end$$;

create function public.revoke_support_session(p_organisation_id uuid,p_actor_internal_user_id uuid,p_session_id uuid,p_expected_version integer,p_reason text)returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_session public.support_sessions%rowtype;
begin
 if not public.support_actor_is_admin(p_organisation_id,p_actor_internal_user_id)then raise exception'SUPPORT_REVOKE_FORBIDDEN';end if;
 update public.support_sessions set state='REVOKED',ended_at=now(),ended_by_internal_user_id=p_actor_internal_user_id,end_reason=trim(p_reason),row_version=row_version+1 where organisation_id=p_organisation_id and id=p_session_id and state='ACTIVE'and row_version=p_expected_version returning*into v_session;
 if not found then return jsonb_build_object('conflict',true);end if;
 insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)values(p_organisation_id,p_actor_internal_user_id,'support.session_revoked','support_session',v_session.id,jsonb_build_object('reason',v_session.end_reason));
 insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)values(p_organisation_id,'platform.support.session_revoked','support_session',v_session.id,jsonb_build_object('reason',v_session.end_reason));
 insert into public.organisation_notifications(organisation_id,event_type,entity_type,entity_id,title,message)values(p_organisation_id,'SUPPORT_REVOKED','support_session',v_session.id,'Support session revoked','Organisation support access was revoked.');
 return jsonb_build_object('session_id',v_session.id,'state',v_session.state,'row_version',v_session.row_version);
end$$;

create function public.record_delegated_support_activity(p_session_id uuid,p_platform_user_id uuid,p_operation text,p_module_code text,p_resource_type text,p_resource_id uuid,p_outcome text,p_metadata jsonb default'{}'::jsonb)returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_session public.support_sessions%rowtype;v_request public.support_requests%rowtype;v_approval public.support_approval_events%rowtype;v_event public.support_activity_events%rowtype;v_access jsonb;
begin
 select*into v_session from public.support_sessions where id=p_session_id and platform_user_id=p_platform_user_id; if not found then raise exception'SUPPORT_SESSION_NOT_FOUND';end if;
 select*into v_request from public.support_requests where id=v_session.support_request_id;
 select*into v_approval from public.support_approval_events where support_request_id=v_request.id and decision='APPROVE'order by approval_timestamp desc limit 1;
 v_access=public.support_access_allowed(v_session.id,v_session.organisation_id,case when upper(p_operation)in('GET','READ','LIST')then'READ'else'WRITE'end,p_module_code,case when v_session.scope_type='MISSION'then v_session.mission_id else null end,case when v_session.scope_type='JOB'then v_session.job_id else null end,now());
 if not coalesce((v_access->>'allowed')::boolean,false)then return v_access;end if;
 insert into public.support_activity_events(organisation_id,support_session_id,platform_user_id,activity_type,module_code,resource_type,resource_id,operation,outcome,metadata)values(v_session.organisation_id,v_session.id,p_platform_user_id,case when upper(p_operation)in('GET','READ','LIST')then'RECORD_VIEWED'else'RECORD_CHANGED'end,p_module_code,p_resource_type,p_resource_id,upper(p_operation),p_outcome,coalesce(p_metadata,'{}'))returning*into v_event;
 insert into public.audit_events(organisation_id,event_type,entity_type,entity_id,event_payload,actor_type,actor_platform_user_id,support_session_id,authority_snapshot)values(v_session.organisation_id,'support.delegated_activity',coalesce(p_resource_type,'support_activity'),p_resource_id,jsonb_build_object('activityEventId',v_event.id,'operation',upper(p_operation),'outcome',p_outcome),'PLATFORM_SUPPORT',p_platform_user_id,v_session.id,jsonb_build_object('approvingOrganisationUserId',v_approval.approved_by_internal_user_id,'approvedScope',v_session.scope_type,'accessMode',v_session.access_mode,'reason',v_session.reason,'expiresAt',v_session.expires_at));
 insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)values(v_session.organisation_id,'platform.support.delegated_activity',coalesce(p_resource_type,'support_activity'),coalesce(p_resource_id,v_event.id),jsonb_build_object('activityEventId',v_event.id,'supportSessionId',v_session.id,'platformUserId',p_platform_user_id,'operation',upper(p_operation),'outcome',p_outcome));
 return jsonb_build_object('recorded',true,'activity_event_id',v_event.id,'audit_actor_type','PLATFORM_SUPPORT');
end$$;

alter table public.organisation_support_policy_versions enable row level security;alter table public.support_requests enable row level security;alter table public.support_approval_events enable row level security;alter table public.support_sessions enable row level security;alter table public.support_activity_events enable row level security;alter table public.organisation_notifications enable row level security;
revoke all on function public.support_actor_is_admin(uuid,uuid),public.create_support_request(uuid,uuid,text,text,text,uuid,uuid,text,integer),public.decide_support_request(uuid,uuid,uuid,integer,text,text),public.start_support_session(uuid,uuid),public.support_access_allowed(uuid,uuid,text,text,uuid,uuid,timestamptz),public.revoke_support_session(uuid,uuid,uuid,integer,text),public.record_delegated_support_activity(uuid,uuid,text,text,text,uuid,text,jsonb)from public,anon,authenticated;
grant execute on function public.create_support_request(uuid,uuid,text,text,text,uuid,uuid,text,integer),public.decide_support_request(uuid,uuid,uuid,integer,text,text),public.start_support_session(uuid,uuid),public.support_access_allowed(uuid,uuid,text,text,uuid,uuid,timestamptz),public.revoke_support_session(uuid,uuid,uuid,integer,text),public.record_delegated_support_activity(uuid,uuid,text,text,text,uuid,text,jsonb)to service_role;
