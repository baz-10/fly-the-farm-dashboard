# Authoritative Mission JSA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing Mission Checks workflow an immutable, policy-driven JSA decision engine that generates hazards and controls, supports assigned-PIC self-approval, and supplies precise grouped Mission Readiness evidence.

**Architecture:** Repository-controlled PostgreSQL owns published template/hazard/policy versions and immutable Mission JSA revisions. A trusted command evaluates bounded template rules, derives Mission hazard/control snapshots, validates risk and assigned Personnel, then saves or approves atomically with audit and outbox events. The existing React Mission Checks UI becomes a transport client of the versioned API and never persists locally.

**Tech Stack:** React 19, TypeScript, Material UI, Node/Vercel dynamic API dispatcher, PostgreSQL/Supabase, SQL RLS/RPC, Jest/Testing Library, PGlite.

## Global Constraints

- Preserve the existing 13 Mission Checks, terminology, layout and unsafe-answer polarity.
- Production Beta policy is `PIC_SELF_APPROVAL`, configured through a versioned organisation policy rather than hard-coded workflow logic.
- Every Draft save creates an immutable Mission JSA revision.
- Published template, Platform Hazard Library and organisation policy versions are immutable.
- Unsafe answers derive mandatory server-authoritative hazards and controls; clients cannot remove them.
- Residual score must be below the organisation policy threshold, default `6`, before approval.
- Approving identity is the assigned, member-linked authoritative PIC Personnel record; free-text approval is prohibited.
- Attachments use internal file IDs and versions, never provider URLs.
- Mission controls remain historical Mission evidence and are never mutable Platform Operational Knowledge.
- Readiness returns overall state, blockers, warnings, grouped categories, outstanding sections and completed sections.
- Tenant/location security is enforced by server authorisation and RLS.
- No MissionContext, local-storage or legacy JSA fallback.
- Requirements: `NEW-SAF-001`, `IMP-SAF-002`, `IMP-MIS-004`.

---

## File map

- `supabase/migrations/20260803010000_authoritative_mission_jsa.sql`: templates, hazards, policies, immutable revisions, trusted commands, RLS, permissions, audit/outbox.
- `scripts/verifyMissionJsaPostgres.mjs`: executable PostgreSQL behavioural proof.
- `server/operational-repository.js`: provider adapter methods for JSA RPCs.
- `server/operational-api.js`: versioned transport validation and permission checks.
- `server/operational-dispatcher.js`: `mission-jsa` dynamic resource registration.
- `src/types/missionJsa.ts`: transport types for templates, revisions, hazards, controls, approval and readiness.
- `src/services/missionJsaApi.ts`: frontend API client with no fallback.
- `src/components/mission/AuthoritativeMissionJsa.tsx`: existing Mission Checks workflow connected to the authoritative API.
- `src/pages/MissionPlanning.tsx`: JSA panel integration and removal of the JSA unavailable gate.
- Tests named below prove each boundary before implementation.

---

### Task 1: Database contract and immutable domain model

**Files:**
- Create: `src/__tests__/authoritativeMissionJsaMigration.test.js`
- Create: `supabase/migrations/20260803010000_authoritative_mission_jsa.sql`

**Interfaces:**
- Consumes: existing `organisations`, `missions`, `personnel`, `mission_personnel_revisions`, `mission_personnel_assignments`, `internal_users`, `audit_events`, `transactional_outbox`.
- Produces: `ftf_read_mission_jsa`, `ftf_save_mission_jsa`, `ftf_approve_mission_jsa`, `ftf_evaluate_mission_jsa_readiness`.

- [ ] **Step 1: Write the failing migration contract test** asserting tables `platform_jsa_templates`, `platform_jsa_template_versions`, `platform_hazards`, `platform_hazard_versions`, `organisation_jsa_policies`, `organisation_jsa_policy_versions`, `mission_jsa_revisions`, `mission_jsa_responses`, `mission_hazard_instances`, `mission_risk_control_instances`, `mission_jsa_attachments`, and `mission_jsa_approvals`; permission codes; immutable constraints; RLS; trusted RPCs; audit and outbox tokens.
- [ ] **Step 2: Run RED** with `CI=true npm test -- --runInBand src/__tests__/authoritativeMissionJsaMigration.test.js`; expect missing migration failure.
- [ ] **Step 3: Create versioned platform tables** with stable IDs, monotonically increasing versions, jurisdiction/reference/regulation JSON, published/retired metadata and service-role-only writes.
- [ ] **Step 4: Create immutable Mission revision tables** with composite organisation foreign keys, exact template/hazard/policy snapshots, response/hazard/control/attachment/approval children and no update/delete path for authenticated clients.
- [ ] **Step 5: Add policy provisioning** so every organisation receives version 1 `PIC_SELF_APPROVAL`, residual threshold `6`, bounded approval rule JSON and no identity-specific values.
- [ ] **Step 6: Add permissions** `mission.jsa.read`, `mission.jsa.write`, `mission.jsa.approve`; grant read/write to organisation admins but keep approval policy checks authoritative and do not create reviewer identities.
- [ ] **Step 7: Add RLS and grants** so tenant Mission evidence is selectable only by organisation access, platform published knowledge is read through trusted functions, and all writes are service-role RPC transactions.
- [ ] **Step 8: Run GREEN** with the focused migration test.
- [ ] **Step 9: Commit** with `git commit -m "feat: add authoritative JSA schema (NEW-SAF-001 IMP-SAF-002)"`.

### Task 2: Rule engine, derivation and save command

**Files:**
- Modify: `supabase/migrations/20260803010000_authoritative_mission_jsa.sql`
- Create: `scripts/verifyMissionJsaPostgres.mjs`
- Modify: `src/__tests__/authoritativeMissionJsaMigration.test.js`

**Interfaces:**
- Consumes: JSON payload `{responses, hazards, controls, attachments, generalComments}` and expected revision.
- Produces: immutable revision JSON containing derived `responses`, `hazards`, `controls`, `attachments`, `templateVersion`, and `policyVersion`.

- [ ] **Step 1: Extend RED tests** for bounded rule operators `all`, `any`, `equals`, `notEquals`, `in`, `answeredUnsafe`; existing unsafe-answer polarity; platform hazard references; server-generated control rejection; optimistic concurrency and location denial.
- [ ] **Step 2: Run RED** and confirm missing derivation behavior.
- [ ] **Step 3: Seed platform template version 1** with the exact 13 existing questions and unsafe-answer values from `MISSION_CHECKS`, each linked to a versioned Platform Hazard Library entry and typical control specification.
- [ ] **Step 4: Implement bounded rule evaluation** in trusted SQL functions that accept only declared operators and Mission/JSA facts; unknown operators fail atomically.
- [ ] **Step 5: Implement `ftf_save_mission_jsa`** to lock the Mission, verify tenant/location and Planning lifecycle, compare expected version, calculate applicability, require mandatory responses, derive hazard/control snapshots, validate submitted assessments/owners/evidence, and insert one immutable aggregate revision.
- [ ] **Step 6: Preserve trigger context** by snapshotting full question text, response notes, Platform Hazard version, category, typical controls and derivation provenance into Mission instances.
- [ ] **Step 7: Write audit/outbox atomically** using `mission.jsa_saved` and `operational.mission.jsa_saved` with revision/template/policy versions.
- [ ] **Step 8: Implement `ftf_read_mission_jsa`** for current and full history without resolving snapshots against mutable platform rows.
- [ ] **Step 9: Build PGlite verifier** that creates a real tenant/location/Mission/PIC, saves safe and unsafe answers, proves generated hazards/controls, rejects removed controls and stale/cross-location writes, and confirms historical revision immutability plus audit/outbox.
- [ ] **Step 10: Run GREEN** with the contract test and `node scripts/verifyMissionJsaPostgres.mjs`.
- [ ] **Step 11: Commit** with `git commit -m "feat: derive immutable mission JSA revisions (NEW-SAF-001 IMP-MIS-004)"`.

### Task 3: Policy-driven PIC approval

**Files:**
- Modify: `supabase/migrations/20260803010000_authoritative_mission_jsa.sql`
- Modify: `scripts/verifyMissionJsaPostgres.mjs`
- Modify: `src/__tests__/authoritativeMissionJsaMigration.test.js`

**Interfaces:**
- Consumes: `ftf_approve_mission_jsa(org, actor, mission, revision, expectedVersion)`.
- Produces: approval snapshot and a new immutable approved JSA revision or immutable approval attached to the exact revision, with policy satisfaction evidence.

- [ ] **Step 1: Write RED cases** for assigned member-linked PIC approval, non-PIC denial, unlinked Personnel denial, residual-risk denial, incomplete-control denial, stale approval conflict and identity-neutral policy rules.
- [ ] **Step 2: Run RED** and confirm approval function is absent/incomplete.
- [ ] **Step 3: Implement policy evaluator** supporting `PIC_SELF_APPROVAL`, `PIC_PLUS_REVIEWER`, `DUAL_APPROVAL` and `RISK_BASED` rule structures while executing only Production Beta PIC self-approval.
- [ ] **Step 4: Implement `ftf_approve_mission_jsa`** to resolve the latest authoritative PIC assignment, require actor↔Personnel membership linkage, validate approval permission, evaluate readiness, and persist Personnel ID/version/role/credential/policy/timestamp snapshots.
- [ ] **Step 5: Write audit/outbox atomically** using `mission.jsa_approved` and `operational.mission.jsa_approved`.
- [ ] **Step 6: Extend verifier** to prove PIC approval succeeds, a non-PIC fails, later Personnel/credential/template changes do not alter the approval snapshot, and later Draft revisions do not mutate approved history.
- [ ] **Step 7: Run GREEN** with focused tests and verifier.
- [ ] **Step 8: Commit** with `git commit -m "feat: enforce policy-driven PIC JSA approval (NEW-SAF-001 IMP-SAF-002)"`.

### Task 4: Grouped JSA readiness engine

**Files:**
- Modify: `supabase/migrations/20260803010000_authoritative_mission_jsa.sql`
- Modify: `scripts/verifyMissionJsaPostgres.mjs`
- Create: `src/__tests__/missionJsaReadinessContract.test.js`

**Interfaces:**
- Produces `ftf_evaluate_mission_jsa_readiness(org, mission)` → `{overallState, ready, blockers, warnings, categories, outstandingSections, completedSections, revisionId, templateVersion, policyVersion}`.

- [ ] **Step 1: Write RED contract cases** for `NOT_STARTED`, `INCOMPLETE`, `BLOCKED`, `WARNING`, `READY`; stable category codes Questions, Hazards, Controls, Attachments, Risk, Approval; related entity IDs and section lists.
- [ ] **Step 2: Run RED** and confirm grouped readiness contract is missing.
- [ ] **Step 3: Implement readiness evaluation** for applicable questions, hazard assessments, derived controls, owners, mitigation, completion, evidence, residual threshold, approvals and policy satisfaction.
- [ ] **Step 4: Ensure precise messages** such as `QUESTION_UNANSWERED`, `HAZARD_UNASSESSED`, `CONTROL_OWNER_MISSING`, `CONTROL_INCOMPLETE`, `CONTROL_EVIDENCE_MISSING`, `RESIDUAL_RISK_TOO_HIGH`, `JSA_NOT_APPROVED`, and `APPROVAL_POLICY_UNSATISFIED`.
- [ ] **Step 5: Extend PGlite verifier** through each readiness state and assert grouped outstanding/completed sections.
- [ ] **Step 6: Run GREEN** with contract tests and verifier.
- [ ] **Step 7: Commit** with `git commit -m "feat: explain grouped JSA readiness (NEW-SAF-001 IMP-MIS-004)"`.

### Task 5: Versioned API dispatcher and repository adapters

**Files:**
- Create: `src/__tests__/missionJsaOperationalApi.test.js`
- Modify: `server/operational-repository.js`
- Modify: `server/operational-api.js`
- Modify: `server/operational-dispatcher.js`

**Interfaces:**
- Route: `GET /api/v1/mission-jsa?missionId=&history=`.
- Route: `POST /api/v1/mission-jsa?missionId=` save.
- Route: `POST /api/v1/mission-jsa?missionId=&action=approve` approve.
- Route: `GET /api/v1/mission-jsa?missionId=&action=readiness` readiness.

- [ ] **Step 1: Write failing API tests** for routing, auth, permissions, location isolation, read/history, save, approve, readiness, validation, unsupported action, stale conflict and failure envelopes.
- [ ] **Step 2: Run RED** with the focused API and dispatcher tests.
- [ ] **Step 3: Add repository methods** delegating only to trusted JSA RPCs and mapping PostgreSQL sentinel results to application outcomes.
- [ ] **Step 4: Add `createMissionJsaHandler`** with bounded body-size/request-shape validation and permission checks; keep rule/risk/policy logic out of transport code.
- [ ] **Step 5: Register `mission-jsa`** in the existing dynamic dispatcher without adding a Vercel function.
- [ ] **Step 6: Run GREEN** with API and dispatcher regression tests.
- [ ] **Step 7: Commit** with `git commit -m "feat: expose versioned mission JSA API (NEW-SAF-001 IMP-MIS-004)"`.

### Task 6: Frontend API and preserved Mission Checks workflow

**Files:**
- Create: `src/types/missionJsa.ts`
- Create: `src/services/missionJsaApi.ts`
- Create: `src/components/mission/AuthoritativeMissionJsa.tsx`
- Create: `src/components/mission/__tests__/AuthoritativeMissionJsa.test.tsx`
- Modify: `src/pages/MissionPlanning.tsx`
- Modify: `src/pages/MissionRemoteWorkflow.test.tsx`

**Interfaces:**
- `createMissionJsaApi()` exposes `read`, `save`, `approve`, `readiness`.
- `<AuthoritativeMissionJsa missionId operatingLocationId />` owns no browser persistence.

- [ ] **Step 1: Write failing component tests** asserting all 13 existing questions, polarity-triggered controls, per-question notes, general comments, risk inputs, owner Personnel selection, evidence references, draft save, grouped readiness, PIC approval, conflict/error messaging and absence of storage APIs/free-text approver.
- [ ] **Step 2: Run RED** and confirm component/service does not exist.
- [ ] **Step 3: Define strict transport types** matching database JSON keys at one mapping boundary.
- [ ] **Step 4: Implement API client** using same-origin fetch, typed errors and no fallback.
- [ ] **Step 5: Implement authoritative component** by preserving the current `MissionJsaDialog` questions/layout/labels, replacing local callbacks with read/save/approve API actions, deriving UI controls from server-provided revision, and showing grouped readiness categories.
- [ ] **Step 6: Resolve control owners** from authoritative Personnel at the Mission operating location; display the assigned PIC snapshot returned by the server and provide no approver textbox.
- [ ] **Step 7: Integrate into Mission planner** as the JSA panel and remove only `JSA` from the unavailable list/copy.
- [ ] **Step 8: Run GREEN** with component and Mission workflow tests.
- [ ] **Step 9: Run `npm run build`** and correct only new warnings/errors.
- [ ] **Step 10: Commit** with `git commit -m "feat: connect authoritative JSA to mission planner (NEW-SAF-001 IMP-MIS-004)"`.

### Task 7: Full verification, controlled migration and deployment

**Files:**
- Modify only files required by defects exposed during verification, with a failing regression test first.

**Interfaces:**
- Produces a deployed authoritative JSA capability on the existing Production Beta URL.

- [ ] **Step 1: Run complete tests** with `CI=true npm test -- --runInBand` and record suite/test totals.
- [ ] **Step 2: Run lint and build** with `npm run lint && npm run build`.
- [ ] **Step 3: Run PostgreSQL proof** with `node scripts/verifyMissionJsaPostgres.mjs`.
- [ ] **Step 4: Confirm linked project exactly** with `test "$(cat supabase/.temp/project-ref)" = "fzkrvglzompkuiodqllr"` before remote schema change.
- [ ] **Step 5: Apply migration** with `npx supabase db push --linked --include-all` only after Steps 1–4 pass.
- [ ] **Step 6: Push branch** with `git push spray-command codex/production-beta` and deploy through the connected Git workflow; verify the Ready deployment and production alias.
- [ ] **Step 7: Run unauthenticated API smoke** and confirm `/api/v1/mission-jsa` returns `401 UNAUTHENTICATED`, not 404/503.
- [ ] **Step 8: Commit any test-first verification repair** with requirement IDs.

### Task 8: Deployed operational acceptance

**Files:**
- No production-code change unless acceptance reveals a reproducible defect; add a failing regression test before fixing it.

- [ ] **Step 1: Open the accepted real Mission** and complete the existing 13 Mission Checks through the deployed frontend.
- [ ] **Step 2: Set at least one unsafe answer** and confirm the correct hazard/control appears with trigger context.
- [ ] **Step 3: Assign control ownership, mitigation and residual risk** and confirm readiness blockers change precisely.
- [ ] **Step 4: Save Draft and reopen** after refresh, logout/login and an authorised second session.
- [ ] **Step 5: Approve as the assigned member-linked PIC** and confirm a non-PIC cannot approve.
- [ ] **Step 6: Demonstrate concurrency** by attempting a stale save from a second session.
- [ ] **Step 7: Demonstrate tenant/location isolation** and confirm no misleading local evidence is created after denial.
- [ ] **Step 8: Confirm PostgreSQL evidence** for template/hazard/policy snapshots, immutable revision/history, PIC approval, audit and outbox.
- [ ] **Step 9: Create a later Draft revision** and confirm the approved historical revision remains unchanged.
- [ ] **Step 10: Report the operational milestone**: what Fly The Farm can now do, which manual JSA process is eliminated, and the next blocker in Triggered Risk Controls → Mission Readiness → Authorisation → Mission Pack.
