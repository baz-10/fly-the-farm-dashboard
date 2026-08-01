# Package 1 Task 5 — Connect field boundaries and Job workflows

## Status

Complete for the approved `/api/v1` job, operating-location and field-boundary-version contracts.

## Commits

- `2723967` — `feat: add authoritative job and boundary data adapters`
- `89cd754` — `feat: connect authoritative job and boundary workflows`

## Delivered

- Extended the typed browser API with strictly validated operating-location, complete supported job, and immutable field-boundary-version records.
- Explicitly maps job `clientId`, `propertyId`, `fieldIds`, `reference`, `scope`, `status`, `notes`, `requestedDate`, `scheduledDate`, concurrency versions and timestamps.
- Added trusted boundary list/get/create commands. Polygon/MultiPolygon response geometry is validated for structure, finite/ranged coordinates and closed rings before entering UI state.
- Extended the operational provider/store to load clients, properties, fields, operating locations and jobs for the authoritative session, reject invalid parent/field chains, and synchronously clear every collection on tenant/logout changes.
- Added server-confirmed create/update/archive job mutations, optimistic expected-version behavior, archive/conflict error retention, saved-state confirmation, and stale-scope protection.
- Added boundary refresh and create-version operations. Boundary saves send `expectedFieldVersion`; server confirmation advances the field row version/current boundary pointer and publishes geometry.
- Field Detail keeps its map/editor and terminology, reloads authoritative geometry on direct route and explicit Refresh, saves geometry through the boundary-version command, lists authoritative jobs, and enables Record Job.
- Job Create resolves its parent chain only from operational context in remote mode and persists the supported reference/scope/status/notes/requested/scheduled fields with at least the route field. The command/API shape accepts multiple field IDs.
- Remote Job Create blocks the save if chemical, weather, spray-recommendation, operator, quote or other unsupported values are non-empty, and explicitly states that they were not saved.
- Job Detail loads and archives only the authoritative job and route-matched parent chain. Remote mode does not read or present browser outcomes, reports, actuals, quotes or compliance records as server data.
- Job History lists authoritative jobs only, supports search/client filtering, and distinguishes failed/unauthorised loads from valid empty history.
- Removed the temporary remote gates from Job History, Record Job and Job Detail only after those screens stopped using browser-authoritative job records. Spray Rec Import remains gated.
- Local-mode route and legacy-store behavior remains in separate local components/branches.

## TDD evidence

- Adapter/store RED: 5 new tests failed for missing job/location/boundary adapters, tenant collections, parent validation and boundary mutation.
- Adapter/store GREEN: `npm test -- --runInBand src/services/__tests__/operationalApi.test.ts src/services/__tests__/operationalDataStore.test.ts` — 2 suites, 36 tests passed.
- Screen RED: 6 behavior tests failed because Field Detail still gated jobs/boundaries and the job routes still read browser stores; a separate refresh test failed before the explicit boundary refresh action existed.
- Screen GREEN: `npm test -- --runInBand src/pages/OperationalWorkflow.test.tsx` — 1 suite, 13 tests passed.
- Broader integration: `npm test -- --runInBand src/pages/OperationalWorkflow.test.tsx src/services/__tests__/operationalApi.test.ts src/services/__tests__/operationalDataStore.test.ts src/contexts/__tests__/OperationalDataContext.test.tsx src/App.test.tsx` — 5 suites, 58 tests passed.
- Full non-watch suite: `CI=true npm test -- --runInBand --watchAll=false` — 50 suites, 265 tests passed, 0 failures.
- Production build: `npm run build` — exit 0, compiled successfully with warnings.
- `git diff --check` — clean before each implementation commit.

## Remaining gates and limitations

- `/jobs/import` (Spray Rec Import) remains behind `OperationalFeatureGate`; chemical/document mapping is not implemented.
- Chemical mixtures, water/adjuvant values, weather/logs, spray recommendations/documents, drone/applicator data, outcomes, Ask FTF reports, quote/actual financial records and compliance subrecords do not have approved authoritative job subrecord adapters in this slice. Remote Job Create blocks non-empty unsupported values; remote Detail/History label unavailable sections and do not fall back to local records.
- Raw boundary source files and their browser-only metadata are not stored by the trusted boundary-version API; the authoritative saved record is validated GeoJSON geometry.
- The adapter retains complete MultiPolygon GeoJSON, while the existing single-boundary editor receives the first polygon outer ring because its visual contract is unchanged.
- Operating locations are loaded and scope-cleared through the provider/store for subsequent mission consumers; Task 5 does not add a new operating-location screen.
- The production build reports pre-existing repository-wide ESLint warnings and one `FieldDetail` exhaustive-deps warning around the boundary-load effect; it still exits successfully and all 265 tests pass.

## Requirement coverage

RET-003, RET-004, RET-005, RET-006, RET-007, IMP-003, IMP-004, IMP-005, NEW-001, NEW-003, NEW-005, NEW-006, NEW-007, NEW-008, REP-003, REP-004.

## Review fix round 1

### Commit

- `4f2923f` — `fix: harden authoritative job and boundary screens`

### Findings addressed

- Job archive responses now use an archive-safe confirmation mapper. A successful DELETE no longer fails strict list-record validation when the response omits the joined `fieldIds`; the store can remove the archived job and the screen can navigate normally.
- Field Detail now maintains explicit authoritative boundary `loading`, `ready`, `error`, `unauthorised` and `not-found` states. It does not present “No boundary set” until a successful authoritative empty response, and failed loads are no longer caught and discarded.
- Remote Job Create scans every value on every chemical row, including product, active ingredient, rate per hectare, treatment ID and future row fields. Any entered unsupported chemical value blocks the save; local-mode behavior is unchanged.
- Remote Job Create now renders operational loading, unavailable and unauthorised states before evaluating the route parent chain, preventing transient or failed loads from appearing as missing parents.
- The boundary-load callback dependency warning and its focused-test React state-update warning were resolved without changing the production behavior described above.

### Regression and verification evidence

- Archive mapper RED reproduced `MALFORMED_RESPONSE` for a server-confirmed job archive without `fieldIds`; the new archive confirmation test passes after the mapper split.
- Boundary state RED covered a delayed request plus network, 403 and 404 failures; all cases now render distinct states and never claim an unconfirmed empty boundary.
- Job Create RED covered unsupported Product / Brand, Active Ingredient and Rate per hectare values, plus operational loading, unavailable and unauthorised states; all regressions now pass.
- Focused verification: `npm test -- --runInBand src/pages/OperationalWorkflow.test.tsx src/services/__tests__/operationalApi.test.ts src/services/__tests__/operationalDataStore.test.ts src/contexts/__tests__/OperationalDataContext.test.tsx src/App.test.tsx` — 5 suites, 69 tests passed, 0 failures.
- Full verification: `CI=true npm test -- --runInBand --watchAll=false` — 50 suites, 276 tests passed, 0 failures. The only console output is intentional logging exercised by existing security-fix tests.
- Production build: `npm run build` — exit 0. It compiled with existing repository-wide ESLint and bundle-size warnings; the earlier Task 5 boundary-hook dependency warning is no longer present.
- `git diff --check` — clean before the fix commit.
