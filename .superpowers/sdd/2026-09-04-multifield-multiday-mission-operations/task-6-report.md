# Task 6 Report — Mission Operating Days and Daily JSA Continuity

## Status

Implemented in the isolated worktree and ready for parent review. No Production system was contacted and no migration was applied outside ephemeral PGlite databases.

## Delivered

- Added `mission_operating_days`, `mission_day_field_activity` and `mission_day_jsa_reviews` without creating another Mission package, JSA, authorisation or closeout stream.
- Bound every new day to `missions.current_authorised_pack_revision_id`, the exact canonical package JSA revision and its Base timezone snapshot.
- Added checked create, JSA-review, start, Field-activity, complete and bounded-list RPCs using the shared Mission aggregate lock, active-seat and exact `mission.operational.read`/`mission.operational.write` permissions, Base access, optimistic row versions, audit events and transactional outbox messages.
- Enforced one Mission day per Base-local `date`, exact `timestamptz` start/finish values, local-date validation at start, fixed `numeric(18,6)` hectares, non-empty authorised package Field scope, exact daily JSA confirmation, stale-package blocking before work, and immutable signed-off day/child evidence.
- Extended the focused Mission Operations repository/HTTP boundary with `day-create`, `day-jsa-review`, `day-start`, `field-activity-save`, `day-complete` and `days`.
- Added strict TypeScript contracts and decoders. Dates are validated as canonical calendar strings without browser timezone conversion; hectare values remain fixed-scale strings.

## TDD evidence

### RED

1. The initial migration test failed with the expected `ENOENT` for `20260905110000_mission_operating_days_and_jsa_reviews.sql` (2 failing tests).
2. The server/client command tests failed because the six actions, repository methods and strict operating-day decoders did not exist (5 failures across 2 suites).
3. A calendar-normalisation regression failed because `2026-02-30T01:00:00.000Z` was initially accepted by both the server timestamp validator and client decoder (2 failures). Validation now independently checks the timestamp's calendar date.
4. PGlite null-version regressions failed because SQL three-valued logic allowed a null optimistic version to bypass `<>`. Review, activity create/update, start and completion now explicitly reject null/out-of-range versions before mutation.

### GREEN

- Required focused suite:
  - `TZ=Australia/Brisbane CI=true npm test -- --watchAll=false src/__tests__/missionOperatingDaysMigration.test.js src/__tests__/missionOperationsApi.test.js src/services/__tests__/missionOperationsApi.test.ts`
  - Passed: 3 suites, 29 tests at the focused verification point.
- Final focused and adjacent Mission authority/closeout suite:
  - Included the three required Task 6 suites, `missionScopeRevisionDatabase`, Mission Authorisation API and operational-closeout server/client tests.
  - Passed: 7 suites, 41 tests.
- Targeted ESLint, JavaScript syntax checks and `git diff --check` passed. ESLint emitted only the repository's stale Browserslist-data notice.
- `npm run build` completed successfully. It emitted the repository's existing lint-warning backlog; no Task 6 file was reported.

## PGlite behavior coverage

The committed test executes the repository migration chain with `pgcrypto` in an ephemeral database and covers:

- two Base-local operating dates and duplicate-date rejection;
- foreign-tenant Mission rejection and Base-scoped permissions;
- missing daily JSA review;
- review binding to the exact package JSA revision;
- authorised-package Field rejection;
- fixed-scale hectare projection;
- optimistic conflicts, including null-version bypass attempts;
- one successful start and exact overnight completion timestamps;
- a reviewed day becoming stale after a newer unapproved package revision;
- signed-off day and Field-evidence immutability;
- bounded day aggregation plus audit/outbox evidence.

## Self-review and limitations

- Confirmed that package/JSA authority is consumed only through the existing canonical tables, `missions.current_authorised_pack_revision_id`, `mission_pack_fields`, `ftf_resolve_effective_mission_authorisation` and the shared aggregate lock.
- Confirmed authenticated/browser and service-role direct writes remain revoked; only checked security-definer RPCs are executable by `service_role`.
- Confirmed Field activity remains editable after daily completion for later administrative reconciliation, but becomes immutable at governed sign-off. Day completion does not rewrite or reinterpret its historical package/JSA binding.
- A `CHANGE_DECLARED` review safely leaves the day in `DRAFT` and prevents start. Rebinding or cancelling such a pre-start day after a new authorised revision is not one of Task 6's command interfaces and remains a later workflow decision.
- PGlite has one PostgreSQL backend, so it cannot prove real two-session blocking/interleaving. The suite behaviorally verifies shared-lock entry, optimistic loser outcomes and stale-package rejection; multi-session timing remains dependent on the already-established aggregate-lock protocol.
