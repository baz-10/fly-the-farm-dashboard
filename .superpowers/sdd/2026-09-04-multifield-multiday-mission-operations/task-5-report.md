# Task 5 — Mission Scope and CRP Review UX

## Delivered

- Added a property-grouped Mission Field scope editor that only renders Fields already selected on the authoritative Job and prevents an empty subset.
- Replaced the browser-side legacy authorisation action with the Mission Operations revision flow: save scope, submit the exact package, then make an eligible-CRP decision on that package revision.
- Added exact revision review of package revision number, JSA revision ID, evidence digest, state, and Field count.
- Locks decision controls and offers reload after optimistic-concurrency conflicts; an `CRP_INELIGIBLE` response also removes the decision action.
- Wired the Mission planner review stage to Job Field groups, clarified Draft Mission setup, and made Job Detail link to Mission review without granting approval at Job level.
- Marked the workspace review stage as a Mission package revision authority question.

## Verification

- RED confirmed for the new scope, CRP review, authorisation-flow, workspace wording, unavailable-Field context, and CRP eligibility behaviours.
- `CI=true npm test -- --watchAll=false src/components/mission/__tests__/MissionAuthorisation.test.tsx src/components/mission/__tests__/MissionFieldScope.test.tsx src/components/mission/__tests__/MissionCrpReview.test.tsx src/utils/__tests__/missionWorkspace.test.ts src/pages/MissionRemoteWorkflow.test.tsx src/components/mission/__tests__/GuidedMissionCreation.test.tsx src/pages/__tests__/JobDetailMissionReview.test.tsx`
  - 48 tests passed across 7 suites.
- `npm run build`
  - completed successfully. The repository retains pre-existing lint warnings outside this task.

## Concern

The existing remote-workflow and guided-creation test suites emit pre-existing React `act(...)`, network, and MUI select warnings despite passing. They were not changed as part of this task.
