# SC-012 CASA Compliance Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the CASA Compliance Overview premium, plain-language and action-led while preserving all authoritative compliance capability.

**Architecture:** Reshape only the React presentation layer over the existing compliance projection. Operator summaries remain visible; provenance, diagnostics and evidence-entry forms move into accessible expandable details.

**Tech Stack:** React, TypeScript, Material UI, React Testing Library, Jest.

## Global Constraints

- Preserve the existing API, model, routes, permissions, tenant isolation, operating-location scope, RLS and evidence history.
- Do not add database persistence or migrations.
- Apply `SC-011` and `SC-012` to all primary copy and actions.
- Preserve desktop, tablet and mobile accessibility.

### Task 1: Operator-first compliance hierarchy

**Files:**
- Modify: `src/pages/CasaComplianceOverview.tsx`
- Test: `src/pages/__tests__/CasaComplianceOverview.test.tsx`

- [ ] Add failing tests proving the primary view uses plain-language issue/action copy and hides technical identifiers.
- [ ] Run the focused tests and confirm the SC-012 assertions fail.
- [ ] Implement the health command panel, upcoming events and five category summaries.
- [ ] Add accessible detail controls containing rule and source provenance.
- [ ] Move ReOC and Operations Manual entry behind relevant expandable actions.
- [ ] Run the focused tests and confirm they pass.

### Task 2: Responsive and release verification

**Files:**
- Modify: `src/pages/CasaComplianceOverview.tsx`
- Test: `src/pages/__tests__/CasaComplianceOverview.test.tsx`

- [ ] Add assertions for accessible detail controls and operator actions.
- [ ] Run the complete test suite.
- [ ] Run the production build.
- [ ] Inspect desktop, tablet and mobile renderings.
- [ ] Commit with `SC-012`, push `codex/production-beta`, deploy Production Beta and inspect the stable live route.
