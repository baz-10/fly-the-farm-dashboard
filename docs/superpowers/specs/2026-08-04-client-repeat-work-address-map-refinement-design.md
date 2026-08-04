# Client, Repeat Work, Address and Map Refinement Design

**Status:** Product Owner approved  
**Requirement:** IMP-MIS-001  
**Phase:** Phase 2 — Operational Refinement

## Objective

Reduce the effort required to create repeat work while preserving the authoritative Client → Property → Field → Job → Mission hierarchy and operational map history.

## Governing principles

- One Client may own many Properties.
- One Property may contain many Fields.
- A Field may receive any number of Jobs and Missions over time.
- Repeat work reuses authoritative records; it does not duplicate Clients, Properties or Fields.
- Historical Jobs and Missions are never changed when used as templates.
- Address search assists the operator but never blocks legitimate rural or non-standard addresses.
- Field map features and Mission map features remain distinct evidence streams.

## Address autofill with manual fallback

The guided Mission workflow's **Where is the work?** step uses the repository's server-side Australian geocoding endpoint. Suggestions begin after three meaningful characters and are debounced to avoid unnecessary provider requests.

Selecting a suggestion captures:

- Complete display address
- State
- Latitude and longitude
- Address source = `GEOCODED`

The interface displays **Verified address** after a suggestion is selected.

Operators may continue typing and save an unmatched address. Manual entry records address source = `MANUAL` and displays **Address entered manually — confirm its position on the map**. Address-search failure is visible but does not block progress. The following Field step uses captured coordinates where available and otherwise requires the operator to confirm the property position on the map.

Mission setup drafts retain the address, coordinates and address source. No provider-specific response or URL becomes authoritative business data.

## Client and Job navigation

The sidebar exposes two separate operating views:

- **Clients** — customer-centric access to the Client → Properties → Fields hierarchy.
- **Jobs** — work-centric access to Jobs across all Clients.

The existing Client hierarchy remains authoritative and is surfaced rather than duplicated. Existing compatible routes may remain stable while user-facing navigation becomes explicit.

Client detail displays all Properties. Property detail displays all Fields. Field detail displays its Job and Mission history, including repeat treatments.

## Repeat work retrieval

After a Client is selected in guided Mission creation, Spray Command makes relevant existing work visible. Results are progressively narrowed by Property and Field while retaining access to the Client's broader history.

Every applicable historical Job offers two explicit actions:

### Continue existing Job

Selects the existing active Job and proceeds to create or continue Mission planning under that Job. Completed or archived Jobs cannot be silently reopened.

### Use as template for new Job

Creates a new Job draft prefilled from approved reusable details, including scope, treatment request, notes appropriate for reuse, linked Field and scheduling defaults. It does not copy identifiers, lifecycle state, approvals, immutable evidence, actual usage, operational events, completion evidence, outcomes or customer outcomes.

The operator reviews all copied details before saving. The new Job and Mission receive new organisation-owned references unless custom references are explicitly selected.

## Field and Mission operational map features

After a boundary is drawn or uploaded, the operator may add:

- Signage
- Points of interest
- Danger zones
- No-fly zones
- Launch points
- Landing points
- Access points
- Other operational annotations

Each feature requires an explicit scope:

- **Save to Field** — stored as a versioned Field feature and offered automatically to future Missions for that Field.
- **Save to this Mission only** — stored in the immutable/versioned Mission map evidence stream.

Field features do not alter the Field boundary. Mission features do not alter Field records. A Mission map revision snapshots or references the exact Field feature revisions selected for planning so later Field changes do not rewrite Mission history.

Imported boundary provenance remains unchanged. Adding features after import creates feature evidence; it never rewrites or misrepresents the original source file.

## Security and integrity

- Server-authoritative permission enforcement
- Organisation isolation and operating-location scope
- PostgreSQL RLS reinforcement
- Optimistic concurrency on mutable setup/configuration records
- Audit and transactional outbox events for authoritative changes
- No browser or legacy persistence fallback
- No cross-organisation template retrieval
- No provider-specific address data embedded in domain logic

## Error handling

- Address provider failure shows a recoverable warning and permits manual entry.
- A historical Job unavailable due to lifecycle or concurrency changes is not reused; the operator receives a precise message.
- Unsupported or invalid map features fail visibly without changing the saved boundary or current Mission map revision.
- Stale writes return a conflict and preserve the server version.

## Acceptance criteria

1. An operator can select an Australian address suggestion and receive address, state and coordinates.
2. An operator can save a manual address when no suggestion is suitable and is prompted to confirm it on the map.
3. Address search failure does not block guided Mission creation.
4. Setup drafts restore address source and coordinates exactly.
5. The sidebar exposes separate Clients and Jobs views.
6. A Client shows all of its Properties; each Property shows its Fields; each Field shows Job and Mission history.
7. Guided Mission creation can continue an eligible existing Job.
8. Guided Mission creation can use historical Job details as a reviewed template for a new Job.
9. Template creation never mutates or copies immutable historical evidence.
10. After boundary draw or import, supported operational features can be added.
11. Each added feature can be explicitly scoped to Field or Mission.
12. Field features appear for later Missions without silently becoming Mission evidence until selected/snapshotted.
13. Mission-specific features never alter the Field boundary or permanent Field features.
14. Refresh, re-login and a second authorised session preserve authoritative changes.
15. Tenant, location, permissions, concurrency, audit and outbox protections pass acceptance.

## Delivery sequence

1. Address autofill and manual fallback.
2. Separate Clients and Jobs navigation.
3. Historical Job retrieval with Continue and Use as template actions.
4. Field- and Mission-scoped operational map features.

Each package must independently reduce operator effort and pass its production acceptance before the next package is declared operational.
