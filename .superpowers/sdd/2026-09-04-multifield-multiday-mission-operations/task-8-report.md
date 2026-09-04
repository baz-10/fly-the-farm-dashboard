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

## Round 1 Important-finding remediation — 2026-09-05

### Delivered

- Wrapped the existing legacy `ftf_complete_mission` boundary with a compatibility guard. A Mission with operating days now fails closed until every day is `SIGNED_OFF`, has immutable signed aircraft-day rows, has the exact governed aircraft set, and contains no flight/total mismatch. The renamed legacy implementation is no longer executable by the service role, so it cannot be used as a bypass.
- Added `ftf_complete_and_sign_off_mission_operating_day` as the normal repository/API completion command. It runs the existing day-completion checks, the governed `SIGNED_OFF` transition, signed-total marking, the existing Fleet meter command, and audit/outbox writes inside one rollback boundary. Its API requires all of `mission.operational.write`, `mission.completion.complete`, and `asset_meters.manage`; the former completion RPC is no longer service-role executable.
- Made Fleet projection chronological per aircraft. Every earlier participating day must already be signed, reconciled, and projected. Each aircraft obtains its own latest non-superseded meter baseline at or before the day's finish time; a later reading blocks a new historical projection. Existing source identities remain idempotent even after later days have projected, and every Fleet command result is checked before commit.
- Derived the exact unsigned-day aircraft set from the day-bound package revision's `source_manifest.aircraftAssignments`. Only the latest authoritative resource revision with `changedFromPlan: true` overrides that planned set. Supplied totals must have set equality, and every expected aircraft must have a current active Mission/Base assignment. Once a day is governed and signed, its immutable rows remain the historical authority instead of being retroactively changed by later resource revisions or assignment end dates.
- Kept resource-set corrections usable before sign-off: the checked, fully validated save command may remove superseded unsigned aircraft/flight draft children when the authoritative actual-resource set narrows, while direct deletion and every signed-row deletion remain blocked.
- Hardened Operational Evidence ingestion so filename extension, declared `fileType`, and Data URL MIME must agree. KMZ must be a real bounded ZIP with at most 100 unique safe member names, supported compression, bounded expansion, and a valid KML member. The opaque original bytes are still retained unchanged and no KML/KMZ field becomes regulatory time.
- Updated the adjacent Task 6 sign-off regression to assert the later Task 8 fail-closed rule, and moved signed day/Field immutability coverage into the executable Task 8 transaction scenario.

### TDD evidence

- RED was observed for all five review findings: omitted/extraneous aircraft sets were accepted; the later operating day could be completed before the earlier day; fake `PK` KMZ, MIME mismatch, and extension mismatch were stored; the legacy completion/API path did not expose the aircraft-day blocker; and the repository still called the non-atomic completion RPC.
- The executable migration scenario now covers package and changed-resource set authority, active assignment enforcement, chronological rollback with zero partial readings, independent 100/200 aircraft baselines advancing to 111/211, source-idempotent retries before and after later projections, immutable signed rows, legacy completion blocking, tenant scope, audit, and outbox evidence.
- Final focused and adjacent verification passed 9 suites and 76 tests, including both the Task 6 operating-day migration and Fleet meter migration suites:
  - `CI=true npm test -- --watchAll=false src/__tests__/missionAircraftDayActualsMigration.test.js src/__tests__/missionOperatingDaysMigration.test.js src/__tests__/assetRelationshipsMetersMigration.test.js src/components/mission/__tests__/MissionAircraftDayActuals.test.tsx src/__tests__/assetRelationshipsMetersApi.test.js src/__tests__/missionOperationalCloseoutApi.test.js src/__tests__/missionOperationsApi.test.js src/services/__tests__/missionOperationsApi.test.ts src/components/mission/__tests__/MissionOperationalCloseout.test.tsx`
- `npm run build` completed successfully after the round-fix changes. It retained only the repository's pre-existing lint warnings and stale Browserslist notice.
