# Fleet Technical Register and Maintenance System Design

**Status:** Approved architecture incorporating the Product Owner amendments of 19 August 2026. This document governs implementation design; it does not authorise Production migrations or deployment.

## 1. Product outcome

Spray Command will provide one authoritative maintenance engine for Aircraft, Fleet assets, Equipment Kits and independently tracked components. It must support a simple operator who records only essential servicing and a sophisticated workshop that records systems, component life, parts, fluids, defects and evidence.

The governing interaction is:

> Summary → Expand → Detail → Action

Complexity belongs in the domain and evidence model. The operator sees one active workspace section and only the detail needed for the current decision.

## 2. Scope and non-goals

Phase 1 establishes:

- relational non-aircraft Fleet assets;
- a shared maintainable-asset registry linking existing authoritative assets;
- attachments and attachment history;
- meter definitions and immutable readings;
- systems, component positions, tracked components and installations;
- maintenance requirements, deterministic due state and completions;
- maintenance events, defects and technical documents;
- canonical part and fluid identities separated from organisation preferences;
- optional, versioned service templates and prepared-service manifests;
- compact Asset Workspaces across desktop, tablet and mobile;
- tenancy, permissions, audit, outbox and optimistic concurrency controls.

Phase 1 does not:

- rewrite Aircraft, Equipment Kits, Personnel, Organisations, Bases, audit or documents;
- turn Work Pack browser state into maintenance authority;
- add purchasing, stock control, invoices or supplier integrations;
- make AI-extracted technical data authoritative;
- make component tracking or service templates mandatory;
- automatically ground an asset from a due-state calculation;
- implement billing or a standalone maintenance product.

## 3. Existing architecture and reuse map

### 3.1 Authoritative domains to retain

| Domain | Current authority | Decision |
|---|---|---|
| Aircraft | `public.aircraft`, organisation and operating-location scoped, row-versioned, audited and emitted through the transactional outbox | Extend through a registry link; do not replace or duplicate |
| Equipment Kits | `public.equipment_kits`, compatibility and assignment model, operational/calibration/maintenance summaries | Extend through a registry link; preserve current kit operations |
| Personnel | Relational personnel and role/credential evidence, including maintenance support | Reference existing Personnel; do not create a technician identity |
| Organisations and Bases | Existing organisation membership, Operating Location scope, RLS and trusted session | Reuse exactly; customer-facing maintenance language may say Base |
| Audit and outbox | Existing audit records and transactional-outbox publication | Every maintenance command participates in the same transaction |
| Documents | Existing immutable file identity/version/checksum/provider/provenance patterns | Reuse storage and evidence conventions |
| Missions | Existing aircraft/resource assignment and authoritative closeout | Read source measurements later; do not make Mission own maintenance |

### 3.2 Existing Fleet boundary

Vehicles and trailers currently exist as `DeploymentAsset` values inside the organisation's `ftf_work_packs` JSON aggregate. That store is authoritative for Work Pack composition but is not suitable as the technical register because it has aggregate-level concurrency, no relational asset identity, no independent attachment history and no component or requirement relationships.

The new `fleet_assets` table becomes authoritative for the technical identity and operational maintenance state of vehicles, trailers, generators, cranes, pumps, compressors and other maintainable equipment. Work Packs reference those asset IDs. Existing Work Pack values are migrated through an explicit, idempotent reconciliation process; the browser store is never treated as a second maintenance authority.

### 3.3 Reusable application patterns

- `api/v1/[resource].js` and the operational dispatcher remain the trusted same-origin API boundary.
- `server/operational-api.js`, `server/operational-repository.js` and `server/operational-dispatcher.js` remain the mutation/read architecture.
- Existing permission, tenant, operating-location and optimistic-concurrency helpers are extended rather than forked.
- Existing responsive navigation, drawer and workspace patterns are retained.
- Product Maturity remains repository controlled and independent of entitlement or permission.

## 4. Architectural decision

### 4.1 One engine, typed asset sources

There is no universal replacement Asset table. Instead, `maintainable_asset_registry` gives the maintenance domain a stable ID and links to exactly one authoritative source:

- `aircraft_id`, or
- `equipment_kit_id`, or
- `fleet_asset_id`.

A database constraint requires exactly one source link. Source identity, name, registration, serial number, organisation, Base and operational status continue to come from the authoritative source table. Maintenance-specific records point to the registry ID.

This composition avoids an Aircraft rewrite while preventing multiple maintenance engines.

### 4.2 Dedicated service-template tables

Service templates require dedicated tables. A template is a versioned aggregate that combines exact requirement versions, inspections, replacement actions, parts, fluids, applicability and evidence. Encoding that aggregate as maintenance requirements would create ambiguity about:

- whether a requirement is independently due or merely included in a package;
- which version of a recipe produced a manifest;
- whether a part or fluid line is technical fact or organisation preference;
- how optional and conditional actions were resolved;
- how manufacturer and organisation authority are distinguished.

Templates therefore compose requirements but do not replace them. An organisation may prepare and complete maintenance entirely from individual requirements.

## 5. Domain model

All mutable organisation records carry `organisation_id`, `created_at`, `updated_at`, `created_by`, `updated_by` and `row_version`. Historical/version rows are immutable after publication except for governed state transitions. IDs are UUIDs. All quantities store a numeric value plus a controlled unit code.

### 5.1 Fleet identity and relationships

#### `fleet_assets`

Relational authority for non-aircraft assets.

- `asset_type`: VEHICLE, TRAILER, GENERATOR, CRANE, PUMP, COMPRESSOR, OTHER
- organisation and current Base
- organisation asset reference, registration where applicable, manufacturer, model and serial number
- acquisition/activation dates
- operational status and serviceability status as separate values
- archived state and row version

Unique constraints are tenant scoped and type appropriate. Registration and serial-number normalisation is explicit; blank identifiers are not coerced into shared uniqueness.

#### `maintainable_asset_registry`

- stable maintenance identity;
- organisation ID copied and database-validated against the linked source;
- exactly one of `aircraft_id`, `equipment_kit_id`, `fleet_asset_id`;
- tracking state: ACTIVE or HISTORY_ONLY.

Stopping maintenance tracking changes the registry to HISTORY_ONLY. It never deletes history.

#### `asset_attachment_periods`

- parent and child registry IDs;
- attachment type and position/description;
- `attached_at`, optional `detached_at`;
- author and evidence;
- no overlapping active attachment for the same child;
- same-organisation invariant.

The child retains its own meters, requirements, events and history after movement.

### 5.2 Meters

#### `asset_meter_definitions`

Defines ODOMETER_KM, ENGINE_HOURS, FLIGHT_HOURS, FLIGHT_CYCLES, MISSIONS, AREA_HA or an approved organisation-defined meter. It records unit, precision, rollover policy and whether readings normally derive from another authoritative workflow.

#### `asset_meter_readings`

Append-only readings with:

- registry and meter-definition IDs;
- measured value and observation time;
- source type and source record ID;
- idempotency key;
- optional superseded-reading ID and correction reason.

Existing readings are not edited. Corrections supersede them. A deterministic query selects the latest valid reading as of an explicit timestamp.

### 5.3 Systems, positions and components

#### `asset_systems`

Optional hierarchical systems such as Engine, Transmission, Front Differential, Propulsion or Spray System. Systems may derive from a model template or be organisation defined. Assets remain valid with no systems configured.

#### `component_positions`

Model/configuration-capable positions. A position has a stable code, label, optional parent system and effective state. No motor count or fixed aircraft geometry is hard-coded.

#### `tracked_components`

Independent component identities where the organisation chooses to track one. Supports serialised and organisation-batched/non-serialised tracking, canonical part reference, manufacturer identity, acquisition state and lifecycle state.

#### `component_installation_periods`

- component, parent registry and optional position;
- installation/removal timestamps;
- parent meter snapshots at both boundaries;
- installation/removal event references;
- no overlapping active installation for a serialised component.

Component life is the sum of valid parent-meter deltas across all installation periods plus any approved independent readings. Moving a component does not reset life.

### 5.4 Canonical parts and private organisation preferences

#### Canonical identity

`technical_parts` stores the stable platform technical identity. `technical_part_versions` stores immutable, evidenced versions containing manufacturer, manufacturer part number, technical description, lifecycle state, effective dates and evidence references.

`technical_part_equivalences` relates two exact technical-part versions and records:

- equivalence scope and limitations;
- evidence;
- human approver and approval timestamp;
- effective/superseded state.

An AI or document extractor writes only to `technical_data_proposals`. A proposal has no compatibility effect. Publication requires a qualified human approval command and evidence. The canonical catalogue exposes no supplier pricing, internal SKU, organisation notes or purchasing behaviour.

#### Organisation preference

`organisation_part_preferences` is tenant scoped and references a canonical technical part. It may store:

- preferred supplier identity/reference;
- internal SKU;
- preferred approved equivalent;
- normal purchase quantity and unit;
- package preference;
- organisation notes and future purchasing metadata.

An organisation may select an equivalent only from approved canonical equivalences or explicitly record an organisation-only substitution proposal that remains non-authoritative until separately approved under organisation policy. RLS prevents cross-tenant visibility. Canonical catalogue curators cannot infer or expose private commercial details through the canonical record.

#### Applicability and service quantities

`asset_part_requirements` links an exact technical-part version to an asset system, model/configuration or exact registry asset and records quantity per action, applicability, evidence and authority. This is the technical answer to “what part fits?” Organisation preference answers “what do we normally buy?”

### 5.5 Canonical fluid specifications and private preferences

`technical_fluid_specifications` and immutable `technical_fluid_specification_versions` store fluid type, viscosity/grade, standards, compatibility constraints, evidence, lifecycle and effective state.

`asset_fluid_requirements` links an exact specification version to an asset/model/system/service point and records service-fill quantity, optional dry capacity, unit, authority and evidence.

`organisation_fluid_preferences` stores the private preferred brand/product, supplier, package size, normal purchasing preference and notes. A preferred product must declare the exact technical specification it satisfies. Selecting a preferred product never changes the canonical technical requirement.

### 5.6 Maintenance requirements and due state

`maintenance_requirements` is the stable identity. `maintenance_requirement_versions` is immutable after EFFECTIVE and contains:

- applicability to an exact asset, model/configuration, system, position or component type;
- authority: MANUFACTURER, ORGANISATION_STANDARD or CONDITION_BASED;
- evidence and effective dates;
- action and completion evidence requirements;
- one or more `maintenance_requirement_thresholds`.

Threshold types are CALENDAR, ODOMETER, ENGINE_HOURS, FLIGHT_HOURS, FLIGHT_CYCLES, MISSIONS, AREA, COMPONENT_LIFE, CONDITION or ONE_TIME. Combination policy is ANY_THRESHOLD (whichever comes first) or ALL_THRESHOLDS where explicitly justified. There is no implicit interpretation.

`maintenance_requirement_completions` links a requirement version to a maintenance event and records the authoritative completion baseline for each relevant meter.

### 5.7 Service templates and prepared manifests

#### Template aggregate

- `service_templates`: stable identity, PLATFORM or ORGANISATION owner scope, authority, and organisation ID only for organisation-owned templates.
- `service_template_versions`: immutable version, applicability/effective state, evidence and DRAFT/APPROVED/EFFECTIVE/SUPERSEDED/RETIRED lifecycle.
- `service_template_applicability`: asset/model/configuration/system scope.
- `service_template_requirement_links`: exact requirement-version references.
- `service_template_actions`: INSPECT, REPLACE, SERVICE, CALIBRATE or OTHER; target system/position; REQUIRED, OPTIONAL or CONDITIONAL disposition.
- `service_template_part_lines`: exact technical-part version, quantity/unit and action linkage.
- `service_template_fluid_lines`: exact fluid-specification version, quantity/unit and action linkage.

Conditions use a constrained, versioned condition schema evaluated by server code. Arbitrary SQL or executable expressions are prohibited.

Manufacturer templates and organisation templates are visually and structurally distinct. An organisation can copy a manufacturer template only by creating a new organisation-owned version with provenance back to the source; it cannot mutate the manufacturer version.

#### Prepare Service

Prepare Service accepts an asset, an explicit `asOf`, and optional selected template versions. The server assembles:

1. currently due requirements;
2. matching effective template lines;
3. installed-component state and component requirements;
4. open defects;
5. currently attached assets and their due work when included by the operator;
6. canonical parts and fluids;
7. private organisation preferences as a separate purchasing overlay.

Lines retain origin IDs and authority. Exact requirement/action origins are de-duplicated. Quantities aggregate only when canonical identity, unit and compatibility are identical. Package rounding is not inferred without an approved purchasing policy.

The preview is deterministic and read-only. Saving creates immutable `service_preparation_revisions` plus typed manifest line tables, recording all input versions and the `asOf` instant. A subsequent source change produces a new revision; it does not silently mutate an issued manifest.

Templates are optional. With no template, Prepare Service uses individual due requirements, components and defects.

### 5.8 Maintenance events, defects and documents

`maintenance_events` records service, inspection, repair, modification, calibration, firmware/software, damage, component actions and other governed event types. Child tables record:

- exact requirement completions;
- parts actually used;
- fluids actually used;
- personnel participation through existing Personnel IDs;
- meter readings;
- defects addressed;
- component installations/removals;
- documents/evidence;
- downtime, cost and return-to-service declaration.

Events are append-oriented. Material correction creates a superseding event or governed amendment with audit history.

`asset_defects` records REPORTED, ASSESSED, DEFERRED, RECTIFICATION_REQUIRED, RECTIFIED and CLOSED transitions. A defect can affect serviceability only through an explicit governed availability decision; reporting alone does not automatically ground an asset.

`technical_documents` and typed links associate existing immutable file versions with assets, systems, components, requirements, templates, events and defects. Document purpose and provenance are explicit.

## 6. Deterministic calculations

### 6.1 Due state

Every calculation receives `asOf`; server clock defaults are resolved once at the command boundary and recorded.

For each effective requirement version:

1. resolve applicability as of `asOf`;
2. locate the latest valid completion baseline before `asOf`;
3. locate authoritative meter readings before `asOf`;
4. calculate remaining duration/usage for each threshold;
5. apply the explicit combination policy;
6. classify CURRENT, DUE_SOON, DUE or OVERDUE using versioned warning rules;
7. return inputs, threshold result and authority for explainability.

Missing evidence produces UNKNOWN/NEEDS_ATTENTION, never a fabricated CURRENT state. UNSERVICEABLE is an operational availability state and is not a fifth mathematical due state.

### 6.2 Component life

For each completed installation period, life contribution is removal reading minus installation reading. For the active period, contribution is the latest valid parent reading as of `asOf` minus the installation reading. Invalid negative deltas, meter resets without a governed rollover/correction, overlapping installations and absent required readings fail closed as NEEDS_ATTENTION.

### 6.3 Attachment aggregation

Parent status shows attached-asset due summaries but does not merge histories. Prepare Service includes an attached asset only when it is attached as of `asOf` and the operator includes attached work. Each manifest line retains its owning asset.

## 7. Authority and governance

| Fact | Authority |
|---|---|
| Manufacturer requirement, part applicability, fluid specification or service template | Evidenced canonical version approved by a qualified human |
| Organisation maintenance standard, template or preference | Organisation-scoped version approved by an authorised organisation role |
| Condition recommendation | Evidenced assessment linked to the asset/component and author |
| AI/manual extraction | Proposal only until human approval |
| Asset availability | Existing operational status plus an explicit governed availability decision |

Authority labels are preserved through due calculations, manifests and events. UI wording must never present an organisation standard as a manufacturer requirement.

## 8. Security, tenancy, audit and concurrency

- Organisation records use RLS and trusted server scope; no browser-local fallback exists.
- Registry source links and attachments are database-validated to the same organisation.
- Canonical technical records contain no tenant-private commercial values.
- Organisation preferences, templates, components, events, defects and manifests are inaccessible across tenants.
- Base-scoped roles can mutate only assets within authorised Bases; moving an asset is a controlled command.
- Canonical publication is a separate permission from organisation maintenance management.
- Every mutation validates `row_version`, writes audit evidence and emits an outbox event in one transaction.
- Service-role use does not grant client access; APIs still validate trusted session, permission and tenant scope.
- Historical evidence is archived/retired, not hard deleted.
- Batch operations are bounded and return per-record outcomes without partial hidden success.

## 9. API and event boundary

The public same-origin surface extends `/api/v1` with typed resources and commands. Representative commands are:

- create/update/archive Fleet asset;
- attach/detach asset;
- record/correct meter reading;
- configure system/position;
- create/install/remove/retire component;
- create/version/approve requirement;
- create/version/approve canonical part, fluid or equivalence proposal;
- save organisation part/fluid preference;
- create/version/approve service template;
- preview/save Prepare Service;
- record/amend maintenance event;
- report/assess/defer/rectify/close defect;
- make governed availability decision.

Responses return safe error codes, correlation IDs and updated row versions. Outbox topics describe the domain event without leaking private catalogue/preferences.

## 10. Operator experience

### 10.1 Fleet structure

The existing Fleet navigation group remains stable. Canonical destinations become:

- Aircraft Register: `/aircraft`
- Fleet & Equipment Register: `/fleet`
- Asset Workspace: `/aircraft/:aircraftId/:section` or `/fleet/assets/:fleetAssetId/:section`
- Existing `/fleet-work-packs` remains a supported route into Work Packs and is not silently removed.

Both workspace routes render the shared maintenance composition around the correct authoritative source.

### 10.2 Asset Workspace

Persistent context shows organisation, Base, asset identity, operational status, serviceability and next action. The complete section rail is always visible where space permits:

- Overview
- Maintenance
- Components
- Parts & Fluids
- Defects
- Documents
- History

One section is active. Sections are route-addressable and non-linear. Categories are collapsed by default and show concise count/status summaries. An attached asset opens its own workspace.

### 10.3 Responsive behaviour

- Desktop: section rail plus one active workspace and a compact status panel.
- Tablet: horizontal/scrollable section navigation; status summary collapses above content.
- Mobile: sticky asset context and section selector; cards expand one at a time; primary action remains reachable without long scrolling.
- Keyboard: semantic tabs/links, logical focus order, visible focus and no hidden duplicate controls.
- Loading: mutating actions remain disabled until tenant, Base and authoritative asset state are resolved.

## 11. Integration boundaries

- Missions may append authoritative flight-hour/cycle/mission/area readings after accepted closeout; duplicate source IDs are idempotent.
- Asset availability remains authoritative in existing assignment gates. Maintenance can propose or record a governed availability decision but cannot silently ground an asset.
- Work Packs reference relational Fleet asset IDs and consume prepared-service manifests; they do not own technical history.
- Personnel links record who performed/approved work without creating duplicate identities.
- Future purchasing consumes canonical requirements plus private preferences; it does not redefine technical compatibility.
- Reporting reads versioned projections with organisation and Base scope.

## 12. Migration and cutover design

Migrations are additive and separately approved. The planned order is:

1. relational Fleet assets and registry;
2. meters, systems, attachments and components;
3. canonical parts/fluids and private preferences;
4. requirements and deterministic due-state data;
5. maintenance events, defects and documents;
6. service templates and prepared manifests;
7. Work Pack reconciliation and compatibility views;
8. permissions, RLS, audit/outbox verification and final hardening.

Each migration has a dry run, exact ledger plan, PostgreSQL behavioral tests and rollback/fix-forward analysis. Production execution remains separately gated. Existing Aircraft and Work Pack data is never deleted during cutover. Reconciliation records source IDs and digests so repeated execution is idempotent and discrepancies fail closed.

## 13. Bounded implementation slices

1. **Foundation:** Fleet assets, registry, tenancy, API and compact registers.
2. **Relationships and meters:** attachments, meter readings, systems and positions.
3. **Technical catalogue:** canonical parts/fluids, evidence, equivalence approval and private preferences.
4. **Requirements and due state:** versioned requirements, completions and deterministic calculation.
5. **Events, defects and documents:** historical maintenance execution and governed availability boundary.
6. **Components:** identities, installations, transfers and calculated life.
7. **Service templates and Prepare Service:** optional recipes and immutable manifests.
8. **Integration and acceptance:** Mission readings, Work Pack references, responsive workspaces, security and end-to-end acceptance.

No slice begins Production migration until its schema/authority review and Product Owner migration approval are complete.

## 14. Product maturity

The Fleet Technical Register and individual Phase 1 workflows launch as **Beta**: safe, supported and actively improving. Existing Aircraft and Equipment Kit maturity is not downgraded merely because new maintenance workflows are Beta.

Prepare Service remains **Coming Soon** until its authoritative manifest, aggregation, cross-asset and evidence acceptance passes. AI/manual ingestion remains **Coming Soon** until proposal isolation and human approval are proven.

Promotion to Operationally Ready requires:

- complete authoritative browser/API/PostgreSQL acceptance;
- deterministic due-state and component-life evidence;
- cross-tenant, Base-scope and concurrency tests;
- Chromium, WebKit, tablet and mobile acceptance;
- successful operational use without unresolved P0 defects.

Commercially Ready additionally requires external-customer evidence, support readiness, production reliability and Founder approval.

## 15. Acceptance principles

The system is acceptable when a new asset can remain valid with no optional systems/components/templates, while a detailed asset can track hundreds of collapsed technical records without creating a giant form. Every technical answer must be traceable to an exact effective source, authority and evidence. Every private preference must remain private. Every maintenance history must follow the asset or component that owns it.
