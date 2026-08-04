# Guided Mission Creation Design

**Status:** Product Owner approved through the Critical Phase 2 Workflow Correction.

## Purpose

Replace `/missions/new` as a flat database-resource form with a ten-step guided operational workflow. Existing Mission detail routes remain the advanced edit experience after an authoritative Draft exists.

## Root Cause

The trusted Client command and the remaining parent-resource APIs are operational. The failure is orchestration: New Mission starts with a Job selector and exposes no inline way to create a Client, Property, Field boundary, or Job. A zero-record operator therefore cannot satisfy the first control.

## Workflow

1. Customer: select or minimally create an authoritative Client.
2. Property: select a Client property or create one using address search/manual fallback and coordinates where resolved.
3. Field: select or create a Field, draw/upload its boundary, calculate area, and save an immutable field-boundary version.
4. Job: select an open matching Job or minimally create one with the parent chain prefilled.
5. Mission: create the authoritative Draft and stable Mission ID.
6. Map: continue in the existing authoritative Mission map using the Field boundary as an explicit starting point.
7. Resources: existing eligible Aircraft, Equipment Kit and Personnel workflows.
8. Weather & Chemicals: existing forecast and chemical planning workflows.
9. JSA: existing Mission Checks, triggered controls and policy approval.
10. Review: grouped completion state and blockers with jump-back controls.

The first five steps are the creation wizard. Once the Draft exists, the same page changes to the established advanced Mission Planner and displays a persistent ten-step progress navigator. This avoids duplicating evidence components or creating a second Mission implementation.

## Persistence and Resume

Every completed resource is written immediately through the current Operational Data gateway. No wizard state is authoritative and no browser storage is used. A created Draft redirects to its stable Mission route. Resume derives progress from PostgreSQL resources and authoritative evidence APIs, reopening at the first incomplete stage.

## Boundaries

Field geometry and Mission geometry remain separate. The creation workflow saves a Field plus an immutable Field Boundary Version. The Mission map may explicitly copy that geometry as a starting point; later Mission edits never mutate the Field.

## Error and Security Behaviour

Inline commands retain existing validation, tenant isolation, operating-location scope, audit, outbox and optimistic concurrency. A failed command stays on its step, displays the server error, and does not fabricate or locally retain a resource.

## Acceptance

An authorised operator can create Client → Property → Field + boundary → Job → Draft Mission without leaving the workflow, then continue through existing map, resources, Weather, Chemicals and JSA. Refresh, re-login and a second authorised session resolve the same persisted chain. Tenant and location denial remain enforced.
