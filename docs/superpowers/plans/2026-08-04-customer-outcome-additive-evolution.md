# Customer Outcome Additive Evolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve the deployed Customer Acceptance workflow into Customer Outcome with structured satisfaction, follow-up, photos, acknowledgement and optional signature while preserving internal contracts and historical evidence.

**Architecture:** One additive repository migration extends existing append-only records and file evidence with constrained first-class fields and trusted RPC replacements. Existing versioned API resources remain stable; server commands validate and atomically claim staged files, while the internal Mission panel and bounded public page adopt Customer Outcome terminology and the same structured form.

**Tech Stack:** PostgreSQL/Supabase migrations, RLS and Storage; Node/Vercel API dispatcher; React/TypeScript/Material UI; Jest, Testing Library and PGlite.

## Global Constraints

- Requirement ID remains `NEW-MIS-002`.
- User-facing name is `Customer Outcome`; internal `customer_acceptance_*` contracts remain stable.
- Historical evidence is never rewritten or backfilled.
- New outcomes require a summary, a repository-controlled satisfaction code and an explicit follow-up decision.
- Follow-up true requires a valid date; follow-up false does not.
- Signature is optional for every channel.
- Photos and signatures use internal file IDs, immutable versions, SHA-256 checksums and provenance.
- Customer Outcome is optional and never changes Mission Completion or Mission Outcome Observations.
- Tenant, operating-location, permission, RLS, audit, outbox, replay and immutability controls remain mandatory.
- No browser storage, provider URLs, legacy persistence or synthetic production declarations.

---

### Task 1: Additive authoritative schema and trusted commands

**Files:**
- Create: `supabase/migrations/20260804000000_customer_outcome_additive_evolution.sql`
- Create: `src/__tests__/customerOutcomeAdditiveMigration.test.js`
- Modify: `src/__tests__/authoritativeCustomerAcceptanceMigration.test.js`

**Interfaces:**
- Preserves existing RPC signatures and replaces their bodies with structured Customer Outcome validation.
- Adds `customer_outcome_satisfaction_levels` and nullable historical columns on `customer_acceptance_records`.
- Extends `customer_acceptance_files.kind` to `OUTCOME_PHOTO | SIGNATURE | ATTACHMENT` and adds caption, capture timestamp and access classification.

- [ ] **Step 1: Write failing migration contract tests** asserting all five catalogue values, additive columns, conditional follow-up constraint, file provenance fields, optional signature semantics, historical nullability, immutable triggers, atomic audit/outbox and unchanged RPC signatures.
- [ ] **Step 2: Run** `CI=true npm test -- --watchAll=false --runInBand src/__tests__/customerOutcomeAdditiveMigration.test.js` **and verify RED because the migration is absent.**
- [ ] **Step 3: Implement the migration** using `alter table` and `create or replace function`, without updates to historical evidence.
- [ ] **Step 4: Run migration contract and production schema suites until GREEN.**
- [ ] **Step 5: Commit** `feat: evolve immutable Customer Outcome evidence (NEW-MIS-002)`.

### Task 2: File staging and server-authoritative API validation

**Files:**
- Modify: `server/operational-repository.js`
- Modify: `server/operational-api.js`
- Modify: `src/services/customerAcceptanceApi.ts`
- Modify: `src/__tests__/customerAcceptanceOperationalApi.test.js`
- Modify: `src/services/__tests__/customerAcceptanceApi.test.ts`

**Interfaces:**
- Preserves `/api/v1/customer-acceptance` and `/api/v1/customer-acceptance-public`.
- Internal `file` action stages `OUTCOME_PHOTO` or `SIGNATURE` for an authenticated actor.
- Public `file` action stages bounded outcome photos or signatures through the secure token.
- `record` and `submit` accept `outcomeSummary`, `satisfactionCode`, `followUpRequested`, `followUpDate`, `pendingFileIds` and optional `signatureFileId`.

- [ ] **Step 1: Write failing handler/client tests** for all satisfaction codes, unknown-code rejection, follow-up conditional validation, optional signature, photo limits/content types, permission/location scope, token-bound files, unsupported actions and Customer Outcome error copy.
- [ ] **Step 2: Run Task 2 tests and verify RED.**
- [ ] **Step 3: Implement repository staging adapters** using opaque storage keys, checksums, actor/token ownership, metadata and cleanup after failed claims.
- [ ] **Step 4: Implement transport validation and stable typed-client methods** while leaving business validation in trusted RPCs.
- [ ] **Step 5: Run Task 2 and dispatcher regressions until GREEN.**
- [ ] **Step 6: Commit** `feat: extend trusted Customer Outcome API (NEW-MIS-002)`.

### Task 3: Customer Outcome Mission and secure-link workflows

**Files:**
- Modify: `src/components/mission/CustomerAcceptance.tsx`
- Modify: `src/components/mission/__tests__/CustomerAcceptance.test.tsx`
- Modify: `src/pages/CustomerAcceptancePublic.tsx`
- Modify: `src/pages/CustomerAcceptancePublic.test.tsx`
- Modify: `src/services/customerAcceptanceApi.ts`

**Interfaces:**
- Keeps internal component/file names for compatibility.
- Renders only Customer Outcome terminology.
- Produces one structured operator form and one customer-safe secure-link form.

- [ ] **Step 1: Write failing component tests** for renamed headings/buttons/messages, five-level satisfaction, outcome summary, follow-up date reveal/requirement, optional photos, optional signature, acknowledgement fields, historical “Not recorded”, timeline, and correction reason.
- [ ] **Step 2: Run Task 3 tests and verify RED.**
- [ ] **Step 3: Implement the operator workflow** with responsive fields, staged file summaries and one immutable submission.
- [ ] **Step 4: Implement the secure-link workflow** with customer-safe context, optional photo/signature staging and single-use submission.
- [ ] **Step 5: Run component, App and Mission workflow regressions until GREEN.**
- [ ] **Step 6: Commit** `feat: rename and extend Customer Outcome workflow (NEW-MIS-002)`.

### Task 4: Production migration, deployment and genuine acceptance gate

**Files:**
- Modify only Task 1-3 files if verification finds a defect.

**Interfaces:**
- Produces migrated Production Beta schema and a Ready Vercel deployment.

- [ ] **Step 1: Run focused suites, full 113+ suite regression and production build.**
- [ ] **Step 2: Confirm Supabase CLI remains linked to `fzkrvglzompkuiodqllr` / Spray Command Production Beta.**
- [ ] **Step 3: Dry-run and apply only `20260804000000_customer_outcome_additive_evolution.sql`.**
- [ ] **Step 4: Deploy the verified commit to Vercel production and confirm Ready alias state.**
- [ ] **Step 5: Smoke-test unauthenticated public-link failure, authenticated Mission rendering and the complete Customer Outcome form without submitting synthetic evidence.**
- [ ] **Step 6: Verify migration history, worktree cleanliness, audit/outbox test coverage, and preserved Completion/Outcomes tests.**
- [ ] **Step 7: Leave the deployed form ready for genuine Product Owner evidence.**

## Self-Review

- Spec coverage: Tasks 1-4 cover every approved structured field, both channels, historical compatibility, file provenance, correction, isolation and deployment requirement.
- Placeholder scan: no deferred work exists inside the approved Production Beta scope.
- Type consistency: existing API resources and component names remain stable; new payload keys are identical across schema, server, client and UI tasks.
