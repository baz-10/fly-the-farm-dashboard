# Safety Plan Task 8 implementation report

## Outcome

Implemented a private, tenant-isolated Safety Plan attachment boundary for
PDF, JPEG and PNG evidence up to 3 MiB.

## Security boundary

- The server derives the tenant from the authenticated session. Client tenant
  headers are ignored.
- Object keys use
  `<tenantId>/<planId>/<versionId>/<attachmentId>/<sanitisedFilename>`.
- Plan, current-version, tenant, role and assignment checks run before every
  object operation.
- Client and platform-support identities are denied.
- Only the current draft version can upload or delete. Approved, superseded,
  submitted and historical versions are immutable through this endpoint.
- Downloads resolve file names from the tenant-filtered plan manifest rather
  than client input.
- Cross-origin requests, duplicate/unsafe path identifiers, traversal, missing
  or inaccurate content lengths, unsupported MIME types and bodies above 3 MiB
  fail closed.
- Browser write operations require a matching Origin header.
- Browser code receives no Supabase URL, API key or service-role credential.
- List responses filter malformed manifest entries whose tenant or version
  does not exactly match the authenticated request.

## Storage and UI

- Added raw Supabase Storage response support on the server.
- Uploads are idempotent for safe retry using the same random attachment id.
- The client validates size/type before upload and uses only the same-origin
  gateway.
- Failed uploads remain local with a retry action. Manifest callbacks occur
  only after confirmed object storage.
- The component displays progress, description, uploader, byte size, digest
  and Safety Plan version, and deletes draft evidence only after server
  confirmation.
- The guided Safety Plan editor exposes the attachment component on its Review
  and submit step and persists the confirmed manifest through the existing
  autosave/concurrency boundary. Late upload responses merge with the newest
  editor manifest rather than overwriting newer work.
- Local Vite dev/preview and Vercel routing now expose the same binary handler.
- Added a private `ftf-safety-attachments` bucket migration with no anonymous
  or authenticated-user object policies.

## Independent review hardening

- Generic Safety Plan writes now reject attachment additions without an exact
  canonical server receipt and reject all direct attachment edits/removals.
- Upload retries never use blind object upsert. A colliding object is read and
  accepted only when its SHA-256 digest, MIME type and canonical receipt
  metadata match; otherwise the gateway returns 409 without overwriting bytes.
- PDF, JPEG and PNG signatures are verified from magic bytes in addition to
  MIME type and size.
- Canonical receipt creation is serialized in a service-role-only database
  function.
- Attachment additions derive an `attachment_changed` audit event in the
  existing atomic Safety Plan compare-and-swap transaction.
- Draft deletion uses a service-role-only database transaction to remove the
  manifest entry, advance plan/version revisions, mark the receipt deleted and
  append the `attachment_changed` audit before object cleanup. Missing object
  cleanup is idempotent; transient cleanup failures remain retryable while the
  saved plan never points at missing bytes.
- Authorization establishes plan visibility before checking version or
  attachment identifiers, returning uniform not-found responses to inaccessible
  users.
- Evidence remains on its immutable approved historical version; controlled
  revisions begin with an empty manifest and obtain fresh canonical receipts.
- Evidence deletion is disabled while the same plan is debouncing, actively
  saving, awaiting retry or resolving a conflict. The field UI explains the
  block and exposes draft-save retry where applicable. The context also refuses
  to install a server deletion result if new pending work appeared during the
  request, so unrelated edits are never silently cleared.
- When this request created new object bytes but receipt persistence fails, the
  gateway compensates by deleting only those request-created bytes. A
  pre-existing same-byte object discovered during idempotent recovery is never
  deleted by a losing request.

## TDD evidence

The first focused run failed because the policy, endpoint, service, component
and local route did not exist. Follow-up RED runs proved cross-tenant manifest
filtering, draft deletion confirmation and Vercel-provided binary-body handling
before their implementations were added.

## Verification

- Focused policy/API/service/component/editor/local-route and inventory tests:
  final delete/compensation regression run: 4 files, 44 tests passed.
- Full suite: 82 files, 532 tests passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed.
- Node syntax checks for all modified/new server JavaScript: passed.
- `git diff --check`: passed.
- Browser source scan found no Supabase service-role, anon-key, `apikey` or
  `Authorization` use in attachment client code.

The Vite build retains existing third-party `pdfjs-dist` eval and large-chunk
warnings; neither was introduced by this task.

## Deployment concern

Run `docs/supabase-safety-plan-migration.sql` with sufficient Supabase
privileges before deploying the gateway. It creates/locks down the private
bucket. Production must already provide `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to the server runtime.
