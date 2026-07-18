# Task 3 Report — Optional Mission Work-Pack Editor

## Status

Implemented the collapsed, optional deployment work-pack editor and integrated it immediately below Mission Planning's existing Aircraft & Equipment panel.

## TDD evidence

### Red

Command:

`npm test -- --watchAll=false src/components/mission/__tests__/MissionDeploymentWorkPack.test.tsx`

Result: failed with `Cannot find module '../MissionDeploymentWorkPack'`, confirming the new component was absent and the tests exercised the intended new surface.

### Green

Command:

`npm test -- --watchAll=false src/components/mission/__tests__/MissionDeploymentWorkPack.test.tsx src/components/mission/__tests__/MissionEquipmentSelector.test.tsx src/utils/__tests__/missionWorkflow.test.ts src/utils/__tests__/missionWorkPack.test.ts`

Result: 4 suites passed, 16 tests passed, 0 failures.

## Implementation

- Added a collapsed Material UI accordion titled `Deployment Work Pack (Optional)`.
- Added active saved-template selection and application through the existing `applyWorkPackTemplate` utility.
- Added independent managed truck/trailer selection, including the empty-assets non-blocking message.
- Added optional trailer tow registration, driver, and notes fields without requiring a managed truck.
- Added up to three aircraft assignment rows, compatible/available kit filtering through the shared compatibility utility, and carrying-asset selection.
- Added template crew/checklist summary and a `Skip for now` reset that produces `undefined`.
- Loaded persisted mission deployment work packs into an editable draft.
- Built the persisted work pack during mission payload creation through `buildMissionWorkPack`.
- Synchronized the legacy `aircraftConfiguration` from the first work-pack aircraft via `syncPrimaryAircraftConfiguration`, retaining the existing single-aircraft configuration when no work-pack aircraft exists.

## Self-review

- Confirmed the panel remains optional and introduces no planner authorization/readiness checks.
- Confirmed the first-aircraft compatibility path preserves all existing configuration fields while replacing only aircraft and kit IDs.
- Confirmed editor selection state uses full `DeploymentAsset` snapshots as required by `MissionWorkPackDraft` rather than inventing an ID-only draft shape.
- Confirmed the editor appears directly after Aircraft & Equipment and before Chemical Mix Summary.
- Confirmed `git diff --check` reports no whitespace errors.
- Production build completed successfully. It retains pre-existing repository lint warnings; Task 3 introduced no new warning in its new component.

## Concerns

- The production build reports the repository's existing lint warnings and an outdated Browserslist database notice; neither is caused by Task 3.
- Work-pack templates currently model one `truckId`; applying a template selects that managed asset, while trailers remain independently selectable in the mission editor.

## Review Fix

### Red

Command:

`npm test -- --watchAll=false src/components/mission/__tests__/MissionDeploymentWorkPack.test.tsx src/utils/__tests__/missionWorkPack.test.ts`

Result: 2 suites failed, with 3 regression failures proving that placeholder aircraft rows overwrote the legacy configuration, asset removal retained a dangling `carryingAssetId`, and rerendering did not synchronize the saved-template selector.

### Green

Command:

`npm test -- --watchAll=false src/components/mission/__tests__/MissionDeploymentWorkPack.test.tsx src/utils/__tests__/missionWorkPack.test.ts src/components/mission/__tests__/MissionEquipmentSelector.test.tsx src/utils/__tests__/missionWorkflow.test.ts src/utils/__tests__/t100MissionRegression.test.ts src/contexts/__tests__/MissionContext.kitSelection.test.ts`

Result: 6 suites passed, 22 tests passed, 0 failures.

### Changes

- Preserved the valid legacy `aircraftConfiguration` when the primary work-pack row lacks either an aircraft or equipment kit.
- Synchronized the saved-template selector from rerendered mission values and reset it safely for missing or archived templates.
- Cleared aircraft `carryingAssetId` references when their selected deployment asset is removed.
- Added regression coverage for all three review findings.

Commit: `fix: address mission work-pack review findings`

Files:

- `src/components/mission/MissionDeploymentWorkPack.tsx`
- `src/components/mission/__tests__/MissionDeploymentWorkPack.test.tsx`
- `src/utils/missionWorkPack.ts`
- `src/utils/__tests__/missionWorkPack.test.ts`
- `.superpowers/sdd/task-3-report.md`
