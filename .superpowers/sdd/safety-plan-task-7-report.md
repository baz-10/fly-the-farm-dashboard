# Safety Plan Task 7 implementation report

## Outcome

Implemented the controlled Safety Plan lifecycle for submission, approval,
crew acknowledgement and revision.

## Lifecycle and integrity

- Added deterministic browser SHA-256 canonicalisation for controlled plan
  content. Workflow metadata, transient UI state and later acknowledgements do
  not alter the approved-content digest.
- Added the matching Node canonicaliser and digest verifier. Approval is
  rejected before persistence if the submitted-content digest differs.
- Approval identity, UTC timestamp, digest and minimum seven-year retention
  date are derived or verified by the authenticated server.
- Approved versions are deeply frozen in the client lifecycle result.
- Revising an approved plan creates a new minor draft; approving that revision
  supersedes rather than deletes the preceding approved snapshot.
- Required-section readiness is enforced in both the client lifecycle and
  authenticated API.

## Atomic storage and security

- Added repository operations for submit, approve, acknowledge and revise.
  Each operation re-reads the stored record and checks its expected revision.
- Every controlled mutation carries one shared `operationId` across the plan
  compare-and-swap and audit append.
- The existing service-role SQL RPC remains the atomic transaction boundary:
  an audit failure rolls back the plan mutation and the client receives an
  error instead of confirmed approval.
- Server checks authority for approval/revision, preserves tenant/current
  revision boundaries and derives the audit action from the actual transition.
- Crew acknowledgement is allowed only for an assigned PIC/crew member.
  Actor, assigned role, statement and timestamp are server-derived; forged
  client values are discarded. Duplicate active acknowledgements are rejected.
- Missing acknowledgement remains an attention item only and never adds a
  mission-authorisation blocker.

## User interface

- Added `SafetyPlanApprovalPanel` to the final guided-editor step.
- Displays readiness, source-change warning, current approval, non-blocking
  acknowledgement attention and full version history.
- Approve/Revise controls are visible only to an administrator or nominated
  operational authority.
- Assigned crew receive the `Read and acknowledge` action.

## Tests added

- 10 lifecycle/canonicalisation tests.
- 4 approval-panel tests.
- 5 authenticated API security/transition tests.
- Updated immutable test inventory supplements without changing the historical
  baseline manifest.

## Verification

- `node --check api/store.js`
- focused lifecycle, UI, repository, context, editor, authenticated API and
  inventory suites
- full `npx vitest run`
- `npx tsc --noEmit`
- `npm run build`
- `git diff --check`

The build retains the pre-existing PDF.js `eval` and large-chunk warnings; no
new build error was introduced by this task.
