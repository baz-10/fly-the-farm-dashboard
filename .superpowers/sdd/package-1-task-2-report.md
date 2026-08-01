# Package 1 Task 2 report — Trusted organisation-scoped API foundation

## Files changed

- `api/v1/session.js`
- `api/v1/clients.js`, `api/v1/properties.js`, `api/v1/fields.js`, `api/v1/jobs.js`, `api/v1/missions.js`
- `server/request-context.js`
- `server/operational-api.js`
- `server/operational-repository.js`
- `supabase/migrations/20260801001000_trusted_operational_api_writes.sql`
- `scripts/verifyProductionSchemaMigration.mjs`
- `src/__tests__/trustedOperationalApi.test.js`
- `src/__tests__/operationalWriteMigration.test.js`

## TDD red/green evidence

1. `CI=true npm test -- --runInBand src/__tests__/trustedOperationalApi.test.js`
   initially failed because the trusted API modules did not exist. The focused
   test contract covered unauthenticated access, trusted organisation derivation,
   tenant relationship rejection, optimistic conflict metadata, archive
   dependencies, planning-only mission status, financial-field denial, and
   organisation-filtered repository access.
2. `CI=true npm test -- --runInBand src/__tests__/operationalWriteMigration.test.js`
   initially failed with `ENOENT` for the missing forward migration.
3. A follow-up repository relationship test failed with `Unsupported operational
   resource: operating_locations`, then passed after the repository's trusted
   relationship table allow-list was completed.
4. A malformed-JSON test failed with HTTP 500, then passed after the handler
   returned the validated HTTP 400 error envelope.
5. A multiple-organisation context test initially rejected an authenticated
   user whose first internal-user row lacked membership. Context resolution now
   selects only an internal-user organisation with an active membership.

Green commands:

- `CI=true npm test -- --runInBand src/__tests__/trustedOperationalApi.test.js src/__tests__/operationalWriteMigration.test.js src/__tests__/productionSchemaPglite.test.js` — 3 suites, 13 tests passed.
- `CI=true npm test -- --runInBand` — 38 suites, 172 tests passed.
- `npm run build` — exit 0. Existing frontend ESLint and Browserslist warnings remain unchanged.
- `git diff --check` — exit 0 before commit.

## Review remediation — round 3

### Forward-migration choice and lock protocol

Added `20260801004000_trusted_operational_lock_protocol.sql`; all earlier
migrations remain immutable. It renames the existing guarded RPC implementation
to a private, non-executable function and exposes a service-role-only wrapper.
The wrapper obtains `pg_advisory_xact_lock(hashtext(organisation_id))` before
calling the implementation, so every trusted create, update, and archive in one
organisation follows the same transaction-scoped lock protocol before any row
lock. Different organisations use different advisory keys and remain concurrent.

### TDD and verification

The new migration contract test initially failed with `ENOENT` before the
forward migration existed. The executable PGlite harness applies the migration
and invokes the wrapper through all existing RPC behavior checks, thereby
exercising the advisory-lock call and preserving archive/parent guards.

PGlite's in-process test harness has no independently connected sessions for a
meaningful two-session lock-contention test. A staging PostgreSQL cutover gate
is therefore required: run concurrent property-update vs job-create and
job-update transactions in the same organisation, verify one waits rather than
deadlocks, and verify a different-organisation write proceeds independently.
This report does not claim a local two-connection concurrency test.

- `CI=true npm test -- --runInBand src/__tests__/operationalLockProtocolMigration.test.js src/__tests__/productionSchemaPglite.test.js` — 2 suites, 2 tests passed.
- `CI=true npm test -- --runInBand` — 41 suites, 180 tests passed.
- `npm run build` — exit 0 with existing unrelated warnings.
- `git diff --check` — exit 0 before commit.

## Self-review

- New `/api/v1/session` and resource routes are additive; legacy `/api/store`
  and all frontend persistence flows remain unchanged.
- Request context derives the authenticated internal user, active membership,
  roles, permissions, organisation and legacy entitlement tier server-side.
  It ignores body/query identity, organisation, role, and permission values.
- The permission model is default-deny. Only explicitly granted resource actions
  are accepted; no role name grants implicit write access.
- Repository reads and relationship/dependency checks include the resolved
  organisation filter. Resource mappings are explicit whitelists, so JSON blobs
  and protected financial fields cannot pass through responses or writes.
- All writes call the forward-migration RPC. That function validates the active
  actor, applies the resource mutation with optimistic-version checking, and
  inserts the audit and transactional-outbox entries in the same transaction.
- Archives are controlled updates, and the server blocks an archive while its
  active dependent records exist. Mission writes only accept planning state.
- PGlite now applies the trusted API migrations and executes an atomic client write,
  verifying that its audit and outbox rows are created together.

## Concerns / cutover gates

- The foundation schema does not yet model membership-to-operating-location
  assignments or seat records. The session context therefore exposes no inferred
  location grants and treats the legacy profile tier as non-authorising metadata;
  add explicit tables before enforcing location-specific mission grants.
- The trusted RPC runs with `service_role` only. Supabase staging validation is
  required before rollout to verify deployed function privileges, RLS behavior,
  and seeded role-permission records for each production account type.
- Existing unrelated frontend ESLint/Browserslist warnings remain in the build;
  this server-only slice intentionally did not alter those workflows.

## Review remediation — round 1

### Forward-migration choice

The first trusted-API migration is committed and treated as immutable. This
round adds `20260801002000_trusted_operational_api_corrections.sql`, which is
applied after it in the executable migration harness; the original migration
was not rewritten.

### Changes

- Revoked direct `anon` and `authenticated` access to every operational table
  used by the spine, so browser REST cannot bypass trusted permissions,
  versions, lifecycle restrictions, archive validation, audit, or outbox.
  The trusted server continues through `service_role` and the RPC only.
- Replaced the RPC through the corrective migration. It locks the target row,
  makes every update/archive conditional on `row_version = p_expected_version`,
  distinguishes missing rows from version conflicts, and performs all direct
  active-dependency checks in the archive transaction.
- Expanded archive dependency checks: clients→properties/jobs;
  properties→fields/boundary versions/jobs; fields→job fields;
  jobs→job fields/missions; missions→mission versions.
- Permission resolution now limits role permissions to active roles and filters
  archived permissions. Seat state is `null` when not represented rather than
  inferred as active.
- Tightened full-origin validation, typed/format validation, and race-time
  RPC not-found/archival-conflict API mapping.

### TDD evidence

`CI=true npm test -- --runInBand src/__tests__/trustedOperationalApi.test.js src/__tests__/operationalWriteCorrectionMigration.test.js`
initially failed as expected for archived permission leakage, RPC not-found
being returned as HTTP 200, HTTP-vs-HTTPS same-host origin acceptance,
typed-invalid input being handled as HTTP 500, and the absent corrective
migration. The tests became green after the corrective migration and focused
server changes.

The PGlite harness now applies all three migrations and executes real behavior
checks for authenticated direct table-DML rejection, conditional concurrency
conflict metadata, missing-record detection, and transactional archive
dependency rejection.

### Green verification

- `CI=true npm test -- --runInBand src/__tests__/trustedOperationalApi.test.js src/__tests__/operationalWriteCorrectionMigration.test.js src/__tests__/productionSchemaPglite.test.js` — 3 suites, 17 tests passed.
- `CI=true npm test -- --runInBand` — 39 suites, 177 tests passed.
- `npm run build` — exit 0 with existing unrelated warnings.
- `git diff --check` — exit 0 before commit.

### Remaining concern

The SQL archive checks are authoritative for writes through this API/RPC. A
future schema slice should add database-level active-parent guards if new
trusted writers are introduced; direct browser DML is now revoked.

## Review remediation — round 2

### Forward-migration choice

Added `20260801003000_trusted_operational_parent_guards.sql`; the two earlier
trusted API migrations remain immutable. The PGlite harness applies all four
migrations in order.

### Change

The RPC now derives relationship parents from `p_data` for every create and
update, locks each required parent with `FOR UPDATE`, and requires the same
organisation plus `archived_at is null` before mutation. It covers
properties→clients, fields→properties/boundary versions, jobs→clients and the
matching property, and missions→jobs/operating locations. Boundary-version and
job-field resources remain explicitly outside this RPC/API slice. A failed
in-transaction parent guard returns `relationship_conflict`, which the server
maps to HTTP 409; target-record `not_found` remains HTTP 404.

### TDD and verification

The new API race-mapping and forward-migration contract tests first failed with
HTTP 201 for an RPC relationship conflict and `ENOENT` for the missing
migration. After the forward migration and response mapping:

- `CI=true npm test -- --runInBand src/__tests__/trustedOperationalApi.test.js src/__tests__/operationalParentGuardMigration.test.js src/__tests__/productionSchemaPglite.test.js` — 3 suites, 18 tests passed.
- The executable PGlite migration test now proves property/client,
  job/property-client, and mission/job writes are rejected after their active
  parent has been archived.
- `CI=true npm test -- --runInBand` — 40 suites, 179 tests passed.
- `npm run build` — exit 0 with existing unrelated warnings.
- `git diff --check` — exit 0 before commit.
