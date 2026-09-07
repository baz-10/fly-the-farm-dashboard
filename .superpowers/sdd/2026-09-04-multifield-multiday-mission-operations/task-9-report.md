# Task 9 Report — Daily Chemical Actuals and Frozen Weather Reports

## Status

Implemented in the supplied isolated worktree. No Production application, database, storage service, or external weather service was contacted, and no subagents were used.

## Delivered

- Added append-only `mission_day_chemical_revisions` and exact per-day/Field `mission_day_chemical_lines` beneath the existing Mission operating-day, package and chemical-plan authorities. Planned lines are projected only as proposals; no actual row exists until explicit confirmation.
- Preserved canonical product identity and snapshots from the day-bound chemical plan. Each actual retains exact fixed-scale rate and applied quantity, batch/lot, Field, and optional aircraft attribution. Aircraft provenance is accepted only when the aircraft appears in that exact day-bound package and belongs to the same Base.
- Added optimistic day/revision concurrency, active-seat and exact Mission Operations read/write permission checks, organisation/Base/Mission/package/day/Field scope, append-only history, audit events, and transactional outbox events.
- Enforced pre-operation reauthorisation for material product/rate changes. Once authoritative operation start exists, actual variance is retained in a new daily revision without mutating the approved Mission chemical plan.
- Added one immutable `mission_day_weather_reports` child per operating day. `ACTUAL_INTERVAL` comes only from authoritative actual start/finish timestamps; `FULL_DAY` is derived from the stored Base timezone and local work date. The stored interval is emitted in UTC.
- Frozen weather evidence includes the exact package, selected canonical weather-observation source and coordinates, Base timezone, provider/retrieval provenance, bounded hourly observations, inversion inputs/results, coverage gaps, manual reason/metadata, actor, and a canonical SHA-256 digest. Historical reads query only the frozen database report and never invoke the provider.
- Extended the existing Open-Meteo adapter with archive retrieval in GMT, exact interval filtering, explicit missing-hour gaps, and an `UNABLE_TO_DETERMINE` inversion result rather than an inferred vertical-profile claim. Provider failure returns a safe retry/fallback error.
- Added an explicit manual-evidence path that freezes against the same database-resolved interval, package source and coordinates. Conflicting provider provenance, malformed values, observations outside the interval, and malformed gaps fail closed before insertion.
- Added trusted repository/HTTP routes, strict TypeScript response decoders and command clients for chemical reads/confirmation plus weather read/provider/manual capture.
- Added `MissionDayChemicalActuals` and `MissionDayWeatherReport`. The chemical UI distinguishes proposals from confirmed evidence and captures Field/rate/quantity/batch/aircraft values. The weather UI offers exact operating-hours or explicit Base-local full-day capture, manual fallback, and a read-only frozen provenance/digest view.

## TDD evidence

### RED

1. The Task 9 migration suite failed because `20260905130000_mission_day_chemical_and_weather_actuals.sql` did not exist.
2. The executable PostgreSQL scenario exposed migration parse/UTC-normalisation defects before the new schema and functions passed as one migration-chain execution.
3. Weather-provider tests failed because the historical archive adapter did not exist.
4. Mission Operations server/client tests failed because the new actions, repository methods, projections and strict decoders did not exist.
5. UI tests failed because both Task 9 components did not exist.
6. Review regressions failed when a currently assigned aircraft absent from the exact package was accepted, out-of-range hourly evidence was frozen, and manual evidence could carry provider-retrieval provenance. All now reject atomically.

### GREEN

- The executable PGlite test runs the repository migration chain and covers proposal-only reads, explicit confirmation, pre-operation reauthorisation, post-operation variance without plan mutation, exact Field/package-aircraft scope, exact actual/full-day UTC intervals, provider and manual evidence, one-time freeze, digest stability, historical read immutability, malformed evidence, tenant rejection, optimistic conflicts, audit, and outbox behavior.
- The final focused/adjacent command passed 9 suites and 71 tests covering the Task 9 migration/UI/provider tests plus Mission chemical authority, Mission Operations server/client, operating-day and aircraft-day regressions.
- Targeted ESLint, Node syntax checks and `git diff --check` pass. `npm run build` completes successfully.

## Self-review and limitations

- The new relations contain only evidence that the existing Mission-wide plan/current-weather authorities cannot represent safely: immutable actual day/Field chemical revisions and a single frozen historical weather interval. They do not create competing planning, package, CRP-decision, current-weather or completion authorities.
- Open-Meteo archive availability and latency remain external conditions. Failure never creates partial evidence; operators receive the explicit manual-evidence fallback.
- Surface-hourly Open-Meteo data cannot establish a vertical inversion profile, so the adapter retains its inputs and records that inversion cannot be determined.
- PGlite provides executable transaction and stale-version behavior but cannot prove real two-session blocking timing. All writers participate in the established Mission aggregate lock and recheck optimistic versions while locked.
- The build retains the repository's existing lint-warning backlog and stale Browserslist notice. No Task 9 file is reported by the build warnings.

## Review round 1 closure — 2026-09-05

- Kept batch/lot provenance optional. When supplied it is trimmed and bounded to 200 characters at the UI, HTTP validation, SQL authority, persisted constraint, and response decoder; supplied values remain present in the frozen revision.
- Separated editable application rows from Mission-plan proposals. Operators can duplicate a planned application across authorised Fields, remove rows, add a canonical verified substituted-product row, and submit a further append-only revision when an actual already exists. The plan remains visibly labelled as a proposal.
- Replaced the single sparse manual-weather form with exact expected UTC hour buckets derived from the authoritative actual interval or Base-local full day. Each bucket must be explicitly declared as a measured observation or a truthful gap; the UI never invents empty gaps.
- Made the database the final hourly-coverage authority. It rejects all-null observations, unaligned/out-of-range timestamps, duplicate observation or gap buckets, observation/gap overlap, and any missing expected bucket before insertion.
- Added a canonical prepared-context digest covering the exact Mission/day/package/day version, coverage, UTC interval, timezone, source weather observation identity/version/source, and coordinates. Freeze recomputes it under the Mission aggregate lock and rejects a provider result when the context changed during the fetch.
- The server also requires provider evidence to attest the exact requested coordinates and interval before freeze. The historical adapter now requires explicit UTC/GMT with zero offset, aligned hourly arrays, unique ordered hour timestamps, finite bounded values, and finite response coordinates; invalid provider evidence falls back safely to manual entry.
- Tightened strict client decoding to the exact chemical rate/quantity unit enums and pairings, a 200-character batch/lot, non-empty measured observations, and in-range aligned coverage gaps.

### Review TDD evidence

- The review RED run failed 6 suites and 18 tests across the intended seams: multi-Field/revision editing, optional/supplied batch handling, explicit manual gap coverage, all-null observations, context binding, provider timezone/array validation, and strict decoding.
- The executable PostgreSQL race regression prepares a weather context, changes the selected source observation's version and coordinates before freeze, then proves the stale digest is rejected without a report insert.
- The final review verification passed the nine-suite focused/adjacent matrix, targeted ESLint, Node syntax checks, `git diff --check`, and `npm run build`. The build continues to report only the repository's pre-existing warning backlog and Browserslist notice; no Task 9 file is named.

## Review round 2 closure — 2026-09-05

- Mirrored the database's frozen hourly-evidence contract in the strict TypeScript response decoder. Observations and gaps must be UTC-hour aligned, unique within each set, non-overlapping across sets, within the frozen interval's expected bucket set, and together cover every expected bucket. A malformed stored or transported report now fails closed as `MALFORMED_RESPONSE`.
- Required Open-Meteo response coordinates to be actual finite JSON numbers before range validation. Null, empty, missing, boolean, and numeric-string coordinates can no longer coerce to zero or another accepted number.
- Focused RED reproduced five malformed frozen-evidence shapes and null/empty coordinate coercion. Focused GREEN passed the affected strict-contract and historical-provider suites; targeted lint, syntax, and diff checks were then rerun without broad-suite expansion.
