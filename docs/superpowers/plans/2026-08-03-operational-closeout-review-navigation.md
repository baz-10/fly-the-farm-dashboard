# Operational Closeout Review Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let operators review and correct every Operational Closeout stage before Mission Completion while preserving immutable revisions and locking the workflow after Completion.

**Architecture:** Keep navigation in `MissionOperationalCloseout` and retain all business rules in the existing versioned API. Derive saved-stage status and the initial review position from persisted server state; corrections call the existing append-only commands with the latest version. Completion Evidence switches the component into read-only historical review.

**Tech Stack:** React, TypeScript, Material UI Stepper, Testing Library, Jest, existing versioned `/api/v1/mission-operational-closeout` contract.

## Global Constraints

- No saved evidence may be updated or deleted.
- Corrections create new immutable revisions using optimistic concurrency.
- Mission Completion references the selected submitted Operational Evidence revision.
- Completion is the lock point; completed closeout evidence is read-only.
- Tenant isolation, operating-location scope, permissions, audit, outbox, and authoritative PostgreSQL persistence remain unchanged.
- No browser-storage or legacy-persistence fallback.

---

### Task 1: Persisted Stage State and Review Navigation

**Files:**
- Modify: `src/components/mission/MissionOperationalCloseout.tsx`
- Test: `src/components/mission/__tests__/MissionOperationalCloseout.test.tsx`

**Interfaces:**
- Consumes: `MissionOperationalCloseoutApi.read(missionId)` and its existing `imports`, `resources`, `chemicals`, `events`, `operationalRevision`, and `completion` fields.
- Produces: clickable closeout steps, persisted initial-stage restoration, and Back/Next review controls without changing the public API.

- [ ] **Step 1: Write failing navigation tests**

Add tests that render persisted pre-completion evidence, assert the initial stage is Operational Review, click `Actual Resources`, then click `Operational Review` and confirm both stages render. Add a refresh test proving persisted resources and chemicals restore the furthest valid stage.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --runInBand src/components/mission/__tests__/MissionOperationalCloseout.test.tsx`

Expected: FAIL because step labels are not selectable and the component always starts at Operational Data Import.

- [ ] **Step 3: Implement minimal persisted-stage navigation**

Add pure helpers:

```ts
export const completedCloseoutStages = (state: any): boolean[] => [
  Boolean(state?.imports?.length),
  Boolean(state?.resources),
  Boolean(state?.chemicals),
  Boolean(state?.events?.length),
  Boolean(state?.operationalRevision),
  Boolean(state?.completion),
];

export const furthestCloseoutStage = (state: any): number => {
  if (state?.completion) return 5;
  if (state?.operationalRevision) return 4;
  if (state?.events?.length) return 4;
  if (state?.chemicals) return 3;
  if (state?.resources) return 2;
  return 0;
};
```

After `read`, restore `active` from `furthestCloseoutStage(loaded)`. Make each `Step` clickable when no Completion Evidence exists and add `Back`/`Review next stage` controls that only change presentation state.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- --runInBand src/components/mission/__tests__/MissionOperationalCloseout.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the navigation slice**

```bash
git add src/components/mission/MissionOperationalCloseout.tsx src/components/mission/__tests__/MissionOperationalCloseout.test.tsx
git commit -m "feat: add closeout review navigation (IMP-MIS-001)"
```

### Task 2: Immutable Corrections and Completion Lock

**Files:**
- Modify: `src/components/mission/MissionOperationalCloseout.tsx`
- Test: `src/components/mission/__tests__/MissionOperationalCloseout.test.tsx`

**Interfaces:**
- Consumes: existing versioned `saveResources`, `saveChemicals`, `saveEvents`, `submit`, and `complete` commands.
- Produces: revision-aware correction copy, refreshed selected revisions, and read-only post-completion review.

- [ ] **Step 1: Write failing correction and lock tests**

Add a test with `resources.version_number = 2`; revisit Actual Resources, save, and assert `saveResources('m1', 2, ...)`. Add a completed-state test that navigates through all stages but finds no save, import, submit, or complete actions and sees `Mission completed · version 1`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --runInBand src/components/mission/__tests__/MissionOperationalCloseout.test.tsx`

Expected: FAIL because completed stages still expose mutation actions and corrections are not identified in the UI.

- [ ] **Step 3: Implement revision-safe correction and locking**

Add a pre-completion notice: `Review any stage before Completion. Saving a correction creates a new immutable revision.` After each successful save, call `load()` so the selected latest revision and version are server-authoritative. When `state.completion` exists, keep step navigation available for historical review but render all fields read-only and hide every mutation action.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- --runInBand src/components/mission/__tests__/MissionOperationalCloseout.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the integrity slice**

```bash
git add src/components/mission/MissionOperationalCloseout.tsx src/components/mission/__tests__/MissionOperationalCloseout.test.tsx
git commit -m "fix: lock completed closeout evidence (IMP-MIS-001)"
```

### Task 3: Full Verification and Production Acceptance

**Files:**
- Modify only if verification uncovers an in-scope defect.

**Interfaces:**
- Consumes: completed Tasks 1 and 2.
- Produces: verified Production Beta behaviour.

- [ ] **Step 1: Run component and service tests**

Run: `npm test -- --runInBand src/components/mission/__tests__/MissionOperationalCloseout.test.tsx src/services/__tests__/missionOperationalCloseoutApi.test.ts`

Expected: PASS.

- [ ] **Step 2: Run the full regression suite**

Run: `npm test -- --runInBand`

Expected: all suites and tests PASS.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: exit code 0 with no new warnings.

- [ ] **Step 4: Deploy the verified branch**

Deploy the existing `codex/production-beta` branch through the established Vercel Production Beta workflow.

- [ ] **Step 5: Run live acceptance**

Open the genuine Mission, revisit each closeout stage, return to Operational Review, submit the selected Operational Evidence, confirm Completion is the explicit lock point, then complete the Mission only after Product Owner confirmation. Refresh and reopen to verify read-only Completion Evidence.

- [ ] **Step 6: Commit any acceptance-only correction and report the operational milestone**

Only commit if Step 5 identifies an in-scope correction. Report what manual process is now eliminated and whether anything still blocks the first complete real Fly The Farm Mission.

