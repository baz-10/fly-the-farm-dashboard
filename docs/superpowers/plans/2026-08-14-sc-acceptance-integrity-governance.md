# SC Acceptance Integrity Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stale “no additional SC ACCEPTANCE records” assertion with a read-only, evidence-based integrity contract that retains immutable history while failing closed on active or ambiguous controlled state.

**Architecture:** Keep the exact governed retained fixture checks and frozen baseline intact. Replace only the broad prefix rejection block in `productionStateIntegrityReconciliation.sql` with lifecycle- and provenance-aware checks over exact controlled markers, immutable application/invitation history, accepted organisation linkage, archive evidence, identity residue, operational residue and legacy-store residue. Exercise the SQL block against synthetic PostgreSQL fixtures using PGlite.

**Tech Stack:** PostgreSQL/PLpgSQL, Node.js, Jest, PGlite.

**Spec:** `/Users/bjt/.codex/attachments/b797113f-7731-4117-acbe-3ee88854e8c7/pasted-text.txt`

## Global Constraints

- No Production mutation, migration application, privilege change, deployment, workflow dispatch, archive retry or controlled fixture creation.
- Migration `20260813150000_controlled_onboarding_ftf_store_privilege_reconciliation.sql` remains byte-for-byte unchanged.
- PR #12 remains draft and unmerged.
- Classify from exact workflow, lifecycle, provenance, archive, identity and operational evidence; never from a simple name prefix alone.
- Application/invitation history and archive audit/outbox evidence remain immutable.

---

### Task 1: Evidence policy and classification

**Files:**
- Read: `supabase/migrations/20260809140000_commercial_onboarding_acceptance_cleanup.sql`
- Read: `scripts/verifyCommercialOnboardingPostgres.mjs`
- Read: repository history for controlled acceptance runs and archive manifests

**Interfaces:**
- Consumes: bounded Production inventory from workflow run `31769122702`.
- Produces: one A–G classification and cleanup disposition for each of 11 groupings.

- [ ] Verify immutable-history and archive-retention semantics from source.
- [ ] Correlate every controlled grouping to its recorded workflow and lifecycle state.
- [ ] Classify exact current, clean archived, active residual and pre-acceptance failed evidence.

### Task 2: Failing integrity regressions

**Files:**
- Modify: `src/__tests__/productionStateIntegrityReconciliation.test.js`

**Interfaces:**
- Consumes: the required 16 regression cases in the Founder directive.
- Produces: executable synthetic PostgreSQL tests for the controlled-evidence assertion.

- [ ] Add a synthetic schema/fixture harness that executes the marked controlled-evidence block.
- [ ] Add pass cases for current, archived history, multiple archives, immutable history, SENT-only history and similar genuine names.
- [ ] Add fail cases for active organisations, operational residue, ambiguous provenance, missing audit/outbox, identity residue, store residue, replacement fixtures and zero/current mismatch.
- [ ] Run the focused test and record the expected failures against the stale assertion.

### Task 3: Minimal read-only SQL correction

**Files:**
- Modify: `scripts/productionStateIntegrityReconciliation.sql`

**Interfaces:**
- Consumes: exact lifecycle/provenance policy established in Task 1.
- Produces: a read-only fail-closed controlled-evidence integrity block.

- [ ] Preserve exact current governed identity checks.
- [ ] Recognise controlled evidence only through exact marker plus SC application identity and canonical lifecycle/provenance.
- [ ] Permit retained immutable application/invitation evidence and clean archived organisations.
- [ ] Refuse active organisations, active identity/operational/store residue, missing archival evidence and ambiguous linkage.
- [ ] Run the focused suite until all synthetic cases pass.

### Task 4: Validation and review

**Files:**
- Verify: all changed files and Migration 150000 checksum.

**Interfaces:**
- Consumes: corrected SQL and regressions.
- Produces: validation evidence and an independent-review verdict.

- [ ] Run focused classification/integrity tests.
- [ ] Run controlled onboarding governance and privilege/security tests.
- [ ] Run deterministic regression, Product Maturity, production build, scoped lint and `git diff --check`.
- [ ] Confirm Migration 150000 checksum remains `60e9c7658ce851279c33b8cca4668ed72e2fab922c524e146d38ee039ce469d0`.
- [ ] Obtain independent review.
- [ ] Report classifications, exact cleanup set, policy, correction scope and the next bounded Founder authority required.
