# Production Beta Acceptance Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provision `info@flythefarm.com.au` as a tenant-scoped, least-privilege Production Beta acceptance identity and prove the unattended Client-to-Mission workflow and cleanup.

**Architecture:** A repository migration creates the `production_beta_acceptance` Fly The Farm role with an exact permission allowlist and reconciles an already-invited Supabase Auth identity into one membership, seat and operating-location assignment. Trusted operational commands recognise the role and restrict its creates to the controlled acceptance prefix and its archives to records whose authoritative create audit belongs to the same actor. GitHub acceptance validates the role before cleanup and workflow execution.

**Tech Stack:** PostgreSQL/Supabase migrations and RPCs, Node/Vercel trusted API, Playwright, Jest, GitHub Actions.

## Global Constraints

- The identity is Organisation-only; no Platform identity, Personnel record, licence, Break Glass or administrator role.
- Use normal Supabase invitation, password creation and organisation login.
- Keep RLS, tenant scope, operating-location scope, lifecycle gates, archive guards, audit and outbox unchanged.
- Never write the password to Git, logs, prompts, documentation or test artefacts.
- No service-role application bypass or hard deletion.

---

### Task 1: Least-privilege acceptance role and identity reconciliation

**Files:**
- Create: `supabase/migrations/20260806200000_production_beta_acceptance_identity.sql`
- Test: `src/__tests__/productionBetaAcceptanceIdentityMigration.test.js`

**Interfaces:**
- Consumes: existing `roles`, `permissions`, `role_permissions`, `auth.users`, `internal_users`, memberships, seats and location assignments.
- Produces: role code `production_beta_acceptance` and idempotent reconciliation for the single approved Fly The Farm Auth identity.

- [ ] Write a failing migration behaviour test that executes the migration in the PostgreSQL verifier and asserts the exact permission allowlist, one role, one membership, one active seat, assigned active locations, and absence of Platform/Personnel/admin identity.
- [ ] Run the focused test and confirm it fails because the migration does not exist.
- [ ] Add an idempotent, fail-closed migration that requires exactly one Fly The Farm organisation and exactly one matching Auth identity before reconciliation.
- [ ] Run the focused test and PostgreSQL verifier; confirm they pass.
- [ ] Commit only the migration and its tests.

### Task 2: Acceptance-owned operational records

**Files:**
- Modify: `server/operational-api.js`
- Modify: `server/operational-repository.js`
- Modify: `supabase/migrations/20260806200000_production_beta_acceptance_identity.sql`
- Test: `src/__tests__/trustedOperationalApi.test.js`
- Test: `src/__tests__/productionBetaAcceptanceIdentityMigration.test.js`

**Interfaces:**
- Consumes: request context roles and authoritative operational create audit events.
- Produces: acceptance create-prefix validation and actor-owned archive enforcement.

- [ ] Write failing API tests proving acceptance creates reject non-acceptance labels and acceptance archive rejects a record created by another actor.
- [ ] Write a failing database test proving the ownership rule is enforced within the trusted archive command.
- [ ] Run both tests and confirm the expected failures.
- [ ] Implement the smallest server and PostgreSQL guards while leaving ordinary users and delegated Support semantics unchanged.
- [ ] Run focused tests, migration lint, archive integrity verifier and regression suite.
- [ ] Commit only the ownership-boundary implementation and tests.

### Task 3: Secure activation and unattended acceptance

**Files:**
- Modify: `e2e/acceptance/auth.setup.ts`
- Modify: `e2e/acceptance/authDiagnostics.ts`
- Modify: `.github/workflows/production-beta-operational-acceptance.yml`
- Test: `e2e/acceptance/environment.spec.ts`
- Test: `src/__tests__/productionBetaAcceptanceWorkflow.test.js`

**Interfaces:**
- Consumes: protected GitHub Environment secrets and `/api/v1/session`.
- Produces: a fail-closed authority gate requiring exactly `production_beta_acceptance` and the approved permission set before cleanup.

- [ ] Write failing tests proving `admin`, Platform permissions, missing approved permissions and unrelated archive permissions all fail the authority gate.
- [ ] Implement the safe role/permission gate without logging identity or credential values.
- [ ] Invite and activate the approved Auth identity through Supabase Auth, then apply only the repository migration.
- [ ] Replace the two GitHub Environment secrets without printing either value.
- [ ] Deploy the committed source and confirm migrations are current.
- [ ] Run cleanup-only, confirm audit/outbox and active-register removal, then authentication-only, then the full unattended workflow.
- [ ] Verify genuine records remain active and acceptance records are archived; commit any final test-only corrections and push without rewriting history.
