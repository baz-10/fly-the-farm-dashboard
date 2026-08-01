-- Server-only compatibility tables required by the existing authentication and
-- non-operational shared-storage adapters. These remain subordinate to the
-- organisation model and are not browser database APIs.

create table if not exists public.ftf_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tenant_id uuid not null references public.organisations (id) on delete restrict,
  role text not null check (role in ('admin', 'contractor', 'client')),
  name text not null check (length(btrim(name)) > 0),
  invite_code text unique,
  contractor_id uuid,
  client_record_id uuid,
  tier text not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id),
  foreign key (tenant_id, contractor_id)
    references public.ftf_profiles (tenant_id, user_id) on delete restrict,
  foreign key (tenant_id, client_record_id)
    references public.clients (organisation_id, id) on delete restrict
);

create index if not exists ftf_profiles_tenant_idx
  on public.ftf_profiles (tenant_id, user_id);
create index if not exists ftf_profiles_contractor_idx
  on public.ftf_profiles (tenant_id, contractor_id);
create index if not exists ftf_profiles_client_record_idx
  on public.ftf_profiles (tenant_id, client_record_id);

create table if not exists public.ftf_store (
  tenant_id uuid not null references public.organisations (id) on delete restrict,
  collection text not null check (length(collection) between 1 and 160),
  record_id text not null check (length(record_id) between 1 and 160),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, collection, record_id)
);

create index if not exists ftf_store_tenant_collection_updated_idx
  on public.ftf_store (tenant_id, collection, updated_at desc);

create or replace function public.set_legacy_runtime_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ftf_profiles_set_updated_at on public.ftf_profiles;
create trigger ftf_profiles_set_updated_at
before update on public.ftf_profiles
for each row execute function public.set_legacy_runtime_updated_at();

drop trigger if exists ftf_store_set_updated_at on public.ftf_store;
create trigger ftf_store_set_updated_at
before update on public.ftf_store
for each row execute function public.set_legacy_runtime_updated_at();

alter table public.ftf_profiles enable row level security;
alter table public.ftf_profiles force row level security;
alter table public.ftf_store enable row level security;
alter table public.ftf_store force row level security;

revoke all on table public.ftf_profiles from public, anon, authenticated;
revoke all on table public.ftf_store from public, anon, authenticated;
grant select, insert, update, delete on table public.ftf_profiles to service_role;
grant select, insert, update, delete on table public.ftf_store to service_role;

revoke all on function public.set_legacy_runtime_updated_at() from public, anon, authenticated;
grant execute on function public.set_legacy_runtime_updated_at() to service_role;
