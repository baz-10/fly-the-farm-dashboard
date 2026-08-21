# Slice 4 final integration report

## Candidate

- Branch: `codex/fleet-maintenance-architecture`
- Final SQL review fix: included in this report's handoff commit
- Migration: `20260821100000_maintenance_requirements_due_state.sql`
- Migration SHA-256: `df6b0a8b7f4dbd1ef52484a4b5723239da6812aff6455583fe6568ae08c641cc`

## Authority and projection

- Stable requirement identity plus immutable versioned authority records.
- Explicit `MANUFACTURER`, `ORGANISATION_STANDARD`, and `CONDITION_BASED` authority planes.
- Only approved, effective, in-interval versions participate.
- Exact asset/model/system/position scope, typed thresholds, explicit `ANY`, optional exact Service Kit linkage, optimistic lifecycle commands, audit/outbox evidence, forced RLS, and least-privilege RPC grants. System/position applicability is re-proved against the exact active relationship at `asOf`.
- Actorless projection helper remains private; only the actor/tenant/Base-checked read RPC is executable by `service_role`.
- Explicit offset-bearing `asOf` and IANA timezone; `Australia/Brisbane` boundaries covered. Every eligible attached child Base is independently active/IANA-validated before child projection; aliases and archived locations fail closed without turning denied children into an oracle.
- Missing or unsupported baselines/evidence return `INSUFFICIENT_DATA`.
- Reads do not mutate status, serviceability, availability, mission readiness, audit, or outbox.

## API and UI

- Full explainable due-state projection is available only per authorised asset.
- Fleet summary uses compact evidence-free rows, filter-bound keyset cursors, page size max 25, scan cap 100 with continuation, and concurrency four.
- Compact Maintenance groups preserve exact `OVERDUE`, `DUE`, `DUE_SOON`, `CURRENT`, and `INSUFFICIENT_DATA` states.
- No client-derived `UPCOMING`; no automatic grounding; attached child attention is separate from parent state.
- Rendered data is synchronously bound to exact route, asOf, authority/session, API, retry, and filter scope.
- FTF-11, GEN-003, and T100-002 fixtures are test-only.

## Fresh lead verification

- Final SQL delta: 5 migration/PGlite suites, 29 tests passed.

- Focused server authority/diagnostics: 3 suites, 67 tests passed.
- Focused Slice 4 client/database: 8 suites, 106 tests passed.
- Full deterministic regression: 260 suites across 8 shards passed.
- Product Maturity: 46 modules, 15 workflows, 57 routes, 171 customer UI files, 80 evidence references, zero customer-facing Legacy violations.
- Production build: passed with existing repository warnings.
- Chromium/WebKit responsive acceptance: 6/6 passed at phone, tablet, and desktop widths.
- Diff check: clean.
- Worktree: clean before final review.

## Combined local migration order

1. `20260820090000_authoritative_fleet_assets.sql` — `50323d9d22acce3ab0e454cd1145377754c1c0d40c49510ad8f72dd0e00eb543`
2. `20260820100000_asset_relationships_meters_and_systems.sql` — `aca0ceeec86574e0d559177f869f2e626f61693ad8246fc02a1e395056fa89ba`
3. `20260820110000_maintenance_technical_catalogue.sql` — `6e76ce880750868ce4bffbff73dea6beaea57ced7971f60f900419b4826cbe81`
4. `20260821100000_maintenance_requirements_due_state.sql` — `df6b0a8b7f4dbd1ef52484a4b5723239da6812aff6455583fe6568ae08c641cc`

## Production boundary

No Production migration, backfill, deployment, push, seed, or genuine Fly The Farm record mutation occurred. The Slice 1 Production-shaped backfill assessment remains mandatory before any Production migration approval.
