# Safety Plan Task 2 Report

## Status

Complete.

Implementation commits:

- `962b6f5` — `feat: secure Safety Plan storage`
- `f82f8d1` — `fix: enforce append-only safety audit inserts`

## Delivered

- Added client permission helpers for authority, edit, approval and deletion
  decisions.
- Added `safetyPlanAuthority` to authenticated profiles, public users, local
  accounts and cached sessions, with a fail-closed default of `false`.
- Added an idempotent Supabase profile migration without changing grants or
  row-level security.
- Replaced the global storage role check with explicit per-collection read and
  write policies while retaining the existing admin/contractor policy for all
  historical collections.
- Added tenant-scoped Safety Plan template, plan and audit collections.
- Added server-authoritative Safety Plan validation for tenant and identity
  changes, workflow authority, immutable approved/superseded snapshots,
  version removal, unique IDs and optimistic revisions.
- Safety Plan list writes load and validate every incoming record against the
  stored record with the same ID before any write.
- Safety audit IDs are append-only. Writes use database inserts rather than
  conflict-merging upserts, and record or collection deletion is denied.
- Approved/superseded Safety Plan deletion and collection-wide Safety Plan
  deletion are denied at the server, including for administrators.
- Preserved contractor financial redaction and administrator-financial
  write-preservation behavior.
- Registered both new test suites as explicit post-baseline supplements. The
  historical baseline manifest was not changed.

## RED evidence

Initial command:

```bash
npx vitest run src/utils/__tests__/safetyPlanPermissions.test.ts src/__tests__/authenticated-auth-api.test.ts src/__tests__/authenticated-store-api.test.ts src/__tests__/authenticated-safety-plan-api.test.ts
```

Observed exit `1`: 3 files failed and 1 passed; 19 tests failed and 19 passed.
The permission module was absent, auth responses omitted authority metadata,
and Safety Plan collections were rejected or lacked the required policy and
transition behavior.

Duplicate-identity regression command:

```bash
npx vitest run src/__tests__/authenticated-safety-plan-api.test.ts
```

Observed exit `1`: 2 of 22 tests failed. Duplicate version IDs and duplicate
audit IDs were both accepted with HTTP 200 before the unique-ID validation was
added.

Atomic audit append regression command:

```bash
npx vitest run src/__tests__/authenticated-safety-plan-api.test.ts -t "allows new audit IDs to be appended"
```

Observed exit `1`: the audit write still used
`on_conflict=tenant_id,collection,record_id` with merge semantics. This proved
that a racing append could replace an existing audit ID before the dedicated
insert path was added.

## GREEN evidence

Focused permissions and API command:

```bash
npx vitest run src/utils/__tests__/safetyPlanPermissions.test.ts src/__tests__/authenticated-auth-api.test.ts src/__tests__/authenticated-store-api.test.ts src/__tests__/authenticated-safety-plan-api.test.ts
```

Result: exit `0`; 4 files passed, 48 tests passed.

TypeScript command:

```bash
npx tsc --noEmit
```

Result: exit `0`; no diagnostics.

Inventory command:

```bash
npx vitest run scripts/test-inventory.test.ts
```

Result: exit `0`; 1 file passed, 5 tests passed.

Full Vitest command:

```bash
npm test -- --run
```

Result: exit `0`; 64 files passed, 306 tests passed.

Formatting check:

```bash
git diff --check
```

Result: exit `0`; no whitespace errors.

## Files

- `api/store.js`
- `docs/supabase-safety-plan-migration.sql`
- `scripts/test-inventory.mjs`
- `scripts/test-inventory.test.ts`
- `server/session.js`
- `src/__tests__/authenticated-auth-api.test.ts`
- `src/__tests__/authenticated-safety-plan-api.test.ts`
- `src/contexts/AuthContext.tsx`
- `src/services/persistence.ts`
- `src/utils/__tests__/safetyPlanPermissions.test.ts`
- `src/utils/safetyPlanPermissions.ts`
- `.superpowers/sdd/safety-plan-task-2-report.md`

## Self-review

- Existing collections retain their original admin/contractor access and their
  contractor redaction/write-preservation path.
- Safety Plan policies fail closed for clients and template writes fail closed
  for contractors.
- Returned store rows are filtered against the authenticated tenant even after
  the tenant-filtered database query.
- Plan record IDs, plan IDs, job IDs, tenant IDs, current-version state,
  version IDs, status transitions and revisions are checked before writes.
- Approved content can only remain unchanged or be superseded by an authority;
  superseded content is fully immutable.
- Audit events validate tenant and record identity, reject duplicates before a
  batch insert, use non-upserting inserts for database conflict protection and
  cannot be deleted.
- No browser service-role access, direct storage grants or RLS relaxation was
  introduced.

## Concerns

- `docs/supabase-safety-plan-migration.sql` must be applied in each deployed
  Supabase environment before nominated contractor authority can be assigned.
- Plan revision validation currently performs the required server-side
  read/validate/write sequence. Task 3's repository/concurrency boundary should
  add database-atomic compare-and-swap semantics so two simultaneous valid
  writes cannot both pass the same stored revision.
- Recoverable draft deletion and its audit event remain repository workflow
  responsibilities for Task 3; this task enforces who may delete and ensures
  controlled versions are never physically deleted.
