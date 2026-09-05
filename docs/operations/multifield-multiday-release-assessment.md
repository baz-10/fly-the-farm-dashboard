# Multi-Field, Multi-Day Mission Operations Release Assessment

**Assessment date:** 5 September 2026

**Branch:** `codex/multifield-multiday-mission-design`

**Assessed clean branch HEAD:** `c51cb753b53848a700e24e645260380d655140b6`

**Merge base / current `spray-command/main`:** `0f46c7ee47d1483e960cce0f20c158ccebcf207c`

**Release recommendation:** `NO-GO`

**Product Maturity:** `COMING_SOON`

No merged-main commit or proposed immutable Production `RELEASE_SHA` exists. Normal review and merge have not occurred.

## Decision summary

Task 14A corrected the original three local blockers and the review-round frozen/per-day lineage issue. Deterministic shards 1 and 2 now pass. Shard 3 is the first failing boundary: two more older all-migration PGlite runners omit pgcrypto and fail during migration apply before their Personnel or Operating Authority assertions. Shards 4–8 were not run after that fail-closed stop. Protected Chromium/WebKit lifecycle execution and Production-shaped migration/legacy assessment remain unavailable. The workflow remains `COMING_SOON` and the recommendation remains `NO-GO`.

## Verification status

| Gate | Status | Exact evidence |
|---|---|---|
| Maturity registration TDD RED | PASS | Targeted test failed because `mission-workspace/multiday-operations` was absent. |
| Maturity registration TDD GREEN | PASS | Targeted boundary test: 1 passed, 228 skipped. Workflow is `COMING_SOON` and names all five required automated-evidence classes. |
| Focused authority/security tests | PASS | Fresh run: 7 suites / 57 tests passed under `TZ=Australia/Brisbane`: Job scope, package/CRP, operating days/JSA, aircraft actuals, chemical/weather, final sign-off and trusted API decoding. |
| Frozen report authority/security tests | PASS | Fresh run: 7 suites / 36 tests passed under `TZ=Australia/Brisbane`: frozen evidence/document, complete document, worker binding and idempotency serialization/scope. The expected negative-path worker diagnostic was logged by its passing test. |
| Production build | PASS WITH WARNINGS | Fresh `npm run build` exited 0. No build error; the existing lint and bundle-size warning backlog remains. |
| Deterministic eight-shard regression | CANNOT VERIFY / STALLED | 323 suites discovered under `TZ=Australia/Brisbane`. Shard 1 PASS: 41 suites / 290 tests. Shard 2 PASS: 41 suites / 280 tests. Corrected shard 3 PASS: 41 suites / 241 tests. Shard 4 emitted 27 individual suite PASS results, then stopped producing progress and did not exit; isolated `productMaturityBoundary.test.tsx` likewise produced no result for more than 60 seconds despite `--runInBand`, `--forceExit` and a 15-second Jest test timeout. Both local processes were terminated deliberately. No aggregate shard-4 test count is claimed; 13 shard suites remain indeterminate and shards 5–8 were not run. |
| Full-chain Mission/CRP database behavior | PASS (FOCUSED) | Fresh focused run passed. The executable chain proves prospective current authority, two authorised packages across separate days, later-rejection isolation, frozen completion authority and exact per-day package/approval lineage. |
| Product Maturity verifier | PASS | 46 modules / 16 workflows / 57 routes / 192 customer UI files / 85 evidence references; zero customer-facing Legacy violations. The workflow remains `COMING_SOON`. |
| Chromium/WebKit project discovery | PASS | 15 tests in 4 files listed: one auth setup plus seven Chromium and seven WebKit tests, including the real multi-Field/multi-day Mission surface. |
| Protected authenticated Chromium/WebKit lifecycle | CANNOT VERIFY | `E2E_ORGANISATION_EMAIL`, `E2E_ORGANISATION_PASSWORD` and `E2E_BASE_URL` are absent. No genuine Fly The Farm identity or data was used. |
| Local complete migration-chain behavior | PASS (FOCUSED) | All six repository verifiers that intentionally apply the governed full migration chain now register/create bundled pgcrypto. Four Jest wrappers pass (4 suites / 4 tests), and the Mission JSA and Organisation Branding/Reports scripts both exit 0. Unfiltered historical scripts that include environment-specific identity migrations were not blanket-edited. This remains local verification, not a Production dry-run. |
| Independent whole-slice review | CANNOT VERIFY IN THIS RUN | Prior task reviews and Task 14A review round 1 are recorded, but no separate independent reviewer was available for this final rerun. A fresh independent review remains required after correcting the newly exposed harness. |
| Production migration ledger / legacy record counts | CANNOT VERIFY | Requires an approved repository-governed remote read or an isolated Production snapshot, neither of which is available or authorised here. |

## Release-blocking findings

### 1. Effective CRP decision override — corrected in Task 14A

Focused status: corrected and passing; whole-gate confirmation pending.

`20260905100000_mission_scope_revision_and_crp_gate.sql` correctly changes `ftf_read_mission_operational_closeout` to use `ftf_resolve_effective_mission_authorisation`. `20260905120000_mission_aircraft_day_actuals.sql` later replaces the same function and selects the greatest authorisation revision without filtering to the Mission's effective authorised package/decision. The executable full-chain test proves that a later rejected proposal is consequently returned as operational authority.

Correction: `20260905200000_mission_closeout_effective_authorisation.sql` uses `ftf_resolve_effective_mission_authorisation` for prospective work, but when a frozen final completion exists it returns that completion's exact `authorisation_revision_id`. Each projected operating day independently includes the exact `AUTHORISED` decision for its own package revision. The full-chain regression covers two authorised packages across separate days, a later rejected proposal, frozen completion authority and pointer drift without flattening historical day lineage.

### 2. Product Maturity visible-string analysis — corrected in Task 14A

Focused status: corrected and passing; whole-gate confirmation pending.

Dynamic customer-visible state/amendment transformations were replaced by bounded static label dictionaries, and short-date display was moved to the deterministic date formatter. The verifier was not weakened and the workflow was not promoted. A newly exposed customer-facing prohibited term was also replaced with accurate neutral copy.

### 3. Legacy all-migration Aircraft harness pgcrypto setup — corrected in Task 14A

Focused status: corrected and passing; whole-gate confirmation pending.

The new migrations correctly rely on PostgreSQL `pgcrypto`, but `scripts/verifyAuthoritativeAircraftMigration.mjs` constructs PGlite without registering its bundled `pgcrypto` extension. This makes the deterministic regression fail before the Aircraft assertions. The focused Mission database harnesses register pgcrypto and can apply the chain.

Correction: the harness now registers the repository-controlled PGlite pgcrypto extension and executes `create extension if not exists pgcrypto` before applying migrations. Production SQL semantics are unchanged.

### 4. Shared CASA/Personnel all-migration harness pgcrypto — corrected

Focused status: corrected and passing; complete shard-2 context not yet rerun.

The complete gate revealed that `casaCompliancePglite.test.js` and `personnelCasaCredentialsPglite.test.js` both execute `scripts/verifyCasaComplianceMigration.mjs`. The runner constructed `new PGlite()` without pgcrypto, so both tests failed during migration apply; no CASA or Personnel product assertion failed.

Correction: the shared runner now registers the repository-controlled bundled pgcrypto extension and creates it before applying migrations, without changing or skipping Production SQL. Its two focused tests and complete shard 2 pass.

### 5. Full-chain PGlite harness pgcrypto inventory — corrected

Focused and shard status: corrected and passing.

Shard 3 proves `scripts/verifyAuthoritativePersonnelMigration.mjs` and `scripts/verifyOperatingAuthorityRegister.mjs` each construct PGlite without registering pgcrypto. Their complete-chain apply fails with PostgreSQL error `function digest(bytea, unknown) does not exist`; no Personnel or Operating Authority product assertion failed.

Correction: all six verifiers that intentionally apply the governed directory-wide chain now register and create the repository-controlled bundled pgcrypto extension without changing or skipping Production SQL: Authoritative Equipment Kits, Mission Weather, Personnel, Mission JSA, Operating Authority Register and Organisation Branding/Reports. The four Jest-backed verifiers pass 4 suites / 4 tests; the two direct verifiers exit 0. Unfiltered historical harnesses that include environment-specific identity migrations are not valid complete-chain runners and were deliberately left unchanged.

## Migration inventory

All thirteen development migrations are pending relative to `spray-command/main`. The list is ordered and must remain atomic for review; it supersedes the earlier seven-file planning list.

| Migration | SHA-256 | Purpose and database effect | Authority / data / application dependency |
|---|---|---|---|
| `20260905090000_multifield_job_scope.sql` | `a84f4bcabb015c0535a83dc0787edc11d47e2f055d64ebdea648d6c5ac655f06` | Alters `job_fields` parent constraint and adds checked `ftf_write_job_scope`. | `service_role` EXECUTE only; no generic table grant; mutates Job scope only on command; required by multi-Property Job UI/API. |
| `20260905100000_mission_scope_revision_and_crp_gate.sql` | `7bb30ce502e915eb1acf05c6350f595ae488a8b5271d259a495fa63d7d8703a1` | Extends package, authorisation and Mission schema; adds `mission_pack_fields`; replaces checked package/CRP and legacy-compatible Mission functions. | Forced RLS and no direct table writes; checked functions exposed only where required through `service_role`; records package/decision/audit/outbox rows; required by scope and CRP UI/API. |
| `20260905110000_mission_operating_days_and_jsa_reviews.sql` | `37c69854151730395233929bff95ba3256c680b179270af139b83d1abf8739ea` | Adds operating days, daily JSA reviews and Field activity plus guarded lifecycle RPCs. | Forced RLS; tables revoked from browser/service roles; checked `service_role` RPCs; operational writes only; required by daily workspace/API. |
| `20260905120000_mission_aircraft_day_actuals.sql` | `2f73bc6e4bdbabd489b095240b426936d29258391b67c9ae9c8ee98d15ac7028` | Adds aircraft-day totals, optional flights, import attributions, reconciliation and signed-off Fleet projection. | Forced RLS; no generic table grant; checked `service_role` RPCs; operational/audit/outbox/Fleet writes on command; required by aircraft actuals and flight-line evidence. Contains the blocking closeout-definition regression described above. |
| `20260905130000_mission_day_chemical_and_weather_actuals.sql` | `064173f26d7cfd1687a52bdebcadea7d091f5c1da837c54fdfd09454a1fc756c` | Adds append-only chemical actual revisions/lines and frozen weather reports. | Forced RLS; checked `service_role` reads/writes; freezes source digests and audit/outbox evidence; required by daily chemical/weather UI/API. |
| `20260905135000_mission_material_amendment_policy.sql` | `13503eb01056894d67e9f4e39c3dd123a34f2505195d7c806ee3d2e5f0e27311` | Adds immutable package amendments and checked administrative/material classification/history. | Forced RLS; no direct table authority; checked `service_role` command/read; writes prospective holds and audit/outbox; required by amendment API and CRP review. |
| `20260905140000_mission_final_signoff_and_job_close.sql` | `7586956d1652e8ca5b4a20da86113a64cec41dd4dcd17a522f82b540d057c743` | Extends completion authority, adds immutable projection sources, final sign-off, Job close and multi-day Financial prefill. | Forced RLS; no generic table grant; checked `service_role` functions; atomic Mission/Job/Fleet/Financial/audit/outbox mutation; required by final sign-off/Job close. |
| `20260905150000_mission_frozen_report_evidence.sql` | `c636cfbaf1f7dc7ffa952c2a1392795e22b7293f0485f927b18fc9706f8f852b` | Replaces internal frozen evidence builders with complete bounded report inputs. | Internal functions revoked from all runtime roles; read-only composition during finalisation; required by deterministic reports. |
| `20260905160000_mission_frozen_report_document.sql` | `bcc96aac0431906b32cc7e8762ba6511caad1d29004fa9e93ee12e99ce4829f5` | Adds exact report text/digest/schema/era columns and checked frozen-document read; replaces final sign-off to persist representation-safe evidence. | Read RPC and final-signoff RPC granted only to `service_role`; immutable completion write on sign-off; required by trusted report rendering. |
| `20260905170000_complete_mission_frozen_report_document.sql` | `6394fb26b35be6c2db1f735ecfd97f89efb3dba7b44f7d49e7262c84f2f3fe37` | Advances report document era and installs a trigger to freeze the complete bounded report representation. | Internal composer/trigger revoked; checked read only to `service_role`; no mutable report source; required for complete daily/governance report detail. |
| `20260905180000_report_job_frozen_document_authority.sql` | `ef9429dd4b06401c1768bf29e5c2e934e2db674408108daf8b3187283242377` | Binds report requests to completion authority and adds exact worker-job frozen-document read. | Trigger/internal helper revoked; worker read only to `service_role`; no report-data mutation beyond request binding; required by report worker. |
| `20260905190000_report_idempotency_and_governance_lineage.sql` | `54f780fb4e53ad4f141598a03a9c97b5bf3fc19e95afe634344d66241285793c` | Serialises scoped report idempotency and replaces report evidence builder with explicit effective package/JSA/approval lineage. | Request command only to `service_role`; lineage builder internal/revoked; creates/reuses scoped report jobs; required by deterministic idempotent reports. |
| `20260905200000_mission_closeout_effective_authorisation.sql` | `1ca63f5f0f9e16003cdc9b2c80d18783a02c71e7f68f6fbc903998a47b8ee741` | Replaces the closeout read projection so prospective authority uses the current authorised package, frozen completion uses its exact authorisation, and every operating day carries its own package/authorisation lineage while retaining aircraft-day, import-attribution and closeout detail. | Forward-only function correction; no schema/data/RLS/grant change and no new runtime authority; required to prevent current or rejected proposals from rewriting final or historical-day CRP lineage. |

All reviewed `SECURITY DEFINER` functions in this chain declare `search_path = public, pg_temp`. New authority tables force RLS and revoke generic access. Runtime entry points are narrowly granted to `service_role`; internal projection, digest, trigger and lock helpers are revoked. No migration introduces generic browser table-write authority.

## Locking, tenancy and history review

- Job, Mission and day commands resolve organisation, Base and parent scope server-side and use aggregate locks plus optimistic versions.
- CRP identity is derived from the authenticated internal-user/personnel relationship and exact Base eligibility; browser-provided CRP identity is not authoritative.
- Package decisions, JSA reviews, amendments, actual revisions, weather, completion and report evidence are append-only or terminally guarded.
- Fleet and Financial projections use stable source identities and unique/idempotent projection rows.
- Signed reports read exact frozen UTF-8 report text, verify SHA-256 before parsing and do not refresh mutable current evidence.
- PGlite is single-session; true independent-session blocking/deadlock timing remains a deferred verification limitation even where lock participation is exercised.
- Focused complete-chain tests pass for prospective, per-day and frozen-final authorisation lineage. The systematic pgcrypto harness inventory is corrected and focused checks pass; the deterministic gate and independent review remain incomplete.

## Legacy and migration assessment

- **Exact local proposed set:** the thirteen ordered migrations listed above.
- **Production pending set:** `CANNOT VERIFY`; no Production ledger was read.
- **Genuine source counts / ambiguity classes:** `CANNOT VERIFY`; no approved Production snapshot was available.
- **Fabricated operating days:** zero created by these migrations. The migrations add authority/schema and command paths; they do not synthesize historical Mission days, flights, chemical actuals or weather evidence.
- **Application deployment dependency:** yes. The branch changes trusted server routes, strict client decoders and Mission/Job UI in addition to SQL authority.
- **Fix-forward boundary:** diagnose why the Product Maturity boundary suite does not return under the deterministic Jest runner, prove it independently, then restart shard 4 and continue shards 5–8. Rerun maturity/build only after the deterministic gate passes and obtain independent review. Protected controlled cross-browser acceptance remains separately environment-gated.

## Cross-browser and Production boundary

Project configuration and controlled specs are discoverable for Chromium and WebKit. Authenticated execution is `CANNOT VERIFY`, not a pass or test failure, because controlled credentials/fixtures are absent. No request was sent to Production, no migration was applied, no deployment or alias changed, and no genuine Fly The Farm record was read or mutated.

## Required next gate

Do not request merge or Production authority from this state. Shards 1–3 pass, but shard 4 is stalled at the Product Maturity boundary and shards 5–8 remain unexecuted; independent review is also pending. Product Maturity and build passed at the preceding complete-gate commit and have not been rerun after this stalled deterministic gate. Protected controlled cross-browser acceptance and a Production-shaped ledger/legacy assessment still require their separately governed environments. Separate approval remains required for merge, every Production migration, Production deployment and Production acceptance.
