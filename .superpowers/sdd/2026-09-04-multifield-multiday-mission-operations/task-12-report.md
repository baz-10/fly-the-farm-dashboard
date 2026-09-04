# Task 12 report — Deterministic Mission reports

## Outcome

- Mission Summary and Mission Record now consume the canonical completion row's immutable `daily_evidence_manifest.reportEvidence` and `daily_evidence_digest` for finally signed-off Missions.
- The view model deterministically groups the frozen Job, Client, Properties and Fields; CRP/package/JSA authority history; operating days; Field hectares; aircraft totals and optional flights; planned-versus-actual chemicals; weather and coverage gaps; flight-line references; exceptions; and final sign-off.
- Frozen Properties, Fields, aircraft identities, chemical plans and flight-line metadata are resolved only within the frozen report manifest. Mutable `currentMission`, operational revisions and current catalogue data are ignored for canonical reports.
- A canonical completion with absent or malformed enriched evidence fails closed with an explicit unavailable status. A malformed digest also fails closed.
- Legacy completion rows remain renderable, but operating-day detail is explicitly labelled unavailable and no day records are fabricated from current state.
- Summary and Record PDF output is deterministic and exposes the same frozen authority boundary. UI copy now explains that reports do not refresh from live Mission state.

## TDD evidence

- RED: six server report tests initially failed because the existing model had no frozen source/status, no daily projection, no deterministic grouping, no malformed-evidence gate, and the renderers used mutable operational evidence.
- GREEN: focused server suite 6/6 PASS.
- Component/view-model/renderer/migration regression suite: 5 suites / 12 tests PASS.

## Verification

- `CI=true npx jest --config '{"testEnvironment":"node","roots":["<rootDir>/server"]}' --runInBand server/__tests__/multiday-mission-report.test.js`: 1 suite / 6 tests PASS.
- `TZ=Australia/Brisbane CI=true npm test -- --watchAll=false ...`: 5 suites / 12 tests PASS.
- Production build: PASS with the repository's pre-existing Browserslist, lint-warning and bundle-size warning backlog.
- `git diff --check`: PASS.

## Files

- `server/report-view-models.js`
- `server/mission-summary-renderer.js`
- `server/report-renderer.js`
- `server/__tests__/multiday-mission-report.test.js`
- `src/components/mission/MissionSummary.tsx`
- `src/components/mission/MissionRecord.tsx`
- `src/components/mission/__tests__/MissionSummary.test.tsx`
- `src/components/mission/__tests__/MissionRecord.test.tsx`
- `src/__tests__/reportViewModels.test.js`
- `src/__tests__/reportRenderer.test.js`

## Boundaries

- No new report, database or read authority was introduced.
- No mutable current Mission child is used for finally signed-off reporting.
- No Production migration, deployment, alias operation or genuine data mutation occurred.
