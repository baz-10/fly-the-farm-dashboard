# Maintenance Command Design

## Purpose

Build a field-efficient maintenance system that gives remotely piloted aircraft system operators one trustworthy maintenance history across aircraft, RPAS components, vehicles, trailers and support equipment.

The product must distinguish between:

1. **RPAS Technical Logs — CASA-aligned records** for aircraft and safety-relevant RPAS equipment.
2. **Vehicle & Support Fleet — internal operational records** for non-RPAS assets such as trucks, trailers, generators, pumps and loaders.

Aircraft and Fleet pages provide the natural field-entry points. A central Maintenance Command page provides consolidated oversight for Maintenance Controllers and company administrators. All three surfaces use the same underlying records.

## Regulatory Basis

The RPAS records are designed around the current official sources reviewed on 20 July 2026:

- [Part 101 Manual of Standards, section 10.07 — RPAS technical log](https://www.legislation.gov.au/F2019L00593/2024-04-06/2024-04-06/text/original/epub/OEBPS/document_1/document_1.html)
- [CASA record-keeping guidance for ReOC holders](https://www.casa.gov.au/drones/remotely-piloted-aircraft-operators-certificate/record-keeping)
- [CASA Key Personnel Guide — ReOC Maintenance Controller](https://www.casa.gov.au/sites/default/files/2026-06/key-personnel-guide-reoc-maintenance-controller.pdf)
- [CASA Surveillance Manual Annex 16 — ReOC holders](https://www.casa.gov.au/sites/default/files/2021-09/casa-surveillance-manual-annex-16-rpa-operators-certificate-reoc-holders.pdf)

Section 10.07 requires the certified operator to maintain an RPAS technical log covering RPAS identity, total flight time, relevant component in-service times, maintenance schedules, completed maintenance, next maintenance due, defect rectification, unserviceable fail-safe equipment and serviceability certification. The technical log must be retained until at least seven years after the operator last operates the aircraft and must be available to CASA or a qualifying new operator when required.

CASA's Maintenance Controller guidance also identifies maintenance schedules, inspections, defect investigation and rectification, batteries, software and firmware, configuration changes, service bulletins and technical documents as part of effective maintenance oversight.

The interface will describe these records as **CASA-aligned**. It will not claim that use of the software alone guarantees compliance. Each subscriber remains responsible for its ReOC conditions, documented practices and procedures, manufacturer instructions and applicable law.

## Navigation and Information Architecture

### Aircraft

Each aircraft profile gains an **RPAS Maintenance** area containing:

- current serviceability and blocking reasons;
- total flight time and configuration identity;
- component in-service times;
- scheduled inspections and maintenance;
- technical log timeline;
- defects and rectification;
- firmware and configuration history;
- batteries, motors, propellers, controllers and attached role equipment;
- quick actions for defects, inspection, work, firmware and readings.

### Fleet

Fleet becomes the home for non-RPAS operational assets and gains **Vehicle & Equipment Maintenance**. Supported classes include:

- trucks and utes;
- trailers;
- generators;
- pumps and loaders;
- other support equipment.

Asset profiles track odometer readings, engine or operating hours, date-based schedules, kilometre or hour-based schedules, inspections, faults, repairs, parts and internal costs.

These records are labelled **Internal fleet-maintenance record — not a CASA RPAS technical-log requirement**.

### Maintenance Command

The left navigation gains **Maintenance**. It is the consolidated oversight workspace, with filters for:

- RPAS Compliance;
- Vehicle & Support Fleet;
- all assets.

The page contains:

- readiness and compliance summary cards;
- unserviceable and grounded assets;
- overdue and due-soon work;
- open defects;
- work in progress;
- records awaiting Maintenance Controller release;
- firmware campaigns;
- recent maintenance activity;
- upcoming calendar;
- reporting and export.

This view does not duplicate records. It queries the same records presented on Aircraft and Fleet profiles.

## Field-First Experience

Common field activities must be completable on a phone with minimal typing.

The primary actions are:

- Report defect;
- Record inspection;
- Record maintenance or repair;
- Record part change;
- Update reading;
- Record firmware update.

The quick-entry flow is:

1. Scan, search or select an asset.
2. Choose the activity.
3. Complete an adaptive form containing only relevant fields.
4. Add a short text note and optional photos.
5. Select the resulting status and submit.

The system automatically supplies the subscriber, user, role, date and time, asset identity, known readings and location when the user has permitted location capture.

Drafts must survive poor reception. A locally reported serviceability defect immediately marks the asset unserviceable on that device and displays an unsynchronised warning. Failed saves must never appear approved or silently disappear.

## Asset and Component Model

Every maintainable item has a stable ID, tenant ID and asset class. Common fields include:

- name and unique identifier;
- manufacturer, model and serial number;
- ownership and status;
- commissioned and retired dates;
- assigned parent asset where applicable;
- current readings;
- maintenance programme and schedules;
- documents, manuals and attachments;
- audit timestamps.

RPAS-specific fields include:

- RPA type, model and unique identification mark;
- prior configuration marks;
- maximum operating gross weight;
- total flight time;
- manufacturer and operator maintenance schedules;
- current serviceability state;
- fail-safe equipment state and limitations.

Life-limited or tracked components include motors, engines, rotors, propellers, batteries and other configured components. Each component may store serial number, installation/removal events, accumulated time or cycles and replacement limits.

Vehicle and support fields include odometer, engine hours, operating hours, service meter type, registration, VIN or serial number and internal cost fields.

## Record Types

### Inspection

Records checklist results, readings, findings, photos, inspector, date/time, applicable procedure and resulting serviceability.

Reusable inspection templates may be attached to an asset class or model. Operators can add templates from their documented practices, manufacturer instructions or internal fleet procedures.

### Defect

Records the reporter, detection date/time, mission or location, description, affected system, severity, evidence and immediate action.

Any user permitted to operate the asset may mark it unserviceable. A serviceability-affecting defect automatically blocks the RPAS or critical assigned asset.

### Maintenance and Rectification

Records work performed, procedures or manuals used, maintainer, competency or authorisation, start and completion times, measurements, tests, parts and attachments.

Defect rectification links to the originating defect. The original defect is never overwritten.

### Field Repair

Uses the maintenance record with a field-repair flag, location, temporary/permanent selection, operational limitations and photos. A PIC may record the work but may not release an RPAS unless separately authorised under the subscriber's approved arrangements.

### Part Change

Records removed and installed part details, serial or part numbers, reason, readings, condition and associated work record. Component histories and accumulated times remain traceable.

### Firmware and Configuration

Records:

- affected aircraft, controller, battery, payload or component;
- previous and installed versions;
- manufacturer release or source reference;
- installation date/time and installer;
- reason and release notes;
- backup or rollback information;
- configuration changes;
- post-update checks or test flight;
- issues and limitations;
- Maintenance Controller review and serviceability release.

A firmware campaign can target multiple assets while creating a separate immutable completion record for each asset.

### Reading

Records flight hours, component hours, cycles, odometer or operating hours. A reading may automatically create due-soon or overdue schedule events.

## Maintenance Schedules

Schedules support:

- calendar dates;
- elapsed days or months;
- flight hours;
- component hours;
- battery cycles;
- kilometres;
- engine or operating hours;
- whichever threshold occurs first.

Schedules identify their source: manufacturer, operator documented procedure, service bulletin, regulatory/approval condition or internal fleet programme.

Each task has due-soon thresholds, mandatory or advisory classification, applicable asset models, instructions, checklist and required release authority.

## Status and Approval Workflow

Maintenance records use the following workflow:

`Reported → Assessed → Work in progress → Awaiting release → Serviceable / Deferred / Unserviceable`

A deferred defect requires:

- the defect and affected equipment;
- justification;
- precautions and operating limitations;
- expiry date, hour, cycle or mission limit;
- approving Maintenance Controller;
- review or rectification due point.

The PIC can report defects, inspections, readings, field repairs, parts and firmware observations. A maintainer can accept and complete work. The Maintenance Controller controls maintenance schedules, reviews defects and firmware changes, approves deferments and provides RPAS serviceability release.

## Mission Integration

Mission authorisation reads current asset serviceability from the maintenance system.

An aircraft or essential RPAS item is blocked when it is:

- unserviceable;
- overdue on a mandatory schedule;
- affected by an unresolved serviceability defect;
- awaiting required maintenance release;
- subject to an expired deferment.

The planner displays the exact blocking record and a direct link to resolve it.

Vehicle and support-fleet maintenance does not automatically block a mission. It becomes a blocker only when the asset is assigned to the mission work pack, marked mission-critical and unserviceable or overdue on a mandatory internal task. Other issues are warnings.

## Permissions and Privacy

### PIC and field operator

Can view assigned assets and relevant non-financial history, submit records and immediately mark an asset unserviceable. Cannot issue an RPAS maintenance release unless separately authorised.

### Maintainer

Can record and complete permitted maintenance and rectification. The system records the competency or authorisation used.

### Maintenance Controller

Can manage RPAS schedules, investigate defects, approve limitations and deferments, oversee firmware/configuration changes and issue serviceability releases.

### Company administrator

Can manage assets, users and permissions and view financial maintenance information. Administrative access does not allow the administrator to impersonate a Maintenance Controller certification.

### Contractor

Can access assigned assets, applicable instructions and non-financial work records only. Cannot view unrelated subscriber assets, costs or profitability.

### Platform administrator

Can manage platform users and password resets only. The platform administrator cannot view subscriber operational, maintenance or financial records.

All access is tenant-scoped. Financial fields are company-administrator-only.

## Audit, Retention and Export

Every record receives immutable author, role, tenant, asset, date/time and audit identifiers. Original records cannot be deleted. Corrections create linked amendments preserving the original content and reason for change.

Attachments may include photos, invoices, certificates, service reports, manuals and technical notices.

RPAS technical-log records are retained for at least seven years after the operator last operates the RPA. Records must be exportable by aircraft in chronological order with identity, configuration, flight/component time, schedules, maintenance, defects, rectification, limitations and serviceability certifications.

Vehicle and support-fleet retention defaults to the subscriber's configured business policy and may be set to seven years for consistency.

## Error and Offline Behaviour

- Unsaved records remain drafts and are visibly marked.
- Retried submissions use an idempotency key to prevent duplicates.
- A failed attachment upload does not discard the text record.
- A record cannot transition to released if its required fields, authorisation or attachments are missing.
- Concurrent updates surface a conflict and preserve both audit events.
- Offline serviceability defects take immediate local effect and synchronise when connectivity returns.
- Users receive a clear warning when viewing potentially stale serviceability information.

## Testing and Acceptance

Automated tests must cover:

- tenant isolation and role permissions;
- contractor and platform-administrator privacy;
- financial-field restrictions;
- immutable records and amendments;
- schedule calculations for dates, hours, cycles and kilometres;
- component installation/removal and accumulated time;
- defect, repair, deferment and serviceability-release transitions;
- firmware campaigns and per-asset completion records;
- offline drafts, retry and duplicate prevention;
- mandatory RPAS mission blockers;
- support-fleet warning and critical-blocking behaviour;
- seven-year RPAS export completeness.

Field acceptance requires that a PIC can submit a defect with a photo in under one minute on a mobile layout and that an authorised Maintenance Controller can trace the complete defect-to-release history without opening another module.

## Initial Delivery Scope

The first delivery includes:

- shared maintenance types and tenant-scoped persistence;
- Aircraft RPAS Maintenance area;
- Fleet Vehicle & Equipment Maintenance area;
- Maintenance Command overview and queues;
- inspections, defects, maintenance/repair, parts, readings and firmware records;
- schedules and due calculations;
- PIC-to-Maintenance-Controller approval workflow;
- serviceability integration with mission planning;
- audit history and RPAS technical-log export.

Voice transcription, barcode/QR generation, inventory purchasing, supplier portals and direct CASA submission are later enhancements. Asset search and manual selection are included; scan support will be designed for extension without blocking the first delivery.
