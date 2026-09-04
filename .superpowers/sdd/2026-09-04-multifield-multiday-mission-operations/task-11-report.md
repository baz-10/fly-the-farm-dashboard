# Task 11 report — Final sign-off, Job closure and downstream projections

## Outcome

- Extended the canonical immutable `mission_completion_revisions` authority with a frozen, digest-bound daily evidence manifest. No `mission_final_signoffs` table or competing current pointer was created.
- Added checked final-readiness, final-sign-off and Job-close commands through the existing Mission Operations API.
- Final sign-off serializes on the organisation/Mission package aggregate, locks the Mission, effective package, operating days and Job, then rejects the first precise unresolved daily/JSA/aircraft/chemical/weather/hold boundary.
- A legacy operational-completion revision remains valid compatibility evidence; the multi-day final sign-off appends the next canonical completion revision. Exact retries return that same final revision only when revision/declaration identity matches.
- The frozen manifest preserves ordered days, package/JSA linkage, Field activities, per-aircraft totals and optional flights, daily chemical revisions/lines, weather reports and flight-line attributions.
- Fleet daily readings continue through the existing atomic signed-day command. Final sign-off records immutable, unique `FLEET` and `FINANCIAL` projection-source markers in the same transaction.
- Financial prefill preserves the existing single-closeout calculator and adds canonical multi-day facts from the final completion: distinct positive-work dates as `operationalDays`, Mission actual work hours, and separately summed aircraft flight hours.
- The renamed compatibility calculator and new Financial wrapper are both denied `PUBLIC`/browser execution; only `service_role` may execute the checked wrapper.
- Job closure locks all Missions and requires a digest-bearing canonical final completion for every non-cancelled Mission.
- UI now distinguishes operational completion from final sign-off, presents precise blockers, and exposes Job close only after every governed Mission is finally signed off.

## RED evidence

The first focused run failed for the intended missing migration, absent `MissionFinalSignoff` component and unsupported API actions. The lifecycle refinement also identified and corrected the existing-closeout compatibility case: revision 1 may already exist, so final sign-off must append rather than overwrite or falsely return it.

## Verification

- Focused authority/API/decoder/UI/Financial/Fleet/migration suite: 9 suites / 80 tests PASS.
- Full-chain PGlite migration execution and Fleet behavior: PASS, including an executable multi-day final-sign-off fail-closed/zero-mutation assertion.
- Production build: PASS with the repository's pre-existing Browserslist, lint-warning and bundle-size warning backlog.
- Targeted ESLint: zero errors; six pre-existing unused-import warnings remain in `JobDetail.tsx`.
- `git diff --check`: PASS.
- Migration SHA-256: `6a4d492193034978985de739ad6fd37183285637f5518d5582da685b6875ea38`.

## Files

- `supabase/migrations/20260905140000_mission_final_signoff_and_job_close.sql`
- `src/__tests__/missionFinalSignoffMigration.test.js`
- `src/__tests__/missionAircraftDayActualsMigration.test.js`
- `server/mission-operations-api.js`
- `server/mission-operations-repository.js`
- `src/types/missionOperations.ts`
- `src/services/missionOperationsApi.ts`
- `src/services/__tests__/missionOperationsApi.test.ts`
- `src/components/mission/MissionFinalSignoff.tsx`
- `src/components/mission/__tests__/MissionFinalSignoff.test.tsx`
- `src/components/mission/MissionOperationalCloseout.tsx`
- `src/pages/JobDetail.tsx`
- `src/__tests__/missionOperationsApi.test.js`

## Deviations / limitations

- The approved preflight ruling replaced the plan's proposed parallel `mission_final_signoffs` table with additive columns on the existing canonical completion authority and a narrow immutable projection-source table.
- Final Fleet values are projected at signed-day time by the already reviewed Task 8 command; Mission final sign-off freezes and identifies those sources atomically rather than duplicating Fleet meter writes.
- PGlite is single-session, so it proves shared lock participation, transactional failure and idempotent identities but cannot measure real two-session blocking timing.
- No Production migration, deployment, alias operation or genuine data mutation occurred.
