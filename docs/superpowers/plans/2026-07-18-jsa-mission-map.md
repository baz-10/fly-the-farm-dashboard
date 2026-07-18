# JSA and Mission Map Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prefill triggered risk controls with JSA context and provide safe Point, Line, Shape, boundary-vertex, and feature-note editing without risking mission deletion.

**Architecture:** Extend the map feature union with `LineString`, normalise legacy records at one model boundary, and express boundary edits as pure polygon-ID operations before connecting them to Leaflet. Replace the count legend and separate delete list with one controlled feature register. Keep JSA answer notes separate from mitigation while deriving read-only trigger context at render time.

**Tech Stack:** React 19, TypeScript 4.9, Material UI 7, Leaflet/React Leaflet 5, shpjs 6, Jest, Testing Library.

## Global Constraints

- Existing mission, JSA, point, polygon, boundary-coordinate, and imported-file records remain readable.
- A map feature or vertex action can never invoke mission deletion.
- Boundary polygon deletion is explicit and confirmed; deleting the final boundary preserves the mission.
- Optional annotations do not become mission-authorisation requirements.
- Unsafe-answer semantics remain question-specific rather than treating every Yes as unsafe.

---

### Task 1: JSA trigger context

**Files:**
- Modify: `src/types/mission.ts`
- Modify: `src/utils/missionSafety.ts`
- Modify: `src/utils/__tests__/missionSafety.test.ts`
- Modify: `src/components/MissionJsaDialog.tsx`
- Modify: `src/components/__tests__/MissionJsaDialog.test.ts`

**Interfaces:**
- Produces: `getRiskControlContext(assessment, questionId): { question; answerLabel; notes }` and preserves `MissionRiskControl` mitigation fields independently.

- [ ] **Step 1: Write failing tests** for unsafe Yes and unsafe No questions, exact question/answer/notes context, live note updates, mitigation preservation, and control removal after the answer becomes safe.
- [ ] **Step 2: Run focused tests** and confirm failures.
- [ ] **Step 3: Implement pure context derivation** from `MISSION_CHECKS` and current answers; do not duplicate JSA notes inside the risk-control persistence model.
- [ ] **Step 4: Render a read-only `Triggered by this JSA answer` block** above each risk matrix, including notes or `No notes supplied`.
- [ ] **Step 5: Run focused tests** and confirm PASS.
- [ ] **Step 6: Commit** as `feat: connect jsa answers to risk controls`.

### Task 2: Geometry and legacy normalisation

**Files:**
- Modify: `src/types/missionMap.ts`
- Modify: `src/utils/missionMapAnnotations.ts`
- Modify: `src/utils/__tests__/missionMapAnnotations.test.ts`
- Modify: `src/types/mission.ts`

**Interfaces:**
- Adds `MissionMapLineGeometry { type: 'LineString'; coordinates: Array<[number, number]> }`.
- Makes `name` and `notes` normalised strings while retaining `label` compatibility during migration.
- Produces: `normaliseMapFeature(feature)` and `normaliseMapFeatures(features)`.

- [ ] **Step 1: Write failing tests** for Point/LineString/Polygon records, legacy label-to-name migration, empty notes, stable IDs, immutable upsert/remove, and malformed geometry rejection.
- [ ] **Step 2: Run focused tests** and confirm failures.
- [ ] **Step 3: Extend types and normaliser** so pages receive one canonical shape; preserve `label` only as a read compatibility input.
- [ ] **Step 4: Run focused tests** and confirm PASS.
- [ ] **Step 5: Commit** as `feat: support mission map line features`.

### Task 3: Stable boundary polygon operations

**Files:**
- Create: `src/types/missionBoundary.ts`
- Create: `src/utils/missionBoundaryEditing.ts`
- Create: `src/utils/__tests__/missionBoundaryEditing.test.ts`
- Modify: `src/utils/boundaryImport.ts`
- Modify: `src/utils/__tests__/boundaryImport.test.ts`

**Interfaces:**
- Produces: `MissionBoundaryPolygon { id; coordinates; sourceFileId?; name; notes }`, `moveBoundaryVertex`, `removeBoundaryVertex`, `removeBoundaryPolygon`, `normaliseBoundaryPolygons`.
- Operations return `{ polygons, requiresPolygonDeleteConfirmation?: boolean }` and never accept or return a mission object.

- [ ] **Step 1: Write failing tests** for KML/SHP multi-polygons with stable IDs, moving one vertex, removing a valid vertex, refusing a removal below three vertices, deleting one polygon while preserving siblings, and deleting the final polygon while preserving unrelated mission fixture data.
- [ ] **Step 2: Run focused tests** and confirm failures.
- [ ] **Step 3: Implement pure operations** keyed by polygon ID and vertex index; retain import source metadata separately from editable geometry.
- [ ] **Step 4: Update import results** to produce stable polygon IDs without flattening holes or sibling polygons.
- [ ] **Step 5: Run focused tests** and confirm PASS.
- [ ] **Step 6: Commit** as `fix: isolate mission boundary edits`.

### Task 4: Point, Line, and Shape drawing state

**Files:**
- Create: `src/utils/missionMapDrawing.ts`
- Create: `src/utils/__tests__/missionMapDrawing.test.ts`
- Modify: `src/components/FieldBoundaryEditor.tsx`
- Create: `src/components/__tests__/FieldBoundaryEditor.test.tsx`

**Interfaces:**
- Produces: `DrawingMode = 'point' | 'line' | 'shape'`, `appendDraftVertex`, `canFinishDrawing`, `finishDrawing`, and `cancelDrawing`.

- [ ] **Step 1: Write failing pure and component tests** for one-click points, two-vertex minimum lines, three-vertex minimum shapes, explicit finish, cancel without persistence, suggested defaults, and switching type/mode without corrupting saved features.
- [ ] **Step 2: Run focused tests** and confirm failures.
- [ ] **Step 3: Implement drawing-state utility** and connect toolbar controls plus `Finish line`, `Finish shape`, and `Cancel drawing` actions.
- [ ] **Step 4: Render LineString with Leaflet `Polyline`** and preserve existing Marker/Polygon behaviour.
- [ ] **Step 5: Run focused tests** and confirm PASS.
- [ ] **Step 6: Commit** as `feat: add mission map drawing modes`.

### Task 5: Safe imported-boundary editing UI

**Files:**
- Modify: `src/components/FieldBoundaryEditor.tsx`
- Modify: `src/components/__tests__/FieldBoundaryEditor.test.tsx`
- Modify: `src/pages/MissionPlanning.tsx`
- Create: `src/pages/__tests__/MissionPlanning.map.test.tsx`

**Interfaces:**
- Consumes: Task 3 operations.
- Produces: vertex move/delete actions scoped by polygon ID and explicit polygon/final-boundary confirmation dialogs.

- [ ] **Step 1: Write failing tests** proving imported vertices are editable, vertex deletion changes only one polygon, invalid vertex deletion offers polygon deletion, sibling polygons survive, final boundary removal preserves mission fields, and no map action calls mission delete.
- [ ] **Step 2: Run focused tests** and confirm failures.
- [ ] **Step 3: Replace array-position edits** with stable polygon-ID operations and render vertex delete affordances in edit mode.
- [ ] **Step 4: Add named confirmation dialogs** for polygon and final-boundary removal; update planning state and boundary record without deleting the mission.
- [ ] **Step 5: Run focused tests** and confirm PASS.
- [ ] **Step 6: Commit** as `fix: make imported boundaries safely editable`.

### Task 6: Editable map feature register

**Files:**
- Replace: `src/components/MissionMapLegend.tsx`
- Create: `src/components/MissionMapFeatureRegister.tsx`
- Create: `src/components/__tests__/MissionMapFeatureRegister.test.tsx`
- Modify: `src/components/FieldBoundaryEditor.tsx`
- Modify: `src/pages/MissionPlanning.tsx`

**Interfaces:**
- Produces callbacks `onRename`, `onNotesChange`, `onZoom`, and `onDelete` scoped to exact feature or boundary polygon IDs.

- [ ] **Step 1: Write failing tests** for boundary and feature rows, colour/type/geometry/name/notes, editable name and notes, Zoom callback, targeted delete, boundary confirmation, and persistence after rerender.
- [ ] **Step 2: Run focused tests** and confirm failures.
- [ ] **Step 3: Build the register** as responsive cards/table rows below the map with Edit, Zoom, and Delete actions and accessible labels naming the target.
- [ ] **Step 4: Remove the old count-only legend and separate delete list**, then connect controlled updates to mission planning state.
- [ ] **Step 5: Run focused tests** and confirm PASS.
- [ ] **Step 6: Commit** as `feat: add editable mission map register`.

### Task 7: Persistence and authorisation regression

**Files:**
- Modify: `src/pages/MissionPlanning.tsx`
- Modify: `src/contexts/MissionContext.tsx` only if canonical normalisation belongs at context load/save.
- Create: `src/utils/__tests__/missionMapPersistence.test.ts`
- Modify: `src/utils/__tests__/missionWorkflow.test.ts`
- Modify: `src/utils/__tests__/t100MissionRegression.test.ts`

- [ ] **Step 1: Write failing regression tests** for reopening Point/Line/Shape notes, legacy feature loading, multi-boundary persistence, missing optional annotations, and unchanged T50/T100 authorisation without Schedule, Weather, vehicles, work packs, or annotations.
- [ ] **Step 2: Run focused tests** and confirm failures where integration is incomplete.
- [ ] **Step 3: Complete canonical load/save mapping** in the narrowest persistence boundary and ensure mission validation ignores optional map annotations.
- [ ] **Step 4: Run focused regression tests** and confirm PASS.
- [ ] **Step 5: Commit** as `test: protect mission map persistence and authorisation`.

### Task 8: Stage 2 verification

**Files:**
- Modify only if verification exposes a defect.

- [ ] **Step 1: Run** `CI=true npm test -- --watchAll=false` and require all suites PASS.
- [ ] **Step 2: Run** `npm run build` and require exit 0.
- [ ] **Step 3: Run** `git diff --check` and require no whitespace errors.
- [ ] **Step 4: Browser-test** JSA unsafe Yes/No triggers, notes context, KML/SHP editing, Point/Line/Shape creation, register edits, feature deletion, mission save, and reopen.
- [ ] **Step 5: Confirm** no map action deletes a mission and no optional feature blocks authorisation.
- [ ] **Step 6: Commit any verified corrections** with a focused message; otherwise record no additional commit.
