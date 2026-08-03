# Customer Outcome Additive Evolution Design

**Status:** Product Owner approved  
**Requirement:** `NEW-MIS-002`  
**Lifecycle stage:** Post-Mission  
**Supersedes:** User-facing portions of the Customer Acceptance design; internal compatibility contracts remain authoritative.

## Purpose and Boundary

Customer Outcome is optional, immutable post-Mission evidence describing the customer-facing result of completed work. It remains separate from Mission Completion, longitudinal Mission Outcome Observations, complaints and investigations, and mutable follow-up actions. Its absence never changes or invalidates Mission Completion.

All user-facing references become **Customer Outcome**. Existing internal `customer_acceptance_*` tables, API resources, permissions, audit history and Requirement ID remain unchanged where renaming would add migration or compatibility risk.

## Additive Evidence Model

Repository migration adds first-class validated columns to `customer_acceptance_records` for:

- `outcome_summary` (required for new records);
- `satisfaction_code` constrained through a repository-controlled catalogue;
- existing customer comments;
- `follow_up_requested`;
- `follow_up_date`, required only when follow-up is requested;
- customer acknowledgement state and method using existing catalogues;
- optional signature identity;
- correction reason where a record supersedes earlier evidence.

The satisfaction catalogue contains exactly:

- `VERY_SATISFIED` — Very satisfied;
- `SATISFIED` — Satisfied;
- `NEUTRAL` — Neutral;
- `DISSATISFIED` — Dissatisfied;
- `VERY_DISSATISFIED` — Very dissatisfied.

Historical records are not backfilled or rewritten. Their new nullable fields display as “Not recorded”. New trusted commands require structured Customer Outcome values.

## Files and Provenance

Existing internal file evidence is extended for `OUTCOME_PHOTO`, `SIGNATURE` and `ATTACHMENT`. Each retained file records internal file ID, immutable version, SHA-256 checksum, original filename, content type, capture timestamp when supplied, caption, uploading actor or bounded secure-link provenance, access classification, storage provider/bucket and opaque provider key. Provider URLs are never authoritative.

Uploads remain staged until an outcome is submitted. Submission atomically claims only file IDs owned by the current internal actor or bounded secure token. Failed or abandoned uploads do not create Customer Outcome evidence.

## Operator Workflow

The completed Mission panel provides one compact workflow:

1. Enter outcome summary.
2. Select one of the five satisfaction values.
3. Add customer comments where applicable.
4. Indicate whether follow-up is requested.
5. Enter a valid follow-up date only when requested.
6. Add optional photos.
7. Record acknowledgement state and method.
8. Add an optional signature.
9. Submit once to create immutable evidence.

The timeline highlights the latest valid outcome while retaining earlier evidence. Corrections require a superseded record and correction reason; no edit or delete action exists.

## Secure Customer Workflow

The existing expiring, revocable, single-purpose, replay-protected link presents the same Customer Outcome fields against a customer-safe Mission summary. Signature is optional. Outcome photos and an optional signature are staged through the bounded token and atomically claimed on submission. Successful submission consumes the link.

The public projection never exposes chemicals, financial records, internal notes, risk evidence, Personnel records, tenant identifiers or unrelated Missions.

## Validation and Atomicity

Server rules require for every new outcome:

- a valid acknowledgement state and method;
- a non-empty outcome summary;
- a repository-controlled satisfaction code;
- a boolean follow-up decision;
- a valid follow-up date when follow-up is true;
- no follow-up date requirement when follow-up is false;
- valid Mission, Completion, customer, tenant and operating-location chain;
- valid staged file ownership and provenance.

Signature is optional for every channel. A failed command creates no outcome record, file claim, audit event or outbox event.

## Security and History

Server-authoritative permissions, membership, seat and operating-location scope remain mandatory for internal commands. RLS remains defence in depth. Public submission is authorised only by the hashed bounded token. Records and claimed files are append-only. Every submission, correction, link lifecycle transition and claimed evidence set produces an audit event and transactional outbox event.

Mission Completion and Mission Outcome Observations remain byte-for-byte unchanged.

## API and UI Compatibility

The versioned resources remain:

- `/api/v1/customer-acceptance`
- `/api/v1/customer-acceptance-public`

Existing permission codes and database object prefixes remain stable. Typed clients may retain internal Customer Acceptance names. All rendered labels, help text, statuses and errors use Customer Outcome terminology.

## Acceptance Criteria

Production Beta must prove:

1. Operator and secure-link Customer Outcome submission.
2. All five satisfaction values are repository-controlled and server validated.
3. Outcome summary and comments persist.
4. Follow-up false without a date succeeds.
5. Follow-up true without a date fails atomically.
6. Follow-up true with a valid date succeeds.
7. Signature omission succeeds for every channel.
8. An optional supplied signature retains immutable provenance.
9. Outcome photos retain internal IDs, versions, checksums and provenance.
10. Refresh, re-login and second authorised session preserve evidence.
11. Tenant and operating-location denial remain effective.
12. Link expiry, revocation, single-use and replay protection remain effective.
13. Corrections append superseding evidence with a reason.
14. Historical Customer Acceptance evidence displays without rewriting or inferred values.
15. Completion and Mission Outcomes remain unchanged.
16. Audit and outbox records exist atomically.
17. No browser storage or legacy persistence fallback exists.

Live acceptance uses genuine customer-facing evidence; automated tests may use controlled fixtures.
