# Slice 4 Task 3 — Governed due-state API and Fleet summary report

## Status

Complete, including review fixes through round 2. Task 3 exposes individual and bounded Fleet due-state reads through the same-origin trusted API, preserves one explicit `asOf` end to end, and treats the checked Task 1 RPC as the only scheduling authority. No Production, migration, backfill, read audit, availability mutation, or due-state recalculation was performed.

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

Review fix round 1 added RED tests before implementation. The server run failed seven cases because Fleet reads still returned an unpaged array, ignored pagination, issued unbounded concurrent checked-RPC calls, and returned full projections in HTTP rows:

```text
FAIL server/__tests__/maintenance-due-read-model.test.js
Expected bounded { candidates, hasMore, scannedCount }; Received unbounded array
Expected page/pageSize validation and compact rows; Received legacy 200/full rows
Tests: 7 failed, 11 passed, 18 total
```

The browser RED run failed the new compact bounded-page acceptance case because the old boundary required a nested full projection and did not recognize page metadata:

```text
FAIL src/services/__tests__/maintenanceApi.test.ts
MaintenanceApiError: The maintenance API returned an invalid response.
Tests: 1 failed, 10 passed, 11 total
```

Review fix round 2 replaced offset paging and was also test-first. The server RED run failed fourteen cases because the existing endpoint accepted offset/mismatched cursors, embedded all assigned Bases in source URLs, stopped sparse filters after one batch, lacked a hard scan continuation, and still exposed ambiguous `counts`:

```text
FAIL server/__tests__/maintenance-due-read-model.test.js
Tests: 14 failed, 13 passed, 27 total
```

The browser RED run failed the new opaque-cursor and `pageCounts` contract because its old exact boundary still required numeric page metadata and `counts`:

```text
FAIL src/services/__tests__/maintenanceApi.test.ts
MaintenanceApiError: The maintenance API returned an invalid response.
Tests: 1 failed, 12 passed, 13 total
```

## Implemented contract

- `FleetMaintenanceRepository.readDueState` calls only `ftf_read_asset_maintenance_due_state` with the trusted context organisation, internal actor, registry ID, and caller's exact offset-bearing `asOf`.
- The private actorless SQL projection helper is never called by Task 3 and remains non-executable to `service_role`.
- `GET action=due-state` requires independent `maintenance_requirements.read`; it does not require or borrow `asset_meters.read`.
- Missing, date-only, offset-free, and invalid `asOf` inputs are rejected before repository access.
- Checked-RPC `forbidden` and `not_found` responses do not expose tenant, Base, ownership, or archived-asset details.
- Server response checks bind projection asset identity and `asOf` instant to the request, reject availability/serviceability authority fields recursively, validate requirement state domains, and keep attached child projections separate.
- `GET action=fleet-due-summary` supports Base, source asset type (`aircraft`, `equipment-kit`, `fleet-asset`), due-state, opaque `cursor`, and `pageSize` filters. Page size defaults to 25 and has a hard maximum of 25; legacy offset `page` input is rejected.
- Fleet enumeration uses active tenant-registry keyset reads ordered by registry ID. Continuations query `id > lastRegistryId` with an explicit remaining-page `+ 1` sentinel, so insertion of a lower registry ID between requests neither repeats nor skips registry rows that already existed after the cursor.
- The base64url cursor has a strict versioned shape and binds the last registry ID to the exact `asOf`, Base, asset type, due-state filter, and page size. Malformed, non-canonical, oversized, or request-mismatched cursors fail before repository access.
- Registry scans repeat until the filtered row page fills, the ordered registry is exhausted, or 100 registry rows have been inspected. Reaching the scan cap with more rows returns `hasMore: true` and a continuation after the last scanned registry ID rather than implying exhaustion.
- Only source IDs present in a bounded registry batch are hydrated. Each source read is a fixed-size organisation/id/unarchived request with `limit=2`; assigned Base membership is checked from trusted server context after hydration, so even 120 assigned 36-character Base UUIDs do not expand URLs. Hydration and checked due-state RPCs both use at most four concurrent workers.
- Each returned Fleet candidate is projected through the same checked Task 1 RPC with the same `asOf`. A four-worker pool bounds checked-RPC concurrency, and the repository never invokes the private helper or performs broad writes.
- `pageCounts` aggregates authoritative projected candidates inspected for the current cursor page/scan window only. It is explicitly not a whole-fleet total. No threshold, meter, corrected-reading, baseline, calendar, timezone, controlling-threshold, serviceability, or availability calculation exists in server/client code.
- Parent Fleet row state/counts use parent requirements only. Attached child attention is represented only by `attachedAssetCount`; a child cannot contaminate parent state.
- Fleet HTTP rows are compact identity/count records and never contain `dueState`, thresholds, evidence, requirements, or attached projections. Full explainability remains available only from the per-asset endpoint.
- The browser imports Task 2's actual exported `normalizeMaintenanceDueResult` under the explicit boundary alias `normalizeMaintenanceDueProjection` and applies it to the full individual response only.
- Browser Fleet validation accepts only exact compact row keys, treats cursors as opaque base64url tokens, binds filters/`asOf`/page size to the request, verifies `pageCounts`/highest-state coherence and `hasMore`/`nextCursor` consistency, rejects over-returned projection/evidence keys, and fails the entire response on any malformed row or metadata.
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
Tests: 67 passed, 67 total
```

Browser service, Task 2 contract, diagnostics, and SQL-adjacent gates:

```text
PASS src/__tests__/maintenanceRequirementsPglite.test.js
PASS src/services/__tests__/maintenanceApi.test.ts
PASS src/domain/maintenance/dueState.test.ts
PASS src/__tests__/maintenanceRequirementsMigration.test.js
PASS src/services/__tests__/publicDiagnostics.test.ts
Test Suites: 5 passed, 5 total
Tests: 89 passed, 89 total
```

`npm run build` completed successfully after its first run identified a TypeScript-only `unknown` inference for `page.hasMore`; that field now crosses an explicit boolean validator. The successful build retained existing repository lint, bundle-size, and stale Browserslist-data warnings; no warning references a Task 3 file.

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

- A page can contain fewer than `pageSize` rows when the 100-row scan cap is reached under a sparse filter. `hasMore: true` plus `nextCursor` is the precise instruction to continue; `hasMore: false` always emits `nextCursor: null` and means the scanned registry is exhausted at that instant.
- Keyset semantics intentionally do not revisit rows inserted at or below a previously consumed registry ID. Rows that existed beyond the cursor are not skipped or repeated. This avoids offset drift but is not snapshot isolation across separate HTTP requests.
- `pageCounts` describes authoritative projected candidates within the current bounded scan window, including other states inspected while filling a state-filtered page. A future whole-fleet total needs a separate scoped aggregate SQL RPC rather than client/server enumeration.
- Full Task 2 fail-whole normalization remains mandatory for per-asset explainability. Compact Fleet rows intentionally validate only identity, paging, state/count coherence, and absence of over-returned fields; they do not reconstruct or recalculate due state.
- Production remains unchanged. No read creates audit/outbox events or mutates operational state.
