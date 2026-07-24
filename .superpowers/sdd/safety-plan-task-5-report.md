# Safety Plan Task 5 Implementation Report

## Outcome

Implemented the Compliance Safety Plan register, tenant-owned company-master
editor, operational-authority manager, protected routes and server-enforced
authority controls.

## Implementation

- Added `/compliance/safety-plans` with:
  - status, job, owner, approver, updated-date and attention filters;
  - controlled-version, approval and acknowledgement summaries;
  - role-aware Edit, Review and View actions;
  - explicit non-blocking copy for `not_required` plans.
- Added `/compliance/safety-plans/template` with:
  - first-use cloning of `AU_REOC_SAFETY_PLAN_STANDARD`;
  - editable section titles, guidance, optionality, field labels, field help and
    required flags;
  - section reordering and selective standard-section restoration;
  - platform-standard comparison;
  - immutable, incrementing company-master publication.
- Added the Compliance menu entry and protected route declarations.
- Added a contractor-safe authority view and an administrator-only nomination
  manager.
- Added same-tenant server checks, client rejection and an atomic Supabase RPC
  that updates `safety_plan_authority` and appends its audit event in one
  transaction.
- Hardened company-master storage so published records cannot be overwritten,
  bulk replaced or assigned a forged tenant identity.
- Added all new suites as explicit post-baseline supplements. The immutable
  historical baseline manifest was not changed.

## TDD evidence

RED was observed for:

- missing register, editor, authority manager and routes;
- unsupported authority API actions;
- cross-tenant/client nomination;
- mutable company-master records and forged template tenant identity;
- non-atomic authority update/audit behavior.

GREEN verification:

- focused Task 5 and security suites: 7 files, 100 tests;
- inventory guard: 5 tests;
- complete suite: 74 files, 432 tests;
- `npm run build`: passed (`tsc --noEmit && vite build`);
- Node syntax checks for `api/auth.js`, `api/store.js` and
  `server/session.js`: passed;
- `git diff --check`: passed.

## Deployment note

Run the updated `docs/supabase-safety-plan-migration.sql` before deploying the
API changes. It creates the service-role-only
`ftf_set_safety_plan_authority` RPC required for atomic nomination and audit.

## Follow-on boundary

The register links to `/compliance/safety-plans/:planId`, which Task 6 owns and
will implement as the guided five-step editor. Task 5 deliberately does not
duplicate that workflow.
