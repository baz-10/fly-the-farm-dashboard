# Optional Deployment Work Packs Design

## Objective

Connect deployment assets and reusable work packs to Mission Planning without making commercial or fleet data a mission-authorisation requirement. Operators must be able to plan anything from a single aircraft with no recorded transport through to a truck, multiple trailers, three aircraft, kits, crew, and supporting equipment.

This release adds the integration to the existing New Mission page. A broader redesign of that page is explicitly out of scope.

## Guiding Rule

Operational safety and compliance may block authorisation. Missing trucks, trailers, templates, assignments, or costing data may not block authorisation.

## User Experience

Mission Planning gains a collapsed `Deployment Work Pack (Optional)` panel directly below `Aircraft & Equipment`.

- A user can continue without opening the panel.
- With no deployment assets, the panel explains that the mission can continue without one.
- With one suitable asset, the interface may suggest it but never forces selection.
- A user can apply a reusable work-pack template or build a custom mission setup.
- Applying a template creates an editable mission copy rather than a live link.
- `Skip for now` clears the optional work pack.
- Users can add or remove aircraft progressively, with a limit of three aircraft in this release.
- Compatible kits are suggested per aircraft. Missing kit or cost data is advisory unless an existing safety or operational rule independently requires the equipment.
- Advanced work-pack controls remain collapsed until requested.

## Deployment Assets

The existing truck-only model becomes a general deployment-asset model.

Initial asset types are:

- `truck`
- `trailer`

Trucks and trailers are independent assets. Supported combinations include:

- an equipment truck by itself;
- a managed truck towing one or more trailers;
- a trailer towed by an unlisted personal ute;
- multiple trailers carrying different equipment;
- assets carrying supporting equipment without carrying an aircraft.

A trailer does not require a managed truck selection. When the towing vehicle is not a managed asset, a mission can store optional lightweight tow-vehicle details such as registration, driver, and notes.

Existing truck profiles migrate in memory to `truck` deployment assets and remain editable and selectable. The persisted store remains backward compatible with existing truck data during this release.

## Profiles and Assignments

Each deployment asset contains:

- identity and registration details;
- manufacturer, model, year, and ownership details where relevant;
- capacity and operational notes;
- availability or maintenance status;
- administrator-only operating costs.

Work-pack assignments identify both the item and its carrying asset. Aircraft, kits, and supporting-equipment notes can be assigned to any selected truck or trailer. An assignment may remain unallocated when the user does not need that level of detail.

## Reusable Templates and Custom Packs

A reusable template can contain:

- zero or more deployment assets;
- up to three aircraft assignments;
- optional compatible kits for each aircraft;
- carrying-asset assignments;
- crew requirements;
- checklist items;
- operational notes.

Users may apply a template and customise the resulting mission work pack, or build a mission-specific pack from scratch. Editing a source profile or template later does not change an existing mission.

## Mission Snapshot

The mission record gains an optional deployment-work-pack snapshot containing:

- source template ID when applicable;
- selected deployment asset snapshots;
- optional tow-vehicle details;
- aircraft and kit assignments;
- carrying-asset references;
- crew requirements;
- checklist items and notes;
- estimated deployment cost fields for administrators.

The snapshot is independent of live profiles. It preserves the operational and costing assumptions used when the mission was planned.

The current single `aircraftConfiguration` remains populated from the first aircraft assignment for backward compatibility with existing mission workflow, safety, and dashboard logic. The work-pack snapshot is the authoritative source for additional aircraft.

## Authorisation and Validation

Deployment work-pack validation is advisory.

- No asset selected: allowed.
- Trailer without a managed truck: allowed.
- Missing tow-vehicle details: allowed.
- Missing template: allowed.
- Missing carrying-asset assignment: allowed.
- Missing cost fields: allowed and visible only as an administrator costing notice.
- Incompatible selected aircraft and kit: the invalid kit selection is cleared and an operational warning is shown; this does not introduce a new authorisation blocker.
- More than three aircraft: prevented by the editor in this release.

Existing mission safety and compliance validation remains unchanged.

## Permissions and Financial Privacy

Contractors and operational users can see asset names, registrations, assignments, crew, checklists, and operational notes. They cannot see purchase values, operating rates, estimated deployment costs, margins, or profitability.

Company administrators can see and edit their own company's financial fields and costing completeness notices. Platform support receives no tenant financial visibility under this feature; broader platform-admin security hardening remains a separate rollout item as previously agreed.

## Persistence and Tenant Behaviour

Deployment assets, templates, and mission snapshots use the existing shared persistence layer. In remote mode, records are stored for the authenticated tenant through the existing server-enforced storage API. Local preview origins continue to have isolated development data.

No cross-tenant reads or financial aggregation are introduced.

## Error Handling

- Failure to load optional work-pack data leaves Mission Planning usable and displays a non-blocking warning.
- Failure to save the mission remains a normal mission-save error.
- A missing or archived live asset does not invalidate a previously saved mission snapshot.
- Applying an outdated template keeps valid assignments, marks unavailable source items, and allows the user to remove or replace them.
- Cost calculations treat missing values as incomplete rather than zero-confidence profit data.

## Testing

Automated coverage will verify:

- backward-compatible migration of truck profiles to deployment assets;
- independent truck and trailer selection;
- trailer selection without a managed truck;
- optional tow-vehicle details;
- template-to-mission snapshot copying;
- custom work-pack creation and editing;
- the three-aircraft limit and mixed-fleet assignments;
- compatible kit filtering per aircraft;
- preservation of the first aircraft in `aircraftConfiguration`;
- authorisation remaining available without assets or complete costing;
- contractor financial redaction and administrator financial visibility;
- saved snapshots remaining stable when templates or profiles change.

The complete existing test suite and production build must pass before publication.

## Deferred Work

- Full New Mission page redesign.
- Supplier export of chemical work packs.
- More than three aircraft per mission.
- Additional deployment asset types beyond trucks and trailers.
- Route, payload, towing, registration, or road-compliance enforcement.
- Profitability dashboards and actual-versus-estimate reporting.
- Platform-admin security-model replacement.
