# Operational Closeout Design

## Decision

Implement the approved six-step Operational Closeout Workflow inside the existing Mission planner. The workflow is operator-led, while storage remains a set of independently immutable operational evidence records.

## Workflow

1. Operational Data Import accepts final aircraft KML, flight lines, telemetry and flight logs. It retains the original file and provenance, parses supported KML geometry, and derives treatment area, duration, coverage geometry and available flight statistics. Unsupported files fail visibly without altering authoritative evidence.
2. Actual Resources starts from the authorised plan and records the aircraft, equipment, personnel, batteries, reloads and refills actually used.
3. Actual Chemical Usage starts from the authorised chemical plan. “No change” snapshots the plan as actuals; otherwise the operator records actual products, rates, water, batches and treatment area.
4. Operational Events records zero or more immutable events, or an explicit “No operational events” declaration.
5. Operational Review presents planned versus actual differences and captures notes. Submission creates an immutable Operational Evidence revision selecting the exact child evidence records.
6. Mission Completion freezes Planning, Pre-flight and the selected Operational Evidence revision into immutable Completion Evidence.

## Data Boundaries

- `mission_operational_imports`: internal file identity, storage coordinates, checksum, format, parsing result, derived statistics and immutable provenance.
- `mission_operational_resource_revisions`: actual aircraft, equipment, personnel, batteries, reloads and refills.
- `mission_operational_chemical_revisions`: actual chemical and water usage.
- `mission_operational_events`: independently immutable events or the explicit none declaration.
- `mission_operational_revisions`: submitted review snapshot and selected child evidence IDs.
- `mission_completion_revisions`: immutable lifecycle snapshot referencing authorisation, operational revision and their exact evidence manifests.

All records carry organisation, operating location, Mission, version, actor and timestamps. Append-only triggers prevent mutation. RLS and server-side location checks enforce isolation. Trusted commands atomically create evidence, audit and transactional-outbox records.

## File Strategy

Original files use internal IDs and Supabase Storage adapter coordinates; no provider URL enters domain evidence. The source file is uploaded before its database command, and failed commands trigger storage cleanup. Checksums, filenames, MIME types, formats, parse metadata and importing identity are retained.

## Completion Rules

Completion requires an existing Mission Authorisation and a submitted Operational Evidence revision. Flight-line evidence is normally mandatory. An authorised override requires an explicit reason and records the approving Personnel, audit event, outbox event and historical missing-evidence flag. Completion never regenerates Planning or Pre-flight state from current records.

## Production Beta Scope

Support KML flight-line import first and retain other telemetry/log files as authoritative source evidence with operator-confirmed derived values where parsing is unavailable. The model supports later KMZ, shapefile and vendor telemetry adapters without changing the workflow or historical records.

## Acceptance

The deployed Mission planner can import final flight lines, record actual resources and usage, record events or none, compare planned and actual evidence, submit immutable Operational Evidence, and complete the Mission. Refresh, re-login, second-session access, concurrency, tenant/location denial, audit, outbox and absence of browser/legacy persistence are verified.
