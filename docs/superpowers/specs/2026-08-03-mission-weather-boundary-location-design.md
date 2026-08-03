# Mission Weather Boundary Location Fallback Design

## Decision

Device GPS remains the preferred source for manual pre-flight Weather location. When device GPS is denied, unavailable, times out, or returns invalid coordinates, the operator may explicitly choose **Use Mission boundary location**. No automatic substitution is permitted.

## Evidence model

Each immutable Weather observation records the coordinates, `location_source` (`DEVICE_GPS` or `MISSION_BOUNDARY`), capture timestamp, GPS accuracy when applicable, GPS failure reason when applicable, centroid calculation version, the exact Mission map revision ID and version, and the exact boundary geometry ID used. Existing observations are classified as `LEGACY_RECORDED` rather than being falsely attributed to GPS.

For `MISSION_BOUNDARY`, the server resolves the current authoritative Mission map revision and validates that the submitted revision and geometry IDs belong to the same organisation, Mission, and operating location. It validates the selected geometry as a valid saved operational boundary or treatment-area polygon and calculates the centroid authoritatively. Submitted coordinates must match that result. This makes the evidence historically reproducible even after later map revisions.

## User workflow

The operator first attempts **Capture current location**. Successful capture displays **Location source: Device GPS**. A failed attempt displays its reason and, only when a valid authoritative boundary is loaded, offers **Use Mission boundary location**. Explicit selection displays **Location source: Mission boundary centroid** and a notice that device location was unavailable. If no valid boundary exists, the panel displays a clear blocker and cannot save invented coordinates.

## Downstream use

Current fallback observations satisfy Weather readiness under the same freshness, inversion, completeness, permission, tenant, and operating-location rules as GPS observations. Readiness retains the source. Mission Authorisation snapshots the selected observation as it does today. Mission Pack rendering identifies the location as either Device GPS or Mission boundary centroid.

## Security and integrity

The existing trusted server API, permissions, membership/location checks, RLS, immutable revisions, optimistic concurrency, audit event, and transactional outbox remain mandatory. Audit and outbox payloads include location source and boundary references. No local or legacy persistence is introduced.

## Acceptance

Tests cover GPS success, denied/unavailable GPS, explicit fallback, server centroid calculation, mandatory revision/geometry retention, invalid or absent boundaries, persistence, readiness, historical reproduction after map changes, audit/outbox evidence, tenant/location denial, and Mission Pack source labelling.
