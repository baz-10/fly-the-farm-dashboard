-- Production beta foundation: organisation-scoped operational records.
-- This migration intentionally leaves legacy ftf_profiles and ftf_store untouched.

create extension if not exists pgcrypto;

create or replace function public.set_tenant_row_update_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  new.row_version = old.row_version + 1;
  return new;
end;
$$;

create or replace function public.reject_append_only_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception '% records are append-only', tg_table_name
    using errcode = '55000';
end;
$$;

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  name text not null,
  archived_at timestamptz,
  archived_by_internal_user_id uuid,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organisations_id_matches_organisation check (id = organisation_id),
  unique (organisation_id, id)
);

create table public.operating_locations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  name text not null,
  address text,
  timezone text not null default 'Australia/Brisbane',
  archived_at timestamptz,
  archived_by_internal_user_id uuid,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, id),
  foreign key (organisation_id) references public.organisations (id)
);

create table public.internal_users (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  auth_user_id uuid not null references auth.users (id) on delete restrict,
  display_name text not null,
  is_active boolean not null default true,
  archived_at timestamptz,
  archived_by_internal_user_id uuid,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, id),
  unique (organisation_id, auth_user_id),
  foreign key (organisation_id) references public.organisations (id)
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  code text not null,
  name text not null,
  archived_at timestamptz,
  archived_by_internal_user_id uuid,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, id),
  unique (organisation_id, code),
  foreign key (organisation_id) references public.organisations (id)
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  internal_user_id uuid not null,
  role_id uuid not null,
  is_active boolean not null default true,
  archived_at timestamptz,
  archived_by_internal_user_id uuid,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, id),
  unique (organisation_id, internal_user_id, role_id),
  foreign key (organisation_id) references public.organisations (id),
  foreign key (organisation_id, internal_user_id) references public.internal_users (organisation_id, id),
  foreign key (organisation_id, role_id) references public.roles (organisation_id, id)
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  code text not null,
  description text not null,
  archived_at timestamptz,
  archived_by_internal_user_id uuid,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, id),
  unique (organisation_id, code),
  foreign key (organisation_id) references public.organisations (id)
);

create table public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  role_id uuid not null,
  permission_id uuid not null,
  archived_at timestamptz,
  archived_by_internal_user_id uuid,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, id),
  unique (organisation_id, role_id, permission_id),
  foreign key (organisation_id, role_id) references public.roles (organisation_id, id),
  foreign key (organisation_id, permission_id) references public.permissions (organisation_id, id)
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  name text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  archived_at timestamptz,
  archived_by_internal_user_id uuid,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, id),
  foreign key (organisation_id) references public.organisations (id)
);

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  client_id uuid not null,
  name text not null,
  address text,
  archived_at timestamptz,
  archived_by_internal_user_id uuid,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, id),
  unique (organisation_id, client_id, id),
  foreign key (organisation_id, client_id) references public.clients (organisation_id, id)
);

create table public.field_boundary_versions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  property_id uuid not null,
  version_number integer not null check (version_number > 0),
  boundary_geojson jsonb not null,
  captured_at timestamptz,
  archived_at timestamptz,
  archived_by_internal_user_id uuid,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, id),
  unique (organisation_id, property_id, id),
  unique (organisation_id, property_id, version_number),
  foreign key (organisation_id, property_id) references public.properties (organisation_id, id)
);

create table public.fields (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  property_id uuid not null,
  field_boundary_version_id uuid,
  name text not null,
  area_hectares numeric(12, 4),
  archived_at timestamptz,
  archived_by_internal_user_id uuid,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, id),
  foreign key (organisation_id, property_id) references public.properties (organisation_id, id),
  foreign key (organisation_id, property_id, field_boundary_version_id) references public.field_boundary_versions (organisation_id, property_id, id)
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  client_id uuid not null,
  property_id uuid not null,
  reference text not null,
  status text not null default 'draft',
  archived_at timestamptz,
  archived_by_internal_user_id uuid,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, id),
  unique (organisation_id, reference),
  foreign key (organisation_id, client_id) references public.clients (organisation_id, id),
  foreign key (organisation_id, client_id, property_id) references public.properties (organisation_id, client_id, id)
);

create table public.job_fields (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  job_id uuid not null,
  field_id uuid not null,
  target_area_hectares numeric(12, 4),
  archived_at timestamptz,
  archived_by_internal_user_id uuid,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, id),
  unique (organisation_id, job_id, field_id),
  foreign key (organisation_id, job_id) references public.jobs (organisation_id, id),
  foreign key (organisation_id, field_id) references public.fields (organisation_id, id)
);

create table public.missions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  job_id uuid not null,
  operating_location_id uuid not null,
  mission_number text not null,
  status text not null default 'draft',
  scheduled_start_at timestamptz,
  archived_at timestamptz,
  archived_by_internal_user_id uuid,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, id),
  unique (organisation_id, mission_number),
  foreign key (organisation_id, job_id) references public.jobs (organisation_id, id),
  foreign key (organisation_id, operating_location_id) references public.operating_locations (organisation_id, id)
);

create table public.mission_versions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  mission_id uuid not null,
  version_number integer not null check (version_number > 0),
  snapshot jsonb not null,
  archived_at timestamptz,
  archived_by_internal_user_id uuid,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, id),
  unique (organisation_id, mission_id, version_number),
  foreign key (organisation_id, mission_id) references public.missions (organisation_id, id)
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  actor_internal_user_id uuid,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organisation_id, id),
  foreign key (organisation_id, actor_internal_user_id) references public.internal_users (organisation_id, id)
);

create table public.transactional_outbox (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  topic text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  payload jsonb not null,
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organisation_id, id),
  foreign key (organisation_id) references public.organisations (id)
);

-- Archive actors are tenant-bound internal users, not arbitrary UUIDs.
alter table public.organisations add constraint organisations_archived_by_internal_user_fk foreign key (organisation_id, archived_by_internal_user_id) references public.internal_users (organisation_id, id);
alter table public.operating_locations add constraint operating_locations_archived_by_internal_user_fk foreign key (organisation_id, archived_by_internal_user_id) references public.internal_users (organisation_id, id);
alter table public.internal_users add constraint internal_users_archived_by_internal_user_fk foreign key (organisation_id, archived_by_internal_user_id) references public.internal_users (organisation_id, id);
alter table public.memberships add constraint memberships_archived_by_internal_user_fk foreign key (organisation_id, archived_by_internal_user_id) references public.internal_users (organisation_id, id);
alter table public.roles add constraint roles_archived_by_internal_user_fk foreign key (organisation_id, archived_by_internal_user_id) references public.internal_users (organisation_id, id);
alter table public.permissions add constraint permissions_archived_by_internal_user_fk foreign key (organisation_id, archived_by_internal_user_id) references public.internal_users (organisation_id, id);
alter table public.role_permissions add constraint role_permissions_archived_by_internal_user_fk foreign key (organisation_id, archived_by_internal_user_id) references public.internal_users (organisation_id, id);
alter table public.clients add constraint clients_archived_by_internal_user_fk foreign key (organisation_id, archived_by_internal_user_id) references public.internal_users (organisation_id, id);
alter table public.properties add constraint properties_archived_by_internal_user_fk foreign key (organisation_id, archived_by_internal_user_id) references public.internal_users (organisation_id, id);
alter table public.field_boundary_versions add constraint field_boundary_versions_archived_by_internal_user_fk foreign key (organisation_id, archived_by_internal_user_id) references public.internal_users (organisation_id, id);
alter table public.fields add constraint fields_archived_by_internal_user_fk foreign key (organisation_id, archived_by_internal_user_id) references public.internal_users (organisation_id, id);
alter table public.jobs add constraint jobs_archived_by_internal_user_fk foreign key (organisation_id, archived_by_internal_user_id) references public.internal_users (organisation_id, id);
alter table public.job_fields add constraint job_fields_archived_by_internal_user_fk foreign key (organisation_id, archived_by_internal_user_id) references public.internal_users (organisation_id, id);
alter table public.missions add constraint missions_archived_by_internal_user_fk foreign key (organisation_id, archived_by_internal_user_id) references public.internal_users (organisation_id, id);
alter table public.mission_versions add constraint mission_versions_archived_by_internal_user_fk foreign key (organisation_id, archived_by_internal_user_id) references public.internal_users (organisation_id, id);

-- Every foreign key has an index and each tenant table has an organisation list index.
create index organisations_organisation_idx on public.organisations (organisation_id);
create index organisations_archived_by_idx on public.organisations (organisation_id, archived_by_internal_user_id);
create index operating_locations_organisation_idx on public.operating_locations (organisation_id);
create index operating_locations_archived_by_idx on public.operating_locations (organisation_id, archived_by_internal_user_id);
create index internal_users_organisation_idx on public.internal_users (organisation_id);
create index internal_users_auth_user_idx on public.internal_users (auth_user_id);
create index internal_users_archived_by_idx on public.internal_users (organisation_id, archived_by_internal_user_id);
create index roles_organisation_idx on public.roles (organisation_id);
create index roles_archived_by_idx on public.roles (organisation_id, archived_by_internal_user_id);
create index memberships_organisation_user_idx on public.memberships (organisation_id, internal_user_id);
create index memberships_organisation_role_idx on public.memberships (organisation_id, role_id);
create index memberships_archived_by_idx on public.memberships (organisation_id, archived_by_internal_user_id);
create index permissions_organisation_idx on public.permissions (organisation_id);
create index permissions_archived_by_idx on public.permissions (organisation_id, archived_by_internal_user_id);
create index role_permissions_organisation_role_idx on public.role_permissions (organisation_id, role_id);
create index role_permissions_organisation_permission_idx on public.role_permissions (organisation_id, permission_id);
create index role_permissions_archived_by_idx on public.role_permissions (organisation_id, archived_by_internal_user_id);
create index clients_organisation_idx on public.clients (organisation_id);
create index clients_archived_by_idx on public.clients (organisation_id, archived_by_internal_user_id);
create index properties_organisation_client_idx on public.properties (organisation_id, client_id);
create index properties_archived_by_idx on public.properties (organisation_id, archived_by_internal_user_id);
create index field_boundary_versions_organisation_property_idx on public.field_boundary_versions (organisation_id, property_id);
create index field_boundary_versions_archived_by_idx on public.field_boundary_versions (organisation_id, archived_by_internal_user_id);
create index fields_organisation_property_idx on public.fields (organisation_id, property_id);
create index fields_organisation_property_boundary_idx on public.fields (organisation_id, property_id, field_boundary_version_id);
create index fields_archived_by_idx on public.fields (organisation_id, archived_by_internal_user_id);
create index jobs_organisation_client_idx on public.jobs (organisation_id, client_id);
create index jobs_organisation_client_property_idx on public.jobs (organisation_id, client_id, property_id);
create index jobs_archived_by_idx on public.jobs (organisation_id, archived_by_internal_user_id);
create index job_fields_organisation_job_idx on public.job_fields (organisation_id, job_id);
create index job_fields_organisation_field_idx on public.job_fields (organisation_id, field_id);
create index job_fields_archived_by_idx on public.job_fields (organisation_id, archived_by_internal_user_id);
create index missions_organisation_job_idx on public.missions (organisation_id, job_id);
create index missions_organisation_location_idx on public.missions (organisation_id, operating_location_id);
create index missions_archived_by_idx on public.missions (organisation_id, archived_by_internal_user_id);
create index mission_versions_organisation_mission_idx on public.mission_versions (organisation_id, mission_id);
create index mission_versions_archived_by_idx on public.mission_versions (organisation_id, archived_by_internal_user_id);
create index audit_events_organisation_actor_idx on public.audit_events (organisation_id, actor_internal_user_id);
create index transactional_outbox_organisation_available_idx on public.transactional_outbox (organisation_id, available_at);

create or replace function public.current_user_has_organisation_access(p_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.memberships m
    join public.internal_users iu
      on iu.organisation_id = m.organisation_id
     and iu.id = m.internal_user_id
    where m.organisation_id = p_organisation_id
      and m.is_active = true
      and iu.is_active = true
      and iu.auth_user_id = auth.uid()
      and m.archived_at is null
      and iu.archived_at is null
  );
$$;

revoke all on function public.current_user_has_organisation_access(uuid) from public;
grant execute on function public.current_user_has_organisation_access(uuid) to authenticated;

alter table public.organisations enable row level security;
alter table public.organisations force row level security;
alter table public.operating_locations enable row level security;
alter table public.operating_locations force row level security;
alter table public.internal_users enable row level security;
alter table public.internal_users force row level security;
alter table public.memberships enable row level security;
alter table public.memberships force row level security;
alter table public.roles enable row level security;
alter table public.roles force row level security;
alter table public.permissions enable row level security;
alter table public.permissions force row level security;
alter table public.role_permissions enable row level security;
alter table public.role_permissions force row level security;
alter table public.clients enable row level security;
alter table public.clients force row level security;
alter table public.properties enable row level security;
alter table public.properties force row level security;
alter table public.field_boundary_versions enable row level security;
alter table public.field_boundary_versions force row level security;
alter table public.fields enable row level security;
alter table public.fields force row level security;
alter table public.jobs enable row level security;
alter table public.jobs force row level security;
alter table public.job_fields enable row level security;
alter table public.job_fields force row level security;
alter table public.missions enable row level security;
alter table public.missions force row level security;
alter table public.mission_versions enable row level security;
alter table public.mission_versions force row level security;
alter table public.audit_events enable row level security;
alter table public.audit_events force row level security;
alter table public.transactional_outbox enable row level security;
alter table public.transactional_outbox force row level security;

create policy organisations_tenant_access on public.organisations
  for all to authenticated
  using (public.current_user_has_organisation_access(organisation_id))
  with check (public.current_user_has_organisation_access(organisation_id));
create policy operating_locations_tenant_access on public.operating_locations
  for all to authenticated
  using (public.current_user_has_organisation_access(organisation_id))
  with check (public.current_user_has_organisation_access(organisation_id));
create policy internal_users_tenant_access on public.internal_users
  for select to authenticated
  using (public.current_user_has_organisation_access(organisation_id));
create policy memberships_tenant_access on public.memberships
  for select to authenticated
  using (public.current_user_has_organisation_access(organisation_id));
create policy roles_tenant_access on public.roles
  for select to authenticated
  using (public.current_user_has_organisation_access(organisation_id));
create policy permissions_tenant_access on public.permissions
  for select to authenticated
  using (public.current_user_has_organisation_access(organisation_id));
create policy role_permissions_tenant_access on public.role_permissions
  for select to authenticated
  using (public.current_user_has_organisation_access(organisation_id));
create policy clients_tenant_access on public.clients
  for all to authenticated
  using (public.current_user_has_organisation_access(organisation_id))
  with check (public.current_user_has_organisation_access(organisation_id));
create policy properties_tenant_access on public.properties
  for all to authenticated
  using (public.current_user_has_organisation_access(organisation_id))
  with check (public.current_user_has_organisation_access(organisation_id));
create policy field_boundary_versions_tenant_access on public.field_boundary_versions
  for all to authenticated
  using (public.current_user_has_organisation_access(organisation_id))
  with check (public.current_user_has_organisation_access(organisation_id));
create policy fields_tenant_access on public.fields
  for all to authenticated
  using (public.current_user_has_organisation_access(organisation_id))
  with check (public.current_user_has_organisation_access(organisation_id));
create policy jobs_tenant_access on public.jobs
  for all to authenticated
  using (public.current_user_has_organisation_access(organisation_id))
  with check (public.current_user_has_organisation_access(organisation_id));
create policy job_fields_tenant_access on public.job_fields
  for all to authenticated
  using (public.current_user_has_organisation_access(organisation_id))
  with check (public.current_user_has_organisation_access(organisation_id));
create policy missions_tenant_access on public.missions
  for all to authenticated
  using (public.current_user_has_organisation_access(organisation_id))
  with check (public.current_user_has_organisation_access(organisation_id));
create policy mission_versions_tenant_access on public.mission_versions
  for all to authenticated
  using (public.current_user_has_organisation_access(organisation_id))
  with check (public.current_user_has_organisation_access(organisation_id));
create policy audit_events_tenant_access on public.audit_events
  for select to authenticated
  using (public.current_user_has_organisation_access(organisation_id));
create policy audit_events_append on public.audit_events
  for insert to authenticated
  with check (public.current_user_has_organisation_access(organisation_id));
create policy transactional_outbox_tenant_access on public.transactional_outbox
  for select to authenticated
  using (public.current_user_has_organisation_access(organisation_id));
create policy transactional_outbox_append on public.transactional_outbox
  for insert to authenticated
  with check (public.current_user_has_organisation_access(organisation_id));

create trigger organisations_set_update_metadata before update on public.organisations for each row execute function public.set_tenant_row_update_metadata();
create trigger operating_locations_set_update_metadata before update on public.operating_locations for each row execute function public.set_tenant_row_update_metadata();
create trigger internal_users_set_update_metadata before update on public.internal_users for each row execute function public.set_tenant_row_update_metadata();
create trigger memberships_set_update_metadata before update on public.memberships for each row execute function public.set_tenant_row_update_metadata();
create trigger roles_set_update_metadata before update on public.roles for each row execute function public.set_tenant_row_update_metadata();
create trigger permissions_set_update_metadata before update on public.permissions for each row execute function public.set_tenant_row_update_metadata();
create trigger role_permissions_set_update_metadata before update on public.role_permissions for each row execute function public.set_tenant_row_update_metadata();
create trigger clients_set_update_metadata before update on public.clients for each row execute function public.set_tenant_row_update_metadata();
create trigger properties_set_update_metadata before update on public.properties for each row execute function public.set_tenant_row_update_metadata();
create trigger field_boundary_versions_set_update_metadata before update on public.field_boundary_versions for each row execute function public.set_tenant_row_update_metadata();
create trigger fields_set_update_metadata before update on public.fields for each row execute function public.set_tenant_row_update_metadata();
create trigger jobs_set_update_metadata before update on public.jobs for each row execute function public.set_tenant_row_update_metadata();
create trigger job_fields_set_update_metadata before update on public.job_fields for each row execute function public.set_tenant_row_update_metadata();
create trigger missions_set_update_metadata before update on public.missions for each row execute function public.set_tenant_row_update_metadata();
create trigger mission_versions_set_update_metadata before update on public.mission_versions for each row execute function public.set_tenant_row_update_metadata();
create trigger audit_events_reject_mutation before update or delete on public.audit_events for each row execute function public.reject_append_only_mutation();
create trigger transactional_outbox_reject_mutation before update or delete on public.transactional_outbox for each row execute function public.reject_append_only_mutation();

grant select, insert, update, delete on table public.organisations to authenticated;
grant select, insert, update, delete on table public.operating_locations to authenticated;
grant select, insert, update, delete on table public.clients to authenticated;
grant select, insert, update, delete on table public.properties to authenticated;
grant select, insert, update, delete on table public.field_boundary_versions to authenticated;
grant select, insert, update, delete on table public.fields to authenticated;
grant select, insert, update, delete on table public.jobs to authenticated;
grant select, insert, update, delete on table public.job_fields to authenticated;
grant select, insert, update, delete on table public.missions to authenticated;
grant select, insert, update, delete on table public.mission_versions to authenticated;
revoke all on table public.internal_users from authenticated;
revoke all on table public.memberships from authenticated;
revoke all on table public.roles from authenticated;
revoke all on table public.permissions from authenticated;
revoke all on table public.role_permissions from authenticated;
revoke all on table public.internal_users from anon;
revoke all on table public.memberships from anon;
revoke all on table public.roles from anon;
revoke all on table public.permissions from anon;
revoke all on table public.role_permissions from anon;
grant select, insert, update, delete on table public.internal_users to service_role;
grant select, insert, update, delete on table public.memberships to service_role;
grant select, insert, update, delete on table public.roles to service_role;
grant select, insert, update, delete on table public.permissions to service_role;
grant select, insert, update, delete on table public.role_permissions to service_role;
revoke all on table public.audit_events from anon, authenticated;
revoke update, delete on table public.audit_events from authenticated;
grant select, insert on table public.audit_events to authenticated;
revoke all on table public.transactional_outbox from anon, authenticated;
revoke update, delete on table public.transactional_outbox from authenticated;
grant select, insert on table public.transactional_outbox to authenticated;
