# Multi-Field, Multi-Day Mission Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing Job and Mission authorities so one Client Job can cover multiple Properties and Fields, one CRP-authorised Mission can span multiple operating days, and each day can retain reconciled Field, aircraft, chemical, weather, JSA and flight-line evidence through final sign-off and Job closure.

**Architecture:** Reuse the existing relational `job_fields`, immutable Mission/JSA/authorisation revisions, operational closeout, Fleet meter, Financial prefill, report, audit and transactional-outbox authorities. Add a focused checked Mission Operations database/API boundary for Mission Field scope, operating days, daily evidence and final sign-off; expose it through strict TypeScript decoders and progressively disclosed React workspaces. Each delivery slice is independently testable and receives a separate review gate; every proposed migration remains development-only until separately approved for Production.

**Tech Stack:** PostgreSQL/Supabase migrations and checked `SECURITY DEFINER` RPCs, Node/Vercel server handlers, React 18, TypeScript, Material UI, Jest/PGlite, Playwright Chromium/WebKit, existing report renderer and Product Maturity governance.

**Spec:** `docs/superpowers/specs/2026-09-04-multifield-multiday-mission-operations-design.md`

## Global Constraints

- A Job belongs to exactly one Client; all selected Properties and Fields must resolve server-side to that Client and organisation.
- A Mission selects a non-empty subset of its Job Fields and may span multiple operating days.
- One versioned JSA governs the Mission; every operating day confirms the effective JSA revision.
- Only an eligible CRP can authorise the exact immutable Mission package/JSA revision before operations begin.
- Daily aircraft totals are authoritative; individual flights are optional and must reconcile when present.
- Planned chemicals are not actual application evidence; actuals are recorded per operating day and Field.
- Weather evidence is frozen to the actual operating interval or an explicitly declared full-day interval.
- Flight-line KML/KMZ is immutable operational evidence and does not become flight-time authority.
- Material changes require a new Mission/JSA revision before subsequent operations; administrative actuals may be reconciled before final sign-off.
- Historical approvals, signed-off days, FINAL Mission evidence, audit and outbox records are immutable.
- All writes use checked commands, organisation/Base scope, explicit permissions, optimistic concurrency and aggregate locks.
- No generic browser or service-role table-write authority is introduced.
- No Production migration, deployment, alias change or genuine Fly The Farm data mutation is authorised by this plan.

---

### Task 1: Freeze the Existing Authority Inventory and Compatibility Contract

**Files:**
- Create: `docs/operations/multifield-multiday-authority-inventory.md`
- Create: `src/__tests__/multidayMissionAuthorityInventory.test.js`
- Inspect: `supabase/migrations/20260801000000_production_beta_foundation.sql`
- Inspect: `supabase/migrations/20260803010000_authoritative_mission_jsa.sql`
- Inspect: `supabase/migrations/20260803110000_mission_authorisation_and_pack.sql`
- Inspect: `supabase/migrations/20260803130000_authoritative_mission_outcomes.sql`
- Inspect: `supabase/migrations/20260820100000_asset_relationships_meters_and_systems.sql`
- Inspect: `supabase/migrations/20260822120000_financial_actual_operational_prefill.sql`

**Interfaces:**
- Consumes: existing schema/RPC definitions and the approved design specification.
- Produces: an exact adoption matrix recording reused objects, additive objects, legacy compatibility projections and prohibited duplicate authorities.

- [ ] **Step 1: Write the failing authority-inventory test**

```js
const fs = require('fs');
const path = require('path');

test('inventory binds every new capability to existing authority', () => {
  const text = fs.readFileSync(path.join(__dirname, '../../docs/operations/multifield-multiday-authority-inventory.md'), 'utf8');
  for (const token of [
    'public.job_fields',
    'public.mission_jsa_revisions',
    'public.mission_authorisation_revisions',
    'public.mission_operational_revisions',
    'public.asset_meter_readings',
    'public.ftf_read_financial_actual_operational_prefill',
    'No fabricated historical operating days',
  ]) expect(text).toContain(token);
});
```

- [ ] **Step 2: Run the test and verify it fails because the inventory does not exist**

Run: `CI=true npm test -- --watchAll=false src/__tests__/multidayMissionAuthorityInventory.test.js`

Expected: FAIL with `ENOENT` for `multifield-multiday-authority-inventory.md`.

- [ ] **Step 3: Write the exact inventory**

Record each current table, RPC, API handler, decoder and UI owner; classify it as `REUSE`, `EXTEND`, `COMPATIBILITY_PROJECTION` or `DO_NOT_DUPLICATE`. Include record-count and ambiguity SQL for Jobs, `job_fields`, Missions, current JSA/authorisation/closeout revisions and completed evidence. State explicitly that historical single-day records receive no fabricated daily details.

- [ ] **Step 4: Run the inventory test and migration governance baseline**

Run: `CI=true npm test -- --watchAll=false src/__tests__/multidayMissionAuthorityInventory.test.js src/__tests__/authoritativeMissionJsaMigration.test.js src/__tests__/missionAuthorisationOperationalApi.test.js src/__tests__/missionOperationalCloseoutApi.test.js`

Expected: PASS with no repository change outside the inventory and its test.

- [ ] **Step 5: Commit the inventory**

```bash
git add docs/operations/multifield-multiday-authority-inventory.md src/__tests__/multidayMissionAuthorityInventory.test.js
git commit -m "docs: freeze multi-day mission authority inventory"
```

### Task 2: Add Checked Multi-Property Job Scope Authority

**Files:**
- Create: `supabase/migrations/20260905090000_multifield_job_scope.sql`
- Create: `src/__tests__/multifieldJobScopeMigration.test.js`
- Create: `src/__tests__/multifieldJobScopeOperationalApi.test.js`
- Modify: `server/operational-repository.js`
- Modify: `server/operational-api.js`
- Modify: `src/services/operationalApi.ts`

**Interfaces:**
- Consumes: `public.jobs`, `public.job_fields`, Client → Property → Field foreign keys, actor context and `jobs.write` permission.
- Produces: `ftf_write_job_scope(uuid,uuid,uuid,integer,jsonb)`, `OperationalJob.propertyIds: string[]`, and exact checked create/update semantics for `fieldIds`.

- [ ] **Step 1: Write failing database authority tests**

```js
test('checks every Field through Property and one Client under the aggregate lock', () => {
  const sql = migration();
  for (const token of ['ftf_write_job_scope', 'for update', 'job_fields', 'properties', 'client_id']) expect(sql).toContain(token);
  expect(sql).toContain('JOB_SCOPE_CLIENT_MISMATCH');
  expect(sql).toContain('JOB_SCOPE_FIELD_DUPLICATE');
  expect(sql).toContain('JOB_SCOPE_VERSION_CONFLICT');
});

test('grants checked execution without browser table writes', () => {
  const sql = migration();
  expect(sql).toContain('grant execute on function public.ftf_write_job_scope');
  expect(sql).toContain('to service_role');
  expect(sql).not.toMatch(/grant\s+(insert|update|delete).*job_fields.*authenticated/i);
});
```

- [ ] **Step 2: Run the migration tests and verify RED**

Run: `CI=true npm test -- --watchAll=false src/__tests__/multifieldJobScopeMigration.test.js`

Expected: FAIL because `20260905090000_multifield_job_scope.sql` does not exist.

- [ ] **Step 3: Implement the minimal checked Job-scope migration**

Create `ftf_write_job_scope` to lock the Job, validate `p_expected_version`, resolve all unique Field IDs through `fields → properties → clients`, reject empty/mixed/foreign scope atomically, replace active `job_fields`, advance `jobs.row_version`, and emit bounded `job.scope_changed` audit/outbox evidence containing IDs only. Keep `jobs.property_id` and API `propertyId` as the first selected Property compatibility projection until route removal is separately approved.

- [ ] **Step 4: Write failing API mapping and scope tests**

```js
test('updates a Job with Fields from two Properties of one Client', async () => {
  repository.writeJobScope.mockResolvedValue({ record: job, fields: [fieldA, fieldB] });
  await handler(request('PATCH', { expectedVersion: 3, fieldIds: [fieldA, fieldB] }), res);
  expect(repository.writeJobScope).toHaveBeenCalledWith(expect.anything(), jobId, 3, [fieldA, fieldB]);
  expect(res.statusCode).toBe(200);
});

test.each(['JOB_SCOPE_CLIENT_MISMATCH', 'JOB_SCOPE_FIELD_DUPLICATE', 'JOB_SCOPE_VERSION_CONFLICT'])(
  '%s fails closed without partial mutation', async code => {
    repository.writeJobScope.mockResolvedValue({ error: code });
    await handler(request('PATCH', { expectedVersion: 3, fieldIds: [fieldA, fieldB] }), res);
    expect(res.statusCode).toBe(code.endsWith('CONFLICT') ? 409 : 400);
  }
);
```

- [ ] **Step 5: Implement repository, handler and strict decoder support**

Add `OperationalRepository.writeJobScope(context, jobId, expectedVersion, fieldIds)` and map the checked RPC result. Extend `OperationalJob` with `propertyIds` derived from authoritative Field parents; reject duplicate or malformed IDs in the browser decoder.

- [ ] **Step 6: Run focused Job authority tests**

Run: `CI=true npm test -- --watchAll=false src/__tests__/multifieldJobScopeMigration.test.js src/__tests__/multifieldJobScopeOperationalApi.test.js src/services/__tests__/operationalApi.test.ts`

Expected: PASS, including cross-tenant, cross-Client, empty-list and stale-version cases.

- [ ] **Step 7: Commit Slice 1 server authority**

```bash
git add supabase/migrations/20260905090000_multifield_job_scope.sql src/__tests__/multifieldJobScopeMigration.test.js src/__tests__/multifieldJobScopeOperationalApi.test.js server/operational-repository.js server/operational-api.js src/services/operationalApi.ts
git commit -m "feat: add checked multi-field job scope"
```

### Task 3: Build the Progressive Multi-Property Job Selector

**Files:**
- Create: `src/components/jobs/JobFieldScopeSelector.tsx`
- Create: `src/components/jobs/__tests__/JobFieldScopeSelector.test.tsx`
- Modify: `src/pages/JobWorkspace.tsx`
- Modify: `src/pages/JobCreate.tsx`
- Modify: `src/pages/JobDetail.tsx`
- Modify: `src/pages/__tests__/JobWorkspace.test.tsx`
- Modify: `e2e/acceptance/client-to-mission.spec.ts`

**Interfaces:**
- Consumes: `clients`, `properties`, `fields`, `selectedClientId`, `selectedFieldIds` and `onScopeChange({clientId, fieldIds})`.
- Produces: grouped, searchable Field selection with `propertyIds`, hectares summary and deterministic stale-scope clearing.

- [ ] **Step 1: Write failing selector tests**

```tsx
it('selects Fields across two Properties of the same Client', async () => {
  render(<JobFieldScopeSelector {...fixture} />);
  await user.click(screen.getByRole('checkbox', { name: 'North 40' }));
  await user.click(screen.getByRole('button', { name: 'Add fields from another Property' }));
  await user.click(screen.getByRole('checkbox', { name: 'River Block' }));
  expect(onScopeChange).toHaveBeenLastCalledWith({ clientId, fieldIds: [north40Id, riverBlockId] });
  expect(screen.getByText('2 Properties · 2 Fields · 52.7000 ha')).toBeVisible();
});

it('clears all selected Fields when Client changes', async () => {
  render(<JobFieldScopeSelector {...fixture} selectedFieldIds={[north40Id]} />);
  await user.selectOptions(screen.getByRole('combobox', { name: 'Client' }), secondClientId);
  expect(onScopeChange).toHaveBeenLastCalledWith({ clientId: secondClientId, fieldIds: [] });
});
```

- [ ] **Step 2: Run the component tests and verify RED**

Run: `CI=true npm test -- --watchAll=false src/components/jobs/__tests__/JobFieldScopeSelector.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the selector and route compatibility**

Use Material UI semantic controls, group selected Fields by Property, show per-Property and total hectares, hide additional Properties until requested, and preserve old deep links by treating route `propertyId/fieldId` as an initial selection only. Submission must call the checked Job API and await its authoritative response.

- [ ] **Step 4: Add Chromium/WebKit workflow coverage**

```ts
for (const field of ['North 40', 'River Block']) {
  await page.getByRole('checkbox', { name: field }).check();
}
await page.getByRole('button', { name: 'Create Job' }).click();
const response = await page.waitForResponse(r => r.url().includes('/api/v1/jobs') && r.request().method() === 'POST');
expect(response.status()).toBe(201);
expect((await response.json()).data.fieldIds).toEqual([north40Id, riverBlockId]);
```

- [ ] **Step 5: Run component and browser tests**

Run: `CI=true npm test -- --watchAll=false src/components/jobs/__tests__/JobFieldScopeSelector.test.tsx src/pages/__tests__/JobWorkspace.test.tsx`

Run: `npx playwright test e2e/acceptance/client-to-mission.spec.ts --project=chromium --project=webkit`

Expected: PASS on phone, tablet and desktop viewports without a giant ungrouped list.

- [ ] **Step 6: Commit Slice 1 UI**

```bash
git add src/components/jobs src/pages/JobWorkspace.tsx src/pages/JobCreate.tsx src/pages/JobDetail.tsx src/pages/__tests__/JobWorkspace.test.tsx e2e/acceptance/client-to-mission.spec.ts
git commit -m "feat: select job fields across client properties"
```

### Task 4: Add Immutable Mission Scope Revisions and the CRP Gate

**Files:**
- Create: `supabase/migrations/20260905100000_mission_scope_revision_and_crp_gate.sql`
- Create: `src/__tests__/missionScopeRevisionMigration.test.js`
- Create: `server/mission-operations-repository.js`
- Create: `server/mission-operations-api.js`
- Create: `src/__tests__/missionOperationsApi.test.js`
- Create: `src/types/missionOperations.ts`
- Create: `src/services/missionOperationsApi.ts`
- Create: `src/services/__tests__/missionOperationsApi.test.ts`
- Modify: `server/operational-dispatcher.js`

**Interfaces:**
- Consumes: Job scope, existing Mission assignments/maps/weather/chemicals/JSA/readiness and actor permissions.
- Produces: `MissionPackageRevision`, `CrpDecision`, `saveScope`, `submitForApproval`, `authorise`, `reject`, and `readPackageHistory` through `/api/v1/mission-operations`.

- [ ] **Step 1: Define strict client contracts and failing decoder tests**

```ts
export type MissionPackageState = 'PREPARING' | 'AWAITING_CRP_APPROVAL' | 'AUTHORISED' | 'REJECTED';
export interface MissionPackageRevision {
  id: string;
  missionId: string;
  revisionNumber: number;
  fieldIds: string[];
  jsaRevisionId: string;
  evidenceDigest: string;
  state: MissionPackageState;
  createdAt: string;
}
export interface CrpDecision {
  id: string;
  packageRevisionId: string;
  decision: 'AUTHORISED' | 'REJECTED';
  decidedByInternalUserId: string;
  decidedAt: string;
  declaration: string;
}
```

Test exact-key decoding, UUIDs, positive revisions, unique/non-empty Field IDs, SHA-256 digest shape and rejection of unknown states.

- [ ] **Step 2: Run decoder tests and verify RED**

Run: `CI=true npm test -- --watchAll=false src/services/__tests__/missionOperationsApi.test.ts`

Expected: FAIL because the service and types do not exist.

- [ ] **Step 3: Write failing migration tests for immutable revisions and CRP eligibility**

Assert tables `mission_package_revisions`, `mission_package_fields`, `mission_crp_decisions`; append-only triggers; exact Job subset validation; immutable evidence digest; CRP personnel/internal-user linkage; `mission.authorisation.authorise` permission; organisation/Base checks; aggregate lock; audit/outbox; and service-role EXECUTE without generic table mutation grants.

- [ ] **Step 4: Implement the checked migration**

Create `ftf_save_mission_package_scope`, `ftf_submit_mission_package`, `ftf_decide_mission_package` and `ftf_read_mission_package_history`. Build the digest from canonical server-owned Field scope plus current assignment, chemical, map, weather, JSA and readiness revision identities. A stale digest/version returns an explicit conflict; a browser-supplied CRP identity is never accepted.

- [ ] **Step 5: Implement the focused repository, API and dispatcher registration**

Use actions `scope`, `submit`, `authorise`, `reject`, `history`; apply same-origin checks to writes; map database codes to stable `400/403/404/409` responses with correlation IDs. Register only `mission-operations` in `server/operational-dispatcher.js`.

- [ ] **Step 6: Run Slice 2 authority tests**

Run: `CI=true npm test -- --watchAll=false src/__tests__/missionScopeRevisionMigration.test.js src/__tests__/missionOperationsApi.test.js src/services/__tests__/missionOperationsApi.test.ts src/__tests__/missionAuthorisationOperationalApi.test.js`

Expected: PASS for non-subset Fields, stale revisions, ineligible CRP, duplicate decisions, cross-tenant IDs and immutable history.

- [ ] **Step 7: Commit Slice 2 authority**

```bash
git add supabase/migrations/20260905100000_mission_scope_revision_and_crp_gate.sql src/__tests__/missionScopeRevisionMigration.test.js server/mission-operations-repository.js server/mission-operations-api.js src/__tests__/missionOperationsApi.test.js src/types/missionOperations.ts src/services/missionOperationsApi.ts src/services/__tests__/missionOperationsApi.test.ts server/operational-dispatcher.js
git commit -m "feat: bind CRP approval to mission package revisions"
```

### Task 5: Build Mission Scope and CRP Review UX

**Files:**
- Create: `src/components/mission/MissionFieldScope.tsx`
- Create: `src/components/mission/MissionCrpReview.tsx`
- Create: `src/components/mission/__tests__/MissionFieldScope.test.tsx`
- Create: `src/components/mission/__tests__/MissionCrpReview.test.tsx`
- Modify: `src/components/mission/GuidedMissionCreation.tsx`
- Modify: `src/components/mission/MissionAuthorisation.tsx`
- Modify: `src/pages/JobDetail.tsx`
- Modify: `src/utils/missionWorkspace.ts`
- Modify: `src/types/missionWorkspace.ts`

**Interfaces:**
- Consumes: `MissionPackageRevision`, Job Field groups and `missionOperationsApi` commands.
- Produces: a non-empty Job-Field subset editor, exact revision review screen and CRP decision UI.

- [ ] **Step 1: Write failing scope and review tests**

```tsx
it('only offers Fields already authorised on the Job', () => {
  render(<MissionFieldScope jobFieldIds={[fieldA, fieldB]} selectedFieldIds={[fieldA]} {...props} />);
  expect(screen.getByRole('checkbox', { name: 'Field A' })).toBeChecked();
  expect(screen.queryByText('Foreign Field')).not.toBeInTheDocument();
});

it('shows the exact revision and blocks stale CRP approval', async () => {
  render(<MissionCrpReview packageRevision={revision4} {...props} />);
  expect(screen.getByText('Revision 4')).toBeVisible();
  api.authorise.mockRejectedValue(Object.assign(new Error('Package changed.'), { code: 'VERSION_CONFLICT' }));
  await user.click(screen.getByRole('button', { name: 'Authorise Mission' }));
  expect(await screen.findByText('Package changed. Reload before deciding.')).toBeVisible();
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `CI=true npm test -- --watchAll=false src/components/mission/__tests__/MissionFieldScope.test.tsx src/components/mission/__tests__/MissionCrpReview.test.tsx`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement progressive Mission scope and CRP review**

Group Fields by Property, default to the Job's current selected Fields only as editable proposals, require at least one, show exact package/JSA revisions and digest summary, and make authorisation an explicit CRP-only action. Surface review from Job Detail without attaching authority to the Job.

- [ ] **Step 4: Run focused UI tests**

Run: `CI=true npm test -- --watchAll=false src/components/mission/__tests__/MissionFieldScope.test.tsx src/components/mission/__tests__/MissionCrpReview.test.tsx src/components/mission/__tests__/MissionAuthorisation.test.tsx src/utils/__tests__/missionWorkspace.test.ts`

Expected: PASS with semantic controls and no approval possible for stale or incomplete revisions.

- [ ] **Step 5: Commit Slice 2 UI**

```bash
git add src/components/mission/MissionFieldScope.tsx src/components/mission/MissionCrpReview.tsx src/components/mission/__tests__ src/components/mission/GuidedMissionCreation.tsx src/components/mission/MissionAuthorisation.tsx src/pages/JobDetail.tsx src/utils/missionWorkspace.ts src/types/missionWorkspace.ts
git commit -m "feat: add mission scope and CRP review workspace"
```

### Task 6: Add Operating Days, Daily Field Activity and JSA Continuity

**Files:**
- Create: `supabase/migrations/20260905110000_mission_operating_days_and_jsa_reviews.sql`
- Create: `src/__tests__/missionOperatingDaysMigration.test.js`
- Modify: `server/mission-operations-repository.js`
- Modify: `server/mission-operations-api.js`
- Modify: `src/types/missionOperations.ts`
- Modify: `src/services/missionOperationsApi.ts`
- Modify: `src/__tests__/missionOperationsApi.test.js`

**Interfaces:**
- Consumes: effective authorised Mission package/JSA revision and Base timezone.
- Produces: `MissionOperatingDay`, `MissionFieldActivity`, `MissionJsaDayReview`, `createDay`, `reviewJsa`, `startDay`, `saveFieldActivity`, `completeDay`.

- [ ] **Step 1: Add failing lifecycle and timezone tests**

```js
test('one local operating date is unique in the Base timezone', () => {
  const sql = migration();
  expect(sql).toContain('mission_operating_days');
  expect(sql).toContain('unique (organisation_id, mission_id, work_date)');
  expect(sql).toContain('operating_locations');
});

test('day start requires current CRP authority and JSA review', () => {
  const sql = migration();
  for (const code of ['MISSION_NOT_AUTHORISED', 'JSA_DAY_REVIEW_REQUIRED', 'MISSION_PACKAGE_STALE']) expect(sql).toContain(code);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `CI=true npm test -- --watchAll=false src/__tests__/missionOperatingDaysMigration.test.js`

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Implement the operating-day authority**

Add `mission_operating_days`, `mission_day_field_activity` and `mission_day_jsa_reviews`. Use `date` for `work_date`, exact `timestamptz` for optional starts/finishes, `numeric(18,6)` for hectares, row versions and immutable signed-off states. Checked RPCs must lock the Mission/day, enforce the current authorised package, require the daily JSA confirmation, and reject Fields outside the package.

- [ ] **Step 4: Implement server/client commands and strict decoders**

Add API actions `day-create`, `day-jsa-review`, `day-start`, `field-activity-save`, `day-complete`, and `days`. Decode canonical dates without browser timezone conversion and decimal hectares as canonical strings.

- [ ] **Step 5: Run lifecycle, concurrency and tenancy tests**

Run: `TZ=Australia/Brisbane CI=true npm test -- --watchAll=false src/__tests__/missionOperatingDaysMigration.test.js src/__tests__/missionOperationsApi.test.js src/services/__tests__/missionOperationsApi.test.ts`

Expected: PASS for multi-day, overnight timestamp, duplicate date, missing review, stale package, cross-Field and concurrent day-start cases.

- [ ] **Step 6: Commit Slice 3 authority**

```bash
git add supabase/migrations/20260905110000_mission_operating_days_and_jsa_reviews.sql src/__tests__/missionOperatingDaysMigration.test.js server/mission-operations-repository.js server/mission-operations-api.js src/types/missionOperations.ts src/services/missionOperationsApi.ts src/__tests__/missionOperationsApi.test.js src/services/__tests__/missionOperationsApi.test.ts
git commit -m "feat: add multi-day mission and JSA review authority"
```

### Task 7: Build the Operating Days Workspace

**Files:**
- Create: `src/components/mission/MissionOperatingDays.tsx`
- Create: `src/components/mission/MissionOperatingDayDetail.tsx`
- Create: `src/components/mission/__tests__/MissionOperatingDays.test.tsx`
- Create: `src/components/mission/__tests__/MissionOperatingDayDetail.test.tsx`
- Modify: `src/components/mission/MissionWorkspaceNavigation.tsx`
- Modify: `src/types/missionWorkspace.ts`
- Modify: `src/utils/missionWorkspace.ts`
- Modify: `src/pages/MissionPlanning.tsx`

**Interfaces:**
- Consumes: day commands and package/JSA authority from Tasks 4 and 6.
- Produces: compact day cards and a focused day detail workspace with Field activity and JSA confirmation.

- [ ] **Step 1: Write failing progressive-disclosure tests**

```tsx
it('shows compact day summaries and opens one day workspace', async () => {
  render(<MissionOperatingDays days={[day1, day2]} {...props} />);
  expect(screen.getAllByRole('button', { name: /Open operating day/ })).toHaveLength(2);
  expect(screen.queryByLabelText('Aircraft flight hours')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /Open operating day 5 September/ }));
  expect(screen.getByRole('heading', { name: '5 September 2026' })).toBeVisible();
});

it('does not start until the effective JSA is reviewed', () => {
  render(<MissionOperatingDayDetail day={unreviewedDay} {...props} />);
  expect(screen.getByRole('button', { name: 'Start operating day' })).toBeDisabled();
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `CI=true npm test -- --watchAll=false src/components/mission/__tests__/MissionOperatingDays.test.tsx src/components/mission/__tests__/MissionOperatingDayDetail.test.tsx`

Expected: FAIL because the workspace components do not exist.

- [ ] **Step 3: Implement compact day and Field activity UX**

Use one card per date, progressive sections inside day detail, explicit JSA review, selected authorised Fields only, hectares attempted/completed and clear lifecycle labels. Copying plan data must label it `Proposed` until submitted.

- [ ] **Step 4: Run responsive component coverage**

Run: `CI=true npm test -- --watchAll=false src/components/mission/__tests__/MissionOperatingDays.test.tsx src/components/mission/__tests__/MissionOperatingDayDetail.test.tsx src/utils/__tests__/missionWorkspace.test.ts`

Expected: PASS for phone, tablet and desktop layout assertions.

- [ ] **Step 5: Commit Slice 3 UI**

```bash
git add src/components/mission/MissionOperatingDays.tsx src/components/mission/MissionOperatingDayDetail.tsx src/components/mission/__tests__ src/components/mission/MissionWorkspaceNavigation.tsx src/types/missionWorkspace.ts src/utils/missionWorkspace.ts src/pages/MissionPlanning.tsx
git commit -m "feat: add mission operating day workspace"
```

### Task 8: Add Aircraft-Day Totals, Optional Flights and Flight-Line Evidence

**Files:**
- Create: `supabase/migrations/20260905120000_mission_aircraft_day_actuals.sql`
- Create: `src/__tests__/missionAircraftDayActualsMigration.test.js`
- Create: `src/components/mission/MissionAircraftDayActuals.tsx`
- Create: `src/components/mission/__tests__/MissionAircraftDayActuals.test.tsx`
- Modify: `server/mission-operations-repository.js`
- Modify: `server/mission-operations-api.js`
- Modify: `src/types/missionOperations.ts`
- Modify: `src/services/missionOperationsApi.ts`
- Modify: `server/operational-api.js`
- Modify: `src/components/mission/MissionOperationalCloseout.tsx`

**Interfaces:**
- Consumes: operating-day identity, authorised/actual aircraft scope, operational-file parser, `ftf_execute_asset_relationship_command` meter authority.
- Produces: `MissionAircraftDayActual`, optional `MissionFlightActual`, day/file attribution and idempotent signed-off Fleet projection.

- [ ] **Step 1: Write failing numeric and reconciliation tests**

```js
test('daily totals remain authoritative while flights are optional', () => {
  const sql = migration();
  expect(sql).toContain('numeric(10,4)');
  expect(sql).toContain('mission_aircraft_day_actuals');
  expect(sql).toContain('mission_flight_actuals');
  expect(sql).toContain('AIRCRAFT_FLIGHT_TOTAL_MISMATCH');
});

test('signed-off projection is idempotent by source identity', () => {
  const sql = migration();
  expect(sql).toContain("'mission_aircraft_day_actual'");
  expect(sql).toContain('source_record_id');
  expect(sql).toContain('flight_hours');
});
```

- [ ] **Step 2: Run migration tests and verify RED**

Run: `CI=true npm test -- --watchAll=false src/__tests__/missionAircraftDayActualsMigration.test.js`

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Implement aircraft-day and optional-flight authority**

Add checked save/read/reconcile functions. Accept canonical decimal strings to four hour decimals; reject excess precision rather than truncating. Permit totals without flights and flights without a manually typed total only when the server can sum authoritative durations. Require equality before day/final sign-off. Project one cumulative Fleet meter reading per signed-off aircraft-day with stable source identity.

- [ ] **Step 4: Extend flight-line evidence attribution**

Retain the original KML/KMZ through the existing closeout import authority; add optional operating-day and aircraft links plus explicit confidence. Do not infer flight hours from geometry. Ensure multi-flight and multi-aircraft files remain one artefact with separate bounded links.

- [ ] **Step 5: Write failing UI tests**

```tsx
it('records two aircraft totals without requiring individual flights', async () => {
  render(<MissionAircraftDayActuals aircraft={[aircraftA, aircraftB]} {...props} />);
  await user.type(screen.getByLabelText('FTF-T100-001 flight hours'), '10.0000');
  await user.type(screen.getByLabelText('FTF-T100-002 flight hours'), '10.0000');
  await user.click(screen.getByRole('button', { name: 'Save aircraft totals' }));
  expect(api.saveAircraftActuals).toHaveBeenCalledWith(dayId, expect.objectContaining({ totalAircraftHours: '20.0000', flights: [] }));
});

it('shows a mismatch and blocks sign-off when optional flights disagree', async () => {
  render(<MissionAircraftDayActuals actual={mismatchedActual} {...props} />);
  expect(screen.getByText('Flight details total 9.5000 h; declared total is 10.0000 h.')).toBeVisible();
});
```

- [ ] **Step 6: Run focused authority/UI tests**

Run: `CI=true npm test -- --watchAll=false src/__tests__/missionAircraftDayActualsMigration.test.js src/components/mission/__tests__/MissionAircraftDayActuals.test.tsx src/__tests__/assetRelationshipsMetersApi.test.js src/__tests__/missionOperationalCloseoutApi.test.js`

Expected: PASS for total-only, flights-only, reconciled-both, mismatch, two-aircraft, idempotent retry and cross-tenant cases.

- [ ] **Step 7: Commit Slice 4**

```bash
git add supabase/migrations/20260905120000_mission_aircraft_day_actuals.sql src/__tests__/missionAircraftDayActualsMigration.test.js src/components/mission/MissionAircraftDayActuals.tsx src/components/mission/__tests__/MissionAircraftDayActuals.test.tsx server/mission-operations-repository.js server/mission-operations-api.js src/types/missionOperations.ts src/services/missionOperationsApi.ts server/operational-api.js src/components/mission/MissionOperationalCloseout.tsx
git commit -m "feat: record authoritative aircraft-day actuals"
```

### Task 9: Add Daily Chemical Actuals and Frozen Weather Reports

**Files:**
- Create: `supabase/migrations/20260905130000_mission_day_chemical_and_weather_actuals.sql`
- Create: `src/__tests__/missionDayChemicalWeatherMigration.test.js`
- Create: `src/components/mission/MissionDayChemicalActuals.tsx`
- Create: `src/components/mission/MissionDayWeatherReport.tsx`
- Create: `src/components/mission/__tests__/MissionDayChemicalActuals.test.tsx`
- Create: `src/components/mission/__tests__/MissionDayWeatherReport.test.tsx`
- Modify: `server/mission-operations-repository.js`
- Modify: `server/mission-operations-api.js`
- Modify: `server/weather-provider.js`
- Modify: `src/types/missionOperations.ts`
- Modify: `src/services/missionOperationsApi.ts`

**Interfaces:**
- Consumes: day/Field scope, Mission chemical plan revision, actual operating timestamps, Base timezone and existing Open-Meteo provider adapter.
- Produces: immutable daily chemical-application revisions and frozen weather evidence with interval/source/digest.

- [ ] **Step 1: Write failing planning-versus-actual and weather-freeze tests**

```js
test('chemical actuals require operating day and authorised Field scope', () => {
  const sql = migration();
  for (const token of ['mission_day_chemical_revisions', 'mission_day_chemical_lines', 'MISSION_DAY_FIELD_INVALID']) expect(sql).toContain(token);
  expect(sql).toContain('planned_chemical_revision_id');
});

test('weather stores one immutable UTC interval with Base timezone provenance', () => {
  const sql = migration();
  for (const token of ['mission_day_weather_reports', 'interval_start_at', 'interval_end_at', 'timezone', 'source_digest']) expect(sql).toContain(token);
  expect(sql).toContain('FULL_DAY');
  expect(sql).toContain('ACTUAL_INTERVAL');
});
```

- [ ] **Step 2: Run migration tests and verify RED**

Run: `CI=true npm test -- --watchAll=false src/__tests__/missionDayChemicalWeatherMigration.test.js`

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Implement checked chemical actual revisions**

Store actual product, rate, quantity, batch/lot and applying aircraft attribution per day and Field. Prefill from the plan as proposals; require an explicit confirmation command. A material pre-operation change returns `MISSION_REAUTHORISATION_REQUIRED`; post-operation actual variance is retained without rewriting the approved plan.

- [ ] **Step 4: Implement frozen weather retrieval and manual-evidence fallback**

Resolve `ACTUAL_INTERVAL` from authoritative day timestamps or require explicit `FULL_DAY`. Store UTC interval, Base timezone, coordinates/source, provider retrieval time, hourly observations, inversion inputs/results, coverage gaps and canonical digest. Historical reads return stored evidence only.

- [ ] **Step 5: Write failing UI tests**

```tsx
it('labels planned chemicals as proposals until confirmed', () => {
  render(<MissionDayChemicalActuals plan={plan} actual={null} {...props} />);
  expect(screen.getByText('Proposed from Mission plan')).toBeVisible();
  expect(screen.queryByText('Actual application recorded')).not.toBeInTheDocument();
});

it('freezes weather for the exact work interval', async () => {
  render(<MissionDayWeatherReport day={completedDay} {...props} />);
  await user.click(screen.getByRole('button', { name: 'Capture weather for operating hours' }));
  expect(api.captureWeather).toHaveBeenCalledWith(dayId, { coverage: 'ACTUAL_INTERVAL' });
});
```

- [ ] **Step 6: Run Slice 5 tests**

Run: `TZ=Australia/Brisbane CI=true npm test -- --watchAll=false src/__tests__/missionDayChemicalWeatherMigration.test.js src/components/mission/__tests__/MissionDayChemicalActuals.test.tsx src/components/mission/__tests__/MissionDayWeatherReport.test.tsx src/__tests__/weatherProvider.test.js src/__tests__/missionChemicalsOperationalApi.test.js`

Expected: PASS for exact interval, full day, DST-independent Brisbane dates, provider failure, manual evidence, source immutability, material variance and cross-Field rejection.

- [ ] **Step 7: Commit Slice 5**

```bash
git add supabase/migrations/20260905130000_mission_day_chemical_and_weather_actuals.sql src/__tests__/missionDayChemicalWeatherMigration.test.js src/components/mission/MissionDayChemicalActuals.tsx src/components/mission/MissionDayWeatherReport.tsx src/components/mission/__tests__ server/mission-operations-repository.js server/mission-operations-api.js server/weather-provider.js src/types/missionOperations.ts src/services/missionOperationsApi.ts
git commit -m "feat: preserve daily chemical and weather evidence"
```

### Task 10: Add Material-Amendment Classification and Prospective Holds

**Files:**
- Create: `src/domain/missionOperations/amendmentPolicy.ts`
- Create: `src/domain/missionOperations/__tests__/amendmentPolicy.test.ts`
- Create: `supabase/migrations/20260905135000_mission_material_amendment_policy.sql`
- Create: `src/__tests__/missionMaterialAmendmentPolicyMigration.test.js`
- Modify: `server/mission-operations-api.js`
- Modify: `src/components/mission/MissionCrpReview.tsx`

**Interfaces:**
- Consumes: typed before/after Mission package values.
- Produces: `classifyMissionAmendment(input): { classification: 'ADMINISTRATIVE' | 'MATERIAL'; reasons: MissionAmendmentReason[] }` mirrored by checked PostgreSQL policy.

- [ ] **Step 1: Write failing policy parity tests**

```ts
it.each([
  ['fieldIds', ['field-a'], ['field-a', 'field-b'], 'MATERIAL'],
  ['aircraftIds', ['aircraft-a'], ['aircraft-b'], 'MATERIAL'],
  ['actualFlightHours', undefined, '2.5000', 'ADMINISTRATIVE'],
  ['flightLineEvidenceId', undefined, 'file-a', 'ADMINISTRATIVE'],
])('%s change is %s', (field, before, after, expected) => {
  expect(classifyMissionAmendment({ before: { [field]: before }, after: { [field]: after } }).classification).toBe(expected);
});

it('fails unknown changes closed as material', () => {
  expect(classifyMissionAmendment({ before: {}, after: { futureSafetySetting: true } }).classification).toBe('MATERIAL');
});
```

- [ ] **Step 2: Run policy tests and verify RED**

Run: `CI=true npm test -- --watchAll=false src/domain/missionOperations/__tests__/amendmentPolicy.test.ts`

Expected: FAIL because the policy module does not exist.

- [ ] **Step 3: Implement TypeScript and PostgreSQL policy parity**

Define the closed list of administrative evidence keys and explicit material reason codes for Field, area, aircraft, regulated crew, chemical/method/rate, JSA hazard/control, safety map and permission changes. Mirror it in the additive `20260905135000_mission_material_amendment_policy.sql` checked function; do not edit the earlier migration. Any unknown changed key is material. A material change creates a preparing package revision and prospectively blocks new day starts; completed days retain their governing revision.

- [ ] **Step 4: Run parity and concurrency tests**

Run: `CI=true npm test -- --watchAll=false src/domain/missionOperations/__tests__/amendmentPolicy.test.ts src/__tests__/missionMaterialAmendmentPolicyMigration.test.js src/__tests__/missionScopeRevisionMigration.test.js src/__tests__/missionOperationsApi.test.js`

Expected: PASS for amendment-versus-day-start serialization and immutable completed-day linkage.

- [ ] **Step 5: Commit the material-change policy**

```bash
git add src/domain/missionOperations supabase/migrations/20260905135000_mission_material_amendment_policy.sql src/__tests__/missionMaterialAmendmentPolicyMigration.test.js server/mission-operations-api.js src/components/mission/MissionCrpReview.tsx
git commit -m "feat: classify mission amendments and hold future work"
```

### Task 11: Add Final Sign-Off, Job Closure and Idempotent Downstream Projections

**Files:**
- Create: `supabase/migrations/20260905140000_mission_final_signoff_and_job_close.sql`
- Create: `src/__tests__/missionFinalSignoffMigration.test.js`
- Create: `src/components/mission/MissionFinalSignoff.tsx`
- Create: `src/components/mission/__tests__/MissionFinalSignoff.test.tsx`
- Modify: `server/mission-operations-repository.js`
- Modify: `server/mission-operations-api.js`
- Modify: `src/types/missionOperations.ts`
- Modify: `src/services/missionOperationsApi.ts`
- Modify: `src/pages/JobDetail.tsx`

**Interfaces:**
- Consumes: completed days and reconciled daily evidence.
- Produces: immutable `mission_final_signoffs`, checked `final-signoff` and `job-close` commands, signed-off daily Fleet sources and Financial prefill projections.

- [ ] **Step 1: Write failing finalisation and race tests**

```js
test('final sign-off freezes exact daily evidence and advances projections once', () => {
  const sql = migration();
  for (const token of ['mission_final_signoffs', 'for update', 'MISSION_DAY_INCOMPLETE', 'MISSION_EVIDENCE_UNRECONCILED']) expect(sql).toContain(token);
  expect(sql).toContain('transactional_outbox');
  expect(sql).toContain('audit_events');
});

test('Job close requires every non-cancelled Mission final sign-off', () => {
  const sql = migration();
  expect(sql).toContain('JOB_MISSIONS_NOT_SIGNED_OFF');
  expect(sql).toContain('JOB_CLOSED');
});
```

- [ ] **Step 2: Run migration tests and verify RED**

Run: `CI=true npm test -- --watchAll=false src/__tests__/missionFinalSignoffMigration.test.js`

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Implement atomic final sign-off and Job close**

Lock Mission, effective package, days and Job in deterministic order. Reject active/incomplete days, missing JSA reviews, aircraft reconciliation errors, missing required chemical/weather evidence and prospective holds. Freeze the evidence manifest/digest, insert one immutable sign-off, enqueue idempotent Fleet/Financial projection sources and update lifecycle atomically. Job close locks the Job and rejects every unsigned non-cancelled Mission.

- [ ] **Step 4: Update Financial prefill to consume daily signed-off sources**

Within the additive `20260905140000_mission_final_signoff_and_job_close.sql` migration, use `create or replace function` for the existing checked Financial prefill RPC rather than editing `20260822120000_financial_actual_operational_prefill.sql`. Preserve existing single-closeout compatibility. New records derive `operationalDays` as distinct `work_date` values with actual work hours greater than zero, preserve per-aircraft hours separately, and never infer work days from the selected date range.

- [ ] **Step 5: Write failing final-signoff UI tests**

```tsx
it('lists each unresolved evidence item and does not offer final sign-off early', () => {
  render(<MissionFinalSignoff readiness={blockedReadiness} {...props} />);
  expect(screen.getByText('6 September: aircraft totals do not reconcile')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Final sign-off Mission' })).not.toBeInTheDocument();
});

it('labels final sign-off separately from operational completion', () => {
  render(<MissionFinalSignoff readiness={ready} {...props} />);
  expect(screen.getByText('Operational work completed')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Final sign-off Mission' })).toBeEnabled();
});
```

- [ ] **Step 6: Run lifecycle, projection and UI tests**

Run: `TZ=Australia/Brisbane CI=true npm test -- --watchAll=false src/__tests__/missionFinalSignoffMigration.test.js src/__tests__/financialActualOperationalPrefill.test.js src/__tests__/assetRelationshipsMetersApi.test.js src/components/mission/__tests__/MissionFinalSignoff.test.tsx`

Expected: PASS for finalisation-versus-amendment, finalisation-versus-Job-close, failed projection rollback, idempotent retry and zero-hour-day exclusion.

- [ ] **Step 7: Commit Slice 6 authority and UI**

```bash
git add supabase/migrations/20260905140000_mission_final_signoff_and_job_close.sql src/__tests__/missionFinalSignoffMigration.test.js src/components/mission/MissionFinalSignoff.tsx src/components/mission/__tests__/MissionFinalSignoff.test.tsx server/mission-operations-repository.js server/mission-operations-api.js src/types/missionOperations.ts src/services/missionOperationsApi.ts src/pages/JobDetail.tsx
git commit -m "feat: finalise multi-day missions and close jobs"
```

### Task 12: Extend Deterministic Mission Reports

**Files:**
- Modify: `server/mission-summary-renderer.js`
- Modify: `server/mission-pack-renderer.js`
- Modify: `server/report-view-models.js`
- Create: `server/__tests__/multiday-mission-report.test.js`
- Modify: `src/components/mission/MissionSummary.tsx`
- Modify: `src/components/mission/MissionRecord.tsx`
- Modify: `src/components/mission/__tests__/MissionSummary.test.tsx`
- Modify: `src/components/mission/__tests__/MissionRecord.test.tsx`

**Interfaces:**
- Consumes: frozen final sign-off manifest only.
- Produces: deterministic daily sections and immutable approval/evidence history in Mission Summary/Record outputs.

- [ ] **Step 1: Write failing report view-model tests**

```js
test('renders signed-off daily evidence without reading mutable current data', () => {
  const model = buildMissionSummaryViewModel({ finalSignoff: frozenFixture, currentMission: changedCurrentFixture });
  expect(model.operatingDays).toHaveLength(2);
  expect(model.operatingDays[0].aircraft[0].flightHours).toBe('10.0000');
  expect(model.approval.packageRevisionNumber).toBe(4);
  expect(model.source).toBe('FROZEN_FINAL_SIGNOFF');
});
```

- [ ] **Step 2: Run report tests and verify RED**

Run: `CI=true npm test -- --watchAll=false server/__tests__/multiday-mission-report.test.js`

Expected: FAIL because daily final-signoff rendering is absent.

- [ ] **Step 3: Implement the frozen report view model and renderers**

Render Job/Property/Field grouping, CRP/JSA revision history, day review, Field hectares, aircraft totals/flights, planned-versus-actual chemicals, weather coverage, flight-line references, gaps/exceptions and final sign-off. Never query live mutable children while rendering a signed-off historical report.

- [ ] **Step 4: Run server and component report tests**

Run: `CI=true npm test -- --watchAll=false server/__tests__/multiday-mission-report.test.js src/components/mission/__tests__/MissionSummary.test.tsx src/components/mission/__tests__/MissionRecord.test.tsx src/__tests__/missionSummaryReportMigration.test.js`

Expected: PASS with deterministic ordering and explicit missing-evidence labels.

- [ ] **Step 5: Commit reporting support**

```bash
git add server/mission-summary-renderer.js server/mission-pack-renderer.js server/report-view-models.js server/__tests__/multiday-mission-report.test.js src/components/mission/MissionSummary.tsx src/components/mission/MissionRecord.tsx src/components/mission/__tests__/MissionSummary.test.tsx src/components/mission/__tests__/MissionRecord.test.tsx
git commit -m "feat: render signed-off multi-day mission evidence"
```

### Task 13: Prove Cross-Browser End-to-End Lifecycle and Failure Boundaries

**Files:**
- Create: `e2e/mission/multifield-multiday-mission.spec.ts`
- Create: `e2e/mission/fixtures/multidayMission.ts`
- Modify: `e2e/acceptance/fixtures/missionCreationWorkspace.ts`
- Modify: `e2e/acceptance/client-to-mission.spec.ts`

**Interfaces:**
- Consumes: all prior task interfaces.
- Produces: one deterministic cross-browser acceptance path and independent failure-boundary cases.

- [ ] **Step 1: Write the failing happy-path acceptance**

```ts
test('one Job spans Properties and one authorised Mission spans days', async ({ page }) => {
  await createJobWithFields(page, [fieldA, fieldB, fieldC]);
  await createMissionForFields(page, [fieldA, fieldC]);
  await authoriseAsCrp(page);
  await recordOperatingDay(page, dayOneWithTwoAircraft);
  await recordOperatingDay(page, dayTwoWithOptionalFlights);
  await finalSignoff(page);
  await expect(page.getByText('Mission finally signed off')).toBeVisible();
  await expect(page.getByText('2 operating days · 3 Fields · 30.0000 aircraft hours')).toBeVisible();
});
```

- [ ] **Step 2: Run Chromium/WebKit and verify RED at the first unavailable capability**

Run: `npx playwright test e2e/mission/multifield-multiday-mission.spec.ts --project=chromium --project=webkit`

Expected: FAIL at the first missing UI/API boundary before all slices are integrated.

- [ ] **Step 3: Add bounded negative acceptance cases**

Cover cross-Client Job Fields, Mission Field outside Job scope, stale CRP revision, day start without JSA review, material amendment hold, aircraft mismatch, weather provider failure/manual evidence, invalid KML, incomplete final sign-off, Job close with unsigned Mission, cached-page stale scope and session/organisation change.

- [ ] **Step 4: Run cross-browser and responsive acceptance**

Run: `TZ=Australia/Brisbane npx playwright test e2e/mission/multifield-multiday-mission.spec.ts e2e/acceptance/client-to-mission.spec.ts --project=chromium --project=webkit`

Expected: PASS on configured phone, tablet and desktop projects; each Save produces one request and every conflict remains visible.

- [ ] **Step 5: Commit end-to-end coverage**

```bash
git add e2e/mission e2e/acceptance/fixtures/missionCreationWorkspace.ts e2e/acceptance/client-to-mission.spec.ts
git commit -m "test: cover multi-field multi-day mission lifecycle"
```

### Task 14: Run Whole-Slice Governance, Security and Release Preparation

**Files:**
- Modify: `src/productMaturity/registry.ts`
- Modify: `src/productMaturity/__tests__/productMaturityBoundary.test.tsx`
- Create: `docs/operations/multifield-multiday-release-assessment.md`

**Interfaces:**
- Consumes: completed Tasks 1–13 and migration inventory.
- Produces: a reviewable release assessment; no Production execution.

- [ ] **Step 1: Add failing Product Maturity boundary coverage**

```tsx
it('keeps multi-day Mission operations unavailable until every authority slice is verified', () => {
  const entry = getWorkflowMaturity('mission-multiday-operations');
  expect(entry.status).toBe('COMING_SOON');
  expect(entry.requiredEvidence).toEqual(expect.arrayContaining([
    'checked-job-scope', 'crp-package-authority', 'daily-evidence', 'final-signoff', 'cross-browser-acceptance'
  ]));
});
```

- [ ] **Step 2: Run the maturity test and verify RED**

Run: `CI=true npm test -- --watchAll=false src/productMaturity/__tests__/productMaturityBoundary.test.tsx`

Expected: FAIL until the workflow is registered with all required evidence and remains `COMING_SOON`.

- [ ] **Step 3: Register the workflow without promoting it**

Add `mission-multiday-operations` as `COMING_SOON`; do not expose Production navigation merely because development tests pass.

- [ ] **Step 4: Run focused security and authority tests**

Run: `TZ=Australia/Brisbane CI=true npm test -- --watchAll=false src/__tests__/multifieldJobScopeMigration.test.js src/__tests__/missionScopeRevisionMigration.test.js src/__tests__/missionOperatingDaysMigration.test.js src/__tests__/missionAircraftDayActualsMigration.test.js src/__tests__/missionDayChemicalWeatherMigration.test.js src/__tests__/missionFinalSignoffMigration.test.js src/__tests__/missionOperationsApi.test.js`

Expected: PASS with explicit proof of tenant/Base/role isolation, no generic table-write grants, append-only history and atomic races.

- [ ] **Step 5: Run the deterministic regression**

Run: `TZ=Australia/Brisbane npm run test:ci:sharded -- --shards=8`

Expected: all eight shards PASS; record suite/test totals in the assessment.

- [ ] **Step 6: Run Product Maturity and Production build**

Run: `npm run verify:product-maturity`

Expected: zero violations.

Run: `npm run build`

Expected: Production build PASS.

- [ ] **Step 7: Run full Chromium/WebKit acceptance**

Run: `TZ=Australia/Brisbane npx playwright test e2e/mission/multifield-multiday-mission.spec.ts e2e/acceptance/client-to-mission.spec.ts --project=chromium --project=webkit`

Expected: all configured tests PASS.

- [ ] **Step 8: Perform independent authority/security review**

Review exact migration grants, function `search_path`, aggregate lock order, tenant/Base parent resolution, CRP eligibility, immutable history, source digests, idempotent Fleet/Financial projection and report sourcing. Record findings and their resolution in `docs/operations/multifield-multiday-release-assessment.md`.

- [ ] **Step 9: Run migration dry-run and read-only legacy assessment**

Use the repository-governed dry-run path against an isolated Production-shaped database. Prove the proposed set is exactly:

```text
20260905090000_multifield_job_scope.sql
20260905100000_mission_scope_revision_and_crp_gate.sql
20260905110000_mission_operating_days_and_jsa_reviews.sql
20260905120000_mission_aircraft_day_actuals.sql
20260905130000_mission_day_chemical_and_weather_actuals.sql
20260905135000_mission_material_amendment_policy.sql
20260905140000_mission_final_signoff_and_job_close.sql
```

Record legacy counts, ambiguity classes, zero fabricated operating days, schema/RPC/grant effects, application deployment dependency and fix-forward boundary. If Production already has any equivalent object or the pending set differs, stop for reconciliation.

- [ ] **Step 10: Verify the final diff and commit release preparation**

Run: `git diff --check`

Expected: no whitespace errors.

```bash
git add src/productMaturity/registry.ts src/productMaturity/__tests__/productMaturityBoundary.test.tsx docs/operations/multifield-multiday-release-assessment.md
git commit -m "docs: prepare multi-day mission release assessment"
```

At completion, return the exact commit chain, migration SHA-256 values, test totals, cross-browser results, Product Maturity result, build result, review findings, legacy assessment and proposed immutable merged-main `RELEASE_SHA`. Request separate approval for merge, every Production migration, Production deployment and Production acceptance.
