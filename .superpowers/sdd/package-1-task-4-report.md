# Package 1 Task 4 report — Live-chain backend prerequisites

## Status

Implemented the backend-only prerequisites for the authoritative Field → Job →
Mission chain. Existing frontend screens and legacy APIs remain unchanged.
Committed migrations were not edited; the work adds forward migrations
`20260801006000_live_chain_access_prerequisites.sql` and
`20260801007000_live_chain_workflow_prerequisites.sql`.

## Reviewable slices

### Slice 1 — operating locations, seats, and session scope

Commit `7030c4e` adds:

- `/api/v1/operating-locations` list/get/create/update/archive support through
  the existing organisation-derived trusted handler;
- organisation seat allocations, explicit internal-user/membership seat
  assignments, and membership/location assignments;
- a traceable migration for existing active internal beta members plus the
  service-role-only `ftf_seed_internal_beta_access` controlled seed command;
- default-deny request context for missing, inactive, revoked, or unallocated
  seats, with real active `operatingLocationIds` returned by session context;
- API and RPC enforcement that missions use an active same-organisation
  location explicitly assigned to the actor;
- deterministic organisation advisory locks, trusted location writes, archive
  dependency enforcement, and atomic audit/outbox records.

### Slice 2 — boundaries, job fields, and Planning missions

The second slice adds:

- `/api/v1/field-boundary-versions` create/get/list support by field/property;
- strict Polygon/MultiPolygon structure, coordinate/ring, and 256 KiB payload
  validation at both HTTP and trusted PostgreSQL command boundaries;
- immutable field boundary versions linked to a field, with an atomic update
  of the field's current version under `expectedFieldVersion` concurrency;
- job `scope`, `notes`, `requested_date`, and `scheduled_date` columns;
- one-to-100 unique field IDs on job create/update, active same-property parent
  locking, atomic `job_fields` replacement, returned `fieldIds`, and rollback on
  relationship or row-version conflicts;
- immutable client/property identity for an existing job so archived
  `job_fields` retain their original composite relationship integrity;
- mission `title` and `description` fields in addition to existing job,
  operating location, number, scheduled start, and status fields;
- Planning-only mission create/update at the HTTP and RPC layers, including
  rejection of updates to missions already outside Planning;
- service-role-only command execution, direct browser DML denial, immutable
  boundary rows, and atomic audit/outbox events.

## TDD red evidence

1. `CI=true npm test -- --runInBand src/__tests__/liveChainAccessApi.test.js src/__tests__/liveChainBackendPglite.test.js`
   first failed 7 tests: session returned no seat/location scope, inactive,
   revoked, and absent seats were accepted, operating locations were not an API
   resource, off-scope missions reached repository checks, and the PGlite
   runner/migration did not exist.
2. `CI=true npm test -- --runInBand src/__tests__/liveChainWorkflowApi.test.js src/__tests__/liveChainBackendPglite.test.js`
   first failed 10 tests: the boundary handler and `070` migration were absent,
   jobs rejected workflow/field data and omitted joined fields, and missions
   rejected title/description.
3. The existing backend regression checkpoint then exposed one stale job-create
   fixture without the newly required field selection; the fixture was updated
   to represent the approved one-or-more-field contract.
4. A focused PostgreSQL regression reproduced a job-property move failing only
   at deferred composite-FK validation. Root cause was archived historical
   `job_fields` retaining the original property. The trusted update now returns
   a controlled relationship conflict before mutation and the composite FK is
   not weakened.

## Verification

- Focused access cycle:
  `CI=true npm test -- --runInBand src/__tests__/liveChainAccessApi.test.js src/__tests__/liveChainBackendPglite.test.js`
  — 2 suites, 9 tests passed.
- Focused workflow cycle:
  `CI=true npm test -- --runInBand src/__tests__/liveChainWorkflowApi.test.js src/__tests__/liveChainBackendPglite.test.js`
  — 2 suites, 11 tests passed.
- Backend regression gate: access/workflow tests plus the existing trusted API,
  schema PGlite, write, correction, parent-guard, lock-protocol, and property
  state suites — 10 suites, 42 tests passed.
- Full repository:
  `CI=true npm test -- --runInBand` — 49 suites, 248 tests passed, 0 failed.
- Production build: `npm run build` — exit 0. The build retains pre-existing
  repository-wide ESLint, Browserslist-age, and bundle-size warnings; no Task 4
  compile error was reported.
- `git diff --check` — exit 0 before report/commit.

## PGlite behavior coverage

The repository runner applies all migrations in order and executes real
PostgreSQL behavior for:

- traceable migration of existing active members and the controlled beta seed;
- unseeded and revoked-seat trusted-write denial;
- active location assignment, cross-organisation location hiding, and archive
  rejection with an active mission;
- trusted location audit/outbox atomicity and browser table-DML denial;
- invalid and oversized GeoJSON rejection, Polygon and MultiPolygon creation,
  stale boundary conflict without an extra version, current-field update, and
  boundary audit/outbox atomicity;
- multi-field job create/update, off-property field rejection with rollback,
  stale-version rollback, workflow-field persistence, and field-ID responses;
- unassigned-location mission denial, safe Planning metadata, approval write
  rejection, non-Planning update denial, and mission audit/outbox atomicity;
- immutable boundary rows and authenticated direct DML denial for boundary and
  job-field tables.

## Self-review and staging gates

- Organisation identity is never accepted from operating-location or workflow
  request bodies; every read and write uses server-derived organisation scope.
- Boundary input accepts coordinates only. Provider URLs, browser data URLs,
  arbitrary GeoJSON properties, and unsupported payload blobs are rejected.
- Job endpoints accept only the approved workflow fields. Chemical, weather,
  and financial payloads remain unsupported and are rejected rather than
  silently stored or discarded.
- Generic mission writes cannot approve or authorise a mission and cannot
  downgrade a mission already outside Planning.
- All trusted commands take the organisation advisory lock before target and
  parent row locks; multi-field locks are ordered by UUID.
- Production cutover requires applying both forward migrations in Supabase
  staging, then validating real service-role function grants, RLS/browser DML
  denial, auth-cookie session seat/location resolution, role-permission seed
  coverage, and two-session same-organisation lock contention. PGlite verifies
  transaction behavior but does not provide the deployed PostgREST/RLS or
  meaningful multi-connection contention environment.
- Existing active accounts are covered by the traceable migration. Accounts or
  locations created after migration must use the controlled internal beta seed
  (or later trusted administration workflow) before operational access.

Requirement references: NEW-001, NEW-002, NEW-003, NEW-004, NEW-005, NEW-006,
NEW-007, NEW-008, NEW-020, REP-001, REP-002, REP-003, REP-004, RET-003,
RET-004, RET-005, RET-006, RET-007, RET-008.

## Review fix round 1 — 2026-08-01

The review fixes are delivered as the forward-only
`20260801008000_live_chain_review_fixes.sql` migration; the committed `060` and
`070` migrations remain unchanged.

### Review findings addressed

- Generic field create/update rejects `fieldBoundaryVersionId` at the HTTP
  boundary and `field_boundary_version_id` at the trusted SQL boundary. The
  existing pointer is preserved on ordinary field updates, so only the trusted
  boundary-version command can advance it.
- The current field pointer now has an exact same-organisation, same-property,
  same-field composite foreign key to its immutable boundary version.
- Pre-`070` shared current boundaries are repaired deterministically: `070`'s
  selected owner retains the source, each additional field receives an
  immutable duplicate, and its pointer is updated to that duplicate.
- Legacy unassigned boundary versions remain preserved. Each is recorded in
  append-only `operational_migration_issues` with a policy marker and is
  excluded from operational field history rather than assigned by guesswork.
- Request context and trusted PostgreSQL commands rank active assignments by
  `(assigned_at, id)` and reject assignments beyond the current allocation,
  including after an allocation reduction.
- Boundary list/get now call the service-role-only
  `ftf_read_field_boundary_versions` RPC. The RPC joins active boundary,
  same-field, and property rows, so archived parents return no history/404.
- Each public trusted write wrapper takes the organisation advisory lock, then
  row-locks and rechecks the active organisation in the same transaction.
  Generic and boundary writes also recheck the capacity-aware actor seat.
- Job date validation now rejects impossible calendar dates rather than only
  validating the `YYYY-MM-DD` shape.

### Review-fix TDD evidence

The first focused run of
`CI=true npm test -- --runInBand src/__tests__/liveChainFixRoundApi.test.js src/__tests__/liveChainBackendPglite.test.js`
failed 7 tests: field pointer injection reached the repository, impossible
dates reached PostgreSQL, an over-capacity request context was accepted,
boundary reads used the table endpoint, and the `080` migration was absent.

After implementing the HTTP/repository changes and the forward migration, the
PGlite verifier exposed one remaining failure:
`oversubscribed actor trusted write was accepted`. The inherited wrapper still
used its older inline positive-seat check. The public wrappers now enforce the
capacity-aware helper after acquiring the organisation locks.

### Review-fix verification

- PGlite migration/behavior verifier:
  `node scripts/verifyLiveChainBackendMigration.mjs` — exit 0.
- Focused review-fix gate — 2 suites, 7 tests passed.
- Backend regression gate — 11 suites, 48 tests passed.
- Full repository: `CI=true npm test -- --runInBand` — 50 suites, 254 tests
  passed, 0 failed.
- Production build: `npm run build` — exit 0. The build reports the same
  pre-existing repository-wide ESLint, stale Browserslist, and bundle-size
  warnings; no review-fix compile error was reported.

Review-fix requirement references: NEW-001, NEW-002, NEW-003, NEW-004,
NEW-005, NEW-006, NEW-007, NEW-008, NEW-020, REP-001, REP-002, REP-003,
REP-004, RET-003, RET-004, RET-005, RET-006, RET-007, RET-008.

## Review fix round 2 — 2026-08-01

The second review correction is isolated in the forward-only
`20260801009000_live_chain_review_followup.sql` migration. Migrations `060`
through `080` remain unchanged.

### Review findings addressed

- `ftf_read_field_boundary_versions` now joins the exact organisation and
  requires `organisations.archived_at IS NULL`. A service request using context
  resolved before archival therefore receives no boundary rows, and the HTTP
  get handler returns 404.
- `operational_migration_issues` remains an immutable observation ledger. New
  resolution activity is stored as immutable events in
  `boundary_migration_issue_resolutions`, linked to the exact same-organisation
  issue and resolving internal user.
- Resolution events can only be inserted through the service-role-only
  `ftf_record_boundary_migration_issue_resolution` command. The command follows
  the trusted-write lock order, rechecks the active organisation and actor seat,
  and accepts only object details. Direct service/browser inserts and all
  updates/deletes are rejected.
- The legacy `operational_migration_issues.resolved_at` values remain preserved
  as insert-time migration evidence; they are not used as a mutable resolution
  channel.

### Review-fix TDD evidence

1. The archived-organisation regression first failed with
   `boundary read returned data after its organisation was archived`; the API
   stale-context characterization already mapped an empty RPC result to 404.
2. After the active-organisation RPC fix passed, the resolution-event cycle
   first failed with PostgreSQL error `42883` because
   `ftf_record_boundary_migration_issue_resolution` did not exist.
3. The completed focused gate passed 2 suites and 8 tests.

### Review-fix verification

- Backend regression gate — 11 suites, 49 tests passed.
- Full repository: `CI=true npm test -- --runInBand` — 50 suites, 255 tests
  passed, 0 failed.
- Production build: `npm run build` — exit 0 with the pre-existing ESLint,
  Browserslist-age, and bundle-size warnings.

Review-fix requirement references: NEW-001, NEW-002, NEW-003, NEW-004,
NEW-005, NEW-006, NEW-007, NEW-008, NEW-020, REP-001, REP-002, REP-003,
REP-004, RET-003, RET-004, RET-005, RET-006, RET-007, RET-008.
