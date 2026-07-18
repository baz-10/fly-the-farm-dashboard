# Optional Deployment Work Packs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let missions optionally snapshot any combination of trucks, trailers, aircraft, kits, crew, and tow-vehicle notes without adding commercial authorisation blockers.

**Architecture:** Extend the existing work-pack domain with backward-compatible deployment assets, then add a pure snapshot builder that copies templates or custom selections into a mission. Mission Planning renders a collapsed optional editor backed by those pure functions, while the existing first-aircraft configuration remains populated for legacy workflow compatibility.

**Tech Stack:** React 18, TypeScript, Material UI, Jest, React Testing Library, existing shared persistence and mission/work-pack contexts.

## Global Constraints

- Trucks and trailers are independent optional deployment assets.
- A trailer may be selected without a managed truck.
- Optional tow-vehicle details are never required.
- A mission supports up to three aircraft in this release.
- Missing fleet, template, assignment, kit-cost, or commercial data may not block mission authorisation.
- Contractors see operational assignments but no costs, margins, or profitability.
- Existing truck profiles and single-aircraft mission consumers remain backward compatible.
- The broader New Mission redesign is out of scope.

---

### Task 1: Generalise Truck Profiles into Deployment Assets

**Files:**
- Modify: `src/types/workPack.ts`
- Modify: `src/contexts/WorkPackContext.tsx`
- Modify: `src/contexts/__tests__/WorkPackContext.test.tsx`

**Interfaces:**
- Produces: `DeploymentAssetType`, `DeploymentAsset`, `DeploymentAssetInput`
- Produces: `normaliseDeploymentAssets(store): DeploymentAsset[]`
- Preserves: `TruckProfile` and `TruckProfileInput` aliases for existing consumers

- [ ] **Step 1: Write failing compatibility tests**

Add tests proving that an existing truck record is exposed as a `truck` deployment asset and that a newly created `trailer` persists independently:

```tsx
test('normalises legacy trucks and persists independent trailers', async () => {
  localStorage.setItem('ftf_work_packs', JSON.stringify({
    trucks: [{ ...truck, id: 'truck-1', createdAt: now, updatedAt: now }],
    templates: [],
    snapshots: [],
  }));
  renderWorkPackProvider();
  expect(await screen.findByText('truck:Legacy truck')).toBeInTheDocument();
  await act(() => result.current.createAsset({ ...truck, assetType: 'trailer', name: 'Spray trailer' }));
  expect(result.current.assets.some((asset) => asset.assetType === 'trailer')).toBe(true);
});
```

- [ ] **Step 2: Run the test and confirm the red state**

Run: `npm test -- --watchAll=false src/contexts/__tests__/WorkPackContext.test.tsx`

Expected: FAIL because `assets`, `createAsset`, and `assetType` do not exist.

- [ ] **Step 3: Add the deployment-asset types and migration**

Define the shared profile and compatibility aliases:

```ts
export type DeploymentAssetType = 'truck' | 'trailer';

export interface DeploymentAsset extends Omit<TruckProfile, 'id' | 'createdAt' | 'updatedAt'> {
  id: string;
  assetType: DeploymentAssetType;
  createdAt: string;
  updatedAt: string;
}

export type DeploymentAssetInput = Omit<DeploymentAsset, 'id' | 'createdAt' | 'updatedAt'>;
```

Update `WorkPackContext` to expose `assets`, `createAsset`, `updateAsset`, and `archiveAsset`. On read, map legacy `trucks` records to `assetType: 'truck'`; on write, store `assets` while retaining a derived `trucks` array during this release.

- [ ] **Step 4: Run the focused tests**

Run: `npm test -- --watchAll=false src/contexts/__tests__/WorkPackContext.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the asset model**

```bash
git add src/types/workPack.ts src/contexts/WorkPackContext.tsx src/contexts/__tests__/WorkPackContext.test.tsx
git commit -m "feat: support truck and trailer deployment assets"
```

---

### Task 2: Build Stable Mission Work-Pack Snapshots

**Files:**
- Modify: `src/types/workPack.ts`
- Modify: `src/types/mission.ts`
- Create: `src/utils/missionWorkPack.ts`
- Create: `src/utils/__tests__/missionWorkPack.test.ts`

**Interfaces:**
- Produces: `MissionDeploymentWorkPack`
- Produces: `buildMissionWorkPack(input: MissionWorkPackDraft): MissionDeploymentWorkPack | undefined`
- Produces: `applyWorkPackTemplate(template, assets): MissionWorkPackDraft`
- Produces: `syncPrimaryAircraftConfiguration(workPack, fallback): MissionRecord['aircraftConfiguration']`

- [ ] **Step 1: Write failing snapshot tests**

Cover template copying, independent trailers, optional tow details, a maximum of three assignments, and immutable source data:

```ts
test('copies selected assets and assignments into a stable mission snapshot', () => {
  const draft = applyWorkPackTemplate(template, [truckAsset, trailerAsset]);
  const snapshot = buildMissionWorkPack({
    ...draft,
    towVehicle: { registration: 'PRIVATE-UTE', driver: 'Sam', notes: '' },
  });
  expect(snapshot?.assets.map((asset) => asset.assetType)).toEqual(['truck', 'trailer']);
  expect(snapshot?.towVehicle?.registration).toBe('PRIVATE-UTE');
  trailerAsset.name = 'Changed later';
  expect(snapshot?.assets[1].name).not.toBe('Changed later');
});

test('rejects a fourth aircraft assignment', () => {
  expect(() => buildMissionWorkPack({ ...draft, aircraftAssignments: fourAssignments }))
    .toThrow('A mission work pack supports up to 3 aircraft.');
});
```

- [ ] **Step 2: Run the tests and confirm the red state**

Run: `npm test -- --watchAll=false src/utils/__tests__/missionWorkPack.test.ts`

Expected: FAIL because the module and mission snapshot type do not exist.

- [ ] **Step 3: Implement the pure snapshot functions**

Add optional carrying-asset references and tow details:

```ts
export interface MissionWorkPackAircraftAssignment extends WorkPackAircraftAssignment {
  carryingAssetId?: string;
}

export interface TowVehicleDetails {
  registration?: string;
  driver?: string;
  notes?: string;
}

export interface MissionDeploymentWorkPack {
  sourceTemplateId?: string;
  assets: DeploymentAsset[];
  towVehicle?: TowVehicleDetails;
  aircraftAssignments: MissionWorkPackAircraftAssignment[];
  crewRequirements: CrewRequirement[];
  checklist: string[];
  notes: string;
  estimatedDeploymentCost?: number;
  costingComplete: boolean;
  createdAt: string;
}
```

Add `deploymentWorkPack?: MissionDeploymentWorkPack` to `MissionRecord`. Deep-copy arrays and objects in the builder. Return `undefined` for a fully empty draft. Preserve the first assignment through `syncPrimaryAircraftConfiguration`.

- [ ] **Step 4: Run the focused tests**

Run: `npm test -- --watchAll=false src/utils/__tests__/missionWorkPack.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit snapshot support**

```bash
git add src/types/workPack.ts src/types/mission.ts src/utils/missionWorkPack.ts src/utils/__tests__/missionWorkPack.test.ts
git commit -m "feat: snapshot deployment work packs on missions"
```

---

### Task 3: Add the Optional Mission Work-Pack Editor

**Files:**
- Create: `src/components/mission/MissionDeploymentWorkPack.tsx`
- Create: `src/components/mission/__tests__/MissionDeploymentWorkPack.test.tsx`
- Modify: `src/pages/MissionPlanning.tsx`

**Interfaces:**
- Consumes: `DeploymentAsset[]`, `WorkPackTemplate[]`, `Aircraft[]`, `EquipmentKit[]`
- Consumes/produces: `MissionWorkPackDraft | undefined`
- Callback: `onChange(next: MissionWorkPackDraft | undefined): void`

- [ ] **Step 1: Write failing interaction tests**

Verify the optional and non-blocking interaction:

```tsx
test('allows a mission to continue with no deployment assets', async () => {
  renderEditor({ assets: [], value: undefined });
  expect(screen.getByText('No deployment assets added — continue without one.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Skip for now' })).toBeEnabled();
});

test('supports a trailer and tow notes without a managed truck', async () => {
  renderEditor({ assets: [trailer], value: undefined });
  await user.click(screen.getByRole('checkbox', { name: 'Spray trailer' }));
  await user.type(screen.getByLabelText('Tow vehicle registration'), '123ABC');
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
    selectedAssetIds: [trailer.id],
    towVehicle: expect.objectContaining({ registration: '123ABC' }),
  }));
});
```

Also test applying a template, adding mixed aircraft up to three, compatible-kit filtering, carrying-asset selection, and clearing with `Skip for now`.

- [ ] **Step 2: Run the component tests and confirm the red state**

Run: `npm test -- --watchAll=false src/components/mission/__tests__/MissionDeploymentWorkPack.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the collapsed editor**

Build a Material UI accordion titled `Deployment Work Pack (Optional)` with:

- saved-template selector and `Apply template` action;
- independent truck/trailer multi-selection;
- conditional optional tow-vehicle registration, driver, and notes;
- up to three aircraft assignment rows;
- compatible kit and carrying-asset selectors per row;
- `Add aircraft` disabled at three rows;
- crew/checklist summary from the selected template;
- `Skip for now` action.

Do not add required validation to the panel.

- [ ] **Step 4: Integrate the editor into Mission Planning**

Place the editor immediately below the existing `Aircraft & Equipment` panel. Load any saved `deploymentWorkPack` into an editable draft. During mission save, call `buildMissionWorkPack` and set `aircraftConfiguration` from the first work-pack aircraft when present; otherwise preserve the existing single-aircraft selection.

- [ ] **Step 5: Run editor and existing mission tests**

Run: `npm test -- --watchAll=false src/components/mission/__tests__/MissionDeploymentWorkPack.test.tsx src/components/mission/__tests__/MissionEquipmentSelector.test.tsx src/utils/__tests__/missionWorkflow.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the planner integration**

```bash
git add src/components/mission/MissionDeploymentWorkPack.tsx src/components/mission/__tests__/MissionDeploymentWorkPack.test.tsx src/pages/MissionPlanning.tsx
git commit -m "feat: add optional deployment work packs to missions"
```

---

### Task 4: Update Fleet Profiles and Templates for Trailers

**Files:**
- Modify: `src/pages/FleetWorkPacks.tsx`
- Modify: `src/components/TruckProfileForm.tsx`
- Modify: `src/components/WorkPackTemplateForm.tsx`
- Modify: `src/components/__tests__/TruckProfileForm.test.tsx`
- Modify: `src/components/__tests__/WorkPackTemplateForm.test.tsx`

**Interfaces:**
- Consumes: deployment-asset context APIs from Task 1
- Produces: forms that create truck or trailer assets and multi-asset templates

- [ ] **Step 1: Write failing form tests**

```tsx
test('creates a trailer deployment profile', async () => {
  render(<TruckProfileForm showFinancials={false} onSave={onSave} onCancel={jest.fn()} />);
  await user.selectOptions(screen.getByLabelText('Asset type'), 'trailer');
  await user.type(screen.getByLabelText('Asset name'), 'Chemical trailer');
  await completeOperationalFields(user);
  await user.click(screen.getByRole('button', { name: 'Save trailer' }));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ assetType: 'trailer' }));
});
```

Add template-form coverage for selecting multiple independent assets and assigning an aircraft to a trailer.

- [ ] **Step 2: Run the tests and confirm the red state**

Run: `npm test -- --watchAll=false src/components/__tests__/TruckProfileForm.test.tsx src/components/__tests__/WorkPackTemplateForm.test.tsx`

Expected: FAIL because asset type and multi-asset templates are unavailable.

- [ ] **Step 3: Update the profile and fleet register UI**

Rename user-facing copy from truck-only language to `Deployment assets`. Add an asset-type selector, trailer-appropriate labels, and separate counts/chips for trucks and trailers. Keep financial inputs behind `showFinancials`.

- [ ] **Step 4: Update reusable templates**

Allow zero or more asset IDs rather than one required `truckId`. Preserve `truckId` as a legacy derived field from the first selected truck during this release. Allow carrying-asset assignment for each aircraft and kit.

- [ ] **Step 5: Run the focused tests**

Run: `npm test -- --watchAll=false src/components/__tests__/TruckProfileForm.test.tsx src/components/__tests__/WorkPackTemplateForm.test.tsx src/contexts/__tests__/WorkPackContext.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the fleet UI changes**

```bash
git add src/pages/FleetWorkPacks.tsx src/components/TruckProfileForm.tsx src/components/WorkPackTemplateForm.tsx src/components/__tests__/TruckProfileForm.test.tsx src/components/__tests__/WorkPackTemplateForm.test.tsx
git commit -m "feat: manage trailer and multi-asset work packs"
```

---

### Task 5: Enforce Financial Privacy and Non-Blocking Authorisation

**Files:**
- Modify: `src/components/mission/MissionDeploymentWorkPack.tsx`
- Modify: `src/components/mission/__tests__/MissionDeploymentWorkPack.test.tsx`
- Modify: `src/utils/missionWorkflow.ts`
- Modify: `src/utils/__tests__/missionWorkflow.test.ts`

**Interfaces:**
- Consumes: authenticated user role
- Preserves: current mission authorisation validation contract

- [ ] **Step 1: Write failing permission and workflow tests**

```tsx
test('hides deployment costs from contractors', () => {
  renderEditor({ role: 'contractor', value: costedPack });
  expect(screen.queryByText('Estimated deployment cost')).not.toBeInTheDocument();
});

test('shows incomplete costing only to administrators', () => {
  renderEditor({ role: 'admin', value: incompletePack });
  expect(screen.getByText('Costing incomplete')).toBeInTheDocument();
});
```

Add a workflow test proving that a mission with no deployment pack and a mission with incomplete costing produce the same authorisation result as the existing valid mission fixture.

- [ ] **Step 2: Run the tests and confirm the red state**

Run: `npm test -- --watchAll=false src/components/mission/__tests__/MissionDeploymentWorkPack.test.tsx src/utils/__tests__/missionWorkflow.test.ts`

Expected: FAIL until role-aware rendering and explicit workflow regression coverage are present.

- [ ] **Step 3: Implement role-aware costing display**

Pass `showFinancials={user?.role === 'admin'}` into the editor. Render estimated totals and costing completeness only when true. Do not include financial values in contractor-facing summaries.

- [ ] **Step 4: Preserve authorisation behavior**

Keep deployment pack and costing completeness out of blocking workflow validators. Add comments at the mission authorisation boundary documenting that only existing safety/compliance validation is authoritative.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- --watchAll=false src/components/mission/__tests__/MissionDeploymentWorkPack.test.tsx src/utils/__tests__/missionWorkflow.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit privacy and workflow safeguards**

```bash
git add src/components/mission/MissionDeploymentWorkPack.tsx src/components/mission/__tests__/MissionDeploymentWorkPack.test.tsx src/utils/missionWorkflow.ts src/utils/__tests__/missionWorkflow.test.ts
git commit -m "fix: keep work-pack costing non-blocking and private"
```

---

### Task 6: Full Verification and Browser Usability Check

**Files:**
- Modify only files required to address failures discovered by verification.

**Interfaces:**
- Verifies the complete feature and existing application behavior.

- [ ] **Step 1: Run formatting and diff checks**

Run: `git diff --check`

Expected: no output and exit code 0.

- [ ] **Step 2: Run the complete test suite**

Run: `npm test -- --watchAll=false`

Expected: all suites and tests pass.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: exit code 0. Existing repository warnings may remain; no new warnings from changed files.

- [ ] **Step 4: Verify the local workflow in the browser**

Using a local preview and the development administrator account, verify:

1. A mission saves without opening the optional panel.
2. A trailer can be selected without a managed truck.
3. Tow-vehicle notes save and reload.
4. A template applies and remains editable.
5. Three mixed aircraft can be assigned; a fourth cannot.
6. Contractor view hides all financial values.
7. A valid mission can still advance through the existing authorisation workflow with no work pack.

- [ ] **Step 5: Commit any verification fixes**

If verification required changes, stage only those files and commit:

```bash
git commit -m "fix: address deployment work-pack verification"
```

If no changes were required, do not create an empty commit.
