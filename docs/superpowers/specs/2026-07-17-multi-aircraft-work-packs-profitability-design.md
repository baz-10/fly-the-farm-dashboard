# Multi-Aircraft Work Packs and Private Profitability Design

**Date:** 2026-07-17  
**Status:** Approved  
**Scope:** Aircraft-kit compatibility, detailed truck profiles, reusable work packs, multi-aircraft missions, job costing, and tenant-private profitability

## 1. Objective

Turn the dashboard into the operating backbone for an agricultural-drone operator. A company must be able to plan one mission using a truck, one to three mixed-model aircraft, swappable equipment kits, crew, chemicals, and consumables; execute and adjust that deployment in the field; and compare planned and actual profitability without exposing financial information to operational users or platform support.

The long-term rollout model supersedes any earlier document that gives a Fly the Farm or platform administrator access to customer operational or financial data. During the current internal build and testing phase, the existing platform-admin behaviour will remain unchanged. Tenant isolation and restricted platform-support access are a mandatory production-rollout gate before any independent customer company is onboarded.

## 2. Delivery Sequence

The feature will be delivered in four coordinated releases:

1. Correct aircraft-kit compatibility and the T100 mission workflow.
2. Add detailed truck profiles and reusable work-pack templates.
3. Connect job-specific work packs to missions supporting up to three aircraft.
4. Add company-private planned/actual costing and profitability reporting.

The releases share one tenant and permissions model so later releases do not require a security or data-model rewrite.

## 3. Tenant and Permission Model

The target multi-company model gives every company-owned record a non-null `company_id`. Row-level security will be deny-by-default and resolve access through the authenticated user's active company membership.

This target is not part of the immediate internal feature build. Until the rollout security gate is implemented and verified, the platform must be treated as a single-company/internal environment and must not host independent customer-company financial data.

### Roles

| Role | Operational data | Financial data | User administration |
|---|---|---|---|
| Company administrator | Full access within own company | Full access within own company | Own-company users |
| Field supervisor | Assigned/company operational records; may approve active deployment changes | None | None |
| Pilot/crew/contractor | Assigned operational records | None | None |
| Client | Explicitly shared client/job records only | Customer-facing quote/invoice values only; never internal costs or margins | None |
| Platform support | No tenant operational data | None | User directory and password-reset workflow only |

At external rollout, platform support will cease to be a tenant superuser. Support tooling must not use a general-purpose service-role query path to tenant tables. Any exceptional production database access remains an infrastructure incident process outside the product, requiring explicit approval and audit; it is not a dashboard capability.

### Financial separation

The immediate build hides financial features from operational roles and separates financial domain services from operational services. Before external rollout, database views, API policies, and row-level security must enforce that cost tables are accessible only to company administrators. Hiding fields in React is not sufficient for the rollout security gate.

## 4. Core Domain Model

### 4.1 Aircraft and kits

- `aircraft`: registration-specific asset, model, status, limits, service state, and company ownership.
- `equipment_kits`: swappable kit, type, status, weight, service/calibration state, and company ownership.
- `kit_model_compatibility`: many-to-many relationship between a kit and normalized aircraft model.
- `aircraft_kit_configurations`: retained for named/saved configurations and backward compatibility, but no longer required merely to display a compatible kit.

Model identifiers are normalized and stable; display names remain editable. Compatibility must not depend on a kit name containing a registration or model string.

Mission Planning derives eligible kits from model compatibility, availability, payload/weight limits, and service state. A single eligible kit may be auto-selected. Changing aircraft must clear stale kit details before selecting a replacement.

### 4.2 Truck profiles

- `trucks`: registration, make, model, year, status, odometer, operating hours, fuel type, notes, and company ownership.
- `truck_cost_profiles`: purchase/finance details, registration, insurance, depreciation, servicing, tyres, fuel consumption, and calculated hourly/daily/per-kilometre rates.
- `truck_cost_events`: optional actual fuel, service, tyre, registration, insurance, and other cost transactions used to refine actual operating cost.

Truck capacity, aircraft positions, payload, and loading constraints may be stored as optional informational fields. Capacity validation and blocking are explicitly deferred.

### 4.3 Crew and labour rates

- `crew_profiles`: operational identity, roles, qualifications, availability, and company membership.
- `crew_cost_profiles`: administrator-maintained standard, overtime, travel, and allowance rates.

Supported operational roles include driver, field supervisor, pilot, loader/mixer, spotter/observer, and additional support crew. Operational users can see assignments and qualifications but cannot query cost profiles.

### 4.4 Work-pack templates

- `work_pack_templates`: reusable named setup owned by a company.
- `work_pack_template_items`: one default truck plus aircraft, kits, crew roles, supporting equipment, chemicals, and consumables.

Templates are starting points, not live links. Creating a job work pack copies the template so subsequent template changes do not alter an existing job.

### 4.5 Job work-pack snapshots

- `job_work_packs`: job-specific deployment plan and lifecycle state.
- `job_work_pack_items`: typed snapshot items containing asset/reference IDs plus operational display snapshots.
- `job_work_pack_cost_snapshots`: administrator-only planned rates, quantities, hours, distances, and calculated cost values captured at planning time.

The job work pack remains editable until the job/mission lifecycle locks the relevant fields. Historical names, rates, and calculations are retained even if source profiles later change.

### 4.6 Multi-aircraft mission deployment

- `missions`: shared customer, property, field, treatment, weather, risk, authorisation, chemical plan, and work-pack reference.
- `mission_aircraft_allocations`: one to three aircraft per mission, each with kit, pilot, readiness state, planned allocation, and active/removed/replaced status.
- `mission_aircraft_actuals`: per-aircraft flight time, batteries, payload, area, application, downtime, chemical use, and completion data.
- `mission_deployment_events`: append-only audit of aircraft additions, removals, replacements, approvals, and reasons.

A mission may use mixed models, such as two T100s and one T50. The limit is three active aircraft. Each aircraft is independently validated; shared mission controls are not duplicated.

## 5. Mission Workflow

### Planning

1. Select or create a job.
2. Start from a reusable work-pack template or a blank work pack.
3. Select a truck.
4. Add one to three aircraft of any model.
5. Select a compatible kit and pilot for each aircraft.
6. Add remaining crew, chemicals, consumables, and supporting equipment.
7. Run readiness, compatibility, duplication, availability, and qualification validation.
8. Calculate planned capacity, duration, internal cost, quote inputs, and expected margin for company administrators.

### Authorisation and execution

The mission keeps its established compliance and authorisation gates. Aircraft-specific readiness must pass before that aircraft becomes active.

A field supervisor may add or replace an aircraft after the mission starts. The new allocation must pass kit compatibility, aircraft availability/readiness, pilot assignment/qualification, and the three-aircraft limit. The supervisor provides a reason and approval. The system records the event, preserves the authorised baseline, and recalculates operational projections and hidden internal costs without requiring company-administrator reauthorisation.

### Completion

Completion requires actuals or an explicit not-used/cancelled outcome for every aircraft allocation. The system aggregates area, time, chemical use, productivity, and cost while retaining per-aircraft detail. Completed missions and their financial snapshots are locked; corrections use an auditable amendment flow rather than destructive edits.

## 6. Chemical and Consumable Model

Mission/work-pack chemicals support:

- company-supplied or customer-supplied source;
- planned, loaded, applied, returned, and wasted quantities;
- batch/lot traceability;
- unit-of-measure conversion;
- shared mission totals and attribution to individual aircraft/batches;
- company inventory cost for company-supplied material;
- zero company inventory cost for customer-supplied material while retaining operational traceability.

A later rollout may export a supplier chemical work pack containing products, quantities, delivery location, treatment date, and compliance requirements. No supplier integration is included now, but identifiers and export status fields may be reserved without exposing an unfinished UI.

## 7. Costing and Profitability

### Planned cost inputs

- Truck fixed and variable rates, planned kilometres/hours/days, fuel, and travel.
- Aircraft and kit utilisation rates.
- Crew standard/overtime/travel hours and allowances.
- Company-supplied chemicals and consumables.
- Configurable company overhead allocation.

### Actual cost inputs

- Actual truck kilometres, hours, days, and fuel where captured.
- Actual aircraft/kit use and downtime.
- Actual crew times and allowances.
- Actual chemical/consumable use, return, and waste.
- Actual job revenue and approved adjustments.

### Outputs

Company administrators can view planned cost, actual cost, variance, revenue, gross profit, gross margin, asset utilisation, and per-area/per-hour metrics for their company only. Operational users receive no totals or indirect values from which pay rates, costs, or margin can reasonably be inferred.

Rates are entered manually in this rollout. Payroll, accounting, and supplier integrations are future work.

## 8. Validation and Error Handling

- No kit options: explain whether compatibility, availability, calibration/service, or payload caused the result.
- Aircraft change: immediately remove stale kit/allocation data.
- Duplicate aircraft/kit/pilot conflicts: prevent invalid simultaneous allocation unless the resource explicitly supports sharing.
- Third aircraft already active: block another addition with a clear limit message.
- Active-mission change validation failure: do not partially add the aircraft; preserve the previous deployment and audit the failed attempt where appropriate.
- Cost calculation failure/missing rate: allow operational planning with an administrator-only incomplete-cost warning; never substitute zero silently except for explicitly customer-supplied items.
- Permission denial: return no protected row/field, not merely a disabled control.

## 9. Compatibility and Migration

- Existing `AircraftKitConfiguration` records remain readable and editable.
- A migration derives model compatibility from reliable existing aircraft/kit relationships; ambiguous records are flagged for administrator review rather than guessed.
- Existing single-aircraft missions migrate to one `mission_aircraft_allocation` without changing their displayed outcome.
- Existing mission IDs and completed records remain stable.
- Current local/demo storage adapters and Supabase services must share domain contracts during rollout so behaviour is testable before production migration.

## 10. Testing Strategy

Implementation follows test-driven development.

Required coverage includes:

- T100 model-compatible kit appears without a pre-created aircraft-specific configuration.
- T50/T100 kit filtering and weight/status validation.
- Stale kit information clears when aircraft changes.
- One mission accepts one, two, or three mixed-model aircraft and rejects a fourth.
- Each allocation validates its own aircraft, kit, and pilot.
- Field supervisor can add/replace an active aircraft; ordinary crew cannot.
- Completed deployments are locked and retain audit history.
- Work-pack templates copy rather than live-link.
- Planned rate snapshots remain unchanged after source rate edits.
- Company-supplied versus customer-supplied chemical costing.
- Immediate role tests confirm operational users cannot access financial screens or financial service methods.
- Pre-rollout security tests confirm Tenant A cannot read or mutate Tenant B operational or financial records.
- Pre-rollout security tests confirm operational roles and platform support cannot retrieve financial records through UI, service, direct API, or database policies.
- Single-aircraft legacy mission regression tests.

## 11. Deferred Work

- Truck capacity/payload/aircraft-position enforcement.
- Supplier chemical-work-pack transmission.
- Payroll and accounting integrations.
- Automated external rate import.
- Multi-company row-level security and restricted platform-support access (mandatory before external customer rollout).
- Branding and product rename.

## 12. Acceptance Criteria

The programme is complete when:

1. A T100 mission can select a valid model-compatible kit and complete end to end.
2. One mission can plan, authorise, execute, adjust, and complete with up to three mixed-model aircraft.
3. Reusable truck-based work packs can be copied and customised per job.
4. Planned and actual costs include truck, aircraft, kits, crew, chemicals, consumables, travel, fuel, and overhead.
5. Company administrators can view profitability while crew, contractors, and field supervisors cannot access financial screens or financial services.
6. Existing single-aircraft missions and saved configurations continue to work.
7. Before external customer rollout, company isolation and platform-support restrictions pass UI, API, and database-policy tests.
