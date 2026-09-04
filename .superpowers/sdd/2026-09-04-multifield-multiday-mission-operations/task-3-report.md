# Task 3 Report — Progressive Multi-Property Job Selector

## Delivered

- Added `JobFieldScopeSelector`, a one-Client Material UI selector that groups Fields by Property, supports Field search, progressively reveals additional Properties, maintains a hectares summary, and clears the complete scope when the Client changes.
- Updated the Jobs workspace to hand off a selected multi-property scope through a primary legacy route plus `fieldIds` query parameter. Single-Field routes remain unchanged.
- Updated the authoritative Job form to treat the legacy route `propertyId` and `fieldId` as an initial scope only, allow its scope to be changed, and submit every selected Field to the checked Job API.
- Updated authoritative Job detail to show the saved Field scope grouped by Property with per-Property hectares.
- Updated acceptance coverage to register the exact same-origin Job POST response promise before clicking the submit control, require HTTP 201, and verify the returned field IDs.

## TDD evidence

1. Added selector tests before the component existed; the focused test failed with `Cannot find module '../JobFieldScopeSelector'`.
2. Added the workspace multi-property handoff test before replacing the legacy chained selectors; it failed because the new Client control/scope flow was absent.
3. Implemented the smallest selector and routing changes, then added a regression test proving the Job form submits the two route-selected Fields.

## Verification

- `CI=true npm test -- --watchAll=false src/components/jobs/__tests__/JobFieldScopeSelector.test.tsx src/pages/__tests__/JobWorkspace.test.tsx src/pages/OperationalWorkflow.test.tsx`
  - Passed: 3 suites, 72 tests.
- `git diff --check`
  - Passed.
- `npm run build`
  - Passed with the repository's pre-existing lint-warning backlog.
- `npx playwright test e2e/acceptance/client-to-mission.spec.ts --project=chromium --project=webkit`
  - Not runnable in this worktree: the Playwright configuration has no `webkit` project (available: environment, auth, cleanup, chromium, commercial-onboarding). No production acceptance action was attempted.

## Review notes

- Selection order is preserved so the first selected Field supplies only the bookmark-safe compatibility route; the complete `fieldIds` array remains the authoritative submitted scope.
- The UI never exposes Fields from another Client. Client changes clear selected Fields before any further selection occurs.
- The browser acceptance response waiter is installed before the Job submission click and matches both the configured origin and the exact `/api/v1/jobs` POST route.
