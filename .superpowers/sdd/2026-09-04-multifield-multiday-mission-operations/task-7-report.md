# Task 7 Report — Mission Operating Days Workspace

## Status

Implemented in the supplied isolated worktree. The UI uses only the canonical Mission Operations client; it does not read or write browser/local mission state, and no Production system or migration was contacted.

## Delivered

- Added a compact responsive operating-day card grid that opens one focused workspace at a time, with a Base-local date, lifecycle state, daily JSA status, and clearly labelled actual hectare totals.
- Added a focused day detail that requires review of the exact effective JSA revision before the start command is enabled, records only Fields from the exact authorised package scope, preserves fixed-scale hectare values, and distinguishes Proposed plan data from actual Field evidence.
- Wired authoritative create, refresh, review-JSA, start, Field-activity, and completion commands through `missionOperationsApi`, preserving its optimistic row versions and server-side authority checks.
- Added `operating-days` to the Mission lifecycle between CRP review and closeout. It remains unavailable before Mission Authorisation and stays historically visible after completion.
- Kept the lifecycle strip usable on narrow screens with horizontal scroll snapping; card and detail layouts collapse cleanly from desktop grid to phone stacks.

## TDD evidence

### RED

1. The required component suite failed because `MissionOperatingDays` and `MissionOperatingDayDetail` did not exist.
2. The workspace utility test failed because the Base-local date formatter and exact-JSA start guard did not exist.

### GREEN

- Focused UI/workspace verification passed: 5 suites, 39 tests.
  - `CI=true npm test -- --watchAll=false src/components/mission/__tests__/MissionOperatingDays.test.tsx src/components/mission/__tests__/MissionOperatingDayDetail.test.tsx src/components/mission/__tests__/MissionWorkspaceNavigation.test.tsx src/utils/__tests__/missionWorkspace.test.ts src/pages/MissionRemoteWorkflow.test.tsx`
- `npm run build` completed successfully after the final UI changes. The build retains the repository's existing lint-warning backlog and stale Browserslist-data notice; no new Task 7 warning was reported.
- `git diff --check` passed.

## Self-review and concerns

- Confirmed the page wires this workspace only in `AuthoritativeMissionPlanning`; local Mission Planning remains untouched.
- Confirmed candidate Job Fields are intersected with the day’s exact `packageRevisionId` scope before activity entry. If canonical package history cannot be loaded, the detail refuses Field activity instead of broadening scope.
- Confirmed a reviewed JSA must be `CONDITIONS_COVERED` and bound to the day’s stored JSA revision before the start action becomes available. The server remains the final lifecycle/readiness authority.
- The adjacent `MissionRemoteWorkflow` suite logs pre-existing asynchronous `act(...)` and jsdom network console warnings, but all 39 assertions passed. They were not changed within this Task 7 slice.

## Fix round 1/5

- Excluded `PLANNED` Field activities from card values labelled `Actual` and rendered proposed and actual activity lists separately.
- Corrected Field-activity optimistic concurrency: creation sends `activityId: null, expectedVersion: 0`; editing a selected activity sends that activity's own `rowVersion`.
- Recognised the canonical operating-day/activity version and lifecycle conflict codes, exposed `Reload operating day`, reread the authoritative aggregate, selected the exact day by id, and retried commands with its refreshed version.
- Focused RED initially failed for the proposed-total, create/update payload and conflict-reload cases. The payload tests also identified that optional-callback short-circuiting prevented commands when no parent callback was supplied; commands now execute before the optional notification.
