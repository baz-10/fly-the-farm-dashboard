# Customer Acceptance Design

**Status:** Product Owner approved  
**Requirement:** NEW-MIS-002  
**Lifecycle stage:** Post-Mission  
**Production Beta objective:** Replace informal customer acknowledgement records with authoritative, immutable Mission evidence.

## Purpose

Customer Acceptance records whether and how a customer acknowledges completed work. It is distinct from Mission Completion, which records what happened, and Mission Outcomes, which records how well the treatment worked.

Customer Acceptance is optional. It never gates Mission Completion and never changes Completion or Outcome evidence.

## Approved Channels

One immutable evidence model supports three submission paths:

1. **Operator recorded:** an authorised Fly The Farm operator records an acknowledgement received by phone, verbally, in person, email, or another repository-controlled method.
2. **Secure customer link:** a customer uses a single-purpose, expiring, revocable link without requiring an account.
3. **Customer Portal:** an authenticated customer uses the same trusted submission command and evidence model when portal capability exists.

Production Beta implements operator recording and secure customer links. The data and API boundaries must permit portal submission later without schema redesign.

## Acceptance States

Repository-controlled catalogue values are:

- `ACCEPTED`
- `ACCEPTED_WITH_COMMENTS`
- `DISPUTED`
- `DECLINED`

`PENDING` is a workflow condition only. It means no acceptance evidence has been submitted and is not stored as a customer declaration.

## Signature Policy

Evidence requirements depend on submission method:

- Secure-link and future portal submissions require an explicit consent declaration and digital signature.
- Operator-recorded phone or verbal acceptance requires the customer's identity, acknowledgement method, acknowledgement time, recording operator, and notes. A customer signature is not required.
- Operator-recorded in-person or written acceptance may include a signature or supporting attachment.

Signature evidence is an immutable internal file/version record with checksum and provenance. Provider URLs are never authoritative identifiers.

## Immutable Evidence Model

Each Customer Acceptance record contains:

- organisation and operating location;
- Mission ID;
- exact Completion revision ID;
- sequence number;
- acceptance state and catalogue snapshot;
- acknowledgement method and catalogue snapshot;
- customer entity and customer snapshot;
- customer contact name, role, email and phone supplied for the acknowledgement;
- customer comments;
- acknowledgement time;
- submission channel;
- consent declaration and consent time where required;
- signature file ID/version where required;
- supporting attachment IDs/versions;
- operator Personnel ID and snapshot for operator-recorded evidence;
- authenticated portal identity where applicable;
- secure-link issue/access/submission provenance where applicable;
- superseded acceptance ID for corrections;
- created timestamp and actor;
- audit event and transactional outbox event.

Rows are append-only. Update and delete are rejected at the database layer. A correction creates a new record that explicitly supersedes an earlier record. Mission Completion, Mission Outcomes, and earlier acceptance records remain unchanged.

## Secure Link Model

An authorised internal user may issue a link for one organisation, Mission, Completion revision, and intended customer contact.

The platform stores:

- link record ID;
- cryptographically random token hash, never the plaintext token;
- organisation, operating location, Mission and Completion revision;
- intended customer/contact snapshot;
- issue time and issuing Personnel;
- expiry time;
- access count and last-access time;
- revoked time, revoking Personnel and reason;
- consumed time and resulting acceptance ID;
- audit and outbox events for issue, access, revoke and submit.

Links are single-purpose, time-limited, revocable, rate-limited and replay-protected. A consumed, expired, or revoked token cannot submit again. Link lookup uses a constant-time hash comparison through a trusted server command. The public page receives only the minimum customer-safe Mission and Completion summary.

## Permissions

Permissions are assigned through roles, never identities:

- `mission.customer_acceptance.read`
- `mission.customer_acceptance.record`
- `mission.customer_acceptance.link.issue`
- `mission.customer_acceptance.link.revoke`
- `mission.customer_acceptance.attachment.upload`

Internal commands require membership, seat entitlement, permission, tenant access, and operating-location access. Public submission is authorised only by the bounded secure-link token. Generic administrator status does not bypass tenant or location scope.

## User Workflow

The completed Mission screen contains one **Customer Acceptance** panel after Mission Outcomes:

- timeline of immutable submissions;
- `Record customer acknowledgement`;
- `Send secure acceptance link`;
- active-link status, expiry and revoke action;
- explicit correction action that creates a superseding record.

The operator form minimises typing and pre-populates the authoritative customer and Mission context. It asks only for method, customer contact, state, time, comments and optional evidence appropriate to the method.

The secure customer page displays:

- organisation identity;
- customer-safe Mission reference and completion summary;
- acceptance state choices;
- comments;
- consent declaration;
- signature capture;
- clear submission confirmation.

It never exposes chemicals, internal notes, risk records, Personnel records, financial information, tenant identifiers, or unrelated Missions.

## API Boundary

The versioned public contract uses dedicated Customer Acceptance handlers and application services. Business rules remain outside the transport dispatcher.

Trusted internal commands cover:

- read timeline and link state;
- record operator acknowledgement;
- stage internal attachment/signature;
- issue secure link;
- revoke secure link;
- create correction.

Public token commands cover:

- resolve the bounded customer-safe summary;
- submit signed customer acceptance once.

Every write is server-authoritative and atomic with audit/outbox creation. Unsupported methods and actions fail visibly. No browser storage or legacy persistence fallback is permitted.

## Error and Integrity Behaviour

- Missing Completion Evidence blocks acceptance creation.
- Cross-tenant or cross-location access returns no record.
- Invalid customer/Mission relationships are rejected.
- Required method-specific evidence is validated server-side.
- Expired, revoked, malformed, replayed or rate-limited links fail visibly.
- A failed write creates no acceptance, signature claim, audit event or outbox event.
- Concurrent link revocation/submission and correction commands use row versions and return explicit conflicts.
- Original files remain preserved when a later form submission fails.

## Acceptance Criteria

Production Beta acceptance requires proof that:

1. An authorised operator records a genuine customer acknowledgement through the deployed Mission screen.
2. A secure link exposes only the approved customer-safe summary.
3. A customer submits a signed acknowledgement through the secure link.
4. Accepted, accepted-with-comments, disputed and declined states are supported.
5. Refresh, re-login and a second authorised internal session preserve the timeline.
6. Expiry, revocation, replay prevention and optimistic concurrency work.
7. Tenant and operating-location isolation work.
8. Attachments/signatures retain internal IDs, versions, checksums and provenance.
9. Corrections create immutable superseding evidence.
10. Audit and transactional outbox records exist for each write and link lifecycle event.
11. Mission Completion and Mission Outcome evidence remain byte-for-byte unchanged.
12. No browser or legacy persistence fallback exists.

Synthetic customer declarations must not be inserted into Production Beta. Automated and controlled-environment fixtures may validate error, security and immutability behaviour. Live acceptance uses genuine Product Owner-provided evidence.

## Deferred Capability

- Customer Portal account provisioning and authenticated portal submission UI.
- Notifications through email/SMS providers beyond link generation.
- Organisation-specific signature policies.
- Contractual approval chains and dual signatures.
- Customer acceptance analytics.

These extensions reuse the same immutable evidence model and trusted application-service boundary.
