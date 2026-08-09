# Final Repair Package I: Boundary Isolation Design

## Goal

Make workflow maturity overrides constrain only their exact customer-facing workflow, without allowing parent components to mount workflow APIs or allowing workflow maturity to classify an entire route.

## Mission Pack ownership

`MissionAuthorisation` retains Mission readiness, authorisation reads, declarations and authorisation submission. A dedicated pack child owns `readPack`, `generatePack`, pack loading/error state and `ReportArtefactStatus`. That child is mounted only inside the exact `mission-workspace/reports` boundary. When reports are Coming Soon, the parent readiness and authorisation context remains available while neither pack API method nor report status mounts.

## Personnel credentials composition

Personnel creation, record identity, archive controls and identity linking remain outside the credentials workflow. One exact `personnel/casa-credentials` boundary wraps a credentials list body that renders credential status, verification actions and editors for every Personnel record. The boundary is outside `records.map`, so any record count produces one Beta indicator or one uniquely identified Coming Soon workspace.

## Route and workflow ownership

The route manifest classifies `/quotes/:quoteId`, `/financials/new` and `/financials/:actualId` by their parent modules with `workflowCode: null`. Workflow overrides never decide whether these entire pages mount.

Narrow exact boundaries own only these areas:

- `quotes/pdf-export`: the Quote Detail print/PDF availability control. Quote status changes, Create Job, deletion, navigation and quote content remain parent-owned.
- `financials/margin-analysis`: the margin summary and quote-comparison UI in both Actual Create and Actual Detail. Actual input, calculation needed to save the record, save/finalise/delete and navigation remain parent-owned.
- `financials/invoice-export`: a clearly labelled Invoice Export availability section. It does not rename or absorb Actual Detail's existing operational PDF report, which remains an operational report rather than an invoice.

When a parent module is promoted for a test while its workflow stays Coming Soon, the broader page mounts and remains usable, but the exact workflow area is replaced by one maturity workspace. Current parent Coming Soon states continue suppressing the whole page through `ProductMaturitySurface`, so no browser-local persistence is newly exposed in current production states.

## Validation

Tests temporarily mutate and restore exact registry entries. They prove Mission Pack API non-mounting, one credentials boundary for multiple Personnel records, parent-only route classification, narrow workflow replacement, and continued access to surrounding controls. The strict registry verifier, focused and full test suites, optimized build and diff checks must pass. No route, role, permission, API contract or persistence implementation changes are permitted.
