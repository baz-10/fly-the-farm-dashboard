# Properties Workspace Focused Design

## Purpose

The Properties workspace at `/jobs?view=properties` lets an operator find, open, and add a Property without first navigating through a Client. It preserves the existing Client → Property domain relationship, API, route structure, permissions, tenant isolation, operating-location scope, audit, outbox, and authoritative PostgreSQL persistence.

## Primary experience

The page title is **Properties**. Search Properties and Add Property are immediately visible. Existing Property results are directly openable and show the owning Client, primary location, field count, and operational area. Import, history, and administrative actions remain secondary under **More property actions**.

Search matches Property name, Client name, address, locality, state or territory, postcode when available, and lot/plan reference. Technical identifiers are not displayed in the primary result.

## Add Property

Add Property begins with Client selection. After selection, confirmed Client locations are offered as starting points with their saved label, address/locality, coordinates, provenance, and primary/secondary context where available.

Selecting a saved Client location copies its location details into the Property draft and intentionally recentres the map. The source Client location is never changed. The operator can search for another address, reposition the Property pin, or use another supported location source. Pin movement marks confirmation stale and retains the current zoom, viewport, and Street/Satellite/Hybrid layer. The final Property location must be explicitly confirmed before saving.

## Validation and information hierarchy

Property name, owning Client, and a confirmed Property location are required. Missing optional details warn but do not block creation. Validation is inline, plain language, focuses the affected section, and preserves all entered form and map state.

Daily Property information appears first. Access information, hazards, sensitive areas, water points, linked work, evidence, and history remain available through progressive disclosure where supported by the current model; no unsupported persistence is introduced in this refinement.

## Verification

Regression coverage proves route-specific presentation, search coverage, direct opening, Client-first creation, safe location inheritance, map-state preservation, explicit confirmation, non-destructive validation, responsive primary actions, and unchanged authoritative API writes. Production acceptance verifies the deployed page while avoiding synthetic records.
