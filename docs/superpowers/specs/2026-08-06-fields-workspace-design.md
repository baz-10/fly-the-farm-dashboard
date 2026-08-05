# Fields Workspace Focused Design

## Purpose

Fields is the operational home for a defined area. The first screen answers three daily questions: which Field am I looking for, where does it belong, and what can I do next?

## Approved interaction model

The existing `/jobs?view=fields` route becomes a dedicated Fields workspace without changing the Field domain, API, permissions, tenant boundaries, or detail routes.

Primary actions are Search Fields, Open Field, and Add Field. Import and history remain available under **More field actions**.

Each Field result shows the Field name, owning Property and Client, area, boundary status, location context, and linked work count. Technical identifiers and future intelligence are excluded from the primary card.

## Create flow

Add Field follows the authoritative hierarchy:

1. Select Client.
2. Select one of that Client's Properties.
3. Enter the Field name.
4. Draw or upload the boundary when available.
5. Save the Field and, when supplied, its immutable boundary version.

The selected Property supplies the initial map location and parent context. The workflow does not mutate Client or Property records. A boundary is encouraged but not required, allowing a genuine Field record to be created before boundary evidence is available.

## Operational memory

The workspace deliberately leaves room for Field history and intelligence while exposing only presently authoritative capability. Hazards, sensitive areas, loading points, access, recurring issues, chemical history, outcomes and operational intelligence remain future extensions; the interface must not imply they are persisted until their approved evidence models exist.

## Failure and integrity behaviour

Loading failures are never rendered as an empty Field list. Saves use the existing authoritative commands. A boundary save failure is shown explicitly and does not fabricate success. Existing Field detail routes remain the source for revision history and detailed operational records.
