# Financial Actuals Slice 5 completion report

Date: 2026-08-22

Branch: `codex/financial-actuals-audit`

Production action: none

## Delivered authority

- Stable Financial Actual aggregate identity with immutable numbered revisions.
- Serialized correction creation under the aggregate-row lock shared with finalisation and archive.
- Correction Draft seeded from the current FINAL with new revision, work, cost, and provenance identities; copied financial state and evidence; predecessor linkage; and a bounded mandatory reason.
- Existing FINAL remains authoritative until successful atomic correction finalisation advances the current-final pointer.
- Bounded checked revision-history and exact historical-FINAL reads, including UI continuation beyond the first 100 revisions.
- Metadata-only archive with a persisted bounded reason; archive is denied while any active Draft exists.
- No Draft discard/abandon authority.
- Trusted Financial API actions only, strict recursive browser decoders, explicit permissions, tenant/Base checks, and no generic service-role table reads.
- Compact correction, current-FINAL, history, historical-detail, archive, and archive-blocked UX.

## Migration

- ID: `20260822130000`
- File: `supabase/migrations/20260822130000_financial_actual_correction_and_archive.sql`
- SHA-256: `4d932cf296b9cf9882da8f94ed3ed8d2295f6d06e70de1eb0273a2024ac8400b`
- Production application: not performed and not authorised.

## Race and transactional evidence

- Two correction-create calls produce at most one active Draft.
- Correction creation, finalisation, and archive all serialize on the exact aggregate row.
- Archive with an active Draft returns an explicit conflict with zero mutation.
- Failed correction finalisation leaves the preceding FINAL pointer unchanged.
- Successful correction finalisation advances the pointer atomically and preserves the preceding FINAL byte-for-byte.
- Archive persists only stable aggregate metadata and preserves revision, input, calculation, provenance, source-manifest, audit, and outbox evidence.
- Checked historical reads return frozen snapshots and never invoke the current calculator.

## Verification

- Focused Financial authority/API/UX tests: 16 suites / 81 tests passed across the two focused gates.
- Independent authority/security review: READY after three bounded review corrections.
- Chromium/WebKit responsive acceptance: 6/6 passed across phone, tablet, and desktop.
- Deterministic regression: 255 suites across all 8 shards passed.
- Product Maturity: 46 modules, 15 workflows, 56 routes, 163 customer UI files, 75 evidence references, zero customer-facing Legacy violations.
- Production build: passed (repository's existing non-blocking warnings remain).
- JavaScript syntax checks: passed.
- Diff check: passed.

## Review corrections incorporated

- Archive reason is bounded to the aggregate column's 500-character domain and persisted atomically.
- Revision-history UX follows the bounded keyset continuation and rejects overlap or authority-metadata drift.
- Frozen MANUAL revenue provenance is decoded recursively with exact keys and domain/value coherence.

## Deliberately excluded

- Draft abandonment/discard.
- Quote authority.
- Fleet cost authority.
- Export promotion.
- Product Maturity promotion of Financials beyond `COMING_SOON`.
- Production migration, backfill, deployment, alias, or genuine Fly The Farm data mutation.

## Proposed Slice 6 boundary

No Slice 6 implementation is authorised. A later separately approved slice may address export/presentation promotion or another Founder-selected financial capability, without changing the Slice 5 lifecycle authority.
