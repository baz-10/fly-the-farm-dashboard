# Guided Mission Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. This workflow must remain one inline implementation stream.

**Goal:** Enable an operator to create the complete authoritative parent chain and Draft Mission from `/missions/new` without leaving the Mission workflow.

**Architecture:** Add a focused `GuidedMissionCreation` orchestration component for steps 1–5, backed only by `OperationalDataContext`. Reuse `FieldBoundaryEditor` for Field geometry. After Draft creation, redirect to the existing Mission route and retain the advanced planner for steps 6–10.

**Tech Stack:** React, TypeScript, MUI, existing Operational Data API/store, Jest and Testing Library.

## Global Constraints

- No local-storage or legacy persistence.
- Do not duplicate authoritative domain resources or business rules.
- Field and Mission geometry remain separate.
- Minimum safe input only; never ask twice.
- Every server failure remains visible and produces no misleading local record.

---

### Task 1: Guided parent-chain workflow

**Files:**
- Create: `src/components/mission/GuidedMissionCreation.tsx`
- Create: `src/components/mission/__tests__/GuidedMissionCreation.test.tsx`
- Modify: `src/pages/MissionPlanning.tsx`

**Produces:** Inline Client, Property, Field/boundary, Job and Draft Mission creation with a stable Mission redirect.

- [ ] Write failing tests for the ten-step progress contract and zero-record Client creation.
- [ ] Run the focused test and verify failure because the component does not exist.
- [ ] Implement step navigation and authoritative Client/Property creation.
- [ ] Add failing tests for Field boundary and Job creation.
- [ ] Implement FieldBoundaryEditor integration, boundary persistence and Job creation.
- [ ] Add failing test for Draft Mission creation and redirect.
- [ ] Implement Draft creation and connect `/missions/new` to the guided component.
- [ ] Run focused tests and commit with `IMP-MIS-001`.

### Task 2: Resume and advanced-stage progress

**Files:**
- Modify: `src/components/mission/GuidedMissionCreation.tsx`
- Modify: `src/pages/MissionPlanning.tsx`
- Test: `src/components/mission/__tests__/GuidedMissionCreation.test.tsx`
- Test: `src/pages/MissionRemoteWorkflow.test.tsx`

**Produces:** First-incomplete-step resume and a ten-stage navigator on Draft Mission routes.

- [ ] Write failing tests for parent filtering, back navigation and persisted progress.
- [ ] Implement derived progress without browser state.
- [ ] Write failing test that existing Draft routes retain the advanced planner.
- [ ] Add the persistent stage navigator and review summary to the advanced planner.
- [ ] Run focused tests and commit with `IMP-MIS-001`.

### Task 3: Production verification

**Files:** No new production files unless verification exposes a defect.

**Produces:** Deployed, tested guided workflow.

- [ ] Run the complete test suite and production build.
- [ ] Push `codex/production-beta` to `BJT-FTF/Spray-Command`.
- [ ] Deploy the linked Vercel Production Beta project.
- [ ] Prove the live zero-record creation path and report the deployment ID and acceptance URL.
