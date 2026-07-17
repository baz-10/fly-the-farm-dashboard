# Multi-Aircraft Mission Work Packs Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement this plan task-by-task.

**Goal:** Let one mission operate up to three mixed-model aircraft, each with its own kit, pilot, readiness, execution, and actuals, with approved field substitutions.

**Architecture:** Replace the single mission aircraft configuration with an additive `aircraftAssignments` collection and embed a work-pack snapshot in the mission. A migration adapter reads old missions as a one-aircraft assignment. Aggregate mission status remains the parent workflow; readiness and actuals are tracked per assignment.

**Tech Stack:** React, TypeScript, Material UI, Jest, Testing Library, existing mission context and workflow utilities.

---

### Task 1: Add migration-safe multi-aircraft mission types

**Files:**
- Modify: `src/types/mission.ts`
- Create: `src/utils/missionAircraftAssignments.ts`
- Create: `src/utils/__tests__/missionAircraftAssignments.test.ts`

**Step 1: Write failing migration and invariant tests**

Test legacy single-aircraft conversion, mixed T100/T50 assignments, unique aircraft/kit assignment IDs, maximum of three active assignments, and rejection of duplicate aircraft.

**Step 2: Run and verify failure**

Run: `npm test -- --watchAll=false src/utils/__tests__/missionAircraftAssignments.test.ts`
Expected: FAIL because collection helpers do not exist.

**Step 3: Implement types and adapters**

Add `MissionAircraftAssignment` with `aircraftId`, `kitId`, optional configuration override, pilot ID, readiness checklist, assignment status, estimates, actuals, and substitution audit. Add `aircraftAssignments?: MissionAircraftAssignment[]` and `workPack?: WorkPackSnapshot`; retain deprecated `aircraftConfiguration` for reads. Export `getMissionAircraftAssignments`, `addMissionAircraftAssignment`, `replaceMissionAircraftAssignment`, and `validateMissionAircraftAssignments`.

**Step 4: Verify and commit**

Run focused tests; expect PASS.

```bash
git add src/types/mission.ts src/utils/missionAircraftAssignments.ts src/utils/__tests__/missionAircraftAssignments.test.ts
git commit -m "feat: model multi-aircraft mission assignments"
```

### Task 2: Update MissionContext persistence and lifecycle

**Files:**
- Modify: `src/contexts/MissionContext.tsx`
- Create: `src/contexts/__tests__/MissionContext.multiAircraft.test.tsx`

**Step 1: Write failing lifecycle tests**

Create one mission with two T100s and one T50, update readiness independently, start the parent mission, record each aircraft result, and complete only when required assignments have final results or an approved removal.

**Step 2: Run and verify failure**

Run: `npm test -- --watchAll=false src/contexts/__tests__/MissionContext.multiAircraft.test.tsx`
Expected: FAIL under the single configuration model.

**Step 3: Implement collection-aware mission operations**

Normalise missions on load, persist arrays, aggregate estimates/actuals, append assignment audit events, and preserve current mission status semantics. Do not delete legacy fields during initial migration.

**Step 4: Verify and commit**

Run focused context tests and existing mission tests; expect PASS.

```bash
git add src/contexts/MissionContext.tsx src/contexts/__tests__/MissionContext.multiAircraft.test.tsx
git commit -m "feat: persist multi-aircraft mission lifecycle"
```

### Task 3: Build the mission work-pack planning step

**Files:**
- Create: `src/components/mission/MissionWorkPackEditor.tsx`
- Create: `src/components/mission/__tests__/MissionWorkPackEditor.test.tsx`
- Modify: `src/pages/MissionPlanning.tsx`

**Step 1: Write failing interaction tests**

Apply a reusable template, select a truck, add a T100 and kit, add a T50 and kit, assign pilots, add a third aircraft, and verify the fourth add is disabled with a clear limit message. Confirm job edits do not mutate the template.

**Step 2: Run and verify failure**

Run: `npm test -- --watchAll=false src/components/mission/__tests__/MissionWorkPackEditor.test.tsx`
Expected: FAIL because the editor does not exist.

**Step 3: Implement the editor and integrate it**

Extract the current aircraft/equipment panel into assignment cards. Each card filters kits by model compatibility, shows readiness, pilot and limits, and supports remove/replace. Add truck selection and “Apply template”; save a snapshot into the mission.

**Step 4: Verify and commit**

Run focused UI tests and build; expect PASS.

```bash
git add src/components/mission/MissionWorkPackEditor.tsx src/components/mission/__tests__/MissionWorkPackEditor.test.tsx src/pages/MissionPlanning.tsx
git commit -m "feat: plan mixed-fleet mission work packs"
```

### Task 4: Add field substitutions and per-aircraft execution

**Files:**
- Create: `src/components/mission/MissionAircraftExecution.tsx`
- Create: `src/components/mission/__tests__/MissionAircraftExecution.test.tsx`
- Modify: `src/pages/MissionPlanning.tsx`
- Modify: `src/utils/missionWorkflow.ts`
- Modify: `src/utils/__tests__/missionWorkflow.test.ts`

**Step 1: Write failing operational tests**

During a flying mission, replace an unavailable T100 with another compatible T100, require a reason and field-supervisor approval, preserve the original assignment in audit history, and record separate hectares/hours/chemical use for each active aircraft.

**Step 2: Run and verify failure**

Run: `npm test -- --watchAll=false src/components/mission/__tests__/MissionAircraftExecution.test.tsx src/utils/__tests__/missionWorkflow.test.ts`
Expected: FAIL because substitutions and aggregate completion rules do not exist.

**Step 3: Implement execution controls**

Provide per-aircraft readiness/start/complete controls. Permit substitutions for the field-supervisor capability, record approver/time/reason/from/to, re-run compatibility/readiness, and block parent completion until all active assignments resolve.

**Step 4: Verify end-to-end regression**

Run: `npm test -- --watchAll=false`
Expected: all tests pass.

Run: `npm run build`
Expected: successful production build.

**Step 5: Commit**

```bash
git add src/components/mission/MissionAircraftExecution.tsx src/components/mission/__tests__/MissionAircraftExecution.test.tsx src/pages/MissionPlanning.tsx src/utils/missionWorkflow.ts src/utils/__tests__/missionWorkflow.test.ts
git commit -m "feat: execute and substitute mission aircraft"
```
