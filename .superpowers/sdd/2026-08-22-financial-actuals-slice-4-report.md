# Financial Actuals Authority Foundation — Slice 4 Report

## Outcome

Slice 4 adapts the customer Financial Actuals workflow to the checked repository-controlled authority established by Slices 1–3. Financials remains `COMING_SOON` in normal and Production operation. A development-only, exact environment gate permits browser acceptance without changing the canonical Product Maturity route composition or registry manifest.

No Production migration, deployment, alias change, backfill, or genuine Fly The Farm data mutation occurred.

## Authority boundary

- `/api/v1/financial-actuals` accepts only the exact list, read, create, Draft update, operational-prefill read/accept, source-drift read, and finalise actions.
- Trusted organisation, actor, Base and permission context comes from the authenticated server session; browser-supplied authority is not accepted.
- POST requests require same-origin validation. Payloads, cardinality, UUIDs, versions and pagination are bounded and fail closed.
- Repository calls use only the checked Financial Actual RPCs. No browser-local Financial record is authoritative.
- Browser decoders validate exact keys recursively, reject extra or malformed nested data, enforce database numeric domains, and fail the whole response on unsafe diagnostics.
- FINAL is rendered read-only from the frozen PostgreSQL snapshot. TypeScript calculation is labelled Preview; PostgreSQL finalisation remains authoritative.
- Detail and list state is bound to exact user, tenant, permissions, platform identity and delegated-support session/scope. Scope changes synchronously suppress resolved data and generation-guard pending work.
- Draft editor state remounts on exact Draft identity and `rowVersion`, preventing stale local values or identifiers from being submitted with a newer optimistic version.
- Multi-row work, cost and provenance evidence is preserved. Operational prefill uses explicit RETAIN, ACCEPT or OVERRIDE selections; it never silently accepts all facts.

## Files and interfaces

- Trusted API: `server/financial-actuals-api.js`, `server/financial-actuals-repository.js`, `server/operational-dispatcher.js`
- Browser contract: `src/services/financialActualsApi.ts`, `src/services/authorityScope.ts`, `src/types/financialActuals.ts`
- Customer workflow: `src/pages/FinancialsList.tsx`, `src/pages/ActualCreate.tsx`, `src/pages/ActualDetail.tsx`, `src/components/financialActuals/*`
- Governance: `src/productMaturity/financialActualsAcceptance.ts`, `src/productMaturity/registry.ts`
- Browser acceptance: `e2e/financial-actuals/financial-actuals.spec.ts`, `playwright.financial-actuals.config.ts`

Slice 4 creates no migration. It consumes the checked authority from:

1. `20260822100000_financial_actual_authority.sql` — `d846a8f57a3b1509834611fe226d184fc87f4f6d57927cb957b080fd32f7111b`
2. `20260822110000_financial_actual_calculation_and_finalisation.sql` — `71bc459d1beeaad4ce5b4120288679d234ed50e0f07ba03890c1fbb733cb5589`
3. `20260822120000_financial_actual_operational_prefill.sql` — `0d9676ab30c05748f54e0a84112fde51ec0081aafa031fc7489bbc50ff71256a`
4. `20260822125000_financial_actual_trusted_read_and_safe_draft_update.sql` — `d04fe2d4e4405a8df4388cbef73440290a739722d5c24170cd166d96dd3cb776`

## Verification evidence

- Focused trusted API/browser/UI authority: 7 suites, 28 tests passed.
- Independent authority/security review: READY after two review rounds.
- Deterministic regression: 252 suites across all 8 shards passed.
- Product Maturity: 46 modules, 15 workflows, 56 App routes, 162 customer UI files, 75 evidence references, zero customer-facing Legacy violations.
- Production build: passed; only pre-existing lint/bundle warnings remain.
- Chromium/WebKit responsive development acceptance: 6/6 passed at phone, tablet and desktop widths.
- `git diff --check`: passed.

## Deferred scope

Correction-Draft lifecycle, archive completion, Quote authority, Fleet cost authority, export release, Product Maturity promotion, and all Production actions remain separately gated.
