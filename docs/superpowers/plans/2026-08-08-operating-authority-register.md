# Operating Authority Register Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an authoritative multi-record operating-authority register with multiple immutable files per authority and protected direct uploads that work beyond Vercel's request-body limit.

**Architecture:** Add an additive PostgreSQL authority catalogue and pending-upload ledger around the existing compliance instruments and evidence tables. The trusted server issues short-lived, organisation-scoped Supabase signed upload targets, verifies uploaded objects, and calls one atomic PostgreSQL finalisation command to create or append authority evidence with audit and outbox. The ReOC workspace becomes a register over those APIs while existing ReOC history and Compliance Health remain authoritative.

**Tech Stack:** React 19, TypeScript, Material UI, Jest/Testing Library, Node.js Vercel Functions, Supabase Storage, PostgreSQL RPC migrations, PGlite migration verification.

## Global Constraints

- Preserve RLS, tenant isolation, operating-location scope and existing trusted-session enforcement.
- Never expose a Supabase service-role key, provider key or permanent storage credential to the browser.
- Signed upload targets expire after 15 minutes and permit one generated object path only.
- Supported evidence content types are PDF, PNG, JPEG and WebP; maximum file size is 20 MiB per file.
- Every authoritative evidence file retains internal file ID, version, filename, content type, size, SHA-256 checksum, provenance, actor, timestamp, evidence role and parent authority.
- Existing ReOC records and evidence are migrated additively without rewriting IDs, checksums, audit history or report evidence.
- Compliance Health and Calendar remain derived projections and the required ReOC rule remains fail-closed.
- No browser storage or legacy persistence fallback.
- Do not create synthetic compliance evidence.

---

## File Structure

- `supabase/migrations/20260808181500_operating_authority_register.sql` — catalogue, pending uploads, evidence metadata extension, read projection and atomic authority/evidence commands.
- `src/__tests__/operatingAuthorityRegisterMigration.test.js` — repository-level migration contract checks.
- `src/__tests__/operatingAuthorityRegisterPglite.test.js` — multi-record, multi-file, immutability, concurrency, tenant and audit/outbox database behaviour.
- `server/compliance-repository.js` — signed upload authorisation, uploaded-object verification and authority register RPC adapters.
- `server/compliance-api.js` — safe validated `authority-register`, `upload-authorise`, `authority-create` and `evidence-append` actions.
- `src/__tests__/casaComplianceApi.test.js` — API permission, validation, correlation and direct-upload boundary tests.
- `src/services/complianceApi.ts` — typed register reads, signed uploads and finalisation calls with safe non-JSON error handling.
- `src/services/__tests__/complianceApi.test.ts` — direct upload sequencing and 413-safe error coverage.
- `src/pages/ReocComplianceWorkspace.tsx` — register summary, sections, authority cards and multi-file add workflow.
- `src/pages/__tests__/ReocComplianceWorkspace.test.tsx` — UI behaviour, preservation, multiple files and special approvals.

---

### Task 1: Safe Transport Error Diagnosis

**Files:**
- Modify: `src/services/complianceApi.ts`
- Create: `src/services/__tests__/complianceApi.test.ts`

**Interfaces:**
- Produces: `ComplianceApiError extends Error { code: string; status: number; correlationId?: string }`
- Produces: `request()` maps JSON and non-JSON responses into safe operator errors.

- [ ] **Step 1: Write failing client error tests**

Test a `413` text response and assert `code === 'FUNCTION_PAYLOAD_TOO_LARGE'`, status `413`, and the message tells the operator the file is too large for the old upload route. Test JSON errors retain their safe code and correlation ID.

- [ ] **Step 2: Run the tests and confirm RED**

Run: `CI=true npm test -- --runInBand src/services/__tests__/complianceApi.test.ts`

Expected: FAIL because the current client discards non-JSON status and correlation metadata.

- [ ] **Step 3: Implement the safe error boundary**

Add:

```ts
export class ComplianceApiError extends Error {
  constructor(message:string, public code:string, public status:number, public correlationId?:string) { super(message); }
}
```

Read `response.text()` once, parse JSON conditionally, map status `413` to `FUNCTION_PAYLOAD_TOO_LARGE`, and never echo response bodies, signed URLs or credentials.

- [ ] **Step 4: Run the focused tests and confirm GREEN**

Run: `CI=true npm test -- --runInBand src/services/__tests__/complianceApi.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/services/complianceApi.ts src/services/__tests__/complianceApi.test.ts
git commit -m "FIX: explain compliance upload transport failures"
```

---

### Task 2: Authoritative Operating Authority Schema

**Files:**
- Create: `supabase/migrations/20260808181500_operating_authority_register.sql`
- Create: `src/__tests__/operatingAuthorityRegisterMigration.test.js`
- Create: `src/__tests__/operatingAuthorityRegisterPglite.test.js`

**Interfaces:**
- Produces: `public.compliance_authority_types(code, label, category, display_order, active)`.
- Produces: `public.compliance_pending_uploads` with organisation, actor, internal file ID, object path, declared metadata, expiry and state.
- Produces: `public.ftf_read_operating_authority_register(uuid)`.
- Produces: `public.ftf_authorise_compliance_upload(uuid,uuid,jsonb)`.
- Produces: `public.ftf_finalize_operating_authority(uuid,uuid,jsonb)`.
- Produces: `public.ftf_append_operating_authority_evidence(uuid,uuid,uuid,integer,jsonb)`.

- [ ] **Step 1: Write migration contract tests**

Assert the migration seeds exactly the six approved type codes, preserves `REOC` compatibility, enables RLS, revokes public/anon/authenticated execution, grants trusted execution only to `service_role`, and includes audit/outbox writes in both finalisation commands.

- [ ] **Step 2: Write PGlite RED behaviour tests**

Cover two current authority records, multiple evidence rows on one authority, separate `INSTRUMENT` and `SPECIAL_APPROVAL`, append-only evidence rejection, stale expected version, cross-tenant denial, expired pending upload denial, single-use pending uploads, and atomic audit/outbox counts.

- [ ] **Step 3: Run the migration tests and confirm RED**

Run: `CI=true npm test -- --runInBand src/__tests__/operatingAuthorityRegisterMigration.test.js src/__tests__/operatingAuthorityRegisterPglite.test.js`

- [ ] **Step 4: Implement the additive migration**

Add `authority_type_code`, `legal_holder`, `organisation_arn`, `notes`, and optional `operating_location_id` to `organisation_compliance_instruments`. Backfill existing `instrument_type='REOC'` rows to `REOC_CERTIFICATE` without changing `instrument_type` until all current readers are compatible. Add `evidence_role`, `description`, `authority_row_version`, `storage_bucket` and `provider_key` to evidence. Create the pending-upload ledger with `PENDING`, `CONSUMED`, `EXPIRED` and `CANCELLED` states.

The atomic finaliser must lock each pending upload, confirm actor/organisation/state/expiry/metadata, create the authority, insert all evidence, consume uploads, emit audit/outbox, and return the register record plus manifest in one transaction.

- [ ] **Step 5: Preserve Compliance Health compatibility**

Update the current ReOC CTE to match `authority_type_code='REOC_CERTIFICATE'` or legacy `instrument_type='REOC'`. Variations and approvals must never satisfy the required-ReOC critical rule.

- [ ] **Step 6: Run database tests and confirm GREEN**

Run: `CI=true npm test -- --runInBand src/__tests__/operatingAuthorityRegisterMigration.test.js src/__tests__/operatingAuthorityRegisterPglite.test.js src/__tests__/complianceHealthCalendarMigration.test.js src/__tests__/complianceHealthScopeMigration.test.js`

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260808181500_operating_authority_register.sql src/__tests__/operatingAuthorityRegisterMigration.test.js src/__tests__/operatingAuthorityRegisterPglite.test.js
git commit -m "DB: add authoritative operating authority register"
```

---

### Task 3: Protected Direct Upload and Finalisation API

**Files:**
- Modify: `server/compliance-repository.js`
- Modify: `server/compliance-api.js`
- Modify: `src/__tests__/casaComplianceApi.test.js`

**Interfaces:**
- Consumes: Task 2 RPCs and pending-upload records.
- Produces: `repository.authoriseComplianceUpload(context, metadata)` returning `{ uploadId, internalFileId, uploadUrl, expiresAt }`.
- Produces: `repository.verifyComplianceUpload(context, uploadId)` returning verified metadata without exposing provider credentials.
- Produces API actions: `register`, `upload-authorise`, `authority-create`, `evidence-append`.

- [ ] **Step 1: Write API RED tests**

Verify `compliance.read` is required for register reads and `compliance.manage` for every upload/write. Reject filenames containing path separators, unsupported content types, zero-byte files, files over 20 MiB, invalid type codes, missing required dates, cross-origin writes and stale versions. Assert returned upload URLs are not logged or persisted in audit payloads.

- [ ] **Step 2: Run the API tests and confirm RED**

Run: `CI=true npm test -- --runInBand src/__tests__/casaComplianceApi.test.js`

- [ ] **Step 3: Implement upload authorisation**

Create the pending row through `ftf_authorise_compliance_upload`, then call Supabase Storage's signed-upload endpoint for the generated `compliance-evidence/<organisation>/<uploadId>/<internalFileId>/v1/<safe-name>` path. Return only the short-lived signed upload URL and safe IDs.

- [ ] **Step 4: Implement object verification and atomic finalisation**

Before calling either finalisation RPC, read the uploaded object through the trusted server, stream its SHA-256 calculation, compare actual size/content type to the pending declaration, and pass verified metadata to PostgreSQL. A mismatch rejects finalisation and leaves no authoritative record.

- [ ] **Step 5: Add safe correlation handling**

Return existing error envelopes with codes `UPLOAD_AUTHORISATION_FAILED`, `UPLOAD_VERIFICATION_FAILED`, `VALIDATION_ERROR`, `VERSION_CONFLICT`, `FORBIDDEN` and safe correlation IDs. Do not expose storage paths, signed queries or provider responses.

- [ ] **Step 6: Run API and existing compliance tests**

Run: `CI=true npm test -- --runInBand src/__tests__/casaComplianceApi.test.js src/__tests__/complianceEvidenceCommandsMigration.test.js`

- [ ] **Step 7: Commit**

```bash
git add server/compliance-repository.js server/compliance-api.js src/__tests__/casaComplianceApi.test.js
git commit -m "API: add protected compliance direct uploads"
```

---

### Task 4: Typed Multi-File Client Workflow

**Files:**
- Modify: `src/services/complianceApi.ts`
- Modify: `src/services/__tests__/complianceApi.test.ts`

**Interfaces:**
- Consumes: Task 3 actions.
- Produces: `readAuthorityRegister()`.
- Produces: `uploadAuthorityFiles(files: AuthorityEvidenceInput[], onProgress)`.
- Produces: `createAuthority(input, uploads)` and `appendAuthorityEvidence(authorityId, expectedVersion, uploads)`.

- [ ] **Step 1: Write client RED tests**

Assert three selected files obtain three independent authorisations, upload with each file's exact content type, report per-file progress/status, and submit only safe upload IDs during finalisation. Assert one failed upload preserves the successful upload results and never calls finalisation automatically.

- [ ] **Step 2: Run and confirm RED**

Run: `CI=true npm test -- --runInBand src/services/__tests__/complianceApi.test.ts`

- [ ] **Step 3: Implement typed APIs**

Use `XMLHttpRequest` for direct upload progress while keeping all Spray Command commands on same-origin `fetch`. Do not persist upload URLs or file bytes in browser storage. Explicitly clear signed targets from component state after finalisation or cancellation.

- [ ] **Step 4: Run and confirm GREEN**

Run: `CI=true npm test -- --runInBand src/services/__tests__/complianceApi.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/services/complianceApi.ts src/services/__tests__/complianceApi.test.ts
git commit -m "UX: support multi-file authority uploads"
```

---

### Task 5: ReOC and Operating Authority Workspace

**Files:**
- Modify: `src/pages/ReocComplianceWorkspace.tsx`
- Modify: `src/pages/__tests__/ReocComplianceWorkspace.test.tsx`
- Modify: `src/pages/CasaComplianceOverview.tsx`
- Modify: `src/pages/__tests__/CasaComplianceOverview.test.tsx`

**Interfaces:**
- Consumes: Task 4 register and upload APIs.
- Produces: user-facing ReOC and Operating Authority register at `/compliance/reoc`.

- [ ] **Step 1: Write workspace RED tests**

Cover grouped current records and history; actions for ReOC, variation, instrument/special approval and other authority; multiple file selection; evidence role/description; visible upload progress; failed-upload form preservation; successful authoritative refresh; multiple simultaneous current records; and direct issue links from Compliance Overview.

- [ ] **Step 2: Run and confirm RED**

Run: `CI=true npm test -- --runInBand src/pages/__tests__/ReocComplianceWorkspace.test.tsx src/pages/__tests__/CasaComplianceOverview.test.tsx`

- [ ] **Step 3: Implement the register summary and authority cards**

Show current ReOC first, then variations, instruments/special approvals, other CASA authorities and collapsed historical records. Each card shows type, number, status, expiry, scope and file count, with an accessible details expansion.

- [ ] **Step 4: Implement the multi-file add workflow**

Use one focused form with type-specific labels. `INSTRUMENT` and `SPECIAL_APPROVAL` expose authority number, operational scope and conditions. File rows expose filename, size, evidence role, optional description, progress, retry and remove. Preserve all metadata after any failure.

- [ ] **Step 5: Implement plain-language status and errors**

Display the exact safe phase: preparing upload, uploading, verifying or saving authority. For a large file, state that secure upload supports it; do not show the former generic request failure.

- [ ] **Step 6: Run focused UI tests and accessibility checks**

Run: `CI=true npm test -- --runInBand src/pages/__tests__/ReocComplianceWorkspace.test.tsx src/pages/__tests__/CasaComplianceOverview.test.tsx src/App.test.tsx`

- [ ] **Step 7: Commit**

```bash
git add src/pages/ReocComplianceWorkspace.tsx src/pages/__tests__/ReocComplianceWorkspace.test.tsx src/pages/CasaComplianceOverview.tsx src/pages/__tests__/CasaComplianceOverview.test.tsx
git commit -m "UX: build operating authority register workspace"
```

---

### Task 6: Production Verification and Release

**Files:**
- Modify only if a failing verification exposes a requirement defect in Tasks 1–5.

**Interfaces:**
- Consumes all prior tasks.
- Produces a verified repository-controlled migration and Production Beta release.

- [ ] **Step 1: Run the complete regression suite**

Run: `CI=true npm test -- --runInBand --silent`

Expected: all suites pass with zero failures.

- [ ] **Step 2: Run production build and source-integrity checks**

Run: `npm run build`

Run: `git diff --check`

Run the repository secret, credential and environment-file scans. Confirm no signed URL, upload token, service-role key or local environment file appears in the diff.

- [ ] **Step 3: Confirm release targets**

Confirm branch `codex/production-beta`, remote `BJT-FTF/Spray-Command`, linked Vercel project `spray-command-production-beta`, and the verified Spray Command Production Beta Supabase project before applying migration.

- [ ] **Step 4: Push without rewriting history**

Push `codex/production-beta` to `BJT-FTF/Spray-Command`. Do not force-push and preserve the isolated worktree.

- [ ] **Step 5: Apply the repository-controlled migration**

Apply only `20260808181500_operating_authority_register.sql`, verify migration history, RLS, function grants and database lint, and stop if the project target is ambiguous.

- [ ] **Step 6: Deploy Production Beta**

Deploy the pushed commit to `spray-command-production-beta` and wait for `READY`.

- [ ] **Step 7: Run live acceptance with genuine evidence**

Using an authorised Fly The Farm organisation session, upload the genuine ReOC PDF through the direct path; add more than one evidence file only when genuine files are available; record an instrument/special approval only from genuine evidence; refresh, re-login and verify a second authorised session. Verify tenant denial, stale concurrency, audit, outbox, derived Compliance Health and immutable existing history.

- [ ] **Step 8: Report**

Return commit SHA, migration result, deployment ID/URL/status, upload result, register/evidence manifest verification, tests/build/lint, tenant/concurrency/audit/outbox evidence, clean worktree and any genuine Product Owner action. Never expose signed URLs, tokens or credentials.

