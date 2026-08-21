# Slice 4 Task 2 — Deterministic due-state TypeScript contract report

## Status

Complete. Task 2 adds a fail-closed TypeScript contract for the authoritative SQL due-state projection, typed evidence/presentation models, controlling-threshold resolution, presentation ranking, and isolated attached-equipment summaries. It does not calculate due state, invent baseline/current evidence, infer `ALL`, or mutate operational availability.

## TDD evidence

The focused suite was written before the production module and types. The first run was observed RED because the contract did not exist:

```text
FAIL src/domain/maintenance/dueState.test.ts
Cannot find module './dueState' from 'src/domain/maintenance/dueState.test.ts'
Test Suites: 1 failed, 1 total
Tests: 0 total
```

A second RED cycle was observed after comparing presentation evidence with the exact SQL projection. Six tests failed for the intended missing behavior: calendar remaining/warning units were incorrectly reported as recurrence units, and authority-plane mismatch, empty evidence, out-of-interval historical rows, incomplete current-meter evidence, and attached `asOf` drift were not yet rejected. A final RED contract cycle proved that arbitrary meter/baseline/source values, invalid threshold shapes and dates, and duplicate threshold identities were still accepted. The minimal hardening implementation made the suite GREEN at 36/36.

Review fix round 1 added malicious partial and contradictory projections before changing production code. RED reproduced six acceptance gaps: meter baseline values without baseline authority/evidence, complete meter evidence without due or remaining values, calendar baseline evidence without due date/remaining days, a `CURRENT` requirement containing an `OVERDUE` threshold, and a controller that contradicted the SQL order. GREEN now rejects those payloads while retaining the valid SQL case where `INSUFFICIENT_DATA` controls aggregate requirement state but a different threshold with known remaining evidence controls the threshold ID.

Review fix round 2 added complete malicious cross-type tuples and invalid domains before production changes. RED reproduced eight remaining gaps: meter thresholds carrying calendar due dates, one-time thresholds carrying current-meter or numeric due evidence, zero/negative intervals, negative or interval-sized meter warning windows, and incompatible meter units. The CALENDAR malicious meter tuple was already rejected and is now retained as explicit regression coverage. GREEN rejects every SQL-impossible tuple without calculating maintenance state.

Review fix round 3 added forged current-meter metadata before production changes. RED reproduced both remaining coherence gaps: `AIRCRAFT_COMPATIBILITY` was accepted for a non-flight-hours meter, and a current reading later than the projection `asOf` was accepted. GREEN now rejects both impossible projections and retains an exact-boundary regression proving flight-hour compatibility evidence recorded exactly at `asOf` remains valid.

## Implemented contract

- `MaintenanceDueResult` and exact nested projection types for requirements, thresholds, baseline/current/due evidence, Service Kit version links, and attached assets.
- Runtime decoding of the SQL projection with explicit offset-bearing `asOf` timestamps and validated IANA timezones.
- Explicit `ANY` only; `ALL` and omitted/unknown policies fail closed.
- Due states limited to `CURRENT`, `DUE_SOON`, `DUE`, `OVERDUE`, and `INSUFFICIENT_DATA`; `UNSERVICEABLE` is not part of the type or runtime enum.
- Availability, mission-readiness, serviceability, and Fleet-status authority fields are rejected recursively rather than exposed or mutated.
- Only applicable `EFFECTIVE` or historically in-interval `SUPERSEDED` versions are accepted. Inactive lifecycle rows and out-of-interval rows fail closed.
- Manufacturer requirements must retain Platform authority; organisation standards must retain organisation authority. Requirement and baseline evidence objects must be non-empty when present.
- Missing meter/calendar/one-time evidence stays `INSUFFICIENT_DATA`. `CONDITION` and future `COMPONENT` thresholds stay insufficient because Slice 4 has no authoritative evidence source for them.
- Corrected authoritative readings and aircraft compatibility sources are preserved as server evidence; TypeScript performs no meter selection or correction arithmetic.
- Aircraft compatibility evidence is accepted only for `flight_hours`, and current-meter evidence cannot postdate the projection `asOf`. These are metadata-coherence checks against the SQL result, not client-side scheduling calculations.
- Controlling thresholds are resolved by the exact server-returned ID. Presentation helpers never re-run the SQL threshold-selection algorithm.
- Runtime validation checks that the controller matches the SQL projection's `remaining ASC NULLS LAST, sequenceNumber` ordering and that requirement state matches its `OVERDUE`, `DUE`, `INSUFFICIENT_DATA`, `DUE_SOON`, `CURRENT` precedence. This validates returned metadata only; it does not calculate due state from dates or meters.
- Baseline values require baseline type and evidence. Complete meter/calendar evidence requires the corresponding projected due and remaining fields; incomplete evidence cannot carry those fields or claim a sufficient state.
- Threshold shapes reject calendar fields on meter rows and numeric/current-meter fields on calendar or one-time rows. Present intervals are positive, warning windows are nonnegative, meter warning windows remain smaller than their interval, and governed meter types retain SQL-compatible units.
- Calendar and one-time remaining/warning values are explained as days while their recurrence interval retains its stored unit.
- Attached child projections must match their registry identity and the parent `asOf`; summaries remain separate and do not change parent requirement state.
- Requirement ranking is a non-mutating presentation sort only.

## Verification

Focused Task 2 suite:

```text
PASS src/domain/maintenance/dueState.test.ts
Test Suites: 1 passed, 1 total
Tests: 55 passed, 55 total
```

Focused SQL-adjacent gate:

```text
PASS src/__tests__/maintenanceRequirementsPglite.test.js
PASS src/domain/maintenance/dueState.test.ts
PASS src/__tests__/maintenanceRequirementsMigration.test.js
Test Suites: 3 passed, 3 total
Tests: 61 passed, 61 total
```

Task-file TypeScript compilation passed with the repository's ES5 target constraints:

```text
npx tsc --noEmit --target es5 --module commonjs --lib dom,es2015 --skipLibCheck \
  src/types/fleetMaintenance.ts src/domain/maintenance/dueState.ts
```

The production build completed successfully. It retained pre-existing repository lint and stale Browserslist-data warnings; no warning references a Task 2 file.

## Files

- `src/types/fleetMaintenance.ts`
- `src/domain/maintenance/dueState.ts`
- `src/domain/maintenance/dueState.test.ts`
- `.superpowers/sdd/2026-08-21-maintenance-requirements-due-state/task-2-report.md`

## Concerns and boundaries

- The SQL projection remains the sole scheduling authority. Task 3 must normalize the RPC payload through this module and must not add client-side calendar/meter calculations.
- Attached summaries intentionally present child attention only; they do not create a parent due state.
- Full repository `tsc --noEmit` is not a clean project gate because unrelated pre-existing test typing errors remain. Task 2 production files pass a targeted compiler invocation, and the production build succeeds.
- Full regression, Product Maturity, and browser acceptance remain later Slice 4 integration tasks. No Production migration, deployment, backfill, availability mutation, or genuine record mutation was performed.
