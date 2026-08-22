# Financial Actuals Slice 6 — Authoritative Export Completion Evidence

Date: 2026-08-22

Branch: `codex/financial-actuals-audit`

Production action: **None**

## Outcome

Slice 6 adds a representation-only PDF export of an exact immutable FINAL Financial Actual revision. The FINAL revision remains the sole financial authority. No export table, duplicate snapshot, report state, export job, generic report framework, or Financial-specific audit subsystem was introduced.

1. **Specification/plan commit:** `53bb136` (`docs: specify financial actuals slice 6`).
2. **Slice 6 implementation commit:** recorded after this report is committed.
3. **Migration 6:** `20260822140000_financial_actual_export_evidence.sql`; SHA-256 `2dce17b8cd9de145e2f79f7003e6e7a7557b10c316654126c5815327b8c254a2`.
4. **Migration objects:** one function only, `public.ftf_record_financial_actual_export_evidence(uuid,uuid,uuid,uuid,integer,text,text,text,timestamptz)`. No table, column, RLS policy, data backfill, or duplicate frozen authority was added.
5. **Export RPC:** `SECURITY DEFINER`, fixed `search_path`, execute revoked from `public`, `anon`, and `authenticated`, granted only to `service_role`; it independently rechecks actor read/export permission, tenant, Base, exact FINAL revision, revision number, digest, formula, report version, and bounded generation time.
6. **Trusted server flow:** same-origin POST → authenticated context → both permissions → checked current/historical reads → strict fail-whole decode → server PDF render → bounded evidence RPC → PDF release. PDF bytes are never released if evidence recording fails.
7. **Strict decoder:** exact-key recursive validation covers record, hierarchy identity links, Draft/current/historical authority, operational sources, source drift, frozen inputs/evidence/provenance, manifest sets, exact organisation/aggregate/revision lineage, provenance references, override predecessor lineage, numeric domains, null semantics, and credential/control-character rejection.
8. **PDF renderer:** dedicated `jsPDF` renderer consumes only the decoded frozen model. AUD minor-unit display rounding uses canonical decimal strings and `BigInt`, never IEEE-754 `Number`; valid upper-bound and negative values are covered.
9. **Current FINAL proof:** focused API/renderer/browser tests generate and download the exact current FINAL revision.
10. **Historical FINAL proof:** the same architecture generates and downloads an exact immutable historical FINAL revision after checked historical authority read.
11. **Exact-revision proof:** substitution, malformed current authority during historical export, foreign revision provenance, mismatched manifests, bad digest/formula/report version, and incomplete nested authority all fail whole.
12. **Permission proof:** both `financial_actuals.read` and `financial_actuals.export` are required at HTTP and database boundaries. Draft export is absent. The retained current FINAL remains exportable while a correction Draft exists.
13. **Audit/outbox evidence:** one bounded metadata-only `financial_actual.export_generated` audit event and one `financial.actual.export_generated` outbox event are written atomically. Payload contains IDs/version/digest/formula/report version/timestamp only; no values, labels, PDF bytes, or snapshots.
14. **Lifecycle acceptance:** existing authority suites plus Slice 6 coverage prove create, Draft persistence, prefill, financial inputs, preview parity, finalisation, immutable FINAL, current export, correction lifecycle, historical revision/export, corrected current export, history, archive, provenance, drift, conflict, permissions, and tenant/Base boundaries.
15. **Second-session proof:** checked reads reconstruct immutable FINAL authority; export does not depend on browser-local state.
16. **Concurrency proof:** existing finalisation/correction/archive aggregate locking remains authoritative; export records exact immutable FINAL identity and does not create mutable export state.
17. **Source-drift proof:** source-drift structures are strictly decoded and displayed independently; export always uses the frozen FINAL rather than current operational recalculation.
18. **Archive proof:** archived aggregate visibility rules remain unchanged; checked historical FINAL authority remains exportable where existing read/export authority permits.
19. **Chromium/WebKit:** PASS.
20. **Responsive acceptance:** 12/12 PASS across Chromium and WebKit at phone, tablet, and desktop for the development-gated Financial list and current/historical export paths.
21. **Focused tests:** Financial Actual suite 16 suites / 106 tests PASS; final review-focused decoder/renderer/UI gate 3 suites / 23 tests PASS.
22. **Full regression:** deterministic Jest acceptance PASS, 259 suites across all 8 governed shards.
23. **PostgreSQL/TypeScript parity:** existing FINANCIAL_ACTUAL_V1 parity coverage remains PASS, including precision, rounding, invalid-date, overflow, null-ratio, operational-day, and finalisation fixtures.
24. **Product Maturity:** 46 modules, 15 workflows, 56 App routes, 163 customer UI files, 75 evidence references, zero customer-facing Legacy violations.
25. **Formal promotion assessment:** Code/authority ready — **YES**. End-to-end acceptance ready — **YES for controlled development acceptance**. Private Beta evidence satisfied — **NO**. Product promotion — **NOT READY / NOT AUTHORISED**. Financials remains `COMING_SOON`.
26. **Production build:** PASS (existing repository warnings remain; no build error).
27. **Independent whole-workstream review:** **READY** after test-first correction of strict nested linkage, lossless money formatting, current-FINAL export during correction, current-authority validation during historical export, and override predecessor resolution.
28. **Complete Financial migration order:** `20260822100000_financial_actual_authority.sql`; `20260822110000_financial_actual_calculation_and_finalisation.sql`; `20260822120000_financial_actual_operational_prefill.sql`; `20260822125000_financial_actual_checked_authority.sql`; `20260822130000_financial_actual_correction_and_archive.sql`; `20260822140000_financial_actual_export_evidence.sql`.
29. **Repository integration recommendation:** **GO** for normal reviewed repository integration of the exact Slice 1–6 commit chain. Do not squash/reorder migrations. No claim of Production authority is implied.
30. **Eventual Production release recommendation:** **NO-GO today**. First require normal merge governance, immutable merged-main SHA, exact migration-ledger/dry-run reconciliation, non-mutating release rehearsal, separate Founder migration/deployment approval, and controlled Private Beta acceptance evidence.

## Safety confirmation

- No Production migration ran.
- No Production deployment or alias change occurred.
- No Product Maturity promotion occurred.
- Financials remains `COMING_SOON`.
- No genuine Fly The Farm record was read, created, changed, archived, or deleted by this implementation or verification work.
