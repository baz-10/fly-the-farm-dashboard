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
