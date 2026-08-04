# Mission Document Purpose Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the database-export-style Mission Pack with a six-page operational document, add an immutable two-page Mission Summary after completion, and leave Mission Record rendering unchanged.

**Architecture:** Keep the existing durable report artefact, worker, storage and download pipeline. Add `MISSION_SUMMARY` as a separately permissioned report type and split rendering into type-specific templates that consume focused view models built from immutable evidence. Mission Pack and Mission Summary use fixed page contracts; Mission Record continues through its current comprehensive renderer.

**Tech Stack:** React 19, TypeScript, Node.js, jsPDF, PostgreSQL/Supabase SQL migrations, Jest, React Testing Library, Poppler.

## Global Constraints

- Requirement ID: `IMP-REP-001`.
- Mission Pack is exactly six operational pages and is available only during Planning and Pre-flight.
- Mission Summary is exactly two pages and requires immutable Mission Completion.
- Mission Record output and historical versions remain unchanged.
- Every Mission Pack footer shows Mission Number, Client, Property, Report Version and Page X of Y.
- Mission Summary shows one derived completion-status sentence near the top.
- Authoritative PDFs remain server-generated, immutable, internally stored and provider-neutral.
- Tenant isolation, operating-location scope, permissions, audit, outbox, retries and checksums remain mandatory.
- Do not print raw evidence trees, generic evidence manifests, provider URLs or empty database structures in Mission Pack or Mission Summary.

---

### Task 1: Add the Mission Summary report contract and lifecycle gates

**Files:**
- Create: `supabase/migrations/20260804040000_mission_summary_report.sql`
- Modify: `server/operational-api.js`
- Modify: `src/services/reportsApi.ts`
- Test: `src/__tests__/missionSummaryReportMigration.test.js`
- Test: `src/__tests__/reportArtefactOperationalApi.test.js`
- Test: `src/services/__tests__/reportsApi.test.ts`

**Interfaces:**
- Consumes: existing `ftf_request_report_artefact(...)`, `createReportsHandler(...)`, and `ReportType`.
- Produces: `ReportType = 'MISSION_PACK' | 'MISSION_SUMMARY' | 'MISSION_RECORD'`, permission `mission.summary.generate`, completion-gated Mission Summary evidence and operation-gated Mission Pack requests.

- [ ] **Step 1: Write failing migration and API tests**

```js
test('Mission Summary requires completion and Mission Pack rejects an operational Mission', async () => {
  repository.requestReportArtefact.mockResolvedValueOnce({ completionRequired: true });
  // POST MISSION_SUMMARY must return COMPLETION_REQUIRED.
  repository.requestReportArtefact.mockResolvedValueOnce({ operationStarted: true });
  // POST MISSION_PACK must return OPERATION_STARTED.
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- --watchAll=false --runInBand src/__tests__/missionSummaryReportMigration.test.js src/__tests__/reportArtefactOperationalApi.test.js src/services/__tests__/reportsApi.test.ts`

Expected: FAIL because `MISSION_SUMMARY`, its permission and lifecycle result are unsupported.

- [ ] **Step 3: Add repository-controlled SQL and transport support**

The migration must extend the report type constraint, provision `mission.summary.generate`, capture Completion plus exact Operational and post-Mission evidence into the artefact manifest, return `completion_required` before completion, and return `operation_started` for Mission Pack after an operational revision exists. Update the API allow-list and service union without changing endpoint paths.

- [ ] **Step 4: Re-run focused tests and verify GREEN**

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260804040000_mission_summary_report.sql server/operational-api.js src/services/reportsApi.ts src/__tests__/missionSummaryReportMigration.test.js src/__tests__/reportArtefactOperationalApi.test.js src/services/__tests__/reportsApi.test.ts
git commit -m "NEW-REP-001 add Mission Summary report contract"
```

### Task 2: Build focused immutable report view models

**Files:**
- Create: `server/report-view-models.js`
- Create: `src/__tests__/reportViewModels.test.js`

**Interfaces:**
- Consumes: `{ reportType, evidence, artefact, branding }` captured by the report worker.
- Produces: `buildMissionPackViewModel(input)` and `buildMissionSummaryViewModel(input)` containing only explicitly selected display values, map features and footer identity.

- [ ] **Step 1: Write failing view-model tests with complete realistic fixtures**

```js
const pack = buildMissionPackViewModel(input);
expect(pack.footer).toEqual({ missionNumber: 'PB-001', client: 'Client A', property: 'Property A', reportVersion: 3 });
expect(pack.pages.map(page => page.key)).toEqual(['summary', 'map', 'weather', 'chemicals', 'jsa', 'preflight']);
expect(JSON.stringify(pack)).not.toMatch(/provider_key|checksum|operationalEvidence|customerOutcomes/);
```

Assert the summary completion status derives `Mission completed with operational exceptions.` when the completion override or operational exception evidence exists, otherwise `Mission completed successfully.`.

- [ ] **Step 2: Run and verify RED because the builders do not exist**

- [ ] **Step 3: Implement explicit selectors and bounded text helpers**

Do not recursively walk arbitrary evidence. Return fixed page-shaped objects and preserve selected revision IDs internally only where rendering or traceability requires them.

- [ ] **Step 4: Re-run and verify GREEN**

- [ ] **Step 5: Commit**

```bash
git add server/report-view-models.js src/__tests__/reportViewModels.test.js
git commit -m "IMP-REP-001 select operational report content"
```

### Task 3: Render the six-page Mission Pack

**Files:**
- Create: `server/mission-pack-renderer.js`
- Modify: `server/report-renderer.js`
- Modify: `src/__tests__/reportRenderer.test.js`

**Interfaces:**
- Consumes: `buildMissionPackViewModel(input)`.
- Produces: deterministic six-page A4 PDF bytes for `MISSION_PACK`; delegates `MISSION_RECORD` to the unchanged comprehensive renderer.

- [ ] **Step 1: Write failing observable PDF tests**

Use `pdf-lib`/`pdfjs-dist` only if already installed; otherwise use jsPDF page metadata and extracted PDF text. Assert six pages, approved headings, footer identity on every page and absence of raw lifecycle/evidence-register headings.

```js
expect(readPageCount(pdf)).toBe(6);
for (const token of ['Mission Number PB-001', 'Client Client A', 'Property Property A', 'Report v3']) {
  expect(countText(pdf, token)).toBe(6);
}
expect(text).not.toContain('Evidence Manifest');
```

- [ ] **Step 2: Run and verify RED against the current unbounded renderer**

- [ ] **Step 3: Implement six intentional pages**

Page 1 summary, page 2 authoritative map, page 3 forecast/observation weather, page 4 chemical plan, page 5 JSA/risk/emergency contacts, and page 6 pre-flight/readiness/approvals. Use fixed page breaks and fail with a safe render error if bounded content cannot fit legibly.

- [ ] **Step 4: Re-run renderer tests and verify GREEN**

- [ ] **Step 5: Commit**

```bash
git add server/mission-pack-renderer.js server/report-renderer.js src/__tests__/reportRenderer.test.js
git commit -m "IMP-REP-001 render six-page Mission Pack"
```

### Task 4: Render the two-page Mission Summary

**Files:**
- Create: `server/mission-summary-renderer.js`
- Modify: `server/report-renderer.js`
- Modify: `src/__tests__/reportRenderer.test.js`

**Interfaces:**
- Consumes: `buildMissionSummaryViewModel(input)`.
- Produces: deterministic two-page A4 PDF bytes for `MISSION_SUMMARY` with derived completion status and Mission Record link/QR code.

- [ ] **Step 1: Write failing tests for page count, status and content boundary**

```js
expect(readPageCount(pdf)).toBe(2);
expect(text).toContain('Mission completed with operational exceptions.');
expect(text).toContain('Actual Operations');
expect(text).toContain('Outcome and Coverage');
expect(text).not.toContain('Planning Evidence');
```

- [ ] **Step 2: Run and verify RED**

- [ ] **Step 3: Implement the two-page template**

Render actual weather/resources/chemical/water/area/times/notes on page 1. Render completed flight lines, coverage, Customer Outcome and a scannable QR plus human-readable Mission Record URL on page 2. The URL points to Spray Command's authorised Mission page, never a storage-provider object.

- [ ] **Step 4: Re-run and verify GREEN**

- [ ] **Step 5: Commit**

```bash
git add server/mission-summary-renderer.js server/report-renderer.js src/__tests__/reportRenderer.test.js
git commit -m "NEW-REP-001 render two-page Mission Summary"
```

### Task 5: Expose Mission Summary after completion

**Files:**
- Create: `src/components/mission/MissionSummary.tsx`
- Create: `src/components/mission/__tests__/MissionSummary.test.tsx`
- Modify: `src/components/mission/MissionOperationalCloseout.tsx`
- Modify: `src/components/reports/ReportArtefactStatus.tsx`
- Modify: `src/components/reports/__tests__/ReportArtefactStatus.test.tsx`

**Interfaces:**
- Consumes: existing `ReportArtefactStatus` and completed Mission state.
- Produces: one clear post-completion Mission Summary request/history/download workflow alongside, but distinct from, Mission Record.

- [ ] **Step 1: Write failing UI tests**

Assert completed Missions show headings `Mission Summary` and `Mission Record`, summary copy says it is a concise two-page actuals report, and the generic artefact component requests `MISSION_SUMMARY`.

- [ ] **Step 2: Run and verify RED**

- [ ] **Step 3: Implement the minimal completed-Mission UI**

Keep Mission Record unchanged. Add the summary above it in completion history and use the existing durable report status interaction.

- [ ] **Step 4: Re-run and verify GREEN**

- [ ] **Step 5: Commit**

```bash
git add src/components/mission/MissionSummary.tsx src/components/mission/__tests__/MissionSummary.test.tsx src/components/mission/MissionOperationalCloseout.tsx src/components/reports/ReportArtefactStatus.tsx src/components/reports/__tests__/ReportArtefactStatus.test.tsx
git commit -m "NEW-REP-001 expose completed Mission Summary"
```

### Task 6: Verify rendered PDFs visually and protect Mission Record

**Files:**
- Create: `scripts/render-report-fixtures.js`
- Create: `src/__tests__/missionRecordRendererRegression.test.js`
- Output: `output/pdf/mission-pack-sample.pdf`
- Output: `output/pdf/mission-summary-sample.pdf`

**Interfaces:**
- Consumes: the real type-specific renderers with deterministic representative evidence.
- Produces: inspectable PDF fixtures and a byte/text regression proving `MISSION_RECORD` stays on its comprehensive renderer.

- [ ] **Step 1: Add a failing Mission Record routing regression**

Assert Mission Record still contains all six comprehensive lifecycle sections and is not limited to six or two pages by the new renderers.

- [ ] **Step 2: Verify RED before adding explicit renderer routing**

- [ ] **Step 3: Add deterministic fixture generation and explicit type routing**

- [ ] **Step 4: Generate and inspect every page**

Run:

```bash
node scripts/render-report-fixtures.js
pdfinfo output/pdf/mission-pack-sample.pdf
pdfinfo output/pdf/mission-summary-sample.pdf
pdftoppm -png output/pdf/mission-pack-sample.pdf tmp/pdfs/mission-pack
pdftoppm -png output/pdf/mission-summary-sample.pdf tmp/pdfs/mission-summary
```

Inspect all eight PNG pages for clipping, overlap, missing maps, unreadable tables and malformed headers/footers. Correct defects through additional RED/GREEN cycles.

- [ ] **Step 5: Commit**

```bash
git add scripts/render-report-fixtures.js src/__tests__/missionRecordRendererRegression.test.js output/pdf/mission-pack-sample.pdf output/pdf/mission-summary-sample.pdf
git commit -m "IMP-REP-001 verify operational report layouts"
```

### Task 7: Full verification, migration, deployment and live proof

**Files:**
- Modify only files required by defects discovered during verification.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: deployed Production Beta Mission Pack and Mission Summary with immutable history and no Mission Record regression.

- [ ] **Step 1: Run complete verification**

```bash
npm test -- --watchAll=false --runInBand
npm run build
git diff --check
```

- [ ] **Step 2: Confirm the Supabase CLI is linked to project `fzkrvglzompkuiodqllr`**

- [ ] **Step 3: Apply the repository migration and deploy Production Beta**

- [ ] **Step 4: Generate one real Mission Pack before operations and prove six pages**

Verify exact selected evidence, footer identity on all pages, refresh/re-login/second session, tenant/location denial, audit/outbox, checksum and no local fallback.

- [ ] **Step 5: Generate one real Mission Summary from a completed Mission and prove two pages**

Verify completion status, actuals, coverage, Customer Outcome, Mission Record link/QR, immutable version history, audit/outbox and no local fallback.

- [ ] **Step 6: Confirm existing Mission Record artefacts and new generation remain comprehensive and unchanged**

- [ ] **Step 7: Commit any verification-only corrections and push `codex/production-beta`**

