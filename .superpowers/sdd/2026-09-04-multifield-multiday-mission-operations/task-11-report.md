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

## Review round 1

- Final readiness now rejects the latest daily chemical revision when it carries `material_variance`; no reconciliation override was invented because the repository has no existing governed chemical-reconciliation authority tied to that revision.
- The shared Mission aggregate lock is now the terminal-finality guard for every ordinary package/day/aircraft/chemical/weather/import/attribution/amendment command. The one formerly unlocked operational-event writer is wrapped, and table triggers cover direct writes to the post-package operational tables.
- A dedicated append trigger prevents a legacy completion revision from being added after a digest-bearing canonical final revision. Final sign-off retains a private lock-only path solely for exact idempotent retries; that helper has no callable role grant.
- Job close evaluates the latest canonical completion, not any historical final revision, and rejects a newer unresolved `PREPARING`/`AWAITING_CRP_APPROVAL` package or later amendment under the same deterministic Mission locks.
- Executable PGlite coverage proves RPC mutation, direct table mutation, legacy completion append and Job-close-with-prospective-authority all fail closed without partial mutation.

## Review round 2

- The terminal table trigger now resolves both `OLD` and `NEW` organisation/Mission identities for `UPDATE`, deduplicates them, and locks/checks them in deterministic organisation/Mission order. Reparenting cannot move evidence out of a finalized source scope.
- Terminal guards are installed on all 15 post-package operational/evidence relationship tables. Their rows expose both `organisation_id` and `mission_id`, so no indirect relationship lookup or unscoped fallback is required.
- Executable privileged-update coverage attempts to reparent an existing operational event from a finalized Mission to a non-final Mission and proves the source identity and row count remain unchanged.
- The API now recognizes only the exact thrown PostgREST pair `55000` + `MISSION_FINAL_SIGNOFF_IMMUTABLE` and maps it to a fixed safe 409 response. Other `55000` errors remain the generic safe 500 path; upstream details are never returned.

## RED evidence

The first focused run failed for the intended missing migration, absent `MissionFinalSignoff` component and unsupported API actions. The lifecycle refinement also identified and corrected the existing-closeout compatibility case: revision 1 may already exist, so final sign-off must append rather than overwrite or falsely return it.

## Verification

- Focused authority/API/decoder/UI/Financial/Fleet/migration suite: 9 suites / 83 tests PASS.
- Full-chain PGlite migration execution and Fleet behavior: PASS, including an executable multi-day final-sign-off fail-closed/zero-mutation assertion.
- Production build: PASS with the repository's pre-existing Browserslist, lint-warning and bundle-size warning backlog.
- Targeted ESLint: zero errors; six pre-existing unused-import warnings remain in `JobDetail.tsx`.
- `git diff --check`: PASS.
- Migration SHA-256: `7586956d1652e8ca5b4a20da86113a64cec41dd4dcd17a522f82b540d057c743`.

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
