# PR #2 Review Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every Product Owner P1 finding on PR #2 while preserving the controlled commercial-onboarding lifecycle and preventing any migration, deployment, branch reconciliation, or first Production Beta release.

**Architecture:** Retire legacy public tenant bootstrap at both UI and server boundaries while retaining approved invitation provisioning. Move migration planning, reconciliation, and release-record construction into testable repository scripts used by the GitHub workflow, and make release identity explicit through independently verified Vercel metadata and runtime values.

**Tech Stack:** React 19, TypeScript, Material UI, Node.js, Jest/Testing Library, GitHub Actions YAML, Supabase CLI, Vercel CLI.

## Global Constraints

- PR #2 remains open and unmerged.
- Do not migrate, deploy, reconcile `codex/production-beta`, or run the first Production Beta release.
- The only commercial lifecycle is Application → Review → Approval → Invitation → Authentication → Organisation Provisioning → Getting Started → Operational Readiness.
- Existing organisations and the authoritative invitation-acceptance transaction remain unchanged.
- All trust-boundary GitHub Actions use reviewed immutable commit SHAs without widening permissions.
- Migration verification is machine-enforced and never hard-coded.
- Every release attempt crossing the migration boundary produces a canonical record, including partial releases.
- Deployment metadata and runtime release identity independently equal the single `RELEASE_SHA` before acceptance.
- Work test-first and preserve a clean, secret-free repository.

---

### Task 1: Close public onboarding bypass and repair Base focus

**Files:**
- Modify: `src/pages/Login.tsx`
- Modify: `src/App.tsx`
- Modify: `src/pages/Register.tsx` or retire it from routing
- Modify: `api/auth.js`
- Modify: `src/pages/GettingStarted.tsx`
- Modify: `src/components/onboarding/BaseConfirmation.tsx`
- Test: `src/__tests__/authenticated-auth-api.test.ts`
- Test: `src/__tests__/commercialOnboardingEntry.test.tsx`
- Test: `src/__tests__/gettingStartedPage.test.tsx`

**Interfaces:**
- Public `Create account` navigates to `/apply`.
- Public `action=register` cannot provision a contractor organisation or invoke `ftf_bootstrap_production_beta_organisation`.
- `/register` redirects to `/apply` or otherwise cannot render public contractor provisioning.
- `CONFIRM_BASE` focuses the stable `confirm-base-heading` landmark after navigation.

- [ ] Write tests proving `/register` cannot create an organisation, direct register API manipulation is denied, unapproved applicants cannot provision, Create Account opens `/apply`, existing identity login remains unaffected, and Base focus transfers correctly.
- [ ] Run the focused tests and confirm failures occur at the legacy provisioning and incorrect landmark boundaries.
- [ ] Implement the minimum UI, route, API, and focus corrections without deleting the invitation provisioning transaction.
- [ ] Re-run focused tests and confirm all pass.
- [ ] Commit only Task 1 files.

### Task 2: Authoritative migration reconciliation and partial release records

**Files:**
- Create: `scripts/productionBetaReleaseEvidence.mjs`
- Modify: `.github/workflows/production-beta-release.yml`
- Modify: `docs/operations/production-beta-github-release.md`
- Test: `src/__tests__/productionBetaReleaseEvidence.test.js`
- Test: `src/__tests__/productionBetaReleaseWorkflow.test.js`

**Interfaces:**
- `parseMigrationPlan(output)` returns exact ordered repository migration IDs and rejects ambiguous migration-like output.
- `reconcileMigrationLedger({ plannedIds, remoteIds, pendingAfter })` succeeds only when every planned ID exists remotely and `pendingAfter` is empty.
- `buildReleaseRecord(evidence)` always records attempts crossing the migration boundary, with `NOT_RUN` acceptance for deployment/SHA failures.
- Workflow outputs expose the exact plan and verified ledger state rather than a hard-coded boolean.

- [ ] Write unit and workflow tests for exact planning, ambiguous/empty parsing, remote reconciliation, zero pending post-apply migrations, and canonical partial-release evidence.
- [ ] Run focused tests and confirm they fail against the current regex and success-only record job.
- [ ] Implement the helper and integrate it into pre-apply planning, post-apply verification, and an `always()` release-record job.
- [ ] Re-run focused tests and confirm all pass.
- [ ] Commit only Task 2 files.

### Task 3: Pin acceptance actions and unify immutable release identity

**Files:**
- Modify: `.github/workflows/production-beta-operational-acceptance.yml`
- Modify: `.github/workflows/production-beta-release.yml`
- Modify: `api/v1/deployment.js`
- Modify: `docs/operations/production-beta-github-release.md`
- Test: `src/__tests__/commercialOnboardingAcceptanceGovernance.test.js`
- Test: `src/__tests__/deploymentIdentityApi.test.js`
- Test: `src/__tests__/productionBetaReleaseWorkflow.test.js`

**Interfaces:**
- Runtime endpoint reads explicit server-only `SPRAY_COMMAND_RELEASE_SHA` and fails closed when missing or invalid.
- Vercel deployment receives `SPRAY_COMMAND_RELEASE_SHA=RELEASE_SHA` as runtime configuration and `githubCommitSha=RELEASE_SHA` as metadata.
- Workflow inspects deployed metadata and fails on missing or mismatched metadata before querying the runtime endpoint.
- Checkout, setup-node, and upload-artifact actions are pinned to reviewed immutable SHAs, documented with versions and update procedure.

- [ ] Write tests for pinned actions, missing/mismatched metadata, missing/mismatched runtime identity, acceptance blocking, and matching release identity.
- [ ] Run focused tests and confirm failures occur against floating tags and the implicit runtime identity.
- [ ] Implement explicit runtime identity, metadata verification, action pinning, and documentation.
- [ ] Re-run focused tests and confirm all pass.
- [ ] Commit only Task 3 files.

### Task 4: Governance verification and independent review

**Files:**
- Commit: `docs/superpowers/plans/2026-08-10-pr2-review-corrections.md`
- Modify only if a failing test or reviewer identifies a correction within Tasks 1–3 scope.

**Interfaces:**
- Focused authority-boundary tests, full regression, Product Maturity verification, production build, secret/environment scan, and independent review all pass on the exact PR head.
- Repository evidence verifies automatic Production deployment suppression; remote GitHub/Vercel environment controls are reported as first-release prerequisites and are not exercised.

- [ ] Run focused authority-boundary tests.
- [ ] Run the complete deterministic regression suite.
- [ ] Run Product Maturity verification and the production build.
- [ ] Run repository secret and environment scans.
- [ ] Obtain independent spec and quality review of the complete correction diff.
- [ ] Commit the repository-controlled correction plan without staging unrelated files.
- [ ] Push the corrected PR branch only after every P1 is closed; do not merge or release.
