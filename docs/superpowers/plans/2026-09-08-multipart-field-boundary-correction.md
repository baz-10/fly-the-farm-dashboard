# Multipart Field Boundary Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve, display, save and reopen every valid polygon imported into a Field.

**Architecture:** `BoundaryImportResult.polygons` remains the parsed geometry authority. `FieldBoundaryEditor` emits that collection to the owning form, which persists it on `Field.boundaryPolygons`; `boundaryCoords` remains the primary-ring compatibility projection. The existing authoritative `field_boundary_versions.boundary_geojson` MultiPolygon path is reused, so no migration is expected.

**Tech Stack:** React, TypeScript, React Leaflet, Turf, Jest/Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-08-weather-field-beta-corrections-design.md`

## Global Constraints

- No Production mutation, migration, deployment, alias change, or genuine record mutation.
- Sum area from the same complete polygon collection that is displayed and persisted.
- Preserve single-polygon compatibility through `boundaryCoords`.
- Do not convert polygon holes into paddocks.

---

### Task 1: Multipart form state and persistence

**Files:**
- Modify: `src/types/fieldManagement.ts`
- Modify: `src/pages/PropertyDetail.tsx`
- Modify: `src/pages/FieldDetail.tsx`
- Test: `src/pages/__tests__/PropertyDetail.test.tsx`
- Test: `src/pages/__tests__/FieldDetail.test.tsx`

**Interfaces:**
- Consumes: `FieldBoundaryEditor.polygons?: LatLng[][]` and `onPolygonsChange?: (polygons: LatLng[][]) => void`.
- Produces: `Field.boundaryPolygons?: LatLng[][]`, with `boundaryCoords` equal to the first polygon.

- [ ] Write a failing Add Field test that imports two disjoint polygons, observes both in form state, saves, and asserts `boundaryPolygons` retains both while `boundaryCoords` retains the primary ring.
- [ ] Run `TZ=Australia/Brisbane npm test -- --runInBand --runTestsByPath src/pages/__tests__/PropertyDetail.test.tsx` and confirm the saved Field lacks secondary polygons.
- [ ] Add `boundaryPolygons?: LatLng[][]`, wire Add Field state through `polygons`/`onPolygonsChange`, persist it, and clear it on close/save.
- [ ] Write a failing edit/reopen test proving secondary polygons survive `FieldDetail` display and edit-save.
- [ ] Wire `FieldDetail` display/edit state and updates to the full polygon collection.
- [ ] Run both focused page suites and confirm they pass.

### Task 2: Combined geometry display and bounds

**Files:**
- Modify: `src/components/FieldBoundaryEditor.tsx`
- Test: `src/components/__tests__/FieldBoundaryEditor.test.tsx`
- Test: `src/utils/__tests__/boundaryImport.test.ts`

**Interfaces:**
- Consumes: validated `LatLng[][]` polygon collection.
- Produces: map polygons, combined fit bounds and summed hectares from that same collection.

- [ ] Write a failing component test proving all imported polygons render and combined bounds receive coordinates from every polygon.
- [ ] Run the focused component test and confirm the current `FitBounds` only receives the primary ring.
- [ ] Change `FitBounds` to consume `allBoundaryCoords`, keep every `<Polygon>`, and show the multipart count/area from `boundaryPolygons`.
- [ ] Add malformed ring and polygon-hole regression fixtures to `boundaryImport.test.ts`.
- [ ] Run the component/import suites and confirm all tests pass.

### Task 3: Operational boundary-version compatibility

**Files:**
- Modify if required: `src/services/operationalDataStore.ts`
- Modify if required: `src/services/operationalApi.ts`
- Test: `src/services/__tests__/operationalDataStore.test.ts`
- Test: `src/services/__tests__/operationalApi.test.ts`

**Interfaces:**
- Consumes: `LatLng[][]`.
- Produces: checked `MultiPolygon` boundary GeoJSON and full decoded `boundaryPolygons`.

- [ ] Extend the existing MultiPolygon tests to use 14 polygons and assert first-ring compatibility plus complete collection retention.
- [ ] Run both service suites and confirm whether existing code already passes.
- [ ] If a real failure exists, make the minimum decoder/store correction; if they pass, make no production-code change.
- [ ] Run the two service suites again and confirm they pass.

### Task 4: Multipart browser acceptance

**Files:**
- Modify: `e2e/locations/structured-location.spec.ts`

**Interfaces:**
- Consumes: Add Field dialog and multipart import fixture.
- Produces: Chromium/WebKit evidence that all polygons are visible and retained.

- [ ] Add a browser test that imports a deterministic multipart GeoJSON/KML fixture through the supported upload path and asserts total area, polygon count, and rendered Leaflet paths.
- [ ] Run `npx playwright test --config=playwright.locations.config.ts --project=chromium` and confirm pass.
- [ ] Run `npx playwright test --config=playwright.locations.config.ts --project=webkit` and confirm pass.
- [ ] Commit the independently verified multipart Field correction.
