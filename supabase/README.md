# Supabase production beta migration

Production deployments apply the repository migration with `supabase db push` from the trusted deployment pipeline. Do not use the Supabase SQL Editor as the production migration path. Verify the migration is present in `supabase_migrations.schema_migrations`, then run:

```sh
CI=true npm test -- --runInBand src/__tests__/productionSchemaMigration.test.js
```

The migration adds new `public` tables only. It does not alter `ftf_profiles` or `ftf_store`. Initial organisation, internal-user, membership, role, and permission bootstrap data must be created by a trusted server-side deployment/admin process; authenticated browser clients cannot self-assign an organisation.

Internal-user, membership, role, permission, and role-permission tables are server-only. Browser roles have no grants or RLS policies on these authorization records; trusted server-side `service_role` processes perform their administration.
