# Mission Workspace Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the existing long Mission Planner into a non-linear, stage-focused Mission Workspace that exposes one operational decision at a time while preserving every authoritative lifecycle capability.

**Architecture:** Keep `MissionPlanning.tsx` as the route-level orchestrator and retain the existing domain components and trusted APIs. Add a small pure Mission Workspace state model, focused presentation components, and one read-only lifecycle hook so stage availability and Mission Status derive from authoritative evidence. The visible stage may be held in the URL for navigation convenience, but PostgreSQL evidence remains the only source of completion truth.

**Tech Stack:** React 19, TypeScript 4.9, Material UI 7, React Router 7, Jest, React Testing Library, existing Spray Command application services.

## Global Constraints

- Implement a Mission Workspace, not a wizard.
- Display one active workspace and keep the full nine-stage lifecycle visible.
- Navigation is non-linear; `Save & Next` advances sequentially after an authoritative save succeeds.
- Every available stage remains clickable; completed and Needs Review stages remain accessible.
- Preserve targeted downstream invalidation and do not block movement unnecessarily.
- Keep the breadcrumb `Client > Property > Field > Mission` visible.
- The Mission Status sections are `Needs Attention`, `Needs Review`, and `Complete`.
- Operational Closeout remains visible as `Available after Mission Authorisation` until authorised.
- Mission Outcomes and Customer Outcome remain visible as `Available after Completion` until complete.
- Each stage answers exactly the approved operational question recorded in the design.
- Existing routes, APIs, permissions, tenant isolation, operating-location scope, audit, outbox, optimistic concurrency, RLS, and immutable evidence remain unchanged.
- No browser or legacy persistence fallback.
- No database migration and no synthetic operational records.

---

## File Structure

- Create `src/types/missionWorkspace.ts`: stage IDs, stage definition, display state, and lifecycle summary contracts.
- Create `src/utils/missionWorkspace.ts`: repository-controlled stage catalogue and pure derivation helpers.
- Create `src/utils/__tests__/missionWorkspace.test.ts`: stage mapping, availability, active-stage, status grouping, and one-question rules.
- Create `src/components/mission/MissionWorkspaceNavigation.tsx`: context bar and always-visible stage navigation.
- Create `src/components/mission/MissionStatusPanel.tsx`: Needs Attention, Needs Review, and Complete summary.
- Create `src/components/mission/__tests__/MissionWorkspaceNavigation.test.tsx`: navigation, breadcrumb, responsive semantics, and accessibility.
- Create `src/components/mission/__tests__/MissionStatusPanel.test.tsx`: grouping, direct actions, and empty states.
- Create `src/hooks/useMissionWorkspaceLifecycle.ts`: authoritative authorisation/completion read projection.
- Create `src/hooks/__tests__/useMissionWorkspaceLifecycle.test.tsx`: loading, refresh, error, authorisation, and completion behaviour.
- Modify `src/pages/MissionPlanning.tsx`: compose one active stage, connect Save & Next, URL stage selection, status panel, and lifecycle availability.
- Modify `src/pages/MissionRemoteWorkflow.test.tsx`: integration regression for all nine stages and preserved authoritative workflows.
- Modify `src/utils/missionStepper.ts`: preserve existing setup functions and expose the six planning-stage evidence results to the workspace mapper without weakening existing state semantics.
- Modify `src/utils/__tests__/missionStepper.test.ts`: retain targeted invalidation coverage after the presentation-stage mapping.
- Modify `src/components/mission/MissionAuthorisation.tsx`: emit an optional lifecycle refresh callback after authorisation/report actions.
- Modify `src/components/mission/MissionOperationalCloseout.tsx`: emit an optional lifecycle refresh callback after operational/completion mutations.

---

### Task 1: Define the Mission Workspace State Model

**Files:**
- Create: `src/types/missionWorkspace.ts`
- Create: `src/utils/missionWorkspace.ts`
- Create: `src/utils/__tests__/missionWorkspace.test.ts`
- Modify: `src/utils/missionStepper.ts`
- Modify: `src/utils/__tests__/missionStepper.test.ts`

**Interfaces:**
- Consumes: `MissionStepStatus` from `src/utils/missionStepper.ts`.
- Produces: `MISSION_WORKSPACE_STAGES`, `deriveMissionWorkspaceStages`, `selectInitialMissionStage`, and `groupMissionStatusItems`.

- [ ] **Step 1: Write the failing catalogue and mapping tests**

```ts
import {
  MISSION_WORKSPACE_STAGES,
  deriveMissionWorkspaceStages,
  selectInitialMissionStage,
} from '../missionWorkspace';

test('defines the complete lifecycle and one operational question per stage', () => {
  expect(MISSION_WORKSPACE_STAGES.map((stage) => [stage.id, stage.question])).toEqual([
    ['mission', 'What am I doing?'],
    ['map', 'Where am I working?'],
    ['resources', 'What am I taking?'],
    ['weather-chemicals', 'What conditions am I expecting and what am I applying?'],
    ['jsa', 'Is it safe?'],
    ['review', 'Am I ready to fly?'],
    ['operational-closeout', 'What actually happened?'],
    ['mission-outcomes', 'How effective was the work?'],
    ['customer-outcome', 'What did the customer think?'],
  ]);
});

test('keeps later lifecycle stages visible with authoritative availability reasons', () => {
  const stages = deriveMissionWorkspaceStages({
    planningSteps: completePlanningSteps,
    authorised: false,
    completed: false,
  });
  expect(stages.find((stage) => stage.id === 'operational-closeout')).toMatchObject({
    available: false,
    reason: 'Available after Mission Authorisation',
  });
  expect(stages.find((stage) => stage.id === 'mission-outcomes')).toMatchObject({
    available: false,
    reason: 'Available after Completion',
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `CI=true npm test -- --runInBand --watchAll=false src/utils/__tests__/missionWorkspace.test.ts`  
Expected: FAIL because the Mission Workspace types and derivation functions do not exist.

- [ ] **Step 3: Add the explicit types and repository-controlled catalogue**

```ts
export type MissionWorkspaceStageId =
  | 'mission' | 'map' | 'resources' | 'weather-chemicals' | 'jsa' | 'review'
  | 'operational-closeout' | 'mission-outcomes' | 'customer-outcome';

export type MissionWorkspaceStage = {
  id: MissionWorkspaceStageId;
  label: string;
  question: string;
  state: MissionStepState;
  reason: string;
  available: boolean;
};

export const MISSION_WORKSPACE_STAGES = [
  { id: 'mission', label: 'Mission', question: 'What am I doing?' },
  { id: 'map', label: 'Map', question: 'Where am I working?' },
  { id: 'resources', label: 'Resources', question: 'What am I taking?' },
  { id: 'weather-chemicals', label: 'Weather & Chemicals', question: 'What conditions am I expecting and what am I applying?' },
  { id: 'jsa', label: 'JSA', question: 'Is it safe?' },
  { id: 'review', label: 'Review', question: 'Am I ready to fly?' },
  { id: 'operational-closeout', label: 'Operational Closeout', question: 'What actually happened?' },
  { id: 'mission-outcomes', label: 'Mission Outcomes', question: 'How effective was the work?' },
  { id: 'customer-outcome', label: 'Customer Outcome', question: 'What did the customer think?' },
] as const;
```

Map the existing Customer → Mission evidence into the single Mission workspace stage, then map existing Map, Resources, Weather & Chemicals, JSA, and Review states without changing their meanings. Derive lifecycle-stage availability from authoritative `authorised` and `completed` booleans.

- [ ] **Step 4: Preserve and extend targeted invalidation tests**

Add assertions that a Field change leaves Resources complete while marking Map, Weather & Chemicals, and JSA for review, and an Aircraft change marks only the dependent JSA stage for review.

- [ ] **Step 5: Run state-model tests and verify GREEN**

Run: `CI=true npm test -- --runInBand --watchAll=false src/utils/__tests__/missionWorkspace.test.ts src/utils/__tests__/missionStepper.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit the state model**

```bash
git add src/types/missionWorkspace.ts src/utils/missionWorkspace.ts src/utils/missionStepper.ts src/utils/__tests__/missionWorkspace.test.ts src/utils/__tests__/missionStepper.test.ts
git commit -m "IMP-MIS-002 define mission workspace stages"
```

---

### Task 2: Build the Context Bar and Always-Visible Navigation

**Files:**
- Create: `src/components/mission/MissionWorkspaceNavigation.tsx`
- Create: `src/components/mission/__tests__/MissionWorkspaceNavigation.test.tsx`

**Interfaces:**
- Consumes: `MissionWorkspaceStage[]`, parent entity IDs/names, Mission identity, active stage, and `onStageSelect`.
- Produces: `MissionContextBar` and `MissionWorkspaceStepper` named exports.

- [ ] **Step 1: Write failing component tests**

```tsx
render(<MissionWorkspaceStepper stages={stages} activeStage="map" onStageSelect={select} />);
expect(screen.getByRole('button', { name: /Map — Current/i })).toHaveAttribute('aria-current', 'step');
expect(screen.getByRole('button', { name: /Mission — Complete/i })).toBeEnabled();
expect(screen.getByRole('button', { name: /Operational Closeout — Available after Mission Authorisation/i })).toBeEnabled();

await user.click(screen.getByRole('button', { name: /Mission — Complete/i }));
expect(select).toHaveBeenCalledWith('mission');
```

Add a breadcrumb test proving Client, Property, Field, and Mission appear in order, available parents call their existing routes, and the Mission item is current rather than a duplicate link.

- [ ] **Step 2: Run the component test and verify RED**

Run: `CI=true npm test -- --runInBand --watchAll=false src/components/mission/__tests__/MissionWorkspaceNavigation.test.tsx`  
Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement the context bar and stepper with normal responsive flow**

Use Material UI `Breadcrumbs`, `ButtonBase`/`StepButton`, `Stack`, and status text. Expose state in the accessible name and text; do not rely on colour alone. Keep the stepper horizontally scrollable on narrower layouts without hiding any lifecycle stage.

```tsx
<MissionWorkspaceStepper
  stages={workspaceStages}
  activeStage={activeStage}
  onStageSelect={setActiveStage}
/>
```

Selecting an unavailable lifecycle stage calls `onStageSelect` so the active workspace can explain its prerequisite; it does not expose premature mutations.

- [ ] **Step 4: Run the component test and verify GREEN**

Run: `CI=true npm test -- --runInBand --watchAll=false src/components/mission/__tests__/MissionWorkspaceNavigation.test.tsx`  
Expected: PASS.

- [ ] **Step 5: Commit navigation components**

```bash
git add src/components/mission/MissionWorkspaceNavigation.tsx src/components/mission/__tests__/MissionWorkspaceNavigation.test.tsx
git commit -m "IMP-MIS-002 add mission workspace navigation"
```

---

### Task 3: Build the Mission Status Health Summary

**Files:**
- Create: `src/components/mission/MissionStatusPanel.tsx`
- Create: `src/components/mission/__tests__/MissionStatusPanel.test.tsx`

**Interfaces:**
- Consumes: grouped status items from `groupMissionStatusItems(stages)` and `onStageSelect`.
- Produces: a responsive `MissionStatusPanel` with direct stage actions.

- [ ] **Step 1: Write failing status-panel tests**

```tsx
render(<MissionStatusPanel groups={groups} onStageSelect={select} />);
expect(screen.getByRole('heading', { name: 'Mission Status' })).toBeVisible();
expect(screen.getByRole('heading', { name: 'Needs Attention' })).toBeVisible();
expect(screen.getByRole('heading', { name: 'Needs Review' })).toBeVisible();
expect(screen.getByRole('heading', { name: 'Complete' })).toBeVisible();
await user.click(screen.getByRole('button', { name: /Fix Map/i }));
expect(select).toHaveBeenCalledWith('map');
```

Cover calm empty states (`Nothing needs attention`) and ensure unavailable future stages are informative rather than incorrectly counted as current blockers.

- [ ] **Step 2: Run the component test and verify RED**

Run: `CI=true npm test -- --runInBand --watchAll=false src/components/mission/__tests__/MissionStatusPanel.test.tsx`  
Expected: FAIL because the panel does not exist.

- [ ] **Step 3: Implement the status panel**

Render plain-language reason first, then a compact direct action. On desktop use the right rail. On tablet/mobile render a summary card whose detail uses Material UI `Accordion`; it must remain in normal document flow and must not cover active-stage validation or actions.

- [ ] **Step 4: Run the component test and verify GREEN**

Run: `CI=true npm test -- --runInBand --watchAll=false src/components/mission/__tests__/MissionStatusPanel.test.tsx`  
Expected: PASS.

- [ ] **Step 5: Commit the Mission Status panel**

```bash
git add src/components/mission/MissionStatusPanel.tsx src/components/mission/__tests__/MissionStatusPanel.test.tsx
git commit -m "IMP-MIS-002 add mission status summary"
```

---

### Task 4: Add Authoritative Lifecycle Availability

**Files:**
- Create: `src/hooks/useMissionWorkspaceLifecycle.ts`
- Create: `src/hooks/__tests__/useMissionWorkspaceLifecycle.test.tsx`
- Modify: `src/components/mission/MissionAuthorisation.tsx`
- Modify: `src/components/mission/MissionOperationalCloseout.tsx`
- Modify: their existing component tests.

**Interfaces:**
- Consumes: `missionId`, existing authorisation API, and existing operational-closeout API.
- Produces: `{ authorised, completed, loading, error, refresh }`.

- [ ] **Step 1: Write failing lifecycle hook tests**

```tsx
const { result } = renderHook(() => useMissionWorkspaceLifecycle('mission-1'));
await waitFor(() => expect(result.current.loading).toBe(false));
expect(result.current).toMatchObject({ authorised: true, completed: true, error: null });
```

Cover no authorisation, authorised but incomplete, completed, API failure, and refresh after a child mutation. Assert that API failure leaves later stages unavailable rather than assuming success.

- [ ] **Step 2: Run lifecycle tests and verify RED**

Run: `CI=true npm test -- --runInBand --watchAll=false src/hooks/__tests__/useMissionWorkspaceLifecycle.test.tsx`  
Expected: FAIL because the hook does not exist.

- [ ] **Step 3: Implement the read-only lifecycle projection**

Use the existing service factories only. Do not persist a second lifecycle state and do not inspect browser storage.

```ts
export function useMissionWorkspaceLifecycle(missionId: string | undefined) {
  // Read exact authorisation and completion evidence through existing APIs.
  // Fail closed to authorised=false/completed=false when unavailable.
  return { authorised, completed, loading, error, refresh };
}
```

Add optional `onLifecycleChanged?: () => void` props to Mission Authorisation and Operational Closeout. Invoke them only after successful authoritative mutations or report state changes that may affect availability.

- [ ] **Step 4: Run lifecycle and affected component tests**

Run: `CI=true npm test -- --runInBand --watchAll=false src/hooks/__tests__/useMissionWorkspaceLifecycle.test.tsx src/components/mission/__tests__/MissionAuthorisation.test.tsx src/components/mission/__tests__/MissionOperationalCloseout.test.tsx`  
Expected: PASS.

- [ ] **Step 5: Commit lifecycle availability**

```bash
git add src/hooks/useMissionWorkspaceLifecycle.ts src/hooks/__tests__/useMissionWorkspaceLifecycle.test.tsx src/components/mission/MissionAuthorisation.tsx src/components/mission/MissionOperationalCloseout.tsx src/components/mission/__tests__/MissionAuthorisation.test.tsx src/components/mission/__tests__/MissionOperationalCloseout.test.tsx
git commit -m "IMP-MIS-002 derive mission lifecycle availability"
```

---

### Task 5: Compose the Stage-Focused Mission Workspace

**Files:**
- Modify: `src/pages/MissionPlanning.tsx`
- Modify: `src/pages/MissionRemoteWorkflow.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–4 exports and all existing Mission domain components.
- Produces: the deployed stage-focused `/missions/:missionId` workspace.

- [ ] **Step 1: Replace the current all-panels-visible assertion with failing workspace assertions**

```tsx
render(<MissionPlanning />);
expect(screen.getByRole('heading', { name: 'What am I doing?' })).toBeVisible();
expect(screen.getByRole('button', { name: /Mission — Current|Mission — Complete/i })).toBeEnabled();
expect(screen.getByRole('button', { name: /Map —/i })).toBeEnabled();
expect(screen.queryByRole('heading', { name: 'Where am I working?' })).not.toBeInTheDocument();

fireEvent.click(screen.getByRole('button', { name: /Map —/i }));
expect(screen.getByRole('heading', { name: 'Where am I working?' })).toBeVisible();
expect(screen.queryByRole('heading', { name: 'What am I doing?' })).not.toBeInTheDocument();
```

Add assertions for the context breadcrumb, Mission Status groups, all nine stage labels, and future-stage prerequisite messages.

- [ ] **Step 2: Run the Mission integration test and verify RED**

Run: `CI=true npm test -- --runInBand --watchAll=false src/pages/MissionRemoteWorkflow.test.tsx`  
Expected: FAIL because the current page renders all panels together and the nine-stage workspace does not exist.

- [ ] **Step 3: Replace scroll targets with active-stage composition**

Keep existing form state and data loading in `MissionPlanning.tsx`. Replace `openStep` scrolling with an `activeStage` selected from a validated `stage` query parameter, falling back to `selectInitialMissionStage(workspaceStages)`.

```tsx
const showStage = (stage: MissionWorkspaceStageId) => {
  const next = new URLSearchParams(searchParams);
  next.set('stage', stage);
  setSearchParams(next, { replace: true });
};
```

Render only the active stage content. The stage heading is the approved operational question. Existing components remain intact inside the appropriate stage.

- [ ] **Step 4: Implement authoritative Save & Next**

For Mission details, await the existing `save()` command and return an explicit success result before advancing. For Map, await `saveMap()`. For component-owned evidence, wire an optional `onSaved` callback only where the existing component can truthfully confirm persistence; otherwise show a non-saving `Next` action after authoritative state already reports completion.

```ts
const saveMissionAndNext = async () => {
  const saved = await save();
  if (saved) showStage('map');
};
```

Never advance on validation or server failure. Preserve current form values and map state.

- [ ] **Step 5: Place all authoritative components into the approved stages**

Use the mapping in the design. Remove `Downstream Mission Workflow` and the duplicate `Authoritative parent chain` card because the context bar and visible lifecycle now answer those needs. Keep archive and back-to-register as secondary actions.

- [ ] **Step 6: Connect Mission Status actions and lifecycle refresh**

Pass `showStage` to Mission Status. Pass `lifecycle.refresh` to Authorisation and Closeout callbacks. Show lifecycle load failures as a stage-availability warning; do not enable later stages.

- [ ] **Step 7: Run integration tests and verify GREEN**

Run: `CI=true npm test -- --runInBand --watchAll=false src/pages/MissionRemoteWorkflow.test.tsx`  
Expected: PASS.

- [ ] **Step 8: Commit the integrated workspace**

```bash
git add src/pages/MissionPlanning.tsx src/pages/MissionRemoteWorkflow.test.tsx
git commit -m "IMP-MIS-002 compose stage-focused mission workspace"
```

---

### Task 6: Verify Non-Linear Navigation, Invalidation, Responsiveness, and Regression Safety

**Files:**
- Modify: `src/pages/MissionRemoteWorkflow.test.tsx`
- Modify: `src/components/mission/__tests__/MissionWorkspaceNavigation.test.tsx`
- Modify: `src/components/mission/__tests__/MissionStatusPanel.test.tsx`
- Modify: `docs/superpowers/specs/2026-08-06-mission-workspace-refinement-design.md` only if implementation reveals a wording correction that does not change approved scope.

**Interfaces:**
- Consumes: completed Mission Workspace implementation.
- Produces: release evidence for Product Owner review.

- [ ] **Step 1: Add non-linear navigation and failure-preservation regressions**

Test all of the following explicitly:

```ts
// Completed earlier stage remains directly accessible.
// Needs Review remains visible and opens the affected stage.
// Unavailable lifecycle stage opens its prerequisite explanation only.
// Save & Next does not advance after updateMission rejects.
// Save & Next advances after updateMission resolves.
// Field invalidation does not invalidate Resources.
// Aircraft invalidation does not invalidate Map or Weather & Chemicals.
// A reload with ?stage=resources restores the visible stage but derives completion from authoritative evidence.
```

- [ ] **Step 2: Run the complete Mission-focused suite**

Run:

```bash
CI=true npm test -- --runInBand --watchAll=false \
  src/utils/__tests__/missionWorkspace.test.ts \
  src/utils/__tests__/missionStepper.test.ts \
  src/components/mission/__tests__/MissionWorkspaceNavigation.test.tsx \
  src/components/mission/__tests__/MissionStatusPanel.test.tsx \
  src/hooks/__tests__/useMissionWorkspaceLifecycle.test.tsx \
  src/pages/MissionRemoteWorkflow.test.tsx \
  src/components/mission/__tests__/MissionAuthorisation.test.tsx \
  src/components/mission/__tests__/MissionOperationalCloseout.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run the full regression suite**

Run: `CI=true npm test -- --runInBand --watchAll=false`  
Expected: all suites and tests PASS with no snapshots silently updated.

- [ ] **Step 4: Run the production build**

Run: `npm run build`  
Expected: exit code 0 with no TypeScript compilation error.

- [ ] **Step 5: Perform focused responsive and accessibility inspection**

Open a genuine persisted Mission in the local production build or approved deployed preview and verify:

- Desktop: full stepper, active workspace, and Mission Status rail are visible without overlap.
- Tablet: lifecycle remains reachable and Mission Status does not cover content.
- Mobile: breadcrumb, active stage, all lifecycle stages, validation, and Save & Next remain reachable in normal flow.
- Keyboard: every available step is focusable, active stage is announced, and colour is not the only status signal.
- No action mutates genuine data during visual inspection unless separately authorised.

- [ ] **Step 6: Commit verification refinements**

```bash
git add src/pages/MissionRemoteWorkflow.test.tsx src/components/mission/__tests__/MissionWorkspaceNavigation.test.tsx src/components/mission/__tests__/MissionStatusPanel.test.tsx docs/superpowers/specs/2026-08-06-mission-workspace-refinement-design.md
git commit -m "IMP-MIS-002 verify mission workspace flow"
```

- [ ] **Step 7: Confirm clean handoff state**

Run: `git status --short --branch`  
Expected: the worktree is clean and `codex/production-beta` contains only the reviewed Mission Workspace commits beyond its approved remote base.

## Deployment Gate

Do not push, migrate, or deploy as part of this plan unless the Product Owner separately grants the required release authority. This refinement is expected to require no database migration. Before any approved deployment, run the repository's secret/environment checks, full test suite, production build, and Vercel function-limit verification, then validate a genuine Mission without manufacturing operational evidence.
