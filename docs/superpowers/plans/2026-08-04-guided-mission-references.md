# Guided Mission References Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let operators revisit every guided Mission step and create collision-safe organisation-prefixed Job and Mission references unless they explicitly choose a custom reference.

**Architecture:** PostgreSQL owns organisation prefixes, independent Job/Mission sequences and allocation inside trusted resource-write transactions. Existing API routes carry an `autoGenerateReference` command flag through the portable adapter; the guided React workflow defaults it on and keeps saved parent selections stable while navigating backward.

**Tech Stack:** React 19, TypeScript, Material UI, Jest/Testing Library, Node/Vercel API handlers, Supabase-managed PostgreSQL, repository-controlled SQL migrations.

## Global Constraints

- Preserve the existing public `/api/v1/*` resource routes and response envelopes.
- Automatic formats are `<PREFIX>-JOB-000001` and `<PREFIX>-MIS-000001`.
- Prefixes are organisation-owned, uppercase `A-Z0-9`, and two to eight characters.
- Sequences are independent per organisation and resource type; allocated numbers are never reused.
- PostgreSQL generation is authoritative and concurrency-safe.
- Custom references remain supported and must be unique within the organisation and resource type.
- Backward navigation never deletes records, silently creates duplicates, or uses browser persistence.
- Preserve tenant isolation, operating-location scope, permissions, audit, transactional outbox and optimistic concurrency.

---

### Task 1: Authoritative organisation reference allocation

**Files:**
- Create: `supabase/migrations/20260804060000_organisation_reference_sequences.sql`
- Create: `src/__tests__/organisationReferenceSequencesMigration.test.js`
- Modify: `server/operational-api.js`
- Test: `src/__tests__/trustedOperationalApi.test.js`

**Interfaces:**
- Consumes: `public.ftf_write_operational_resource(...)` and the existing `jobs` and `missions` tables.
- Produces: `organisations.reference_prefix`, `organisation_reference_sequences`, `public.ftf_allocate_operational_reference(uuid,text)`, and trusted create support for `autoGenerateReference:boolean`.

- [ ] **Step 1: Write failing migration and API tests**

Assert that the migration adds the prefix constraint, tenant/resource sequence key, row locking allocation, `FTF-JOB-` and `FTF-MIS-` formatting, non-reuse, custom uniqueness, audit/outbox preservation, and that the handler allows a missing reference only when `autoGenerateReference === true`.

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- --runInBand --watchAll=false src/__tests__/organisationReferenceSequencesMigration.test.js src/__tests__/trustedOperationalApi.test.js`

Expected: FAIL because no reference-prefix migration or automatic create command exists.

- [ ] **Step 3: Implement the migration and minimal handler command mapping**

Create a repository-controlled SQL migration that:

```sql
alter table public.organisations add column reference_prefix text;
create table public.organisation_reference_sequences (
  organisation_id uuid not null,
  resource_type text not null check (resource_type in ('job','mission')),
  last_value bigint not null default 0,
  primary key (organisation_id, resource_type)
);
```

Backfill deterministic suggested prefixes, reserve the sequence row with `insert ... on conflict`, increment it atomically, format with `lpad(...,6,'0')`, and wrap the current trusted write function so automatic allocation occurs in the same transaction as creation. Add organisation/resource unique indexes for Job references and Mission numbers. Reject explicit duplicate custom references without partial writes.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run the Task 1 test command and require zero failures.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260804060000_organisation_reference_sequences.sql src/__tests__/organisationReferenceSequencesMigration.test.js src/__tests__/trustedOperationalApi.test.js server/operational-api.js
git commit -m "IMP-MIS-001 add organisation reference allocation"
```

### Task 2: Portable API contract for automatic and custom references

**Files:**
- Modify: `src/services/operationalDataStore.ts`
- Modify: `src/services/operationalApi.ts`
- Modify: `src/services/__tests__/operationalApi.test.ts`

**Interfaces:**
- Consumes: existing `createJob(input)` and `createMission(input)` API adapter methods.
- Produces: optional `autoGenerateReference:boolean` on `OperationalJobCreateInput` and `OperationalMissionCreateInput`; custom `reference`/`missionNumber` remain supported.

- [ ] **Step 1: Write failing adapter tests**

Add one test proving an automatic Job create sends `{ autoGenerateReference:true }` without a client-generated reference and returns `FTF-JOB-000001`, and one equivalent Mission test returning `FTF-MIS-000001`. Retain the existing explicit-reference tests unchanged.

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- --runInBand --watchAll=false src/services/__tests__/operationalApi.test.ts`

Expected: FAIL because create input validation still requires client reference strings.

- [ ] **Step 3: Implement the minimal adapter changes**

Define inputs as a discriminated command:

```ts
type ReferenceChoice =
  | { autoGenerateReference: true; reference?: never }
  | { autoGenerateReference?: false; reference: string };
```

Use the equivalent `missionNumber` union for Mission commands. Pass the flag only for automatic commands and continue normalising server-returned authoritative records.

- [ ] **Step 4: Run tests to verify GREEN**

Run the Task 2 test command and require zero failures.

- [ ] **Step 5: Commit**

```bash
git add src/services/operationalDataStore.ts src/services/operationalApi.ts src/services/__tests__/operationalApi.test.ts
git commit -m "IMP-MIS-001 support automatic references in API adapter"
```

### Task 3: Reversible guided workflow and reference controls

**Files:**
- Modify: `src/components/mission/GuidedMissionCreation.tsx`
- Modify: `src/components/mission/__tests__/GuidedMissionCreation.test.tsx`

**Interfaces:**
- Consumes: Task 2 automatic/custom create commands and authoritative records held by `OperationalDataContext`.
- Produces: selectable completed Stepper steps, safe dependent-selection clearing, and default-on automatic reference controls for Job and Mission creation.

- [ ] **Step 1: Write failing UI tests**

Add tests proving:

```ts
expect(screen.getByRole('checkbox', { name: 'Auto-generate Job reference' })).toBeChecked();
expect(screen.queryByRole('textbox', { name: 'Custom Job reference' })).not.toBeInTheDocument();
```

Then prove unchecking exposes the custom field, automatic commands omit a custom value, completed step labels can be clicked to navigate backward, and changing Client clears Property, Field and Job selections before forward progress.

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- --runInBand --watchAll=false src/components/mission/__tests__/GuidedMissionCreation.test.tsx`

Expected: FAIL because the checkboxes and selectable completed steps do not exist.

- [ ] **Step 3: Implement minimal reversible navigation**

Add `autoJobReference` and `autoMissionReference`, defaulting to `true`. Render checked controls with these exact accessible labels:

```tsx
<FormControlLabel control={<Checkbox checked={autoJobReference} />} label="Auto-generate Job reference" />
<FormControlLabel control={<Checkbox checked={autoMissionReference} />} label="Auto-generate Mission reference" />
```

Show custom fields only when disabled. Make completed `StepButton` elements navigate to their stage. When Client changes, clear Property/Field/Job; when Property changes, clear Field/Job; when Field changes, clear Job. Never delete already-persisted records. Send `{autoGenerateReference:true}` for automatic creates and explicit reference fields for custom creates.

- [ ] **Step 4: Run tests to verify GREEN**

Run the Task 3 test command and require zero failures.

- [ ] **Step 5: Commit**

```bash
git add src/components/mission/GuidedMissionCreation.tsx src/components/mission/__tests__/GuidedMissionCreation.test.tsx
git commit -m "IMP-MIS-001 make guided Mission steps reversible"
```

### Task 4: Full verification, migration and deployment

**Files:**
- Verify all files changed by Tasks 1-3.

**Interfaces:**
- Consumes: complete implementation.
- Produces: deployed Production Beta workflow with production migration evidence.

- [ ] **Step 1: Run focused PostgreSQL behaviour verification**

Run the migration tests plus the repository's PGlite operational tests and require automatic tenant sequences, duplicate rejection and existing audit/outbox tests to pass.

- [ ] **Step 2: Run the complete test suite**

Run: `npm test -- --runInBand --watchAll=false`

Expected: all suites and tests pass.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: exit code `0`; pre-existing warnings may remain but no build error is accepted.

- [ ] **Step 4: Reconfirm the linked Production Beta Supabase project and apply the migration**

Verify project ref `fzkrvglzompkuiodqllr`, then run `npx supabase db push` from the linked worktree. Stop before migration if the project ref differs.

- [ ] **Step 5: Push and deploy**

Push `codex/production-beta`, deploy the linked Vercel project with `npx vercel --prod --yes`, and require target `production` with ready state `READY`.

- [ ] **Step 6: Perform deployed acceptance**

Open `/missions/new`, verify reversible completed steps and both auto-generation controls, create no synthetic records, and leave the live workflow open for Product Owner testing. Smoke-check the root page returns `200` and an unsupported API resource returns `404`.

- [ ] **Step 7: Report the operational result**

Return the production URL, deployed commit, deployment ID, test totals, migration result, and the exact live acceptance path. Preserve the continuous Production Beta worktree and branch.
