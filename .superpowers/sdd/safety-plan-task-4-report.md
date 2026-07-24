# Safety Plan Task 4 report

## Status

Complete. Task 4 is implemented on `codex/safety-plan-design`.

- Starting commit: `44093ac`
- Implementation commit: `be63bad`

## Delivered

- Added a pure, deterministic `buildJobSafetyPlan` service. It receives all
  source records explicitly and performs no persistence or `localStorage`
  reads.
- Added an explicit, legacy-compatible `MissionRecord.jobId` association.
  Safety Plan mission matching uses only `mission.jobId === job.id`; it never
  infers a relationship from client, property, field or mission names.
- Snapshots company, job, client, property, field, operating date, site notes,
  crew, assets, chemicals, emergency contacts and linked missions.
- Consolidates linked mission JSA hazards and answered-yes Risk Assessment
  controls. Each imported item retains mission ID, source-record ID,
  source-item ID and source update timestamp.
- Prefills template fields and adds editable imported-control fields to the
  consolidated JSA section.
- Added deterministic source diffing for added, changed, removed and unchanged
  items.
- Added conflict application that requires an explicit decision for every
  changed and removed item, preserves company-authored controls on request,
  rejects mutations of approved/superseded versions and records
  `source_refreshed` audit metadata.
- Preserved the immutable historical baseline manifest and registered both new
  suites as explicit post-baseline supplements.

## TDD evidence

RED was observed before implementation for:

- both missing Task 4 modules;
- missing mission/source-record identity and imported section fields;
- newly imported items not appearing in the consolidated section;
- accepting a changed source control incorrectly copying the hazard
  description instead of the latest source control.

Each failure was then driven to GREEN with the minimum implementation.

## Verification

- Focused Task 4 tests:
  `npx vitest run src/services/__tests__/safetyPlanPrefill.test.ts src/utils/__tests__/safetyPlanSourceSync.test.ts`
  — 2 files, 9 tests passed.
- Inventory:
  `npx vitest run scripts/test-inventory.test.ts`
  — 1 file, 5 tests passed.
- TypeScript:
  `npx tsc --noEmit`
  — passed.
- Complete suite:
  `npm test`
  — 70 files, 413 tests passed.
- Patch hygiene:
  `git diff --check`
  — passed.

## Integration concern

Historical missions do not contain a Job ID. They are intentionally excluded
from Safety Plan prefill rather than guessed. The later Job/Mission integration
must set `jobId` when a mission is created from a Job, or provide an explicit
user-controlled linking/migration step for historical missions.
