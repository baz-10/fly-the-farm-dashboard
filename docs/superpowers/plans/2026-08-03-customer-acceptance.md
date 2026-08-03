# Customer Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace informal customer acknowledgement tracking with optional, immutable operator-recorded and securely customer-submitted acceptance evidence on completed Missions.

**Architecture:** Repository-controlled PostgreSQL tables and trusted RPCs hold append-only acceptance evidence, internal file versions, and hashed single-purpose link tokens. The existing versioned dispatcher delegates internal and public commands to focused handlers; React provides one Mission panel plus a bounded public acceptance page, with no provider SDK or business rules in UI/transport.

**Tech Stack:** PostgreSQL/Supabase RLS, Storage and repository-controlled migrations; Node/Vercel API dispatcher; React/TypeScript/Material UI; Jest, Testing Library and PGlite.

## Global Constraints

- Requirement ID: `NEW-MIS-002`.
- Customer Acceptance is optional and never gates Mission Completion.
- Acceptance evidence and claimed files are immutable; corrections append a record with `supersedes_acceptance_id`.
- Production Beta channels are operator recording and secure customer link; the evidence command remains portal-compatible.
- Secure-link submissions require explicit consent and immutable digital-signature evidence.
- Phone/verbal operator records require identity, method, acknowledgement time, operator and notes, but no signature.
- Tokens are random, stored only as SHA-256 hashes, expiring, revocable, single-purpose, rate-limited and replay-protected.
- Public responses expose only customer-safe Mission and Completion summary data.
- Internal files use IDs, immutable versions, checksums and provenance, never permanent provider URLs.
- Tenant, operating-location, permission, audit and transactional-outbox controls are mandatory.
- No browser storage, legacy persistence, hard-coded identities or synthetic production declarations.

---

### Task 1: Authoritative PostgreSQL evidence and secure-link model

**Files:**
- Create: `supabase/migrations/20260803210000_authoritative_customer_acceptance.sql`
- Create: `src/__tests__/authoritativeCustomerAcceptanceMigration.test.js`
- Create: `src/__tests__/authoritativeCustomerAcceptancePglite.test.js`

**Interfaces:**
- Produces `ftf_read_customer_acceptance(uuid,uuid)`, `ftf_create_customer_acceptance(uuid,uuid,uuid,jsonb)`, `ftf_issue_customer_acceptance_link(uuid,uuid,uuid,jsonb)`, `ftf_revoke_customer_acceptance_link(uuid,uuid,uuid,uuid,integer,text)`, `ftf_resolve_customer_acceptance_link(text,text)`, and `ftf_submit_customer_acceptance_link(text,text,jsonb)` RPCs.
- Produces append-only acceptance and file tables plus mutable, versioned secure-link lifecycle records.

- [ ] **Step 1: Write failing migration contract tests** asserting catalogues, permission seeds, tables, RLS, forced RLS, immutable triggers, RPC signatures, audit topics and outbox topics.
- [ ] **Step 2: Run** `CI=true npm test -- --watchAll=false src/__tests__/authoritativeCustomerAcceptanceMigration.test.js` **and verify RED because the migration is absent.**
- [ ] **Step 3: Write failing PGlite behaviour tests** covering every state and channel, Completion binding, method-specific validation, append-only enforcement, supersession, token expiry/revocation/replay/rate limits, concurrency, safe public summary, signature/file provenance, tenant/location denial, audit/outbox atomicity, and unchanged Completion/Outcomes.
- [ ] **Step 4: Run** `CI=true npm test -- --watchAll=false src/__tests__/authoritativeCustomerAcceptancePglite.test.js` **and verify RED.**
- [ ] **Step 5: Implement the migration** with repository-controlled state/method/channel catalogues, `customer_acceptance_records`, `customer_acceptance_files`, `customer_acceptance_links`, link-access events, indexes, append-only triggers, RLS and security-definer RPCs that explicitly set `search_path` and revoke public table access.
- [ ] **Step 6: Run both Task 1 suites until GREEN**, then run production schema regression suites.
- [ ] **Step 7: Commit** with `feat: add immutable Customer Acceptance evidence (NEW-MIS-002)`.

### Task 2: Trusted internal and bounded public APIs

**Files:**
- Modify: `server/operational-repository.js`
- Modify: `server/operational-api.js`
- Modify: `server/operational-dispatcher.js`
- Create: `src/services/customerAcceptanceApi.ts`
- Create: `src/services/__tests__/customerAcceptanceApi.test.ts`
- Create: `src/__tests__/customerAcceptanceOperationalApi.test.js`
- Modify: `src/__tests__/versionedApiDispatcher.test.js`

**Interfaces:**
- Produces internal resource `/api/v1/customer-acceptance` actions `read`, `record`, `file`, `link-issue`, `link-revoke`.
- Produces public resource `/api/v1/customer-acceptance-public` actions `resolve`, `signature`, `submit`.
- Produces typed `customerAcceptanceApi` methods for the Mission panel and public page.

- [ ] **Step 1: Write failing API tests** for authentication, permissions, location access, same-origin writes, payload validation, completion requirement, operator evidence, link issue/revoke, safe public resolve, signature validation, consent, replay, expiry, rate limit, conflicts, unsupported routes/actions and safe errors.
- [ ] **Step 2: Write failing typed-client and dispatcher tests** proving the two resources preserve the versioned public contract and use same-origin requests.
- [ ] **Step 3: Run Task 2 suites and verify RED.**
- [ ] **Step 4: Implement repository adapter methods** for the RPCs and storage-backed files/signatures using random internal IDs, SHA-256 checksums, opaque provider keys and cleanup on failed database claims.
- [ ] **Step 5: Implement focused internal/public handlers** with validation only in transport and business enforcement in trusted RPC/application boundaries; public resolve must project an explicit allow-list.
- [ ] **Step 6: Implement typed clients** without Supabase/provider dependencies.
- [ ] **Step 7: Run Task 2 suites until GREEN** and dispatcher regressions pass.
- [ ] **Step 8: Commit** with `feat: expose trusted Customer Acceptance API (NEW-MIS-002)`.

### Task 3: Mission panel and secure customer page

**Files:**
- Create: `src/components/mission/CustomerAcceptance.tsx`
- Create: `src/components/mission/__tests__/CustomerAcceptance.test.tsx`
- Create: `src/pages/CustomerAcceptancePublic.tsx`
- Create: `src/pages/CustomerAcceptancePublic.test.tsx`
- Modify: `src/pages/MissionPlanning.tsx`
- Modify: `src/App.tsx`
- Modify: `src/pages/MissionRemoteWorkflow.test.tsx`

**Interfaces:**
- Produces `<CustomerAcceptance missionId={string} />` after Mission Outcomes.
- Produces unauthenticated route `/customer-acceptance/:token` that can access only the bounded public API.

- [ ] **Step 1: Write failing Mission-panel tests** for optional empty state, immutable timeline, operator form, conditional signature/attachment evidence, link issue/copy/status/revoke, correction by supersession, permissions, and absence of edit/delete.
- [ ] **Step 2: Write failing public-page tests** for customer-safe summary, all four states, explicit consent, signer identity, signature capture, single submission, expired/revoked/consumed states, accessible errors and no internal data exposure.
- [ ] **Step 3: Run Task 3 suites and verify RED.**
- [ ] **Step 4: Implement the Mission panel** prefilled from authoritative customer/completion context, asking only for method, contact, state, time, comments and evidence required by that method.
- [ ] **Step 5: Implement the bounded public page** with explicit consent and signature canvas, then replace the form with an immutable confirmation after success.
- [ ] **Step 6: Wire the public route before authenticated application gates** and place the panel after Mission Outcomes without changing Completion or Outcome state.
- [ ] **Step 7: Run Task 3 and Mission workflow suites until GREEN**, including narrow mobile layout checks.
- [ ] **Step 8: Commit** with `feat: add Customer Acceptance workflows (NEW-MIS-002)`.

### Task 4: Production verification and deployment

**Files:**
- Modify only if verification identifies a defect in Task 1-3 files.

**Interfaces:**
- Consumes the complete schema, APIs and UI from Tasks 1-3.
- Produces a Ready Vercel production deployment and migrated linked Supabase Production Beta schema.

- [ ] **Step 1: Run focused Task 1-3 suites**, lint and production build.
- [ ] **Step 2: Run the full suite** with `CI=true npm test -- --watchAll=false --runInBand` and confirm zero failures.
- [ ] **Step 3: Verify Supabase CLI link is project `fzkrvglzompkuiodqllr` / Spray Command Production Beta before migration.**
- [ ] **Step 4: Apply repository migrations**, rerun migration verification and production API smoke checks.
- [ ] **Step 5: Deploy production through Vercel**, confirm Ready/alias state and smoke-test internal authentication plus safe public invalid-token behaviour.
- [ ] **Step 6: Perform controlled security acceptance** for expiry, revoke, replay, concurrency, tenant/location, immutability, audit and outbox without inserting synthetic customer declarations into Production.
- [ ] **Step 7: Present the deployed operator and customer forms for genuine Product Owner acceptance.** Genuine operator/customer submissions and signatures remain Product Owner-provided evidence.
- [ ] **Step 8: Commit any verified correction** with `fix: complete Customer Acceptance deployment (NEW-MIS-002)` and leave the worktree clean.

## Self-Review

- Spec coverage: every approved channel, state, permission, evidence rule, token control, UI boundary and acceptance criterion maps to Tasks 1-4.
- Placeholder scan: no deferred implementation language appears inside Production Beta scope.
- Type consistency: internal/public resources, RPCs, component names and route names remain stable across tasks.
