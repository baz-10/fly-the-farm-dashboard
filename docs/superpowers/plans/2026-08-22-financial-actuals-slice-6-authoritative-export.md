# Financial Actuals Slice 6 Authoritative Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export an exact immutable current or historical FINAL Financial Actual as a checked PDF and complete the controlled lifecycle, security, browser, and maturity evidence for Slices 1–6.

**Architecture:** Existing checked current/historical FINAL reads provide the sole financial source. A strict server decoder builds an in-memory PDF, then one narrow checked RPC revalidates exact immutable identity and records bounded audit/outbox evidence before the server releases the bytes. PostgreSQL behavioural, server integration, and responsive Playwright suites provide distinct authority and user-flow evidence.

**Tech Stack:** PostgreSQL/Supabase migrations and PGlite behavioural tests, Node/Vercel CommonJS API handlers, `jsPDF`, React 18/MUI, TypeScript, Jest, Playwright Chromium/WebKit, GitHub Actions governance.

**Spec:** `docs/superpowers/specs/2026-08-22-financial-actuals-slice-6-authoritative-export-design.md`

## Global Constraints

- The immutable FINAL Financial Actual revision is the sole financial authority.
- Reuse `ftf_read_financial_actual_authority` and `ftf_read_financial_actual_historical_revision` unchanged.
- Create exactly one additive checked RPC; create no tables, snapshots, report jobs, export state, or generic report framework.
- Require both `financial_actuals.read` and `financial_actuals.export` plus tenant and Base authority.
- Never export a Draft, Preview, localStorage record, historical `JobActual`, recalculated FINAL, or mutable operational source.
- Release no PDF unless strict decoding, rendering, and export-evidence recording all succeed.
- Financials remains `COMING_SOON`; do not edit Product Maturity classification.
- Do not apply migrations, deploy Production, alter aliases, expose Financials, or mutate genuine Fly The Farm records.

---

### Task 1: Checked export-evidence command

**Files:**
- Create: `supabase/migrations/20260822140000_financial_actual_export_evidence.sql`
- Create: `src/__tests__/financialActualExportEvidence.test.js`
- Modify: `src/__tests__/financialActualAuthorityBehavior.test.js`

**Interfaces:**
- Consumes: existing `ftf_financial_actor_has_permission`, `ftf_financial_actor_has_location`, `financial_actuals`, immutable `financial_actual_revisions`, `audit_events`, and `transactional_outbox`.
- Produces: `ftf_record_financial_actual_export_evidence(uuid,uuid,uuid,uuid,integer,text,text,text,timestamptz) -> jsonb` and schema `FINANCIAL_ACTUAL_EXPORT_EVIDENCE_V1`.

- [ ] **Step 1: Write structural RED tests**

Assert the migration defines one `SECURITY DEFINER` function with fixed search path, revokes execution from `public`, `anon`, and `authenticated`, grants only EXECUTE to `service_role`, and contains no `CREATE TABLE`, generic table grant, snapshot, or job state.

- [ ] **Step 2: Write behavioural RED fixtures**

Extend the existing PGlite Financial authority fixture with two organisations, two Bases, actors having read-only, export-only, both, and neither permission, one current FINAL, one historical FINAL, one Draft, and bounded audit/outbox inspection.

- [ ] **Step 3: Prove RED**

Run:

```bash
npx jest src/__tests__/financialActualExportEvidence.test.js --runInBand
```

Expected: FAIL because migration `20260822140000_financial_actual_export_evidence.sql` and RPC do not exist.

- [ ] **Step 4: Implement the single RPC**

Implement the exact signature from the design. Require both permissions, same-organisation aggregate/revision, active Base access, `FINAL`, exact revision number/digest/formula, `FINANCIAL_ACTUAL_PNL_V1`, and a canonical recent `generated_at`. Insert only bounded identifiers into `financial_actual.export_generated` and `financial.actual.export_generated`, returning exact confirmation.

- [ ] **Step 5: Add negative and atomic behavioural assertions**

Prove read-only, export-only, wrong Base, cross-tenant, Draft, wrong revision number, wrong digest, wrong formula, wrong report version, stale/future timestamp, and arbitrary RPC calls fail with zero audit/outbox rows. Prove success writes exactly one bounded pair and does not mutate aggregate/revision/pointers/snapshots.

- [ ] **Step 6: Run Task 1 GREEN**

```bash
npx jest src/__tests__/financialActualExportEvidence.test.js src/__tests__/financialActualAuthorityBehavior.test.js --runInBand
```

Expected: both suites PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add supabase/migrations/20260822140000_financial_actual_export_evidence.sql src/__tests__/financialActualExportEvidence.test.js src/__tests__/financialActualAuthorityBehavior.test.js
git commit -m "feat: govern financial actual export evidence"
```

### Task 2: Strict server export contract

**Files:**
- Create: `server/financial-actual-export-contract.js`
- Create: `src/__tests__/financialActualExportContract.test.js`

**Interfaces:**
- Consumes: raw current authority plus optional raw historical authority.
- Produces: `decodeFinancialActualExportAuthority({ authority, historical, requestedActualId, requestedRevisionId, generatedAt, reportVersion }) -> FinancialActualExportViewModel`.

- [ ] **Step 1: Write decoder RED tests**

Build exact current and historical fixtures with complete hierarchy, frozen calculation/input/provenance/source manifest, canonical decimals, digest, timestamps, finaliser, and revision identity. Require exact current and historical view models.

- [ ] **Step 2: Add fail-whole RED cases**

Parameterise missing/extra keys, Draft status, wrong aggregate/revision linkage, current-revision substitution, malformed decimals, null-to-zero coercion, invalid dates/timestamps, wrong currency/formula/digest, incomplete evidence, oversized arrays/strings, controls, credentials, and mismatch between aggregate and historical response.

- [ ] **Step 3: Prove RED**

```bash
npx jest src/__tests__/financialActualExportContract.test.js --runInBand
```

Expected: FAIL because the decoder module is absent.

- [ ] **Step 4: Implement exact recursive validation**

Create small validators for exact objects, UUIDs, canonical dates/timestamps, safe bounded strings, canonical money/hour/quantity/rate values, nullable calculated ratios, frozen work/cost/provenance arrays, source manifest, hierarchy, and exact revision selection. Do not import or invoke either calculator.

- [ ] **Step 5: Prove no recalculation/local source**

Mock the TypeScript calculator and browser persistence modules to throw if loaded; require decoder tests to pass without importing either dependency. Verify frozen values that intentionally differ from current calculator behavior are preserved verbatim.

- [ ] **Step 6: Run Task 2 GREEN**

```bash
npx jest src/__tests__/financialActualExportContract.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add server/financial-actual-export-contract.js src/__tests__/financialActualExportContract.test.js
git commit -m "feat: decode authoritative financial exports"
```

### Task 3: Deterministic Financial Actual PDF renderer

**Files:**
- Create: `server/financial-actual-renderer.js`
- Create: `src/__tests__/financialActualExportRenderer.test.js`
- Modify: `scripts/render-report-fixtures.js`

**Interfaces:**
- Consumes: the decoded `FinancialActualExportViewModel` only.
- Produces: `renderFinancialActualPdf(viewModel) -> Buffer` and constant `FINANCIAL_ACTUAL_REPORT_VERSION = "FINANCIAL_ACTUAL_PNL_V1"`.

- [ ] **Step 1: Write renderer RED tests**

Assert a non-empty A4 PDF visibly contains the Financial reference, exact revision, FINAL, Client/Job, period, AUD, finalised/generated dates, revenue, five cost categories, total cost, gross profit, operational days, and total hours.

- [ ] **Step 2: Add identity and null-semantics RED tests**

Assert PDF metadata includes revision ID, formula version, report version, and digest. Require null gross margin/effective-hourly revenue to render `Not defined` or an em dash and never `0%` or `$0.00` for the undefined metric.

- [ ] **Step 3: Prove RED**

```bash
npx jest src/__tests__/financialActualExportRenderer.test.js --runInBand
```

Expected: FAIL because the renderer is absent.

- [ ] **Step 4: Implement the isolated renderer**

Use `jsPDF` and the existing green/paper typography conventions. Render only supplied frozen values; include bounded concise provenance wording without rows or payloads. Set deterministic file ID and caller-supplied generation date.

- [ ] **Step 5: Add fixture rendering**

Extend `scripts/render-report-fixtures.js` with current R2, historical R1, and zero-revenue/null-ratio PDFs under the existing ignored fixture-output directory for visual QA.

- [ ] **Step 6: Render and inspect fixtures**

```bash
node scripts/render-report-fixtures.js
```

Render generated PDFs to PNG using the workspace PDF tooling and inspect every page for clipping, overlap, missing identity, and phone-independent print legibility.

- [ ] **Step 7: Run Task 3 GREEN**

```bash
npx jest src/__tests__/financialActualExportRenderer.test.js src/__tests__/reportRenderer.test.js --runInBand
```

Expected: both suites PASS.

- [ ] **Step 8: Commit Task 3**

```bash
git add server/financial-actual-renderer.js src/__tests__/financialActualExportRenderer.test.js scripts/render-report-fixtures.js
git commit -m "feat: render frozen financial actual PDFs"
```

### Task 4: Trusted export endpoint and release ordering

**Files:**
- Modify: `server/financial-actuals-repository.js`
- Modify: `server/financial-actuals-api.js`
- Modify: `src/__tests__/financialActualsApi.test.js`
- Create: `src/__tests__/financialActualExportApi.test.js`

**Interfaces:**
- Consumes: existing repository current/historical reads, Task 2 decoder, Task 3 renderer, and Task 1 evidence RPC.
- Produces: `POST /api/v1/financial-actuals?action=export` returning PDF bytes only after evidence confirmation.

- [ ] **Step 1: Write endpoint permission RED tests**

Require authentication, same-origin POST, both permissions, valid UUIDs, and no repository/render invocation on early denial. Cover read-only, export-only, contractor, and unauthorised contexts.

- [ ] **Step 2: Write exact-revision ordering RED tests**

Use deferred mocks to prove current export calls aggregate read, exact historical export calls aggregate then historical read, render occurs before evidence RPC, and `res.end(pdf)` occurs only after evidence success. Require rendered bytes to be discarded on evidence mismatch/error.

- [ ] **Step 3: Write failure/redaction RED tests**

Prove strict decode failure, Draft request, render failure, wrong Base/not-found, malicious PostgREST diagnostics, oversized output, and incorrect evidence confirmation return bounded errors with no PDF or credential-shaped content.

- [ ] **Step 4: Prove RED**

```bash
npx jest src/__tests__/financialActualExportApi.test.js src/__tests__/financialActualsApi.test.js --runInBand
```

Expected: FAIL because `export` is unsupported.

- [ ] **Step 5: Add repository evidence method**

Add `recordExportEvidence(context, evidence)` calling only `ftf_record_financial_actual_export_evidence` with trusted context and the bounded immutable tuple.

- [ ] **Step 6: Implement the export branch**

Extend action definitions to accept a permission set and require all permissions. Read exact authority, decode, render in memory, call evidence RPC, strictly validate `FINANCIAL_ACTUAL_EXPORT_EVIDENCE_V1`, then set `Content-Type`, `Content-Disposition`, and `Content-Length` and end with the Buffer. Keep JSON behavior unchanged for other actions.

- [ ] **Step 7: Run Task 4 GREEN**

```bash
npx jest src/__tests__/financialActualExportApi.test.js src/__tests__/financialActualsApi.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add server/financial-actuals-repository.js server/financial-actuals-api.js src/__tests__/financialActualsApi.test.js src/__tests__/financialActualExportApi.test.js
git commit -m "feat: serve checked financial actual exports"
```

### Task 5: Browser export service and permission-aware UI

**Files:**
- Modify: `src/services/financialActualsApi.ts`
- Modify: `src/services/__tests__/financialActualsApi.test.ts`
- Modify: `src/pages/ActualDetail.tsx`
- Modify: `src/pages/__tests__/ActualDetailCorrectionLifecycle.test.tsx`
- Create: `src/pages/__tests__/ActualDetailExport.test.tsx`

**Interfaces:**
- Consumes: Task 4 PDF endpoint.
- Produces: `exportFinal({ actualId, revisionId }): Promise<{ blob: Blob; filename: string }>` plus current/historical export actions.

- [ ] **Step 1: Write browser client RED tests**

Require same-origin POST with IDs only, successful `application/pdf`, bounded content length, safe filename parsing, non-empty Blob, and bounded JSON error handling. Reject HTML/JSON success bodies, missing/oversized PDFs, unsafe filenames, and credential-bearing errors.

- [ ] **Step 2: Write UI authority RED tests**

Require current export only with both permissions and decoded FINAL, historical export only for the selected exact FINAL, no Draft export, and no action for read-only/export-only users.

- [ ] **Step 3: Add stale-scope and one-request RED tests**

Resolve scope A, begin export, switch tenant/delegated session/actual/revision, and prove the late A response cannot trigger a download or show A state. Prove one click sends exactly one POST and one failure renders exactly one alert.

- [ ] **Step 4: Prove RED**

```bash
npx jest src/services/__tests__/financialActualsApi.test.ts src/pages/__tests__/ActualDetailExport.test.tsx --runInBand
```

Expected: FAIL because browser export support is absent.

- [ ] **Step 5: Implement the Blob client**

Add a PDF-specific request path that does not call JSON decoders, validates status/content type/size/disposition, and returns the Blob plus sanitised server filename.

- [ ] **Step 6: Implement scoped download controls**

Add an authority-scoped generation token and export busy/error state. Create and revoke an object URL only while the initiating authority scope remains current. Label actions `Export current FINAL` and `Export revision N`.

- [ ] **Step 7: Run Task 5 GREEN**

```bash
npx jest src/services/__tests__/financialActualsApi.test.ts src/pages/__tests__/ActualDetailCorrectionLifecycle.test.tsx src/pages/__tests__/ActualDetailExport.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 8: Commit Task 5**

```bash
git add src/services/financialActualsApi.ts src/services/__tests__/financialActualsApi.test.ts src/pages/ActualDetail.tsx src/pages/__tests__/ActualDetailCorrectionLifecycle.test.tsx src/pages/__tests__/ActualDetailExport.test.tsx
git commit -m "feat: expose exact financial final exports"
```

### Task 6: Complete PostgreSQL controlled lifecycle acceptance

**Files:**
- Create: `src/__tests__/financialActualCompleteLifecycleAcceptance.test.js`
- Modify: `src/__tests__/financialActualOperationalPrefill.test.js`
- Modify: `src/__tests__/financialActualCorrectionLifecycle.test.js`

**Interfaces:**
- Consumes: complete ordered migrations `20260822100000` through `20260822140000`.
- Produces: one controlled authority proof covering the Founder-required 33-step lifecycle and security boundaries.

- [ ] **Step 1: Write the controlled fixture and RED lifecycle**

Create only explicit `SC-FA-ACCEPTANCE-*` organisation/Base/client/property/field/job/mission identities in PGlite. Complete Mission evidence, create R1, propose/select prefill, add financial inputs, read from a second actor session, and assert stale R1 Draft update conflict.

- [ ] **Step 2: Extend RED through R1 FINAL/export**

Assert PostgreSQL `FINANCIAL_ACTUAL_V1`, frozen evidence, R1 export-evidence tuple, and null semantics. Preserve exact snapshots for later byte/value comparison.

- [ ] **Step 3: Extend RED through correction R2**

Create R2, prove R1 remains current, modify one governed value, finalise R2, prove pointer advancement, immutable R1, distinct exact frozen values, historical R1 export evidence, and current R2 export evidence.

- [ ] **Step 4: Extend RED through archive and drift**

Prove archive conflict while an active Draft exists using a separate controlled aggregate, source drift detection without FINAL mutation, archive after lifecycle permits it, active-list removal, historical read retention, and fixture-only cleanup.

- [ ] **Step 5: Add security roles and direct-authority RED cases**

Use real SQL roles to prove unauthorised, contractor, wrong Base, cross-tenant, direct table, generic service-role read, arbitrary RPC, and missing-export-permission denial. Compare genuine sentinel rows before/after and require byte-identical/no-count-change safety.

- [ ] **Step 6: Run Task 6 GREEN**

```bash
npx jest src/__tests__/financialActualCompleteLifecycleAcceptance.test.js src/__tests__/financialActualOperationalPrefill.test.js src/__tests__/financialActualCorrectionLifecycle.test.js --runInBand
```

Expected: PASS with no skipped lifecycle or security assertion.

- [ ] **Step 7: Commit Task 6**

```bash
git add src/__tests__/financialActualCompleteLifecycleAcceptance.test.js src/__tests__/financialActualOperationalPrefill.test.js src/__tests__/financialActualCorrectionLifecycle.test.js
git commit -m "test: prove complete financial actual authority lifecycle"
```

### Task 7: Responsive Chromium/WebKit lifecycle acceptance

**Files:**
- Create: `e2e/financial-actuals/authoritative-lifecycle.spec.ts`
- Create: `e2e/financial-actuals/support/financialActualAuthorityFixture.ts`
- Modify: `e2e/financial-actuals/financial-actuals.spec.ts`
- Modify: `playwright.financial-actuals.config.ts`

**Interfaces:**
- Consumes: browser Financial API and exact endpoint contracts from Tasks 4–5.
- Produces: stateful user-flow evidence at six browser/viewport combinations without claiming fixture state is PostgreSQL proof.

- [ ] **Step 1: Build a strict stateful acceptance fixture**

Model exact decoded API schemas for controlled hierarchy, R1 Draft, selected prefill, saves, conflict, R1 FINAL, correction R2, history, historical detail, two distinct PDF responses, archive conflict, archive, and cleanup. Reject unexpected methods, actions, IDs, versions, permissions, and request keys.

- [ ] **Step 2: Write the real user-flow RED test**

Drive create/open, selected prefill review, multi-row financial save, refresh/reopen, Preview, R1 finalisation, R1 export, correction creation, R1-current proof, R2 modification/finalisation, R1 and R2 exports, history, archive conflict, archive, and historical evidence access using semantic locators.

- [ ] **Step 3: Add second-session and conflict RED coverage**

Use two browser contexts where supported by the fixture contract. Require Session B to reconstruct server state without localStorage and require a stale Session A write to receive conflict while the newer state survives.

- [ ] **Step 4: Add override and responsive RED assertions**

Prove absent, malformed, and Production acceptance override configurations remain closed in governance tests; authenticated permissions and tenant/Base checks remain necessary. At each configured viewport assert no horizontal document scroll, usable dialogs/actions, and exact download identity.

- [ ] **Step 5: Run all six projects**

```bash
npx playwright test --config=playwright.financial-actuals.config.ts
```

Expected: Chromium and WebKit phone/tablet/desktop projects PASS with real interaction assertions, not screenshots alone.

- [ ] **Step 6: Commit Task 7**

```bash
git add e2e/financial-actuals/authoritative-lifecycle.spec.ts e2e/financial-actuals/support/financialActualAuthorityFixture.ts e2e/financial-actuals/financial-actuals.spec.ts playwright.financial-actuals.config.ts
git commit -m "test: accept financial actual lifecycle responsively"
```

### Task 8: Product Maturity assessment and governance evidence

**Files:**
- Modify: `src/productMaturity/financialActualsAcceptance.ts`
- Modify: `src/productMaturity/__tests__/financialActualsAcceptance.test.ts`
- Create: `.superpowers/sdd/2026-08-22-financial-actuals-slice-6-report.md`
- Modify: `docs/superpowers/specs/2026-08-22-financial-actuals-slice-6-authoritative-export-design.md` only if implementation review discovers an approved deviation.

**Interfaces:**
- Consumes: all Slice 6 automated evidence and the unchanged Product Maturity registry.
- Produces: fail-closed evidence assertions and a completion report separating code readiness from promotion readiness.

- [ ] **Step 1: Write governance RED assertions**

Require the Financials registry entries to remain `COMING_SOON`, forbid registry edits in the Slice 6 diff, require export authority/decoder/renderer/lifecycle/security/browser evidence paths, and reprove Production/absent/malformed development override denial.

- [ ] **Step 2: Run governance RED**

```bash
npx jest src/productMaturity/__tests__/financialActualsAcceptance.test.ts --runInBand
```

Expected: FAIL until Slice 6 evidence references are registered in the acceptance guard.

- [ ] **Step 3: Update evidence guard, not registry classification**

Add exact repository evidence paths and required invariant strings to `financialActualsAcceptance.ts`. Do not modify `product-maturity-registry.json`.

- [ ] **Step 4: Draft the Slice 6 completion report**

Record commit/migration checksum, architecture, permissions/evidence, current/historical proof, 33-step acceptance, session/conflict/security/browser results, parity/regression/maturity/build/review, deviations, complete migration order, integration recommendation, and eventual Production-release recommendation. Mark Private Beta operational evidence missing unless separately and genuinely obtained.

- [ ] **Step 5: Run governance GREEN**

```bash
npx jest src/productMaturity/__tests__/financialActualsAcceptance.test.ts --runInBand
npm run verify:product-maturity
```

Expected: zero violations while Financials remains `COMING_SOON`.

- [ ] **Step 6: Commit Task 8**

```bash
git add src/productMaturity/financialActualsAcceptance.ts src/productMaturity/__tests__/financialActualsAcceptance.test.ts .superpowers/sdd/2026-08-22-financial-actuals-slice-6-report.md
git commit -m "docs: assess financial actuals product readiness"
```

### Task 9: Full verification and independent review

**Files:**
- Modify: `.superpowers/sdd/2026-08-22-financial-actuals-slice-6-report.md`

**Interfaces:**
- Consumes: completed Tasks 1–8.
- Produces: completion evidence suitable for Founder repository-integration review, without Production action.

- [ ] **Step 1: Run focused authority and export suites**

```bash
npx jest src/__tests__/financialActualExportEvidence.test.js src/__tests__/financialActualExportContract.test.js src/__tests__/financialActualExportRenderer.test.js src/__tests__/financialActualExportApi.test.js src/__tests__/financialActualCompleteLifecycleAcceptance.test.js src/__tests__/financialActualsApi.test.js src/services/__tests__/financialActualsApi.test.ts src/pages/__tests__/ActualDetailExport.test.tsx --runInBand
```

Expected: all focused suites PASS.

- [ ] **Step 2: Run all Financial authority/parity suites**

```bash
npx jest src/__tests__/financialActualAuthorityMigration.test.js src/__tests__/financialActualAuthorityBehavior.test.js src/__tests__/financialActualCalculationParity.test.js src/__tests__/financialActualOperationalPrefill.test.js src/__tests__/financialActualCorrectionLifecycle.test.js src/domain/financialActuals/__tests__/calculation.test.ts --runInBand
```

Expected: all suites PASS, including PostgreSQL/TypeScript parity.

- [ ] **Step 3: Run responsive browser acceptance**

```bash
npx playwright test --config=playwright.financial-actuals.config.ts
```

Expected: six projects PASS.

- [ ] **Step 4: Run deterministic regression across all governed shards**

Run the repository's existing deterministic-regression command for shards 1 through 8 and allow every shard to finish. Record each shard result and total suite/test counts in the report.

- [ ] **Step 5: Run maturity and build gates**

```bash
npm run verify:product-maturity
npm run build
git diff --check
```

Expected: zero maturity violations, production build PASS, and clean diff check.

- [ ] **Step 6: Request independent whole-workstream authority/security review**

Review the full Slice 1–6 diff and migration chain for permission, tenant/Base, exact-revision, immutability, audit payload, direct-table, strict-decoder, renderer-source, stale-scope, and genuine-record-safety violations. Resolve every concrete finding test-first and rerun affected plus full gates.

- [ ] **Step 7: Finalise report and checksum**

Record the SHA-256 of `20260822140000_financial_actual_export_evidence.sql`, exact migration order, final test counts, review `READY`, design deviations, code/acceptance readiness, missing Private Beta evidence, and explicit confirmation of no Production/genuine-data action.

- [ ] **Step 8: Commit verified completion evidence**

```bash
git add .superpowers/sdd/2026-08-22-financial-actuals-slice-6-report.md
git commit -m "docs: complete financial actuals slice 6 evidence"
```

- [ ] **Step 9: Stop for Founder integration review**

Return items A–V from the Slice 6 approval. Do not push, create a PR, merge, migrate, deploy, change aliases, promote Product Maturity, or expose Financials without separate authority.

