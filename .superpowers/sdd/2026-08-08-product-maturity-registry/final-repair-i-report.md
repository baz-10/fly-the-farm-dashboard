# Final Repair Package I: Exact Workflow Isolation

## Status

Completed locally. No push or deployment was performed.

## Repairs

- Mission Authorisation now owns only readiness, authorisation reads and authorisation submission. The exact `mission-workspace/reports` child owns `readPack`, `generatePack`, pack state/errors and report status, including evidence-refresh reloads. When reports are Coming Soon, neither pack API method nor report status mounts while readiness and authorisation remain visible.
- Personnel now renders one exact `personnel/casa-credentials` boundary outside record iteration. Multiple records produce one Beta indicator or one uniquely identified Coming Soon workspace; each record's identity linking and archive context remain outside and accessible.
- `/quotes/:quoteId`, `/financials/new` and `/financials/:actualId` are classified by their parent modules with `workflowCode: null`, so narrow workflow promotion cannot mount an entire browser-local page.
- Quote Detail preserves browser printing and parent record controls while a separate `quotes/pdf-export` availability control is constrained.
- Actual Create and Actual Detail preserve record input, save/finalise, navigation and operational PDF behavior. One `financials/margin-analysis` boundary per page owns only margin/comparison presentation. A separate clearly labelled `financials/invoice-export` availability section does not relabel the operational PDF report as an invoice.
- Routes, roles, permissions, service contracts and persistence behavior remain unchanged. Current parent Coming Soon states continue to suppress Quotes and Financials pages.

## TDD evidence

- Mission RED: the constrained Mission Reports test observed one `readPack` call from the parent. The extracted child test also proved evidence refresh initially failed to reload the pack.
- Personnel RED: two records produced two Beta indicators and two Coming Soon regions with duplicate heading IDs.
- Route RED: Quote Detail and both Financial routes resolved workflow overrides instead of parent/null surfaces.
- Page RED: promoted-parent integration fixtures had no exact Quote PDF, Margin Analysis or Invoice Export surfaces.
- GREEN: the combined directly affected batch passed 6 suites and 36 tests; the final Mission Authorisation suite passed 4 tests, including pack refresh and constrained zero-call behavior.

## Verification

- Product maturity governance batch passed: 4 suites, 111 tests.
- Product maturity registry verifier passed: 46 modules, 12 workflows, 53 App routes, 148 customer UI files, 64 evidence references and zero customer-facing Legacy violations.
- Full test suite passed: 210 suites, 1016 tests.
- Optimized production build succeeded with the repository's existing lint and bundle-size warnings.
- `git diff --check` passed.
- No push or deployment.
