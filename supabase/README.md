# Supabase production beta migration

Apply repository migrations to the target Supabase project with `supabase db push`, or run the SQL migration in the Supabase SQL Editor once. Verify the migration is present in `supabase_migrations.schema_migrations`, then run:

```sh
CI=true npm test -- --runInBand src/__tests__/productionSchemaMigration.test.js
```

The migration adds new `public` tables only. It does not alter `ftf_profiles` or `ftf_store`. Initial organisation, internal-user, membership, role, and permission bootstrap data must be created by a trusted server-side deployment/admin process; authenticated browser clients cannot self-assign an organisation.
