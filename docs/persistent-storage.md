# Authenticated Persistent Storage

Remote mode uses Supabase Auth plus tenant-scoped server storage. Browser code
never receives the Supabase service-role key or access token; authentication is
held in secure, HTTP-only cookies.

## Persisted Workflow Data

- `ftf_missions`
- `ftf_mission_templates`
- `ftf_aircraft_data`
- `ftf_pmav_checks`

Every row has a `tenant_id`. Contractors receive their own tenant, clients join
the contractor tenant identified by their invite code, and an administrator is
assigned to a tenant when its profile is created.

## Supabase Schema

Run this in the Supabase SQL editor. The `drop constraint` and null-row cleanup
migrate the earlier pre-beta prototype table; prototype rows without an owner
are intentionally discarded because they cannot be assigned safely.

```sql
create table if not exists public.ftf_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null,
  role text not null check (role in ('admin', 'contractor', 'client')),
  name text not null,
  invite_code text unique,
  contractor_id uuid references auth.users(id) on delete set null,
  client_record_id text,
  tier text not null default 'free' check (tier in ('free', 'pro')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ftf_store (
  tenant_id uuid,
  collection text not null,
  record_id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.ftf_store add column if not exists tenant_id uuid;
delete from public.ftf_store where tenant_id is null;
alter table public.ftf_store alter column tenant_id set not null;
alter table public.ftf_store drop constraint if exists ftf_store_pkey;
alter table public.ftf_store
  add constraint ftf_store_pkey primary key (tenant_id, collection, record_id);

create index if not exists ftf_store_tenant_collection_updated_idx
  on public.ftf_store (tenant_id, collection, updated_at desc);

alter table public.ftf_profiles enable row level security;
alter table public.ftf_store enable row level security;
```

No public RLS policies are required. The browser cannot query these tables;
authenticated Vercel functions validate the Supabase user and profile before
using the service role for a tenant-scoped query.

## Create The First Admin

1. In Supabase, open **Authentication > Users** and add the admin user.
2. Confirm the email or use the dashboard's auto-confirm option.
3. Run the following SQL, changing the email and name as needed:

```sql
insert into public.ftf_profiles (user_id, tenant_id, role, name, tier)
select id, id, 'admin', 'Fly the Farm', 'pro'
from auth.users
where email = 'admin@flythefarm.com.au'
on conflict (user_id) do update set
  tenant_id = excluded.tenant_id,
  role = excluded.role,
  name = excluded.name,
  tier = excluded.tier;
```

To place an admin inside an existing contractor tenant, use that contractor's
`user_id` as the admin profile's `tenant_id` instead.

## Vercel Environment Variables

Set these for Production and Preview:

```text
VITE_PERSISTENCE_MODE=remote
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_ANON_OR_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_OR_SECRET_KEY
```

Only the exact `VITE_PERSISTENCE_MODE` value is allowlisted into the browser
bundle. Vite's automatic client environment namespace is disabled, and both
Supabase keys remain server-side. Existing deployments that still define
`REACT_APP_PERSISTENCE_MODE` are read only as a temporary build-time
compatibility fallback; new and updated deployments must use
`VITE_PERSISTENCE_MODE`.

Supabase enables email confirmation by default. With confirmation enabled, a
new user is sent to sign in after confirming their email. For a controlled beta,
confirmation can be disabled in **Authentication > Sign In / Providers > Email**.

## Local Development

Leave `VITE_PERSISTENCE_MODE=local`. Local mode retains the seeded demo
admin account and browser storage, so normal local development does not need a
Supabase project.

To exercise remote mode locally, place all four remote variables in
`.env.local`, restart `npm start`, and use a Supabase Auth account with an
`ftf_profiles` row.

## Failure And Concurrency Behaviour

- Remote authentication and storage failures are surfaced to the UI; they do
  not masquerade as successful shared saves.
- Mission workflow storage is available only to authenticated admin and
  contractor accounts; client accounts cannot call it directly.
- Browser caches are scoped by authenticated user.
- Collection writes upsert individual records and never delete unrelated rows.
- Mission and template deletion targets one tenant-owned record explicitly.
- The API rejects unauthenticated requests and unknown collection names.
