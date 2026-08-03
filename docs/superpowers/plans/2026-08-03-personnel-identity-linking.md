# Authoritative Personnel Identity Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow authorised administrators to explicitly link, unlink, and replace the login identity attached to an existing authoritative Personnel record without changing its Personnel ID or historical evidence.

**Architecture:** Repository-controlled PostgreSQL commands enforce uniqueness, permissions, tenant scope, location-independent organisation administration, reason capture, duplicate indicators, audit, and transactional outbox atomically. The versioned API exposes eligible organisation identities and link commands; the Personnel administration page presents comparison and explicit confirmation. Mission approval continues resolving the authenticated internal user through the linked Personnel record.

**Tech Stack:** PostgreSQL/Supabase migrations and RLS, Node/Vercel versioned API, React/TypeScript/MUI, Vitest, PGlite.

## Global Constraints

- Never create a second Personnel record during linking.
- Never rewrite Mission evidence or historical Personnel snapshots.
- Only users with `personnel.identity.manage` may link, unlink, or replace identities.
- Every state change requires a reason and atomically writes audit and transactional-outbox evidence.
- Never auto-link or auto-merge; duplicate indicators inform an explicit administrator decision.

---

### Task 1: Authoritative database commands

**Files:**
- Create: `supabase/migrations/20260803090000_personnel_identity_resolution.sql`
- Create: `scripts/verifyPersonnelIdentityResolutionPostgres.mjs`
- Test: `src/__tests__/personnelIdentityResolutionMigration.test.js`

**Interfaces:**
- Produces: `ftf_list_personnel_identity_candidates`, `ftf_link_personnel_identity`, and `ftf_unlink_personnel_identity` service-role RPCs.

- [ ] Write migration contract and PostgreSQL behaviour tests for admin permission, explicit reason, comparison data, duplicate indicators, unique links, optimistic concurrency, link/unlink/replace, historical stability, audit, outbox, and tenant denial.
- [ ] Run the tests and confirm they fail because the migration and RPCs do not exist.
- [ ] Implement the migration and RPCs with atomic checks and evidence writes.
- [ ] Run the focused tests and verifier until green.
- [ ] Commit with `NEW-USR-001 IMP-SAF-002`.

### Task 2: Versioned administration API

**Files:**
- Modify: `server/operational-api.js`
- Modify: `server/operational-repository.js`
- Modify: `api/v1/[...path].js`
- Test: `src/__tests__/personnelIdentityOperationalApi.test.js`

**Interfaces:**
- Consumes: Task 1 RPCs.
- Produces: `/api/v1/personnel-identity` candidate read and link/unlink commands preserving existing public versioning and authentication conventions.

- [ ] Write failing API tests for authentication, permission enforcement, tenant scope, validation, conflict mapping, and resource dispatch.
- [ ] Run tests and confirm unsupported-resource or missing-handler failures.
- [ ] Add transport/repository adapters with no identity business logic in the dispatcher.
- [ ] Run focused and dispatcher regression tests until green.
- [ ] Commit with `NEW-USR-001 IMP-PLAT-003`.

### Task 3: Administrative identity-resolution UI

**Files:**
- Create: `src/types/personnelIdentity.ts`
- Create: `src/services/personnelIdentityApi.ts`
- Create: `src/components/personnel/PersonnelIdentityLinker.tsx`
- Modify: `src/pages/Personnel.tsx`
- Test: `src/components/personnel/__tests__/PersonnelIdentityLinker.test.tsx`

**Interfaces:**
- Consumes: Task 2 API.
- Produces: admin-only search, comparison, duplicate indicators, reason capture, explicit confirm, unlink, and replace workflow on the existing Personnel record.

- [ ] Write failing component tests proving comparison is shown before confirmation and ordinary users cannot access link commands.
- [ ] Run tests and confirm the UI is missing.
- [ ] Implement the smallest accessible MUI workflow following existing Personnel styling.
- [ ] Run focused tests, lint, and production build until green.
- [ ] Commit with `NEW-USR-001`.

### Task 4: Production acceptance and JSA completion

**Files:**
- No new product files unless acceptance exposes a defect.

**Interfaces:**
- Consumes: deployed Tasks 1–3.
- Produces: existing Ben Personnel linked to the existing Ben internal user/membership, followed by deployed PIC self-approval.

- [ ] Apply the verified migration to the confirmed Production Beta Supabase project.
- [ ] Deploy the tested branch and confirm API smoke behaviour.
- [ ] Use the admin UI to compare and link the existing identities with a recorded reason; do not create or merge Personnel.
- [ ] Reopen the real Mission, approve JSA as assigned PIC, refresh, and confirm authoritative version, hazard, control, approval, grouped readiness, audit, and outbox persistence.
- [ ] Run the full test suite, lint, build, and repository cleanliness checks.
- [ ] Commit any acceptance repair with Requirement IDs and push the branch.
