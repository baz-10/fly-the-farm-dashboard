# SC-012 CASA Compliance Overview Design

**Status:** Approved
**Requirements:** `SC-012`, `SC-011`, `NEW-CMP-022`, `NEW-CMP-023`

## Purpose and user

The page lets an authorised Fly The Farm operator understand organisation compliance health and take the next corrective action within five seconds. The primary action is the action attached to the highest-priority unresolved issue.

## Operator layer

- Compliance score, plain-language status, last update and legal disclaimer.
- The highest-priority issue with one reason and one direct action.
- A compact list of upcoming obligations.
- Five category cards: ReOC and Organisation, Operations Manual, Personnel and Licences, Aircraft and Technical, and Checklists and Actions.
- Each category shows score, status, concise meaning, assessed, missing, blocking and due-soon counts.

## Details layer

Expandable details preserve source reason, relevant rule, source route and history-oriented metadata. Existing ReOC and Operations Manual capture forms remain available from their relevant actions, not as permanently dominant content.

## Technical diagnostics

Internal entity names, UUIDs, row versions, model/rule versions and evaluation diagnostics remain available inside details only. They never dominate the operator layer.

## SC-011 and evidence

Existing values and current evidence are reused from the authoritative projection. The page does not introduce new entry, persistence, scoring, API or database behaviour. Immutable evidence, permissions, RLS, tenant scope, location scope and restricted-record suppression remain unchanged.

## Responsive design

The command panel collapses to one column on mobile. Actions remain full-width and touch-friendly on small screens. Category cards use a one-column mobile, two-column tablet and multi-column desktop layout. Typography, dark command green, neutral surfaces and restrained status colours follow the established Spray Command system.

## Acceptance

The operator can immediately answer page purpose, current status, required attention and next action. Technical provenance remains accessible through View details. Existing calendar views, upload/publish workflows and source navigation remain available. Regression tests and production build must pass before deployment.
