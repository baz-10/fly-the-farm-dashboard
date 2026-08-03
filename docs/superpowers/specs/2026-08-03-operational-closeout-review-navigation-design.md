# Operational Closeout Review Navigation Design

## Objective

Allow an operator to revisit and review every Operational Closeout stage before Mission Completion without weakening immutable evidence or historical integrity.

## Workflow

- Every closeout step is selectable before Mission Completion.
- Completed stages can be revisited in either direction.
- The interface shows which stages contain saved authoritative evidence.
- Saving a correction creates a new immutable revision; it never updates or deletes an earlier revision.
- A revised resource, chemical, event, or operational review record becomes the selected current revision for the pending Completion.
- Mission Completion references the exact selected Operational Evidence revision.
- After Mission Completion, all closeout evidence is read-only in this workflow.
- Post-completion corrections are outside this change and require a future audited amendment workflow.

## Component Boundary

`MissionOperationalCloseout` owns navigation state and renders the existing closeout stages. Step navigation remains a presentation concern. Existing API commands continue to create authoritative revisions and remain responsible for concurrency, tenant, location, audit, and outbox enforcement.

The component derives stage completion from persisted server state rather than assuming that visiting a screen completed it. Refreshing or reopening the Mission restores the furthest valid stage while retaining access to earlier stages.

## Integrity Rules

- Navigation never mutates evidence.
- A correction uses the latest persisted version as its optimistic-concurrency base.
- A stale correction is rejected and the operator must reload current evidence.
- Completion is disabled until a submitted Operational Evidence revision exists.
- Once Completion Evidence exists, save actions and completion-stage navigation controls become read-only.
- Earlier immutable revisions remain retrievable and auditable.

## User Experience

- Step labels are clickable while the Mission is not completed.
- Back and Next/Review controls are available where useful.
- Saved stages are visibly marked.
- A notice explains that corrections create a new revision.
- The final action clearly states that completing the Mission locks this workflow.

## Error Handling

API validation, permission, concurrency, tenant, and operating-location errors remain visible in the closeout panel. A failed save does not advance the workflow or alter the selected evidence.

## Acceptance Criteria

1. An operator can return from Operational Review to Operational Data Import, Actual Resources, Actual Chemical Usage, or Operational Events before Completion.
2. The operator can return to Operational Review after inspecting an earlier stage.
3. Correcting a saved stage creates a new immutable revision and retains the previous revision.
4. Refresh and reopen restore persisted completion state and allow review of all pre-completion stages.
5. Mission Completion references the selected submitted Operational Evidence revision.
6. After Completion, the workflow displays authoritative evidence read-only and prevents further saves.
7. Optimistic concurrency, permissions, tenant isolation, operating-location scope, audit, and transactional outbox behaviour remain enforced.
8. No browser-storage or legacy-persistence fallback is introduced.

## Test Strategy

- Component tests prove backward and forward stage navigation.
- Component tests prove persisted state restores the furthest valid pre-completion stage.
- Component tests prove corrections call versioned commands and refresh selected evidence.
- Component tests prove Completion locks all save controls.
- Existing API, migration, tenant, permission, audit, outbox, build, and production smoke suites remain green.

