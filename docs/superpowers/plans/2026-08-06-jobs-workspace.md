# Jobs Workspace Implementation Plan

> **For agentic workers:** Execute inline in the existing `codex/production-beta` worktree. Do not delegate this focused screen workflow.

**Goal:** Make `/jobs?view=jobs` the dedicated authoritative Jobs workspace with immediate Search, Open and Add actions.

**Architecture:** Add a focused `JobWorkspace` presentation component that reads the existing operational context and delegates creation to the existing route-bound `JobCreate` form. Preserve all API, persistence, permission and detail-route contracts.

**Tech Stack:** React, TypeScript, Material UI, React Router, Jest and Testing Library.

## Global Constraints

- Preserve existing Job routes, APIs, permissions and tenant isolation.
- Apply Client → Property → Field inheritance without mutating parent records.
- Do not add a database migration or synthetic records.
- Stop after the deployed Jobs page is opened for Product Owner review.

### Task 1: Dedicated Jobs workspace

**Files:**
- Create: `src/pages/JobWorkspace.tsx`
- Modify: `src/pages/ClientList.tsx`
- Test: `src/pages/OperationalWorkflow.test.tsx`

**Interfaces:**
- Consumes: `useOperationalData()`, `useNavigate()`, existing `OperationalJob` records and existing Job routes.
- Produces: dedicated `/jobs?view=jobs` workspace and Client → Property → Field creation handoff.

- [ ] Write failing regression tests for page hierarchy, cross-parent search, direct opening, creation selection and loading failure.
- [ ] Run the focused test file and verify failures are caused by the absent workspace.
- [ ] Implement the minimal `JobWorkspace` and route delegation.
- [ ] Run focused tests and production build until green.
- [ ] Run the full regression suite and review the diff for scope and secrets.
- [ ] Commit as `IMP-JOB-001`, push `codex/production-beta`, deploy Production Beta and verify the live route.
