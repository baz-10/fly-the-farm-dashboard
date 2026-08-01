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
