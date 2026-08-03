# Operational Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Fly The Farm retain actual flight evidence and complete an authorised Mission through the deployed planner.

**Architecture:** Add an append-only Operational Evidence aggregate with independently immutable import, resource, chemical and event records. A submitted operational revision selects exact child evidence; Completion freezes that revision together with the existing authorisation evidence.

**Tech Stack:** React, TypeScript, Material UI, Vercel versioned API dispatcher, Node repository adapters, Supabase-managed PostgreSQL, Supabase Storage, SQL RLS/functions/triggers, Jest and PGlite.

## Global Constraints

- Preserve the existing public `/api/v1/*` dispatcher contract.
- PostgreSQL is authoritative; no local or legacy persistence.
- Enforce server authorisation plus RLS and operating-location scope.
- All evidence is immutable, versioned, audited and emitted through the transactional outbox.
- Files use internal evidence IDs, never permanent provider URLs.
- Completion references exact Planning, Pre-flight and Operational evidence.

---

### Task 1: Authoritative schema and trusted commands

**Files:**
- Create: `supabase/migrations/20260803120000_authoritative_operational_closeout.sql`
- Test: `src/__tests__/authoritativeOperationalCloseoutMigration.test.js`
- Test: `src/__tests__/authoritativeOperationalCloseoutPglite.test.js`

**Interfaces:**
- Produces: `ftf_read_mission_operational_closeout`, `ftf_create_mission_operational_import`, `ftf_save_mission_actual_resources`, `ftf_save_mission_actual_chemicals`, `ftf_save_mission_operational_events`, `ftf_submit_mission_operational_evidence`, `ftf_complete_mission`.

- [ ] Write migration-contract and PostgreSQL behaviour tests that fail because tables and commands are absent.
- [ ] Run both tests and confirm the expected RED failures.
- [ ] Add append-only tables, RLS, permissions, trusted commands, optimistic concurrency, audit and outbox.
- [ ] Run both tests and confirm GREEN.
- [ ] Commit with `NEW-MIS-001`.

### Task 2: Versioned API and storage adapter

**Files:**
- Modify: `server/operational-repository.js`
- Modify: `server/operational-api.js`
- Modify: `server/operational-dispatcher.js`
- Create: `src/services/missionOperationalCloseoutApi.ts`
- Test: `src/__tests__/missionOperationalCloseoutApi.test.js`
- Test: `src/services/__tests__/missionOperationalCloseoutApi.test.ts`

**Interfaces:**
- Consumes: Task 1 RPC commands.
- Produces: `/api/v1/mission-operational-closeout` GET and POST actions for import, resources, chemicals, events, submit and complete.

- [ ] Write handler and client tests for routing, validation, permissions, tenant/location scope, concurrency, unsupported actions and upload cleanup.
- [ ] Run tests and confirm RED.
- [ ] Implement repository, handler, dispatcher and typed client with KML parsing metadata and SHA-256 provenance.
- [ ] Run tests and confirm GREEN.
- [ ] Commit with `NEW-MIS-001`.

### Task 3: Six-step Mission closeout UI

**Files:**
- Create: `src/components/mission/MissionOperationalCloseout.tsx`
- Create: `src/components/mission/__tests__/MissionOperationalCloseout.test.tsx`
- Modify: `src/pages/MissionPlanning.tsx`

**Interfaces:**
- Consumes: `createMissionOperationalCloseoutApi()`.
- Produces: guided Operational Data Import, Actual Resources, Actual Chemicals, Events, Review and Completion workflow.

- [ ] Write component tests for planned prefill, KML import, derived values, no-change chemicals, no-events declaration, planned-versus-actual review, completion gating and refresh persistence.
- [ ] Run tests and confirm RED.
- [ ] Implement the minimal responsive stepper and connect it below Mission Authorisation.
- [ ] Run tests and confirm GREEN.
- [ ] Commit with `NEW-MIS-001`.

### Task 4: Full verification and deployed acceptance

**Files:**
- Modify only if a failing acceptance test identifies a defect.

**Interfaces:**
- Consumes: completed Tasks 1–3.
- Produces: deployed authoritative Operational Closeout.

- [ ] Run focused tests, full test suite, lint checks, `git diff --check` and production build.
- [ ] Apply the repository-controlled migration to the linked Production Beta Supabase project.
- [ ] Push and verify the Vercel production deployment is Ready.
- [ ] Complete a live Mission closeout with final KML, actual resources, actual chemicals, no-events or events, review and Completion.
- [ ] Refresh and verify immutable history, audit, outbox, tenant/location isolation and no fallback.
- [ ] Commit any acceptance repair with `NEW-MIS-001`.
