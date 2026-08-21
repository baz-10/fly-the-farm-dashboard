# Slice 4 Task 1 — Maintenance requirements and due-state report

## Status

Complete. The slice adds the authoritative SQL model, lifecycle commands, baseline command, and deterministic as-of due-state projection. No Production migration, deployment, backfill, fixture seeding, availability mutation, or later-slice work was performed.

## TDD evidence

The two task tests were created before the production migration. The first focused run was observed RED:

```text
FAIL src/__tests__/maintenanceRequirementsPglite.test.js
FAIL src/__tests__/maintenanceRequirementsMigration.test.js
ENOENT .../supabase/migrations/20260821100000_maintenance_requirements_due_state.sql
Test Suites: 2 failed, 2 total
Tests: 6 failed, 6 total
```

A second RED cycle was observed after adding behavioral coverage for typed units, exact asset/system coherence, stable version supersession, exact Service Kit linkage, and Platform manufacturer authority. The first failure proved that an odometer threshold incorrectly accepted an hours unit. A later RED proved that an EFFECTIVE requirement could initially link a non-effective Service Kit. Both were fixed at the database boundary.

Review fix round 1 added a real-role test using `SET ROLE service_role`. RED proved that the actorless internal projection helper was directly executable and returned caller-selected organisation/asset/timezone data. The migration now revokes that helper from `public`, `anon`, `authenticated`, and `service_role`; the owning checked `SECURITY DEFINER` read RPC can still call it internally. GREEN proves the helper raises permission denied for `service_role` while `ftf_read_asset_maintenance_due_state` still succeeds for the same trusted-server role and authorised actor.

Final Slice 4 review was also behavioral-test-first. RED proved that an otherwise authorised attached child was projected with PostgreSQL timezone alias `EST`, and that SYSTEM/COMPONENT_POSITION requirements continued to apply after their referenced relationship became wrong or archived. The checked read now validates every eligible child Base as active with an explicit IANA name before any child projection. Exact system/position joins now prove organisation, asset, relationship identity, creation/archive interval at `asOf`, and current exact applicability for baseline evidence. Denied children remain invisible and cannot become an error oracle.

## Implemented contract

- Stable `maintenance_requirements` identities with immutable, numbered `maintenance_requirement_versions`.
- Separate Platform and organisation ownership and actor planes. Manufacturer authority is rejected in the organisation plane and requires evidenced Platform review/approval.
- Requirement kinds for service, inspection, replacement, calibration, one-time, and condition-based requirements.
- Exact asset, model, system, component-position, and future component-type scope foundations with cross-scope contradiction guards. SYSTEM and COMPONENT_POSITION projection re-proves the referenced live relationship on the exact asset at the requested `asOf`; later relationship archive or reassignment stops applicability.
- Explicit `ANY` threshold policy only. `ALL`, omitted, and ambiguous policies are rejected.
- Typed calendar, meter, condition, one-time, and component threshold foundations. Meter units are type-checked, exact meter definitions must match type/unit, and explicit due-soon windows are stored rather than invented.
- Append-only, evidenced asset threshold baselines. Baselines are constrained to a requirement actually applicable to the target asset.
- Narrow proposal, review, approve, and effective RPCs for both authority planes, each using optimistic `row_version` checks and fixed `search_path` security-definer boundaries.
- Atomic audit and transactional-outbox events for proposals, lifecycle transitions, and baseline recording.
- Effective version supersession with preserved effective intervals. EFFECTIVE/SUPERSEDED content and reviewed threshold aggregates are immutable.
- Optional exact `service_template_versions` linkage through the pre-established Slice 3 link table. An EFFECTIVE requirement cannot point at a Service Kit version that is not effective at the same instant.
- `ftf_read_asset_maintenance_due_state(organisation, actor, registry, as_of)` as the authoritative projection. It returns explainable requirement/version/authority/evidence, every threshold calculation, explicit baseline/current/due/remaining values, controlling threshold, exact Service Kit version, and state.
- Projection states: `CURRENT`, `DUE_SOON`, `DUE`, `OVERDUE`, and `INSUFFICIENT_DATA`. Missing evidence never becomes zero and never becomes `CURRENT`.
- Corrected meter readings are authoritative as of the requested instant. Aircraft flight-hours retain the prior aircraft compatibility source when no qualifying meter reading exists, and the response labels the source.
- Calendar and one-time calculations use the authorised asset Base's validated IANA timezone. Tests pin `Australia/Brisbane`, including the leap-day anniversary and exact local-midnight boundary. PostgreSQL aliases such as `EST` are rejected.
- Active attached children are returned only as separate summaries and only if each child independently passes current Base authority. Every otherwise eligible child must reference an active Base with an explicit IANA timezone before any child is projected; invalid/archived child location state fails closed. A denied child cannot contaminate, leak, or trigger an error through its parent.
- Forced RLS and revoked generic DML on every new command-owned table. Trusted server access is EXECUTE-only on narrow RPCs.
- The projection performs no writes and contains no update of aircraft, equipment-kit, fleet-asset status, mission readiness, serviceability, or availability fields.

## Verification

Final focused and adjacent verification:

```text
PASS src/__tests__/maintenanceRequirementsPglite.test.js
PASS src/__tests__/maintenanceTechnicalCataloguePglite.test.js
PASS src/__tests__/migrationLint.test.js
PASS src/__tests__/maintenanceRequirementsMigration.test.js
PASS src/__tests__/maintenanceTechnicalCatalogueMigration.test.js
Test Suites: 5 passed, 5 total
Tests: 29 passed, 29 total
```

`git diff --check` passed.

Migration SHA-256:

```text
df6b0a8b7f4dbd1ef52484a4b5723239da6812aff6455583fe6568ae08c641cc
```

## Files

- `supabase/migrations/20260821100000_maintenance_requirements_due_state.sql`
- `src/__tests__/maintenanceRequirementsMigration.test.js`
- `src/__tests__/maintenanceRequirementsPglite.test.js`
- `.superpowers/sdd/2026-08-21-maintenance-requirements-due-state/task-1-report.md`

The pre-existing untracked plan at `docs/superpowers/plans/2026-08-21-maintenance-requirements-due-state.md` was read as approved design context but was not changed or staged.

## Concerns and explicit boundaries

- `CONDITION` and future `COMPONENT` thresholds intentionally resolve to `INSUFFICIENT_DATA` until an authoritative observed-condition or tracked-component evidence source is implemented by an approved later slice. The schema is ready without pretending that evidence exists.
- The SQL projection is the sole due-state authority. A later repository/API/UI slice must call the RPC and must not reproduce calendar or meter arithmetic in JavaScript.
- Production remains unchanged. This migration requires the normal reviewed migration/deployment process before any environment can use it.
