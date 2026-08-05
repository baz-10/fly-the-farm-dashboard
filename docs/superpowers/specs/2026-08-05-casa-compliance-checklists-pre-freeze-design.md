# Spray Command Final Pre-Freeze Cleanup Design

**Status:** Proposed for Product Owner review  
**Date:** 5 August 2026  
**Scope:** CASA Compliance, Personnel credentials, Checklist Builder, and navigation  
**Implementation authority:** The approved Product Owner directives dated 5 August 2026

## 1. Outcome

This change creates an authoritative, tenant-scoped Australian CASA Compliance workspace without duplicating Personnel, Aircraft, Missions, files, permissions, audit, or outbox infrastructure. It also adds a dedicated versioned Checklist Builder and reorganises navigation around operational work.

The implementation must preserve all existing public APIs and URLs unless a new endpoint is required. The existing `/jobs` route and Job domain remain unchanged; only the primary navigation label becomes **Clients**.

## 2. Discovery findings

### Retain and extend

- `personnel`, `personnel_credentials`, `personnel_evidence`, Personnel operating-location scope, identity links, and immutable Mission Personnel snapshots are authoritative and reusable.
- Aircraft, Mission maps, weather, JSA, authorisation, operational closeout, outcomes, reports, audit events, and transactional outbox are authoritative production resources.
- Internal file IDs, file versions, SHA-256 checksums, storage provenance, and immutable report artefacts already establish the correct file boundary.
- Organisation permissions and role assignments already provide the tenant permission pattern.
- Mission readiness already returns precise blockers, warnings, grouped categories, outstanding sections, and completed sections.

### Correct or replace at the implementation boundary

- Current `/compliance/*` pages are legacy feature screens and several depend on browser/local stores. They are not an authoritative compliance system and must not become the source of truth.
- The current Personnel credential editor requires an expiry date and automatically submits `verified`. That is incompatible with non-expiring RePL credentials and evidence-based verification.
- Personnel credentials do not yet model ARN, categories/ratings, explicit non-expiring state, verification evidence/version history, review due dates, or mission eligibility detail.
- Navigation is a flat list and does not provide the approved operational accordion groups.
- No authoritative checklist template, publication, execution, sign-off, or readiness subsystem currently exists.
- There is no general authoritative renewal engine covering CASA certificates, Personnel credentials, controlled documents, permissions, and checklist review dates.

### Do not reuse

- Operational Events must not be repurposed as compliance evidence.
- JSA templates must not be repurposed as a generic checklist builder. JSA remains its own safety evidence stream.
- A generic evidence ledger is rejected because it weakens domain meaning, validation, permissions, and retention semantics.

## 3. Regulatory baseline for the Australian pack

The Australian country pack will contain versioned rules with source name, source URL, jurisdiction, effective date, review date, and rule version.

- CASA states that an initial ReOC is valid for 12 months and renewals are valid for up to three years. Online renewal is available within three months of expiry, and an expired ReOC cannot be renewed.
- CASA states that a RePL does not expire.
- CASA's Part 101 record-keeping guidance identifies seven-year retention for Chief Remote Pilot duty records, operational release, operational logs, remote pilot logs, technical logs, and relevant crew qualification/competency records. The precise retention start event varies by record class and must be retained as a rule attribute rather than one global deletion date.
- ReOC operations require documented procedures/manuals, trained remote pilots, operational records, and registered aircraft.

The platform will not infer an AROC expiry. It records an expiry only where the authoritative certificate or evidence provides one; otherwise it displays **No expiry recorded** and uses evidence/verification status rather than inventing a date.

## 4. Selected architecture

### Recommended: dedicated bounded contexts with authoritative references

Create two related bounded contexts:

1. **CASA Compliance** owns Australian certificate, controlled-document, approval, training, renewal, regulatory-rule, and compliance-evidence records.
2. **Checklists** owns reusable template catalogues, immutable published versions, rule-driven selection, executions, sign-offs, and execution evidence.

Both reference existing Personnel, Aircraft, Missions, operating locations, internal files, audit, and outbox records by ID. They do not copy those entities.

This approach preserves domain meaning, makes RLS and permissions explicit, and supports later country packs without contaminating Australian rules.

### Rejected alternatives

- **Extend legacy compliance screens in place:** rejected because local/browser persistence and mixed concerns would undermine authoritative evidence.
- **One generic compliance/evidence ledger:** rejected because certificate, controlled-document, checklist, and Mission evidence have different lifecycle, validation, permission, and retention rules.

## 5. Domain model

### 5.1 Country compliance packs

`compliance_country_packs`

- stable code, name, jurisdiction, version, effective dates, status
- repository-controlled Australian seed data
- future international packs may be added without changing tenant records

`compliance_regulatory_rules`

- stable rule code and version
- source title, URL, jurisdiction, reference, effective/review dates
- record class, retention duration and retention-start event
- warning thresholds and applicability conditions
- immutable published versions

### 5.2 Organisation compliance profile

`organisation_compliance_profiles`

- organisation and active country-pack version
- authoritative ReOC holder identity and organisation ARN where applicable
- policy settings and row version

No compliance profile may grant cross-tenant access.

### 5.3 Certificates, approvals, and permissions

`organisation_compliance_instruments`

- instrument type: ReOC, permission, approval, exemption, authorisation, or extensible catalogue value
- number, issuer, issue/expiry dates, status, conditions, scope, source references
- version chain and supersession link
- internal evidence file references
- review and renewal state

ReOC warnings default to 90/60/30/14/7 days and expired. Thresholds are organisation-policy values initialised by the Australian pack.

### 5.4 Controlled documents

`controlled_documents` and immutable `controlled_document_versions`

- Operations Manual and future controlled document types
- version, effective date, approval state, approving Personnel snapshot
- internal file ID/version/checksum/provenance
- supersession, acknowledgement, distribution, review due date
- historical versions never overwritten

### 5.5 Personnel extension

Extend the existing Personnel aggregate rather than creating a CASA person.

- ARN becomes an authoritative Personnel identifier.
- Extend credentials with lifecycle type (`NON_EXPIRING`, `EXPIRING`, `EVIDENCE_DRIVEN`), review date, categories/ratings, conditions, verification evidence, verification actor/time, and supersession.
- RePL uses `NON_EXPIRING` and supports `CURRENT`, `SUSPENDED`, `CANCELLED`, `SUPERSEDED`, and `UNVERIFIED`. An expiry is neither required nor fabricated.
- AROC uses `EVIDENCE_DRIVEN`; expiry is optional and its absence renders **No expiry recorded**.
- Other credentials may be expiring or non-expiring and remain versioned.
- Mission eligibility uses the credential version and evidence state current at the planned operation time, returning exact reasons for ineligibility.
- Existing Mission Personnel snapshots remain immutable; later credential changes never rewrite Mission history.

### 5.6 Aircraft compliance

Reference existing authoritative Aircraft records and add versioned compliance instruments/evidence for:

- CASA registration and registration evidence
- technical log and serviceability evidence
- maintenance schedule/status references
- approved configuration, weight/category, conditions, and relevant permissions

No second Aircraft table is introduced.

### 5.7 Training and operational records index

Training records reference existing Personnel and credentials, with course/version, dates, outcomes, instructor, participants, evidence, and retention rule.

The operational records index references authoritative Mission evidence and reports. It does not copy Mission content. It provides regulator-oriented discovery by record class, Mission, date, Personnel, Aircraft, retention state, and evidence availability.

### 5.8 Renewals

A shared renewal subsystem tracks renewable instruments and reviewable records:

- source entity type and ID
- due/expiry date or review date
- policy thresholds
- current state and acknowledgement
- assignee, reminders, completion and superseding record
- audit/outbox and notification references

Non-expiring credentials do not enter expiry reminders. Evidence-driven credentials may have review reminders without an invented expiry.

### 5.9 Checklist Builder

`checklist_catalogues`

- platform templates and organisation-owned templates remain distinguishable
- organisation templates are tenant scoped; platform templates are copied or referenced through an explicit versioned adoption record

`checklist_templates` and immutable `checklist_template_versions`

- draft versions may be edited
- published versions are immutable
- title, purpose, lifecycle stage, jurisdiction, applicability rules, review due date, status
- version-controlled item definitions and rule configuration

`checklist_items`

- acknowledgement, yes/no, pass/fail, text, number, date/time, single/multi select, Personnel, Aircraft, Equipment, file/photo, signature, instruction, and section
- required state, help text, evidence requirement, conditional visibility, blocker/warning semantics

`mission_checklist_requirements`

- rule-selected checklist version for one Mission and lifecycle stage
- selection reason and rule version
- the selected version never changes silently when a template is republished

`checklist_executions`, immutable `checklist_execution_revisions`, answers, evidence, and sign-offs

- drafts are resumable
- submission produces immutable evidence
- correction is a new linked execution/revision that supersedes the earlier execution without deleting it
- completed evidence retains exact template/item versions, actor/Personnel snapshots, timestamps, attachments, and signatures

Sign-off policy is organisation-configurable and initially supports self-sign-off, separate reviewer, dual approval, and risk/rule-driven approval without redesign.

## 6. Mission lifecycle and readiness

Checklists attach to the approved Mission lifecycle stages: Planning, Pre-flight, Operational, Completion, and Post-Mission.

- Applicability rules automatically select required checklists from Mission facts, aircraft, equipment, chemicals, operation type, location, jurisdiction, and organisation policy.
- Operators see only applicable checklists and the reason each was selected.
- Mission readiness receives checklist blockers and warnings through a stable adapter.
- Every blocker identifies checklist, section/item, required action, and policy/rule source.
- Authorisation and completion snapshots reference exact submitted checklist executions and sign-offs.
- Later checklist versions or corrections never rewrite authorised or completed Mission history.

## 7. Permissions

CASA permissions will be explicit and least privilege, including separate read, manage, verify, publish/approve, export, and restricted-document access where required.

Checklist permissions are exactly:

- `compliance.checklists.read`
- `compliance.checklists.create`
- `compliance.checklists.manage`
- `compliance.checklists.publish`
- `compliance.checklists.complete`
- `compliance.checklists.review`

The Administrator role may receive these through normal role provisioning. No user identity or email is hard-coded. Server-authoritative permission checks and PostgreSQL RLS both enforce tenant scope and operating-location/Mission scope where applicable.

## 8. Navigation and user experience

Replace the flat navigation presentation with responsive accordion groups while preserving routes:

- **HOME**
- **CLIENTS** — Clients (existing `/jobs` route and Job hierarchy)
- **OPERATIONS** — Missions, scheduling and operational workflows
- **FLEET** — Aircraft, Equipment Kits, Fleet
- **PEOPLE** — Personnel
- **COMPLIANCE** — CASA Compliance, Checklists, JSA and relevant compliance tools
- **INTELLIGENCE**
- **REPORTS**
- **ORGANISATION** — settings and organisation administration

Rules:

- Active group and active item are visually apparent.
- Desktop, tablet, mobile drawer, keyboard navigation, focus order, and accessible names are regression tested.
- One user-facing **Checklists** entry opens a workspace with internal tabs rather than separate menu items for every checklist state.
- Personnel visibly separates Identity, Roles, Licences, Qualifications, Evidence, and Mission Eligibility.
- CASA Compliance is a workspace, not a collection of disconnected cards.

## 9. APIs and event boundaries

Keep the public `/api/v1/*` dispatcher. Add thin transport handlers for compliance, credentials, renewals, controlled documents, and checklists. Business rules remain in application/domain services and repository-controlled SQL commands.

All writes:

- validate tenant, location, permission, version, and referenced authoritative record
- use optimistic concurrency
- atomically create audit and transactional outbox events
- fail without partial authoritative records
- never use browser/local persistence as fallback

Suggested event families:

- `compliance.instrument.*`
- `compliance.document.*`
- `compliance.credential.*`
- `compliance.renewal.*`
- `compliance.checklist.template.*`
- `compliance.checklist.execution.*`

## 10. Compliance pack export

The CASA Compliance Pack is a generated indexed report artefact using the shared report architecture. It contains an evidence manifest, source record IDs/versions, checksums, retention metadata, gaps, generation timestamp, organisation branding, and **Generated by Spray Command**. It does not mutate or duplicate source evidence.

## 11. Migration and compatibility

- Repository-controlled SQL only; RLS remains enabled and forced.
- Preserve existing Personnel, Aircraft, Mission, approval, report, and file IDs.
- Additive columns/tables and deterministic backfill only.
- Existing RePL credentials with expiry dates are not silently rewritten; migration flags them for review while the UI no longer requires expiry.
- Existing `verified` credentials without verification evidence remain visible but are marked for evidence review according to a migration report; no silent downgrading that would unexpectedly block live Missions.
- Legacy compliance pages remain available behind an explicit historical/legacy boundary until their authoritative replacement is accepted; no new writes should extend their local persistence.
- No existing historical Mission snapshot is recalculated.

## 12. Security and retention

- Complete tenant isolation via trusted-server authorisation plus RLS.
- Restricted Personnel and controlled-document evidence requires explicit permission.
- Internal file IDs only; provider keys and URLs never become durable domain identifiers.
- Retention is rule-based, record-class specific, legal-hold aware, and defaults to no destructive automatic deletion.
- Seven-year rules preserve their correct start event (record date, last operation, or employment cessation as applicable).
- Exports are auditable artefacts and do not bypass access classification.

## 13. Acceptance boundary

The cleanup is operational only when:

1. An Australian organisation can maintain ReOC, manual, approvals, Personnel credentials, Aircraft compliance, training and renewal evidence authoritatively.
2. RePL can be verified without an expiry and renders non-expiring correctly.
3. AROC can be retained with or without evidence-backed expiry.
4. Mission PIC eligibility explains exact licence, rating, verification, status, scope, or evidence blockers.
5. A published checklist version is immutable and a new version does not alter earlier executions.
6. Mission rules select applicable checklists and precise readiness blockers.
7. An operator can resume a draft, submit immutable execution evidence, sign off under policy, and correct only through linked supersession.
8. Checklist evidence survives refresh, re-login, and a second authorised session.
9. Tenant and operating-location isolation, optimistic concurrency, audit, outbox, and notifications are proven.
10. CASA Compliance Pack export is indexed, checksummed, branded, and reproducible.
11. Navigation is grouped, responsive, accessible, and the Clients label preserves all existing Job routes and domain behaviour.
12. No local or legacy persistence fallback occurs.

## 14. Implementation sequence after approval

1. Navigation restructure and label correction.
2. Personnel credential lifecycle and evidence correction.
3. CASA country pack, compliance profile, ReOC and controlled documents.
4. Approvals, Aircraft compliance, training, operational records index and renewals.
5. Checklist Builder schema, templates, rules, execution and sign-off.
6. Mission readiness/authorisation/completion integration.
7. CASA Compliance Pack export.
8. Full local, deployed, RLS, migration, retention and cross-session acceptance.

Architecture freeze occurs only after this accepted cleanup is deployed and proven operational.

## 15. Primary sources

- CASA, *Record keeping*: https://www.casa.gov.au/drones/remotely-piloted-aircraft-operators-certificate/record-keeping
- CASA, *Renew your ReOC*: https://www.casa.gov.au/drones/remotely-piloted-aircraft-operators-certificate/renew-your-reoc
- CASA, *Get your remote pilot licence*: https://www.casa.gov.au/drones/remote-pilot-licence/get-your-remote-pilot-licence
- CASA, *Get your ReOC*: https://www.casa.gov.au/drones/remotely-piloted-aircraft-operators-certificate/get-your-reoc
- Federal Register of Legislation, *Part 101 (Unmanned Aircraft and Rockets) Manual of Standards 2019*: https://www.legislation.gov.au/F2019L00593/latest

