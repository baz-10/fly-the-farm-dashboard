# CASA Compliance and Checklists Pre-Freeze Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the authoritative Australian CASA Compliance command centre, Personnel certificate evidence, Checklist Builder, Mission readiness integration, and grouped navigation required before architecture freeze.

**Architecture:** Add dedicated tenant-scoped CASA Compliance and Checklist bounded contexts that reference existing Personnel, Aircraft, Mission, file, audit, outbox, notification, and report artefact records. Use repository-controlled PostgreSQL functions for authoritative writes and readiness evaluation, thin `/api/v1/*` dispatcher handlers, and React workspaces that never fall back to browser persistence.

**Tech Stack:** React 19, TypeScript 4.9, Material UI 7, Node/Vercel server functions, Supabase-managed PostgreSQL, PostgreSQL RLS, Jest/Testing Library, PGlite migration tests.

## Global Constraints

- No duplicate Personnel, Aircraft, Mission, file, audit, outbox, notification, or report models.
- RePL is non-expiring; never require or fabricate an expiry date.
- AROC expiry is optional and evidence-driven; display `No expiry recorded` when absent.
- Published compliance rules, controlled-document versions, checklist template versions, checklist submissions, and Mission evidence are immutable.
- Corrective actions are mutable work records and never rewrite checklist evidence.
- Internal file IDs, versions, SHA-256 checksums, and provenance are mandatory; provider URLs are never domain identifiers.
- Every authoritative write is tenant scoped, permission checked, optimistic-concurrency protected, audited, and accompanied by an atomic transactional-outbox event.
- RLS remains enabled and forced. No browser/local-storage persistence fallback.
- Existing `/jobs` domain, APIs, and URLs remain unchanged while navigation exposes Clients, Properties, Fields, and Jobs.
- Use RED → verify RED → GREEN → verify GREEN for every production change.
- Commit each independently green task with the governing Requirement ID.

---

## File Structure

### Repository-controlled database

- Create `supabase/migrations/20260805120000_casa_compliance_foundation.sql`: country pack, rules, organisation profile, instruments, controlled documents, training, renewals, permissions, RLS, commands, audit/outbox.
- Create `supabase/migrations/20260805130000_personnel_casa_credentials.sql`: ARN and versioned RePL/AROC credential/evidence extensions and eligibility RPC.
- Create `supabase/migrations/20260805140000_authoritative_checklists.sql`: checklist catalogues/templates/versions/items/requirements/executions/sign-offs/corrective actions and readiness RPCs.
- Create `supabase/migrations/20260805150000_casa_compliance_pack.sql`: indexed compliance export manifest and report-artefact command.

### Server/application boundary

- Create `server/compliance-repository.js`: maps trusted requests to compliance RPCs and read models.
- Create `server/checklist-repository.js`: maps trusted requests to checklist RPCs and read models.
- Create `server/compliance-api.js`: thin compliance and credential handlers.
- Create `server/checklist-api.js`: thin template, execution, corrective-action, and readiness handlers.
- Modify `server/operational-dispatcher.js`: preserve `/api/v1/*` while adding resources.
- Modify `server/operational-api.js`: consume checklist readiness in Mission readiness only through repository service boundaries.
- Modify `server/operational-repository.js`: expose the combined readiness and Personnel eligibility RPCs.

### Frontend

- Create `src/navigation/organisationNavigation.tsx`: grouped route metadata and active-group matching.
- Modify `src/components/Layout.tsx`: accessible responsive accordion rendering.
- Modify `src/App.tsx`: new workspace routes and discoverable Client resource aliases/views without changing Job URLs.
- Create `src/services/complianceApi.ts`, `src/services/checklistApi.ts`, and `src/types/compliance.ts`, `src/types/checklists.ts`.
- Create `src/pages/CasaCompliance.tsx` with focused components in `src/components/compliance/`.
- Modify `src/pages/Personnel.tsx`, `src/components/personnel/PersonnelCredentialEditor.tsx`, and `src/components/mission/MissionPersonnelSelector.tsx`.
- Create `src/pages/Checklists.tsx` and focused components in `src/components/checklists/`.
- Modify `src/pages/MissionPlanning.tsx` to display selected lifecycle checklists and precise blockers.

### Tests and verification

- Add focused Jest tests under `src/__tests__/`, component tests beside components, PGlite migration tests, and `scripts/verifyCasaComplianceChecklistsPostgres.mjs`.

---

### Task 1: Grouped operational navigation

**Files:**
- Create: `src/navigation/organisationNavigation.tsx`
- Modify: `src/components/Layout.tsx`
- Modify: `src/App.tsx`
- Test: `src/components/__tests__/LayoutNavigation.test.tsx`

**Interfaces:**
- Produces: `ORGANISATION_NAV_GROUPS: NavigationGroup[]` and `findActiveNavigationGroup(pathname: string): string | null`.
- Preserves: all current route paths, including `/jobs` and nested Client/Property/Field/Job routes.

- [ ] **Step 1: Write failing navigation tests** asserting the CLIENTS accordion exposes `Clients`, `Properties`, `Fields`, and `Jobs`; nested `/jobs/client/...` paths expand CLIENTS; keyboard activation works; mobile rendering contains the same links; Guided Mission route helpers return the existing nested URLs.
- [ ] **Step 2: Verify RED** with `CI=true npm test -- --runInBand src/components/__tests__/LayoutNavigation.test.tsx` and confirm the grouped navigation exports are missing.
- [ ] **Step 3: Implement route metadata** with stable group IDs (`home`, `clients`, `operations`, `fleet`, `people`, `compliance`, `intelligence`, `reports`, `organisation`) and four distinct CLIENTS destinations that use existing route/query views rather than new domain endpoints.
- [ ] **Step 4: Implement accessible accordion rendering** in normal document flow with `aria-expanded`, active-item styling, automatic expansion, desktop/tablet/mobile parity, and no renaming of routes.
- [ ] **Step 5: Verify GREEN** with the focused test, then `CI=true npm test -- --runInBand src/App.test.tsx`.
- [ ] **Step 6: Commit** with `git commit -m "IMP-NAV-001 group operational navigation and expose client hierarchy"`.

### Task 2: CASA compliance database foundation

**Files:**
- Create: `supabase/migrations/20260805120000_casa_compliance_foundation.sql`
- Test: `src/__tests__/casaComplianceMigration.test.js`
- Test: `src/__tests__/casaCompliancePglite.test.js`

**Interfaces:**
- Produces RPCs: `ftf_read_casa_compliance_overview(uuid,timestamptz)`, `ftf_write_compliance_instrument(...)`, `ftf_publish_controlled_document_version(...)`, `ftf_write_compliance_training(...)`, and `ftf_write_renewal_action(...)`.

- [ ] **Step 1: Write RED migration contract tests** checking tables, composite tenant foreign keys, forced RLS, immutable published versions, permissions, audit/outbox writes, and Australian pack seed rules for ReOC 90/60/30/14/7/expired and record-specific retention.
- [ ] **Step 2: Verify RED** with `CI=true npm test -- --runInBand src/__tests__/casaComplianceMigration.test.js`.
- [ ] **Step 3: Add the minimal schema and constraints** for country packs/rules, organisation profiles, instruments/evidence, controlled documents/versions/acknowledgements, training, renewals, and legal holds. Published rows reject update/delete through trigger functions.
- [ ] **Step 4: Add least-privilege permissions and RLS** for compliance read/manage/verify/publish/export/restricted-evidence actions, granting normal tenant roles only through the existing organisation role model.
- [ ] **Step 5: Add authoritative commands** that validate actor scope/version, write source records, and atomically insert `audit_events` and `transactional_outbox` rows.
- [ ] **Step 6: Verify GREEN** with migration contract and PGlite behaviour tests, including cross-tenant denial and optimistic-concurrency conflict.
- [ ] **Step 7: Commit** with `git commit -m "NEW-CMP-002 add authoritative CASA compliance foundation"`.

### Task 3: CASA Compliance Overview read model

**Files:**
- Modify: `supabase/migrations/20260805120000_casa_compliance_foundation.sql`
- Create: `server/compliance-repository.js`
- Create: `server/compliance-api.js`
- Modify: `server/operational-dispatcher.js`
- Test: `src/__tests__/casaComplianceApi.test.js`

**Interfaces:**
- Produces `GET /api/v1/compliance?action=overview` returning `{ state, reoc, operationsManual, warnings, renewals, retention }`.
- State values: `CURRENT`, `DUE_90`, `DUE_30`, `EXPIRED`, `MISSING`, `UNDER_REVIEW`, `SUPERSEDED`, `NOT_APPLICABLE`.

- [ ] **Step 1: Write failing API tests** for permission denial, tenant scoping, real summary categories, stable states, missing evidence, legal hold counts, and unsupported actions.
- [ ] **Step 2: Verify RED** with `CI=true npm test -- --runInBand src/__tests__/casaComplianceApi.test.js`.
- [ ] **Step 3: Implement the overview RPC** deriving status from authoritative ReOC, manual, Personnel, Aircraft, approvals, training, checklist review, renewal, retention, and legal-hold records.
- [ ] **Step 4: Implement thin repository and handler layers** without business rules in the dispatcher.
- [ ] **Step 5: Verify GREEN** with the focused API and migration tests.
- [ ] **Step 6: Commit** with `git commit -m "NEW-CMP-003 expose CASA compliance command-centre status"`.

### Task 4: Personnel RePL and AROC evidence model

**Files:**
- Create: `supabase/migrations/20260805130000_personnel_casa_credentials.sql`
- Modify: `src/types/personnel.ts`
- Test: `src/__tests__/personnelCasaCredentialsMigration.test.js`
- Test: `src/__tests__/personnelCasaCredentialsPglite.test.js`

**Interfaces:**
- Produces RPCs: `ftf_write_personnel_casa_credential(...)`, `ftf_verify_personnel_credential(...)`, `ftf_evaluate_personnel_mission_eligibility(...)`.
- Credential lifecycle: `NON_EXPIRING | EXPIRING | EVIDENCE_DRIVEN`.

- [ ] **Step 1: Write RED tests** proving RePL accepts no expiry, AROC accepts no expiry, file/evidence versions are immutable, supersession retains history, verification actor/time are captured, and sensitive evidence requires `personnel.private.read`.
- [ ] **Step 2: Verify RED** with the two focused test files.
- [ ] **Step 3: Add additive Personnel/credential fields and evidence constraints** for ARN, certificate number, categories, ratings, aircraft type/weight eligibility, conditions, limitations, lifecycle, verification and evidence version.
- [ ] **Step 4: Add commands and eligibility evaluation** returning stable blocker codes: `CERTIFICATE_MISSING`, `EVIDENCE_UNVERIFIED`, `CREDENTIAL_SUSPENDED`, `CREDENTIAL_CANCELLED`, `CATEGORY_INELIGIBLE`, `RATING_INELIGIBLE`, `AIRCRAFT_TYPE_INELIGIBLE`, `WEIGHT_INELIGIBLE`, `AROC_REQUIRED`, and `CREDENTIAL_EXPIRED`.
- [ ] **Step 5: Verify GREEN**, including no mutation of existing Mission Personnel snapshots.
- [ ] **Step 6: Commit** with `git commit -m "IMP-PER-004 add evidence-backed RePL and AROC credentials"`.

### Task 5: Personnel credential API and file staging

**Files:**
- Modify: `server/compliance-api.js`
- Modify: `server/compliance-repository.js`
- Modify: `server/operational-dispatcher.js`
- Modify: `server/report-file-validator.js`
- Test: `src/__tests__/personnelCasaCredentialApi.test.js`

**Interfaces:**
- Produces `/api/v1/personnel-credentials` read/create/supersede/verify actions and certificate upload staging returning internal file metadata only.

- [ ] **Step 1: Write failing tests** for RePL/AROC validation, internal file metadata, checksum verification, privacy permission, version conflict, tenant/location denial, supersession, and no provider URL in responses.
- [ ] **Step 2: Verify RED** with the focused API test.
- [ ] **Step 3: Implement thin handlers and repository calls** using the established multipart/file-validation and Supabase Storage adapter pattern.
- [ ] **Step 4: Verify GREEN**, then run existing Personnel API tests.
- [ ] **Step 5: Commit** with `git commit -m "IMP-PER-005 connect CASA credential evidence API"`.

### Task 6: Personnel licences, qualifications and eligibility UI

**Files:**
- Modify: `src/pages/Personnel.tsx`
- Modify: `src/components/personnel/PersonnelCredentialEditor.tsx`
- Modify: `src/components/mission/MissionPersonnelSelector.tsx`
- Modify: `src/services/personnelApi.ts`
- Create: `src/services/complianceApi.ts`
- Test: `src/components/personnel/__tests__/PersonnelCredentialEditor.test.tsx`
- Test: `src/components/mission/__tests__/MissionPersonnelSelector.test.tsx`

**Interfaces:**
- Consumes certificate and eligibility endpoints from Tasks 4–5.

- [ ] **Step 1: Write RED component tests** for ARN, RePL and AROC numbers, certificate upload/reopen, RePL non-expiring copy, AROC `No expiry recorded`, evidence history/replacement, privacy gating, and exact PIC blocker messages.
- [ ] **Step 2: Verify RED** with the two focused test suites.
- [ ] **Step 3: Implement Licences and Qualifications sections** without creating another Personnel form, removing mandatory RePL expiry and implicit verification.
- [ ] **Step 4: Implement Mission eligibility presentation** showing all server blocker reasons beside each candidate.
- [ ] **Step 5: Verify GREEN**, then run the complete Personnel test set.
- [ ] **Step 6: Commit** with `git commit -m "IMP-PER-006 expose licences qualifications and PIC eligibility"`.

### Task 7: CASA Compliance command-centre UI

**Files:**
- Create: `src/pages/CasaCompliance.tsx`
- Create: `src/components/compliance/ComplianceOverview.tsx`
- Create: `src/components/compliance/ComplianceInstruments.tsx`
- Create: `src/components/compliance/ControlledDocuments.tsx`
- Create: `src/components/compliance/ComplianceRenewals.tsx`
- Modify: `src/App.tsx`
- Test: `src/components/compliance/__tests__/ComplianceOverview.test.tsx`

**Interfaces:**
- Consumes `complianceApi.overview()`, instrument/document/renewal commands, and authoritative drill-down IDs.

- [ ] **Step 1: Write RED tests** for every approved dashboard card/state, real record drill-down, ReOC days remaining, manual version/review, missing evidence, overdue renewals, retention/legal hold and permission-safe loading.
- [ ] **Step 2: Verify RED** with the focused test.
- [ ] **Step 3: Implement the workspace** with overview, certificates/manuals, approvals, Personnel, Aircraft, training, records, renewals, documents and audit tabs; replace `/compliance` landing while retaining historical subroutes behind a Legacy label.
- [ ] **Step 4: Verify GREEN** and run responsive/accessibility navigation tests.
- [ ] **Step 5: Commit** with `git commit -m "NEW-CMP-007 deliver CASA compliance command centre"`.

### Task 8: Checklist authoritative schema and permissions

**Files:**
- Create: `supabase/migrations/20260805140000_authoritative_checklists.sql`
- Test: `src/__tests__/authoritativeChecklistsMigration.test.js`
- Test: `src/__tests__/authoritativeChecklistsPglite.test.js`

**Interfaces:**
- Produces template draft/publish, rule selection, execution draft/submit, sign-off, supersession and corrective-action RPCs.
- Permissions are exactly the six `compliance.checklists.*` codes in the design.

- [ ] **Step 1: Write RED contract tests** for all tables, tenant FKs, forced RLS, permission codes, immutable published versions/submissions, mutable corrective actions, audit/outbox and notification events.
- [ ] **Step 2: Verify RED** with the migration test.
- [ ] **Step 3: Implement catalogues/templates/versions/items/applicability requirements/executions/answers/evidence/sign-offs/corrective actions** with explicit status constraints and row versions.
- [ ] **Step 4: Implement immutable triggers and commands** so drafts can resume, publication/submission freezes evidence, and correction links a new execution.
- [ ] **Step 5: Verify GREEN** with PGlite tests for cross-tenant denial, concurrency, immutable evidence and separate action updates.
- [ ] **Step 6: Commit** with `git commit -m "NEW-CHK-001 add authoritative checklist evidence model"`.

### Task 9: Checklist failure policy and readiness evaluation

**Files:**
- Modify: `supabase/migrations/20260805140000_authoritative_checklists.sql`
- Test: `src/__tests__/checklistReadinessPglite.test.js`

**Interfaces:**
- Produces `ftf_evaluate_mission_checklist_readiness(uuid,uuid,text)` returning `{ state, blockers, warnings, outstandingSections, completedSections }`.

- [ ] **Step 1: Write RED tests** for required comment/photo, evidence missing, corrective action creation, open action blocker, resolution without answer mutation, sign-off missing, completing Personnel ineligible, superseded template selected, repeat execution and all-clear completion.
- [ ] **Step 2: Verify RED** with the focused PGlite test.
- [ ] **Step 3: Implement rule evaluation and stable blocker codes** for each approved failure mode; scope blockers to the configured lifecycle stage.
- [ ] **Step 4: Implement the all-clear command** to create explicit passing answers for applicable items and required sign-off evidence without bypassing validation.
- [ ] **Step 5: Verify GREEN** and rerun authoritative checklist tests.
- [ ] **Step 6: Commit** with `git commit -m "NEW-CHK-002 enforce checklist exceptions and corrective actions"`.

### Task 10: Checklist API boundary

**Files:**
- Create: `server/checklist-repository.js`
- Create: `server/checklist-api.js`
- Modify: `server/operational-dispatcher.js`
- Test: `src/__tests__/checklistApi.test.js`

**Interfaces:**
- Produces `/api/v1/checklists`, `/api/v1/checklist-executions`, and `/api/v1/checklist-actions` dispatcher resources.

- [ ] **Step 1: Write RED API tests** for versioning, permissions, unsupported actions, templates, publication, Mission selection, draft resume, submission, supersession, evidence, sign-off, actions, tenant/location scope and read-only support-session enforcement.
- [ ] **Step 2: Verify RED** with the focused API test.
- [ ] **Step 3: Implement thin handlers/repositories** that delegate validation and business state transitions to the authoritative RPCs.
- [ ] **Step 4: Verify GREEN** and run dispatcher regression tests.
- [ ] **Step 5: Commit** with `git commit -m "NEW-CHK-003 expose versioned checklist APIs"`.

### Task 11: Checklist Builder and execution workspace

**Files:**
- Create: `src/types/checklists.ts`
- Create: `src/services/checklistApi.ts`
- Create: `src/pages/Checklists.tsx`
- Create: `src/components/checklists/ChecklistTemplateEditor.tsx`
- Create: `src/components/checklists/ChecklistExecution.tsx`
- Create: `src/components/checklists/ChecklistCorrectiveActions.tsx`
- Test: `src/components/checklists/__tests__/ChecklistWorkspace.test.tsx`

**Interfaces:**
- Consumes Task 10 API; exposes one Compliance navigation entry with Templates, Due Reviews, Mission Checklists, Executions and Corrective Actions tabs.

- [ ] **Step 1: Write RED tests** for every item type, configuration-driven conditional rules, draft save/resume, publish immutability, failed-item comment/photo, action owner/due date, resolution, sign-off, repeat inspection, supersession history and all-clear flow.
- [ ] **Step 2: Verify RED** with the focused test suite.
- [ ] **Step 3: Implement the minimal workspace** using focused components and server state only; never persist drafts in local storage.
- [ ] **Step 4: Implement low-friction execution** that highlights exceptions, avoids duplicate entry, and uses `All checks passed — continue` when policy permits.
- [ ] **Step 5: Verify GREEN** at desktop/tablet/mobile breakpoints and with keyboard navigation.
- [ ] **Step 6: Commit** with `git commit -m "NEW-CHK-004 deliver checklist builder and execution workflow"`.

### Task 12: Mission lifecycle integration

**Files:**
- Modify: `server/operational-repository.js`
- Modify: `supabase/migrations/20260805140000_authoritative_checklists.sql`
- Modify: `src/pages/MissionPlanning.tsx`
- Create: `src/components/mission/MissionChecklists.tsx`
- Test: `src/components/mission/__tests__/MissionChecklists.test.tsx`
- Test: `src/__tests__/missionChecklistReadiness.test.js`

**Interfaces:**
- Combines checklist readiness into the existing Mission readiness categories without changing existing weather/JSA/chemical/map evidence semantics.

- [ ] **Step 1: Write RED tests** for auto-selection from Mission facts, selection reason/rule version, precise blockers, lifecycle-stage scoping, authorisation snapshot references, completion snapshot references, and no retroactive change after republishing.
- [ ] **Step 2: Verify RED** with both focused suites.
- [ ] **Step 3: Implement Mission requirement selection and readiness adapter** with exact checklist execution/sign-off IDs in immutable authorisation/completion evidence.
- [ ] **Step 4: Implement the Mission panel** showing only applicable checklists, why they apply, current state, next action and prior immutable executions.
- [ ] **Step 5: Verify GREEN** and rerun Mission authorisation/closeout regression suites.
- [ ] **Step 6: Commit** with `git commit -m "IMP-MSN-012 integrate checklists with Mission readiness"`.

### Task 13: CASA Compliance Pack export

**Files:**
- Create: `supabase/migrations/20260805150000_casa_compliance_pack.sql`
- Create: `server/casa-compliance-pack-renderer.js`
- Modify: `server/report-worker.js`
- Modify: `server/report-view-models.js`
- Test: `src/__tests__/casaCompliancePack.test.js`

**Interfaces:**
- Produces a versioned `CASA_COMPLIANCE_PACK` report artefact with indexed evidence manifest, internal IDs/versions/checksums, gaps, retention/legal-hold metadata, branding and generation provenance.

- [ ] **Step 1: Write RED tests** proving the pack uses authoritative references, includes checksum manifest/gaps, excludes unauthorised private evidence, is reproducible, and does not mutate source evidence.
- [ ] **Step 2: Verify RED** with the focused test.
- [ ] **Step 3: Implement report snapshot command and renderer** through the shared artefact worker, retaining organisation branding and `Generated by Spray Command`.
- [ ] **Step 4: Verify GREEN** and run existing report regression tests.
- [ ] **Step 5: Commit** with `git commit -m "NEW-CMP-013 generate authoritative CASA compliance pack"`.

### Task 14: End-to-end verification and migration report

**Files:**
- Create: `scripts/verifyCasaComplianceChecklistsPostgres.mjs`
- Modify: `package.json`
- Create: `docs/production-beta-casa-compliance-acceptance.md`
- Test: `src/__tests__/casaComplianceChecklistRegression.test.js`

**Interfaces:**
- Produces `npm run verify:casa-compliance-checklists` and a redacted acceptance evidence report.

- [ ] **Step 1: Write RED verifier contract tests** requiring real ReOC overview, RePL/AROC evidence history, checklist exception/action/all-clear flows, RLS, audit, outbox, notifications, retention/legal hold and immutable Mission references.
- [ ] **Step 2: Verify RED** with the focused regression test.
- [ ] **Step 3: Implement the verifier** using environment-provided trusted credentials without logging secrets, and add repository secret/migration lint checks.
- [ ] **Step 4: Run focused verification**: all new tests, existing Personnel/Mission/report/navigation tests, `npm run build`, migration lint, secret scan and `npm run verify:casa-compliance-checklists` against a controlled local database.
- [ ] **Step 5: Run the full suite** with `CI=true npm test -- --runInBand` and require zero failures.
- [ ] **Step 6: Commit** with `git commit -m "IMP-CMP-014 verify pre-freeze compliance capability"`.

### Task 15: Production Beta migration, deployment and live acceptance

**Files:**
- Update only acceptance evidence if live results require documentation corrections; do not patch production manually.

**Interfaces:**
- Uses repository-controlled migrations and the existing Supabase/Vercel Production Beta deployment process.

- [ ] **Step 1: Confirm targets and safety**: remote `BJT-FTF/Spray-Command`, branch `codex/production-beta`, Production Beta Supabase project, Production Beta Vercel project, clean secret scan, no `.env` or temporary credentials tracked.
- [ ] **Step 2: Push without force** and preserve accepted history/worktree.
- [ ] **Step 3: Apply only the four repository migrations** in order and run migration lint plus schema-version verification.
- [ ] **Step 4: Deploy the committed SHA** and wait for Vercel READY.
- [ ] **Step 5: Run deployed smoke tests** for login, navigation, Compliance Overview, Personnel credentials, Checklists, Mission readiness, file evidence and reports.
- [ ] **Step 6: Prove the 13 added acceptance cases** using real Fly The Farm records where available, plus refresh, re-login, second session, tenant/location isolation, concurrency, audit, outbox, notifications and no local fallback.
- [ ] **Step 7: Confirm architecture-freeze gate** only after all deployed evidence passes; report any genuine regulatory/product decision rather than guessing.

---

## Self-Review Result

- **Spec coverage:** Every governing design section and all four approved amendments map to Tasks 1–15.
- **No placeholders:** No implementation step delegates unspecified validation, tests, or error handling.
- **Type consistency:** Compliance states, credential lifecycle, blocker codes, permissions, RPC names, routes, and report type are consistent across database, server, UI, and tests.
- **Execution mode:** Inline execution is required by current project instructions; no subagents will be used.

