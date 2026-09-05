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
- PGlite validates transactions and catalog structure in one in-memory database client, but it cannot prove blocking timing across independent PostgreSQL sessions. The committed behavior suite therefore verifies shared-lock participation through `pg_proc`/`pg_trigger`, then verifies stale-evidence and authority behavior transactionally. Production was not contacted.

## Review fix round 1/5 — effective authority and serialization

All round-one findings are addressed without adding a parallel package or CRP-decision stream.

- Added `ftf_resolve_effective_mission_authorisation`, which follows `missions.current_authorised_pack_revision_id`, joins only a canonical `decision='AUTHORISED'`, and emits a legacy-compatible `evidence_manifest` containing `planning`, `preflight`, readiness and the immutable `sourceManifest`.
- Added `ftf_project_mission_pack`; both `ftf_read_mission_pack` and Mission Pack report generation now project the canonical `sourceManifest` through the legacy `pack_snapshot.evidence` shape used by the report renderer.
- Replaced every direct closeout authority consumer from `20260803120000_authoritative_operational_closeout.sql` in this forward migration. Closeout reads, actual resources, actual chemicals, operational evidence submission and completion now resolve the pointer-based effective authority and explicitly require `AUTHORISED`. Historical migrations were not edited.
- Added one aggregate lock order (organisation advisory lock, Mission advisory lock, Mission row lock), fail-safe triggers on every table that contributes source identity/readiness/CRP eligibility, and entry wrappers for the established map, personnel, chemical, JSA and weather evidence RPCs. Package submit and decision now rerun the canonical manifest/digest validation under that lock immediately before their immutable insert.
- History now returns `current_revision` across both legacy and focused pack rows. The package page and decision page are coherent because decisions are restricted to IDs in the returned package set. Legacy pack versions therefore remain recoverable as an `expectedRevision` without fabricating missing focused-package evidence fields.
- The strict client history decoder now accepts a non-negative `currentRevision`, rejects returned package revisions above it, and preserves validated `currentVersion` (including zero) and SHA-256 `currentDigest` metadata on conflicts.
- Added the committed, repeatable `missionScopeRevisionDatabase.test.js` PGlite suite. It executes the repository migration chain and behaviorally covers exact Job subset rejection, stale JSA evidence, CRP ineligibility, duplicate decisions, cross-tenant IDs, append-only immutability, pointer stability after rejection, legacy closeout/report projection, and old-authorise/generate interoperability with the new history API.

### Round-one RED evidence

- `CI=true npm test -- --watchAll=false src/services/__tests__/missionOperationsApi.test.ts src/__tests__/missionOperationsApi.test.js`
  - Failed as intended: history omitted `currentRevision`; the repository omitted `current_revision`; client errors dropped `currentVersion`/`currentDigest`.
- `CI=true npm test -- --watchAll=false src/__tests__/missionScopeRevisionDatabase.test.js`
  - Failed as intended after the complete migration chain executed: all three new checked authority/lock helpers were absent.
- `CI=true npm test -- --watchAll=false src/services/__tests__/missionOperationsApi.test.ts`
  - Failed as intended for the initial concurrency value: `currentVersion: 0` was discarded.

### Round-one GREEN evidence

- Focused authority/API suite:
  - `CI=true npm test -- --watchAll=false src/__tests__/missionScopeRevisionMigration.test.js src/__tests__/missionScopeRevisionDatabase.test.js src/__tests__/missionOperationsApi.test.js src/services/__tests__/missionOperationsApi.test.ts src/__tests__/missionAuthorisationOperationalApi.test.js`
  - Passed: 5 suites, 34 tests.
- Adjacent compatibility suite:
  - `CI=true npm test -- --watchAll=false src/__tests__/versionedApiDispatcher.test.js src/__tests__/multifieldJobScopeMigration.test.js src/__tests__/multifieldJobScopeOperationalApi.test.js src/services/__tests__/operationalApi.test.ts src/__tests__/authoritativeOperationalCloseoutMigration.test.js src/components/mission/__tests__/MissionAuthorisation.test.tsx src/__tests__/missionSummaryReportMigration.test.js src/__tests__/checklistAuthorityReconciliationPglite.test.js`
  - Passed: 8 suites, 71 tests.
- Targeted ESLint and Node syntax checks passed with no Task 4 warnings/errors.
- `CI=false npm run build` passed with only the existing repository-wide lint-warning backlog.
- `CI=true npm run build` failed solely because Create React App promotes that same pre-existing warning backlog to errors; no Task 4 file was reported.
- `git diff --check` passed.

### Controller-ruling deviation retained

The reviewed fix continues to extend only `public.mission_pack_revisions` and `public.mission_authorisation_revisions`. No `mission_package_revisions` or `mission_crp_decisions` table was introduced. Legacy rows that lack the focused Field/JSA/digest contract are represented in `current_revision` for concurrency, rather than being relabelled as synthetic focused-package revisions.

## Review fix round 2/5 — complete material serialization

- Added `public.checklist_corrective_actions` to the shared material-evidence trigger catalog. These rows have organisation scope through their execution relationship but no direct `mission_id`; the trigger therefore takes the same organisation advisory lock that every package submit/decision takes before evaluating checklist readiness.
- Reworked `ftf_lock_mission_material_evidence` so UPDATE derives both OLD and NEW `(organisation_id, mission_id)` scopes, removes duplicates, orders the remaining UUID pairs deterministically, and enters the existing aggregate helper for each scope. INSERT still contributes only NEW and DELETE only OLD.
- Extended the committed PGlite suite with catalog verification for the corrective-action trigger, catalog inspection of the OLD/NEW deterministic-order implementation, and live transaction assertions against `pg_locks`. The behavioral assertions observe two advisory locks for INSERT, three for an A-to-B Mission reparent within one organisation, and two for DELETE.

### Round-two RED evidence

1. `CI=true npm test -- --watchAll=false src/__tests__/missionScopeRevisionDatabase.test.js`
   - Failed after the migration chain executed because `checklist_corrective_actions` was absent from the installed `mission_package_aggregate_lock` trigger catalog.
2. The same focused command after adding only that catalog entry:
   - Failed behaviorally on an A-to-B Mission reparent: expected three held advisory locks (organisation, OLD Mission, NEW Mission), received two (organisation, NEW Mission).
   - Catalog inspection also showed no deterministic OLD/NEW ordering in the trigger function.

### Round-two GREEN evidence

- Focused authority/API suite:
  - `CI=true npm test -- --watchAll=false src/__tests__/missionScopeRevisionMigration.test.js src/__tests__/missionScopeRevisionDatabase.test.js src/__tests__/missionOperationsApi.test.js src/services/__tests__/missionOperationsApi.test.ts src/__tests__/missionAuthorisationOperationalApi.test.js`
  - Passed: 5 suites, 34 tests.
- Adjacent compatibility suite:
  - `CI=true npm test -- --watchAll=false src/__tests__/versionedApiDispatcher.test.js src/__tests__/multifieldJobScopeMigration.test.js src/__tests__/multifieldJobScopeOperationalApi.test.js src/services/__tests__/operationalApi.test.ts src/__tests__/authoritativeOperationalCloseoutMigration.test.js src/components/mission/__tests__/MissionAuthorisation.test.tsx src/__tests__/missionSummaryReportMigration.test.js src/__tests__/checklistAuthorityReconciliationPglite.test.js`
  - Passed: 8 suites, 71 tests.
- The refactored PGlite behavior test, `node --check`, targeted ESLint, and `git diff --check` passed. ESLint emitted only the repository's stale Browserslist-data notice.
- `CI=false npm run build` passed with the existing repository-wide lint-warning backlog and no warning in a Task 4 file.

### Concurrency-test limitation

PGlite exposes transaction-scoped advisory locks through `pg_locks`, so this suite verifies that OLD and NEW aggregate keys are both actually held and verifies deterministic ordering through the migrated `pg_proc` definition. PGlite does not provide two independent PostgreSQL backend sessions, so it cannot demonstrate real blocking/interleaving or deadlock absence. That timing property remains dependent on the common ascending UUID lock order exercised by PostgreSQL proper.
