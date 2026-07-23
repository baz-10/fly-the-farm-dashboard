# Safety Plans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reusable company Safety Plan masters and auditable job-specific controlled copies to Compliance.

**Architecture:** Store tenant-scoped plan records through the existing authenticated shared-store API, isolate workflow rules in pure utilities, and split list/editor UI into focused components. Approved job copies retain their source master revision and become immutable; changes create a revision.

**Tech Stack:** React 19, TypeScript 4.9, Material UI 7, React Router 7, authenticated `/api/store`, Jest, React Testing Library.

## Global Constraints

- Call the supplied content “CASA-aligned,” never “CASA approved.”
- Company administrators approve masters and job plans.
- Contractors may draft operational sections but may not approve or replace controlled revisions.
- Job copies retain the exact approved master revision used.
- Master changes do not mutate existing job copies.
- JSA and risk records are linked, not duplicated or silently replaced.
- Typed authenticated approval records user, role, timestamp, revision and statement.
- Statuses are Draft, Awaiting review, Approved/current, Superseded and Archived.

---

## File structure

- Create `src/types/safetyPlan.ts`: plan schemas and status/approval types.
- Create `src/utils/safetyPlanWorkflow.ts`: transition, revision and permission rules.
- Create `src/services/safetyPlanStore.ts`: shared persistence and immutable-copy operations.
- Create `src/pages/SafetyPlans.tsx`: master/job register.
- Create `src/pages/SafetyPlanEditor.tsx`: controlled master/job editor.
- Create `src/components/safety-plans/`: section editor, references and approval dialog.
- Modify `api/store.js`, `src/services/persistence.ts`, `src/App.tsx`, `src/pages/ComplianceMenu.tsx`, and `src/pages/JobDetail.tsx`.

### Task 1: Domain model and workflow rules

**Files:**
- Create: `src/types/safetyPlan.ts`
- Create: `src/utils/safetyPlanWorkflow.ts`
- Test: `src/utils/__tests__/safetyPlanWorkflow.test.ts`

**Interfaces:**
- Produces: `SafetyPlanMaster`, `JobSafetyPlan`, `SafetyPlanApproval`, `SafetyPlanStatus`, `canApproveSafetyPlan`, `canEditSafetyPlan`, `createJobPlanFromMaster`, `createSafetyPlanRevision`, and `transitionSafetyPlan`.

- [ ] **Step 1: Write failing workflow tests**

```ts
test('copies an approved master without sharing mutable section data', () => {
  const jobPlan = createJobPlanFromMaster(master, job, contractor);
  expect(jobPlan.masterRevisionId).toBe(master.revisionId);
  expect(jobPlan.status).toBe('draft');
  jobPlan.sections.policy.notes = 'job note';
  expect(master.sections.policy.notes).not.toBe('job note');
});

test('permits only admins to approve', () => {
  expect(canApproveSafetyPlan(admin)).toBe(true);
  expect(canApproveSafetyPlan(contractor)).toBe(false);
});

test('requires a revision instead of editing an approved plan', () => {
  expect(canEditSafetyPlan(approvedPlan, admin)).toBe(false);
  expect(createSafetyPlanRevision(approvedPlan, admin).revision).toBe(approvedPlan.revision + 1);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --watchAll=false src/utils/__tests__/safetyPlanWorkflow.test.ts`

Expected: FAIL because the domain modules do not exist.

- [ ] **Step 3: Implement exact types and rules**

Define the approved master sections and job-specific fields from the design spec. Use ISO timestamps, immutable IDs, `revision: number`, `revisionId: string`, and:

```ts
export interface SafetyPlanApproval {
  userId: string;
  userName: string;
  role: UserRole;
  approvedAt: string;
  statement: string;
  revisionId: string;
}
```

Reject approval by non-admins, approval of incomplete plans, direct changes to approved plans, and job-copy creation from an unapproved master.

- [ ] **Step 4: Run workflow tests**

Run: `npm test -- --watchAll=false src/utils/__tests__/safetyPlanWorkflow.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/safetyPlan.ts src/utils/safetyPlanWorkflow.ts src/utils/__tests__/safetyPlanWorkflow.test.ts
git commit -m "feat: define controlled safety plan workflow"
```

### Task 2: Tenant persistence and server authorisation

**Files:**
- Modify: `src/services/persistence.ts`
- Create: `src/services/safetyPlanStore.ts`
- Modify: `api/store.js`
- Modify: `src/__tests__/authenticated-store-api.test.ts`
- Test: `src/services/__tests__/safetyPlanStore.test.ts`

**Interfaces:**
- Produces: `listSafetyPlanMasters`, `listJobSafetyPlans`, `getSafetyPlan`, `saveSafetyPlanDraft`, `submitSafetyPlan`, `approveSafetyPlan`, and `archiveSafetyPlan`.

- [ ] **Step 1: Add failing API permission tests**

Assert `ftf_safety_plan_masters` and `ftf_job_safety_plans` are accepted, tenant isolation remains enforced, contractor payloads cannot supply `approval`, and contractor writes cannot overwrite an approved revision.

- [ ] **Step 2: Run API tests and verify failure**

Run: `npm test -- --watchAll=false src/__tests__/authenticated-store-api.test.ts`

Expected: FAIL with invalid collection or missing Safety Plan enforcement.

- [ ] **Step 3: Add collections and server-side preservation**

Add both keys to `PERSISTENCE_KEYS` and `ALLOWED_COLLECTIONS`. In `api/store.js`, derive approval authority from `user.role`; discard contractor-provided approval fields and reject replacement/deletion of approved records with HTTP 403. Never rely on disabled UI for enforcement.

- [ ] **Step 4: Write and implement store tests**

Mock `readSharedCollection`/`writeSharedRecord` and verify creating a job copy preserves `masterRevisionId`, approval failures surface to the UI, and list functions return only the requested plan kind.

- [ ] **Step 5: Run storage tests**

Run:

```bash
npm test -- --watchAll=false src/__tests__/authenticated-store-api.test.ts
npm test -- --watchAll=false src/services/__tests__/safetyPlanStore.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/store.js src/services/persistence.ts src/services/safetyPlanStore.ts src/services/__tests__/safetyPlanStore.test.ts src/__tests__/authenticated-store-api.test.ts
git commit -m "feat: persist tenant safety plans securely"
```

### Task 3: Safety Plan register and Compliance entry

**Files:**
- Create: `src/pages/SafetyPlans.tsx`
- Create: `src/pages/SafetyPlans.test.tsx`
- Modify: `src/pages/ComplianceMenu.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: Safety Plan store list/create functions.
- Produces: `/compliance/safety-plans` register and `/compliance/safety-plans/:planId` route.

- [ ] **Step 1: Write the register test**

Render admin and contractor states. Assert separate Company masters and Job Safety Plans sections, status/revision/source-master details, admin-only New master action, contractor-visible New job plan action, and the CASA-aligned responsibility notice.

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- --watchAll=false src/pages/SafetyPlans.test.tsx`

Expected: FAIL because the page and routes do not exist.

- [ ] **Step 3: Implement the register**

Add searchable/filterable cards, empty states, status chips, source revision, linked job, last updated user/time, and actions allowed by role. Add a dedicated Safety Plans card to Compliance rather than replacing the existing Safety & PPE page.

- [ ] **Step 4: Run page and route tests**

Run:

```bash
npm test -- --watchAll=false src/pages/SafetyPlans.test.tsx src/App.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/SafetyPlans.tsx src/pages/SafetyPlans.test.tsx src/pages/ComplianceMenu.tsx src/App.tsx
git commit -m "feat: add compliance safety plan register"
```

### Task 4: Controlled editor and approval flow

**Files:**
- Create: `src/pages/SafetyPlanEditor.tsx`
- Create: `src/pages/SafetyPlanEditor.test.tsx`
- Create: `src/components/safety-plans/SafetyPlanSections.tsx`
- Create: `src/components/safety-plans/SafetyPlanReferences.tsx`
- Create: `src/components/safety-plans/SafetyPlanApprovalDialog.tsx`

**Interfaces:**
- Consumes: domain/store functions.
- Produces: master and job editors with autosave draft state, submission, approval and revision actions.

- [ ] **Step 1: Write editor workflow tests**

Test a contractor completing a job plan, linking JSA/risk records, adding notes/attachments metadata, submitting for review, being unable to approve, and seeing an approved plan as read-only. Test an admin typing the approval statement and creating a subsequent revision.

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- --watchAll=false src/pages/SafetyPlanEditor.test.tsx`

Expected: FAIL because editor components do not exist.

- [ ] **Step 3: Implement focused sections**

Render required fields from the approved design, completion indicators, validation summaries and explicit Save draft/Submit/Approve/Create revision actions. Approval dialog requires the exact statement:

```text
I confirm this Safety Plan revision has been reviewed and is approved for use by this company.
```

Store authenticated identity from `useAuth`; do not accept identity fields from editable inputs.

- [ ] **Step 4: Run editor tests**

Run: `npm test -- --watchAll=false src/pages/SafetyPlanEditor.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/SafetyPlanEditor.tsx src/pages/SafetyPlanEditor.test.tsx src/components/safety-plans
git commit -m "feat: add controlled safety plan editor"
```

### Task 5: Job linkage and release verification

**Files:**
- Modify: `src/pages/JobDetail.tsx`
- Modify: `src/pages/Home.test.tsx`
- Create: `src/pages/JobDetail.safetyPlans.test.tsx`

**Interfaces:**
- Consumes: `listJobSafetyPlans(jobId)`.
- Produces: Safety Plans section on a job with current status and revision history links.

- [ ] **Step 1: Write the job linkage test**

Assert the Job detail page lists current and superseded Safety Plan revisions, shows Create Safety Plan when absent, and routes to the job-prefilled creation flow.

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- --watchAll=false src/pages/JobDetail.safetyPlans.test.tsx`

Expected: FAIL because Job detail has no Safety Plans section.

- [ ] **Step 3: Implement job linkage**

Add a Safety Plans card using store data, keep financial and unrelated job behavior unchanged, and show approval identity/timestamp only to roles already allowed to view that job.

- [ ] **Step 4: Run full release verification**

Run:

```bash
npm test -- --watchAll=false src/utils/__tests__/safetyPlanWorkflow.test.ts src/services/__tests__/safetyPlanStore.test.ts src/pages/SafetyPlans.test.tsx src/pages/SafetyPlanEditor.test.tsx src/pages/JobDetail.safetyPlans.test.tsx src/__tests__/authenticated-store-api.test.ts
npm test -- --watchAll=false
npm run build
```

Expected: all tests PASS and production build completes.

- [ ] **Step 5: Commit**

```bash
git add src/pages/JobDetail.tsx src/pages/JobDetail.safetyPlans.test.tsx
git commit -m "feat: link controlled safety plans to jobs"
```
