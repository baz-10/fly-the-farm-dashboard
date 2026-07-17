# Aircraft–Kit Compatibility Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement this plan task-by-task.

**Goal:** Allow any available aircraft to select any available kit compatible with its model, without requiring a pre-created registration-specific configuration.

**Architecture:** Add a pure compatibility/resolution layer that normalises aircraft model names and validates weight/status. Mission planning will persist the aircraft and kit IDs directly while retaining the legacy configuration ID during migration. Existing `AircraftKitConfiguration` records remain supported as optional performance/pricing overrides.

**Tech Stack:** React 19, TypeScript, Material UI, Jest, Testing Library, shared local/remote persistence.

---

### Task 1: Specify model-based compatibility

**Files:**
- Create: `src/utils/aircraftKitCompatibility.ts`
- Test: `src/utils/__tests__/aircraftKitCompatibility.test.ts`
- Modify: `src/types/aircraft.ts`

**Step 1: Write the failing tests**

Cover case/spacing normalisation (`DJI Agras T100` vs `T100`), exact aircraft IDs for legacy records, unavailable kits, overweight kits, and an unrelated T50/T100 rejection.

```ts
expect(isKitCompatibleWithAircraft(t100, t100Kit)).toBe(true);
expect(getKitCompatibility(t100, overweightKit).reasons).toContain('Kit exceeds aircraft payload limit');
```

**Step 2: Run the tests and verify failure**

Run: `npm test -- --watchAll=false src/utils/__tests__/aircraftKitCompatibility.test.ts`
Expected: FAIL because the utility does not exist.

**Step 3: Implement the minimal resolver**

Export `normaliseAircraftModel`, `getKitCompatibility`, `isKitCompatibleWithAircraft`, and `getCompatibleAvailableKits`. Match canonical model tokens as well as legacy aircraft IDs; require `operationalData.status === 'available'`; enforce `specifications.weight <= operationalLimits.maxPayloadWeight`.

**Step 4: Run focused tests**

Run the command from Step 2.
Expected: PASS.

**Step 5: Commit**

```bash
git add src/types/aircraft.ts src/utils/aircraftKitCompatibility.ts src/utils/__tests__/aircraftKitCompatibility.test.ts
git commit -m "fix: resolve kits by aircraft model"
```

### Task 2: Make AircraftContext use the resolver

**Files:**
- Modify: `src/contexts/AircraftContext.tsx`
- Create: `src/contexts/__tests__/AircraftContext.compatibility.test.tsx`

**Step 1: Write a failing provider test**

Seed two T100 registrations plus one T100 spray kit and assert `getCompatibleKits` returns that kit for both registrations without any `AircraftKitConfiguration`.

**Step 2: Run the test and verify failure**

Run: `npm test -- --watchAll=false src/contexts/__tests__/AircraftContext.compatibility.test.tsx`
Expected: FAIL under the current registration/configuration logic.

**Step 3: Route context helpers through the pure resolver**

Update `getCompatibleKits` and `validateConfiguration` to use the shared compatibility result. Keep configuration CRUD unchanged for backward compatibility.

**Step 4: Verify context and utility tests**

Run: `npm test -- --watchAll=false src/contexts/__tests__/AircraftContext.compatibility.test.tsx src/utils/__tests__/aircraftKitCompatibility.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/contexts/AircraftContext.tsx src/contexts/__tests__/AircraftContext.compatibility.test.tsx
git commit -m "fix: expose model-compatible kits to missions"
```

### Task 3: Change mission selection from configuration-first to kit-first

**Files:**
- Modify: `src/types/mission.ts`
- Modify: `src/pages/MissionPlanning.tsx`
- Create: `src/pages/__tests__/MissionPlanning.equipment.test.tsx`

**Step 1: Write failing UI tests**

Render mission planning with `FTF-T100-001` and its model-compatible spray base, no configuration. Assert the dropdown lists the kit, an incompatible T50 kit is absent, and saving records `aircraftId` plus `kitId`.

**Step 2: Run and verify failure**

Run: `npm test -- --watchAll=false src/pages/__tests__/MissionPlanning.equipment.test.tsx`
Expected: FAIL because options are sourced only from configurations.

**Step 3: Add the migration-safe mission fields**

Add `kitId?: string` to the existing `aircraftConfiguration`. Keep `configurationId?: string` readable for legacy missions. Derive dropdown options from `getCompatibleKits(selectedAircraft)`, resolve an optional matching configuration for performance overrides, and make persistence require aircraft plus kit rather than aircraft plus configuration.

**Step 4: Add explicit incompatibility feedback**

When an edited aircraft invalidates the selected kit, clear it and show a warning explaining status, model, or payload failure. Do not silently select a financially different kit.

**Step 5: Run tests and build**

Run: `npm test -- --watchAll=false src/pages/__tests__/MissionPlanning.equipment.test.tsx src/utils/__tests__/aircraftKitCompatibility.test.ts`
Expected: PASS.

Run: `npm run build`
Expected: successful production build.

**Step 6: Commit**

```bash
git add src/types/mission.ts src/pages/MissionPlanning.tsx src/pages/__tests__/MissionPlanning.equipment.test.tsx
git commit -m "fix: select compatible kits in mission planning"
```

### Task 4: Verify the T100 regression end to end

**Files:**
- Modify: `src/utils/__tests__/missionWorkflow.test.ts`
- Create: `src/utils/__tests__/t100MissionRegression.test.ts`

**Step 1: Add the regression fixture**

Model the production case: T100 aircraft, available T100 spray base, no registration-specific configuration. Exercise draft, JSA/environment readiness, approval, flight authorisation, flying, completion, and lock transitions.

**Step 2: Run the regression suite**

Run: `npm test -- --watchAll=false src/utils/__tests__/t100MissionRegression.test.ts src/utils/__tests__/missionWorkflow.test.ts`
Expected: PASS.

**Step 3: Run the full suite**

Run: `npm test -- --watchAll=false`
Expected: all tests pass.

**Step 4: Commit**

```bash
git add src/utils/__tests__/t100MissionRegression.test.ts src/utils/__tests__/missionWorkflow.test.ts
git commit -m "test: cover T100 mission lifecycle"
```
