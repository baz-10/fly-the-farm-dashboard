# Authoritative Personnel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Fly The Farm create qualified Personnel and assign a valid PIC, additional crew and observer to an authoritative Mission.

**Architecture:** Add organisation-owned relational Personnel and Mission-assignment tables behind trusted PostgreSQL RPCs, the versioned server dispatcher and provider-neutral frontend adapters. Integrate a focused selector into the existing Mission planner while keeping qualification, privacy and concurrency decisions server-authoritative.

**Tech Stack:** PostgreSQL/Supabase migrations and RLS, Node/Vercel API handlers, React/TypeScript/MUI, Jest/React Testing Library and PGlite.

## Global Constraints

- Preserve the existing Mission frontend; do not redesign it.
- Personnel identity is independent of authentication identity.
- Non-login Personnel never consumes seats or receives application permissions.
- Mission assignments reference authoritative Personnel IDs and immutable snapshots.
- Sensitive fields require `personnel.private.read`.
- Evidence uses internal file IDs and checksums, never provider URLs.
- Every write uses tenant/location validation, optimistic concurrency, audit and transactional outbox.
- No local-storage or legacy persistence fallback.

---

### Task 1: Authoritative Personnel schema and RPC contract

**Files:**
- Create: `supabase/migrations/20260802024000_authoritative_personnel.sql`
- Create: `src/__tests__/authoritativePersonnelMigration.test.js`
- Create: `scripts/verifyAuthoritativePersonnelMigration.mjs`
- Create: `src/__tests__/authoritativePersonnelPglite.test.js`

**Interfaces:**
- Produces RPCs `ftf_list_personnel`, `ftf_read_personnel`, `ftf_write_personnel`, `ftf_archive_personnel`, `ftf_link_personnel_member`, `ftf_write_personnel_credential`, `ftf_write_personnel_evidence`, `ftf_read_mission_personnel`, and `ftf_save_mission_personnel`.
- Produces permissions `personnel.read`, `personnel.create`, `personnel.update`, `personnel.archive`, `personnel.assign`, and `personnel.private.read`.

- [ ] Write migration contract tests asserting tables, composite tenant keys, forced RLS, privacy permissions, internal evidence IDs, snapshots, audit/outbox and expected-version checks.
- [ ] Run `CI=true npm test -- --runInBand src/__tests__/authoritativePersonnelMigration.test.js` and confirm it fails because the migration is absent.
- [ ] Implement the migration and RPCs with explicit assignment blockers for inactive, missing role, missing/expired/unverified PIC credential, tenant mismatch and location mismatch.
- [ ] Implement the PGlite verifier with member-linked/non-login creation, linking without ID replacement, privacy redaction, valid assignment snapshot, expired credential rejection, concurrency rejection, archive control and audit/outbox assertions.
- [ ] Run both migration suites and confirm they pass.
- [ ] Commit with `NEW-PER-001` and `IMP-MIS-003`.

### Task 2: Personnel application/API boundary

**Files:**
- Modify: `server/operational-api.js`
- Modify: `server/operational-repository.js`
- Create: `src/__tests__/personnelOperationalApi.test.js`
- Create: `src/__tests__/personnelRepository.test.js`

**Interfaces:**
- Consumes the Task 1 RPCs.
- Produces `/api/v1/personnel` list/read/create/update/archive/link/credential/evidence operations and `/api/v1/mission-personnel` read/save operations without exposing private fields or provider locations.

- [ ] Write failing handler tests for authentication, permissions, tenant/location access, input allowlists, privacy redaction, UUID/version validation, assignment blockers and unsupported actions.
- [ ] Run the focused suites and confirm missing dispatch/handlers cause the failures.
- [ ] Implement transport-only handlers and repository methods; keep qualification logic in PostgreSQL/application services.
- [ ] Add dispatcher regression coverage proving existing API contracts remain unchanged.
- [ ] Run API/repository/dispatcher suites and commit with `NEW-PER-001` and `IMP-MIS-003`.

### Task 3: Provider-neutral Personnel frontend adapter

**Files:**
- Create: `src/services/personnelApi.ts`
- Create: `src/services/__tests__/personnelApi.test.ts`
- Create: `src/types/personnel.ts`

**Interfaces:**
- Produces `PersonnelRecord`, `PersonnelCredential`, `MissionPersonnelAssignment`, `PersonnelBlocker`, and `createPersonnelApi()`.
- Exposes list/create/update/archive/link/addCredential/addEvidence/readMissionAssignments/saveMissionAssignments.

- [ ] Write failing adapter tests for exact paths, credentials, payloads, typed `409` conflicts and blocker envelopes.
- [ ] Implement the minimal adapter and domain types.
- [ ] Run the adapter suite and commit with `NEW-PER-001`.

### Task 4: Existing Mission workflow integration

**Files:**
- Create: `src/components/mission/MissionPersonnelSelector.tsx`
- Create: `src/components/mission/__tests__/MissionPersonnelSelector.test.tsx`
- Modify: `src/pages/MissionPlanning.tsx`
- Modify: `src/pages/MissionRemoteWorkflow.test.tsx`

**Interfaces:**
- Consumes `createPersonnelApi()` and Mission operating-location/scheduled-date context.
- Produces PIC, additional crew and observer selection with credential readiness, explicit blockers and persistent server assignments.

- [ ] Write failing selector tests proving role/location filtering, expired/missing PIC blocking, non-login selection and no sensitive-field rendering.
- [ ] Write failing Mission workflow tests proving assignments load, save, reopen and never use browser persistence.
- [ ] Implement the selector in the existing Mission side column and remove Personnel from the unavailable chips only when authoritative data loads.
- [ ] Persist assignment changes with expected version and show server blocker/conflict messages verbatim.
- [ ] Run component and Mission workflow suites and commit with `IMP-MIS-003`.

### Task 5: Narrow Personnel administration surface

**Files:**
- Create: `src/pages/Personnel.tsx`
- Create: `src/pages/Personnel.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes `createPersonnelApi()`.
- Produces an existing-style `/personnel` screen for non-login creation, controlled member linking, roles, credentials, evidence metadata, location scope and archive.

- [ ] Write failing tests for non-login creation, member link reconciliation, role/credential entry, internal evidence metadata, optimistic conflicts, privacy redaction and archive confirmation.
- [ ] Implement the minimal page using existing cards, forms and dialogs; do not add navigation redesign.
- [ ] Add the protected route and run page/routing tests.
- [ ] Commit with `NEW-PER-001`.

### Task 6: Complete verification, migration and deployed acceptance

**Files:**
- Modify only test fixtures or verification scripts if a defect is found; use a new migration for any applied-schema correction.

**Interfaces:**
- Produces deployed operational evidence for the approved Personnel acceptance chain.

- [ ] Run `CI=true npm test -- --runInBand`, `npm run build`, and `git diff --check` sequentially.
- [ ] Confirm `supabase/.temp/project-ref` and authenticated CLI linkage both identify `fzkrvglzompkuiodqllr` / Spray Command Production Beta before migration.
- [ ] Apply repository migrations and verify the remote ledger.
- [ ] Push `codex/production-beta`, wait for the Git-triggered production deployment and run the unauthenticated API smoke check.
- [ ] Through the deployed frontend, create non-login and member-linked Personnel, add valid/expired credentials, assign location, persist PIC/crew/observer, prove blocker, refresh, second-session visibility and optimistic conflict.
- [ ] Verify tenant/location/privacy protections and use the approved least-privilege audit/outbox path; do not download service-role credentials.
- [ ] Report only demonstrated capabilities and any remaining blocker to Weather implementation.
