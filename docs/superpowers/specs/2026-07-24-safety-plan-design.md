# Optional Job Safety Plan Design

**Status:** Approved design
**Date:** 24 July 2026
**Initial jurisdiction:** Australia — CASA/ReOC aligned

## Purpose

Add an optional, job-level Safety Plan that helps agricultural drone operators
prepare, control, approve, acknowledge, retain, print and export a consolidated
safety record.

The Safety Plan complements existing JSAs and Risk Assessments. Its absence,
draft status, missing acknowledgements or approval status must never block
mission authorisation.

## Regulatory position

CASA does not prescribe a single form called a “Safety Plan”. The platform
template is therefore described as **CASA/ReOC aligned**, never
“CASA approved”.

The initial template and record controls are informed by:

- CASA Part 101 operational guidance and the RPAS sample operations manual;
- CASA ReOC record-keeping guidance, including seven-year retention of Chief
  Remote Pilot operational records such as JSAs, risk-management plans and
  operational flight plans;
- the operator’s responsibility to maintain and follow documented procedures.

Primary references:

- <https://www.casa.gov.au/drones/remotely-piloted-aircraft-operators-certificate/record-keeping>
- <https://www.casa.gov.au/drones/remotely-piloted-aircraft-operators-certificate/get-your-reoc>
- <https://www.casa.gov.au/resources-and-education/publications/guidance-material/industry-compliance-templates?page=2>
- <https://www.legislation.gov.au/F2019L00593/latest/text>

The product must display a plain-language disclaimer that the plan supports,
but does not replace, the operator’s approved manuals, legal obligations,
authorisations or professional judgement.

## Product approach

Use a guided, integrated workflow rather than a long document form or a full
Safety Management System.

The platform supplies a protected standard template. Each tenant creates an
editable company master from that standard. A user may then deliberately
create a job-specific plan from either the relevant Job or the Compliance
area.

The guided plan has five steps:

1. Job details
2. People and assets
3. Hazards and controls
4. Emergency planning
5. Review and submit

A persistent readiness summary shows completed, attention and optional items.
The workflow must be efficient on desktop, tablet and phone.

## Scope and non-blocking rule

- Safety Plans are optional at job level.
- One plan may cover all missions linked to that job.
- Creating a plan is a deliberate user action.
- A missing Safety Plan never blocks mission planning, authorisation,
  commencement or completion.
- A plan’s missing crew acknowledgements appear as attention items only.
- If a plan is submitted for approval, approval may be prevented by unresolved
  fields that the company template marks as required. This affects only the
  plan, never the linked missions.

Plan statuses are:

- Not required
- Draft
- Submitted
- Approved
- Superseded

“Not required” records who selected it, when, and an optional reason. A plan
may still be created later.

## Standard template content

The initial platform standard includes:

1. Plan identity, scope and controlled version
2. Company responsibilities and nominated operational authority
3. Job, client, property, location and operating dates
4. Crew, roles and acknowledgements
5. Aircraft, vehicles, trailers, equipment kits and support equipment
6. Chemicals, payloads, SDS references and hazardous substances
7. Site access, public protection, signage and exclusion areas
8. Airspace, weather and operational constraints
9. Consolidated JSA hazards, risk scores, mitigations and controls
10. Communications, command structure and lost-contact procedures
11. Emergency response, incident and fire procedures
12. First aid, spill response and environmental protection
13. Attachments and supporting evidence
14. Submission, approval, revision history and acknowledgements

The content model must support future jurisdiction modules without changing
historical Australian plans.

## Master template control

- The platform standard is protected and versioned.
- Company administrators clone it into a tenant-owned master.
- Company administrators may edit wording, sections, help text, optionality and
  required fields.
- Platform updates never overwrite a tenant master.
- Administrators may compare a later platform standard and selectively adopt
  sections.
- Every job plan records an immutable snapshot of the company-master version
  used to create it.
- Editing the current company master never changes existing job plans.

## Prefill and source synchronisation

Creating a job plan pre-fills available:

- tenant and company details;
- job, client, property, field, address and operating dates;
- assigned PIC, crew and roles;
- linked missions;
- aircraft, vehicles, trailers, kits and support assets;
- chemicals, quantities and SDS references;
- site map and operational notes;
- emergency contacts.

The system consolidates hazards and controls from every linked mission’s JSA
and Risk Assessment. Each imported item keeps its source mission and source
record identifier.

If source data changes after creation:

- the plan shows “Source data changed”;
- the user can review differences before refreshing;
- refresh never silently overwrites company-authored notes or controls;
- conflicts are resolved item by item;
- the approved version remains unchanged until a new version is approved.

The stored plan snapshot, not mutable live source data, is used for approval
and PDF output.

## Roles and permissions

### Company administrator

- manages the company master;
- nominates operational authorities;
- creates, edits, submits, approves and supersedes plans;
- views all versions, acknowledgements and audit events;
- restores recoverable drafts.

### Nominated operational authority

- reviews, approves and supersedes job plans;
- cannot change tenant ownership or platform-level settings.

### PIC and crew

- view assigned plans;
- complete permitted sections;
- add notes and attachments;
- submit a draft when permitted;
- record “Read and acknowledged”.

They cannot approve, delete or directly alter an approved version.

### Client

Clients receive no access by default. A company may explicitly share an
approved read-only copy or PDF.

### Platform support

Platform support may manage user accounts and password resets but cannot read
tenant Safety Plan contents, attachments or audit records.

All read and write operations enforce tenant ownership server-side. Hiding UI
controls is not an access-control mechanism.

## Approval, locking and revisions

Only a company administrator or nominated operational authority can approve.

Approval:

- records approver, role, UTC timestamp and displayed local time;
- locks the plan snapshot and attachments manifest;
- assigns a human-readable version;
- records a tamper-evident content digest;
- produces an approved PDF snapshot.

Approved plans are immutable. Selecting “Revise” creates a new draft from the
approved version. Approval of the revision supersedes, but never deletes, the
previous version.

Approved and superseded versions cannot be deleted. Draft deletion is
recoverable by company administrators and is recorded in the audit trail.

## Crew acknowledgements

Assigned PICs and crew can acknowledge an approved or submitted plan.
Acknowledgement records:

- user and assigned role;
- plan version;
- date and time;
- acknowledgement statement;
- later withdrawal or replacement, if applicable.

Missing acknowledgements create attention indicators only and never block a
mission.

## Attachments

Plans may reference or attach:

- photos;
- maps and diagrams;
- CASA or airspace approvals;
- SDS documents;
- emergency information;
- client documents;
- other supporting PDFs.

Each attachment stores tenant, uploader, timestamp, content type, size, digest,
source, description and version association. Failed uploads are retryable and
must not damage the saved plan.

## PDF, printing and job records

Users with plan access can preview and print. Approved PDFs include:

- company and job identity;
- plan version and status;
- all approved section content;
- linked source missions;
- JSA and Risk Assessment references;
- approval and acknowledgement details;
- revision history;
- attachment manifest;
- CASA-aligned/not-CASA-approved notice.

The PDF is generated from the approved snapshot. It can be downloaded, printed
and saved against the Job’s document record. PDF failure is retryable and
cannot change plan approval state.

## Audit and retention

Material events record tenant, plan, version, actor, role, UTC timestamp,
action and relevant before/after metadata.

Events include creation, source refresh, field changes, attachment changes,
submission, return to draft, approval, acknowledgement, revision, supersession,
sharing, PDF generation and recoverable draft deletion.

Approved and superseded operational records carry a minimum seven-year
retention-until date. Retention policy metadata must allow a longer company or
jurisdiction requirement later.

## Failure and conflict handling

- Drafts autosave and show the last confirmed save time.
- Offline or failed saves remain visibly pending and retry safely.
- Stale edits are rejected with a comparison rather than overwriting a newer
  version.
- Source refresh conflicts require explicit user resolution.
- Permission failures return a clear access message without leaking record
  existence across tenants.
- Attachment and PDF failures never roll back valid plan data.
- Partial plan data remains recoverable after interrupted sessions.

## Access points

### Job

The Job displays Safety Plan status, current version, attention count and
actions to create, continue, view, acknowledge, revise, print or export.

### Compliance

Compliance includes a Safety Plans register with filters for status, job,
owner, approver, date and attention items. It also provides company-master
template management for administrators.

## Testing and release gates

Automated coverage must include:

- optional/non-blocking mission behaviour;
- tenant isolation at API and service boundaries;
- every role and approval permission;
- master snapshots and selective standard updates;
- source-data consolidation and conflict handling;
- approval immutability and version supersession;
- financial-data privacy for contractors;
- crew acknowledgements;
- seven-year retention metadata;
- attachment integrity and retry behaviour;
- deterministic approved PDF contents;
- responsive phone/tablet workflow;
- full browser flow: create, prefill, edit, submit, approve, acknowledge,
  supersede and export.

Existing mission, JSA, Risk Assessment, Job, Fleet, Maintenance and financial
privacy gates must remain green.

## Explicitly deferred

The following are not part of this Safety Plan implementation:

- a full Safety Management System;
- non-Australian jurisdiction packs;
- supplier chemical work-pack exports;
- a certification and controlled-manual register.

The certification register is the next independent design candidate. It should
store ReOC manuals, certificates, responsible owners, issue and expiry dates,
renewal reminders, attachments, archived versions and tenant-controlled access.
