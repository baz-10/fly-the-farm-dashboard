# Mission Pack PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a downloadable, operator-safe Mission Pack PDF containing saved mission, JSA and risk-assessment records.

**Architecture:** A new pure PDF utility explicitly selects non-financial fields from `MissionRecord`, renders them through `jsPDF`, and exposes deterministic captured text for unit testing. The Missions register invokes the utility from each mission card, saves the document locally, and surfaces export failures without leaving the page.

**Tech Stack:** React 19, TypeScript 5.9, MUI 7, jsPDF 4, Vitest 4, Testing Library.

## Global Constraints

- The standard Mission Pack must never include financial estimates, actual costs, margin or profit.
- Export must work for every saved mission status and must not be blocked by missing optional data.
- Mission safety labels must come from `MISSION_CHECKS`.
- No new database endpoint or schema is required.

---

### Task 1: Mission Pack PDF renderer

**Files:**
- Create: `src/utils/missionPackPdf.ts`
- Create: `src/utils/__tests__/missionPackPdf.test.ts`

**Interfaces:**
- Consumes: `MissionRecord` from `src/types/mission.ts` and `MISSION_CHECKS` plus `calculateRiskScore` from `src/utils/missionSafety.ts`.
- Produces: `missionPackPdfFilename(mission: Pick<MissionRecord, 'missionNumber' | 'missionName'>): string`, `buildMissionPackPdf(mission: MissionRecord, options?: { generatedAt?: Date }): jsPDF`, and `downloadMissionPackPdf(mission: MissionRecord): void`.

- [ ] **Step 1: Write failing filename and incomplete-record tests**

Create tests that expect a sanitised `Mission_Pack_MSN-001_North_Block.pdf` filename and expect a minimal legacy record to produce a document containing `MISSION PACK`, its mission identity and `Not recorded`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/utils/__tests__/missionPackPdf.test.ts`

Expected: FAIL because `../missionPackPdf` does not exist.

- [ ] **Step 3: Implement the document shell and safe formatters**

Create an A4 `jsPDF` document with text sanitisation, wrapped lines, page breaks, headings, page numbers and an internal non-enumerable `__missionPackText` array. Implement the filename helper and document-control cover.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/utils/__tests__/missionPackPdf.test.ts`

Expected: filename and incomplete-record tests PASS.

- [ ] **Step 5: Write failing content and privacy tests**

Build a representative `MissionRecord` and assert the captured text includes:

```text
Mission and site
Aircraft and deployment work pack
Weather
Boundary, map and flight plan
Mission Checks / JSA
Risk Assessment
Compliance and authorisations
Audit and execution
```

Assert exact JSA questions, Yes/No answers, notes, triggered risk scores and mitigation are present. Give `financialEstimate` and `financialActual` unique sentinel strings when casting the fixture and assert neither sentinel appears.

- [ ] **Step 6: Run the focused test and verify RED**

Run: `npm test -- src/utils/__tests__/missionPackPdf.test.ts`

Expected: FAIL because the required content sections are absent.

- [ ] **Step 7: Implement explicit operational-field rendering**

Render only named safe fields from mission/site, aircraft/work pack, operation, chemical, weather, boundary/map, flight plan, JSA, risk, compliance, approval, audit and execution structures. Use `MISSION_CHECKS` for question order and labels, and `calculateRiskScore` for control scores. Do not traverse or stringify the mission object.

- [ ] **Step 8: Run renderer tests and verify GREEN**

Run: `npm test -- src/utils/__tests__/missionPackPdf.test.ts`

Expected: all Mission Pack PDF tests PASS.

- [ ] **Step 9: Commit the renderer**

```bash
git add src/utils/missionPackPdf.ts src/utils/__tests__/missionPackPdf.test.ts
git commit -m "feat: generate operator-safe mission pack pdf"
```

### Task 2: Missions register export action

**Files:**
- Modify: `src/pages/MissionRegister.tsx`
- Modify: `src/pages/MissionRegister.test.tsx`

**Interfaces:**
- Consumes: `downloadMissionPackPdf(mission: MissionRecord): void`.
- Produces: an accessible `Export Mission Pack for <mission name>` card action and an error alert when generation throws.

- [ ] **Step 1: Write a failing UI test**

Mock `downloadMissionPackPdf`, click the Planning mission’s export action, and assert it receives that complete mission object without triggering navigation.

- [ ] **Step 2: Run the focused UI test and verify RED**

Run: `npm test -- src/pages/MissionRegister.test.tsx`

Expected: FAIL because the export action is not rendered.

- [ ] **Step 3: Add the export action and error state**

Add a download icon button or compact outlined button beside **Open**, call `downloadMissionPackPdf`, catch synchronous errors, and display `Mission Pack could not be exported: <message>` in a page alert.

- [ ] **Step 4: Add and verify the failure test**

Configure the mock to throw, click export, and assert the error alert is visible.

Run: `npm test -- src/pages/MissionRegister.test.tsx`

Expected: all Mission register tests PASS.

- [ ] **Step 5: Commit the register integration**

```bash
git add src/pages/MissionRegister.tsx src/pages/MissionRegister.test.tsx
git commit -m "feat: export mission packs from mission register"
```

### Task 3: Full verification

**Files:**
- Modify only if verification exposes a Mission Pack regression.

**Interfaces:**
- Consumes the complete branch.
- Produces verified test and build evidence.

- [ ] **Step 1: Run all unit tests**

Run: `npm test`

Expected: all test files and tests PASS with zero failures.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: TypeScript validation and Vite production build complete with exit code 0.

- [ ] **Step 3: Inspect the final diff**

Run: `git diff --check origin/main...HEAD && git status --short`

Expected: no whitespace errors and only intentional Mission Pack documents/code/tests.

- [ ] **Step 4: Commit any final verification-only correction**

If and only if verification required a code correction:

```bash
git add <corrected-files>
git commit -m "fix: finalise mission pack export"
```
