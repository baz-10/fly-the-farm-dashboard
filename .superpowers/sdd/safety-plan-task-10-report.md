# Safety Plan Task 10 Report

## Scope delivered

- Added a loopback-only, process-memory browser repository guarded by the exact
  `FTF_E2E_AUTH_FIXTURE=local-playwright-only` sentinel, a loopback Host, and
  `VERCEL !== 1`.
- The fixture supports deterministic reset, role identities and isolated
  Safety Plan writes without Supabase fallthrough. Reset and company-template
  writes are administrator-only.
- Added eight Safety Plan Playwright cases covering:
  - submit, nominated-authority approval, PIC acknowledgement and revision;
  - optional/Not-required mission non-blocking behaviour;
  - contractor approval denial;
  - tenant and client privacy;
  - approved PDF download and controlled version;
  - 375 px editor overflow;
  - company-master administrator restriction;
  - retained failed autosave and successful retry;
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
- Initial browser workflow failed before fixture/UI interactions were aligned;
  the final focused suite passes all eight cases.

## Fresh release gates

- `npm ls`: exit 0, valid dependency tree.
- `npm test`: 85 files, 570 tests passed, 0 failed.
- `npm run test:coverage`: 85 files, 570 tests passed; statements 31.59%,
  branches 26.41%, functions 29.20%, lines 31.79%.
- `npm run build`: exit 0; TypeScript and Vite build succeeded.
- `npm run test:e2e`: 15 Chromium tests passed, 0 failed.
- `git diff --check`: exit 0.
- Source scan found no `test.skip`, `it.skip`, `describe.skip`, `test.todo` or
  `test.fixme` declarations in the tested source surfaces.

The build retains the pre-existing pdf.js `eval` advisory and Vite large-chunk
warning. Neither fails the release gate.

## Deployment prerequisites

Do not deploy this implementation task. Before a protected preview:

1. Apply `docs/supabase-safety-plan-migration.sql`.
2. Create the private `ftf-safety-attachments` bucket and tenant/version
   policies.
3. Configure remote persistence and server-only Supabase variables.
4. Confirm `FTF_E2E_AUTH_FIXTURE` is absent from Vercel.
5. Verify administrator, contractor, nominated authority, PIC and client
   scenarios in the protected preview.

The protected Vercel preview and real Supabase bucket policies were not tested
from this local task. Rollback must promote the immediately preceding immutable
Vercel deployment without deleting additive database, audit or attachment
records.
