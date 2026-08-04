# Guided Mission Navigation and Organisation References

## Status

Approved by the Product Owner on 4 August 2026.

## Objective

Make the guided Mission workflow safely reversible and remove unnecessary manual entry of Job and Mission references while keeping every identifier organisation-owned and historically stable.

## Reversible guided workflow

The operator may move backward and forward through every guided Mission step before the Mission is locked.

- A completed step remains selectable.
- Going back never deletes a saved Client, Property, Field, Job or Mission.
- Returning to a saved step reuses the selected authoritative record and does not silently create a duplicate.
- If the operator changes an upstream selection, dependent selections are cleared visibly and must be reconfirmed.
- Updates to an existing authoritative record use its normal permissions, validation, audit, outbox and optimistic-concurrency controls.
- The stable Draft Mission route remains the resume point after the Mission has been created.

## Organisation reference prefix

Each organisation owns a persistent `reference_prefix`.

- A prefix is initially suggested from the organisation name, using the initials of meaningful words: Fly The Farm becomes `FTF`; High Country Drones becomes `HCD`.
- The prefix is uppercase, contains only `A-Z` and `0-9`, and is between two and eight characters.
- An authorised organisation administrator may confirm or change the prefix.
- Changing the organisation name does not change a confirmed prefix.
- Changing a prefix never rewrites existing Job or Mission references.
- Prefix uniqueness is not required across organisations because tenant isolation makes each namespace independent.

## Automatic references

Automatic reference generation is the default for guided Job and Mission creation.

- Job format: `<PREFIX>-JOB-<SEQUENCE>`, for example `FTF-JOB-000001`.
- Mission format: `<PREFIX>-MIS-<SEQUENCE>`, for example `FTF-MIS-000001`.
- Sequences are independent by organisation and resource type.
- References are allocated by PostgreSQL inside the trusted write transaction.
- Allocation is concurrency-safe and cannot produce duplicates.
- Allocated numbers are never reused after archive or deletion.
- Existing manually assigned references remain unchanged.

## Custom references

The form displays an `Auto-generate reference` checkbox selected by default.

- When selected, the reference field is read-only and displays the next reference as a preview; the server remains authoritative and may allocate a later number if concurrent creation occurs.
- When cleared, the operator may enter a custom reference.
- Custom references are trimmed, validated and unique within the organisation and resource type.
- A clear conflict response is returned if another record already owns the custom reference.
- Custom references do not consume or alter the automatic sequence.

## Security and integrity

- Reference prefixes and sequences are tenant scoped.
- Prefix administration requires the existing organisation-administration permission boundary.
- Clients cannot select another organisation's prefix or sequence.
- Server-side generation is authoritative; client-generated values are never trusted.
- Job and Mission creation continues to produce the existing audit and transactional-outbox events.
- Existing RLS and operating-location enforcement remain unchanged.

## API and database impacts

- Add an organisation reference-prefix field and organisation-scoped Job and Mission sequence state through repository-controlled migration.
- Extend trusted Job and Mission create commands to accept either automatic mode or an explicit custom reference.
- Return the allocated authoritative reference in the existing resource response.
- Preserve the current public `/api/v1/*` resource routes and response envelopes.

## Acceptance criteria

1. The operator can return to any earlier guided step before lock and then continue forward.
2. Backward navigation does not delete records or create duplicates.
3. An upstream selection change visibly clears dependent selections.
4. Fly The Farm automatically receives `FTF-JOB-000001` and `FTF-MIS-000001` style references.
5. Another organisation can use its own prefix and independent counters.
6. Concurrent creates receive distinct sequential references.
7. Archived references are never reused.
8. Operators can disable automatic generation and save a unique custom reference.
9. Duplicate custom references fail visibly without a partial record.
10. Prefix changes affect only future automatic references.
11. Tenant isolation, permissions, audit, outbox and optimistic concurrency remain enforced.
12. Refresh and re-login preserve all saved records and authoritative references without browser-storage fallback.
