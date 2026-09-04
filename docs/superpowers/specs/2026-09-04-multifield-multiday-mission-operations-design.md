# Multi-Field, Multi-Day Mission Operations Design

**Date:** 4 September 2026
**Status:** Founder-approved design
**Scope:** Multi-Property Jobs, multi-day Missions, CRP authorisation, daily operational evidence, aircraft utilisation, chemical actuals, weather evidence, flight-line evidence, JSA continuity, final sign-off and Job closure

## 1. Objective

Model agricultural contracting work without forcing artificial one-Field, one-day, or one-flight records. One commercial Job belongs to one Client and may cover one or more Fields across one or more of that Client's Properties. A Mission selects the relevant Job scope, may remain active across multiple operating days, and accumulates authoritative daily evidence until final sign-off.

The workflow must remain quick for a small operator while supporting detailed evidence where it is available. Daily aircraft totals are authoritative without requiring individual flight entry. Individual flights remain optional and, when supplied, reconcile to the relevant aircraft's daily total. Completed flight-line KML/KMZ files are evidence of flown paths, not a substitute for declared operational time.

The Chief Remote Pilot (CRP) authorises an exact Mission package revision before operations begin. Operational completion, reconciliation, final sign-off and Job closure are distinct later states. This design must be mapped to the organisation's approved Operations Manual, ReOC conditions and applicable CASA requirements before Production release.

## 2. Foundational Decisions

1. A Job belongs to exactly one Client.
2. A Job may include one Field, multiple Fields from one Property, or multiple Fields across several Properties belonging to that Client.
3. A Mission belongs to one Job and selects a non-empty subset of the Job's Fields.
4. One Mission may span multiple operating days.
5. One versioned JSA governs the Mission; each operating day records a review confirmation against the effective JSA revision.
6. The CRP approves an immutable Mission package revision, not a mutable Job in general.
7. The UI may expose CRP review from the Job workspace, but approval authority remains attached to the exact Mission and JSA revisions reviewed.
8. Daily aircraft use may be recorded as one total per aircraft, optional individual flights, or both when reconciled.
9. Planned chemicals belong to Job/Mission planning. Actual chemical applications belong to an operating day and Field.
10. Weather evidence is frozen for an actual operating window or, when exact times are unavailable, a declared whole-day window.
11. A Mission can be operationally completed and reconciled before final sign-off. A Job closes only after all required Mission sign-offs and close-out conditions pass.
12. Historical operational evidence, approvals and sign-offs are immutable. Corrections create governed revisions or append-only correction records.

## 3. Existing Authority Reuse

The implementation must extend, not replace, the repository's existing authorities:

- `jobs.fieldIds` already represents multiple Fields and remains the compatibility projection while a relational Job-scope model is assessed.
- existing Client → Property → Field ownership remains authoritative.
- current Mission identity, operational status, aircraft assignment, map, chemical, JSA, authorisation, audit and outbox authorities remain the starting point.
- existing append-only Fleet meters and maintenance authority remain the destination for signed-off aircraft time.
- existing Financial Actuals operational prefill consumes operational evidence and does not become its owner.
- existing report artefact infrastructure stores generated Mission reports; no parallel report authority is introduced.

Before a Production migration is written, the implementation plan must identify where an existing table/RPC can be extended safely and where a dedicated relation is required. JSON or browser-local state must not become authoritative for multi-day operations.

## 4. Domain Model

### 4.1 Job scope

The authoritative Job scope contains:

- one `organisation_id` and one `client_id`;
- one or more selected `property_id` values belonging to that Client;
- one or more selected `field_id` values belonging to those Properties;
- planned work window and commercial scope;
- planned chemicals, products, rates and instructions;
- lifecycle state and optimistic-concurrency version.

A normalized `job_fields` relation is preferred if the existing array cannot provide checked parent-chain authority, stable audit, ordering and concurrent mutation safely. The Client is never inferred from a browser-supplied Field. Server/database authority resolves every Field through its Property and Client and rejects a mixed-Client set atomically.

### 4.2 Mission scope and immutable package revisions

Each Mission belongs to one Job and selects a non-empty subset of the Job's current authorised Fields. A Mission package revision freezes the pre-operation content reviewed by the CRP, including:

- Job, Client, Property and Field identities;
- intended operating dates/window;
- aircraft, equipment and personnel assignments;
- planned chemicals and application methods;
- operational map and site features;
- effective JSA revision and risk controls;
- applicable operational checks, permissions and supporting evidence;
- an input digest and revision number.

The Mission keeps a pointer to its currently effective authorised package. Historical package revisions and CRP decisions remain immutable.

### 4.3 Mission operating days

A Mission has zero or more `mission_operating_days`. Each record has:

- stable identity, Mission and organisation scope;
- `work_date` in the Mission/Base timezone;
- optional actual start and finish timestamps;
- the effective Mission package revision and JSA revision;
- lifecycle state such as Draft, Ready, In Progress, Completed or Signed Off;
- daily notes, interruptions and exceptions;
- optimistic-concurrency version and audit timestamps.

There is at most one active daily aggregate for a Mission and local work date. Overnight work retains exact timestamps and follows an explicit operational-date rule rather than browser timezone inference.

### 4.4 Daily Field activity

Each operating day records one or more Field activity rows containing:

- exact Field identity from the Mission's authorised subset;
- hectares attempted and completed where known;
- work start/finish or bounded activity window where needed;
- status, notes and correction lineage.

The same Field may be worked on several days. Daily and Mission totals are projections over these rows and are not independently editable totals.

### 4.5 Aircraft time and optional flights

Each operating day may record one aircraft-day actual for every participating aircraft:

- aircraft identity and Mission allocation identity;
- total flight hours using the governed time precision;
- optional engine/operating hours where the asset type supports them;
- batteries/cycles, hectares, payload or downtime where already supported;
- provenance, completion status and correction lineage.

Individual flight records are optional children with start/end time or duration, pilot, aircraft and optional Field. Rules are:

- daily totals are valid without individual flights;
- individual flights never have to be fabricated;
- when individual flights and a declared daily total coexist, their governed sum must equal the daily total before sign-off;
- where every flight has authoritative duration, the UI may calculate and propose the total, but the server validates the submitted result;
- aircraft technical-register time advances only from signed-off operational evidence and is idempotent by source record identity.

Two aircraft used for ten hours are represented as two aircraft-day rows of `10.0000` hours. They contribute `20.0000` aircraft hours to cost/utilisation while the Mission's elapsed crew/work duration remains a separate metric.

### 4.6 Chemical planning and actual application

Job planned chemicals remain editable planning records until the relevant Mission package is submitted. They may prefill Mission/day actuals but are never treated as proof of application.

Daily chemical-application records contain:

- operating day and Field identity;
- canonical product/treatment identity where available;
- actual rate and unit;
- mixed, loaded, applied, returned and wasted quantities as applicable;
- batch/lot and supplier/customer source where available;
- applying aircraft or batch attribution when known;
- provenance and operator confirmation.

Actual values may differ from plan only through explicit, auditable confirmation. A material pre-operation chemical change may require a new Mission/JSA revision and CRP reauthorisation. Post-operation recording of what was actually applied does not rewrite the prior approval.

### 4.7 Weather evidence

Each operating day can create a frozen weather report for:

1. the actual operating interval, when authoritative start and finish times exist; or
2. the declared full operating day, when precise times are unavailable.

The evidence preserves:

- location and coordinate source;
- local timezone and UTC interval;
- provider/source and retrieval timestamp;
- hourly observations or the finest authoritative interval available;
- temperature, humidity, wind speed/direction/gust, rain, Delta T and available inversion assessment inputs/results;
- coverage gaps, manual evidence and operator notes;
- immutable source/evidence digest.

Weather reports are snapshots. Opening a historical Mission never silently refreshes or recalculates its evidence with current provider data or changed scoring code. Extended before/after windows may be requested explicitly and remain distinguishable from actual work hours.

### 4.8 Completed flight-line evidence

One or more KML/KMZ flight-line artefacts may be attached to a Mission and, where determinable, an operating day and aircraft. Evidence records preserve:

- original filename, type, size and content digest;
- uploader and upload timestamp;
- source CRS and canonical transformation metadata;
- parsed line count, bounds and time range when present;
- validation state and explicit linkage confidence;
- immutable original artefact plus safe derived map geometry.

A file may contain multiple flights or aircraft. The operator can link or confirm attribution without being forced to create individual flight-time records. Geometry does not automatically determine regulatory flight time unless a separately approved calculation authority is introduced.

### 4.9 Mission JSA

One stable JSA aggregate belongs to the Mission and contains immutable numbered revisions. Every operating day requires a short review confirmation containing:

- operating day, effective JSA revision and reviewer identity;
- reviewed timestamp;
- confirmation that conditions remain covered or a declaration of change;
- any notes and resulting hold/revision state.

Adding another date alone does not require another JSA. A material hazard, site, chemical, aircraft, method or control change creates a new JSA/Mission package revision and requires approval before affected further operations. Completed daily work remains linked to the revision that governed it.

### 4.10 Authorisation, completion and sign-off

CRP authorisation records contain the exact Mission package revision, JSA revision, CRP internal-user identity, decision, timestamp, bounded comments and digest. They cannot be updated or deleted.

Daily completion records and the Mission final sign-off are distinct:

- operators may complete daily records and add missing administrative evidence before final sign-off;
- completion cannot alter the historical pre-operation package;
- material changes affecting future operations invalidate authority prospectively and place further work on hold;
- final sign-off freezes reconciled operational actuals and advances downstream Fleet/Financial projections atomically;
- Job closure requires every non-cancelled Mission to satisfy final sign-off and all Job-level reconciliation conditions.

## 5. Lifecycle

### 5.1 Job

`DRAFT → READY_FOR_MISSION_PLANNING → ACTIVE → COMPLETION_REVIEW → CLOSED`

- Draft: Client scope, Fields and planned chemicals may be prepared.
- Ready for Mission Planning: parent-chain validation passes; Missions may be assembled.
- Active: at least one authorised or operating Mission exists.
- Completion Review: operational Missions have ended but reconciliation/sign-off is incomplete.
- Closed: all required Missions are finally signed off and Job close conditions pass.

Archive/cancel semantics remain separate from successful close and must preserve history.

### 5.2 Mission

`PREPARING → AWAITING_CRP_APPROVAL → AUTHORISED → IN_PROGRESS → COMPLETED_AWAITING_SIGN_OFF → SIGNED_OFF`

Material amendments from `AUTHORISED` or `IN_PROGRESS` create a new preparing revision and place subsequent operations in `AWAITING_CRP_APPROVAL`. Completed history is not rolled back. Rejection returns the proposed revision for correction without changing the last effective authority for already completed work.

### 5.3 Operating day

`DRAFT → READY → IN_PROGRESS → COMPLETED → SIGNED_OFF`

An operating day cannot enter `IN_PROGRESS` without an effective CRP-authorised package, a valid JSA review for that day, and required readiness checks. A day may be completed while supporting administrative evidence is still being reconciled, but Mission final sign-off fails closed until all required day evidence is valid.

## 6. Material and Administrative Amendments

The system must classify amendments explicitly rather than infer safety impact from UI location.

Material changes requiring approval before subsequent flight include, at minimum:

- adding/removing an operational Field or materially changing the area;
- changing aircraft, pilot or regulated crew assignment;
- changing chemical/product, application method or governed rate outside approved bounds;
- changing JSA hazards, mitigations or operational controls;
- changing a map feature or condition that affects the authorised operation;
- changing an operational permission or required compliance basis.

Administrative evidence additions that do not by themselves invalidate pre-operation authority include:

- actual aircraft hours and optional flight breakdowns;
- actual hectares and chemical quantities applied within the approved operation;
- frozen actual weather evidence;
- completed flight-line uploads;
- receipts, completion notes and non-safety corrections.

Server-side policy owns classification. An unrecognized change fails closed as material until reviewed. Corrections must retain who changed what, when, why and the predecessor value.

## 7. User Experience

### 7.1 Job scope selection

The Job form begins with one Client, one Property and one or more Fields. An optional **Add fields from another Property** action reveals other Properties belonging to the same Client. Selected Fields are grouped by Property with per-Property and total hectares. Changing Client clears all selected Properties and Fields.

The workflow must prevent duplicate Fields and explain cross-Client rejection. It must not render every Property/Field as one giant scrolling list; searchable grouped selection and progressive disclosure are required on phone, tablet and desktop.

### 7.2 Mission operating days

The Mission workspace includes a compact Operating Days summary. Each day opens a focused detail workspace containing:

- daily status and JSA confirmation;
- Fields/hectares;
- personnel;
- per-aircraft totals and optional flight details;
- actual chemicals;
- weather report;
- completed flight lines;
- notes, interruptions and validation issues.

Common planned values may be copied into a new day as editable proposals. Copying never creates authoritative actuals without confirmation.

### 7.3 CRP review

The Job and Mission workspaces may surface **Review operational package**, but the review screen identifies the exact Mission revision and presents the material scope in a concise, complete form. Approval requires explicit CRP authority, confirmation and optional bounded comments. A digest/revision mismatch fails closed and forces reload.

### 7.4 Completion and close-out

Completion uses a checklist of unresolved daily evidence rather than a generic Save button. The UI distinguishes:

- operational work completed;
- evidence/reconciliation incomplete;
- awaiting final sign-off;
- finally signed off;
- Job ready to close.

The operator may amend permitted completion evidence before final sign-off. After sign-off, correction is a separately labelled governed action, never ordinary Edit.

## 8. Permissions and Tenancy

Minimum role separation:

- authorised planners create Jobs and prepare Mission revisions within their organisation/Base scope;
- assigned operational personnel create permitted daily evidence;
- only an eligible CRP identity may authorise or reject a Mission revision;
- final sign-off requires the configured organisational role/authority;
- financial permissions remain separate from operational permissions;
- service-role routes do not receive generic table authority.

Every checked command must derive organisation, Client, Property, Field, Mission, aircraft, personnel and Base relationships server-side. Missing scope, stale versions, foreign-tenant identifiers, mixed Clients, unrelated Fields, unauthorized aircraft/personnel and arbitrary evidence IDs fail closed without partial mutation.

Platform support receives no new tenant-data access. Genuine Fly The Farm records and later customer records remain protected by the same tenant boundary.

## 9. Concurrency and Transactional Rules

- Job scope mutation, Mission revision submission, CRP decision, day start/completion, Mission sign-off and Job close use checked commands with optimistic concurrency and appropriate aggregate locks.
- Two approvals for the same revision produce one authoritative decision and one explicit conflict.
- A material amendment racing with day start cannot produce an operating day under an unapproved revision.
- Day completion racing with evidence mutation yields one serialized result, never a partially frozen day.
- Mission sign-off atomically freezes eligible actuals, records audit/outbox evidence and creates idempotent downstream references.
- Fleet meter projection and Financial Actual prefill use stable source identities so retries cannot double-count hours or costs.
- Job close racing with a new Mission or correction fails closed or serializes to a valid open state.

## 10. Calculations and Projections

Keep these measures distinct:

- Mission elapsed/work duration: time during which the operation was active.
- personnel work hours: per-person actual work.
- aircraft flight hours: per-aircraft actual flight time.
- total aircraft hours: sum across aircraft, used for utilisation/cost where appropriate.
- `operationalDays`: count of distinct dates containing actual work greater than zero under the Financial Actuals precision contract.
- hectares attempted/completed: sums of authoritative daily Field activity, without double counting repeated corrections.

For two aircraft each flying ten hours on one day, elapsed operation may be ten hours while total aircraft hours are twenty. Financial rules must identify which measure a rate uses and never substitute one silently for another.

## 11. Reporting

The final Mission report is a deterministic representation of signed-off authority and includes:

- Job, Client, Property and Field scope;
- CRP-authorised Mission/JSA revision history;
- daily JSA review confirmations;
- daily personnel, Field and hectares activity;
- per-aircraft daily and Mission hours;
- optional flight details;
- planned-versus-actual chemicals;
- frozen weather reports for each work interval/day;
- completed flight-line maps and source-file references;
- interruptions, exceptions, corrections and final sign-off.

Reports must show evidence coverage gaps explicitly. They do not create a new operational authority and must never recalculate historical signed-off values from mutable current data.

## 12. Failure Handling

- Cross-Client or unrelated Field selection: reject the entire Job-scope command.
- Mission Field outside Job scope: reject without mutation.
- Missing/expired/stale CRP authority: prevent day start and identify the exact revision mismatch.
- Missing daily JSA confirmation: prevent day start.
- Material mid-operation change: preserve completed work, hold subsequent operation and request a revised approval.
- Aircraft total/flight-detail mismatch: prevent day/Mission sign-off and show both totals.
- Weather provider failure: retain any prior frozen evidence, permit governed manual evidence where policy allows, and record the coverage limitation.
- Invalid flight-line file: retain no authoritative parsed geometry; report validation failure without changing operational records.
- Partial downstream projection failure: preserve the signed-off source transaction only if an idempotent outbox guarantees completion; otherwise roll back atomically.
- Concurrency conflict: retain operator input locally, reload authority and require an explicit reconciliation.

## 13. Compatibility and Migration Assessment

The implementation plan must preserve existing one-Field, one-day and single-aircraft workflows as valid subsets. Existing `fieldIds` arrays, Mission statuses, JSA records, chemical plans, maps and completion evidence require a read-only inventory before migration design.

No Production migration is authorized by this design. Before proposing one, return:

- exact new/changed objects and why existing authority cannot satisfy them;
- legacy record counts and ambiguity classes;
- deterministic backfill/default rules;
- proof that completed evidence is not rewritten;
- RLS, grants and checked-command changes;
- rollback/fix-forward boundary and dry-run evidence;
- whether application deployment depends on the migration.

Ambiguous historical records remain flagged for review rather than guessed. Existing completed Missions must not acquire fabricated operating days, flight hours, CRP decisions or JSA confirmations.

## 14. Verification Strategy

Implementation is test-first. Required coverage includes:

### Scope and tenancy

- one Job with one Field;
- multiple Fields under one Property;
- multiple Fields across several Properties for one Client;
- duplicate Field rejection;
- cross-Client, cross-organisation and unauthorized-Base rejection;
- Mission Field subset enforcement;
- Client change clearing stale scope in Chromium and WebKit.

### Multi-day operations

- one Mission spanning several local dates;
- exact timezone handling and overnight work;
- one daily record per Mission/local date;
- separate Field/hectare activity by day;
- phone, tablet and desktop progressive disclosure.

### Aircraft actuals

- daily total only;
- optional individual flights only with calculated total;
- reconciled total plus flights;
- mismatch and excess-precision rejection;
- two aircraft with independent ten-hour totals;
- idempotent Fleet meter updates and no double counting.

### Chemicals, weather and maps

- planned chemical prefill without falsely recording application;
- actual chemical deviations with provenance;
- material chemical change requiring reapproval;
- weather snapshot for actual hours and full day;
- source/timezone/coverage preservation and provider-failure behavior;
- multi-aircraft/multi-flight KML/KMZ preservation, validation and map rendering;
- flight-line evidence without mandatory individual flight rows.

### JSA and CRP authority

- one JSA aggregate across multiple days;
- daily confirmation against the effective revision;
- unchanged conditions requiring no new JSA;
- material hazards producing a revision and hold;
- only eligible CRP approval;
- exact revision/digest checks;
- approval versus amendment/day-start concurrency;
- immutable historical approval and JSA evidence.

### Completion and downstream use

- completion before final sign-off while permitted evidence is reconciled;
- material fields remaining immutable after operation;
- final sign-off conflicts and atomicity;
- Job close blocked by unfinished/unsigned Missions;
- signed-off aircraft hours projected once;
- Financial Actual prefill uses daily operational evidence and preserves `operationalDays` semantics;
- deterministic final report from frozen evidence;
- audit/outbox coverage for every authority transition.

Run focused domain/API/database/security tests, PostgreSQL/TypeScript parity where calculations overlap, Chromium, WebKit, responsive acceptance, deterministic regression, Product Maturity verification, Production build and independent authority/security review before requesting merge or Production action.

## 15. Delivery Slices

The implementation plan should remain bounded through these ordered slices:

1. **Job Scope:** checked multi-Property/multi-Field authority and progressive selector.
2. **Mission Revision and CRP Gate:** immutable operational package, CRP decision and material-amendment policy.
3. **Operating Days and JSA Continuity:** daily lifecycle, Field activity and daily JSA confirmation.
4. **Aircraft Actuals and Flight-Line Evidence:** per-aircraft totals, optional flights, KML/KMZ evidence and Fleet projection.
5. **Chemical Actuals and Weather Evidence:** daily application records and frozen work-window/day reports.
6. **Completion, Final Sign-Off and Job Closure:** reconciliation, immutable close-out, downstream projections and final report.

Each slice requires its own migration proposal and Production gate if database change is necessary. Later slices must not be exposed as usable merely because foundational schema has landed.

## 16. Deferred Work

- automated derivation of regulatory flight time from KML telemetry;
- live aircraft/remote-controller telemetry ingestion;
- chemical inventory purchasing or supplier integration;
- payroll and invoicing automation;
- automatic CRP substitution/delegation beyond approved organisational authority;
- generalized workflow/rules engines;
- automatic aircraft grounding beyond separately governed availability rules.

## 17. Acceptance Criteria

The capability is ready for Product Maturity promotion only when:

1. An operator can create one Job containing Fields across multiple Properties owned by one Client, while mixed-Client scope is impossible.
2. A Mission can select a subset of those Fields and remain active across multiple days.
3. The CRP authorises an exact Mission/JSA revision before work begins.
4. One JSA spans the Mission with explicit daily reviews and governed revision when conditions materially change.
5. Each day records Field work, per-aircraft totals, optional flights, actual chemicals, frozen weather and completed flight-line evidence.
6. Daily totals work without individual-flight data, while supplied flight detail reconciles exactly.
7. Administrative completion evidence can be reconciled before final sign-off without rewriting the authorised package.
8. Material changes require approval before subsequent operations.
9. Final sign-off freezes operational evidence, advances Fleet/Financial projections exactly once and supports a deterministic Mission report.
10. The Job closes only after every required Mission has been signed off.
11. Tenant, Base, role, audit, evidence, immutability and concurrency tests pass across API and database boundaries.
12. Existing simple Jobs and Missions remain valid without fabricated historical evidence.
