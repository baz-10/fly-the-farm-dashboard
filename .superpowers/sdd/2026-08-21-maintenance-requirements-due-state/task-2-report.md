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
- Controlling thresholds are resolved by the exact server-returned ID. Presentation helpers never re-run the SQL threshold-selection algorithm.
- Calendar and one-time remaining/warning values are explained as days while their recurrence interval retains its stored unit.
- Attached child projections must match their registry identity and the parent `asOf`; summaries remain separate and do not change parent requirement state.
- Requirement ranking is a non-mutating presentation sort only.

## Verification

Focused Task 2 suite:

```text
PASS src/domain/maintenance/dueState.test.ts
Test Suites: 1 passed, 1 total
Tests: 36 passed, 36 total
```

Focused SQL-adjacent gate:

```text
PASS src/__tests__/maintenanceRequirementsPglite.test.js
PASS src/domain/maintenance/dueState.test.ts
PASS src/__tests__/maintenanceRequirementsMigration.test.js
Test Suites: 3 passed, 3 total
Tests: 42 passed, 42 total
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
