# Resumable Guided Mission Drafts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist guided Mission creation progress in PostgreSQL so operators can save, exit and resume the exact workflow state from the Mission list.

**Architecture:** Add a dedicated tenant-scoped `mission_setup_drafts` aggregate with trusted versioned commands, RLS, audit and outbox. A portable API adapter saves authoritative selections and temporary active-step values; the existing guided component restores that state and the Mission list presents explicit resume/archive actions.

**Tech Stack:** React 19, TypeScript, Material UI, Jest/Testing Library, Vercel Node handlers, Supabase PostgreSQL/RLS, repository-controlled SQL migrations.

## Global Constraints

- Do not create a draft merely by opening `/missions/new`.
- Persist only after meaningful selection or explicit Save and exit.
- No local storage, session storage or legacy persistence.
- Drafts never replace authoritative Client, Property, Field, Job or Mission records.
- Preserve the existing `/api/v1/*` dispatcher and portable service boundaries.
- Enforce tenant isolation, operating-location scope, permissions, optimistic concurrency, audit and transactional outbox.
- Archiving a setup draft never deletes or archives authoritative resources.

---

### Task 1: PostgreSQL setup-draft aggregate

**Files:**
- Create: `supabase/migrations/20260804070000_mission_setup_drafts.sql`
- Create: `src/__tests__/missionSetupDraftsMigration.test.js`
- Create: `scripts/verifyMissionSetupDraftsMigration.mjs`
- Create: `src/__tests__/missionSetupDraftsPglite.test.js`

**Interfaces:**
- Produces: `mission_setup_drafts`, `ftf_list_mission_setup_drafts`, `ftf_write_mission_setup_draft`, RLS policies, audit and outbox transitions.

- [ ] Write static and PGlite tests proving create/update/archive, expected-version conflicts, tenant denial, location denial, parent relationship validation, Mission uniqueness, audit and outbox.
- [ ] Run the focused tests and confirm RED because the migration and functions do not exist.
- [ ] Implement the migration with JSONB `form_state`, explicit selected parent UUID columns, `current_step`, `furthest_step`, `row_version`, creator/actor attribution and archive metadata.
- [ ] Run focused tests and require GREEN.
- [ ] Commit with `IMP-MIS-001 add authoritative Mission setup drafts`.

### Task 2: Versioned dispatcher and portable API adapter

**Files:**
- Modify: `api/v1/[resource].js`
- Modify: `server/operational-api.js`
- Modify: `server/operational-repository.js`
- Create: `src/services/missionSetupDraftsApi.ts`
- Create: `src/services/__tests__/missionSetupDraftsApi.test.ts`
- Create: `src/__tests__/missionSetupDraftsOperationalApi.test.js`

**Interfaces:**
- Produces: list/create/update/archive contract at `/api/v1/mission-setup-drafts` and typed `MissionSetupDraft` client operations.

- [ ] Write failing adapter and handler tests for endpoint routing, create, versioned update, archive, conflict, permissions and unsupported methods.
- [ ] Run tests and confirm RED.
- [ ] Route the resource through the dynamic dispatcher into a dedicated handler that contains no domain persistence logic.
- [ ] Implement repository RPC calls and typed client mapping without browser persistence.
- [ ] Run focused tests and require GREEN.
- [ ] Commit with `IMP-MIS-001 expose Mission setup draft API`.

### Task 3: Guided wizard automatic save and restoration

**Files:**
- Modify: `src/components/mission/GuidedMissionCreation.tsx`
- Modify: `src/components/mission/__tests__/GuidedMissionCreation.test.tsx`
- Modify: `src/pages/MissionPlanning.tsx`

**Interfaces:**
- Consumes: `missionSetupDraftsApi`.
- Produces: optional `draftId` resume input, confirmed Saved indicator, automatic progress saves and Save and exit.

- [ ] Write failing UI tests proving no create on initial render, create after meaningful selection, autosave after each completed step, Save and exit from any step, exact state restoration, visible conflicts and no duplicate parents.
- [ ] Run tests and confirm RED.
- [ ] Add draft load/create/update orchestration while leaving existing authoritative resource creation unchanged.
- [ ] Add **Save and exit**, server-confirmed **Saved**, and query-based resume at `/missions/new?draftId=<uuid>`.
- [ ] After Step 5, link the created Mission ID and continue using the stable Mission route.
- [ ] Run focused tests and require GREEN.
- [ ] Commit with `IMP-MIS-001 make guided Mission setup resumable`.

### Task 4: Mission-list resume and archive workflow

**Files:**
- Modify: `src/pages/MissionList.tsx`
- Modify: `src/pages/__tests__/MissionList.test.tsx` or the existing Mission-list test file discovered during implementation.

**Interfaces:**
- Consumes: setup-draft list/archive API.
- Produces: **Mission setup drafts**, **Continue setup**, and archive actions.

- [ ] Write failing tests for loading incomplete drafts, resume URL, authorised archive and no deletion of authoritative records.
- [ ] Run tests and confirm RED.
- [ ] Add a compact setup-drafts section above the Mission register with current step, last saved time and Continue setup.
- [ ] Add confirmed archive using the draft expected version.
- [ ] Run focused tests and require GREEN.
- [ ] Commit with `IMP-MIS-001 add Mission setup draft resume`.

### Task 5: Production verification and deployment

**Files:**
- Verify all files changed by Tasks 1-4.

**Interfaces:**
- Produces: deployed resumable workflow and acceptance evidence.

- [ ] Run the complete test suite with `npm test -- --runInBand --watchAll=false`.
- [ ] Run `npm run build` and require exit code `0`.
- [ ] Reconfirm linked Supabase project `fzkrvglzompkuiodqllr` before migration.
- [ ] Apply `20260804070000_mission_setup_drafts.sql` only after local verification.
- [ ] Push `codex/production-beta` and deploy the linked Vercel production project.
- [ ] Verify `/missions/new` creates nothing on open, then use Product Owner-authorised real selections to prove Save and exit, Mission-list resume, refresh, re-login, second session, conflict, tenant/location isolation, audit and outbox.
- [ ] Leave the resumed draft open for Product Owner acceptance and report only the operational milestone or a genuine blocker.
