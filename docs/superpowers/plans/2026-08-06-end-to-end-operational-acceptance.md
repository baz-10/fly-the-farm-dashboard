# End-to-End Operational Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, run, deploy, and prove a repeatable browser-driven Production Beta acceptance chain from Client creation through an authoritative Draft Mission, while verifying later lifecycle gates against genuine evidence only.

**Architecture:** Add Playwright as the real-browser acceptance layer above the existing React, trusted API, and PostgreSQL stack. Browser tests use a dedicated environment-supplied organisation account, uniquely prefixed acceptance records, direct user-visible workflows, and an explicit cleanup ledger; existing Jest and PostgreSQL suites remain the lower-level regression layers. No browser storage, mocked production persistence, synthetic regulatory evidence, or parallel Mission implementation is introduced.

**Tech Stack:** React 19, TypeScript 4.9, Material UI 7, Playwright Test, Jest/React Testing Library, trusted `/api/v1/*` API, Supabase PostgreSQL, Vercel.

## Global Constraints

- Use the existing isolated `/Users/bjt/Documents/Fly The Farm Dashboard/.worktrees/production-beta` worktree on `codex/production-beta`.
- Every acceptance record must begin `SC ACCEPTANCE —` and must be archived after verification.
- Never fabricate ReOC, Operations Manual, Personnel credentials, observed weather, signed JSA, final aircraft output, Customer Outcomes, or Mission Outcomes.
- Restart from the earliest affected phase after any defect correction.
- Preserve authoritative APIs, permissions, RLS, tenant/location scope, audit, outbox, immutable evidence, and Mission lifecycle semantics.
- A future stage must remain visibly gated when genuine evidence is absent.
- Do not expose credentials in source, logs, screenshots, reports, or commits.

---

### Task 1: Establish the browser acceptance runner

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `playwright.config.ts`
- Create: `e2e/acceptance/environment.ts`
- Create: `e2e/acceptance/auth.setup.ts`
- Create: `e2e/acceptance/environment.spec.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `E2E_BASE_URL`, `E2E_ORGANISATION_EMAIL`, and `E2E_ORGANISATION_PASSWORD` from the execution environment.
- Produces: authenticated Playwright storage state at `test-results/.auth/organisation.json` and `npm run test:e2e`.

- [ ] Write an environment test that fails unless the production origin, non-secret acceptance prefix, and authentication setup contract are configured.
- [ ] Run `npm run test:e2e -- e2e/acceptance/environment.spec.ts` and confirm RED because the runner does not exist.
- [ ] Add Playwright Test, browser configuration, secret-safe environment validation, authentication setup, artefact retention, and ignored local state.
- [ ] Re-run the environment test and confirm GREEN without printing secret values.
- [ ] Commit with `IMP-OPS-001 establish browser acceptance runner`.

### Task 2: Prove the authoritative parent chain in a real browser

**Files:**
- Create: `e2e/acceptance/fixtures/acceptanceRecords.ts`
- Create: `e2e/acceptance/client-to-mission.spec.ts`
- Modify only if a defect is exposed: the smallest affected file under `src/`, `server/`, or `supabase/migrations/`
- Add the corresponding focused regression test beside any corrected production file.

**Interfaces:**
- Consumes: authenticated storage state and the live `/missions/new` workflow.
- Produces: Client, Property, Field, Job, and Planning Mission IDs recorded in a per-run cleanup ledger.

- [ ] Write the browser test for Client create/reopen, Property address selection and explicit confirmation, Field boundary creation/reopen, Job inheritance, and Draft Mission creation.
- [ ] Run the test and confirm RED at the first missing or broken browser behaviour.
- [ ] Correct only the exposed defect, first adding a focused Jest regression test and watching it fail.
- [ ] Re-run from the earliest affected phase until the full Client → Property → Field → Job → Draft Mission chain passes.
- [ ] Verify refresh and a fresh authenticated browser context reopen the persisted chain.
- [ ] Commit with the Requirement ID covering each defect or `IMP-OPS-001 prove authoritative browser chain` when no production correction is needed.

### Task 3: Prove validation, state preservation, maps, and non-linear Mission navigation

**Files:**
- Create: `e2e/acceptance/operator-resilience.spec.ts`
- Modify only if defects are exposed: focused UI files and their existing Jest tests.

**Interfaces:**
- Consumes: acceptance chain fixtures and saved Draft Mission.
- Produces: evidence for inline validation, preserved inputs, map viewport/layer retention, explicit location confirmation, and accessible stage navigation.

- [ ] Write failing browser scenarios for incomplete Client, unconfirmed Property location, failed-save state retention, pin movement without zoom/layer reset, boundary draw/upload controls, blocked future stages, earlier-stage reopening, keyboard navigation, and mobile viewport.
- [ ] Run each scenario to confirm the intended RED failure before changing production code.
- [ ] Apply minimal corrections using the existing form, map, and Mission Workspace architecture.
- [ ] Re-run each corrected scenario from its earliest affected phase and confirm GREEN.
- [ ] Commit each independently meaningful correction with its PRC Requirement ID.

### Task 4: Prove security and lifecycle truth

**Files:**
- Create: `e2e/acceptance/security-and-lifecycle.spec.ts`
- Create: `scripts/verifyOperationalAcceptanceEvidence.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: acceptance record IDs, trusted API session, and an optional second-tenant credential pair supplied only through environment variables.
- Produces: redacted assertions for location scope, tenant denial, audit/outbox presence, no legacy fallback, and correct human-evidence gates.

- [ ] Write browser/API assertions proving no local-storage persistence, operating-location enforcement, unauthorised access denial, visible readiness reasons, and locked post-authorisation stages.
- [ ] Add PostgreSQL/API evidence verification for parent relationships, audit events, and transactional outbox without printing record contents or credentials.
- [ ] Confirm the security test fails closed when second-tenant credentials are absent and reports that check as an external acceptance prerequisite rather than passing it silently.
- [ ] Run against available authorised sessions and correct any exposed defect test-first.
- [ ] Commit with `IMP-OPS-001 verify operational security and lifecycle gates`.

### Task 5: Archive acceptance records and retain evidence

**Files:**
- Create: `e2e/acceptance/cleanup.spec.ts`
- Create: `e2e/acceptance/acceptance-ledger.ts`
- Modify: `e2e/acceptance/fixtures/acceptanceRecords.ts`

**Interfaces:**
- Consumes: the per-run IDs created by Task 2.
- Produces: archived Mission, Job, Field, Property, and Client acceptance records with an auditable cleanup result.

- [ ] Write the cleanup test and prove it fails while active prefixed records remain.
- [ ] Implement reverse-order archive through the supported UI/API commands, never direct destructive SQL.
- [ ] Verify archived records disappear from operational views while audit history remains.
- [ ] Re-run cleanup idempotently and confirm no active `SC ACCEPTANCE —` records remain from the run.
- [ ] Commit with `IMP-OPS-001 archive operational acceptance records`.

### Task 6: Full regression, deployment, and live rerun

**Files:**
- Modify only if verification exposes a defect: the affected implementation and regression tests.

**Interfaces:**
- Consumes: all lower-level and browser suites.
- Produces: deployed Production Beta evidence for the governing directive.

- [ ] Run all Jest suites in bounded groups, the production build, migration lint/status, secret scan, and the complete Playwright suite.
- [ ] Confirm the remote is exactly `BJT-FTF/Spray-Command`, branch is `codex/production-beta`, Supabase is Production Beta, and Vercel is `spray-command-production-beta`.
- [ ] Push without force, apply repository-controlled migrations only if any exist, and deploy the exact committed source.
- [ ] Wait for READY, run production smoke tests, then rerun the entire browser chain against the canonical Production URL.
- [ ] Archive acceptance records and confirm the worktree is clean and synced.
- [ ] Report operational capability, deployed SHA, deployment ID, URL, phase-by-phase results, defects fixed, security evidence, cleanup, and genuine human-evidence blockers only.

