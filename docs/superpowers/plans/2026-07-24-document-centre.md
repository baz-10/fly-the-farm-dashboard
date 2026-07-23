# Shared Document Centre Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give supported records consistent Export PDF, Save to Job, Print and View saved versions actions backed by an immutable, tenant-safe document register.

**Architecture:** Page-specific adapters create canonical snapshots; shared renderers apply one controlled-document frame; a document service coordinates validation, PDF generation, immutable file storage, registry metadata and job linkage. The first release integrates mission, weather and Safety Plan documents, then adds the other listed record types through the same contract.

**Tech Stack:** React 19, TypeScript 4.9, Material UI 7, jsPDF 4, authenticated Vercel functions, Supabase REST/storage, Jest, React Testing Library.

## Global Constraints

- Saved PDF revisions are immutable evidence.
- A save reports success only after file, metadata, job link and audit event are stored.
- Every PDF includes subscriber branding, unique ID, revision, job/mission links, preparer/timestamp, status/approval, page numbers and controlled-copy footer.
- Contractors cannot retrieve financial content through UI, API, PDF metadata or file URL.
- Tenant isolation is enforced at document registry and file-storage boundaries.
- Save to Job preselects a known job and otherwise requires an accessible job selection.
- Source edits never change saved revisions; another save creates a traceable revision.

---

## File structure

- Create `src/types/documents.ts`: source, snapshot, metadata and revision contracts.
- Create `src/documents/documentRegistry.ts`: document definition registration.
- Create `src/documents/pdf/controlledDocumentFrame.ts`: shared header/footer/page management.
- Create `src/documents/renderers/`: mission, weather and Safety Plan renderers.
- Create `src/services/documentCentreStore.ts`: registry persistence and save orchestration.
- Create `api/documents.js`: authenticated file create/read endpoint.
- Create `src/components/documents/DocumentActions.tsx`: consistent user actions.
- Create `src/pages/DocumentCentre.tsx`: searchable tenant register.
- Modify `api/store.js`, `src/services/persistence.ts`, `src/App.tsx`, `src/components/Layout.tsx`, source pages and `src/pages/JobDetail.tsx`.

### Task 1: Document contracts and permission policy

**Files:**
- Create: `src/types/documents.ts`
- Create: `src/utils/documentPermissions.ts`
- Test: `src/utils/__tests__/documentPermissions.test.ts`

**Interfaces:**
- Produces: `DocumentType`, `DocumentSnapshot`, `DocumentRevision`, `DocumentConfidentiality`, `DocumentSourceAdapter<T>`, `canViewDocument`, `canCreateDocument`, and `sanitizeDocumentForRole`.

- [ ] **Step 1: Write failing confidentiality tests**

```ts
test('removes financial fields for contractors', () => {
  const safe = sanitizeDocumentForRole(financialRevision, contractor);
  expect(JSON.stringify(safe)).not.toContain('grossMargin');
  expect(JSON.stringify(safe)).not.toContain('totalCost');
});

test('rejects cross-tenant access', () => {
  expect(canViewDocument(revisionForTenantA, adminForTenantB)).toBe(false);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- --watchAll=false src/utils/__tests__/documentPermissions.test.ts`

Expected: FAIL because contracts and policy do not exist.

- [ ] **Step 3: Implement contracts and deny-by-default policy**

Define exact source IDs, job/mission links, schema version, SHA-256 integrity field, storage key, creator/approver identities, revision lineage, confidentiality and audit events. Unknown document types or confidentiality values must return no access.

- [ ] **Step 4: Run permission tests**

Run: `npm test -- --watchAll=false src/utils/__tests__/documentPermissions.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/documents.ts src/utils/documentPermissions.ts src/utils/__tests__/documentPermissions.test.ts
git commit -m "feat: define secure document centre contracts"
```

### Task 2: Controlled PDF frame and registry

**Files:**
- Create: `src/documents/documentRegistry.ts`
- Create: `src/documents/pdf/controlledDocumentFrame.ts`
- Create: `src/documents/pdf/__tests__/controlledDocumentFrame.test.ts`

**Interfaces:**
- Produces: `registerDocumentDefinition(definition)`, `getDocumentDefinition(type)`, and `createControlledPdf(metadata): ControlledPdf`.
- `ControlledPdf` exposes `addHeading`, `addText`, `addTable`, `ensureSpace`, `finalize(): Blob`.

- [ ] **Step 1: Write frame metadata tests**

Create a two-page PDF, extract text using the existing PDF test helper, and assert company name, document ID/revision, linked job/mission, preparer, generated timestamp, `Page 1 of 2`, `Page 2 of 2`, confidentiality and “Controlled copy” appear.

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- --watchAll=false src/documents/pdf/__tests__/controlledDocumentFrame.test.ts`

Expected: FAIL because the shared frame does not exist.

- [ ] **Step 3: Implement shared frame**

Refactor reusable sanitisation/page-footer behavior from existing jsPDF utilities without changing their outputs. Accept optional tenant logo data and fall back to company name text. `finalize()` writes total page counts before returning `doc.output('blob')`.

- [ ] **Step 4: Run frame tests**

Run: `npm test -- --watchAll=false src/documents/pdf/__tests__/controlledDocumentFrame.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/documents
git commit -m "feat: add controlled document PDF framework"
```

### Task 3: Immutable registry and file API

**Files:**
- Create: `api/documents.js`
- Create: `server/documentStorage.js`
- Modify: `api/store.js`
- Modify: `src/services/persistence.ts`
- Create: `src/services/documentCentreStore.ts`
- Create: `src/services/__tests__/documentCentreStore.test.ts`
- Create: `src/__tests__/authenticated-documents-api.test.ts`

**Interfaces:**
- Produces: `saveDocumentRevision(request): Promise<DocumentRevision>`, `listDocumentRevisions(filters)`, `getDocumentDownloadUrl(revisionId)`, and authenticated `POST/GET /api/documents`.

- [ ] **Step 1: Write failing atomicity and access tests**

Verify a failed file upload creates no valid registry entry; a failed metadata write removes or marks the uploaded object failed; duplicate saves increment revision; tenant B cannot read tenant A; contractor access to financial revisions returns 403; storage paths are server-generated.

- [ ] **Step 2: Run and verify failure**

Run:

```bash
npm test -- --watchAll=false src/services/__tests__/documentCentreStore.test.ts
npm test -- --watchAll=false src/__tests__/authenticated-documents-api.test.ts
```

Expected: FAIL because the service/API do not exist.

- [ ] **Step 3: Implement server-owned storage**

Add `ftf_documents` to the allowed registry collections. `api/documents.js` authenticates every request, derives tenant/user/role server-side, caps PDF size, accepts only `application/pdf`, generates `tenantId/documentId/revisionId.pdf`, and returns short-lived authorised URLs or streams bytes after permission checks. Never expose a public bucket URL.

- [ ] **Step 4: Implement save orchestration**

Execute validate → snapshot → allocate ID/revision → render → upload → metadata → job link → audit. Return a typed stage error:

```ts
export class DocumentSaveError extends Error {
  constructor(public stage: 'validate' | 'render' | 'upload' | 'metadata' | 'job-link' | 'audit', message: string) {
    super(message);
  }
}
```

- [ ] **Step 5: Run store/API tests**

Run:

```bash
npm test -- --watchAll=false src/services/__tests__/documentCentreStore.test.ts
npm test -- --watchAll=false src/__tests__/authenticated-documents-api.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/documents.js api/store.js server/documentStorage.js src/services/persistence.ts src/services/documentCentreStore.ts src/services/__tests__/documentCentreStore.test.ts src/__tests__/authenticated-documents-api.test.ts
git commit -m "feat: store immutable controlled documents"
```

### Task 4: Shared document actions

**Files:**
- Create: `src/components/documents/DocumentActions.tsx`
- Create: `src/components/documents/SaveDocumentDialog.tsx`
- Create: `src/components/documents/__tests__/DocumentActions.test.tsx`

**Interfaces:**
- Consumes: `DocumentSourceAdapter<T>`, source record, current user and optional job ID.
- Produces: Export PDF, Save to Job, Print and View saved versions actions.

- [ ] **Step 1: Write action-state tests**

Assert a known job is preselected, missing jobs require an accessible selection, generation shows progress, a failed stage shows its message without success, successful save exposes revision ID, Print opens the generated PDF only after rendering, and financial actions are hidden from contractors.

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- --watchAll=false src/components/documents/__tests__/DocumentActions.test.tsx`

Expected: FAIL because the controls do not exist.

- [ ] **Step 3: Implement the controls**

Use one menu button labelled `Document actions`. Disable repeat submission while saving. Generate Export/Print PDFs from the same canonical snapshot used by Save to Job. Revoke temporary object URLs after download/print.

- [ ] **Step 4: Run component tests**

Run: `npm test -- --watchAll=false src/components/documents/__tests__/DocumentActions.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/documents
git commit -m "feat: add shared document actions"
```

### Task 5: Mission, weather and Safety Plan adapters

**Files:**
- Create: `src/documents/renderers/missionDocument.ts`
- Create: `src/documents/renderers/weatherDocument.ts`
- Create: `src/documents/renderers/safetyPlanDocument.ts`
- Create: `src/documents/renderers/__tests__/operationalDocuments.test.ts`
- Modify: `src/pages/MissionPlanning.tsx`
- Modify: `src/pages/MissionRegister.tsx`
- Modify: `src/pages/Weather.tsx`
- Modify: `src/pages/SafetyPlanEditor.tsx`

**Interfaces:**
- Produces registered definitions for `mission-work-pack`, `weather-log`, and `safety-plan`.

- [ ] **Step 1: Write renderer snapshot/PDF tests**

Assert mission output contains boundary/work-pack/JSA references but no unauthorised costs; weather output contains location, forecast/observation time, Delta T, inversion potential and source; Safety Plan output contains source master revision, job details, sections, linked risks and approval.

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- --watchAll=false src/documents/renderers/__tests__/operationalDocuments.test.ts`

Expected: FAIL because the renderers do not exist.

- [ ] **Step 3: Implement adapters and page integration**

Each adapter validates required identifiers and returns a serialisable snapshot with `schemaVersion: 1`. Add `DocumentActions` to the relevant detail/editor header; do not place save actions on incomplete list-card summaries.

- [ ] **Step 4: Run renderer and page tests**

Run:

```bash
npm test -- --watchAll=false src/documents/renderers/__tests__/operationalDocuments.test.ts src/pages/MissionRegister.test.tsx src/pages/Weather.test.tsx src/pages/SafetyPlanEditor.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/documents/renderers src/pages/MissionPlanning.tsx src/pages/MissionRegister.tsx src/pages/Weather.tsx src/pages/SafetyPlanEditor.tsx
git commit -m "feat: export operational controlled documents"
```

### Task 6: Document Centre and Job document register

**Files:**
- Create: `src/pages/DocumentCentre.tsx`
- Create: `src/pages/DocumentCentre.test.tsx`
- Modify: `src/pages/JobDetail.tsx`
- Create: `src/pages/JobDetail.documents.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/navigation/navigationConfig.tsx`

**Interfaces:**
- Consumes: document registry list/download functions.
- Produces: `/documents` register and job-scoped Documents card.

- [ ] **Step 1: Write register tests**

Test filters for job, mission, type, status, creator and date; revision lineage; preview/download/print; contractor financial exclusion; and the Job detail register showing only linked revisions.

- [ ] **Step 2: Run and verify failure**

Run:

```bash
npm test -- --watchAll=false src/pages/DocumentCentre.test.tsx src/pages/JobDetail.documents.test.tsx
```

Expected: FAIL because register pages are absent.

- [ ] **Step 3: Implement register UI and routes**

Add Document Centre under Safety and compliance, with server-filtered results and no client-side fetch of forbidden metadata. Add a Job Documents card with title, type, revision, status, created by/time and actions.

- [ ] **Step 4: Run register tests**

Run:

```bash
npm test -- --watchAll=false src/pages/DocumentCentre.test.tsx src/pages/JobDetail.documents.test.tsx src/App.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/DocumentCentre.tsx src/pages/DocumentCentre.test.tsx src/pages/JobDetail.tsx src/pages/JobDetail.documents.test.tsx src/App.tsx src/navigation/navigationConfig.tsx
git commit -m "feat: add controlled document registers"
```

### Task 7: Remaining document types and release verification

**Files:**
- Create: `src/documents/renderers/jsaDocument.ts`
- Create: `src/documents/renderers/maintenanceDocument.ts`
- Create: `src/documents/renderers/jobReportDocument.ts`
- Create: `src/documents/renderers/quoteDocument.ts`
- Create: `src/documents/renderers/jobActualDocument.ts`
- Modify: `src/pages/JSAManagement.tsx`
- Modify: `src/pages/MaintenanceCommand.tsx`
- Modify: `src/pages/JobDetail.tsx`
- Modify: `src/pages/QuoteDetail.tsx`
- Modify: `src/pages/ActualDetail.tsx`
- Test: `src/documents/renderers/__tests__/remainingDocuments.test.ts`

**Interfaces:**
- Produces registered definitions for JSA/risk, maintenance/technical logs, job/Ask FTF reports, quotes and job actuals.

- [ ] **Step 1: Write renderer and privacy tests**

Verify each snapshot contains its required operational fields. Assert contractor Job Actual rendering excludes revenue, cost, gross profit and margin, while authorised company-admin rendering includes them.

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- --watchAll=false src/documents/renderers/__tests__/remainingDocuments.test.ts`

Expected: FAIL because remaining adapters do not exist.

- [ ] **Step 3: Implement adapters and attach shared actions**

Move existing report bodies behind registered definitions where practical, retaining current direct-download entry points until regression tests confirm equivalent output. Apply `DocumentActions` to detail views and use role-filtered snapshots before any PDF bytes are generated.

- [ ] **Step 4: Run complete verification**

Run:

```bash
npm test -- --watchAll=false src/documents src/components/documents src/services/__tests__/documentCentreStore.test.ts src/__tests__/authenticated-documents-api.test.ts src/pages/DocumentCentre.test.tsx src/pages/JobDetail.documents.test.tsx
npm test -- --watchAll=false
npm run build
```

Expected: all tests PASS, privacy assertions PASS, and production build completes.

- [ ] **Step 5: Commit**

```bash
git add src/documents/renderers src/pages/JSAManagement.tsx src/pages/MaintenanceCommand.tsx src/pages/JobDetail.tsx src/pages/QuoteDetail.tsx src/pages/ActualDetail.tsx
git commit -m "feat: extend document centre across records"
```

