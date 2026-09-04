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

## Review fix round 1/5

### Root cause and RED evidence

- `JobCreate` used raw `fieldIds` from the query when it built its selected scope. It checked that an ID resolved to a Field, but did not check that the Field's parent Property belonged to the selected Client. A route with one valid Field and one foreign-client Field could therefore render and submit both.
- Added `drops a foreign-client Field seeded through the Job scope query` to `src/pages/OperationalWorkflow.test.tsx`. Before the fix, it failed because the selector rendered a two-Property scope instead of the required single valid Field.

### GREEN implementation and verification

- `JobCreate` now derives scope IDs by resolving each Field through a Property owned by the selected Client. The sanitized IDs are the only IDs supplied to the selector and the only IDs eligible for submission.
- The focused Jest command passed after the fix: 3 suites, 73 tests.
- `npm run build` passed with the repository's pre-existing lint-warning backlog.

### Browser coverage

- Added a WebKit project using the existing authenticated-project pattern.
- The acceptance workflow now creates a second Property and Field for the same Client, selects one Field at phone width, reveals the second Property at tablet width, selects its Field at desktop width, and asserts exactly the two created Field IDs in the authoritative Job POST response. The response waiter is registered before the create click and checks same origin, exact path, POST method and HTTP 201.
- `npx playwright test e2e/acceptance/client-to-mission.spec.ts --project=chromium --project=webkit --list` passed and lists Chromium and WebKit coverage.
- The full Chromium/WebKit run was attempted. Sandbox browser launch was denied by macOS port registration; the elevated retry reached the auth setup but stopped because `E2E_ORGANISATION_EMAIL` and `E2E_ORGANISATION_PASSWORD` are not available in this environment. No acceptance workflow, remote mutation or browser result was misreported as passing.

## Review fix round 2/5

### Root cause and RED evidence

- The responsive acceptance flow selected the secondary Field before the progressive-disclosure control was used. It therefore did not prove the intended initial-Property-first path.
- The resumed Mission flow used `secondaryLabel` as a Client option even though that label names the secondary Property and Field, then chose a Field from a different Property label.
- Added `src/__tests__/multifieldJobScopeAcceptance.test.js` before changing the acceptance flow. It failed against the old source because phone width selected `secondaryLabel` and desktop selected `label` in the wrong order.
- Added the WebKit project-shape expectation to `src/__tests__/productionBetaAcceptanceWorkflow.test.js` before extending its controlled Playwright-device fixture. It failed because the fixture did not expose `Desktop Safari`, so the parsed WebKit project had no `browserName: 'webkit'`.

### GREEN implementation and verification

- The Job flow now selects the initial Property's `label` Field at phone width, reveals another Property at tablet width, then selects the secondary Property's `secondaryLabel` Field at desktop width.
- The resumed Mission flow now selects the real Client `label`, then its matching `label` Property and `label` Field. The new static regression test keeps the responsive ordering and label roles aligned.
- The configuration fixture now represents both Desktop Chrome and Desktop Safari; the static project test verifies Chromium and WebKit browser identities.
- `CI=true npm test -- --watchAll=false src/__tests__/multifieldJobScopeAcceptance.test.js src/__tests__/productionBetaAcceptanceWorkflow.test.js src/components/jobs/__tests__/JobFieldScopeSelector.test.tsx src/pages/__tests__/JobWorkspace.test.tsx src/pages/OperationalWorkflow.test.tsx`
  - Passed: 5 suites, 85 tests.
- `npx playwright test e2e/acceptance/client-to-mission.spec.ts --project=chromium --project=webkit --list`
  - Passed: auth setup plus the Client-to-Mission flow in both Chromium and WebKit (3 tests listed).

### Browser execution status

- This environment currently has neither required acceptance credential (`E2E_ORGANISATION_EMAIL` nor `E2E_ORGANISATION_PASSWORD`), so a browser execution was not started in this review pass. The prior elevated run reached the credential guard and failed closed for that same reason. Browser coverage is listed and configured, but not reported as executed or passed.
