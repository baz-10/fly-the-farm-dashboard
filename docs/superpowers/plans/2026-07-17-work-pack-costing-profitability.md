# Work-Pack Costing and Profitability Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement this plan task-by-task.

**Goal:** Calculate estimated and actual job profitability from trucks, aircraft, kits, crew, travel, and chemicals while keeping all financial data company-administrator-only.

**Architecture:** A pure costing engine consumes mission work-pack snapshots and actuals. Operational projections strip financial fields at the selector/component boundary. Current platform-admin access remains during internal development; tenant/platform-support isolation is a mandatory, separately tested rollout gate.

**Tech Stack:** TypeScript, React, Material UI, Jest, existing financial actuals store.

---

### Task 1: Define costing inputs and pure calculations

**Files:**
- Create: `src/types/workPackCosting.ts`
- Create: `src/utils/workPackCosting.ts`
- Create: `src/utils/__tests__/workPackCosting.test.ts`

**Step 1: Write failing calculation tests**

Cover truck hourly/day/km costs, aircraft and kit hours, crew roles and rates, company-supplied chemical costs, client-supplied zero inventory cost, revenue, gross profit, margin, and incomplete-input warnings. Include rounding tests.

**Step 2: Run and verify failure**

Run: `npm test -- --watchAll=false src/utils/__tests__/workPackCosting.test.ts`
Expected: FAIL because the calculator does not exist.

**Step 3: Implement deterministic costing**

Define `WorkPackCostProfile`, `WorkPackEstimate`, and `WorkPackActualCost`. Implement line-item generation and totals without reading contexts or UI state. Preserve source IDs and rate snapshots for auditability.

**Step 4: Verify and commit**

Run focused tests; expect PASS.

```bash
git add src/types/workPackCosting.ts src/utils/workPackCosting.ts src/utils/__tests__/workPackCosting.test.ts
git commit -m "feat: calculate work-pack profitability"
```

### Task 2: Add financial capability selectors

**Files:**
- Create: `src/utils/permissions.ts`
- Create: `src/utils/__tests__/permissions.test.ts`
- Modify: `src/contexts/AuthContext.tsx`

**Step 1: Write failing permission tests**

Assert company administrators can view/edit costs. Contractor operational users, pilots, drivers, supervisors, loaders, spotters, support, and clients cannot receive financial projections. Assert operational users can still view trucks, work packs, aircraft, kits, and assignments.

**Step 2: Run and verify failure**

Run: `npm test -- --watchAll=false src/utils/__tests__/permissions.test.ts`
Expected: FAIL because capabilities do not exist.

**Step 3: Implement capability helpers**

Add explicit operational crew roles/capabilities without changing the current internal platform-admin behaviour. Export `canViewCompanyFinancials`, `canManageCostProfiles`, `canApproveFieldSubstitution`, and `toOperationalWorkPackView` that structurally omits cost/rate/value fields.

**Step 4: Verify and commit**

Run focused tests; expect PASS.

```bash
git add src/utils/permissions.ts src/utils/__tests__/permissions.test.ts src/contexts/AuthContext.tsx
git commit -m "feat: protect company financial capabilities"
```

### Task 3: Persist cost profiles and mission snapshots

**Files:**
- Modify: `src/types/financials.ts`
- Modify: `src/services/financialsStore.ts`
- Modify: `src/contexts/MissionContext.tsx`
- Create: `src/services/__tests__/workPackFinancialsStore.test.ts`

**Step 1: Write failing persistence tests**

Save company-default crew rates and asset cost profiles, create a mission estimate snapshot, change the default rate, and assert the existing mission retains its original estimate. Finalise actuals and assert totals flow to `JobActual`.

**Step 2: Run and verify failure**

Run: `npm test -- --watchAll=false src/services/__tests__/workPackFinancialsStore.test.ts`
Expected: FAIL because profiles/snapshots are absent.

**Step 3: Extend the financial store**

Persist company-scoped profiles and immutable mission rate snapshots. Map work-pack actual categories into current equipment/labour/travel/chemical totals and retain detailed line items.

**Step 4: Verify and commit**

Run focused tests plus existing financial tests; expect PASS.

```bash
git add src/types/financials.ts src/services/financialsStore.ts src/contexts/MissionContext.tsx src/services/__tests__/workPackFinancialsStore.test.ts
git commit -m "feat: persist work-pack estimates and actuals"
```

### Task 4: Add administrator profitability UI and operational redaction tests

**Files:**
- Create: `src/components/financials/WorkPackCostingPanel.tsx`
- Create: `src/components/financials/__tests__/WorkPackCostingPanel.test.tsx`
- Modify: `src/pages/MissionPlanning.tsx`
- Modify: `src/pages/Financials.tsx`
- Modify: `src/App.tsx`

**Step 1: Write failing role-based UI tests**

For a company administrator, assert editable estimate/actual lines and margin are visible. For every operational role, assert truck/work-pack operational details remain visible but currency, rates, cost totals, revenue, profit, and margin are absent from both DOM and route access.

**Step 2: Run and verify failure**

Run: `npm test -- --watchAll=false src/components/financials/__tests__/WorkPackCostingPanel.test.tsx`
Expected: FAIL because the panel and redaction are absent.

**Step 3: Implement guarded financial views**

Add administrator-only costing panels and route guards. Use operational projection objects so hidden fields are not passed into operational components. Surface incomplete costing warnings without exposing amounts.

**Step 4: Verify and commit**

Run focused tests, full suite, and build; expect PASS.

```bash
git add src/components/financials/WorkPackCostingPanel.tsx src/components/financials/__tests__/WorkPackCostingPanel.test.tsx src/pages/MissionPlanning.tsx src/pages/Financials.tsx src/App.tsx
git commit -m "feat: add private work-pack profitability views"
```

### Task 5: Add the mandatory external-rollout security gate

**Files:**
- Create: `docs/security/external-rollout-gate.md`
- Create: `src/utils/__tests__/tenantFinancialIsolation.rollout.test.ts`
- Modify later at rollout: `api/store.js`
- Modify later at rollout: `api/auth.js`
- Modify later at rollout: `server/supabase.js`

**Step 1: Document the blocked rollout conditions**

Record that no external company can be onboarded until server-enforced tenant ownership, platform-support restrictions, password-reset-only support access, audit logging, and cross-tenant negative tests pass.

**Step 2: Add a skipped rollout-gate test describing required guarantees**

The test must be explicitly named and linked to the security document. It remains skipped during internal development and must be unskipped before external rollout; it tests that platform support cannot list/read company financial collections and tenant A cannot access tenant B.

**Step 3: Verify internal build remains unchanged**

Run: `npm test -- --watchAll=false`
Expected: application tests pass and the rollout gate is visibly reported as skipped.

**Step 4: Commit the gate**

```bash
git add docs/security/external-rollout-gate.md src/utils/__tests__/tenantFinancialIsolation.rollout.test.ts
git commit -m "docs: gate external rollout on tenant isolation"
```

**Do not implement or claim external readiness in this release.** The server files listed above are intentionally deferred until rollout hardening is authorised.
