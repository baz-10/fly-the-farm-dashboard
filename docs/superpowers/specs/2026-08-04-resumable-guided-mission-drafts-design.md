# Resumable Guided Mission Drafts Design

## Status

Approved by the Product Owner on 4 August 2026.

## Objective

Allow an operator to leave guided Mission creation at any stage and later resume from the exact authoritative position without repeating work or relying on browser storage.

## Draft model

A guided creation draft is a server-side organisation record distinct from the Mission itself until Step 5 creates the authoritative Draft Mission.

It records:

- Organisation
- Operating location where selected
- Creating internal user
- Current wizard step
- Furthest completed step
- Selected Client ID
- Selected Property ID
- Selected Field ID
- Selected Job ID
- Created Mission ID after Step 5
- Non-authoritative unsaved form values needed to resume the active step
- Record version
- Created, updated and archived timestamps

The record stores identifiers and temporary workflow state only. Authoritative Client, Property, Field, Job and Mission data remains in the existing resource tables.

## Saving behaviour

- Starting `/missions/new` creates a guided draft only after the operator first selects or saves meaningful data; simply opening the page creates nothing.
- Progress saves automatically after every authoritative selection or completed step.
- Form values on the active unfinished step are saved when the operator chooses **Save and exit**.
- **Save and exit** is available on every step and returns the operator to the Mission list.
- No local storage, session storage or legacy persistence is used.
- Save failures remain visible and the operator is not told the draft is safe until PostgreSQL confirms it.

## Resume behaviour

The Mission list displays incomplete guided drafts as **Mission setup drafts** with a **Continue setup** action.

Resuming restores:

- The current step
- The furthest completed step
- Existing authoritative parent selections
- Unsaved values for the active step
- The stable Mission route after Step 5

If a referenced resource has since been archived, moved out of scope or become inaccessible, resume stops at the affected step and explains what must be selected again.

## Access and ownership

- Drafts are tenant isolated.
- The creating user may resume their draft.
- Another user may resume it only with the existing Mission-create permission and access to every selected operating location and parent resource.
- Server-side authorisation and RLS both enforce access.
- A resumed draft always records the current acting user without replacing the original creator.

## Concurrency

- Every draft has a row version.
- Automatic saves and Save and exit submit an expected version.
- A stale writer receives an explicit conflict and must reload; it never silently overwrites newer progress.
- Only one active guided draft may point at a given created Mission.

## Archiving and cleanup

- Operators may archive an abandoned setup draft through the normal permission boundary.
- Archiving the workflow draft never deletes or archives Clients, Properties, Fields, Jobs or Missions.
- If a Mission already exists, abandoning the setup draft leaves that Mission in its existing authoritative lifecycle state.
- Draft sequence numbers are not required and drafts are not operational Mission evidence.

## Audit and events

Create, progress-save, resume, handoff and archive actions record:

- Organisation
- Acting internal user
- Draft ID
- Previous and new step
- Selected authoritative IDs
- Timestamp
- Audit event
- Transactional outbox event

## API

Use the existing versioned dispatcher with a dedicated resource contract:

- `GET /api/v1/mission-setup-drafts`
- `POST /api/v1/mission-setup-drafts`
- `PATCH /api/v1/mission-setup-drafts?id=<uuid>`
- `DELETE /api/v1/mission-setup-drafts?id=<uuid>`

The dispatcher remains transport only. Draft validation and persistence live in the operational application/repository boundary.

## User experience

- The workflow header shows **Saved** only after server confirmation.
- **Save and exit** is the prominent secondary action.
- The operator is not repeatedly asked whether to save.
- Returning from an earlier step preserves later completed selections unless the operator changes an upstream authoritative selection.
- Changing an upstream selection visibly clears dependent selections and saves the revised draft.

## Acceptance criteria

1. Opening the wizard without interacting creates no record.
2. Selecting or saving meaningful data creates a PostgreSQL-backed setup draft.
3. Every completed step automatically saves current and furthest progress.
4. Save and exit works from every step.
5. The Mission list displays resumable setup drafts.
6. Continue setup restores the exact step, selections and active-step values.
7. Refresh, logout/login and a second authorised session preserve the draft.
8. Stale updates return an optimistic-concurrency conflict.
9. Tenant and operating-location isolation are enforced.
10. Archiving a setup draft does not remove any authoritative business record.
11. Audit and transactional outbox records exist for every material draft transition.
12. No browser or legacy persistence fallback exists.
