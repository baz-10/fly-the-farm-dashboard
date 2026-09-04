# Task 4 Report — Immutable Mission Scope and CRP Gate

## Status

Complete and ready for parent review. No Production system was contacted and no migration was applied outside ephemeral PGlite verification databases.

## Delivered

- Extended the existing immutable `public.mission_pack_revisions` stream with operational package state, Job/JSA linkage, a canonical source manifest, SHA-256 evidence digest and submission timestamp.
- Extended the existing immutable `public.mission_authorisation_revisions` stream with the package revision link, `AUTHORISED`/`REJECTED` decision and exact evidence digest. The Mission stores only a pointer to the currently effective authorised package.
- Added `public.mission_pack_fields` as the relational, ordered Field scope for each canonical pack revision. Every saved scope is a non-empty, unique subset of active `job_fields` under the Job's single Client.
- Added checked `ftf_save_mission_package_scope`, `ftf_submit_mission_package`, `ftf_decide_mission_package` and `ftf_read_mission_package_history` functions with organisation/Base scope, active seat and permissions, shared Job/Mission aggregate locks, optimistic concurrency, append-only history, audit events and transactional outbox messages.
- The digest is built only from server-owned identities/revisions: Mission/Job rows, ordered Job Field/Field/Property rows and target areas, exact JSA/personnel/chemical/map/weather revisions, current aircraft/equipment assignments and asset row versions, and normalized readiness state/codes. Null/missing manifests and stale digests fail closed.
- CRP identity is derived from the signed-in internal user linked to active Personnel assigned to the Mission Base. No browser-supplied CRP/personnel identity is accepted.
- Added the focused `/api/v1/mission-operations` resource with only `scope`, `submit`, `authorise`, `reject` and bounded `history`; strict request validation and client response decoders; exact permissions; same-origin writes; safe checked-error mappings and correlation IDs.
- Removed the inherited direct `service_role` mutation grants from both canonical streams; mutations remain available only through security-definer checked functions.
- Preserved legacy Mission Authorisation reads: rejected decisions are not projected as effective authorisations, and preparing/rejected packages are not projected as legacy generated packs. An authorised operational package is overlaid with its canonical authorisation link for the established read contract. Legacy pack generation now rejects a rejected decision.

## Controller-ruling design deviations

- Did **not** create the plan's `mission_package_revisions` or `mission_crp_decisions` tables.
- Reused `public.mission_pack_revisions` as the only package authority and `public.mission_authorisation_revisions` as the only CRP-decision authority.
- Created `public.mission_pack_fields` instead of `mission_package_fields`, matching the canonical pack name and adding the missing relational Mission Field scope.
- `AUTHORISED` and `REJECTED` are effective states projected by joining the immutable decision stream; the canonical pack row itself remains in `AWAITING_CRP_APPROVAL` and is never updated.
- Existing legacy authorisation/pack columns remain intact. Their `NOT NULL` constraints were relaxed only so pre-authorisation canonical package revisions can exist; legacy-generated rows continue to populate them.

## TDD evidence

1. Client decoder tests were written first and failed because `missionOperationsApi` and its types did not exist. They passed after exact-key, UUID, revision, Field-set, digest, state, timestamp and history validation was implemented.
2. Migration tests were written first and failed because the Task 4 migration did not exist. Subsequent RED checks caught and drove fixes for asset row-version drift, null digest/manifest bypasses, missing direct-grant revocation, missing Field/Property revision evidence, legacy projection safety and Job-scope lock serialization.
3. Server API/repository tests were written first and failed because the focused modules did not exist. They passed after the checked RPC mapping, identity derivation, permission/same-origin gates, failure mapping and dispatcher registration were implemented.

## Verification

- Requested Slice 2 authority command:
  - `CI=true npm test -- --watchAll=false src/__tests__/missionScopeRevisionMigration.test.js src/__tests__/missionOperationsApi.test.js src/services/__tests__/missionOperationsApi.test.ts src/__tests__/missionAuthorisationOperationalApi.test.js`
  - Passed: 4 suites, 32 tests.
- Adjacent compatibility command:
  - `CI=true npm test -- --watchAll=false src/__tests__/versionedApiDispatcher.test.js src/__tests__/multifieldJobScopeMigration.test.js src/__tests__/multifieldJobScopeOperationalApi.test.js src/services/__tests__/operationalApi.test.ts src/__tests__/authoritativeOperationalCloseoutMigration.test.js src/components/mission/__tests__/MissionAuthorisation.test.tsx`
  - Passed: 6 suites, 69 tests.
- Targeted ESLint plus `node --check` on every Task 4 TypeScript/JavaScript file:
  - Passed with no Task 4 warnings or errors. The tool emitted only the repository's stale Browserslist-data notice.
- Ephemeral PGlite behavioral smoke test:
  - Passed non-subset Field rejection, stale digest rejection, ineligible CRP rejection, successful authorisation, duplicate-decision conflict, cross-tenant not-found behavior and append-only mutation rejection.
- Ephemeral PGlite migration-chain parse with `pgcrypto` enabled:
  - Passed and resolved `mission_pack_fields` plus all four checked functions. Three existing storage/platform migrations that require their hosted environment were excluded.
- `CI=false npm run build`:
  - Passed and produced the optimized bundle, with the repository's existing lint-warning backlog.
- `CI=true npm run build`:
  - Fails because Create React App promotes the same pre-existing repository-wide warnings to errors. None of the reported warnings is in a Task 4 file.
- `git diff --check`:
  - Passed.

## Review notes and concerns

- Self-review found and fixed the null-manifest SQL three-valued-logic bypass, assignment asset drift omission, mutable Field/Property evidence omission, Job-scope concurrency mismatch, inherited direct table INSERT grants, and legacy reads interpreting new pre-authorisation/rejection rows as effective authority.
- The migration depends on the repository's established `pgcrypto.digest` facility. The generic local verifier does not load `pgcrypto`; the dedicated PGlite verification did and passed.
- The older operational-closeout RPCs still consume their legacy authorisation evidence schema. The later multi-day operating-day slice should bind new operational activity to `missions.current_authorised_pack_revision_id`; this Task does not reinterpret old closeout payloads as new daily evidence.
