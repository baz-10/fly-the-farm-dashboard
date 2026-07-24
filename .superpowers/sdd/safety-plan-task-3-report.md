# Safety Plan Task 3 report

## Status

Complete. Task 3 is implemented on `codex/safety-plan-design`.

- Starting commit: `836a90981b0f5fc63ac5e3d466a1be580dff416e`
- Implementation commit: `1f06a5bddedb5f5408efb1fafd6631d4e1df712c`

## Delivered

- Added the record-by-record Safety Plan repository and typed conflict handling.
- Added atomic compare-and-swap writes with an audit event for existing records.
- Added atomic insert-with-audit for new records through
  `ftf_insert_safety_plan_with_audit`.
- Added server-derived audit tenant, actor and timestamp fields.
- Added revision-checked soft delete and restore operations.
- Added the authenticated `SafetyPlanProvider`, 750 ms autosave debounce,
  explicit retry, conflict resolution, same-plan save serialization/rebase,
  session isolation, per-plan cancellation, and cleanup on unmount/logout.
- Kept initial Safety Plan load failures isolated from the rest of the app.
- Preserved the historical test baseline manifest and registered the new suites
  as explicit post-baseline supplements.

The brief's example used an audit action named `draft_saved`. That value is not
part of the accepted Task 1 audit-action type. Saves therefore use the valid
domain actions `created`, `field_changed`, `revised`, `submitted`, and
`not_required_selected`.

## TDD evidence

RED was observed before implementation for:

- missing repository, provider, and record persistence primitives;
- stale revision metadata and delete/restore revision enforcement;
- provider registration;
- supplemental inventory registration;
- local stale writes;
- canonical post-insert reads;
- atomic write/audit and lifecycle behavior;
- failed autosave retention, tenant/session isolation, serial rebasing, and
  cancellation of queued or deleted-plan saves.

Each failure was then driven to GREEN by the implementation and regression
tests.

## Verification

- Focused Task 3 tests:
  `npx vitest run src/services/__tests__/safetyPlanRepository.test.ts src/contexts/__tests__/SafetyPlanContext.test.tsx src/services/__tests__/persistence.safetyPlan.test.ts src/App.safetyPlanProvider.test.tsx src/__tests__/authenticated-safety-plan-api.test.ts`
  — 5 files, 85 tests passed.
- Inventory:
  `npx vitest run scripts/test-inventory.test.ts`
  — 1 file, 5 tests passed.
- TypeScript:
  `npx tsc --noEmit`
  — passed.
- Server syntax:
  `node --check api/store.js`
  — passed.
- Complete suite:
  `npm test`
  — 68 files, 369 tests passed.
- Patch hygiene:
  `git diff --check`
  — passed.

## Review findings resolved

- Removed unaudited Safety Plan collection and singleton write paths.
- Made plan and audit persistence atomic for both create and update.
- Preserved typed HTTP 409 metadata through the client persistence layer.
- Made concurrent creates return a typed conflict.
- Prevented prior-tenant loads and queued writes from crossing auth sessions.
- Added per-plan generations/epochs so stale saves cannot overwrite newer edits
  or resurrect deleted records.
- Retained an edit abandoned during a pre-debounce plan switch for explicit
  retry while reverting its optimistic UI state.
- Used canonical server payloads after writes and rejected metadata-free local
  hard deletes.

## Deployment concern

Apply `docs/supabase-safety-plan-migration.sql` before deploying the server
change. New Safety Plan creation depends on the
`ftf_insert_safety_plan_with_audit` RPC, and updates depend on the expanded
compare-and-swap RPC signature.

## Controller review fixes

Controller review implementation commit:
`e79ce36ee90e9557a43673fb6150d99ea1882f33`.

### 1. Local tenant and session isolation

- Safety Plan template, plan, and audit browser-cache keys are now scoped by
  exact tenant and user identity in both local and remote modes.
- Unrelated legacy local collection keys retain their existing unscoped
  semantics.
- Repository list, singleton read, and write paths exact-match the
  authenticated tenant.
- Provider loads defensively exact-filter returned records after an identity
  switch.

RED:

- Persistence, repository, and context isolation run: 3 failed, 29 passed.
- Cross-tenant repository write regression: 1 failed, 11 skipped.

GREEN:

- Those regressions pass in the final focused run.

### 2. Abortable mutation lifecycle

- `AbortSignal` now flows from provider operations through repository methods,
  record persistence, and the fetch transport.
- Each in-flight plan save, conflict read, delete, or restore has a tracked
  `AbortController`.
- Logout, tenant changes, StrictMode unmount, plan switches, delete, and
  restore abort the affected transport and settle it before a conflicting
  operation starts.
- Session/epoch guards prevent already-queued saves from dispatching after an
  identity or lifecycle change.
- Browser and non-browser errors named `AbortError` are cancellations, not
  retry or conflict failures.

RED:

- Persistence/repository signal propagation run: 2 failed, 18 passed.
- Provider lifecycle run: 8 failed, 14 passed, with the two expected
  unhandled lifecycle rejections before error handling existed.
- Generic AbortError and immediate double-retry run: 2 failed, 31 passed.

GREEN:

- Provider and persistence run: 33 passed.
- Final focused run: 110 passed.

Client abort can stop and discard the transport response, but it cannot recall
server execution that has already begun. Atomic database compare-and-swap
remains the authority that prevents a later delete, restore, or save from
silently overwriting that execution.

### 3. Delete and restore failure bookkeeping

- Lifecycle operations snapshot pending and failed edits before cancelling a
  timer or active save.
- Failed delete or restore restores the optimistic text as explicit
  `pending_retry`, preserves one retryable input, and exposes the lifecycle
  error.
- Successful lifecycle operations clear the saved snapshot only after the
  canonical response arrives.
- Delete and restore both wait for an aborted active save to settle before
  their own repository call.

RED:

- The initial provider lifecycle run failed both delete and restore retry
  retention regressions and surfaced their unhandled promise rejections.

GREEN:

- Both failure paths, plus active-save delete and restore ordering, pass in the
  24-test context suite.

### 4. Retry and conflict bookkeeping

- Explicit retry clears the current debounce.
- Per-plan queued counts and in-flight tracking prevent immediate double-click
  retry from scheduling duplicate writes, audits, or revision increments.
- Retry deterministically no-ops for an already queued or active plan save.
- `keep_remote` clears both pending and failed conflict input so later Retry
  cannot revive discarded edits.

RED:

- Immediate duplicate retry called the repository twice.
- Retry after `keep_remote` also called the repository twice.

GREEN:

- Both regressions now assert exactly one repository save call.

### 5. Server-derived audit actions

- Atomic plan writes ignore caller action claims and derive the audit action
  from the validated stored-to-incoming transition.
- Deterministic mappings cover created, field-changed, submitted, approved,
  revised, superseded, not-required, deleted, and restored transitions.
- The server also derives the affected version linkage where applicable.
- Standalone audit appends allow only explicitly non-mutating
  `acknowledged`, `shared`, and `pdf_generated` actions; mutation-looking
  actions require the matching atomic plan mutation.
- Forged `created`, `revised`, `source_refreshed`, and `submitted` probes are
  covered, along with forged approve and supersede claims.

RED:

- Forged mutation-action and standalone-action run: 8 failed, 55 passed.

GREEN:

- API suite: 64 passed.

## Controller review final verification

- Focused repository/context/persistence/provider/API command: 5 files,
  110 tests passed.
- Inventory command: 1 file, 5 tests passed.
- `npx tsc --noEmit`: passed.
- `node --check api/store.js`: passed.
- `npm test`: 68 files, 394 tests passed.
- `git diff --check`: passed.

## Per-plan race review fixes

Per-plan state-model implementation commit:
`0c56c5b5fa377a91f7a406c57a38cb5de0def3ce`.

### Root cause and model

The remaining races shared one cause: a single global debounce timer and
pending input could not represent multiple plans or multiple generations of
one plan. The provider now owns these internal structures by `planId`:

- debounce timer;
- latest pending generation;
- failed generation;
- active save and per-plan save chain;
- synchronous queued count and Retry reservation;
- exclusive lifecycle lock;
- monotonic lifecycle epoch.

Public `saveState`, `lastSavedAt`, and `error` follow the most recently
selected/touched plan, while background operations update only their own
per-plan entries.

### Regression-first evidence

The reviewer schedules were added before the state-model rewrite. The context
run reported 6 failed and 26 passed:

- A1 remained active while A2 was debounced and Retry stranded A2;
- two failed plans could not be retried exactly once by two concurrent Retry
  invocations;
- save during active delete optimistically changed Plan A;
- save during active restore optimistically changed Plan A;
- deleting Plan A cancelled Plan B's debounce;
- restoring Plan A cancelled Plan B's debounce.

The immutable inventory supplement then reported 1 failed and 4 passed until
the explicit context declaration count was updated from 23 to 28. The
historical baseline manifest was not changed.

### Retry isolation

- A1 and A2 serialize on Plan A's chain while Plan B has an independent chain.
- Retry does not clear A2's timer while A1 is active; A2 queues exactly once
  when its own debounce expires and rebases on A1's canonical revision.
- Retry reserves every eligible failed plan synchronously before its first
  `await`. A concurrent Retry invocation therefore cannot reserve or enqueue
  the same plan.
- Immediate Retry of a non-active debounced edit still converts that plan's
  timer into one immediate save.

### Lifecycle isolation

- Delete and restore install an exclusive same-plan lock synchronously before
  snapshotting, cancelling, or awaiting any work.
- `saveDraft` checks that lock before optimistic state mutation or timer
  creation and rejects with typed HTTP-style metadata:
  `SAFETY_PLAN_LIFECYCLE_ACTIVE`, status 409.
- A lifecycle operation aborts and settles the active same-plan save, drains
  invalidated same-plan queue entries under the lock, and only then calls the
  repository.
- Success clears only that plan's timers, pending/failed generations,
  reservations, queues, active entry, and epoch.
- Failure restores only that plan's retryable snapshot and releases the lock;
  a subsequent edit is accepted normally.
- Plan B timers and saves continue while Plan A is deleted or restored.

### Final verification

- Context suite: 32 tests passed.
- Focused repository/context/persistence/provider/API command: 5 files,
  118 tests passed.
- Inventory command: 1 file, 5 tests passed.
- `npx tsc --noEmit`: passed.
- `node --check api/store.js`: passed.
- `npm test`: 68 files, 402 tests passed.
- `git diff --check`: passed.

## Conflict-resolution race review fixes

Conflict-resolution serialization commit:
`3f9946a7923ac4a43b55bec7c3af01af70defd2a`.

### Regression-first evidence

Two deferred-`getPlan` schedules were added before the controller change. The
context run reported 2 failed and 32 passed:

- a newer same-plan edit optimistically replaced the draft while
  `keep_remote` was waiting for its remote snapshot;
- two concurrent `create_revision` resolutions each issued their own remote
  lookup.

The inventory then reported 1 failed and 4 passed until the explicit context
declaration count was updated from 28 to 30. The historical baseline manifest
was not changed.

### Synchronous per-plan resolution ownership

- `resolveConflict` installs a per-plan reservation before its first `await`.
- A second resolution for that plan awaits the existing reservation instead
  of issuing another lookup, revision save, or audit-producing mutation.
- Public `saveDraft` checks the reservation before optimistic state changes
  and rejects with typed HTTP-style metadata:
  `SAFETY_PLAN_CONFLICT_RESOLUTION_ACTIVE`, status 409.
- Retry and lifecycle operations also respect the same-plan reservation.
- Resolution invalidates, aborts, and settles only the target plan's timer,
  active save, queued count, chain, and epoch; other plans remain independent.
- The reservation is released in `finally`, including lookup failure and
  abort paths.

### Final verification

- Context suite: 34 tests passed.
- Focused repository/context/persistence/provider/API command: 5 files,
  120 tests passed.
- Inventory command: 1 file, 5 tests passed.
- `npx tsc --noEmit`: passed.
- `node --check api/store.js`: passed.
- `npm test`: 68 files, 404 tests passed.
- `git diff --check`: passed.
