# Multi-Field, Multi-Day Mission Operations Release Assessment

**Assessment date:** 5 September 2026

**Branch:** `codex/multifield-multiday-mission-design`

**Assessed branch HEAD before this release-preparation commit:** `9a74c6c3fc9ef524aef637147449a8ef34d83c44`

**Merge base / current `spray-command/main`:** `0f46c7ee47d1483e960cce0f20c158ccebcf207c`

**Release recommendation:** `NO-GO`

**Product Maturity:** `COMING_SOON`

No merged-main commit or proposed immutable Production `RELEASE_SHA` exists. Normal review and merge have not occurred.

## Decision summary

Task 14A has corrected the three locally proven blockers with a forward-only authority migration, repository-standard pgcrypto harness setup and statically governed customer-visible labels. The previously failing focused checks now pass. The complete release gate has not yet been rerun, and protected Chromium/WebKit lifecycle execution plus the Production-shaped migration/legacy assessment remain unavailable in this environment. The workflow therefore remains `COMING_SOON` and the recommendation remains `NO-GO` until the whole gate is repeated.

## Verification status

| Gate | Status | Exact evidence |
|---|---|---|
| Maturity registration TDD RED | PASS | Targeted test failed because `mission-workspace/multiday-operations` was absent. |
| Maturity registration TDD GREEN | PASS | Targeted boundary test: 1 passed, 228 skipped. Workflow is `COMING_SOON` and names all five required automated-evidence classes. |
| Focused authority/security tests | PASS | 7 suites / 66 tests passed: Job scope, package/CRP, operating days/JSA, aircraft actuals, chemical/weather, final sign-off and trusted API. |
| Frozen report authority/security tests | PASS | 7 suites / 37 tests passed: frozen evidence/document, complete document, worker binding, idempotency serialization/scope and renderer integrity. |
| Production build | PASS WITH PRE-EXISTING WARNINGS | `npm run build` exited 0. No build error; repository warning backlog remains. |
| Deterministic eight-shard regression | NOT RERUN | Task 14A reran the previously failing Aircraft PGlite test only: 1 suite / 1 test passed after registering and creating pgcrypto. The complete eight-shard gate remains pending. |
| Full-chain Mission/CRP database behavior | PASS (FOCUSED) | 1 suite / 1 child-process test passed. The executable chain now proves a later rejected proposal does not displace the exact effective authorised decision and package lineage. |
| Product Maturity verifier | PASS | 46 modules / 16 workflows / 57 routes / 192 customer UI files / 85 evidence references; zero customer-facing Legacy violations. The workflow remains `COMING_SOON`. |
| Chromium/WebKit project discovery | PASS | Five tests listed: auth setup plus the controlled lifecycle and Client-to-Mission paths for Chromium and WebKit. |
| Protected authenticated Chromium/WebKit lifecycle | CANNOT VERIFY | `E2E_ORGANISATION_EMAIL`, `E2E_ORGANISATION_PASSWORD` and `E2E_BASE_URL` are absent. No genuine Fly The Farm identity or data was used. |
| Local Production-shaped migration apply | PARTIAL / FAILING BEHAVIOR | The full chain applies in the pgcrypto-enabled Mission authority harness, but the post-apply effective-authorisation behavior fails. A second legacy harness lacks its required pgcrypto extension and fails during apply. This is not a successful dry-run. |
| Production migration ledger / legacy record counts | CANNOT VERIFY | Requires an approved repository-governed remote read or an isolated Production snapshot, neither of which is available or authorised here. |

## Release-blocking findings

### 1. Effective CRP decision override — corrected in Task 14A

Focused status: corrected and passing; whole-gate confirmation pending.

`20260905100000_mission_scope_revision_and_crp_gate.sql` correctly changes `ftf_read_mission_operational_closeout` to use `ftf_resolve_effective_mission_authorisation`. `20260905120000_mission_aircraft_day_actuals.sql` later replaces the same function and selects the greatest authorisation revision without filtering to the Mission's effective authorised package/decision. The executable full-chain test proves that a later rejected proposal is consequently returned as operational authority.

Correction: `20260905200000_mission_closeout_effective_authorisation.sql` restores `ftf_resolve_effective_mission_authorisation` in the final closeout projection without rewriting prior migrations. The full-chain regression asserts the exact authorised decision and its governing package revision after a later rejection.

### 2. Product Maturity visible-string analysis — corrected in Task 14A

Focused status: corrected and passing; whole-gate confirmation pending.

Dynamic customer-visible state/amendment transformations were replaced by bounded static label dictionaries, and short-date display was moved to the deterministic date formatter. The verifier was not weakened and the workflow was not promoted. A newly exposed customer-facing prohibited term was also replaced with accurate neutral copy.

### 3. Legacy all-migration Aircraft harness pgcrypto setup — corrected in Task 14A

Focused status: corrected and passing; whole-gate confirmation pending.

The new migrations correctly rely on PostgreSQL `pgcrypto`, but `scripts/verifyAuthoritativeAircraftMigration.mjs` constructs PGlite without registering its bundled `pgcrypto` extension. This makes the deterministic regression fail before the Aircraft assertions. The focused Mission database harnesses register pgcrypto and can apply the chain.

Correction: the harness now registers the repository-controlled PGlite pgcrypto extension and executes `create extension if not exists pgcrypto` before applying migrations. Production SQL semantics are unchanged.

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
| `20260905200000_mission_closeout_effective_authorisation.sql` | `627dc95f0ef9977075832d7a3c52c1e92f2b2efa1d308fc063d43421325e3033` | Replaces the closeout read projection so authorisation is resolved through the canonical effective-authorisation function while retaining aircraft-day, import-attribution and closeout detail. | Forward-only function correction; no schema/data/RLS/grant change and no new runtime authority; required to preserve exact governing CRP lineage after a later rejected proposal. |

All reviewed `SECURITY DEFINER` functions in this chain declare `search_path = public, pg_temp`. New authority tables force RLS and revoke generic access. Runtime entry points are narrowly granted to `service_role`; internal projection, digest, trigger and lock helpers are revoked. No migration introduces generic browser table-write authority.

## Locking, tenancy and history review

- Job, Mission and day commands resolve organisation, Base and parent scope server-side and use aggregate locks plus optimistic versions.
- CRP identity is derived from the authenticated internal-user/personnel relationship and exact Base eligibility; browser-provided CRP identity is not authoritative.
- Package decisions, JSA reviews, amendments, actual revisions, weather, completion and report evidence are append-only or terminally guarded.
- Fleet and Financial projections use stable source identities and unique/idempotent projection rows.
- Signed reports read exact frozen UTF-8 report text, verify SHA-256 before parsing and do not refresh mutable current evidence.
- PGlite is single-session; true independent-session blocking/deadlock timing remains a deferred verification limitation even where lock participation is exercised.
- The effective-authorisation regression above prevents a READY security conclusion for the whole ordered chain.

## Legacy and migration assessment

- **Exact local proposed set:** the thirteen ordered migrations listed above.
- **Production pending set:** `CANNOT VERIFY`; no Production ledger was read.
- **Genuine source counts / ambiguity classes:** `CANNOT VERIFY`; no approved Production snapshot was available.
- **Fabricated operating days:** zero created by these migrations. The migrations add authority/schema and command paths; they do not synthesize historical Mission days, flights, chemical actuals or weather evidence.
- **Application deployment dependency:** yes. The branch changes trusted server routes, strict client decoders and Mission/Job UI in addition to SQL authority.
- **Fix-forward boundary:** correct the three release-blocking findings on this branch through reviewed forward changes; rerun the complete chain, all eight deterministic shards, Product Maturity, build and protected controlled cross-browser acceptance before any merge or Production request.

## Cross-browser and Production boundary

Project configuration and controlled specs are discoverable for Chromium and WebKit. Authenticated execution is `CANNOT VERIFY`, not a pass or test failure, because controlled credentials/fixtures are absent. No request was sent to Production, no migration was applied, no deployment or alias changed, and no genuine Fly The Farm record was read or mutated.

## Required next gate

Do not request merge or Production authority from this state. The three local blockers are corrected, but Task 14's complete deterministic, build, maturity and independent-review gate must now be repeated. Protected controlled cross-browser acceptance and a Production-shaped ledger/legacy assessment still require their separately governed environments. Separate approval remains required for merge, every Production migration, Production deployment and Production acceptance.
