# Task 4 report — Compact Maintenance and Fleet summary UI

Date: 2026-08-22
Status: Complete

## Outcome

Implemented a compact, read-only Maintenance workspace for exact asset routes and a permission-aware Fleet maintenance summary. Both surfaces consume Task 3's validated server projections at an explicit stable `asOf`; the browser presents returned state and evidence without calculating dates, meters, due state, availability, serviceability, or completion.

The UI follows Spray Command's established SC-012 Premium Simplicity system: restrained forest/leaf colour, paper surfaces, compact status rails, progressive disclosure, existing typography, and responsive card stacks instead of a dense table.

## Approved due-state grouping ruling

- `DUE NOW` contains server-returned `DUE` and `OVERDUE` requirements while every card preserves its exact state.
- `DUE SOON` contains `DUE_SOON`.
- `CURRENT` contains `CURRENT`.
- `NEEDS ATTENTION` contains `INSUFFICIENT_DATA`.
- No `UPCOMING` group is rendered or derived. It requires a future explicit server-governed state/window before the product can display it honestly.
- Attached-asset attention is shown in a separate panel and never changes parent counts or state.

## Implementation

### Asset Maintenance

- Resolves `{source, sourceRecordId}` through the authoritative route resolver, then requests the exact registry projection with the Asset Workspace's route/session-scoped `asOf`.
- Clears and generation-guards state across asset, route, API, retry, and `asOf` changes so stale requests cannot overwrite the current asset.
- Starts with compact collapsed state groups and permits one expanded group and one requirement card at a time.
- Shows the server-selected controlling threshold, exact current/due/remaining values, due-soon rule, date, requirement version, authority evidence, and baseline evidence only on expansion.
- Visually distinguishes manufacturer, organisation-standard, and condition-based authority.
- Treats Service Kits as optional and links linked kits back to the same authoritative asset route.
- Includes accessible loading, failure/retry, empty, focus, labels, reduced-motion, and responsive layouts.
- Adds no maintenance mutation, availability, mission-readiness, grounding, or serviceability control.

### Fleet maintenance

- Mounts inside Fleet Work Packs only when the authenticated scope has `maintenance_requirements.read`, `maintenance_requirements.*`, or `*`.
- Captures one stable Fleet `asOf` for the authenticated user/organisation/delegated-session scope and resets it only when that scope changes.
- Uses the Task 3 compact Fleet projection with exact Base, asset source, and individual due-state filters.
- Uses opaque keyset cursors for bounded load-more pages and discards stale page/filter responses.
- Displays compact asset cards and authoritative Asset Workspace links; detailed evidence remains on the asset surface.

### Test-only fixtures

- Added deterministic FTF-11, GEN-003, and T100-002 fixtures under the maintenance test fixture directory.
- FTF-11 proves `CURRENT`, `DUE_SOON`, `DUE`, `OVERDUE`, `INSUFFICIENT_DATA`, optional Service Kit linkage, and attached GEN-003 attention.
- GEN-003 proves a standalone manufacturer requirement without a Service Kit.
- T100-002 proves organisation-standard aircraft-compatible flight hours beside a manufacturer requirement.
- A separate FTF-11 projection proves the controlling threshold can change from meter to calendar authority without browser comparison.
- Fixture projections are passed through the production fail-closed normalizer in component tests and are imported only by tests/E2E; no Production seeding or browser-local fallback was added.

## Strict TDD evidence

Observed RED before implementation:

1. `MaintenanceWorkspace.test.tsx` failed because the component module did not exist.
2. Asset Workspace integration failed because Maintenance still rendered the placeholder surface.
3. `FleetMaintenanceSummary.test.tsx` failed because the component module did not exist.
4. Fleet Work Packs integration failed because no permission-aware summary was mounted.
5. The real production normalizer boundary test failed because the first nested child fixture used a top-level-only projection field. The fixture was corrected to the exact nested SQL/API contract before browser acceptance continued.
6. The maturity boundary exact-count test failed after the new audited UI/evidence paths changed source counts from 166 to 171 and evidence counts from 77 to 80; the guard was then updated to the verifier's exact output.

GREEN component/integration coverage includes progressive disclosure, exact state preservation, evidence/authority, Service Kit optionality, attached isolation, controlling-threshold changes, stable instants, stale-response guards, filters, keyset paging, permissions, loading/error/retry/empty, absence of operational controls, and production-boundary fixture validation.

## Verification

- Focused and adjacent Jest: **7 suites, 106 tests passed**.
  - `MaintenanceWorkspace.test.tsx`
  - `FleetMaintenanceSummary.test.tsx`
  - `AssetWorkspace.test.tsx`
  - `FleetWorkPacks.test.tsx`
  - `maintenanceApi.test.ts`
  - `dueState.test.ts`
  - product maturity registry tests
- Product maturity exact-count boundary: **1 passed**; 227 unrelated cases deliberately skipped by `testNamePattern`.
- Product maturity verifier: **46 modules, 15 workflows, 57 routes, 171 customer UI files, 80 evidence references, 0 customer-facing Legacy violations**.
- Production build: **passed**. Existing repository lint and bundle-size warnings remain; no Task 4 compile error.
- Playwright acceptance: **6/6 passed** across Chromium and WebKit at phone `390×844`, tablet `768×1024`, and desktop `1440×900`.
- `git diff --check`: passed.

## Files

- `src/components/maintenance/MaintenanceWorkspace.tsx`
- `src/components/maintenance/MaintenanceWorkspace.test.tsx`
- `src/components/maintenance/FleetMaintenanceSummary.tsx`
- `src/components/maintenance/FleetMaintenanceSummary.test.tsx`
- `src/components/maintenance/__fixtures__/maintenanceDueFixtures.ts`
- `src/pages/AssetWorkspace.tsx`
- `src/pages/AssetWorkspace.test.tsx`
- `src/pages/FleetWorkPacks.tsx`
- `src/pages/__tests__/FleetWorkPacks.test.tsx`
- `e2e/aircraft/maintenance-due-state.spec.ts`
- `src/productMaturity/product-maturity-registry.json`
- `src/__tests__/productMaturityBoundary.test.tsx`

## Concerns and follow-up

- `UPCOMING` remains intentionally absent until the server exposes an explicit governed state/window. The client must not invent this boundary.
- Task 3 attached summaries contain the child registry ID and due projection but not an authoritative child route identity, so Task 4 identifies attached attention by returned requirement/registry data and does not invent a child deep link.
- Fleet summary `pageCounts` are page-local by contract. The UI labels the number of rows currently loaded and does not present page counts as Fleet totals.
- Maintenance events, completion history, and authoritative component-life/condition evidence remain future slices; this UI intentionally provides no substitute mutation or derived state.
- The product maturity entry remains `BETA`; private-beta operational evidence is still required.

No Production migration, seed, deployment, push, or browser-local authority was performed.
