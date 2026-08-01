# Package 1 Task 6 — Connect Planning mission workflows

## Status

Complete for the approved remote Planning mission slice. Local mission behavior remains on the existing `MissionContext` path.

## Commits

- `e227910` — `feat: add authoritative planning mission data layer`
- `444ebac` — `feat: connect authoritative planning mission screens`

## Delivered

- Extended the typed `/api/v1` browser adapter with complete supported mission metadata: job, operating location, mission number, title, description, scheduled start and status.
- Strictly validates mission envelopes, timestamps, versions and Planning lifecycle state. Lowercase trusted API `planning` is normalised to the frontend `Planning` label; any other returned lifecycle state is rejected before entering UI state.
- Mission create/update payloads explicitly whitelist the supported fields, emit server-compatible `planning`, and reject any generic frontend mutation that attempts Approved, ready, compliant or another lifecycle state before a request is made.
- Extended the operational gateway/provider/store to list, create, update and archive missions through `/api/v1`, alongside active operating locations.
- Provider authentication derives scope from `/api/v1/session`, reloads missions for every authorised session, ignores stale session results and clears missions synchronously on logout, user switch and tenant switch.
- Store load validation rejects missions whose job or active operating location is absent from the same authoritative response chain. Remote screen create/update is also limited to a loaded authoritative job and active operating location.
- Mission mutations await server confirmation before publishing record changes or saved confirmation. Updates send the confirmed row version, conflicts retain the last confirmed state, and archive removes a mission only after the trusted command resolves.
- Mission Register now has a remote-only authoritative branch with distinct loading, unavailable, unauthorised, valid-empty and populated states. It never reads `MissionContext` records in remote mode.
- Remote Mission Register cards show only Planning/not-ready language and authoritative job/location metadata. Authorised, compliant, ready-to-fly and operational status sections/actions are not presented.
- Mission Planning now has a remote-only create/detail/edit/archive branch. Direct `/missions/new`, `/missions/:missionId`, query-prefilled job creation and the job-chain route reload from operational provider state after authentication.
- Added `Create Mission` to authoritative Job Detail and the bookmark-safe route `/jobs/client/:clientId/property/:propertyId/field/:fieldId/job/:jobId/new-mission`.
- Remote Mission Planning preserves the existing visual language with structured mission details, parent-chain and operational-planning cards while clearly marking aircraft, equipment, personnel, chemicals, maps, weather, JSA, risk controls, authorisation, completion, pack and financials unavailable/not persisted.
- If a user enters an unsupported operational value in the remote planner, save is blocked with an explicit error instead of silently discarding the value.
- Remote archive uses explicit confirmation and waits for the server before returning to the register. Conflict, stale/unavailable, unauthorised, cross-tenant/not-found and inactive-location states remain visible and distinct.
- The local Mission Register and rich local Mission Planning implementation remain on the unchanged `MissionContext` workflow.

## TDD evidence

- Adapter/store RED: 2 suites ran with 37 passing and 6 expected failures for missing mission metadata/normalisation, non-Planning rejection, mission collection load, server-confirmed mutations and tenant clearing.
- Provider RED: 1 suite ran with 3 passing and 2 expected failures because mission list loading and second-session mission sourcing were not connected.
- Adapter/store/provider GREEN: `npm test -- --runInBand src/services/__tests__/operationalApi.test.ts src/services/__tests__/operationalDataStore.test.ts src/contexts/__tests__/OperationalDataContext.test.tsx` — 3 suites, 48 tests passed.
- Screen RED: after correcting a test-only Leaflet module stub, all 15 remote workflow tests failed because the pages still invoked legacy contexts; the separate Job Detail test failed because `Create Mission` did not exist.
- Screen GREEN: `npm test -- --runInBand src/pages/MissionRemoteWorkflow.test.tsx src/pages/OperationalWorkflow.test.tsx src/pages/MissionRegister.test.tsx src/App.test.tsx` — 4 suites, 48 tests passed.
- Broader integration: `npm test -- --runInBand src/pages/MissionRemoteWorkflow.test.tsx src/pages/MissionRegister.test.tsx src/pages/OperationalWorkflow.test.tsx src/services/__tests__/operationalApi.test.ts src/services/__tests__/operationalDataStore.test.ts src/contexts/__tests__/OperationalDataContext.test.tsx src/App.test.tsx` — 7 suites, 96 tests passed.
- Full non-watch suite: `CI=true npm test -- --runInBand --watchAll=false` — 51 suites, 299 tests passed, 0 failures. The only console output is intentional logging exercised by existing security-fix tests.
- Production build: `npm run build` — exit 0, compiled successfully with warnings.
- `git diff --check` — clean before implementation commits and report handoff.

## Remaining operational and deployment gates

- Mission authorisation, approval, readiness/compliance certification, flight execution and completion remain intentionally unavailable. They require authoritative aircraft, equipment, personnel, chemical, JSA/risk, map, weather, pack and financial dependency slices.
- Production must have the trusted mission title/description and Planning-only workflow migrations deployed, plus active membership-to-operating-location assignments and the required mission permissions.
- Deployment smoke testing should confirm `/api/v1/session`, `/api/v1/operating-locations` and `/api/v1/missions` against two real authorised tenant sessions, including direct URL refresh after re-authentication.
- Conflict/archive behavior should be smoke-tested against a live concurrent editor and active dependent `mission_versions` records.
- The build continues to report pre-existing repository-wide ESLint warnings, stale Browserslist data and bundle-size guidance. The existing local planner `loadMissionIntoPlanner` exhaustive-deps warning remains and is outside this remote adapter slice.
- No operational or authorisation dependency was added to this task; entered unsupported data is blocked rather than persisted.

## Requirement coverage

RET-006, RET-007, RET-008, IMP-004, IMP-005, IMP-006, NEW-001, NEW-003, NEW-005, NEW-006, NEW-007, NEW-008, REP-003, REP-004.

## Review fix round 1

### Delivered

- Preserves trusted `session.operatingLocationIds` through `OperationalDataProvider` and the operational store, including synchronous clearing on session changes.
- Filters loaded operating locations and missions to the active session assignments. Create/update rejects any location that is not both assigned and active.
- Scopes mission and operating-location list/get reads by assigned location in repository queries before pagination, with handler-level filtering as defense in depth. Cross-location detail reads return 404 and list reads omit inaccessible records.
- Preserves an absent mission schedule as `null`; existing unscheduled missions render a blank date-time input and clearing a schedule sends `scheduledStartAt: null`. Only new mission forms receive an explicit default.
- Validates create/update confirmations before publication: ID presence, same ID on update, Planning status, authoritative active job and assigned active location. Invalid confirmation rejects with `MALFORMED_RESPONSE`, preserves prior confirmed state and never displays Saved.
- Distinguishes an authoritative empty register from a non-empty authoritative register with no search matches.

### TDD and verification evidence

- Fix-round RED: 5 suites ran with 68 passing and 16 expected failures covering discarded session assignment IDs, unfiltered reads/state, unassigned writes, null schedule coercion, unvalidated confirmations and ambiguous search results.
- Focused GREEN: `npm test -- --runInBand src/__tests__/liveChainAccessApi.test.js src/services/__tests__/operationalApi.test.ts src/services/__tests__/operationalDataStore.test.ts src/contexts/__tests__/OperationalDataContext.test.tsx src/pages/MissionRemoteWorkflow.test.tsx` — 5 suites, 84 tests passed.
- Backend integration: `npm test -- --runInBand src/__tests__/trustedOperationalApi.test.js src/__tests__/liveChainAccessApi.test.js src/__tests__/liveChainWorkflowApi.test.js src/__tests__/liveChainFixRoundApi.test.js src/__tests__/liveChainBackendPglite.test.js` — 5 suites, 47 tests passed.
- Full non-watch suite: `CI=true npm test -- --runInBand --watchAll=false` — 51 suites, 312 tests passed, 0 failures.
- Production build: `npm run build` — exit 0, compiled successfully with the same pre-existing lint, Browserslist and bundle-size warnings recorded above.

## Review fix round 2

### Delivered

- Mission archive requests retain the existing `missions.archive` permission check, then load the target through the assigned-location-scoped repository read before dependency checks or archive writes. Missing, archived or inaccessible missions return the same 404 envelope without invoking either downstream operation.
- Added forward-only migration `20260801011000_mission_archive_location_scope.sql`; no earlier migration was modified. It wraps the current public trusted generic writer and acquires the transaction advisory lock plus active-organisation row lock before checking the actor's active beta seat.
- Trusted mission archives now require the active mission, its active same-organisation operating location, the actor's active same-organisation membership and an active location assignment. Those rows are locked for the transaction before the previous trusted writer is called.
- An inaccessible archive returns `not_found` without exposing version state and without reaching mission mutation, audit or outbox writes. Accessible archives continue through the existing version, active-dependency, audit and transactional-outbox implementation.
- The PGlite regression proves a member can archive a mission at an assigned location and cannot archive another location's mission by ID/version; denial preserves Planning status, `archived_at`, row version, audit count and outbox count.

### TDD and verification evidence

- Fix-round RED: focused API and PGlite suites ran with 12 passing and 3 expected failures. The handler skipped `repository.get`, the inaccessible request reached the archive path, and the trusted SQL writer archived an unassigned-location mission by ID/version.
- Focused GREEN: `npm test -- --runInBand src/__tests__/liveChainAccessApi.test.js src/__tests__/liveChainBackendPglite.test.js` — 2 suites, 15 tests passed.
- Backend integration: `npm test -- --runInBand src/__tests__/trustedOperationalApi.test.js src/__tests__/liveChainAccessApi.test.js src/__tests__/liveChainWorkflowApi.test.js src/__tests__/liveChainFixRoundApi.test.js src/__tests__/liveChainBackendPglite.test.js` — 5 suites, 49 tests passed.
- Full non-watch suite: `CI=true npm test -- --runInBand --watchAll=false` — 51 suites, 314 tests passed, 0 failures. Console output remains the intentional logging from existing security-fix tests.
- Production build: `npm run build` — exit 0, compiled successfully with the same pre-existing lint, Browserslist and bundle-size warnings recorded above.
- Deployment must apply migration `20260801011000_mission_archive_location_scope.sql` before or with the server archive-handler release so both the API path and direct trusted RPC path enforce assigned-location scope.
