# Operating Authority Register Design

## Purpose

Replace the single-file ReOC form with an authoritative organisation operating-authority register. The register must preserve every certificate, variation, instrument, special approval, exemption and other CASA authority needed to understand what an organisation is permitted to do.

This design also corrects the current large-file failure. Compliance files must upload directly to protected object storage rather than passing as base64 JSON through a Vercel Function. Vercel's request-body limit is 4.5 MB; base64 increases file size and can cause the request to be rejected before Spray Command's API executes.

## Product Model

The user-facing workspace remains **ReOC and Operating Authority**. It contains these sections:

1. Operating authority summary.
2. Current ReOC certificates.
3. ReOC variations.
4. Instruments and special approvals.
5. Exemptions and other CASA authorities.
6. Expired and superseded history.

The authoritative record is an **Operating Authority Document**. Each record has one repository-controlled type:

- `REOC_CERTIFICATE`
- `REOC_VARIATION`
- `INSTRUMENT`
- `SPECIAL_APPROVAL`
- `EXEMPTION`
- `OTHER_CASA_AUTHORITY`

The catalogue is repository-controlled and may be extended without changing the persistence model.

## Authority Record

Each authority record stores:

- Organisation and operating-location scope where applicable.
- Authority type.
- Document, certificate, instrument or approval number.
- Issuer.
- Legal holder.
- Organisation ARN.
- Issue date.
- Expiry date, where applicable.
- Status.
- Operational scope, including aircraft, weight or activity where applicable.
- Conditions.
- Notes.
- Record version.
- Superseded-authority reference where applicable.
- Creator and timestamps.

Multiple authority records may be current simultaneously. A special approval or instrument is not folded into the ReOC certificate and does not overwrite it.

## Evidence Files

Each authority record may have multiple immutable evidence files. Examples include the issued instrument, approval letter, schedules and supporting conditions.

Every evidence file retains:

- Internal file ID.
- Immutable file version.
- Original filename.
- Content type and byte size.
- SHA-256 checksum calculated and verified server-side.
- Storage provenance.
- Uploading actor and timestamp.
- Evidence classification.
- Evidence description or role.
- Parent authority record and record version.

Files cannot be edited or deleted. Corrections add new evidence or create a superseding authority record. Existing historical evidence remains unchanged.

## Secure Direct Upload

The browser first requests a short-lived upload authorisation from the trusted Spray Command server. The server validates the organisation actor, `compliance.manage` permission, filename, content type and declared size, then issues a narrowly scoped signed upload target for a server-generated internal file ID and provider key.

The browser uploads bytes directly to the protected `compliance-evidence` bucket. Credentials, provider keys and signed targets are never persisted in application records or exposed in logs.

After upload, the browser submits only metadata and the upload token to the trusted finalisation command. The trusted server verifies the object exists, verifies size and calculates or verifies the checksum before atomically attaching immutable evidence to the authority record with audit and transactional outbox events.

An unfinalised upload is not authoritative evidence. Stale unfinalised uploads are eligible for repository-controlled cleanup.

## Save Transaction

Creating a new authority record with evidence follows this sequence:

1. Upload each selected file through a signed direct-upload authorisation.
2. Submit the authority metadata plus uploaded internal file references.
3. The trusted command validates every uploaded object.
4. PostgreSQL creates the authority record and all evidence rows atomically.
5. Audit and transactional outbox events are committed in the same transaction.
6. The API returns the new record and evidence manifest.

If validation or database persistence fails, no partial authoritative record is created. Uploaded but unfinalised objects remain non-authoritative and are cleaned up safely.

Adding evidence to an existing authority is a separate append-only command protected by expected record version. Concurrent stale requests fail with a visible conflict.

## Compliance Health and Calendar

The current ReOC certificate continues to drive the mandatory ReOC critical rule. ReOC variations, instruments, special approvals and exemptions are assessed independently for expiry, missing evidence and review dates without being mistaken for the required ReOC certificate.

Compliance Health and Calendar remain derived projections. They do not duplicate authority status or dates. Each issue links directly to the relevant authority record in the workspace.

## User Experience

The workspace opens with the current authority summary and obvious actions:

- `Add ReOC certificate`
- `Add variation`
- `Add instrument or special approval`
- `Add other authority`

Each authority card shows type, number, status, expiry, scope and evidence-file count. Opening a card shows its complete metadata, evidence manifest and history.

The add form supports selecting multiple files. Every selected file shows its name, size, upload progress and finalisation result. A failed file does not erase the form or other completed uploads. Errors state whether the failure occurred during authorisation, direct upload, verification or authoritative save and include a safe correlation reference where available.

## Permissions and Security

- `compliance.read` reads authorised records and safe evidence metadata.
- `compliance.manage` creates authority records and appends evidence.
- Existing tenant, location and privacy enforcement remains in force.
- RLS remains enabled.
- No service-role credential reaches the browser.
- Signed uploads are short-lived and limited to one generated object path.
- Cross-tenant upload finalisation is rejected.
- Unsupported content types, invalid sizes and filename traversal are rejected.
- All commands use the normal trusted session and same-origin protections.

## Historical Compatibility

Existing `REOC` organisation compliance instruments remain authoritative. The migration maps the existing type to `REOC_CERTIFICATE` without rewriting its evidence or audit history. Existing internal file IDs and checksums remain unchanged.

The migration is additive and repository-controlled. It must not fabricate missing evidence, certificates, instruments or approvals.

## Error Correction

The current generic error occurs when an oversized base64 request is rejected before the compliance handler returns its JSON error envelope. The new direct-upload path removes that transport boundary. Client handling must also recognise non-JSON HTTP failures and report a safe, actionable message such as:

> The certificate could not be uploaded because the request was too large. Retry using the secure file upload.

The server must return safe error codes and correlation references for application-level failures.

## Acceptance

Acceptance requires proof that:

1. Multiple ReOC and operating-authority records can coexist.
2. An authority record accepts multiple immutable files.
3. Instruments and special approvals are distinct authority records.
4. A file exceeding the former base64 request boundary uploads successfully through the protected direct path.
5. File checksum, provenance, actor, timestamp and parent record persist.
6. Refresh, re-login and a second authorised session retrieve the same manifest.
7. Failed finalisation creates no partial authoritative record.
8. Stale concurrency is rejected.
9. Tenant, location and privacy isolation remain enforced.
10. Audit and outbox evidence is atomic.
11. Existing ReOC history remains unchanged.
12. Compliance Health still reports a missing required ReOC truthfully.
13. No browser, local-storage or legacy persistence fallback exists.

