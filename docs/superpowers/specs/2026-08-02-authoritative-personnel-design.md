# Authoritative Personnel Design

## Decision and scope

Spray Command Production Beta will use a hybrid Personnel model. Personnel is a stable, organisation-owned operational identity that can optionally link to an internal user and membership. Non-login Personnel remains fully assignable operationally but cannot authenticate, receive permissions, or consume a seat.

This bounded slice covers Personnel records, operating-location scope, operational roles, licences and competencies, internal evidence references, controlled member linking, and versioned Mission assignments for Pilot in Command, additional crew and observers. It connects directly to the existing Mission planner without redesigning it.

## Architecture

The implementation remains inside the portable modular monolith. Repository-controlled PostgreSQL migrations define the authoritative model, tenant and location constraints, RLS, trusted RPCs, optimistic concurrency, audit events and transactional outbox events. The versioned `/api/v1` dispatcher exposes narrowly scoped Personnel and Mission-assignment handlers that delegate to repository/application services. The React frontend uses a dedicated Personnel API adapter and a focused Mission Personnel selector.

## Relational model

- `personnel`: stable operational identity, optional `internal_user_id` and `membership_id`, non-sensitive planning fields, employment status, active/archive state and row version.
- `personnel_operating_locations`: explicit organisation/location scope.
- `personnel_operational_roles`: governed operational roles including PIC, pilot, observer, ground crew, chemical operator, loader, supervisor and maintenance support.
- `personnel_credentials`: versioned licences and competencies with type, identifier, issuer, dates, status, verification state, jurisdiction and supersession.
- `personnel_evidence`: internal file ID/version/checksum, evidence type, access classification, provenance and retention state. Provider URLs are forbidden.
- `mission_personnel_assignments`: Mission-to-Personnel relationship with assignment role, row version and immutable planning snapshot JSON.

Composite foreign keys carry organisation ownership. Location scope is validated against both the Mission and Personnel scope. Member links are unique and controlled so an existing Personnel ID can gain or lose login linkage without losing operational history.

## Qualification and assignment rules

The server validates Mission assignments at the Mission scheduled date. A PIC requires an active PIC/pilot role and a current, verified RePL or explicitly accepted internal pilot authorisation. Additional pilots require a pilot role and current pilot credential. Observers require an observer role; credentials are recorded when policy requires them but are not universally mandatory. Inactive, archived, cross-tenant or cross-location Personnel cannot be assigned. Failed validation returns explicit blockers and creates no assignment or snapshot.

## Historical integrity

Each accepted assignment captures Personnel ID/version, display name, assignment role, qualifying credential facts, expiry/verification state, organisation ID and Mission location. Later Personnel or credential changes do not mutate prior snapshots. Mission authorisation will later bind the accepted assignment versions into its authorisation manifest.

## Privacy and evidence

Standard Mission planning reads expose only operational identity, roles, credential readiness and relevant expiry information. Emergency contacts, private notes, private identification evidence and other sensitive fields require `personnel.private.read`. Evidence is represented by internal file records and checksums; no storage-provider URL enters the domain or browser response.

## Error handling and security

All writes are server-authoritative, same-origin, authenticated, permission-checked, tenant-scoped and location-scoped. Optimistic conflicts return `409`; invalid qualification and relationships return explicit blockers; unauthorised reads are denied or redacted. RLS reinforces service checks. No local-storage or legacy persistence fallback is permitted.

## Frontend integration

The existing Mission planner gains one Personnel panel containing PIC, additional crew and observer selection. Options are role-aware and location-aware and display current credential readiness. The panel explains blockers and persists assignments through the server. Personnel administration uses existing visual patterns and fields without redesigning Mission planning.

## Acceptance

The slice is accepted when Fly The Farm can create non-login Personnel, link an existing member, add roles and credentials, retain evidence references, scope Personnel to a location, assign a valid PIC/crew/observer, block expired or missing credentials, reopen assignments across sessions, observe privacy redaction, preserve snapshots, confirm audit/outbox records, and operate without legacy persistence.
