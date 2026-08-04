# Mission Document Purpose Design

## Status

Approved by the Product Owner on 4 August 2026.

Requirement: `IMP-REP-001`

## Objective

Give each Mission PDF one audience and one purpose. The Mission Pack helps the crew operate the Mission, the Mission Summary explains what actually happened, and the Mission Record preserves the complete immutable history.

## Document Contract

### Mission Pack - operate the Mission

The Mission Pack is a concise operational planning document generated only while the Mission is in Planning or Pre-flight. It is approximately six A4 pages and contains only selected operational values from the latest approved Planning and Pre-flight evidence. It must not print raw evidence trees, internal IDs, checksums, generic database keys, empty evidence structures, operational actuals, Mission Outcomes or Customer Outcomes.

1. Mission Summary: organisation identity and logo, Mission number and status, client, property, field, aircraft and PIC.
2. Mission Map: authoritative planned boundary, exclusions, hazards, launch, landing and access markers. The rendered map must use the exact selected Mission map revision.
3. Weather: selected Planning Forecast followed by selected Observed Pre-flight Weather, limited to operational values, source, observation time, freshness, Delta T and inversion assessment.
4. Chemical Plan: products, rates, tank mixes, water, treatment area and planned loads.
5. JSA and Risk: material hazards, risk ratings, critical controls, emergency contacts and unresolved blockers. Routine metadata is omitted.
6. Pre-flight: readiness checklist, approvals, authorisation identity and sign-off from the exact selected evidence revisions.

The layout uses compact tables, high-contrast section hierarchy, field-legible type and restrained Fly The Farm branding. Every footer shows Mission Number, Client, Property, Report Version and Page X of Y. Overflow within a page is condensed or summarised; it must not silently create a database appendix. If material operational content cannot fit safely, generation fails visibly rather than producing an unbounded pack.

### Mission Summary - summarise the completed Mission

Mission Summary is a new immutable two-page completion report generated only after Mission Completion.

1. Actual Operations: actual weather, aircraft, personnel, chemicals, water, area treated, start and finish times, and operational notes.
2. Outcome and Coverage: completed flight-line visual, final KML and coverage summary, Customer Outcome, and a human-readable link plus QR code to the authorised Mission Record workflow.

The first page displays one plain-language completion status near the top: either `Mission completed successfully.` or `Mission completed with operational exceptions.` The status is derived from immutable Completion and Operational Evidence, never entered as decorative report copy.

Every Mission Summary artefact captures exact Completion and post-Mission evidence references at request time. Later evidence creates a new report version and never rewrites an existing PDF.

### Mission Record - preserve the complete history

Mission Record remains the comprehensive immutable historical archive. Its evidence scope, generation rules and existing versions remain unchanged. It is not the standard operational PDF and is not redesigned by this package.

## Architecture

All three document types use the existing durable report artefact pipeline, private internal file records, checksum retention, tenant/location enforcement, audit, transactional outbox, retries and immutable version history. `MISSION_SUMMARY` is added as a distinct report type with its own permission, completion gate, evidence selector and template version. Domain evidence selection remains separate from PDF rendering.

Mission Pack request validation rejects Operational or later lifecycle states. Mission Summary and Mission Record require immutable Completion Evidence. Public report endpoints remain versioned and continue returning internal artefact metadata rather than provider URLs.

## Error Handling

- Missing selected evidence produces a precise generation error naming the missing operational section.
- An invalid or unavailable map does not produce an empty map page.
- Excess content that cannot be safely summarised fails generation instead of adding uncontrolled pages.
- Report failures remain visible, retryable and safe; existing authoritative artefacts are never replaced.

## Acceptance Criteria

- A representative authorised Mission Pack renders exactly six pages and contains the six approved operational sections.
- The pack contains no Operational Evidence, Completion Evidence, Mission Outcomes, Customer Outcomes, raw JSON, generic evidence manifest or provider identifiers.
- The Mission map is visible and legible with boundary and operational features.
- Weather shows forecast then observation without raw evidence fields.
- Chemical, JSA, controls and pre-flight information remain readable in field conditions.
- A completed Mission produces a separate two-page Mission Summary.
- Mission Summary contains only actuals, coverage and outcome information and links to the Mission Record.
- Mission Summary is impossible before Completion.
- Mission Pack generation is impossible once operations begin.
- Mission Record output and historical versions remain unchanged.
- Tenant isolation, operating-location enforcement, permissions, immutable versioning, audit, outbox, storage checksums and durable worker behaviour remain intact.
- Automated tests assert report type boundaries and page counts.
- Every page is rendered to an image and visually checked for clipping, overlap, broken maps, unreadable tables and malformed headers or footers before deployment.

## Out of Scope

No Mission UI redesign, Mission Record redesign, evidence-model rewrite, browser-generated authoritative PDF, provider URL exposure, advanced analytics or Operational Knowledge publishing is included.
