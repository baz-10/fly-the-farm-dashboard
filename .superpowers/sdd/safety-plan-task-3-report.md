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
