# Safety Plan Task 9 implementation report

## Scope delivered

- Added an optional Job Safety Plan card, associated only by exact `jobId`.
- Added create, continue/view, acknowledge, controlled revision, print, PDF
  export, client-copy export and “not required” actions.
- Kept every Safety Plan action isolated from mission state and mission
  authorisation.
- Added immutable approved-version PDF generation with deterministic snapshot
  content, pagination, controlled sections, source names, approval,
  acknowledgements, revision history, attachment manifest, integrity digests
  and the CASA/ReOC notice.
- Added a reduced client copy that retains record-integrity digests while
  removing internal record/source identifiers.
- Added server-normalised `client_copy_exported` audit records. The server
  verifies approved version state and administrator role, then derives tenant,
  actor and occurrence time.
- Passed a latest-source snapshot from the exact Job integration boundary to
  the editor. The editor ignores routed snapshots whose job ID does not exactly
  match the stored plan.
- Preserved the historical test baseline and registered all new tests as
  explicit supplements.

## TDD evidence

- Initial Job card and PDF tests failed because the modules did not exist.
- Repository and authenticated API client-copy tests failed because
  `recordClientCopyExport` and the server action did not exist.
- Implemented the smallest feature surface, then expanded regression coverage
  for strict job matching, immutable export selection, client-copy redaction,
  action visibility and routed source identity.

## Verification

- Focused Safety Plan/Job/API/inventory tests: 136 passing.
- TypeScript: `npx tsc --noEmit` passed.
- Full suite: 85 files, 551 tests passed.
- Production build: passed (Vite 7.3.6, 12,625 modules transformed).
- Server syntax: `node --check api/store.js` passed.
- Diff whitespace: `git diff --check` passed.

## Deployment / operational notes

- The server and client must be deployed together because the new
  `client_copy_exported` action is rejected by older server allowlists.
- Existing Vite warnings remain: `pdfjs-dist` contains eval and the main bundle
  exceeds the default chunk-size warning. Neither warning was introduced as a
  functional failure in this task.

## Independent review fixes

- Client-copy exports now require the administrator-supplied client ID to
  exactly match the client stored in the approved current version snapshot.
  Missing, stale-version and cross-client targets are rejected by the server.
- New Job plans now require the tenant's latest published company master; the
  platform standard and an unpublished draft are never silently substituted.
  Company identity comes from the tenant licence profile and missing company
  setup produces a clear in-product error.
- Assigned mission PIC identities are captured in the job snapshot, and the Job
  acknowledgement action is shown only when the authenticated actor is assigned
  and has no active acknowledgement.
- “Not required” reasons are optional and the choice remains reversible. An
  operator can convert it to the job's initial draft without Safety Plan
  authority and without creating a second job association.
- PDF metadata, creation date and file ID now derive from immutable approved
  snapshot data. Repeated generation produces identical bytes.
- Wrapped body text is paginated line-by-line and is constrained above the
  footer boundary.

## Final provenance fixes

- Company name, ABN and optional ReOC/contact identity are captured in the
  version source snapshot at Job-plan creation. That snapshot is part of the
  canonical approval digest.
- Approved PDF rendering ignores mutable runtime user/licence company values
  and reads company identity exclusively from the immutable approved version.
  A changed contractor/licence profile therefore cannot alter approved PDF
  bytes or displayed operator identity.
- Crew prefill now collects actual stable mission assignments for PIC, visual
  observer and CRP roles from JSA sign-offs, execution crew and mission
  approvals. Duplicate people are consolidated without losing roles.
- The plan creator is never invented as PIC. Jobs with no assigned PIC retain
  an empty crew field so readiness reports the missing assignment.
- Job acknowledgement visibility and repository acknowledgement both require
  the actor's exact stable ID in the approved/submitted crew snapshot. Tests
  cover an unassigned administrator plus assigned visual-observer and CRP
  acknowledgements.
