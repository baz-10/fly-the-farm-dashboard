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

### Review round 2

- Added forward migration `20260905180000_report_job_frozen_document_authority.sql`. Report authority is checked and bound when the immutable artefact is inserted using the active seat, Base scope, `reports.generate`, and report-type permission. The worker-safe read is then constrained to the exact GENERATING job, artefact, organisation, Base, Mission and completion identity; it intentionally does not re-evaluate mutable user authority later and cannot enumerate reports.
- Expanded recursive validation across governance package/decision/JSA lineage, JSA review parents, Field activity parents, aircraft actual/flight parents, chemical revision/line parents, weather package/day parents, and flight-line attribution parents. Digest-valid but internally inconsistent documents fail closed.
- Both Mission Summary and Mission Record now render the frozen `operationalDays`, `actualWorkHours`, and `totalAircraftHours` aggregate totals.

### Review round 3

- Added forward migration `20260905190000_report_idempotency_and_governance_lineage.sql`. `ftf_request_report_artefact` now authorises and loads the requested Mission before checking reuse, and an existing organisation-wide key is reusable only for the exact Mission, report type, Base and requesting actor. Every mismatch returns `REPORT_IDEMPOTENCY_SCOPE_MISMATCH`; the API exposes a bounded 409 without returning the foreign artefact.
- Executable PGlite coverage proves same-organisation cross-Base/Mission, report-type and requester collisions fail closed while exact-scope retry succeeds. API coverage proves the bounded 409 mapping.
- Newly frozen governance evidence now carries package-to-JSA lineage on effective and historical package rows and package lineage on effective approval. The decoder requires effective package, approval and JSA values to equal their corresponding immutable history rows and requires the approval/package/JSA chain to be exact.

### Review round 4

- Removed the incorrect `STABLE` volatility declaration from the governance wrapper: it reaches the existing locking manifest builder and is now correctly VOLATILE by default.
- Report idempotency now acquires a transaction-scoped advisory lock derived from the organisation and idempotency key before lookup. Same-scope retries remain reusable; competing cross-scope callers serialize and then receive the bounded mismatch response.
- The real full migration-chain PostgreSQL test exercises the locking builder, freezes a report, and proves the new effective package/JSA, package-history/JSA and approval/package lineage. This passed; it is not a stubbed builder test.
- PGlite executes the lock and scope behavior but uses a single embedded database connection, so it cannot model two genuinely independent PostgreSQL sessions. Static order coverage proves lock-before-lookup; Production-grade multi-session contention remains an integration concern rather than being overstated here.
- The strict decoder now requires the matched effective decision to be exactly `AUTHORISED`; a digest-valid `REJECTED` mutation fails closed.

### Final whole-slice review

- The bounded generic JSON decoder now accepts finite decimal numbers instead of incorrectly restricting every number to a safe integer. Recognised weather coordinates and observations are still decoded through an exact schema with bounded finite ranges and timestamps; malformed, out-of-range and non-canonical structures fail closed.
- Added representative decimal weather coverage for latitude/longitude, temperature, humidity, dew point, wind speed/direction and rainfall, plus an adversarial out-of-range decimal case.
- Canonical current-era Mission Summary and Mission Record generation now throws the safe typed `FROZEN_REPORT_EVIDENCE_INVALID` rendering error before PDF construction when the frozen digest or schema is absent or invalid. It cannot continue into object storage or artefact completion.
- The worker persists that deterministic integrity failure as terminal `FAILED` through forward migration `20260905210000_fail_invalid_frozen_report_job.sql`; it neither stores a PDF nor marks the artefact READY and it does not retry the same invalid immutable document. Error persistence is limited to the bounded code and safe public message.
- Genuine historical era-0/1 completion remains a separate explicit unavailable report path. It is not treated as a malformed canonical report and never fabricates current operational evidence.
- Final schema alignment replaces the invented weather aliases with the exact `mission_day_weather_reports` frozen row contract: `source` is bounded to `OPEN_METEO|MANUAL`, `coverage` to `ACTUAL_INTERVAL|FULL_DAY`, all 24 post-`organisation_id` keys are required, coordinates are bounded database-emitted JSON decimals, and provider/manual provenance is source-consistent. The view model renders these exact frozen fields.
- An executable PostgreSQL fixture now creates a real weather report row, obtains the same `to_jsonb(weather) - 'organisation_id'` shape used by the frozen manifest, and proves that shape passes the production decoder. Handwritten positive fixtures mirror that proven shape rather than defining a parallel schema.
- Required and nullable evidence are validated separately. Final completion, governance history, observation/gap and weather-row timestamps reject null, absence and calendar-impossible values; required report coordinates reject null/absence/out-of-range values. Explicitly nullable operating-day/flight times and provider/manual alternatives remain nullable only where the database schema permits them.

## TDD evidence

- RED: six server report tests initially failed because the existing model had no frozen source/status, no daily projection, no deterministic grouping, no malformed-evidence gate, and the renderers used mutable operational evidence.
- GREEN: focused server suite 31/31 PASS, including database-aligned decimal weather, required/null/calendar-invalid evidence, adversarial cross-reference, governance equality/decision state, parent-lineage, digest, typed render abort, mutable-leak and maximum-bound pagination cases.
- Component/view-model/renderer/worker/authority/API regression suite: 8 suites / 23 tests PASS in the final focused run.

## Verification

- `node ./node_modules/jest/bin/jest.js --runInBand server/__tests__/multiday-mission-report.test.js`: 1 suite / 31 tests PASS.
- `TZ=Australia/Brisbane CI=true npm test -- --watchAll=false --runInBand ...`: 8 suites / 23 tests PASS, including the complete Mission migration-chain behavior and no-store/no-complete worker failure path.
- Production build: PASS with the repository's pre-existing Browserslist, lint-warning and bundle-size warning backlog.
- Round-4 database/API/worker focus: 7 suites / 21 tests PASS, including the real full migration-chain PostgreSQL test.
- `git diff --check`: PASS.

## Files

- `server/report-view-models.js`
- `server/frozen-mission-report-document.js`
- `server/report-worker.js`
- `server/report-rendering-error.js`
- `supabase/migrations/20260905180000_report_job_frozen_document_authority.sql`
- `src/__tests__/reportJobFrozenDocumentAuthorityMigration.test.js`
- `supabase/migrations/20260905190000_report_idempotency_and_governance_lineage.sql`
- `src/__tests__/reportIdempotencyScopePglite.test.js`
- `src/__tests__/reportIdempotencyApi.test.js`
- `server/operational-api.js`
- `server/operational-repository.js`
- `server/mission-summary-renderer.js`
- `server/report-renderer.js`
- `server/__tests__/multiday-mission-report.test.js`
- `src/components/mission/MissionSummary.tsx`
- `src/components/mission/MissionRecord.tsx`
- `src/components/mission/__tests__/MissionSummary.test.tsx`
- `src/components/mission/__tests__/MissionRecord.test.tsx`
- `src/__tests__/reportViewModels.test.js`
- `src/__tests__/reportRenderer.test.js`
- `src/__tests__/reportWorkerFrozenFailure.test.js`
- `src/__tests__/reportFrozenFailureMigration.test.js`
- `supabase/migrations/20260905210000_fail_invalid_frozen_report_job.sql`

## Boundaries

- No new report or read authority was introduced. The forward migration changes only failure-state handling for an already-authorised report worker transition.
- No mutable current Mission child is used for finally signed-off reporting.
- No Production migration, deployment, alias operation or genuine data mutation occurred.
