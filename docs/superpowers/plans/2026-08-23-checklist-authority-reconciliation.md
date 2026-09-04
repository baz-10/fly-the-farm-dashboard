# Checklist Authority Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile the existing Controlled Checklists subsystem so product and organisation templates, frozen execution, checked applicability, exact Fleet linkage, transactional completion and immutable findings share one authoritative domain.

**Architecture:** Extend the current Checklist tables with explicit authority and scope, add relational applicability and findings, and move reads/completion behind checked RPCs. Preserve all historical identities and payloads while making new executions freeze exact content at start.

**Tech Stack:** PostgreSQL/Supabase migrations, SECURITY DEFINER RPCs, Node trusted-server handlers/repositories, React/TypeScript, Jest/PGlite, Playwright Chromium/WebKit.

**Spec:** `docs/superpowers/specs/2026-08-23-checklist-authority-reconciliation-design.md`

## Global Constraints

- Base commit is exactly `b8afc8f86873a38d2d509ba925dabe8fcba73fc7`.
- Extend the existing Checklist subsystem; do not create a parallel execution or Mission-readiness domain.
- No DJI/CASA content, Fleet defect lifecycle, automatic grounding, Product Maturity promotion or Production action.
- Preserve submitted execution, evidence and historical template/version payloads unchanged.
- Test-first RED/GREEN is mandatory for every runtime behavior.
- Direct authenticated table mutation remains revoked; commands are checked and transactional.

---

### Task 1: Authority schema and historical mapping

**Files:**
- Create: `supabase/migrations/20260823100000_checklist_authority_reconciliation.sql`
- Test: `src/__tests__/checklistAuthorityReconciliationMigration.test.js`
- Test: `src/__tests__/checklistAuthorityReconciliationPglite.test.js`

**Interfaces:**
- Produces authority-scope columns, item provenance validation, applicability, frozen execution scope, findings and permissions used by every later task.

- [ ] Write structural and PGlite RED tests for PLATFORM_SYSTEM, ORGANISATION inheritance, immutable history and direct-role denial.
- [ ] Run them and confirm failures are caused by the missing reconciliation migration.
- [ ] Add the smallest additive schema, backfill and immutability/ACL rules.
- [ ] Re-run tests GREEN and commit.

### Task 2: Checked applicability and exact asset scope

**Files:**
- Modify: `supabase/migrations/20260823100000_checklist_authority_reconciliation.sql`
- Test: `src/__tests__/checklistAuthorityReconciliationPglite.test.js`

**Interfaces:**
- Produces `ftf_read_applicable_checklist_templates` and a private Mission-requirement projector.
- Consumes existing `ftf_operational_location_allowed` and `ftf_maintenance_asset_location_allowed`.

- [ ] Write RED cases for unrelated PRE_FLIGHT templates, cross-Base IDs, foreign Aircraft/Fleet assets and wrong system/position.
- [ ] Verify each failure.
- [ ] Implement checked resolution and bounded projections.
- [ ] Run GREEN, including exact applicable and non-applicable fixtures, then commit.

### Task 3: Frozen start and transactional completion

**Files:**
- Modify: `supabase/migrations/20260823100000_checklist_authority_reconciliation.sql`
- Test: `src/__tests__/checklistAuthorityReconciliationPglite.test.js`

**Interfaces:**
- Produces checked start/save/complete commands returning exact execution projections.
- Completion consumes the frozen snapshot and execution evidence only.

- [ ] Write RED for v2 start/v3 publication/v2 completion.
- [ ] Write RED for missing, duplicate, unknown and invalid responses; invalid N/A; missing evidence; stale version and unauthorised actor/Base.
- [ ] Implement snapshot assembly and completion validation under row locks.
- [ ] Prove atomically generated findings/audit/outbox and rollback on every rejection.
- [ ] Run GREEN and commit.

### Task 4: Immutable finding and handoff boundary

**Files:**
- Modify: `supabase/migrations/20260823100000_checklist_authority_reconciliation.sql`
- Test: `src/__tests__/checklistAuthorityReconciliationPglite.test.js`

**Interfaces:**
- Produces immutable `checklist_findings` with `DEFECT_HANDOFF_PENDING` only.

- [ ] Write RED for finding identity/evidence and attempted mutation.
- [ ] Write RED proving no Fleet defect, Aircraft serviceability, Fleet status or due-state mutation occurs.
- [ ] Implement the minimal finding insertion/read projection and immutability guard.
- [ ] Run GREEN and commit.

### Task 5: Trusted server and strict browser contracts

**Files:**
- Modify: `server/checklists-api.js`
- Modify: `server/checklists-repository.js`
- Modify: `src/services/checklistsApi.ts`
- Test: `src/__tests__/checklistsApi.test.js`
- Test: `src/services/__tests__/checklistsApi.test.ts`

**Interfaces:**
- Consumes checked RPCs from Tasks 2–4.
- Produces strict tenant-context HTTP contracts for template discovery, execution and completed/finding reads.

- [ ] Write RED tests for permission separation, exact scope forwarding, malicious/extra response keys, unsafe diagnostics and connectivity failure.
- [ ] Replace generic table reads with checked RPC calls.
- [ ] Add fail-whole recursive browser decoders and bounded public diagnostics.
- [ ] Run GREEN and commit.

### Task 6: Mission Checklist UI reconciliation

**Files:**
- Modify: `src/components/mission/MissionChecklists.tsx`
- Modify: `src/pages/ControlledChecklists.tsx`
- Test: `src/components/mission/__tests__/MissionChecklists.test.tsx`
- Test: `src/pages/__tests__/ControlledChecklists.test.tsx`
- Create: `e2e/checklist-authority-reconciliation.spec.ts`

**Interfaces:**
- Consumes exact applicable templates and frozen execution contracts.
- Produces progressive, permission-aware Checklist execution without product-template mutation controls.

- [ ] Write RED tests for started-version continuation, executor-only permissions, single authoritative error, session/Base scope clearing and disconnected completion.
- [ ] Adapt UI to frozen snapshot items and checked commands.
- [ ] Keep platform templates read-only and organisation authoring distinct.
- [ ] Run focused Jest GREEN and responsive Chromium/WebKit GREEN, then commit.

### Task 7: Mission readiness and historical regression

**Files:**
- Modify: `supabase/migrations/20260823100000_checklist_authority_reconciliation.sql`
- Test: `src/__tests__/missionChecklistReadinessMigration.test.js`
- Test: `src/__tests__/checklistAuthorityReconciliationPglite.test.js`

**Interfaces:**
- Replaces the old universal lifecycle requirement source while retaining the canonical Mission-readiness function.

- [ ] Write RED for unrelated template non-blocking and exact applicable incomplete/completed behavior.
- [ ] Reconcile the readiness wrapper to the private checked projector.
- [ ] Compare historical submitted payload/evidence bytes before and after migration.
- [ ] Run GREEN and commit.

### Task 8: Whole-slice verification and independent review

**Files:**
- Update: `docs/superpowers/specs/2026-08-23-checklist-authority-reconciliation-design.md` only for verified deviations, if any.

**Interfaces:**
- Produces final evidence for Founder review; no merge or Production action.

- [ ] Run focused migration, PGlite, server, browser and UI tests.
- [ ] Run all deterministic regression shards without cancelling slow shards.
- [ ] Run Product Maturity verification without changing classifications.
- [ ] Run the Production build and `git diff --check`.
- [ ] Run responsive Chromium/WebKit acceptance.
- [ ] Request an independent whole-slice authority/security review and resolve every material finding test-first.
- [ ] Record migration SHA-256, exact commits, files, deviations and final recommendation.
