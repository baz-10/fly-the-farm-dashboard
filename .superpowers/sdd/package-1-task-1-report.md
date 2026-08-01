# Package 1 Task 1 report

## Files changed

- `supabase/migrations/20260801000000_production_beta_foundation.sql`
- `supabase/README.md`
- `src/__tests__/productionSchemaMigration.test.js`

## TDD red tests

1. `CI=true npm test -- --runInBand src/__tests__/productionSchemaMigration.test.js`
   initially failed with `ENOENT` for the missing repository-controlled migration.
2. The authenticated-role grant test then failed because no grant statements
   existed for `public.organisations` (and the other mutable tenant tables).

Both failures were expected: they named the missing schema artifact and the
missing application-role access contract before the corresponding SQL was added.

## Green verification

- `CI=true npm test -- --runInBand src/__tests__/productionSchemaMigration.test.js`
  — 1 suite, 5 tests passed.
- `CI=true npm test -- --runInBand` — 35 suites, 158 tests passed.
- `npm run build` — exit 0. Existing unrelated ESLint/Browserslist warnings remain.
- `git diff --check` — exit 0.

## Self-review

- Added UUID keys, timestamps, archive markers, and optimistic row versions to
  mutable organisation-scoped records.
- Enforced the operational relationship chain with composite
  `(organisation_id, id)` foreign keys, and indexed each foreign-key/listing
  path.
- Enabled and forced RLS on all new tenant tables. Access derives from
  `auth.uid()` through active internal-user and membership records; no policy
  accepts a browser-supplied organisation entitlement.
- Protected audit and outbox rows with insert/select-only authenticated grants,
  insert-only RLS policies, and mutation-rejecting triggers.
- Kept `ftf_profiles` and `ftf_store` unchanged and did not touch frontend code.

## Concerns

- This workspace has no local PostgreSQL client, Docker daemon, or Supabase CLI,
  so the executable migration contract validates the SQL schema contract
  structurally rather than applying it to a live PostgreSQL instance. Apply the
  migration to a Supabase staging project before production rollout to validate
  database execution and live RLS behaviour.

## Review remediation (round 1)

### Files changed

- `supabase/migrations/20260801000000_production_beta_foundation.sql`
- `supabase/README.md`
- `src/__tests__/productionSchemaMigration.test.js`
- `.superpowers/sdd/package-1-task-1-report.md`

### TDD red tests

`CI=true npm test -- --runInBand src/__tests__/productionSchemaMigration.test.js`
first failed because the migration lacked the property/client and
property/boundary composite consistency constraints, archive-actor composite
foreign keys, and authenticated-role revocations for authorization tables. A
second red run failed because the `anon` role had not been explicitly revoked
from those authorization tables.

### Green verification

- `CI=true npm test -- --runInBand src/__tests__/productionSchemaMigration.test.js`
  — 1 suite, 6 tests passed.
- `CI=true npm test -- --runInBand` — 35 suites, 159 tests passed.
- `npm run build` — exit 0 with existing unrelated ESLint/Browserslist warnings.
- `git diff --check` — run before commit.

### Self-review

- Authorization tables now revoke all `anon` and `authenticated` privileges,
  provide select-only RLS policies, and grant CRUD only to `service_role` for
  trusted server-side administration.
- Every mutable table's archive actor uses a composite tenant foreign key to
  `internal_users`, with a supporting index.
- Jobs now require the property to belong to their client, and fields require
  the boundary version to belong to their property.
- Repository migration deployment via the trusted pipeline is the documented
  production path; the SQL Editor is explicitly excluded.

### Cutover gate

Staging live-database validation remains mandatory before production cutover:
apply the repository migration in staging and exercise cross-tenant foreign-key
rejection, authorization-table write denial for browser roles, archive actor
tenant rejection, relationship mismatch rejection, and live RLS behavior.
