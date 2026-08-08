# Workflow Override Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire four workflow maturity overrides to isolated UI regions while retaining each parent module's context.

**Architecture:** Direct canonical `WorkflowMaturityBoundary` imports wrap extracted local workflow bodies. The extracted bodies own workflow hooks and API clients so Coming Soon prevents constrained work from mounting.

**Tech Stack:** React, TypeScript, MUI, Jest, Testing Library, product maturity registry.

## Global Constraints

- Use exact direct `WorkflowMaturityBoundary` imports and static code literals.
- Keep current registry maturity states unchanged.
- Make no permission, API, persistence, route, or navigation changes.
- Use RED/GREEN tests that mutate and restore only the targeted registry entries.

---

### Task 1: Mission report workflow

**Files:**
- Modify: `src/components/mission/MissionAuthorisation.tsx`
- Modify: `src/components/mission/MissionSummary.tsx`
- Modify: `src/components/mission/MissionRecord.tsx`
- Test: their matching files under `src/components/mission/__tests__/`

- [ ] Add tests setting `mission-workspace/reports` to `COMING_SOON`, asserting report controls/status are absent while authorisation or report-stage context remains.
- [ ] Run the three test files and confirm failures expose unbounded report UI.
- [ ] Add direct imports and gate pack generation/status or `ReportArtefactStatus` with exact literals.
- [ ] Re-run the three test files and confirm they pass.

### Task 2: Operating authority records

**Files:**
- Modify: `src/pages/ReocComplianceWorkspace.tsx`
- Test: `src/pages/__tests__/ReocComplianceWorkspace.test.tsx`

- [ ] Add a test setting `operating-authority/authority-records` to `COMING_SOON`, asserting back navigation/header remain, management controls vanish, and the authority API read does not start.
- [ ] Run the test file and confirm failure exposes the management UI/API call.
- [ ] Extract the record body, move its workflow hooks into it, and gate it with exact literals.
- [ ] Re-run the test file and confirm it passes.

### Task 3: Checklist administration

**Files:**
- Modify: `src/pages/ControlledChecklists.tsx`
- Test: `src/pages/__tests__/ControlledChecklists.test.tsx`

- [ ] Add a test setting `controlled-checklists/administration` to `COMING_SOON`, asserting page context remains, administration controls vanish, and templates are not loaded.
- [ ] Run the test file and confirm failure exposes the administration UI/API call.
- [ ] Extract the administration body and gate it with exact literals below the page heading.
- [ ] Re-run the test file and confirm it passes.

### Task 4: Checklist execution

**Files:**
- Modify: `src/components/mission/MissionChecklists.tsx`
- Test: `src/components/mission/__tests__/MissionChecklists.test.tsx`

- [ ] Add a test setting `controlled-checklists/execution` to `COMING_SOON`, asserting the safe surface replaces execution controls and execution APIs do not start.
- [ ] Run the test file and confirm failure exposes the execution UI/API calls.
- [ ] Move the execution implementation to a local inner component and gate it with exact literals in the exported wrapper.
- [ ] Re-run the test file and confirm it passes.

### Task 5: Governance and completion evidence

**Files:**
- Create: `.superpowers/sdd/2026-08-08-product-maturity-registry/final-repair-h-report.md`

- [ ] Run all focused workflow tests, the maturity boundary suite, and App tests.
- [ ] Run `node scripts/verifyProductMaturityRegistry.mjs` and `npm run build`.
- [ ] Run the full Jest suite and confirm zero failures.
- [ ] Record RED/GREEN and verification evidence in the repair report.
- [ ] Commit the focused implementation and report without pushing or deploying.
