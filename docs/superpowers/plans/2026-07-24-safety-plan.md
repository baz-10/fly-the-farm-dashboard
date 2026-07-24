# Optional Job Safety Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an optional, CASA/ReOC-aligned, job-level Safety Plan with a tenant-editable master, guided field workflow, mission/JSA/Risk Assessment consolidation, controlled approval and revision, crew acknowledgements, attachments and deterministic PDF records.

**Architecture:** Add a focused Safety Plan domain and repository on top of the existing tenant-scoped persistence gateway. Store company masters, plans and audit events in separate allowlisted collections; keep approved versions immutable and generate job plans from snapshots. Expose the workflow through Job and Compliance routes, with server-enforced permissions and a small attachment gateway backed by tenant-prefixed Supabase Storage objects.

**Tech Stack:** React 19, TypeScript 5.9, React Router 7, MUI 7, Vitest 4, Testing Library, jsPDF 4, Playwright 1.61, Vite 7, Vercel Functions, Supabase REST and Storage APIs.

## Global Constraints

- Safety Plans are optional at job level and never block mission planning, authorisation, commencement or completion.
- A missing acknowledgement is an attention item only.
- Only a company administrator or a user explicitly nominated as a Safety Plan operational authority may approve.
- Approved and superseded plan versions are immutable and cannot be deleted.
- Any edit to an approved plan creates a new draft version requiring approval.
- Every job plan stores the company-master snapshot used to create it.
- Imported mission/JSA/Risk Assessment items retain source identifiers; refresh never silently overwrites company-authored controls or notes.
- All data access is tenant-isolated server-side; client-side hiding is not access control.
- Platform support has no Safety Plan content or attachment access.
- Approved and superseded plans carry a minimum seven-year retention date.
- Product copy says “CASA/ReOC aligned” and “not CASA approved”.
- The supplied standard is initially Australian; future jurisdiction packs must not mutate historical plans.
- Existing contractor financial privacy and mission workflow gates must remain green.
- The certification and controlled-manual register is explicitly deferred to a separate design and plan.

---

### Task 1: Define the Safety Plan domain and CASA-aligned standard

**Files:**
- Create: `src/types/safetyPlan.ts`
- Create: `src/data/safetyPlanStandard.ts`
- Create: `src/utils/safetyPlanRules.ts`
- Create: `src/utils/__tests__/safetyPlanRules.test.ts`
- Create: `src/test/safetyPlanFixtures.ts`
- Modify: `scripts/test-baseline-manifest.json`

**Interfaces:**
- Produces: `SafetyPlanTemplate`, `SafetyPlan`, `SafetyPlanVersion`, `SafetyPlanStatus`, `SafetyPlanSection`, `SafetyPlanAuditEvent`, `SafetyPlanAttachment`, `SafetyPlanActor`, `SafetyPlanSourceLink`.
- Produces: `AU_REOC_SAFETY_PLAN_STANDARD`.
- Produces: `getPlanAttention(plan)`, `canSubmitPlan(plan)`, `getRetentionUntil(approvedAt)`, `nextPlanVersion(current)`.

- [ ] **Step 1: Write failing domain-rule tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  canSubmitPlan,
  getPlanAttention,
  getRetentionUntil,
  nextPlanVersion,
} from '../safetyPlanRules';
import { makeSafetyPlan } from '../../test/safetyPlanFixtures';

describe('Safety Plan rules', () => {
  it('does not treat an absent plan or acknowledgement as a mission blocker', () => {
    expect(getPlanAttention(makeSafetyPlan({ acknowledgements: [] }))).toContainEqual(
      expect.objectContaining({ code: 'crew_acknowledgement', blocking: false })
    );
  });

  it('blocks only plan submission when a template-required field is empty', () => {
    const plan = makeSafetyPlan({ sections: [{ id: 'scope', required: true, fields: [] }] });
    expect(canSubmitPlan(plan)).toEqual({
      ok: false,
      missing: ['scope'],
    });
  });

  it('retains approved records for at least seven years', () => {
    expect(getRetentionUntil('2026-07-24T00:00:00.000Z')).toBe('2033-07-24T00:00:00.000Z');
  });

  it('increments controlled versions without mutating the approved version', () => {
    expect(nextPlanVersion('3.2')).toBe('3.3');
  });
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
npx vitest run src/utils/__tests__/safetyPlanRules.test.ts
```

Expected: FAIL because the Safety Plan types, fixtures and rules do not exist.

- [ ] **Step 3: Define the domain types**

Create focused types including these required fields:

```ts
export type SafetyPlanStatus =
  | 'not_required'
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'superseded';

export interface SafetyPlanActor {
  userId: string;
  name: string;
  role: 'admin' | 'contractor';
  operationalAuthority: boolean;
}

export interface SafetyPlanSourceLink {
  sourceType: 'mission' | 'jsa' | 'risk_assessment';
  sourceId: string;
  sourceUpdatedAt: string;
}

export interface SafetyPlanVersion {
  id: string;
  planId: string;
  version: string;
  status: Exclude<SafetyPlanStatus, 'not_required'>;
  templateSnapshot: SafetyPlanTemplate;
  sections: SafetyPlanSection[];
  sourceSnapshot: SafetyPlanSourceSnapshot;
  attachments: SafetyPlanAttachment[];
  acknowledgements: SafetyPlanAcknowledgement[];
  approvedBy?: SafetyPlanActor;
  approvedAt?: string;
  contentDigest?: string;
  retentionUntil?: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
}

export interface SafetyPlan {
  id: string;
  jobId: string;
  tenantId: string;
  status: SafetyPlanStatus;
  currentVersionId?: string;
  versions: SafetyPlanVersion[];
  notRequiredReason?: string;
  createdAt: string;
  updatedAt: string;
}
```

`revision` is an optimistic-concurrency integer. Do not put live mutable Job or
Mission objects into the plan; store typed snapshots.

- [ ] **Step 4: Add the CASA/ReOC-aligned standard**

`AU_REOC_SAFETY_PLAN_STANDARD` must contain the 14 approved sections from the
design, version `AU-REOC-1.0`, jurisdiction `AU`, and this notice:

```ts
export const SAFETY_PLAN_NOTICE =
  'CASA/ReOC aligned. This plan is not CASA approved and does not replace the operator’s approved manuals, authorisations, legal obligations or professional judgement.';
```

Every field has a stable ID, label, help text, type, required flag and
`companyEditable` flag. The platform standard itself is frozen with
`Object.freeze`.

- [ ] **Step 5: Implement pure rules and fixtures**

Create `src/test/safetyPlanFixtures.ts` with `makeSafetyPlan`,
`makeSafetyPlanVersion` and `makeSafetyPlanTemplate`. Implement rules without
React, storage or clock globals; accept ISO timestamps as arguments where
needed.

- [ ] **Step 6: Run focused and type checks**

Run:

```bash
npx vitest run src/utils/__tests__/safetyPlanRules.test.ts
npx tsc --noEmit
```

Expected: all focused tests and TypeScript pass.

- [ ] **Step 7: Commit**

```bash
git add src/types/safetyPlan.ts src/data/safetyPlanStandard.ts src/utils/safetyPlanRules.ts src/utils/__tests__/safetyPlanRules.test.ts src/test/safetyPlanFixtures.ts scripts/test-baseline-manifest.json
git commit -m "feat: define Safety Plan domain"
```

---

### Task 2: Enforce Safety Plan permissions and tenant-scoped storage

**Files:**
- Create: `src/utils/safetyPlanPermissions.ts`
- Create: `src/utils/__tests__/safetyPlanPermissions.test.ts`
- Modify: `src/contexts/AuthContext.tsx`
- Modify: `server/session.js`
- Modify: `api/store.js`
- Modify: `src/__tests__/authenticated-auth-api.test.ts`
- Modify: `src/__tests__/authenticated-store-api.test.ts`
- Modify: `src/services/persistence.ts`
- Create: `docs/supabase-safety-plan-migration.sql`

**Interfaces:**
- Consumes: Task 1 domain types.
- Produces: `isSafetyPlanAuthority(user)`, `canEditSafetyPlan(user, plan)`, `canApproveSafetyPlan(user)`, `canDeleteSafetyPlan(user, version)`.
- Produces collections `ftf_safety_plan_templates`, `ftf_safety_plans`, `ftf_safety_plan_audit`.
- Extends `User` with `safetyPlanAuthority: boolean`.

- [ ] **Step 1: Write permission tests**

```ts
it.each([
  [{ role: 'admin', safetyPlanAuthority: false }, true],
  [{ role: 'contractor', safetyPlanAuthority: true }, true],
  [{ role: 'contractor', safetyPlanAuthority: false }, false],
  [{ role: 'client', safetyPlanAuthority: true }, false],
])('approver decision for %o is %s', (user, expected) => {
  expect(canApproveSafetyPlan(user as User)).toBe(expected);
});

it('never permits an approved or superseded version to be deleted', () => {
  expect(canDeleteSafetyPlan(admin, makeSafetyPlanVersion({ status: 'approved' }))).toBe(false);
  expect(canDeleteSafetyPlan(admin, makeSafetyPlanVersion({ status: 'superseded' }))).toBe(false);
});
```

- [ ] **Step 2: Write API security regressions**

Add cases proving:

```ts
it('rejects clients from every Safety Plan collection', async () => {
  mockAuthenticatedUser({ role: 'client', tenantId: 'tenant-a' });
  await handler(request('GET', { collection: 'ftf_safety_plans' }), response);
  expect(response.statusCode).toBe(403);
});

it('does not allow contractors to write approved plan snapshots', async () => {
  mockAuthenticatedUser({ role: 'contractor', safetyPlanAuthority: false });
  await handler(request('PUT', {
    collection: 'ftf_safety_plans',
    recordId: 'plan-1',
    payload: makeApprovedPlan(),
  }), response);
  expect(response.statusCode).toBe(403);
});

it('never returns a record from another tenant', async () => {
  mockAuthenticatedUser({ role: 'admin', tenantId: 'tenant-a' });
  mockSupabaseRows([{ tenant_id: 'tenant-b', payload: makeSafetyPlan() }]);
  await handler(request('GET', { collection: 'ftf_safety_plans' }), response);
  expect(response.body.records).toEqual([]);
});
```

- [ ] **Step 3: Run RED**

Run:

```bash
npx vitest run src/utils/__tests__/safetyPlanPermissions.test.ts src/__tests__/authenticated-auth-api.test.ts src/__tests__/authenticated-store-api.test.ts
```

Expected: FAIL because authority metadata and Safety Plan collections do not
exist.

- [ ] **Step 4: Add authority metadata to authenticated profiles**

Add `safety_plan_authority` to `server/session.js` profile selection and expose
only a boolean:

```js
safetyPlanAuthority: profile.safety_plan_authority === true,
```

Mirror it as `safetyPlanAuthority: boolean` in `User`, `StoredUser`, local cache
and local development accounts. Default is `false`; admins still approve by
role.

- [ ] **Step 5: Add the database migration**

Create an idempotent migration:

```sql
alter table public.ftf_profiles
  add column if not exists safety_plan_authority boolean not null default false;

comment on column public.ftf_profiles.safety_plan_authority is
  'Allows a non-client tenant user to approve controlled Safety Plans.';
```

Do not grant direct browser access to service-role storage or relax existing
row-level security.

- [ ] **Step 6: Add allowlisted collections and collection policies**

Replace the single role check with explicit collection policies:

```js
const COLLECTION_POLICIES = {
  ftf_safety_plan_templates: { read: ['admin', 'contractor'], write: ['admin'] },
  ftf_safety_plans: { read: ['admin', 'contractor'], write: ['admin', 'contractor'] },
  ftf_safety_plan_audit: { read: ['admin', 'contractor'], write: ['admin', 'contractor'] },
};
```

For `ftf_safety_plans`, validate every incoming transition server-side:

```js
assertSafetyPlanTransition({
  actor: user,
  stored: storedPayload,
  incoming: body.payload,
});
```

The assertion must reject tenant changes, edits to approved snapshots,
contractor approval, deletion of approved/superseded versions, audit-event
rewrites and stale revisions. Audit events are append-only.

- [ ] **Step 7: Add persistence keys**

```ts
safetyPlanTemplates: 'ftf_safety_plan_templates',
safetyPlans: 'ftf_safety_plans',
safetyPlanAudit: 'ftf_safety_plan_audit',
```

- [ ] **Step 8: Verify permissions**

Run:

```bash
npx vitest run src/utils/__tests__/safetyPlanPermissions.test.ts src/__tests__/authenticated-auth-api.test.ts src/__tests__/authenticated-store-api.test.ts
npx tsc --noEmit
```

Expected: all tests pass, including existing contractor financial-redaction
cases.

- [ ] **Step 9: Commit**

```bash
git add src/utils/safetyPlanPermissions.ts src/utils/__tests__/safetyPlanPermissions.test.ts src/contexts/AuthContext.tsx server/session.js api/store.js src/__tests__/authenticated-auth-api.test.ts src/__tests__/authenticated-store-api.test.ts src/services/persistence.ts docs/supabase-safety-plan-migration.sql
git commit -m "feat: secure Safety Plan storage"
```

---

### Task 3: Build the repository, concurrency and audit boundary

**Files:**
- Create: `src/services/safetyPlanRepository.ts`
- Create: `src/services/__tests__/safetyPlanRepository.test.ts`
- Create: `src/contexts/SafetyPlanContext.tsx`
- Create: `src/contexts/__tests__/SafetyPlanContext.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: Task 1 types and Task 2 persistence collections.
- Produces repository methods:

```ts
listPlans(): Promise<SafetyPlan[]>
getPlan(planId: string): Promise<SafetyPlan | null>
saveDraft(input: SaveSafetyPlanDraftInput): Promise<SafetyPlan>
submitPlan(planId: string, expectedRevision: number, actor: SafetyPlanActor): Promise<SafetyPlan>
markNotRequired(jobId: string, reason: string, actor: SafetyPlanActor): Promise<SafetyPlan>
appendAuditEvent(event: SafetyPlanAuditEvent): Promise<void>
```

- Produces persistence primitives:

```ts
readSharedRecord<T>(key: string, recordId: string): Promise<T | null>
writeSharedRecord<T>(key: string, recordId: string, payload: T): Promise<void>
```

- Produces `SafetyPlanProvider` and `useSafetyPlans()`.

- [ ] **Step 1: Write failing repository tests**

```ts
it('rejects a stale autosave instead of overwriting a newer draft', async () => {
  remotePlan.revision = 4;
  await expect(repository.saveDraft({
    plan: makeSafetyPlan({ revision: 3 }),
    expectedRevision: 3,
    actor,
  })).rejects.toMatchObject({ code: 'SAFETY_PLAN_CONFLICT', currentRevision: 4 });
});

it('appends an audit event after a confirmed write', async () => {
  await repository.saveDraft({ plan: draft, expectedRevision: 1, actor });
  expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({
    action: 'draft_saved',
    planId: draft.id,
    actor,
  }));
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
npx vitest run src/services/__tests__/safetyPlanRepository.test.ts src/contexts/__tests__/SafetyPlanContext.test.tsx
```

Expected: FAIL because the repository and provider do not exist.

- [ ] **Step 3: Implement record-by-record persistence**

Use `readSharedRecord`/`writeSharedRecord` rather than rewriting the entire
collection. If those primitives do not exist, add:

```ts
export async function writeSharedRecord<T>(
  key: string,
  recordId: string,
  payload: T
): Promise<void>;
```

The repository compares `expectedRevision` to the latest record before writes,
increments only after confirmation, and never treats optimistic local cache as
authoritative in remote mode.

- [ ] **Step 4: Implement autosave state**

`SafetyPlanContext` exposes:

```ts
type SaveState = 'idle' | 'saving' | 'saved' | 'pending_retry' | 'conflict';

interface SafetyPlanContextValue {
  plans: SafetyPlan[];
  saveState: SaveState;
  lastSavedAt?: string;
  error?: string;
  saveDraft(input: SaveSafetyPlanDraftInput): Promise<void>;
  retrySave(): Promise<void>;
  resolveConflict(choice: 'keep_remote' | 'create_revision'): Promise<void>;
}
```

Debounce field edits by 750 ms. Keep failed input in memory, show
`pending_retry`, and retry only from the explicit action or a new user edit.

- [ ] **Step 5: Register the provider**

Wrap authenticated application routes with `SafetyPlanProvider` inside the
existing provider order in `App.tsx`. Do not make initial Safety Plan loading
fatal to the rest of the dashboard.

- [ ] **Step 6: Verify**

Run:

```bash
npx vitest run src/services/__tests__/safetyPlanRepository.test.ts src/contexts/__tests__/SafetyPlanContext.test.tsx
npx tsc --noEmit
```

Expected: autosave, conflict, retry and audit tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/services/safetyPlanRepository.ts src/services/__tests__/safetyPlanRepository.test.ts src/contexts/SafetyPlanContext.tsx src/contexts/__tests__/SafetyPlanContext.test.tsx src/services/persistence.ts src/App.tsx
git commit -m "feat: add Safety Plan repository"
```

---

### Task 4: Generate job plans and consolidate mission safety sources

**Files:**
- Create: `src/services/safetyPlanPrefill.ts`
- Create: `src/services/__tests__/safetyPlanPrefill.test.ts`
- Create: `src/utils/safetyPlanSourceSync.ts`
- Create: `src/utils/__tests__/safetyPlanSourceSync.test.ts`
- Modify: `src/types/mission.ts`

**Interfaces:**
- Consumes: Jobs from `fieldManagementStore`, missions from
  `PERSISTENCE_KEYS.missions`, aircraft and work packs from their existing
  contexts, and Task 1 templates.
- Produces:

```ts
buildJobSafetyPlan(input: BuildJobSafetyPlanInput): SafetyPlan
diffSafetyPlanSources(current: SafetyPlanSourceSnapshot, latest: SafetyPlanSourceSnapshot): SafetyPlanSourceDiff
applySourceRefresh(version: SafetyPlanVersion, diff: SafetyPlanSourceDiff, decisions: SourceRefreshDecision[]): SafetyPlanVersion
```

- [ ] **Step 1: Write source-consolidation tests**

```ts
it('consolidates linked mission JSA risks and preserves source identity', () => {
  const result = buildJobSafetyPlan({
    job,
    missions: [missionWithJsa('m1'), missionWithJsa('m2')],
    template,
    actor,
    now: '2026-07-24T00:00:00.000Z',
  });

  expect(result.versions[0].sourceSnapshot.hazards).toEqual([
    expect.objectContaining({ sourceId: 'm1', sourceType: 'jsa' }),
    expect.objectContaining({ sourceId: 'm2', sourceType: 'risk_assessment' }),
  ]);
});

it('does not overwrite a company-authored control during refresh', () => {
  const refreshed = applySourceRefresh(versionWithCustomControl, diff, [
    { itemId: 'risk-1', action: 'keep_company_value' },
  ]);
  expect(refreshed.sections).toContainEqual(
    expect.objectContaining({ value: 'Company spotter remains at western gate' })
  );
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
npx vitest run src/services/__tests__/safetyPlanPrefill.test.ts src/utils/__tests__/safetyPlanSourceSync.test.ts
```

Expected: FAIL because prefill and source-sync functions do not exist.

- [ ] **Step 3: Implement deterministic prefill**

`BuildJobSafetyPlanInput` accepts all source records explicitly; do not read
localStorage inside the pure builder. Snapshot company, job, client, property,
field, dates, crew, assets, chemicals, site notes and emergency contacts.
Match missions to a job by `mission.jobId === job.id`; do not infer by name.

- [ ] **Step 4: Implement diff and conflict decisions**

Diff by `(sourceType, sourceId, sourceItemId, sourceUpdatedAt)`. Classify
`added`, `changed`, `removed` and `unchanged`. Applying a refresh requires an
explicit decision for every changed or removed item and emits
`source_refreshed` audit metadata.

- [ ] **Step 5: Verify**

Run:

```bash
npx vitest run src/services/__tests__/safetyPlanPrefill.test.ts src/utils/__tests__/safetyPlanSourceSync.test.ts
npx tsc --noEmit
```

Expected: prefill is deterministic and conflict cases pass.

- [ ] **Step 6: Commit**

```bash
git add src/services/safetyPlanPrefill.ts src/services/__tests__/safetyPlanPrefill.test.ts src/utils/safetyPlanSourceSync.ts src/utils/__tests__/safetyPlanSourceSync.test.ts src/types/mission.ts
git commit -m "feat: prefill job Safety Plans"
```

---

### Task 5: Add the Compliance register and company-master editor

**Files:**
- Create: `src/pages/SafetyPlanRegister.tsx`
- Create: `src/pages/SafetyPlanRegister.test.tsx`
- Create: `src/pages/SafetyPlanTemplateEditor.tsx`
- Create: `src/pages/SafetyPlanTemplateEditor.test.tsx`
- Create: `src/components/safety-plan/SafetyPlanStatusChip.tsx`
- Modify: `src/pages/ComplianceMenu.tsx`
- Modify: `src/App.tsx`
- Modify: `src/__tests__/route-manifest.test.tsx`

**Interfaces:**
- Consumes: `useSafetyPlans()`, `AU_REOC_SAFETY_PLAN_STANDARD`, Task 2
  permission helpers.
- Produces routes `/compliance/safety-plans` and
  `/compliance/safety-plans/template`.

- [ ] **Step 1: Write route and register tests**

```tsx
it('lists plans by status without treating not-required jobs as failures', async () => {
  renderRegister({
    plans: [
      makeSafetyPlan({ status: 'draft' }),
      makeSafetyPlan({ status: 'not_required' }),
    ],
  });
  expect(screen.getByText('Draft')).toBeInTheDocument();
  expect(screen.getByText('Not required')).toBeInTheDocument();
  expect(screen.queryByText(/mission blocked/i)).not.toBeInTheDocument();
});

it('does not expose template editing to a contractor', () => {
  renderRegister({ user: contractor });
  expect(screen.queryByRole('link', { name: /manage company template/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
npx vitest run src/pages/SafetyPlanRegister.test.tsx src/pages/SafetyPlanTemplateEditor.test.tsx src/__tests__/route-manifest.test.tsx
```

Expected: FAIL because the routes and pages do not exist.

- [ ] **Step 3: Build the register**

Add search and filters for status, job, owner, approver, date and attention
items. Each row shows job, current version, status, last update, approval,
acknowledgement count and actions allowed for the current user.

- [ ] **Step 4: Build template management**

On first use, clone `AU_REOC_SAFETY_PLAN_STANDARD` into
`ftf_safety_plan_templates`. Administrators can:

```ts
updateSection(sectionId, { title, description, optional })
updateField(sectionId, fieldId, { label, helpText, required })
reorderSections(sectionIds)
compareStandardVersion()
adoptStandardSection(sectionId)
publishCompanyMaster()
```

Publishing increments the company-master version and freezes that snapshot.
It never edits previous masters.

- [ ] **Step 5: Add Compliance entry and routes**

Add a “Safety Plans” card to `ComplianceMenu`. Add protected admin/contractor
register routing, and admin-only rendering inside the template page. Direct
contractor navigation to the template route returns an access-denied panel.

- [ ] **Step 6: Verify**

Run:

```bash
npx vitest run src/pages/SafetyPlanRegister.test.tsx src/pages/SafetyPlanTemplateEditor.test.tsx src/__tests__/route-manifest.test.tsx
npx tsc --noEmit
```

Expected: register, template permissions and route manifest pass.

- [ ] **Step 7: Commit**

```bash
git add src/pages/SafetyPlanRegister.tsx src/pages/SafetyPlanRegister.test.tsx src/pages/SafetyPlanTemplateEditor.tsx src/pages/SafetyPlanTemplateEditor.test.tsx src/components/safety-plan/SafetyPlanStatusChip.tsx src/pages/ComplianceMenu.tsx src/App.tsx src/__tests__/route-manifest.test.tsx
git commit -m "feat: add Safety Plan compliance register"
```

---

### Task 6: Build the five-step guided field workflow

**Files:**
- Create: `src/pages/SafetyPlanEditor.tsx`
- Create: `src/pages/SafetyPlanEditor.test.tsx`
- Create: `src/components/safety-plan/SafetyPlanStepper.tsx`
- Create: `src/components/safety-plan/SafetyPlanReadiness.tsx`
- Create: `src/components/safety-plan/JobDetailsStep.tsx`
- Create: `src/components/safety-plan/PeopleAssetsStep.tsx`
- Create: `src/components/safety-plan/HazardsControlsStep.tsx`
- Create: `src/components/safety-plan/EmergencyPlanningStep.tsx`
- Create: `src/components/safety-plan/ReviewSubmitStep.tsx`
- Create: `src/components/safety-plan/SourceRefreshDialog.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: Task 3 provider and Task 4 prefill/source sync.
- Produces route `/compliance/safety-plans/:planId`.
- Produces `SafetyPlanEditor` with accessible five-step navigation.

- [ ] **Step 1: Write the interaction tests**

```tsx
it('moves through five short steps and keeps readiness visible', async () => {
  renderEditor(draft);
  expect(screen.getByRole('heading', { name: /job details/i })).toBeVisible();
  expect(screen.getByTestId('safety-plan-readiness')).toBeVisible();

  await user.click(screen.getByRole('button', { name: /next: people and assets/i }));
  expect(screen.getByRole('heading', { name: /people and assets/i })).toBeVisible();
});

it('shows source changes and requires a decision before applying them', async () => {
  renderEditor(draftWithChangedSources);
  await user.click(screen.getByRole('button', { name: /review source changes/i }));
  expect(screen.getByText(/company spotter remains/i)).toBeVisible();
  expect(screen.getByRole('button', { name: /apply refresh/i })).toBeDisabled();
});

it('shows failed autosave as retryable without losing entered text', async () => {
  repository.saveDraft.mockRejectedValueOnce(new Error('offline'));
  renderEditor(draft);
  await user.type(screen.getByLabelText(/scope notes/i), 'Keep gate closed');
  expect(await screen.findByText(/save pending/i)).toBeVisible();
  expect(screen.getByDisplayValue('Keep gate closed')).toBeVisible();
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
npx vitest run src/pages/SafetyPlanEditor.test.tsx
```

Expected: FAIL because the editor components do not exist.

- [ ] **Step 3: Implement the shell and stepper**

Use MUI responsive layout:

- phone: vertical step selector, full-width content, sticky bottom actions;
- tablet/desktop: content plus 300 px readiness rail;
- touch targets at least 44 px;
- no horizontal scroll at 375 px.

The route restores the last visited step from the plan draft, not global
localStorage.

- [ ] **Step 4: Implement the five focused steps**

Each step renders fields from the template snapshot and specialised linked
record panels. Do not create a generic 1,000-line dynamic-form component.
Shared field rendering belongs in
`src/components/safety-plan/SafetyPlanField.tsx`.

Hazards show source mission, source JSA question, original risk score,
mitigation and company control. Emergency planning includes contacts,
communications, lost contact, incident, fire, first aid, spill and
environmental response.

- [ ] **Step 5: Wire autosave and source refresh**

Every edit calls the provider’s debounced save. Display:

```tsx
<SaveIndicator state={saveState} lastSavedAt={lastSavedAt} onRetry={retrySave} />
```

Apply source changes only after all conflicts have a selected decision.

- [ ] **Step 6: Verify responsive and interaction tests**

Run:

```bash
npx vitest run src/pages/SafetyPlanEditor.test.tsx
npx tsc --noEmit
```

Expected: five-step, autosave, conflict, keyboard and 375 px layout tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/pages/SafetyPlanEditor.tsx src/pages/SafetyPlanEditor.test.tsx src/components/safety-plan src/App.tsx
git commit -m "feat: add guided Safety Plan editor"
```

---

### Task 7: Add submission, approval, acknowledgements and revisions

**Files:**
- Create: `src/services/safetyPlanApproval.ts`
- Create: `src/services/__tests__/safetyPlanApproval.test.ts`
- Create: `src/components/safety-plan/SafetyPlanApprovalPanel.tsx`
- Create: `src/components/safety-plan/SafetyPlanApprovalPanel.test.tsx`
- Modify: `src/services/safetyPlanRepository.ts`
- Modify: `api/store.js`
- Modify: `src/__tests__/authenticated-store-api.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3 domain, permissions and repository.
- Produces:

```ts
submitSafetyPlan(plan, actor, now): SafetyPlan
approveSafetyPlan(plan, actor, now): Promise<SafetyPlan>
acknowledgeSafetyPlan(plan, actor, now): SafetyPlan
reviseSafetyPlan(plan, actor, now): SafetyPlan
```

- [ ] **Step 1: Write lifecycle tests**

```ts
it('locks an approved snapshot and creates a digest and retention date', async () => {
  const approved = await approveSafetyPlan(submitted, authority, NOW);
  expect(approved.status).toBe('approved');
  expect(approved.currentVersion.contentDigest).toMatch(/^[a-f0-9]{64}$/);
  expect(approved.currentVersion.retentionUntil).toBe('2033-07-24T00:00:00.000Z');
  expect(Object.isFrozen(approved.currentVersion)).toBe(true);
});

it('creates a new draft instead of editing an approved version', () => {
  const revised = reviseSafetyPlan(approved, admin, NOW);
  expect(revised.versions).toHaveLength(2);
  expect(revised.versions[0].status).toBe('approved');
  expect(revised.versions[1]).toMatchObject({ status: 'draft', version: '1.1' });
});

it('records acknowledgement but never changes mission authorisation', () => {
  const result = acknowledgeSafetyPlan(approved, pic, NOW);
  expect(result.currentVersion.acknowledgements).toContainEqual(
    expect.objectContaining({ userId: pic.userId, version: '1.0' })
  );
  expect(result.missionBlocking).toBeUndefined();
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
npx vitest run src/services/__tests__/safetyPlanApproval.test.ts src/components/safety-plan/SafetyPlanApprovalPanel.test.tsx src/__tests__/authenticated-store-api.test.ts
```

Expected: FAIL because lifecycle operations do not exist.

- [ ] **Step 3: Implement deterministic digesting**

Canonicalise approved content by sorting object keys and excluding transient UI
fields. Compute SHA-256 with `crypto.subtle` in the browser and Node
`crypto.createHash` in server verification. The server recalculates and rejects
a mismatched digest.

- [ ] **Step 4: Implement lifecycle transactions**

Each operation writes the plan and audit event with a shared `operationId`.
If audit append fails, return a retryable error and do not show approval as
confirmed. The latest stored revision is re-read before approval.

- [ ] **Step 5: Implement the approval panel**

The panel shows required-field readiness, source-change warnings, approvals,
crew acknowledgements and history. Only `canApproveSafetyPlan(user)` sees the
Approve action. All other users see the named approving authority requirement.

- [ ] **Step 6: Verify**

Run:

```bash
npx vitest run src/services/__tests__/safetyPlanApproval.test.ts src/components/safety-plan/SafetyPlanApprovalPanel.test.tsx src/__tests__/authenticated-store-api.test.ts
npx tsc --noEmit
```

Expected: lifecycle, server-transition and role tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/services/safetyPlanApproval.ts src/services/__tests__/safetyPlanApproval.test.ts src/components/safety-plan/SafetyPlanApprovalPanel.tsx src/components/safety-plan/SafetyPlanApprovalPanel.test.tsx src/services/safetyPlanRepository.ts api/store.js src/__tests__/authenticated-store-api.test.ts
git commit -m "feat: add controlled Safety Plan approval"
```

---

### Task 8: Add tenant-isolated attachments

**Files:**
- Create: `api/safety-attachments.js`
- Create: `server/safetyAttachmentPolicy.js`
- Create: `server/safetyAttachmentPolicy.test.ts`
- Create: `src/services/safetyPlanAttachments.ts`
- Create: `src/services/__tests__/safetyPlanAttachments.test.ts`
- Create: `src/components/safety-plan/SafetyPlanAttachments.tsx`
- Create: `src/components/safety-plan/SafetyPlanAttachments.test.tsx`
- Modify: `server/supabase.js`
- Modify: `server/localApiMiddleware.js`
- Modify: `server/localApiMiddleware.test.ts`
- Modify: `vercel.json`
- Modify: `docs/supabase-safety-plan-migration.sql`

**Interfaces:**
- Produces upload/list/download/delete endpoint `/api/safety-attachments`.
- Produces object path
  `<tenantId>/<planId>/<versionId>/<attachmentId>/<sanitisedFilename>`.
- Produces client methods `uploadSafetyPlanAttachment`,
  `downloadSafetyPlanAttachment`, `deleteDraftSafetyPlanAttachment`.

- [ ] **Step 1: Write attachment policy tests**

```ts
it('builds tenant-prefixed paths and rejects traversal', () => {
  expect(buildAttachmentPath('tenant-a', 'plan-1', 'v1', 'a1', '../../x.pdf'))
    .toBe('tenant-a/plan-1/v1/a1/x.pdf');
});

it.each([
  ['application/pdf', true],
  ['image/jpeg', true],
  ['image/png', true],
  ['text/html', false],
  ['application/javascript', false],
])('allows %s = %s', (contentType, allowed) => {
  expect(isAllowedAttachmentType(contentType)).toBe(allowed);
});

it('rejects files above 3 MiB before upload', () => {
  expect(() => assertAttachmentSize(3 * 1024 * 1024 + 1)).toThrow(/3 MiB/);
});
```

- [ ] **Step 2: Write endpoint security tests**

Prove:

- tenant A cannot list/download/delete tenant B paths;
- contractors can upload to editable assigned plans only;
- approved-version attachments cannot be deleted;
- clients and platform support receive 403;
- raw Supabase credentials never reach the browser.

- [ ] **Step 3: Run RED**

Run:

```bash
npx vitest run server/safetyAttachmentPolicy.test.ts src/services/__tests__/safetyPlanAttachments.test.ts src/components/safety-plan/SafetyPlanAttachments.test.tsx server/localApiMiddleware.test.ts
```

Expected: FAIL because the gateway does not exist.

- [ ] **Step 4: Implement the binary gateway**

Accept `POST` with the file as the raw request body and metadata in validated
headers:

```text
X-Safety-Plan-Id
X-Safety-Plan-Version-Id
X-Attachment-Id
X-File-Name
Content-Type
Content-Length
```

Limit to 3 MiB, PDF/JPEG/PNG, and same origin. Use the authenticated tenant ID
to construct the object path; never accept a tenant ID from the client. Add a
raw-response Supabase helper for Storage object PUT/GET/DELETE.

- [ ] **Step 5: Implement UI and retry**

The component shows upload progress, retry, description, uploader, size,
digest and version. Failed uploads remain as local retry entries and are not
added to the plan manifest until the server confirms object storage.

- [ ] **Step 6: Register local and Vercel routing**

Add the exact handler to Vite dev/preview middleware and retain the SPA
exclusion for all `/api/` routes. Add an appropriate Vercel function duration.
Extend the migration with a private bucket:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ftf-safety-attachments',
  'ftf-safety-attachments',
  false,
  3145728,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
```

All object operations pass through the authenticated server gateway using the
service role. Do not add an anonymous or authenticated-user Storage policy.

- [ ] **Step 7: Verify**

Run:

```bash
npx vitest run server/safetyAttachmentPolicy.test.ts src/services/__tests__/safetyPlanAttachments.test.ts src/components/safety-plan/SafetyPlanAttachments.test.tsx server/localApiMiddleware.test.ts
npx tsc --noEmit
npm run build
```

Expected: policy, service, component, local API and build gates pass.

- [ ] **Step 8: Commit**

```bash
git add api/safety-attachments.js server/safetyAttachmentPolicy.js server/safetyAttachmentPolicy.test.ts src/services/safetyPlanAttachments.ts src/services/__tests__/safetyPlanAttachments.test.ts src/components/safety-plan/SafetyPlanAttachments.tsx src/components/safety-plan/SafetyPlanAttachments.test.tsx server/supabase.js server/localApiMiddleware.js server/localApiMiddleware.test.ts vercel.json docs/supabase-safety-plan-migration.sql
git commit -m "feat: add Safety Plan attachments"
```

---

### Task 9: Integrate Jobs and deterministic PDF records

**Files:**
- Create: `src/components/safety-plan/JobSafetyPlanCard.tsx`
- Create: `src/components/safety-plan/JobSafetyPlanCard.test.tsx`
- Create: `src/utils/safetyPlanPdf.ts`
- Create: `src/utils/__tests__/safetyPlanPdf.test.ts`
- Modify: `src/pages/JobDetail.tsx`
- Create: `src/pages/JobDetail.test.tsx`
- Modify: `src/pages/SafetyPlanEditor.tsx`

**Interfaces:**
- Consumes: approved Safety Plan snapshots.
- Produces `buildSafetyPlanPdf(plan, version, company): Promise<jsPDF>`.
- Produces Job actions create, continue, view, acknowledge, revise, print and
  export.

- [ ] **Step 1: Write Job non-blocking tests**

```tsx
it('offers an optional Safety Plan without changing mission readiness', () => {
  renderJob({ plan: null, missionAuthorised: true });
  expect(screen.getByText('Safety Plan optional')).toBeVisible();
  expect(screen.getByText('Mission authorised')).toBeVisible();
  expect(screen.getByRole('button', { name: /create safety plan/i })).toBeEnabled();
});

it('records not required without creating a blocker', async () => {
  renderJob({ plan: null });
  await user.click(screen.getByRole('button', { name: /not required/i }));
  await user.type(screen.getByLabelText(/reason/i), 'JSA and risk assessment sufficient');
  await user.click(screen.getByRole('button', { name: /confirm/i }));
  expect(markNotRequired).toHaveBeenCalled();
  expect(setMissionStatus).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Write deterministic PDF tests**

```ts
it('renders the approved snapshot rather than changed live mission data', async () => {
  const doc = await buildSafetyPlanPdf(approvedPlan, approvedVersion, company);
  const text = extractJsPdfText(doc);
  expect(text).toContain('Western boundary spotter');
  expect(text).not.toContain('Later live mission edit');
});

it('includes control and disclaimer metadata', async () => {
  const text = extractJsPdfText(await buildSafetyPlanPdf(plan, version, company));
  expect(text).toContain('Version 1.0');
  expect(text).toContain('CASA/ReOC aligned');
  expect(text).toContain('not CASA approved');
  expect(text).toContain(version.contentDigest);
});
```

- [ ] **Step 3: Run RED**

Run:

```bash
npx vitest run src/components/safety-plan/JobSafetyPlanCard.test.tsx src/utils/__tests__/safetyPlanPdf.test.ts src/pages/JobDetail.test.tsx
```

Expected: FAIL because Job integration and PDF builder do not exist.

- [ ] **Step 4: Add Job integration**

Render `JobSafetyPlanCard` near existing Compliance Records. Use job ID as the
only plan association. “Not required” records actor, time and optional reason.
Do not call mission state setters from any Safety Plan action.

- [ ] **Step 5: Build the PDF**

Reuse the existing jsPDF typography and sanitisation conventions. Add page
numbers, company/job identity, all approved sections, source references,
approval, acknowledgements, revision history, attachment manifest, digest and
notice. Generate from `SafetyPlanVersion` only.

Save with:

```ts
`Safety_Plan_${sanitiseFilename(jobName)}_${version.version}.pdf`
```

Print by opening the generated blob URL and invoking the browser print dialog;
revoke the URL after use.

Add “Export client copy” for administrators. It generates the same immutable
approved PDF, omits internal-only audit metadata, and appends a
`client_copy_exported` audit event with client ID and actor. This is the
first-release explicit sharing mechanism; it does not create client portal
access or a public link.

- [ ] **Step 6: Verify**

Run:

```bash
npx vitest run src/components/safety-plan/JobSafetyPlanCard.test.tsx src/utils/__tests__/safetyPlanPdf.test.ts src/pages/JobDetail.test.tsx
npx tsc --noEmit
npm run build
```

Expected: optional behaviour, snapshot PDF and build pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/safety-plan/JobSafetyPlanCard.tsx src/components/safety-plan/JobSafetyPlanCard.test.tsx src/utils/safetyPlanPdf.ts src/utils/__tests__/safetyPlanPdf.test.ts src/pages/JobDetail.tsx src/pages/JobDetail.test.tsx src/pages/SafetyPlanEditor.tsx
git commit -m "feat: link Safety Plans to jobs and PDF"
```

---

### Task 10: Add end-to-end release gates and operational documentation

**Files:**
- Create: `e2e/safety-plan-workflow.spec.ts`
- Modify: `e2e/fixtures/auth.ts`
- Modify: `server/localApiMiddleware.js`
- Modify: `server/localApiMiddleware.test.ts`
- Modify: `scripts/test-inventory.test.ts`
- Modify: `scripts/test-baseline-manifest.json`
- Modify: `docs/production-deployment.md`
- Create: `docs/safety-plans.md`

**Interfaces:**
- Consumes: complete Safety Plan workflow.
- Produces: browser release gate for create, prefill, edit, submit, approve,
  acknowledge, revise and export.

- [ ] **Step 1: Write the failing browser workflow**

```ts
test('completes the optional Safety Plan lifecycle without blocking a mission', async ({ page }) => {
  await seedSafetyPlanScenario(page);
  await page.goto('/jobs/client/c1/property/p1/field/f1/job/j1');

  await expect(page.getByText('Mission authorised')).toBeVisible();
  await page.getByRole('button', { name: 'Create Safety Plan' }).click();
  await expect(page.getByText('3 hazards imported')).toBeVisible();

  await completeRequiredSafetyPlanFields(page);
  await page.getByRole('button', { name: 'Submit for approval' }).click();
  await authenticateAsAuthority(page);
  await page.getByRole('button', { name: 'Approve Safety Plan' }).click();
  await expect(page.getByText('Approved · Version 1.0')).toBeVisible();

  await authenticateAsPic(page);
  await page.getByRole('button', { name: 'Read and acknowledge' }).click();
  await expect(page.getByText('Acknowledged')).toBeVisible();
  await expect(page.getByText('Mission authorised')).toBeVisible();
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
npm run test:e2e -- e2e/safety-plan-workflow.spec.ts
```

Expected: FAIL until fixture collections and complete browser interactions are
available.

- [ ] **Step 3: Extend local read-only fixtures safely**

Add synthetic Safety Plan templates, plans, jobs and linked missions. Browser
tests requiring writes use a process-memory test repository enabled only by:

```text
FTF_E2E_AUTH_FIXTURE=local-playwright-only
Host is loopback
VERCEL is not 1
```

It must never fall through to Supabase and must be reset between tests. Add
regressions proving Vercel requests remain authenticated and production
storage is untouched.

- [ ] **Step 4: Cover critical lifecycle and privacy**

Add browser cases for:

- “Not required” remains non-blocking;
- company master editing is admin-only;
- contractor cannot approve;
- source change requires a conflict decision;
- failed autosave retains text and retries;
- approved version is immutable;
- revision supersedes rather than deletes;
- missing acknowledgement is attention only;
- client cannot open a plan without explicit sharing;
- contractor cannot see unrelated tenant plan IDs;
- approved PDF download contains version and notice;
- 375 px editor has no horizontal overflow.

- [ ] **Step 5: Document operations**

`docs/safety-plans.md` documents roles, optional behaviour, standard versus
company master, lifecycle, retention, source refresh, attachments, PDF,
disclaimer and recovery. `docs/production-deployment.md` adds:

- Supabase profile boolean migration for `safety_plan_authority`;
- creation and private policy of the `ftf-safety-attachments` bucket;
- protected-preview checks;
- rollback to the immediately preceding deployment.

- [ ] **Step 6: Run the complete release gate**

Run:

```bash
npm ls
npm test
npm run test:coverage
npm run build
npm run test:e2e
git diff --check
```

Expected:

- valid dependency tree;
- all Vitest files and cases pass with no skipped tests;
- coverage command succeeds;
- TypeScript and Vite production build succeed;
- all existing and Safety Plan Chromium workflows pass;
- branch diff is clean.

- [ ] **Step 7: Commit**

```bash
git add e2e/safety-plan-workflow.spec.ts e2e/fixtures/auth.ts server/localApiMiddleware.js server/localApiMiddleware.test.ts scripts/test-inventory.test.ts scripts/test-baseline-manifest.json docs/production-deployment.md docs/safety-plans.md
git commit -m "test: add Safety Plan release gates"
```

---

## Delivery sequence and review gates

Each task is independently reviewed before the next task begins:

1. Domain and standard
2. Permissions and storage
3. Repository and autosave
4. Prefill and source synchronisation
5. Compliance register and master template
6. Guided editor
7. Approval, acknowledgement and revisions
8. Attachments
9. Job and PDF integration
10. End-to-end release audit

Do not deploy directly from an implementation task. Publish a draft pull
request, verify the protected Vercel preview with administrator, contractor,
PIC and client scenarios, then merge only after user approval.
