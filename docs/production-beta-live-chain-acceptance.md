# Production Beta Live Chain Acceptance Evidence

Validation date: 1 August 2026  
Deployment: `https://spray-command-production-beta.vercel.app`  
Production organisation: Fly The Farm

## Deployed frontend workflow

The deployed frontend created and reopened this PostgreSQL-backed chain:

- Client: `9240201f-2a4d-4c34-8028-801bebdc4e43`
- Property: `06c66a4c-badc-421e-9028-e085e313578f`
- Field: `32789946-1d4c-420c-a26c-958e7a581c64` (12.5 hectares)
- Job: `a55ae84f-831e-4b8c-94ef-4c395f7b3924`
- Mission: `1ad52544-d7b2-4cbc-a5de-c2aa8d1d74c6`

The mission and its complete parent chain remained visible after a hard refresh, logout, password login, and direct reopening of the mission route.

## Identity and access

- Primary Fly The Farm user: active administrator role, active licensed seat, one assigned operating location.
- Secondary Fly The Farm user: active administrator role, active licensed seat, the same assigned operating location.
- Isolation-control user: a separately authenticated user in a different organisation and location.
- The secondary user authenticated through a new deployed frontend session and reopened the same mission chain.
- Independent primary and secondary access tokens both returned HTTP 200 for the mission.
- The isolation-control token received HTTP 404 `NOT_FOUND` for the Fly The Farm mission.
- A mission create using the isolation-control location received HTTP 403 `LOCATION_FORBIDDEN`.

## Data integrity

- All client, property, field, job, mission, and job-field relationships were verified in PostgreSQL.
- An authorised update advanced the mission from row version 3 to 4.
- A second update using row version 3 received HTTP 409 `VERSION_CONFLICT` and did not overwrite the winning value.
- An unsupported mission payload received HTTP 400 `VALIDATION_ERROR`.
- The mission count was unchanged after both denied create attempts.
- Operational collections in `ftf_store`: 0 rows. Production Beta did not fall back to legacy persistence.

## Audit and event delivery

- Acceptance-chain audit events found: 8.
- Event types include client, property, field, job, and mission creation plus mission updates.
- Acceptance-chain transactional outbox records found: 8.
- Outbox topics exist for each create operation and mission updates.

## Backup and restore

- Automated physical backup status: enabled (`walg_enabled: true`).
- Completed physical backup confirmed before restore validation.
- Controlled data restore target: `bshcxzgrosskzazhaevt`.
- Restored client-to-mission relationships: intact.
- Restored audit-event count for the acceptance entities: 8.
- Forced-RLS tables validated: 7.
- Restored tenant policies validated: 8.
- Restored Fly The Farm location assignments: 2.
- Separate tenant organisations remained present.
- Restored mission row version: 4.

The operating procedure and rollback controls are defined in `docs/production-beta-backup-restore.md`.

## Current product boundary

The live chain is ready for Product Owner use as an authoritative Planning workflow. The deployed mission screen intentionally blocks aircraft, equipment, personnel, chemicals, weather, JSA, risk controls, authorisation, completion, work-pack, and financial values until their approved authoritative backend slices are connected. These limitations are visible and do not silently save unsupported data.
