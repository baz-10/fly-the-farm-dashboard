# Mission Outcomes Design

**Status:** Product Owner approved  
**Requirements:** `NEW-MIS-001`, `IMP-MIS-001`  
**Lifecycle stage:** Post-Mission

## Purpose

Mission Outcomes preserve longitudinal evidence of how well a completed Mission worked. They are distinct from Mission Completion, which records what happened, and Operational Events, which record events during operations.

The Production Beta workflow replaces separate inspection notes, photographs, follow-up lists and effectiveness records while establishing authoritative evidence for later Operational Knowledge curation.

## Governing Rules

- The user-facing term is **Mission Outcomes**.
- The internal aggregate is `mission_outcome_observations`.
- A completed Mission may have any number of observations over time.
- Every submitted observation is immutable, append-only Mission evidence.
- Observations are never edited or deleted.
- A correction is a new observation linked through `supersedes_observation_id`.
- Mission Completion evidence is never changed by an outcome observation.
- Operational Events and Mission Outcomes remain separate lifecycle streams.
- Production Beta accepts an authorised observer's submission immediately without a second reviewer.
- Operational Knowledge nomination, research, approval and publication are a separate future workflow. Knowledge records may reference observation IDs but never modify Mission evidence.
- Mission Outcomes are optional. The workflow encourages follow-up but never blocks Mission Completion or changes a completed Mission's status.
- No browser storage, local persistence or legacy fallback is permitted.

## Domain Model

### Observation Type Catalogue

`mission_outcome_observation_types` is a repository-controlled catalogue rather than a hard-coded application enum.

Each type has a stable code, display name, description, display order, active state and catalogue version. Production Beta seeds:

- `INITIAL`
- `FOLLOW_UP`
- `FINAL`
- `REGROWTH`
- `CUSTOM`

The API reads active catalogue entries. Future migrations may add types without changing the observation table or frontend workflow. `CUSTOM` requires an operator-supplied label retained in the observation.

### Mission Outcome Observation

Each `mission_outcome_observations` row contains:

- Organisation and operating location
- Mission ID
- Completion revision ID
- Sequence number unique within the Mission
- Observation type ID and immutable type snapshot
- Custom type label where applicable
- Observation timestamp
- Observer Personnel ID
- Immutable Personnel snapshot
- Observation confidence ID and immutable confidence snapshot
- Days since application where applicable
- Observation method
- Inspection time
- Approximate area inspected in hectares where assessed
- Optional inspection Weather snapshot
- Relevant crop or growth stage where applicable
- Control percentage from 0 to 100 where assessed
- Target species as structured text values
- Regrowth state (`NOT_ASSESSED`, `NONE` or `OBSERVED`) and notes
- Off-target effect state (`NOT_ASSESSED`, `NONE` or `OBSERVED`) and notes
- Environmental observations
- Customer comments where applicable
- Operator notes
- Recommended follow-up
- Superseded observation ID where the record is a correction
- Operational Knowledge nomination eligibility, eligibility rule version and eligibility reasons
- Creating internal user and creation timestamp

### Confidence Catalogue

`mission_outcome_confidence_levels` is a repository-controlled platform catalogue shared consistently across organisations. Each level has a stable code, definition and catalogue version. Observations retain a snapshot of the selected definition.

- `HIGH`: direct inspection with clear visibility, sufficient inspected area or sample, and supporting evidence that leaves minimal material uncertainty.
- `MEDIUM`: direct or otherwise credible inspection with partial coverage, limited supporting evidence or identifiable uncertainty that does not invalidate the observation.
- `LOW`: limited or indirect inspection, poor visibility, small inspected area or incomplete evidence; the observation remains useful but its conclusions are tentative.

Confidence describes observation quality, visibility and certainty, not observer competence.

### Observation Conditions

Observation conditions retain the context needed to interpret longitudinal outcomes:

- `days_since_application` is server-derived from the Completion snapshot's actual completion time and the observation timestamp. It is displayed to the operator and never trusted from client input.
- Observation method is selected from a repository-controlled catalogue seeded with `GROUND_INSPECTION`, `AERIAL_INSPECTION`, `REMOTE_IMAGERY`, `CUSTOMER_REPORT` and `OTHER`.
- Inspection time is the authoritative observation timestamp.
- Approximate inspected area is optional, measured in hectares and must be positive when supplied.
- Inspection Weather is an optional immutable snapshot containing source description, temperature, relative humidity, wind and free-text conditions. It is post-Mission context and is never treated as Planning or Pre-flight Weather evidence.
- Crop or growth stage is optional structured text retained exactly as observed.

### Operational Knowledge Eligibility

Every observation stores an internal `operational_knowledge_eligible` flag, `eligibility_rule_version` and structured `eligibility_reasons`. The server derives them using repository-controlled platform rules when the observation is submitted. Production Beta rule version 1 marks an observation eligible when it identifies at least one target species, records a control percentage, uses `HIGH` or `MEDIUM` confidence and contains operator notes or at least one photo.

Eligibility only means the immutable evidence may later be nominated. It does not nominate, approve or publish Operational Knowledge. A future knowledge workflow references the observation ID and its stored eligibility assessment without altering it.

The observation references the exact latest Completion revision at submission. Its observation timestamp must be at or after Mission Completion and no more than five minutes in the future to tolerate device clock skew. Submission is rejected if the Mission has no Completion evidence, is archived, belongs to another tenant, is outside the user's operating-location scope, or the observer is inactive or unavailable at that operating location.

### Photos

`mission_outcome_pending_files` temporarily records an authorised upload before its observation exists. `mission_outcome_observation_files` stores the immutable attachment references claimed during observation submission:

- Observation ID
- Internal file ID
- File version
- Original filename
- Content type and byte size
- SHA-256 checksum
- Storage provider, bucket and opaque object key
- Capture timestamp where supplied
- Caption
- Provenance JSON
- Uploading user and timestamp

Provider URLs are never stored as evidence identifiers or returned as permanent links. Production Beta accepts JPEG, PNG and WebP images up to 3 MiB each and a maximum of 10 photos per observation. File content is uploaded before observation submission. The final transaction copies owned pending metadata into immutable attachment records and removes the corresponding pending rows. Unclaimed uploads are not Mission evidence and are eligible for controlled cleanup after 24 hours.

### Follow-up Actions

`mission_outcome_follow_up_actions` is separate from observations. Each action references the originating observation and records description, responsible Personnel where assigned, due date, status (`OPEN`, `IN_PROGRESS`, `COMPLETED` or `CANCELLED`), completion details and row version.

Actions are mutable operational work records with optimistic concurrency, audit and outbox events. Their changes never modify or reinterpret the immutable source observation.

## Permissions and Security

Permissions are role-assigned and never identity hard-coded:

- `mission.outcomes.read`
- `mission.outcomes.create`
- `mission.outcomes.photo.upload`
- `mission.outcomes.follow_up.manage`

Production Beta administrators receive these through repository-controlled role provisioning. Other roles receive them through normal role administration.

Every read and command enforces:

- Authenticated membership
- Active licensed seat where required by the platform policy
- Organisation isolation
- Operating-location assignment
- Resource permission
- Mission relationship validation
- Observer Personnel validity

Server-authoritative checks are reinforced by PostgreSQL RLS. Observation and attachment tables use forced RLS and reject update/delete operations. Follow-up actions use organisation and location policies plus row-version concurrency.

## Commands and Queries

The versioned public API adds one dispatcher resource: `/api/v1/mission-outcomes`.

Supported operations:

- `GET ?missionId=...` returns the completed Mission context, type catalogue, chronological observations, immutable photo metadata and follow-up actions.
- `POST ?missionId=...&action=photo` uploads a pending internal image record and returns its internal file identity and checksum.
- `POST ?missionId=...&action=observation` atomically creates an immutable observation, claims supplied pending photos, writes audit/outbox records and returns the complete observation.
- `POST ?missionId=...&action=follow-up` creates or updates a follow-up action using optimistic concurrency.

Unsupported methods, actions, missions and versions fail visibly. A failed command never creates a misleading local record.

## Mission Workflow

The existing deployed Mission screen gains a **Mission Outcomes** panel after Operational Closeout.

The default view is a chronological timeline showing observation date, type, observer, confidence, control percentage, target species, outcome summary, photos and follow-up state.

The primary action is **Record follow-up observation**. It opens one focused workflow that:

1. Confirms the observation date and authoritative observer.
2. Selects an observation type and method from server catalogues.
3. Displays server-derived days since application and captures inspected area, optional inspection Weather and crop or growth stage.
4. Prefills target species from authoritative Mission evidence where available while allowing truthful additions.
5. Captures confidence, control percentage, regrowth, off-target effects and environmental observations.
6. Accepts customer comments, operator notes and recommended follow-up.
7. Uploads photos with captions and visible provenance.
8. Offers follow-up action creation only when recommended.
9. Submits once to create immutable evidence.

No observation is mandatory. After submission the interface offers **Record another observation** without forcing the operator into another form.

Previous observations remain available in full. When correcting evidence, the operator explicitly chooses **Record correction**, sees the source observation, and submits a new observation linked through `supersedes_observation_id`.

## Audit and Events

Observation submission writes:

- Audit event `mission.outcome_observation_created`
- Outbox topic `post_mission.mission.outcome_observed`

Photo claim writes immutable provenance into the observation event payload without exposing provider URLs. Corrections identify the superseded observation. Follow-up action creation and transitions write their own audit/outbox records.

## Failure Behaviour

- A missing Completion revision blocks submission with a clear lifecycle error.
- An invalid observer, tenant or location returns a denial without partial evidence.
- Invalid control percentages, unsupported confidence values or inactive catalogue types return validation errors.
- `CUSTOM` without a label is rejected.
- Duplicate or already-claimed photo IDs are rejected atomically.
- Upload failure preserves existing observations and does not create an observation.
- Concurrency conflicts on follow-up actions return the current row version.
- Observation update and delete attempts are rejected at PostgreSQL level.

## Acceptance Criteria

The deployed Production Beta must demonstrate:

1. One completed Mission with three observations at different times.
2. Initial, follow-up and regrowth/final types supplied by the catalogue.
3. An authoritative observer and immutable Personnel snapshot on every observation.
4. Structured control percentage, target species, regrowth, off-target, environmental, customer, operator and follow-up evidence.
5. High, medium or low observation confidence.
6. Repository-controlled confidence definitions rendered consistently.
7. Server-derived days since application plus observation method, inspection time, inspected area, optional inspection Weather and crop/growth stage.
8. Photos retained by internal file ID, version, checksum and provenance without permanent provider URLs.
9. One separate follow-up action linked to its source observation.
10. A chronological Mission Outcomes timeline surviving refresh, re-login and a second authorised session.
11. A correction represented by a new observation that references, but does not alter, the original.
12. Stored Operational Knowledge eligibility and rule version without nomination or publication.
13. PostgreSQL rejection of observation update and delete attempts.
14. Tenant and operating-location denial.
15. Audit and transactional outbox evidence.
16. The Mission Completion revision and snapshot remain byte-for-byte unchanged.
17. No Operational Knowledge is published by this workflow.
18. Mission Completion remains possible with zero outcome observations.
19. No browser or legacy persistence fallback.

## Deferred Capability

The following are intentionally outside this implementation:

- Operational Knowledge nomination, research, approval and publishing
- AI outcome analysis
- Customer acceptance
- Complaints and investigations
- Supervisor, agronomist, technical or dual-review policies

The observation model preserves the evidence references those workflows will later consume without redesign.
