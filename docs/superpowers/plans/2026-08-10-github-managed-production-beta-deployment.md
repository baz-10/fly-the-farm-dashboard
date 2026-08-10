# GitHub-Managed Production Beta Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build repository-controlled GitHub infrastructure that applies Production Beta Supabase migrations, deploys the same immutable commit to Vercel, and runs operational acceptance without giving deployment credentials to Codex.

**Architecture:** A manually dispatched release workflow captures one 40-character `RELEASE_SHA`, validates and checks out that exact commit, runs tests/build, and then enters the protected `production-beta-deployment` environment. The protected job dry-runs and applies linked Supabase migrations, verifies the ledger, deploys the same checkout to the fixed Vercel project, verifies `READY` and `/api/v1/deployment`, then calls the existing acceptance workflow with the same SHA. Acceptance remains isolated in `production-beta-acceptance`.

**Tech Stack:** GitHub Actions YAML, Supabase CLI, Vercel CLI, Jest, js-yaml, Node.js 20.

## Global Constraints

- Do not apply Production Beta migrations or deploy while building this infrastructure.
- `production-beta-deployment` owns `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, and `VERCEL_TOKEN` only.
- `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` are deployment-environment variables.
- Migration credentials must never appear in acceptance jobs, runtime configuration, repository files, logs, or artefacts.
- One immutable `RELEASE_SHA` governs checkout, migrations, build, Vercel deployment, deployed-version verification, and acceptance.
- Migration failure stops deployment and acceptance; deployment failure preserves migration history and reports a partial release.
- Never reverse, delete, repair, or rewrite applied migration history automatically.
- The first real release remains blocked pending Product Owner approval and resolution of the automatic Vercel Git production-deployment race.

---

### Task 1: Release workflow governance contract

**Files:**
- Create: `src/__tests__/productionBetaReleaseWorkflow.test.js`
- Create: `.github/workflows/production-beta-release.yml`

**Interfaces:**
- Consumes: protected GitHub environments and the canonical Production Beta project identifiers.
- Produces: a workflow contract with `release_sha` input and a `release-sha` output passed to acceptance.

- [ ] **Step 1: Write failing tests**

Add tests that load `.github/workflows/production-beta-release.yml` through `js-yaml` and assert manual-only triggering, read-only default permissions, deployment concurrency, `production-beta-deployment`, exact allowed secret/variable references, fixed Supabase project-ref verification, immutable SHA checkout, migration dry-run/application/ledger order, Vercel deployment/READY/SHA order, acceptance last, and absence of migration credentials from the acceptance workflow.

- [ ] **Step 2: Verify RED**

Run: `CI=true npm test -- --watchAll=false --runInBand src/__tests__/productionBetaReleaseWorkflow.test.js`

Expected: FAIL because `.github/workflows/production-beta-release.yml` does not exist.

- [ ] **Step 3: Implement the minimum workflow**

Create a manual workflow with `release_sha` input, immutable checkout verification, test/build gates, a protected deployment job, explicit Supabase dry-run/application/ledger commands, Vercel CLI deployment with `githubCommitSha=$RELEASE_SHA`, READY and endpoint verification, and a final reusable-workflow acceptance call.

- [ ] **Step 4: Verify GREEN**

Run the focused test again and confirm it passes.

### Task 2: Exact-SHA acceptance handoff

**Files:**
- Modify: `.github/workflows/production-beta-operational-acceptance.yml`
- Modify: `src/__tests__/commercialOnboardingAcceptanceGovernance.test.js`

**Interfaces:**
- Consumes: optional `expected_release_sha` supplied by the release workflow.
- Produces: reusable acceptance execution that rejects any deployed SHA mismatch while preserving manual, scheduled, and repository-dispatch acceptance.

- [ ] **Step 1: Write failing acceptance-handoff tests**

Assert `workflow_call` accepts a required 40-character release SHA, the deployment-identity job validates that value against `/api/v1/deployment`, all acceptance jobs check out the deployed SHA, and no deployment-environment secret is referenced.

- [ ] **Step 2: Verify RED**

Run the two focused workflow suites and confirm the missing reusable input fails.

- [ ] **Step 3: Implement the handoff**

Add `workflow_call` and resolve the expected SHA from the reusable input or existing repository-dispatch payload. Preserve the existing manual and scheduled behaviour and all acceptance environment boundaries.

- [ ] **Step 4: Verify GREEN**

Run both focused workflow suites and confirm they pass.

### Task 3: Release operations and first-release gate

**Files:**
- Create: `docs/operations/production-beta-github-release.md`
- Modify: `docs/operations/commercial-onboarding-runbook.md`

**Interfaces:**
- Consumes: the release and acceptance workflow contracts.
- Produces: an operator procedure that identifies secret ownership, immutable-SHA proof, failure states, and the Product Owner gate.

- [ ] **Step 1: Extend governance tests with documentation assertions**

Require the runbook to name both protected environments, list only their approved credentials, document `PARTIAL RELEASE`, prohibit migration rollback/history repair, and state that the first release is blocked until Vercel automatic production deployment is constrained and Product Owner approval is recorded.

- [ ] **Step 2: Verify RED**

Run the release workflow test and confirm it fails on the missing runbook.

- [ ] **Step 3: Write the runbook**

Document setup, manual dispatch, exact SHA validation, migration/deployment/acceptance ordering, safe diagnostics, failure recovery, and the no-release implementation boundary.

- [ ] **Step 4: Verify GREEN**

Run the focused workflow tests and confirm they pass.

### Task 4: Integration verification and Vercel race assessment

**Files:**
- Modify only files above if verification exposes a defect.

**Interfaces:**
- Consumes: complete repository-controlled release infrastructure.
- Produces: verified workflow evidence and a read-only Vercel configuration finding for Product Owner review.

- [ ] **Step 1: Run focused workflow governance tests**

Run the release, onboarding governance, and existing acceptance workflow tests.

- [ ] **Step 2: Run workflow YAML parsing and secret scan**

Parse both workflows, confirm no credential literals or environment-file generation, and scan the changed files for secret patterns.

- [ ] **Step 3: Run full regression and production build**

Run `npm run test:ci:sharded` and `CI=true npm run build`.

- [ ] **Step 4: Inspect Vercel Git settings read-only**

Identify the connected repository and production branch without changing them. Determine the smallest supported change that prevents automatic production deployment while retaining useful previews.

- [ ] **Step 5: Stop before release**

Return the verified infrastructure and exact proposed Vercel configuration change for Product Owner approval. Do not configure credentials, apply migrations, deploy, or run the first release.
