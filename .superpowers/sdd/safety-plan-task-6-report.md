# Safety Plan Task 6 report

## Status

Complete on `codex/safety-plan-design`.

## Delivered

- Added the authenticated route `/compliance/safety-plans/:planId`.
- Added a responsive five-step editor:
  1. Job details
  2. People and assets
  3. Hazards and controls
  4. Emergency planning
  5. Review and submit
- Added a persistent readiness rail with per-step required-field progress.
- Restores the last visited step from a non-required field within the controlled
  draft. It does not use global or browser-local navigation state.
- Added specialised job, people/assets, hazard/control, emergency and review
  panels, while keeping the reusable field renderer small.
- Hazard cards expose source mission, JSA item, original risk score, source
  mitigation and editable company control.
- Added autosave status, pending retry behaviour and conflict feedback without
  dropping unsaved text.
- Added explicit source-change review. Every conflicting source category and
  source-backed field requires an operator decision before refresh can apply.
- Source refresh now maps the one-shot `sourceRefreshIntent` to the
  server-authoritative `source_refreshed` audit action in the same plan write.
  The repository clears the intent before persistence; the client supplies
  neither audit actor nor occurrence time.
- Phone layout uses minmax-safe grids, a vertical step selector, full-width
  content, sticky bottom actions and no fixed 300 px minimum on the readiness
  panel. All primary navigation actions are at least 44 px high.
- Added arrow-key navigation and `aria-current="step"` semantics.

## TDD evidence

RED was observed for:

- the missing `SafetyPlanEditor` module and route;
- the repository retaining `sourceRefreshIntent` and recording a generic
  `field_changed` audit action.

The focused suite was then driven to GREEN for navigation, draft-restored
position, autosave/retry, source conflict decisions, keyboard navigation,
375 px layout safety, hazard provenance and atomic source-refresh audit
handling.

## Verification

- Focused editor/repository/source-sync/authenticated-API/inventory:
  `npx vitest run src/pages/SafetyPlanEditor.test.tsx src/services/__tests__/safetyPlanRepository.test.ts src/utils/__tests__/safetyPlanSourceSync.test.ts src/__tests__/authenticated-safety-plan-api.test.ts scripts/test-inventory.test.ts`
  — 5 files, 112 tests passed.
- TypeScript: `npx tsc --noEmit` — passed.
- Full suite: `npm test` — 76 files, 460 tests passed.
- Production build: `npm run build` — passed.
- Patch hygiene: `git diff --check` — passed.

The production build retains the existing pdf.js eval advisory and large
bundle warning; neither was introduced by this editor task.

## Integration note

The route accepts `latestSourceSnapshot` at the Job integration boundary.
Until Task 9 supplies the latest linked Job/Mission snapshot, the editor
correctly treats the stored controlled snapshot as current and does not show a
false source-change prompt.

## Independent review fixes

- Removed the source refresh utility's premature version-revision increment.
  The repository now performs the single plan/version CAS increment.
- The one-shot source refresh intent reaches the authenticated server. The
  server validates it against the stored/current source capture, derives the
  `source_refreshed` action, strips the intent and atomically stores the
  canonical plan plus server-provenance audit event.
- Added authenticated API coverage proving the canonical stored payload cannot
  replay the intent and actor/time remain server-derived.
- Direct editor URLs now hydrate when the provider finishes loading. Plan
  identity changes restore the incoming draft step, while same-plan provider
  refreshes cannot overwrite pending local field edits.
- Added visible `Use remote version` and `Create revision` conflict actions
  wired to the provider's serialized conflict recovery.
- Corrected the phone step selector to the approved vertical layout and added
  a responsive regression assertion.
- The server now canonicalises source-refresh audit metadata from the stored
  and incoming source snapshots. Capture timestamps and hazard counts must
  match exactly; decision entries must be unique, use an approved action and
  reference a real source item, context category or plan field.
- Only canonical, sorted `before` and `after` metadata is retained on the
  atomic `source_refreshed` audit event. Forged counts, unknown decision IDs,
  invalid actions, duplicate decisions and client actor/time are rejected
  before the compare-and-swap write.
- Final authenticated API and inventory verification: 2 files, 82 tests
  passed. The full suite increased to 456 passing tests.
- The final canonicality pass derives the exact required decision-ID set from
  changed or removed hazards, source-context categories and source-backed
  field values. Submitted unique IDs must equal that set: missing decisions
  and decisions for known-but-unchanged items are rejected.
- The client intent reports only decisions whose result is present in the
  resolved incoming plan. A `keep_company_value` choice therefore still
  controls the refresh but is not falsely recorded as an applied source
  change.
- Valid real-diff persistence plus missing-decision and unchanged-extraneous
  authenticated API regressions pass.
- Decision actions are now derived from the resolved outcome as well as the
  exact ID. Present changed context and source-backed fields require
  `accept_source_value`; removed or emptied values require `remove`.
- A changed hazard may use `keep_company_value` only when its incoming company
  control exactly matches the stored live company control while source value
  or update metadata changed. Otherwise the server requires
  `accept_source_value`; removed hazards require `remove`.
- The client canonicalises action labels to the same outcome rules before
  sending the one-shot intent. Authenticated regressions reject forged
  keep/remove labels and forged hazard keep while retaining valid hazard keep.
  Final full suite: 76 files, 460 tests.
