# Slice 4 Task 3 — Governed due-state API and Fleet summary report

## Status

Complete. Task 3 exposes individual and Fleet due-state reads through the same-origin trusted API, preserves one explicit `asOf` end to end, and treats the checked Task 1 RPC as the only scheduling authority. No Production, migration, backfill, read audit, availability mutation, or due-state recalculation was performed.

## TDD evidence

Server and browser-service tests were written before the Task 3 implementation.

The browser RED run failed seven new cases because `maintenanceApi.readDueState` and `maintenanceApi.readFleetDueSummary` did not exist:

```text
FAIL src/services/__tests__/maintenanceApi.test.ts
TypeError: maintenanceApi.readDueState is not a function
TypeError: maintenanceApi.readFleetDueSummary is not a function
Tests: 7 failed, 3 passed, 10 total
```

The server RED run failed twelve of thirteen tests because the repository read methods and API actions did not exist. Existing GET behavior consequently returned the old `asset_meters.read` denial rather than the independent maintenance requirement contract:

```text
FAIL server/__tests__/maintenance-due-read-model.test.js
TypeError: FleetMaintenanceRepository.readDueState is not a function
TypeError: FleetMaintenanceRepository.readFleetDueSummary is not a function
Expected: 200 / 400 / 404 / 502; Received: legacy 403 responses
Tests: 12 failed, 1 passed, 13 total
```

A second browser RED cycle proved that internally contradictory compact Fleet metadata was initially accepted. The boundary now rejects rows whose requirement count, attached count, state counts, or highest state contradict the fully normalized authoritative projection.

## Implemented contract

- `FleetMaintenanceRepository.readDueState` calls only `ftf_read_asset_maintenance_due_state` with the trusted context organisation, internal actor, registry ID, and caller's exact offset-bearing `asOf`.
- The private actorless SQL projection helper is never called by Task 3 and remains non-executable to `service_role`.
- `GET action=due-state` requires independent `maintenance_requirements.read`; it does not require or borrow `asset_meters.read`.
- Missing, date-only, offset-free, and invalid `asOf` inputs are rejected before repository access.
- Checked-RPC `forbidden` and `not_found` responses do not expose tenant, Base, ownership, or archived-asset details.
- Server response checks bind projection asset identity and `asOf` instant to the request, reject availability/serviceability authority fields recursively, validate requirement state domains, and keep attached child projections separate.
- `GET action=fleet-due-summary` supports Base, source asset type (`aircraft`, `equipment-kit`, `fleet-asset`), and due-state filters.
- Fleet candidate reads are constructed only from trusted context organisation IDs, assigned Base IDs, unarchived source rows, and active maintainable registry rows. A requested Base outside the context scope is denied before repository access.
- Each Fleet candidate is projected through the same checked Task 1 RPC with the same `asOf`; the repository never invokes the private helper or performs broad writes.
- Fleet counts aggregate authoritative returned states only. No threshold, meter, corrected-reading, baseline, calendar, timezone, controlling-threshold, serviceability, or availability calculation exists in server/client code.
- Parent Fleet row state/counts use parent requirements only. Attached child attention is represented by `attachedAssetCount` and the nested separate projection; a child cannot contaminate parent state.
- The browser imports Task 2's actual exported `normalizeMaintenanceDueResult` under the explicit boundary alias `normalizeMaintenanceDueProjection` and applies it to the individual response and every Fleet row.
- Browser validation fails the whole response for Task 2 contract violations, asset/`asOf` drift, unsafe authority fields, malformed filters/counts/rows, or compact metadata that contradicts the normalized projection.
- Server and browser errors both use the existing shared bounded public-diagnostics validators. Unsafe code/message/correlation tuples collapse to generic maintenance diagnostics.
- Existing attachment, detachment, reading, correction, and legacy workspace behavior remains available on its previous action/permission paths.
- `asset-maintenance` remains explicitly registered in the versioned dispatcher.

## Verification

Server authority and diagnostics:

```text
PASS server/__tests__/maintenance-due-read-model.test.js
PASS server/__tests__/technical-catalogue-authority.test.js
PASS server/__tests__/public-diagnostics.test.js
Test Suites: 3 passed, 3 total
Tests: 53 passed, 53 total
```

Browser service, Task 2 contract, diagnostics, and SQL-adjacent gates:

```text
PASS src/__tests__/maintenanceRequirementsPglite.test.js
PASS src/services/__tests__/maintenanceApi.test.ts
PASS src/domain/maintenance/dueState.test.ts
PASS src/__tests__/maintenanceRequirementsMigration.test.js
PASS src/services/__tests__/publicDiagnostics.test.ts
Test Suites: 5 passed, 5 total
Tests: 87 passed, 87 total
```

`npm run build` completed successfully. It retained existing repository lint, bundle-size, and stale Browserslist-data warnings; no warning references a Task 3 file.

`git diff --check` passed.

## Files

- `server/fleet-maintenance-repository.js`
- `server/fleet-maintenance-api.js`
- `server/operational-dispatcher.js`
- `server/__tests__/maintenance-due-read-model.test.js`
- `src/services/maintenanceApi.ts`
- `src/services/__tests__/maintenanceApi.test.ts`
- `.superpowers/sdd/2026-08-21-maintenance-requirements-due-state/task-3-report.md`

## Concerns and explicit boundaries

- The Fleet endpoint intentionally returns each fully authoritative projection with its compact row so the browser can enforce Task 2's mandatory fail-whole boundary. UI code should render the compact metadata and drill into the already-normalized projection, not duplicate scheduling logic.
- Fleet enumeration uses bounded trusted-context REST reads for source identity and active registry mapping, followed by the checked RPC per asset. For very large fleets, a later performance change may introduce a scoped aggregate SQL RPC or pagination, but it must preserve the same authority checks and projection contract.
- Production remains unchanged. No read creates audit/outbox events or mutates operational state.
