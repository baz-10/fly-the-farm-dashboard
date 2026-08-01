# Production Beta Backup and Restore Runbook

Status: validated for the Spray Command Production Beta environment on 1 August 2026.

## Scope

This runbook covers the PostgreSQL system of record. It does not authorise an in-place production restore. A production restore requires Product Owner approval, a declared recovery point, and validation in an isolated target before traffic is changed.

## Backup controls

- Supabase automated physical backups must remain enabled.
- Check backup status through the Supabase dashboard or Management API before each release and before any recovery operation.
- A valid check must show `walg_enabled: true` and at least one backup with `status: COMPLETED`.
- Repository migrations remain the authoritative schema history. Backup recovery does not replace migration control.
- Vercel environment secrets and Supabase credentials are backed up through their provider controls; they must never be placed in a database dump or repository file.

## Controlled restore procedure

1. Record the production project reference, selected recovery point, and reason for the restore.
2. Create an isolated, non-default Supabase branch or recovery project in the Sydney region with production data restored into it. Never target the production project for the validation restore.
3. Wait until the restored database and preview project report healthy status. Do not accept a reachable database as complete while provisioning is still applying platform services.
4. Obtain target-specific publishable credentials. Never reuse or expose service credentials in browser code.
5. Confirm the expected authentication identities can authenticate against the restored target.
6. Confirm browser roles cannot directly read server-only operational tables.
7. Run read-only administrative checks for:
   - client → property → field → job → mission relationships;
   - audit-event history for every restored entity;
   - separate organisation records;
   - forced RLS on operational, location, and audit tables;
   - tenant policies on those tables;
   - active membership-to-operating-location assignments;
   - the expected mission row version.
8. Run the application/API acceptance suite against the target before any traffic change when performing a real recovery.
9. If every acceptance check passes, obtain Product Owner approval before changing application environment variables or production traffic.
10. If any check fails, abandon the target, preserve production unchanged, record the failure, and repeat from a different recovery point after resolving the cause.

## Validation evidence

The 1 August 2026 controlled restore used source project `fzkrvglzompkuiodqllr` and isolated restore branch `bshcxzgrosskzazhaevt` with data restoration enabled.

- Client-to-mission relationship: intact.
- Restored audit events for acceptance entities: 8.
- Forced-RLS tables checked: 7 of 7.
- Tenant policies found: 8.
- Fly The Farm operating-location assignments restored: 2.
- Separate tenant organisations restored: yes.
- Direct browser-role operational-table access: denied for both Fly The Farm and isolation-control identities.
- Restored mission row version: 4.

## Rollback and cleanup

- A validation restore never changes production, so rollback is to discard the isolated target.
- Keep the target only while evidence review or further controlled testing requires it.
- Delete the isolated branch after Product Owner acceptance to avoid stale data and unnecessary cost.
- Revoke temporary access tokens and remove temporary credentials after validation.

## Recovery acceptance gate

A restore is acceptable only when relationships, audit history, tenant controls, location assignments, authentication, row versions, and application/API acceptance checks all pass. A database that merely starts successfully is not an accepted recovery.
