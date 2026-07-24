# Collapsible Navigation, Safety Plans and Document Centre Design

**Date:** 24 July 2026  
**Status:** Approved for implementation planning  
**Scope:** Subscriber dashboard navigation, Compliance Safety Plans, universal PDF/save/print actions and job document retention.

## 1. Objective

Make frequent tools easier to find, provide a controlled CASA-aligned Safety Plan workflow, and give every operational record a consistent way to be exported, printed and retained against a job.

This delivery is divided into three linked releases:

1. Collapsible navigation.
2. Safety Plans.
3. Shared Document Centre and universal document actions.

The releases share permissions and document-control conventions, but each must remain independently testable and deployable.

## 2. Design principles

- Optimise for quick in-field operation on desktop, tablet and mobile.
- Keep everyday tools visible without displaying every navigation tile.
- Preserve saved documents as immutable evidence.
- Make permissions tenant-scoped and role-aware.
- Never imply that a software template is itself CASA approval or a guarantee of compliance.
- Never report a document as saved until its required file, metadata and job link are all stored.
- Reuse one document system rather than implementing inconsistent page-specific exporters.

## 3. Collapsible navigation

### 3.1 Groups and order

The navigation uses these groups:

1. **Daily operations**
   - Operations
   - Missions
   - Schedule
   - Weather
   - Jobs
2. **Operational resources**
   - Aircraft
   - Fleet & Packs
   - Maintenance
   - Database
   - Calculator
3. **Safety and compliance**
   - JSA System
   - Compliance
4. **Commercial**
   - Quotes
   - Financials
5. **Support and administration**
   - Ask FTF
   - Settings
   - Admin

Role filtering is applied before rendering. A group with no authorised child items is not shown.

### 3.2 Interaction

- Daily operations is expanded for a new user.
- All other groups are initially collapsed.
- Multiple groups can be expanded simultaneously.
- The group containing the active route opens automatically.
- Each user's expanded-group state is retained between sessions.
- A remembered preference never hides the active route.
- Group headings provide an icon, label, expanded state and accessible button semantics.
- Expanded mobile navigation uses full-width touch targets.
- The compact desktop rail remains available, but it uses the same collapsible groups as the expanded drawer. Group headings use icons and accessible tooltips instead of long labels; collapsed groups remove their child tiles from the rail.

### 3.3 Failure and fallback

If preference persistence is unavailable, navigation continues with Daily operations and the active group open. Navigation state is convenience data and must never block route access.

## 4. Safety Plans

### 4.1 Position in the product

Compliance gains a Safety Plans module. It is distinct from:

- a mission JSA;
- a risk assessment;
- an emergency response plan;
- the operator's approved manuals.

The product calls the supplied content a **CASA-aligned template**, never “CASA approved.”

### 4.2 Master template

Each subscriber can maintain a controlled company master containing:

- safety policy, objectives and management commitment;
- accountable personnel, Chief Remote Pilot, Maintenance Controller and delegated responsibilities;
- hazard reporting, safety escalation and occurrence response;
- risk methodology, risk acceptance and approval authority;
- fatigue, fitness-for-duty and human-factors controls;
- induction, competency, training and safety communication;
- aircraft, ground-support and maintenance interfaces;
- emergency, incident and notification procedures;
- document control, review intervals and revision history;
- company procedures, references and attachments.

Company administrators edit and approve master revisions. Contractors may read the current approved master but cannot approve or silently replace it.

### 4.3 Job-specific controlled copy

A job Safety Plan is created from an approved master revision and stores its own immutable source reference. It adds:

- client, property, field, job and mission references;
- scope of work and planned dates;
- responsible crew and emergency contacts;
- site hazards and linked JSA/risk controls;
- emergency assembly, primary/secondary landing and exclusion areas;
- communications, public control and signage;
- chemical, environmental and transport considerations;
- permits, authorisations and approval references;
- crew briefing acknowledgements;
- notes, attachments, approval and revision history.

Changing the master later does not alter an existing job copy. The user may explicitly create a new job-plan revision from the latest master.

### 4.4 Workflow

Statuses are:

- Draft
- Awaiting review
- Approved/current
- Superseded
- Archived

Contractors can draft and complete operational sections. A company administrator approves a plan before it becomes current. Approval records the authenticated user, role, date/time, revision and statement. Typed authenticated approval is used initially; drawn or uploaded signatures are outside this release.

### 4.5 Regulatory framing

The template structure is informed by current CASA material on ReOC procedures, Safety Management Systems for RPAS, emergency response planning and operational record retention. The operator remains responsible for aligning the plan with its ReOC, approved manuals, certificate conditions and operation.

Primary references:

- CASA, “Get your ReOC”
- CASA Safety Management System resource kit, including Booklet 9 for RPAS
- CASA Part 101 regulatory and guidance material
- CASA ReOC record-keeping guidance
- CASA Emergency Response Plan template

## 5. Shared Document Centre

### 5.1 Purpose

The Document Centre is the single platform service for generating, saving, printing, listing and revising controlled documents. Individual pages provide source data through a shared document definition; they do not implement independent persistence or PDF rules.

### 5.2 Initial document types

- Missions and mission work packs
- Weather snapshots and weather logs
- Safety Plans
- JSA and risk assessments
- Maintenance and RPAS technical logs
- Job reports and Ask FTF reports
- Quotes, job actuals and supported compliance records

The contract is extensible so later record types can be added without redesigning the job document register.

### 5.3 Document actions

Supported pages expose one consistent **Document actions** control:

- Export PDF
- Save to Job
- Print
- View saved versions

If the source record already identifies a job, that job is preselected. Otherwise, Save to Job requires the user to choose an accessible job.

### 5.4 Immutable save flow

Saving to a job is an explicit transaction:

1. Validate source record, user access and target job.
2. Capture a canonical structured snapshot.
3. Allocate document ID and revision.
4. Generate the branded PDF from the snapshot.
5. Store the immutable PDF file.
6. Store document metadata and source snapshot.
7. Link the document revision to the job register.
8. Record the audit event.
9. Report success.

A later source edit does not change an earlier saved revision. The user creates a new revision. The system keeps the lineage between revisions and the originating live record.

If any required step fails, the interface identifies the failed stage and does not claim that the document was saved. Incomplete file or metadata writes must be recoverable or marked failed for cleanup; they must not appear as valid job documents.

### 5.5 Controlled document metadata

Each saved revision records:

- tenant ID;
- document ID and revision ID;
- type, title and status;
- source record type and ID;
- job and optional mission ID;
- structured snapshot schema version;
- PDF storage reference and integrity metadata;
- created/prepared/approved users and timestamps;
- confidentiality level;
- superseded revision link;
- audit events.

### 5.6 PDF layout

All generated PDFs use a shared controlled-document frame:

- subscriber company name and logo;
- document type, title, unique ID and revision;
- linked job and mission;
- prepared-by and generated timestamps;
- record status and approval;
- page numbers;
- confidentiality and controlled-copy footer.

Document renderers supply type-specific content such as maps, weather tables, risk controls, work-pack assets, maintenance history or financial tables. Print uses the same rendered document definition as PDF so printed and stored copies are consistent.

### 5.7 Job document register

Each Job page gains a Documents area that supports:

- type, status and date filters;
- document preview and download;
- print;
- revision history;
- source-record link;
- approved/current and superseded indicators;
- tenant-authorised access only.

Documents cannot be destructively overwritten. Administrative removal, if later required, must be an auditable archive/revocation operation rather than physical deletion.

## 6. Permissions and privacy

- All document and Safety Plan data is tenant-scoped.
- Contractors may create operational snapshots for jobs they can access.
- Contractors cannot see profitability, internal financial fields or administrator-only financial documents.
- Company administrators can access all documents within their subscriber tenant and control master Safety Plan approvals.
- Platform support administrators may manage users and password resets but cannot inspect subscriber operational, document or financial content.
- Export, save, print, approval, supersession and archive events are auditable.
- Server-side enforcement is required; hiding a button is not sufficient security.

## 7. Storage architecture

Use two coordinated stores:

- a tenant-scoped document registry for structured metadata, snapshots, revisions and audit events;
- tenant-isolated object storage for immutable PDF files and later attachments.

Paths and access policies must include tenant identity and opaque document/revision identifiers. Financial privacy filtering applies both to structured snapshots and rendered documents. File URLs must be short-lived or authorised rather than permanently public.

## 8. Shared component boundaries

- `NavigationAccordion` owns expand/collapse interaction and accessibility.
- `NavigationPreferenceStore` owns per-user convenience state.
- `SafetyPlanTemplateService` owns master revisions and approval rules.
- `JobSafetyPlanService` owns controlled job copies and acknowledgements.
- `DocumentDefinition` is the contract supplied by each source record.
- `DocumentService` coordinates snapshot, PDF, storage, registry and audit stages.
- `DocumentActions` provides the consistent page control.
- `DocumentRenderer` provides common branding plus type-specific sections.
- `JobDocumentRegister` displays retained revisions.

No page may bypass `DocumentService` when saving a controlled document to a job.

## 9. Rollout

### Release 1 — Navigation

- accordion groups;
- active-route expansion;
- remembered user state;
- desktop and mobile accessibility.

### Release 2 — Safety Plans

- master template;
- company approval;
- job-specific controlled copies;
- acknowledgements and audit history;
- Compliance and Job entry points.

### Release 3 — Document Centre

- registry and object-storage boundary;
- shared actions and PDF frame;
- Job document register;
- mission, weather and Safety Plan renderers first;
- remaining listed document types added through the same contract.

## 10. Acceptance criteria

### Navigation

- Daily operations is available without hunting through the full menu.
- Collapsed groups remove their child tiles from the layout.
- Active routes remain discoverable.
- Preferences persist per user and fail safely.
- Keyboard and screen-reader behavior is explicit and tested.

### Safety Plans

- An administrator can approve a controlled master revision.
- A contractor can create a job copy without changing the master.
- A job copy identifies the master revision used.
- JSA/risk records can be linked without being duplicated or silently replaced.
- Approval and supersession are auditable.

### Documents

- Supported pages expose consistent PDF, Save to Job and Print actions.
- Saved job PDFs remain unchanged after source edits.
- A new save creates a traceable revision.
- PDF and metadata failures are explicit and never reported as success.
- Contractors cannot retrieve financial content through UI, API, PDF or file URL.
- Job documents can be filtered, previewed, printed and downloaded.
- Tenant isolation is verified at registry and file-storage boundaries.

## 11. Out of scope

- Drawn signatures and third-party e-signature providers.
- Emailing documents directly from the platform.
- Bulk scheduled report generation.
- Direct submission of records to CASA.
- Optical character recognition or automatic classification of uploaded documents.
- A general-purpose template designer for arbitrary document layouts.
