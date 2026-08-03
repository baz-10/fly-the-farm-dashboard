# Mission-first Chemical Planning Implementation Plan

**Requirements:** NEW-CHE-001, IMP-CHE-002, IMP-MIS-004  
**Approved design:** `docs/superpowers/specs/2026-08-03-mission-first-chemical-planning-design.md`

## Outcome

Fly The Farm can add verified and unmatched products to an existing Mission, calculate the operational mix, save an immutable PostgreSQL revision, reopen it in another authorised session, and continue planning without a catalogue gate. An unmatched product atomically creates one platform research review. Researchers can prepare it; only a separately permissioned approver can publish it.

## Task 1 — Prove the database contract RED

Files:

- Create `src/__tests__/authoritativeMissionChemicalsMigration.test.js`
- Create `scripts/verify-mission-chemicals-postgres.mjs`

Steps:

1. Assert the repository migration contains the three separate data domains, append-only Mission revisions, review history, RLS, trusted functions, permissions, audit and outbox writes.
2. Assert trusted save performs validation, location checking, expected-version concurrency, server-side calculations and unmatched-review upsert atomically.
3. Assert research and approval permissions remain separate and approval never updates Mission evidence.
4. Run the focused test and confirm it fails because the migration does not exist.

## Task 2 — Implement authoritative PostgreSQL storage

Files:

- Create `supabase/migrations/20260803000000_authoritative_mission_chemicals.sql`
- Update `scripts/verify-mission-chemicals-postgres.mjs`

Steps:

1. Add versioned platform product and product-version tables, organisation register entries, Mission plan revisions/lines, intelligence reviews and append-only review history.
2. Add constraints for units, positive rates/volumes/areas/tank sizes, lifecycle states, unique review deduplication keys and immutable Mission evidence.
3. Add tenant/location-aware RLS and revoke direct authenticated writes.
4. Provision `mission.chemicals.read`, `mission.chemicals.plan`, `chemical.register.read`, `chemical.register.manage`, `chemical.review.research`, and `chemical.review.approve`; assign operational permissions to organisation admins while keeping platform review permissions explicitly assigned.
5. Add trusted read/search/save/review-transition functions. Save validates the Mission and operating location, calculates totals and batches server-side, stores snapshots, creates at most one unmatched review, and writes audit/outbox events in the same transaction.
6. Add a repository-controlled verified seed representing an existing Spray Command catalogue product, with explicit provenance and version identity.
7. Run the migration contract test and PostgreSQL verifier until green.

## Task 3 — Prove the API contract RED

Files:

- Create `src/__tests__/missionChemicalsOperationalApi.test.js`
- Update `src/__tests__/versionedApiDispatcher.test.js`

Steps:

1. Test GET current/history, POST versioned save, product search, research queue, approval queue and review transition dispatch.
2. Test authentication, permissions, tenant/location denial, validation, unsupported actions and optimistic-concurrency errors.
3. Test unmatched saves return a non-blocking review notice and verified saves retain intelligence references.
4. Confirm focused tests fail before handlers exist.

## Task 4 — Implement application API and repository adapters

Files:

- Update `server/operational-repository.js`
- Update `server/operational-api.js`
- Update `server/operational-dispatcher.js`
- Update `src/services/operationalApi.ts`
- Create `src/types/missionChemicals.ts`

Steps:

1. Add provider-neutral repository methods delegating to trusted PostgreSQL RPCs.
2. Add bounded handlers for `mission-chemicals`, `chemical-intelligence`, and `chemical-reviews`; keep calculation and lifecycle logic out of transport code.
3. Register resources in the existing dynamic dispatcher without changing `/api/v1/*` behaviour or function count.
4. Add typed frontend API methods with no local-storage fallback.
5. Run focused API/dispatcher tests until green.

## Task 5 — Prove the Mission UI RED

Files:

- Create `src/__tests__/MissionChemicalPlanning.test.tsx`

Steps:

1. Test loading an authoritative revision, searching verified intelligence, unrestricted unmatched entry, server-calculated totals, non-blocking review notice, save/reopen and version-conflict messaging.
2. Test there is no browser-storage access and failed saves never display a saved record.
3. Confirm the component test fails before implementation.

## Task 6 — Connect chemical planning to the existing Mission planner

Files:

- Create `src/components/mission/MissionChemicalPlanning.tsx`
- Update `src/pages/MissionPlanning.tsx`

Steps:

1. Add the compact chemical planner inside the authoritative Mission screen using existing visual patterns.
2. Support verified search/selection and free product entry in the same line editor.
3. Capture exact product snapshot, rate/unit, application volume, treatment area and tank size.
4. Display server-authoritative total spray volume, product quantity, water, hectares per batch, product per batch and batch count after save.
5. Clearly label unmatched products as permitted for planning and automatically sent for platform review.
6. Remove Chemicals only from the gated-capability message; retain all other gates.
7. Run component tests, lint and production build until green.

## Task 7 — Connect the existing admin intake surface to authoritative review queues

Files:

- Update `src/components/AdminChemicalIntake.tsx`
- Update `src/App.tsx` only if routing needs no new public path
- Create `src/__tests__/ChemicalIntelligenceReview.test.tsx`

Steps:

1. Preserve the existing admin screen and replace its local-storage review source with the authoritative API.
2. Show the research queue only with `chemical.review.research`; allow evidence/recommendation fields and Ready for Approval transition, never publish.
3. Show the approval queue only with `chemical.review.approve`; allow approve, return, duplicate and reject decisions with expected-version protection.
4. Ensure approval publishes/link a platform product version while historical Mission snapshots remain unchanged.
5. Run focused tests until green.

## Task 8 — Full verification, controlled migration and deployment

Files:

- Update operational acceptance evidence only if generated by existing verification tooling

Steps:

1. Run the complete test suite, lint and production build.
2. Confirm the Supabase CLI project ref is `fzkrvglzompkuiodqllr` before any remote migration.
3. Run migration dry/status checks, apply the repository migration, then run the PostgreSQL verifier against the controlled target.
4. Commit with requirement IDs, push `codex/production-beta`, deploy through the connected Spray Command Vercel project and run production API smoke checks.

## Task 9 — Deployed operational acceptance

Steps:

1. Open the accepted real Mission and save one verified and one unmatched chemical.
2. Confirm server calculations, refresh, logout/login, authorised second session and stale-write conflict protection.
3. Confirm tenant and operating-location denial, one automatic review, audit rows, outbox rows and no local/legacy persistence.
4. Confirm a researcher can prepare but cannot approve; confirm the configured approver can decide.
5. After approval, search the now-verified product in a future plan and confirm the original Mission evidence is byte-for-byte unchanged.
6. Report only the operational milestone, the manual process eliminated and the next blocker to Mission Authorisation.
