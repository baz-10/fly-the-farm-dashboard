# Safety Plan Task 10 Report

## Scope delivered

- Added a loopback-only, process-memory browser repository guarded by the exact
  `FTF_E2E_AUTH_FIXTURE=local-playwright-only` sentinel, a loopback Host, and
  `VERCEL !== 1`.
- The fixture supports deterministic reset, role identities and isolated
  Safety Plan writes without Supabase fallthrough. Reset and company-template
  writes are administrator-only.
- Added six Safety Plan Playwright cases running with
  `VITE_PERSISTENCE_MODE=remote` against the loopback process-memory API,
  covering:
  - creation from the Job page, imported JSA/risk sources and required-field
    prefill;
  - edit/autosave, submit, nominated-authority approval, PIC acknowledgement,
    revision, second approval and superseded history;
  - optional/Not-required mission non-blocking behaviour;
  - contractor approval denial;
  - tenant and client privacy;
  - administrator client-copy export with parsed PDF version and notice;
  - 375 px editor overflow;
  - company-master administrator restriction;
  - an attempted approved-content edit rejected by the remote repository;
  - retained failed remote autosave and successful retry;
  - explicit source-refresh decisions.
- Added exact release-gate inventory supplements.
- Added `docs/safety-plans.md` and expanded production deployment guidance for
  roles, lifecycle, retention/recovery, source refresh, attachments, PDF,
  migration, private bucket policy, protected preview and rollback.

## TDD evidence

- Initial middleware write/reset test failed with HTTP 401 before write fixture
  support.
- Administrator-only reset/template-write regression failed with HTTP 204
  before permission enforcement.
- Initial browser workflow failed before remote API fixture/UI interactions
  were aligned; the final focused suite passes all six cases.

## Fresh release gates

- `npm ls`: exit 0, valid dependency tree.
- `npm test`: 85 files, 571 tests passed, 0 failed.
- `npm run test:coverage`: 85 files, 571 tests passed; statements 30.93%,
  branches 26.66%, functions 28.74%, lines 31.10%.
- `npm run build`: exit 0; TypeScript and Vite build succeeded.
- `npm run test:e2e`: 13 Chromium tests passed, 0 failed.
- `git diff --check`: exit 0.
- Source scan found no `test.skip`, `it.skip`, `describe.skip`, `test.todo` or
  `test.fixme` declarations in the tested source surfaces.

The build retains the pre-existing pdf.js `eval` advisory and Vite large-chunk
warning. Neither fails the release gate.

## Deployment prerequisites

Do not deploy this implementation task. Before a protected preview:

1. Apply the base `ftf_store`/profile/RLS migration, then
   `docs/supabase-safety-plan-migration.sql`.
2. Create the private `ftf-safety-attachments` bucket with no `anon` or
   `authenticated` Storage policies; access only through the validated
   service-role gateway.
3. Configure remote persistence and server-only Supabase variables.
4. Confirm `FTF_E2E_AUTH_FIXTURE` is absent from Vercel.
5. Verify administrator, contractor, nominated authority, PIC and client
   scenarios in the protected preview.

The protected Vercel preview and real Supabase bucket policies were not tested
from this local task. Rollback must promote the immediately preceding immutable
Vercel deployment without deleting additive database, audit or attachment
records.
