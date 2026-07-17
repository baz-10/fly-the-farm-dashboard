# Truck Profiles and Work-Pack Templates Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement this plan task-by-task.

**Goal:** Create detailed truck profiles and reusable operational work-pack templates containing trucks, aircraft, kits, and crew roles.

**Architecture:** Introduce a dedicated fleet work-pack domain and context persisted through the existing shared-value service. Templates reference live fleet assets; applying a template creates a snapshot so job-specific edits never mutate the reusable template.

**Tech Stack:** React, TypeScript, Material UI, Jest, Testing Library, shared local/remote persistence.

---

### Task 1: Define truck and template domain types

**Files:**
- Create: `src/types/workPack.ts`
- Create: `src/utils/workPackTemplates.ts`
- Create: `src/utils/__tests__/workPackTemplates.test.ts`

**Step 1: Write failing copy/validation tests**

Test a template with a truck, two aircraft slots, per-aircraft kit slots, and crew role requirements. Assert `instantiateWorkPackTemplate` creates new IDs, preserves source template ID, and deep-copies nested assignments.

**Step 2: Run and verify failure**

Run: `npm test -- --watchAll=false src/utils/__tests__/workPackTemplates.test.ts`
Expected: FAIL because the domain does not exist.

**Step 3: Add domain types and pure functions**

Define `TruckProfile`, `TruckOperatingCosts`, `CrewRole`, `CrewRequirement`, `WorkPackTemplate`, `WorkPackSnapshot`, and `WorkPackAircraftAssignment`. Add pure `instantiateWorkPackTemplate`, `validateTemplateReferences`, and `summariseWorkPackAssets` functions.

**Step 4: Run focused tests and commit**

Run the command from Step 2; expect PASS.

```bash
git add src/types/workPack.ts src/utils/workPackTemplates.ts src/utils/__tests__/workPackTemplates.test.ts
git commit -m "feat: define truck and work-pack domains"
```

### Task 2: Persist trucks and templates

**Files:**
- Modify: `src/services/persistence.ts`
- Create: `src/contexts/WorkPackContext.tsx`
- Create: `src/contexts/__tests__/WorkPackContext.test.tsx`
- Modify: `src/App.tsx`

**Step 1: Write failing context CRUD tests**

Cover create/update/archive truck; create/update template; instantiate a snapshot; and shared persistence reload.

**Step 2: Run and verify failure**

Run: `npm test -- --watchAll=false src/contexts/__tests__/WorkPackContext.test.tsx`
Expected: FAIL because provider and keys do not exist.

**Step 3: Implement provider and keys**

Add `trucks` and `workPackTemplates` persistence keys. Implement provider CRUD using `readSharedValue`/`writeSharedValue`, validation guards, stable IDs, and non-destructive `archived` status for referenced assets. Mount provider alongside aircraft and mission providers.

**Step 4: Run focused tests and build**

Run context tests; expect PASS. Run `npm run build`; expect success.

**Step 5: Commit**

```bash
git add src/services/persistence.ts src/contexts/WorkPackContext.tsx src/contexts/__tests__/WorkPackContext.test.tsx src/App.tsx
git commit -m "feat: persist trucks and work-pack templates"
```

### Task 3: Build detailed truck profiles

**Files:**
- Create: `src/pages/TruckManagement.tsx`
- Create: `src/components/TruckProfileForm.tsx`
- Create: `src/pages/__tests__/TruckManagement.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Layout.tsx`

**Step 1: Write failing management tests**

Assert administrators can create a truck with registration, make/model, payload notes, purchase/finance, rego, insurance, depreciation, servicing, tyres, fuel, hourly/day/km rates, and operational status. Assert operational users see the profile without financial fields.

**Step 2: Run and verify failure**

Run: `npm test -- --watchAll=false src/pages/__tests__/TruckManagement.test.tsx`
Expected: FAIL because the route/UI does not exist.

**Step 3: Implement form and list/detail UI**

Add `/trucks`; use reusable financial-field permission helpers rather than visual-only CSS hiding. Validate required identifiers and non-negative costs. Allow edit/archive and show audit timestamps.

**Step 4: Verify tests and commit**

Run focused tests and `npm run build`; expect PASS.

```bash
git add src/pages/TruckManagement.tsx src/components/TruckProfileForm.tsx src/pages/__tests__/TruckManagement.test.tsx src/App.tsx src/components/Layout.tsx
git commit -m "feat: add detailed truck profiles"
```

### Task 4: Build reusable work-pack template editor

**Files:**
- Create: `src/pages/WorkPackTemplates.tsx`
- Create: `src/components/WorkPackTemplateForm.tsx`
- Create: `src/pages/__tests__/WorkPackTemplates.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Layout.tsx`

**Step 1: Write failing template UI tests**

Create a “Two T100 Spray Crew” template, choose a truck, add two aircraft slots, choose compatible kits, add pilot/driver/supervisor/loader requirements, save, clone, and edit the clone without modifying the source.

**Step 2: Run and verify failure**

Run: `npm test -- --watchAll=false src/pages/__tests__/WorkPackTemplates.test.tsx`
Expected: FAIL because the template UI does not exist.

**Step 3: Implement the editor**

Build an ordered asset editor with an “Add aircraft” action, compatible kit selectors, crew requirements, notes/checklist, active/archived state, duplicate-template action, and an operational summary that excludes costs.

**Step 4: Verify suite and commit**

Run focused tests, full tests, and build; expect PASS.

```bash
git add src/pages/WorkPackTemplates.tsx src/components/WorkPackTemplateForm.tsx src/pages/__tests__/WorkPackTemplates.test.tsx src/App.tsx src/components/Layout.tsx
git commit -m "feat: add reusable work-pack templates"
```
