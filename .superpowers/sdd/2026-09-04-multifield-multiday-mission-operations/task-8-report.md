# Task 8 Report — Aircraft-Day Actuals and Flight-Line Evidence

## Status

Implemented in the supplied isolated worktree. No Production application, database, storage bucket, or external service was contacted, and no subagents were used.

## Delivered

- Added normalized `mission_aircraft_day_actuals` and optional `mission_flight_actuals` children under the existing Mission operating-day/package authority. Canonical decimal strings are accepted only at four decimal places and stored as `numeric(10,4)`; excess precision is rejected before mutation.
- Made each aircraft's daily total authoritative. Total-only evidence is valid, flights-only evidence derives the server total from authoritative flight durations, and a supplied total plus flights is retained but blocks reconciliation and operating-day sign-off when the values differ.
- Kept aircraft hours distinct from elapsed Mission time: two aircraft at `10.0000` hours each project as `20.0000` aircraft hours.
- Added checked save, read, and reconcile RPCs plus trusted repository/API/client routes with exact request/response validation, organisation/Base/Mission/package/day/aircraft/Field/import scope checks, optimistic day versions, permissions, audit events, and transactional outbox events.
- Added the `MissionAircraftDayActuals` editor and embedded it in Operational Closeout by operating day. It supports daily totals without flight rows, optional flight details, mismatch visibility, fixed-scale client arithmetic, and read-only signed-off/completed evidence.
- Extended the existing closeout import path for KML and opaque KMZ originals. One immutable file may have multiple bounded day/aircraft links with explicit `OPERATOR_CONFIRMED` or `SOURCE_METADATA` confidence. Geometry parsing remains limited to geometry statistics and never supplies regulatory time.
- Extended the existing evidence storage bucket MIME allow-list for KMZ and preserved cleanup when the authoritative import command rejects a stored object.
- Added signed-off Fleet projection through the existing `ftf_write_asset_maintenance_command`. Projection requires the exact signed-off day plus completion and meter permissions and is idempotent on `source_system = 'mission_aircraft_day_actual'` and the aircraft-day actual id. A flight may cite an import only when that file is explicitly attributed to the exact day and aircraft.

## TDD evidence

### RED

1. The migration suite failed because the Task 8 migration did not exist.
2. The component suite failed because `MissionAircraftDayActuals` did not exist.
3. Server and client tests failed because aircraft-actual save/read/reconcile routes and decoders did not exist.
4. Closeout tests failed because multi-attribution and KMZ imports were unsupported.
5. A focused regression test failed when the storage bucket did not permit the KMZ MIME type.
6. Executable PostgreSQL tests failed when a mismatched day could transition to `SIGNED_OFF` and when a flight could cite an import attributed to a different day/aircraft. Both authority gaps now fail closed without partial writes.

### GREEN

- Final focused and adjacent verification passed: 7 suites, 58 tests.
  - `CI=true npm test -- --watchAll=false src/__tests__/missionAircraftDayActualsMigration.test.js src/components/mission/__tests__/MissionAircraftDayActuals.test.tsx src/__tests__/assetRelationshipsMetersApi.test.js src/__tests__/missionOperationalCloseoutApi.test.js src/__tests__/missionOperationsApi.test.js src/services/__tests__/missionOperationsApi.test.ts src/components/mission/__tests__/MissionOperationalCloseout.test.tsx`
- The migration test executes the repository migration chain in PGlite and covers total-only, flights-only, reconciled/mismatched authority, two-aircraft aggregation, excess precision, tenant/permission scope, sign-off blocking, exact source attribution, immutable evidence, Fleet idempotency, audit, and outbox behavior.
- `npm run build` completed successfully after the final changes.
- `git diff --check` passed.

## Self-review and concerns

- Normalized rows are limited to evidence that JSON revisions cannot safely govern: independently scoped aircraft/day totals, optional flights, and append-only file attributions. Operational Closeout and Fleet meters remain the parent and downstream authorities.
- Fleet projection is intentionally exposed as a signed-off-day database command rather than an import-side effect. It refuses draft/completed-but-unsigned days and does not infer any time from KML/KMZ. The later operating-day sign-off orchestration should invoke this command after establishing `SIGNED_OFF`.
- The build reports the repository's existing lint-warning backlog and stale Browserslist-data notice. No Task 8 file introduced a build warning.
