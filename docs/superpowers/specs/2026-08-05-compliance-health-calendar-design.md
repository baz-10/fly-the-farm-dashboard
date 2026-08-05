# Spray Command Compliance Health and Calendar Design

**Status:** Product Owner approved 5 August 2026  
**Scope:** Additive presentation/read projections within the existing CASA Compliance bounded context  
**Requirements:** `NEW-CMP-022`, `NEW-CMP-023`, `SC-011`

## Purpose and boundaries

The Compliance Calendar gives authorised organisation users one chronological view of obligations already held in authoritative Spray Command records. The Compliance Health Score gives rapid, explainable operational awareness of those records. Neither capability owns compliance dates, status, evidence or workflow state, and neither is a legal certification.

The UI must state: “Compliance health based on records currently held in Spray Command.” It must use the bands Strong, Attention required, At risk and Critical, never the absolute conclusion “Compliant”.

## Authoritative projection architecture

`ftf_read_casa_compliance_overview` remains the organisation-scoped command-centre read boundary. A repository-controlled SQL projection derives two additions at request time:

- `healthScore`: deterministic score, status band, category breakdown, critical blockers, issue counts, model version, country-pack version, evaluation timestamp and source references.
- `calendar`: projected events plus available filter facets, derived from source records and ordered by due date.

The API continues to resolve the authenticated organisation, permissions and operating-location scope server-side. No score snapshots, calendar events, duplicated due dates or duplicated statuses are persisted for the live dashboard.

## Calendar sources and semantics

The projection includes applicable dates from ReOC renewal/expiry, organisation instruments, aircraft registration/maintenance/insurance, Operations Manual and controlled-document reviews, time-limited Personnel credentials and evidence reviews, training and competency, checklist reviews, checklist corrective actions, internal audits, renewal actions and organisation-defined compliance obligations.

Standard RePL records with `NON_EXPIRING` lifecycle never create expiry events. AROC creates an expiry event only when authoritative evidence supplies an expiry date.

Each event contains a stable derived event key, title, record type, organisation, optional operating location, due date, days remaining/overdue, state, optional responsible Personnel display value, required action, source entity type and ID, warning threshold, operational-blocking flag and evidence/renewal state. Source links use application routes and internal record IDs, never provider URLs.

Initial views are Next 90 days, Agenda, Month, Overdue, Due soon and Completed history. Filters cover record type, responsible Personnel, aircraft, operating location, status, date range and instrument/category. Filters operate on the already-authorised response and must never reveal restricted identities in unavailable records.

The calendar is read-only. Completing, acknowledging, renewing or superseding an obligation occurs through its authoritative source workflow.

## Health scoring model

Model `AU-CASA-HEALTH-1` is repository-controlled, deterministic and jurisdiction aware. It assesses these weighted categories:

| Category | Weight |
|---|---:|
| ReOC and organisation certificates | 20 |
| Operations Manual and controlled documents | 12 |
| CASA approvals and permissions | 10 |
| Personnel licences and qualifications | 15 |
| Training and competency | 8 |
| Aircraft registration and technical compliance | 15 |
| Checklist governance | 8 |
| Renewals and corrective actions | 7 |
| Required evidence integrity | 5 |

Every assessed item receives a repository-controlled factor: Current `1.00`, Due within 90 days `0.80`, Due within 30 days `0.60`, Under review `0.50`, Missing `0.00`, Expired/Overdue `0.00`, and operationally blocking `0.00`. Superseded and Not applicable items are excluded. A category earns its weight multiplied by the arithmetic mean of its applicable item factors. The returned category result includes weight, earned points, assessed/current/due-soon/missing/expired/blocking counts and authorised source references. Overall percentage is earned points divided by applicable weight; a category with no applicable items is excluded only when the underlying requirement is genuinely not applicable. A missing required baseline creates a Missing item with factor zero.

Initial bands are Strong (90–100), Attention required (75–89), At risk (50–74) and Critical (0–49). Any critical blocker forces the displayed status to Critical regardless of percentage while preserving the numeric result, for example “92% health — Critical blocker present”.

Critical rules include expired or missing-evidence ReOC, expired required approval, expired aircraft registration, unserviceable or technically overdue aircraft, missing/suspended/cancelled required pilot qualification and unresolved critical checklist corrective action. Missing authoritative baseline records are reported as insufficient evidence and contribute a visible missing-data issue; they are never treated as current.

## Historical reproducibility

Live calculations return model version, country-pack version, evaluation time, source entity IDs and row/version identifiers where available. Future exported Compliance Packs persist the calculated result and manifest they used. A later model change creates a new model version and never rewrites an exported historical result.

## Security and privacy

Existing `compliance.read` and record-specific privacy permissions apply. The trusted projection receives the current organisation and allowed operating locations. Restricted Personnel evidence and controlled-document file metadata are not returned by calendar or score drill-downs. Counts include authorised aggregate states only when they cannot identify a hidden person or document. Cross-tenant reads fail closed through server context, RLS and organisation predicates.

## Audit and events

Reading or recalculating the projections creates no audit or outbox noise. Existing authoritative commands continue to emit audit/outbox events for source changes. Future scoring-policy, threshold or organisation-policy changes require their own versioned commands and atomic audit/outbox events.

## User interface

The CASA Compliance Overview gains:

- an overall Health Score card with legal-status disclaimer, status band, critical-blocker banner, evaluation time and model version;
- category rows that expose their assessed counts and drill into contributing source records;
- a Calendar section with view switcher, filters, chronological event cards and direct authoritative-source links.

The default calendar view is Next 90 days. Critical and overdue items appear first within a date grouping. Empty states distinguish “no obligations in this range” from “insufficient authoritative evidence”. Desktop, tablet and mobile use the existing responsive card/grid system.

## Error handling

Projection failure must display an explicit unavailable state without substituting browser data, cached legacy data or a fabricated score. Unsupported filters return validation errors. Missing source routes remain visible as record references without inventing a destination. Dates are evaluated server-side against a supplied evaluation timestamp for deterministic tests and against current server time in production.

## Acceptance

Acceptance requires real Fly The Farm records to demonstrate the score, category/source drill-down, critical-blocker override, visible model version/time, Next 90 days, Month and Agenda views, automatic ReOC/manual/checklist/credential/aircraft/corrective-action events, RePL and AROC expiry semantics, authoritative links, permission/location/tenant isolation, refresh/re-login/second-session consistency and absence of duplicate or browser persistence.

The genuine ReOC, Operations Manual, Personnel credential and Checklist acceptance chain remains independent and must not be delayed or replaced by synthetic calendar or score records.
