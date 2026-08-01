# Package 1 Task 3 report — Client, property and field connection

## Status

Implemented the bounded frontend connection slice for the existing client,
property and field routes. In remote mode, those screens now load and mutate
through `/api/v1`; local mode retains the existing development/demo store.
Jobs and missions have typed adapter surfaces only and their screens were not
modified.

## Files changed

- `src/services/operationalApi.ts`
- `src/services/operationalDataStore.ts`
- `src/contexts/OperationalDataContext.tsx`
- `src/index.tsx`
- `src/types/fieldManagement.ts`
- `src/pages/ClientList.tsx`
- `src/pages/ClientDetail.tsx`
- `src/pages/PropertyDetail.tsx`
- `src/pages/FieldDetail.tsx`
- `src/services/__tests__/operationalApi.test.ts`
- `src/services/__tests__/operationalDataStore.test.ts`
- `src/contexts/__tests__/OperationalDataContext.test.tsx`
- `src/pages/OperationalWorkflow.test.tsx`
- `.superpowers/sdd/package-1-task-3-report.md`

## TDD red evidence

1. `CI=true npm test -- --runInBand src/services/__tests__/operationalApi.test.ts src/services/__tests__/operationalDataStore.test.ts`
   first failed because both requested modules were absent.
2. `CI=true npm test -- --runInBand src/contexts/__tests__/OperationalDataContext.test.tsx`
   first failed because the provider did not exist. Its local-scope follow-up
   then failed because the authenticated user had not been applied before the
   local compatibility load.
3. `CI=true npm test -- --runInBand src/pages/OperationalWorkflow.test.tsx`
   produced five intended workflow failures: load errors rendered as valid
   empty lists, all three detail levels read the legacy store instead of the
   provider, and destructive confirmation was still delete rather than remote
   archive.
4. Focused follow-up tests caught three additional authority defects before
   their fixes: malformed HTTP 200 lists became valid empty lists, an in-flight
   save from an old authenticated scope still resolved to its caller, and an
   unsupported client-notes value was sent while the UI could imply it was
   saved.
5. The field workflow test also first failed when remote job history rendered
   the unconnected browser job cache as a valid empty history.

## Green verification

- `CI=true npm test -- --runInBand src/pages/OperationalWorkflow.test.tsx src/contexts/__tests__/OperationalDataContext.test.tsx src/services/__tests__/operationalApi.test.ts src/services/__tests__/operationalDataStore.test.ts`
  — 4 suites, 23 tests passed at the focused checkpoint; later focused screen
  additions are included in the full count below.
- `CI=true npm test -- --runInBand` — 45 suites, 204 tests passed, 0 failed.
- `npm run build` — exit 0. The repository's existing ESLint and outdated
  Browserslist warnings remain; no warning is reported for the new adapter,
  store or provider.
- `git diff --check` — exit 0.

## Implementation and self-review

- The typed adapter covers session, clients, properties, fields, jobs and
  missions. It uses same-origin credentials, a 12-second abort bound, explicit
  writable payload allow-lists, structured status/code/details errors,
  optimistic-current-version metadata, pagination, and malformed-response
  rejection.
- Client/property/field API records are mapped explicitly from relational
  snake-case or the current API camel-case boundary into the existing screen
  types. Row versions and the field boundary-version reference are retained.
- The operational store resolves the authenticated organisation internally,
  loads all three collections authoritatively, clears records synchronously on
  user/logout/refresh transitions, rejects stale in-flight mutation results,
  and publishes `Saved` only after server confirmation.
- Remote mode never calls localStorage or `/api/store` for these four screens
  and has no silent fallback. A failed or unauthorised load has a distinct UI
  and never renders as a valid empty list/detail. Missing parent/child chains
  clear the detail view.
- Remote errors distinguish unauthorised, validation, optimistic-version and
  archive/dependency conflict states. Archive confirmation replaces delete
  wording and preserves the existing confirmation interaction.
- Local mode continues through `fieldManagementStore`, with authenticated user
  scoping applied before its initial load.
- The existing routes, field order, terminology and card/dialog structure are
  retained. Job and mission screens were not changed. Until their connection
  task, remote job counts display an em dash, FieldDetail does not render the
  local job cache as empty authoritative history, and its Record Job action is
  disabled.
- Browser writes do not include organisation IDs, role/permission data,
  financial fields, audit fields, arbitrary payload blobs or Supabase secrets.

## Concerns / next gates

- The current trusted API/database contract stores only client name/contact
  fields, property name/address, and field property/name/area plus an existing
  boundary-version ID. It has no columns for the legacy client addresses/notes,
  property town/state/lot-plan/notes/map pin, or field notes. Remote saves that
  contain those values are blocked with a visible message rather than silently
  discarding them. Remote CSV client import is likewise blocked until those
  fields have authoritative columns.
- The current `/api/v1/fields` endpoint cannot create or read joined
  `field_boundary_versions`. The adapter maps boundary coordinates when a
  future API returns them, but remote boundary writes are visibly blocked;
  field area remains authoritative. A trusted boundary-version API/RPC is
  required to complete that part of the approved workflow.
- Job and mission adapter methods are present for the next slice, but no job or
  mission records are loaded here by design. Their production workflows must
  remain gated until connected to avoid reintroducing local browser authority.
- Staging still needs real-cookie validation against seeded organisation
  permissions and the deployed Supabase schema/API.

Requirement references: RET-002, RET-003, RET-004, RET-005, RET-006, IMP-002,
IMP-003, IMP-004, NEW-001, NEW-003, NEW-005, NEW-006, NEW-007, NEW-008,
REP-003, REP-004.

## Fix round 1 — review findings

### Changes

- Preserved the Job History and Import Spray Rec routes and Client List buttons,
  but wrapped both routes in an explicit Production Beta unavailable state.
  Direct remote URLs cannot mount the legacy pages, so they cannot read or save
  browser-authoritative job data; local development behavior remains available.
- Added forward migration `20260801005000_property_state.sql`. It adds a
  constrained Australian-code `properties.state` column without a guessed
  default, carries state through the trusted write RPC, and preserves QLD (and
  the other seven state/territory codes) through the server and frontend API.
- Expanded authenticated store scope from user ID alone to user plus tenant
  identity, while continuing to resolve the authoritative organisation through
  `/api/v1/session`. Same-user tenant switches synchronously clear old records
  before the new organisation reload starts.
- Replaced the single save toggle with a generation-aware pending-mutation
  counter. Overlapping writes keep `saving` true until all current-scope writes
  settle, and prior-scope completions cannot affect the new scope.
- Added strict record decoders for every list/detail/write response. Missing or
  invalid IDs, parent IDs, names/references, timestamps, Australian property
  state, row versions, and pagination reject the whole response as
  `MALFORMED_RESPONSE`; malformed values are never converted to blank records or
  row-version defaults.
- Scoped save confirmation to resource plus record ID. Client, property, and
  field detail screens no longer display an unrelated prior `Saved` result.

### TDD evidence

The first focused red run recorded intended failures for direct route gates,
QLD response/payload preservation, missing property-state migration, trusted
state validation, same-user tenant switching, overlapping mutation state,
resource-scoped Saved state, and malformed list/detail/session records. The
PGlite harness initially rejected a legacy property fixture after the new
required trusted-write contract; that fixture was updated with an explicit real
state and the harness now verifies both QLD persistence and invalid-code
rejection.

### Verification

- Focused: 8 suites, 58 tests passed, 0 failed.
- Full: 46 suites, 220 tests passed, 0 failed.
- `npm run build`: exit 0, compiled with the repository's existing warnings.
- `git diff --check`: exit 0 before staging.

### Remaining concern

Existing deployed property rows cannot be assigned a truthful jurisdiction from
the current data, so the forward migration deliberately leaves their new state
nullable instead of defaulting them to NSW or QLD. A trusted deployment backfill
must supply each legacy property's real Australian state before those rows can
be decoded by the strict Production Beta client. New and updated trusted API
writes require a valid state code immediately.

Fix-round requirement references: RET-002, RET-003, RET-004, RET-005, RET-006,
IMP-002, IMP-003, IMP-004, NEW-001, NEW-003, NEW-005, NEW-006, NEW-007, NEW-008,
REP-003, REP-004.
