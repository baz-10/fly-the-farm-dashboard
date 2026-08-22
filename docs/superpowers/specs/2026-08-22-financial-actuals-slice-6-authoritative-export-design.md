# Financial Actuals Slice 6 — Authoritative Export and Acceptance Design

## Status and boundary

This specification implements the Founder-approved Slice 6 design. Runtime implementation remains paused until this specification and its implementation plan are reviewed.

Slice 6 closes the Financial Actuals productisation workstream with two deliverables only:

1. an authoritative PDF/P&L representation of an exact immutable FINAL revision; and
2. complete controlled lifecycle, security, responsive-browser, and Product Maturity evidence.

It does not add Quote, invoice, Fleet-cost, Aircraft-cost, payroll, purchasing, credit/refund, Draft-abandonment, automatic drift-correction, or new financial-category authority. Financials remains `COMING_SOON`. No Production migration, deployment, alias change, customer exposure, or genuine Fly The Farm mutation is part of this slice.

## Reuse analysis

The immutable `financial_actual_revisions` FINAL row and its frozen calculation, input, provenance, source manifest, digest, finaliser, and finalisation timestamp remain the sole financial authority.

Slice 6 reuses these checked reads unchanged:

- `ftf_read_financial_actual_authority(organisation, actor, aggregate)` supplies checked aggregate identity, hierarchy, Base scope, and the current FINAL.
- `ftf_read_financial_actual_historical_revision(organisation, actor, aggregate, revision)` supplies an exact historical FINAL revision, including archived aggregates.

For a current export, the server uses the FINAL returned by the aggregate read and requires its ID to equal the requested revision ID. For a historical export, the server retains hierarchy from the aggregate read and reads the exact requested historical revision. It verifies that both reads refer to the same stable aggregate and reference. No latest-revision fallback is allowed.

A zero-migration design is insufficient. The checked reads require `financial_actuals.read` but do not enforce `financial_actuals.export`, and no existing checked command can append bounded Financial export evidence. Direct server inserts into `audit_events` or `transactional_outbox` would bypass the repository's checked-command convention. Therefore Slice 6 introduces one additive migration containing one narrow RPC and no new tables.

The Mission report artefact/job framework is not reused: it is Mission-bound, stateful, asynchronous, and would require schema and worker expansion expressly prohibited by the Founder decision.

## Exact export contract

The browser submits only:

```ts
type FinancialActualExportRequest = {
  actualId: string;
  revisionId: string;
};
```

The trusted server owns these constants and values:

- `reportVersion = "FINANCIAL_ACTUAL_PNL_V1"`;
- a canonical UTC `generatedAt` timestamp;
- the exact revision number, input digest, and formula version decoded from database authority;
- the authenticated organisation and internal actor.

The endpoint is `POST /api/v1/financial-actuals?action=export`. It is same-origin, authenticated, `Cache-Control: no-store`, and requires both `financial_actuals.read` and `financial_actuals.export` before any read or render. Success returns `application/pdf` with a bounded, sanitised filename derived from the Financial Actual reference and exact revision number.

Drafts, missing revisions, malformed authority, permission failures, tenant/Base failures, digest mismatches, and lifecycle mismatches return no PDF.

## Trusted server flow

The export operation executes in this order:

1. Resolve the authenticated organisation actor and assigned Base scope.
2. Require both read and export permissions at the HTTP boundary.
3. Read the aggregate using `ftf_read_financial_actual_authority`.
4. Resolve the exact requested revision:
   - use the current FINAL only when its ID exactly equals `revisionId`; otherwise
   - call `ftf_read_financial_actual_historical_revision` with that exact ID.
5. Strictly decode the complete aggregate hierarchy and frozen FINAL revision.
6. Build a bounded export view model without calculation or source refresh.
7. Render the complete PDF in memory using the server-owned report version and generation timestamp.
8. Call the single checked export-evidence RPC with trusted organisation/actor plus the minimum immutable identity: aggregate ID, revision ID, revision number, input digest, formula version, report version, and generated timestamp.
9. Release the already-rendered bytes only if the RPC succeeds and confirms all supplied evidence.

If rendering fails, the RPC is never called. If the RPC fails, rendered bytes are discarded. If the RPC succeeds but HTTP transport later fails, the audit semantics remain truthful: export authority was checked, PDF bytes were generated, and generated evidence was recorded; the database does not claim that the browser saved or opened the file.

## Strict server decoder

`server/financial-actual-export-contract.js` owns the export-only fail-whole decoder. It accepts only the exact keys emitted by the existing current and historical checked reads. It validates recursively:

- UUIDs, bounded safe labels, canonical dates, and canonical offset-bearing timestamps;
- `status === "FINAL"` and positive exact revision number;
- `currencyCode === "AUD"` for `FINANCIAL_ACTUAL_V1`;
- formula version and 64-lowercase-hex input digest;
- complete frozen calculation with canonical numeric precision and null semantics;
- complete frozen input, work evidence, cost evidence, provenance rows, and source manifest within existing cardinality caps;
- exact aggregate/revision linkage and hierarchy identity;
- no unknown keys, credential-shaped strings, control characters, or unbounded nested values.

The decoder does not recalculate revenue, costs, gross profit, margin, hours, or operational days. It validates representation and internal identity only. A missing or malformed value invalidates the entire export.

## Renderer boundary

`server/financial-actual-renderer.js` is a dedicated, deterministic in-memory PDF renderer using the repository's existing `jsPDF` dependency and visual conventions. It is not a generic report framework and creates no report state.

The renderer consumes only a fully decoded `FinancialActualExportViewModel`. It has no repository, calculator, browser storage, operational-source, or network dependency.

The visible PDF includes:

- Financial Actual reference, exact revision number, and `FINAL`;
- Client and Job context;
- reporting period, currency, finalisation date, and generated timestamp;
- Revenue;
- Labour, Products, Aircraft & Equipment, Travel, and Other Costs;
- Total Cost, Gross Profit, Gross Margin when non-null;
- Operational Days and Total Hours;
- concise source wording where useful.

Null gross margin and null effective hourly revenue render as an em dash or `Not defined`, never `0%` or a fabricated zero. The PDF excludes quoted margin, compliance score, quote variance, inferred costs, Draft values, and detailed audit payloads.

PDF metadata includes the exact revision ID, formula version, report version, and input digest. The deterministic renderer tests normalise PDF file IDs while preserving the caller-supplied generated timestamp.

## Migration 6 and one-RPC authority

Proposed migration:

`20260822140000_financial_actual_export_evidence.sql`

It creates only:

```sql
public.ftf_record_financial_actual_export_evidence(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_financial_actual_id uuid,
  p_revision_id uuid,
  p_revision_number integer,
  p_input_digest text,
  p_formula_version text,
  p_report_version text,
  p_generated_at timestamptz
) returns jsonb
```

The function is `SECURITY DEFINER`, has fixed `search_path = public, pg_temp`, and receives EXECUTE only from `service_role`. It adds no table privilege.

Within one transaction it:

1. requires active-seat `financial_actuals.read` and `financial_actuals.export` permissions;
2. resolves the exact aggregate in the supplied organisation;
3. rechecks the actor's current Base access;
4. resolves the exact supplied revision under that aggregate;
5. requires `FINAL`;
6. compares revision number, input digest, formula version, and the allowlisted `FINANCIAL_ACTUAL_PNL_V1` report version;
7. validates `generated_at` as a bounded recent trusted-server timestamp;
8. inserts one bounded `financial_actual.export_generated` audit event and one bounded `financial.actual.export_generated` outbox event; and
9. returns `FINANCIAL_ACTUAL_EXPORT_EVIDENCE_V1` confirmation containing only the recorded identifiers and timestamp.

The event payload contains no revenue, costs, quantities, work rows, provenance rows, source manifest, or frozen snapshot.

## TOCTOU reasoning

The checked read, in-memory render, and evidence RPC are separate operations. This is safe because a FINAL revision and all frozen evidence beneath it are permanently immutable. The evidence RPC does not rely on that assumption alone: it independently resolves the exact aggregate/revision and compares the immutable revision number, digest, and formula version supplied by the trusted server.

Archive changes only aggregate operational visibility and does not mutate FINAL evidence. Therefore an export begun before archive may still complete only if the actor retains checked read/export/Base authority when the evidence RPC runs. Permission or Base removal during rendering causes the RPC to fail and the PDF to be discarded.

No transaction can substitute a newer current FINAL because `revisionId` is always exact and the RPC never follows `current_final_revision_id` as a fallback.

## Failure and diagnostic behaviour

- Invalid request identifiers: `400 FINANCIAL_ACTUAL_REQUEST_INVALID`.
- Missing authentication: `401 UNAUTHENTICATED`.
- Missing either permission: `403 FORBIDDEN`.
- Wrong tenant/Base or unavailable exact revision: fail closed as `404 NOT_FOUND` where required to avoid an identity oracle.
- Draft requested: no PDF and a bounded unavailable/not-found response.
- Strict decode failure, render failure, or evidence mismatch: `500 FINANCIAL_ACTUAL_EXPORT_UNAVAILABLE` with no protected payload.
- No raw PostgREST response, credential, environment value, snapshot, or PDF content is logged.

The browser decoder for JSON errors remains bounded and credential-aware. PDF responses are accepted only when successful, `application/pdf`, non-empty, and within a server-governed size cap.

## UI and authority-scope behaviour

`ActualDetail` exposes `Export current FINAL` only when the user has both permissions and a decoded FINAL exists. An exact historical FINAL card exposes `Export revision N` for that selected revision. Drafts never expose an authoritative export.

Export busy/error state is keyed to the complete route and authenticated authority scope. A tenant, Base, delegated-session, permission, actual, or selected-revision change immediately suppresses stale state and prevents late completions from triggering a download.

The browser calls the export endpoint and initiates a download from the returned Blob. It does not inspect or reconstruct financial values and cannot provide a Preview or localStorage fallback.

## Controlled acceptance architecture

Slice 6 uses layered evidence rather than a fake claim that a browser route mock is PostgreSQL authority:

1. PostgreSQL behavioural acceptance executes the complete aggregate/revision lifecycle against the real migration chain, including operational prefill, finalisation, correction, historical reads, export evidence, archive, security denials, drift, stale writes, and rollback.
2. Server integration tests exercise the real handler/repository/decoder/renderer boundary and prove no PDF is released before evidence confirmation.
3. Stateful Playwright acceptance exercises the complete user workflow and exact network contracts in Chromium and WebKit at phone, tablet, and desktop sizes. It proves multi-session reconstruction and browser authority-scope handling; it does not replace PostgreSQL proof.
4. Private-beta operational evidence remains explicitly missing until a separately authorised deployment and genuine controlled acceptance run occur.

Controlled fixtures use unmistakable acceptance identities and never target genuine Fly The Farm records. Cleanup operates only on fixture-owned identities.

## Security verification

Tests must prove:

- read without export denied; export without read denied;
- unauthorised and contractor roles denied;
- wrong Base and cross-tenant exact IDs denied;
- direct Financial table and generic service-role table reads remain absent;
- only the named checked RPC is executable by `service_role`;
- arbitrary aggregate/revision/digest/formula/report-version/timestamp combinations fail;
- malformed or incomplete projections produce no PDF;
- current and historical exports never substitute revisions;
- full financial payloads never enter audit/outbox;
- source drift is detected and non-mutating;
- stale writes cannot overwrite newer Drafts;
- Production, absent, or malformed development override remains closed.

## Product Maturity assessment

Slice 6 does not edit `product-maturity-registry.json`. The completion report compares the existing `COMING_SOON` Financials entries with repository evidence.

Expected result:

- code/controlled-acceptance readiness may become complete;
- Product Maturity promotion remains not ready if required genuine Private Beta operational evidence is absent;
- the report must list satisfied automated/manual evidence separately from missing operational evidence.

The historical `invoice-export` maturity item is not relabelled as authoritative invoicing. Slice 6 produces a Financial Actual P&L export only.

## Rollback and fix-forward implications

Before Production, ordinary commit reversion removes the endpoint/UI/renderer and the additive migration from an unshipped chain.

After any separately approved Production migration, the function is additive and read/audit-only. A runtime defect is fixed forward by disabling the UI/endpoint or correcting the renderer/contract. Existing FINAL revisions remain untouched. Audit/outbox records already written remain truthful immutable evidence and are never deleted during rollback.

No automatic rollback, Production migration, or deployment is authorised by this specification.

