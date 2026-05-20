# Persistent Storage

The beta mission workflow can now use shared server-backed storage while still
falling back to browser `localStorage` for local development.

## What Is Persisted

The first shared-storage slice covers the workflow-critical browser stores:

- `ftf_missions`
- `ftf_mission_templates`
- `ftf_aircraft_data`
- `ftf_pmav_checks`

Other demo/admin stores still use browser-local storage until they are promoted
into the production workflow.

## Supabase Schema

Create a Supabase project, open the SQL editor, and run:

```sql
create table if not exists public.ftf_store (
  collection text not null,
  record_id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (collection, record_id)
);

create index if not exists ftf_store_collection_updated_idx
  on public.ftf_store (collection, updated_at desc);

alter table public.ftf_store enable row level security;
```

The app writes through the Vercel API using the Supabase service-role key, so no
public RLS policy is required for this first beta slice.

## Vercel Environment Variables

Set these in the Vercel project:

```text
REACT_APP_PERSISTENCE_MODE=remote
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. Do not expose it as a
`REACT_APP_` variable.

## Local Development

Leave `REACT_APP_PERSISTENCE_MODE=local` for ordinary local development. The app
will keep using browser storage.

To test the remote path locally, set the three variables above in `.env.local`
and restart `npm start`.

## Migration Behavior

When remote mode is enabled:

1. The app reads from Supabase first.
2. If Supabase has no records for a collection but the current browser has local
   records, the app seeds Supabase from that browser once.
3. If Supabase is unavailable or not configured, the app logs a warning and
   continues with local storage.

This is intentionally conservative for beta testing: it gives shared persistence
without blocking testers if the backend is temporarily misconfigured.
