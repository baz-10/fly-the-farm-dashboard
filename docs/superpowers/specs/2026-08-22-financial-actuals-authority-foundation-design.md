# Financial Actuals Authority Foundation Design

**Status:** Founder-approved design, 22 August 2026

**Programme:** Gate 1 — Quotes and Financials productisation

**Scope:** Phase 1 — Financial Actual authority foundation and deterministic calculation contract

## 1. Purpose and boundary

Spray Command Financial Actuals answers four operational profitability questions:

- What did this job actually cost?
- What did we charge?
- What did we make?
- How did actual performance compare with an authoritative plan or Quote?

It is not an accounting ledger, payroll system, purchasing system, tax engine or replacement for accounting software. Phase 1 preserves the useful historical Financials list, Actual creation, P&L, daily-work, cost-category, draft/final and export concepts while replacing browser-local authority with organisation-scoped server authority.

The `financials`, `financials/margin-analysis` and `financials/invoice-export` Product Maturity entries remain `COMING_SOON`. Implementation does not constitute promotion.

Phase 1 does not:

- import browser-local Financial Actuals or Quotes;
- make browser-local Quotes authoritative;
- integrate with the unmerged Fleet Maintenance workstream;
- infer financial cost from operational identity or usage;
- implement accounting, invoicing, credits, refunds, tax or payroll;
- expose fabricated quoted margin, compliance score or substitute synthetic metrics; or
- authorise a Production migration or deployment.

## 2. Design principles

1. One permanent Financial Actual identity owns immutable numbered revisions.
2. Only a successfully finalised revision can become the current authoritative revision.
3. A final revision and all of its evidence are immutable.
4. Corrections create a new draft revision; they never reopen or overwrite a final revision.
5. Operational facts and financial valuations are separate authorities.
6. Material values retain source and override provenance.
7. Database commands enforce tenant, Base, permission, lifecycle and concurrency boundaries.
8. Finalisation calculates and freezes evidence atomically.
9. No browser-local fallback is permitted.
10. Historical final results remain reproducible without running current calculation code.

## 3. Aggregate identity and relationships

### 3.1 `financial_actuals`

`financial_actuals` is the stable aggregate root.

Required columns:

| Column | Contract |
|---|---|
| `id` | UUID primary key |
| `organisation_id` | Required tenant key |
| `operating_location_id` | Required Base scope |
| `reference` | Immutable organisation-unique display identity, formatted `FA-` plus a zero-padded sequence |
| `client_id` | Required exact Client |
| `property_id` | Required exact Property belonging to the Client |
| `field_id` | Required exact Field belonging to the Property |
| `job_id` | Required exact Job belonging to the Client/Property/Field scope |
| `mission_id` | Optional exact Mission belonging to the Job and Base |
| `current_final_revision_id` | Nullable pointer to the current FINAL revision of this aggregate |
| `active_draft_revision_id` | Nullable pointer to the only active DRAFT revision of this aggregate |
| `row_version` | Positive optimistic-concurrency version for aggregate operations |
| `archived_at`, `archived_by_internal_user_id` | Reversible operational visibility metadata; no hard delete |
| creation/update actor and timestamps | Standard tenant-row metadata |

The hierarchy is re-proven by command logic and composite tenant foreign keys. Caller-supplied labels or snapshots never establish identity. `current_final_revision_id` and `active_draft_revision_id` must reference revisions belonging to the same organisation and aggregate and having the matching lifecycle state.

The stable reference is allocated under an organisation-scoped counter lock. It is presentation identity, not security authority.

### 3.2 `financial_actual_revisions`

Each revision belongs to exactly one stable aggregate.

Required columns:

| Column | Contract |
|---|---|
| `id` | UUID primary key |
| `organisation_id`, `financial_actual_id` | Exact tenant and aggregate |
| `revision_number` | Positive, unique and gap-free per aggregate under the creation lock |
| `status` | `DRAFT` or `FINAL` |
| `predecessor_revision_id` | Null for revision 1; otherwise the FINAL revision used to seed the correction |
| `correction_reason` | Required, trimmed and bounded for a correction revision |
| `row_version` | Draft optimistic-concurrency version |
| `currency_code` | Supported uppercase ISO 4217 code; Phase 1 default `AUD` |
| `calculation_version` | `FINANCIAL_ACTUAL_V1` for this phase |
| `revenue_method` | `HOURLY`, `AREA` or `MANUAL` |
| `start_date`, `end_date` | Authoritative selected date range; start must not exceed end |
| `input_snapshot` | Frozen canonical input document on finalisation |
| `provenance_snapshot` | Frozen canonical provenance document on finalisation |
| `calculation_snapshot` | Frozen `FINANCIAL_ACTUAL_V1` result on finalisation |
| `source_manifest` | Frozen exact operational and future Quote source identities/versions |
| `input_digest` | SHA-256 of canonical frozen inputs and provenance |
| `finalised_at`, `finalised_by_internal_user_id` | Null for DRAFT; required for FINAL |
| creation/update metadata | Actor and timestamps |

The database prevents updates or deletes to FINAL revision rows and their work, cost and provenance children. Direct table DML is unavailable to authenticated callers. Trusted server mutation is confined to checked command functions.

### 3.3 Work entries

`financial_actual_work_entries` stores one entry per revision and work date:

- `work_date` within the selected date range;
- `actual_work_hours numeric(10,4)` greater than or equal to zero;
- provenance reference;
- draft row metadata.

There is at most one effective work entry per date in a revision. A zero-hour day remains a valid dated entry but does not count as an operational day. Costs on zero-work dates remain valid through cost lines.

### 3.4 Typed cost lines

`financial_actual_cost_lines` stores bounded financial lines rather than an unrestricted blob.

Each line contains:

- stable line UUID and deterministic display order;
- category: `LABOUR`, `PRODUCT`, `TRAVEL`, `AIRCRAFT_EQUIPMENT` or `OTHER`;
- governed subtype appropriate to the category;
- bounded description;
- optional incurred date;
- non-negative quantity and governed unit code;
- non-negative unit cost;
- calculated line amount;
- provenance reference;
- optional authoritative operational source identity/version; and
- draft row metadata.

`OTHER` requires a non-empty description, amount provenance and actor. It permits legitimate unusual costs without becoming an arbitrary JSON financial store. Phase 1 prohibits negative quantities, rates, costs and amounts. Credits and refunds require a later explicit design.

Aircraft, Equipment Kit, Personnel and product identities may be referenced authoritatively. Their financial unit costs remain independent financial inputs unless a separately governed cost authority exists.

## 4. Provenance model

`financial_actual_value_provenance` records material input authority. Each entry is scoped to an exact revision and canonical field path or cost/work line.

Allowed provenance classes are:

- `AUTHORITATIVE_OPERATIONAL_INPUT`
- `SYSTEM_DERIVED`
- `MANUAL_FINANCIAL_INPUT`
- `MANUAL_OVERRIDE`
- `QUOTE_DERIVED` (reserved until authoritative Quote versions exist)

An entry records:

- source entity type and UUID where applicable;
- exact source revision/version and source timestamp;
- original value and unit;
- effective value and unit;
- actor and timestamp;
- bounded override reason when `MANUAL_OVERRIDE`; and
- predecessor provenance identity where an override supersedes an imported value.

Original source evidence is never overwritten. Revenue provenance explicitly supports a future authoritative source value, exact immutable source version, manual override, override reason and effective revenue used by the revision. A manual Phase 1 revenue value therefore does not block later source comparison.

Final snapshots contain only bounded financial/operational evidence. They exclude credentials, unrestricted source payloads and unrelated tenant records.

## 5. Lifecycle and revision semantics

### 5.1 Initial creation

Creation atomically:

1. validates `financial_actuals.create`;
2. resolves the actor's organisation and assigned Base;
3. validates the exact Client/Property/Field/Job and optional Mission chain;
4. allocates the stable reference;
5. creates the aggregate;
6. creates revision 1 as DRAFT; and
7. sets `active_draft_revision_id` without setting `current_final_revision_id`.

### 5.2 Draft editing

A DRAFT is editable only through a command requiring `financial_actuals.update` and the expected revision row version. Each successful mutation increments the version. Stale writes return a conflict with safe current-version metadata. A draft update recalculates a non-authoritative preview but does not create final evidence.

Only one active draft may exist for an aggregate. Database locking and a uniqueness/aggregate-pointer invariant prevent competing correction drafts.

### 5.3 Finalisation

Finalisation requires `financial_actuals.finalise`. It runs in one transaction:

1. lock the aggregate and active draft;
2. verify expected aggregate and draft versions;
3. re-prove tenant, Base, hierarchy, lifecycle and source identity/version constraints;
4. validate all numeric, unit, currency and provenance requirements;
5. calculate `FINANCIAL_ACTUAL_V1` using authoritative PostgreSQL numeric arithmetic;
6. construct canonical input, provenance, source and calculation snapshots;
7. calculate the input digest;
8. set the revision to FINAL with actor and timestamp;
9. clear `active_draft_revision_id`;
10. advance `current_final_revision_id` to the newly finalised revision;
11. increment the aggregate version; and
12. write audit and transactional outbox evidence.

Any failure rolls back the revision, pointers, snapshots, audit and outbox together.

### 5.4 Correcting a final revision

Creating a correction requires `financial_actuals.update`, the expected aggregate version and a non-empty correction reason. The command locks the aggregate, rejects an existing active draft, copies the current FINAL revision into revision N+1 DRAFT, links its predecessor and records actor/reason/time.

The existing current FINAL pointer does not move. Reports, standard reads and authoritative exports continue to resolve the existing final revision until the correction draft is finalised.

### 5.5 Archive

Archive requires `financial_actuals.archive`, the expected aggregate version and a bounded reason. It is prohibited while `active_draft_revision_id` is non-null and returns an explicit `ACTIVE_DRAFT_CONFLICT`. The command never deletes, finalises, abandons or works around a draft.

Archiving removes the aggregate from normal operational lists but preserves every FINAL revision, pointer, snapshot, audit and outbox record. Hard deletion and revision voiding are outside Phase 1.

## 6. Calculation contract `FINANCIAL_ACTUAL_V1`

### 6.1 Numeric domains

- Financial inputs and results use PostgreSQL `numeric`; binary floating point is never authoritative.
- Money and monetary results use bounded decimal strings at API boundaries and `numeric(19,4)` internally.
- Rates and unit costs use bounded decimal strings at API boundaries and `numeric(19,6)` internally; a rate is not rounded to currency precision before extension.
- Quantities and areas use `numeric(18,6)`; area unit is hectare in V1.
- Hours use `numeric(10,4)`.
- Currency metadata uses supported ISO 4217 codes. AUD uses two minor-unit decimal places.
- API inputs reject numbers encoded as JSON floating-point values for authoritative decimal fields; canonical decimal strings are required.
- Empty strings, NaN, infinity, exponent notation, negative values, excessive scale and excessive precision fail closed.

### 6.2 Rounding

V1 uses `ROUND_HALF_AWAY_FROM_ZERO`, matching PostgreSQL `round(numeric, scale)`. For Phase 1 non-negative financial values this is conventional half-up behaviour. The mode is defined for future signed types but negative financial values remain prohibited.

Rounding stages are exact:

1. Accepted quantities, hours, areas and rates retain their validated scale; they are not prematurely rounded.
2. Each calculated revenue basis and each cost-line extension (`quantity × unitCost`) is calculated with exact `numeric` multiplication and rounded once to the currency's minor-unit scale.
3. Manual revenue and explicit line amounts must already conform to the currency minor-unit scale.
4. Category totals sum the already rounded line amounts without re-evaluating line arithmetic.
5. Total cost sums category totals; gross profit subtracts total cost from revenue. Both therefore remain exact minor-unit values.
6. Effective hourly revenue divides the final minor-unit revenue by unrounded validated total hours, then rounds to the currency minor-unit scale.
7. Gross margin divides exact minor-unit gross profit by exact minor-unit revenue, multiplies by 100 and rounds to four decimal percentage points. It is presented to one decimal by default without changing the frozen four-decimal result.
8. `grossMarginPercent` is null when revenue is zero. `effectiveHourlyRevenue` is null when total hours are zero.

Examples for AUD:

- `1 × 1.0050` becomes `$1.01`.
- `3 × 0.333333` produces exact `0.999999`, then becomes `$1.00`.
- Three separately extended lines of `1 × 0.3350` each become `$0.34`; their category total is `$1.02`, not `$1.01` from recomputing the aggregate multiplication.
- A future explicitly governed `-1.0050` would round to `-$1.01`; Phase 1 rejects that input before calculation.

The TypeScript preview calculator must use decimal-string/integer arithmetic implementing the same mode and stages; JavaScript `number`, `Math.round` and locale-formatted strings cannot establish authority. Shared fixtures execute against both TypeScript and PostgreSQL, including half-cent boundaries, repeating decimals, maximum supported scale and null-result divisions.

### 6.3 Formulas

- `operationalDays = count(distinct workDate where actualWorkHours > 0)`
- `totalHours = sum(actualWorkHours)` at validated hours precision
- `hourlyBaseRevenue = round(hourlyRate × totalHours, currencyMinorUnits)`
- `areaBaseRevenue = round(ratePerHectare × actualHectares, currencyMinorUnits)`
- `effectiveRevenue = governed manual revenue/override when present, otherwise the selected method's base revenue`
- `lineAmount = round(quantity × unitCost, currencyMinorUnits)`
- `categoryTotal = sum(lineAmount for category)`
- `totalCost = sum(categoryTotal)`
- `grossProfit = effectiveRevenue − totalCost`
- `grossMarginPercent = round(grossProfit ÷ effectiveRevenue × 100, 4)` when revenue is non-zero, otherwise null
- `effectiveHourlyRevenue = round(effectiveRevenue ÷ totalHours, currencyMinorUnits)` when hours are non-zero, otherwise null

The selected start/end range remains separate from `operationalDays`. Elapsed calendar days are not part of V1. Costs incurred on zero-work dates remain valid.

Quote variance is unavailable in V1 because no authoritative immutable Quote version exists.

## 7. Operational prefill and source drift

A checked prefill query requires `financial_actuals.create` or `financial_actuals.update`, exact organisation, actor, Base and completed Mission identity. It returns only authorised facts and exact source versions:

- Mission, Job and Mission completion identities/versions;
- actual treated area;
- authoritative work timestamps/dates where available;
- actual product identities and quantities;
- Aircraft, Equipment Kit and Personnel identities;
- source timestamps; and
- a bounded source-manifest digest.

It never supplies inferred wages, purchase prices, Aircraft rates, equipment costs or other financial valuations.

Prefill is explicit: the operator reviews and accepts facts into the draft. Refresh does not silently overwrite manual work. A manual override requires provenance and a governed reason where the original operational fact exists.

Finalisation freezes source versions. Later operational correction cannot mutate a FINAL revision. A read may compare the frozen manifest with currently authoritative source versions and report `SOURCE_CHANGED_SINCE_FINALISATION` without exposing changed payloads or modifying financial evidence. Responding to drift requires creating a correction draft.

## 8. Quote boundary

Phase 1 implements option C:

- browser-local Quotes are not imported or trusted;
- no authoritative comparison, quoted margin or variance is displayed;
- no fabricated comparison replaces missing authority; and
- the schema reserves a nullable future `quote_id`/`quote_version_id` boundary, but Phase 1 commands require both to be null.

When Quote productisation supplies immutable Quote versions, a later reviewed migration may permit exact version references and freeze the compared Quote evidence. Later Quote revisions must not rewrite a Financial Actual revision.

## 9. Permissions and actor authority

The minimum permissions are:

- `financial_actuals.read`
- `financial_actuals.create`
- `financial_actuals.update`
- `financial_actuals.finalise`
- `financial_actuals.archive`
- `financial_actuals.export`

Organisation admin roles receive these permissions during provisioning. A `contractor` role name alone grants none. Other organisation roles receive permissions only through governed role-permission assignment. Maturity never grants permission.

Delegated Platform support remains constrained by the established Assisted Support session and audit architecture. It does not gain an unscoped Financial bypass.

## 10. Security, RLS and data access

- All tables carry `organisation_id`, enable and force RLS, and use composite tenant foreign keys.
- `anon` and `authenticated` receive no direct table DML.
- Trusted server reads and commands use fixed-search-path SECURITY DEFINER functions with execute grants only to `service_role`.
- Every externally callable function accepts trusted context organisation and actor IDs and independently verifies membership, permission and current Base assignment.
- Reads filter by tenant, permission, assigned Base and archive state.
- Mutations re-resolve relational identities; caller-provided snapshots are never trusted.
- Error responses use bounded public codes/messages/correlation IDs and never echo financial payloads or credentials.
- Logs and artefacts omit full financial snapshots unless a separately governed evidence path explicitly requires them.
- Sensitive values are not cached in browser localStorage, sessionStorage or generic shared-store APIs.

## 11. Audit and transactional outbox

Commands write audit and outbox records in the same transaction as the domain change.

Audit events include:

- `financial_actual.created`
- `financial_actual.draft_updated`
- `financial_actual.revision_finalised`
- `financial_actual.correction_created`
- `financial_actual.current_revision_advanced`
- `financial_actual.archived`

Audit evidence identifies aggregate, revision, versions, actor, Base, formula version, source-manifest/input digests and correction/archive reasons where applicable. It does not copy unrestricted financial payloads.

Outbox topics use the same lifecycle boundaries and contain minimum downstream identity/version metadata. No Phase 1 consumer may mutate or reinterpret frozen results.

## 12. Server and browser API contract

The server exposes `/api/v1/financial-actuals` through the established trusted request context.

| Method/action | Permission | Result |
|---|---|---|
| `GET` list | `financial_actuals.read` | Bounded Base-scoped page of aggregate/current-final/draft summaries |
| `GET` exact | `financial_actuals.read` | Exact aggregate and permitted revision detail |
| `GET action=prefill` | create or update | Bounded authoritative operational facts and source manifest |
| `POST action=create` | create | Aggregate plus revision 1 DRAFT |
| `POST action=update-draft` | update | Versioned draft mutation and deterministic preview |
| `POST action=create-correction` | update | New DRAFT seeded from current FINAL |
| `POST action=finalise` | finalise | Atomic FINAL revision and pointer advancement |
| `POST action=archive` | archive | Aggregate archive or active-draft conflict |
| `GET action=export` | export | Phase 1 fails closed as not yet authoritative-enabled |

List endpoints use bounded keyset pagination, not unbounded offset enumeration. Browser decoders validate exact response shapes and fail the whole response on malformed financial evidence. Decimal values remain canonical strings across the wire.

No endpoint accepts or returns browser-local quote records. No failure falls back to local persistence.

## 13. UI adaptation

The existing Financial list, creation, detail and P&L concepts remain the starting point. The adapted workflow uses progressive sections:

1. Overview and authoritative links
2. Revenue
3. Labour
4. Products
5. Aircraft and Equipment
6. Travel
7. Other Costs
8. P&L
9. Plan/Quote Comparison — unavailable until authoritative Quote authority exists

The UI shows only authoritative or explicitly labelled draft values. It removes fabricated quoted margin and heuristic compliance score. List/detail surfaces show stable reference, revision, lifecycle, revenue, total cost, gross profit, margin when defined and proven source-drift attention.

Draft previews are clearly non-final. A FINAL revision cannot expose edit controls. Correction begins a separate draft while the prior final remains the default authoritative view. Archive is disabled with an explicit conflict while a draft exists.

The module remains behind the current `COMING_SOON` surface throughout Phase 1, so runtime APIs must not be mounted or invoked from that surface during external use.

## 14. Export boundary

The existing summary/full P&L PDF concept is preserved but not promoted in Phase 1. An authoritative export later requires:

- server-authoritative source revision;
- stable Financial Actual reference and exact revision number;
- lifecycle/finalisation timestamp;
- calculation version and currency;
- source/input digest;
- deterministic equality with the frozen calculation snapshot;
- export actor/time and audit provenance; and
- cross-tenant/Base denial tests.

Historical FINAL exports must be reproducible from their frozen revision without recalculating under a newer formula version.

## 15. Testing strategy

### 15.1 Database and authority

Behavioral PostgreSQL tests prove:

- exact tenant and hierarchy relationships;
- cross-tenant and cross-Base denial;
- missing-permission denial for each command;
- admin provisioning without role-name bypass for contractors;
- one active draft under concurrency;
- stale aggregate/draft conflict;
- immutable FINAL revision and child evidence;
- correction seeding and predecessor evidence;
- current FINAL pointer remaining unchanged during correction drafting;
- atomic finalisation and pointer advancement;
- finalisation rollback when any snapshot/audit/outbox step fails;
- archive denial with an active draft;
- archive preservation of FINAL evidence;
- forced RLS and least execute/table privileges; and
- no hard-delete authority.

### 15.2 Calculation and numeric safety

Shared PostgreSQL/TypeScript fixtures prove every V1 formula and exact parity for:

- zero-work and mixed-work dates;
- half-cent values including `1.0050`;
- repeating decimals;
- line-level versus aggregate rounding;
- maximum accepted precision/scale;
- zero revenue and zero hours null semantics;
- manual revenue provenance/override precedence;
- currency minor-unit behavior;
- negative, exponent, NaN, infinity and oversized numeric rejection; and
- the defined future negative rounding mode while Phase 1 signed input remains rejected.

### 15.3 Operational provenance

Tests prove exact completed-Mission prefill, source versions, explicit acceptance, original/effective override retention, source drift detection, no silent FINAL mutation and no inferred financial cost.

### 15.4 API and browser

Tests prove bounded pagination, safe diagnostics, second-session persistence, malformed-response rejection, no localStorage access/fallback, one command per action, accessible draft/final/correction states, responsive progressive disclosure and equivalent Chromium/WebKit behavior.

### 15.5 Regression and governance

Required gates include focused authority/calculation/API/UI suites, full deterministic regression, Product Maturity verification, production build, secret/log scans, Chromium/WebKit acceptance and independent authority review.

## 16. Product Maturity promotion evidence

Phase 1 leaves all Financial entries `COMING_SOON`. A later promotion request requires at minimum:

- cross-tenant, Base and financial-role denial evidence;
- genuine record create, reopen, update, finalise and correction acceptance;
- second-session persistence and stale-write evidence;
- immutable FINAL and archive evidence;
- calculation parity and malicious numeric evidence;
- audit/outbox evidence;
- authoritative operational prefill and override provenance evidence;
- no browser-local fallback proof;
- genuine persisted margin review;
- authoritative export evidence before export promotion;
- private beta operational use; and
- separate Product Owner/Founder promotion approval.

Quote comparison remains unavailable until the Quote authority workstream supplies immutable Quote versions and its own promotion evidence.

## 17. Implementation slicing

After specification approval, implementation should proceed in independently reviewed slices:

1. Schema, permissions, RLS, lifecycle and behavioral database tests.
2. Deterministic V1 calculation contract and PostgreSQL/TypeScript parity.
3. Trusted server repository/API and browser contract.
4. Operational prefill and provenance/source-drift handling.
5. Progressive Financial UX adaptation with synthetic metrics removed.
6. Export-authority preparation and complete acceptance evidence, without Product Maturity promotion.

Production migration, deployment and Product Maturity promotion remain separate approvals.

## 18. Resolved decisions

- Hybrid relational authority is approved.
- Stable aggregate identity with immutable numbered revisions is approved.
- Current FINAL, not latest revision, is authoritative.
- Correction uses a new draft and never reopens FINAL.
- One active draft is enforced.
- Archive with an active draft is prohibited.
- `operationalDays` counts distinct dates with work hours greater than zero.
- Gross margin and effective hourly revenue use null for undefined divisions.
- V1 uses exact `ROUND_HALF_AWAY_FROM_ZERO` at the specified stages.
- Manual revenue remains permitted with source-preserving provenance.
- Typed cost lines include governed miscellaneous costs.
- Quote option C is approved.
- No browser-local migration/fallback is permitted.
- Financial Product Maturity remains `COMING_SOON`.

There are no unresolved decisions required to write the Phase 1 implementation plan. Production migration timing, Product Maturity promotion and future Quote/Fleet cost integrations remain separately governed actions rather than design ambiguities.
