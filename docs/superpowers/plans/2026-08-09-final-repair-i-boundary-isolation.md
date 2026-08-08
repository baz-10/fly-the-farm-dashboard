# Final Repair Package I Boundary Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Isolate Mission Pack, Personnel credential, quote PDF, financial margin and invoice availability workflows behind one exact boundary each without changing parent route behavior.

**Architecture:** Move workflow hooks and state into children that are mounted inside exact workflow boundaries, and move repeated boundaries above list iteration. Route surfaces resolve parent modules only; narrow UI composition points resolve workflow maturity independently.

**Tech Stack:** React 19, TypeScript, Material UI, React Testing Library, Jest, registry JSON and surface manifest verifier.

## Global Constraints

- Preserve routes, roles, permissions, APIs and persistence behavior.
- Do not expose local persistence under current maturity states.
- Use exact direct canonical `WorkflowMaturityBoundary` imports and static module/workflow literals.
- Use RED-GREEN TDD and restore every mutated registry entry in `finally`.
- Do not push or deploy.

---

### Task 1: Mission Pack API isolation

**Files:**
- Modify: `src/components/mission/MissionAuthorisation.tsx`
- Test: `src/components/mission/__tests__/MissionAuthorisation.test.tsx`

**Interfaces:**
- Consumes: existing injected Mission authorisation API.
- Produces: an internal pack child receiving `missionId`, `authorisation`, and `api`, mounted only inside `mission-workspace/reports`.

- [ ] Add a constrained-state test that resolves an existing authorisation and asserts readiness/read still run while `readPack`, `generatePack`, the Generate button and report status do not mount.
- [ ] Run the MissionAuthorisation suite and confirm RED because the parent effect calls `readPack`.
- [ ] Extract pack read/generate/status hooks and state into the boundary child; remove `readPack` from the parent effect.
- [ ] Run the suite and confirm GREEN, including the existing authorise-then-generate lifecycle.

### Task 2: Single Personnel credentials boundary

**Files:**
- Modify: `src/pages/Personnel.tsx`
- Test: `src/pages/Personnel.test.tsx`

**Interfaces:**
- Consumes: loaded Personnel records and existing credential/identity APIs.
- Produces: one credential list body inside one `personnel/casa-credentials` boundary; identity controls stay on parent record cards.

- [ ] Expand the fixture to two records and add Beta/Coming Soon assertions for exactly one indicator/workspace and one unique heading ID while both identity-link controls remain available.
- [ ] Run the Personnel suite and confirm RED from repeated per-record boundaries.
- [ ] Move credential rendering out of each identity card into one list body beneath a single exact boundary.
- [ ] Run the suite and confirm GREEN.

### Task 3: Parent route classification and narrow quote/financial workflows

**Files:**
- Modify: `src/productMaturity/surfaces.ts`
- Modify: `src/pages/QuoteDetail.tsx`
- Modify: `src/pages/ActualCreate.tsx`
- Modify: `src/pages/ActualDetail.tsx`
- Test: `src/productMaturity/__tests__/surfaces.test.ts`
- Create or modify focused page tests under `src/pages/__tests__/`.

**Interfaces:**
- Consumes: `ProductMaturitySurface` parent module resolution and exact workflow registry entries.
- Produces: parent-only route entries plus narrow `quotes/pdf-export`, `financials/margin-analysis`, and `financials/invoice-export` composition boundaries.

- [ ] Change expected route resolutions to `workflowCode: null` and add page tests that promote only the parent, leave the workflow Coming Soon, and assert surrounding page controls remain while the workflow heading replaces only its scoped UI.
- [ ] Run route/page tests and confirm RED from workflow-owned routes and absent narrow boundaries.
- [ ] Set all three manifest entries to parent module/null workflow.
- [ ] Wrap Quote Detail print/export availability in `quotes/pdf-export`.
- [ ] Wrap Actual Create margin summary and quote comparison together in one `financials/margin-analysis` boundary; add a separate labelled `financials/invoice-export` availability section without changing save behavior.
- [ ] Wrap Actual Detail margin summary/comparison UI in one `financials/margin-analysis` boundary; keep the operational PDF report semantically unchanged and add a separate labelled invoice-export availability section.
- [ ] Run the focused route/page tests and confirm GREEN.

### Task 4: Evidence and final verification

**Files:**
- Create: `.superpowers/sdd/2026-08-08-product-maturity-registry/final-repair-i-report.md`

**Interfaces:**
- Consumes: completed code and test evidence.
- Produces: final package I audit report and one verified local commit.

- [ ] Run all directly affected suites and the product maturity governance suites.
- [ ] Run `node scripts/verifyProductMaturityRegistry.mjs` and record exact counts.
- [ ] Run the full test suite and `npm run build`.
- [ ] Write the report with RED/GREEN and verification evidence, then run `git diff --check`.
- [ ] Stage only package I files, commit, verify clean HEAD, and do not push or deploy.
