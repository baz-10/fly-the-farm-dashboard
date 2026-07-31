# Railway Corridor and KMZ Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe KMZ boundary imports and an explicit railway-centreline workflow that creates an editable-width spray corridor polygon.

**Architecture:** Extend the pure boundary import utility with explicit polygon, KMZ and railway-corridor entry points. Keep `BoundaryImportResult` as the common contract, then add a small, stateful corridor confirmation dialog to `FieldBoundaryEditor` while reusing its existing boundary-application path.

**Tech Stack:** React 19, TypeScript 5.9, MUI 7, Turf 7, fflate 0.8, Vitest 4, Testing Library.

## Global Constraints

- Standard KML and shapefile behaviour must remain unchanged.
- Railway buffering occurs only after the operator selects **Railway corridor**.
- Railway buffer defaults to `3.5` metres per side, is editable, and must be `> 0` and `<= 100`.
- KMZ processing stays in memory and enforces the 25 MB file/extracted-KML and 250-entry limits.
- No database migration or mission-schema change.

---

### Task 1: KML geometry classification and railway buffering

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/utils/boundaryImport.ts`
- Modify: `src/utils/__tests__/boundaryImport.test.ts`

**Interfaces:**
- Produces `parseRailwayCorridorKml(kmlText: string, bufferMetresEachSide: number): BoundaryImportResult`.
- Retains `parseKmlBoundary(kmlText: string): BoundaryImportResult`.

- [ ] Write a failing regression test containing line-only KML and assert polygon mode throws an error directing the user to **Railway corridor**.
- [ ] Run `npm test -- src/utils/__tests__/boundaryImport.test.ts` and verify RED.
- [ ] Add `@turf/buffer` as a direct dependency.
- [ ] Parse KML XML once through shared helpers, collect valid `LineString` coordinates, and improve the line-only polygon error.
- [ ] Write failing tests for 3.5 m buffering, invalid buffer limits, polygon-only railway input and overlapping/adjoining lines.
- [ ] Run the focused test and verify RED.
- [ ] Buffer one `MultiLineString` with `buffer(..., metres, { units: 'meters' })`, convert the returned Polygon/MultiPolygon through `boundaryFromGeoJson`, and return a warning describing the buffer.
- [ ] Run the focused tests and verify GREEN.
- [ ] Commit with `feat: buffer railway kml centre lines`.

### Task 2: Safe KMZ extraction

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/utils/boundaryImport.ts`
- Modify: `src/utils/__tests__/boundaryImport.test.ts`

**Interfaces:**
- Produces `parseKmzBoundary(file: File): Promise<BoundaryImportResult>`.
- Produces `parseRailwayCorridorKmz(file: File, bufferMetresEachSide: number): Promise<BoundaryImportResult>`.

- [ ] Add `fflate` as a direct dependency and write failing in-memory KMZ tests for `doc.kml`, stable fallback KML selection, and railway mode.
- [ ] Run the focused tests and verify RED.
- [ ] Implement bounded in-memory unzip, path/name checks, `doc.kml` preference, UTF-8 decode and dispatch into the existing KML entry points.
- [ ] Write failing tests for missing KML, corrupt archive, selected file over 25 MB, extracted KML over 25 MB and more than 250 entries.
- [ ] Run the focused tests and verify RED.
- [ ] Add explicit actionable errors for each archive failure and verify all focused tests GREEN.
- [ ] Commit with `feat: import mission boundaries from kmz`.

### Task 3: Separate Boundary and Railway import actions

**Files:**
- Modify: `src/components/FieldBoundaryEditor.tsx`
- Create: `src/components/__tests__/FieldBoundaryEditor.imports.test.tsx`
- Modify: `scripts/test-baseline-manifest.json`
- Modify: `scripts/test-inventory.mjs`
- Modify: `scripts/test-inventory.test.ts`

**Interfaces:**
- Consumes the four import functions from `boundaryImport.ts`.
- Produces accessible **Boundary file** and **Railway corridor** upload actions and a corridor confirmation dialog.

- [ ] Write a failing component test proving both actions render in Upload mode and accept `.kmz`.
- [ ] Run `npm test -- src/components/__tests__/FieldBoundaryEditor.imports.test.tsx` and verify RED.
- [ ] Extract a shared `applyImportResult(result, files, primaryFile, fileType, boundaryName)` callback from the existing upload handler.
- [ ] Keep ordinary KML/KMZ/SHP dispatch behind **Boundary file**.
- [ ] Add railway KML/KMZ selection state and a dialog defaulting to `3.5`, explaining the 7 m total width.
- [ ] Write failing component tests for editable buffer dispatch, cancel, successful application and visible importer errors.
- [ ] Run the focused tests and verify RED.
- [ ] Implement the dialog dispatch and apply `Railway corridor - <buffer> m each side` boundary metadata.
- [ ] Register the new test file as an explicit supplementary test and update the protected inventory count without weakening existing assertions.
- [ ] Run both focused component and inventory tests and verify GREEN.
- [ ] Commit with `feat: add railway corridor boundary import`.

### Task 4: Full verification

**Files:**
- Modify only if verification exposes a feature regression.

- [ ] Run `npm test` and require zero failures.
- [ ] Run `npm run build` and require TypeScript plus Vite exit code 0.
- [ ] Run `git diff --check origin/main...HEAD`.
- [ ] Confirm the final diff contains only the design/plan, dependencies, boundary importer, editor, tests and protected inventory updates.
- [ ] Commit any necessary verification correction with `fix: finalise railway corridor imports`.
