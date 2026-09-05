# Task 12 report — Deterministic Mission reports

## Outcome

- Mission Summary and Mission Record now consume the canonical completion row's immutable `daily_evidence_manifest.reportEvidence` and `daily_evidence_digest` for finally signed-off Missions.
- The view model deterministically groups the frozen Job, Client, Properties and Fields; CRP/package/JSA authority history; operating days; Field hectares; aircraft totals and optional flights; planned-versus-actual chemicals; weather and coverage gaps; flight-line references; exceptions; and final sign-off.
- Frozen Properties, Fields, aircraft identities, chemical plans and flight-line metadata are resolved only within the frozen report manifest. Mutable `currentMission`, operational revisions and current catalogue data are ignored for canonical reports.
- A canonical completion with absent or malformed enriched evidence fails closed with an explicit unavailable status. A malformed digest also fails closed.
- Legacy completion rows remain renderable, but operating-day detail is explicitly labelled unavailable and no day records are fabricated from current state.
- Summary and Record PDF output is deterministic and exposes the same frozen authority boundary. UI copy now explains that reports do not refresh from live Mission state.

### Review hardening

- Canonical era-2 reports now load the complete document through `ftf_read_mission_frozen_report_document`; the worker passes no reconstructed or mutable substitute.
- The renderer hashes the exact transported UTF-8 `documentText` before parsing and compares it to the transported SHA-256 digest. Wrong valid-format digests, malformed JSON, oversized/deep structures, invalid decimals/timestamps, duplicate identities, and broken Field/aircraft/chemical/flight-line/governance cross-references fail closed as `MISSING_FROZEN_EVIDENCE`.
- Era-0/1 rows retain the explicit historical-unavailable path. A canonical failure renders no operating-day sections and never falls back to live state.
- The Mission Record Evidence Manifest is derived only from the decoded frozen completion identity and digest; arbitrary caller evidence IDs are not rendered.
- Summary and generic report rows paginate in bounded chunks. Maximum governance histories and hourly-weather arrays continue across pages without clipping into the footer.
- Flight Field/start/end/source evidence, chemical Field/quantity/optional batch, flight-line ID/format, and final `completedBy` are now rendered.

## TDD evidence

- RED: six server report tests initially failed because the existing model had no frozen source/status, no daily projection, no deterministic grouping, no malformed-evidence gate, and the renderers used mutable operational evidence.
- GREEN: focused server suite 12/12 PASS, including adversarial cross-reference, digest, mutable-leak and maximum-bound pagination cases.
- Component/view-model/renderer/worker regression suite: 5 suites / 17 tests PASS.

## Verification

- `node ./node_modules/jest/bin/jest.js --runInBand server/__tests__/multiday-mission-report.test.js`: 1 suite / 12 tests PASS.
- `TZ=Australia/Brisbane CI=true npm test -- --watchAll=false --runInBand src/__tests__/reportWorker.test.js src/__tests__/reportRenderer.test.js src/__tests__/reportViewModels.test.js src/components/mission/__tests__/MissionSummary.test.tsx src/components/mission/__tests__/MissionRecord.test.tsx`: 5 suites / 17 tests PASS.
- Production build: PASS with the repository's pre-existing Browserslist, lint-warning and bundle-size warning backlog.
- `git diff --check`: PASS.

## Files

- `server/report-view-models.js`
- `server/frozen-mission-report-document.js`
- `server/report-worker.js`
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
