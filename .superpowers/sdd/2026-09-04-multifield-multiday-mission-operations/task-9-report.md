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
