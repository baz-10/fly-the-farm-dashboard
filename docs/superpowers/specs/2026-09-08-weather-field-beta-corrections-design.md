# Weather Centre and Multipart Field Beta Corrections

## Purpose

Correct two independent Production Beta defects without changing operational authority: Weather Centre forecast timing/presentation and multipart Field boundary retention.

## Release boundary

- Start from accepted `main` SHA `760399c354d5193b72a4c3173fa52450fd96cd8b`.
- No Production mutation, migration, deployment, alias change, or genuine record mutation during implementation.
- Deliver the two corrections as independently testable commits on one review branch.

## A. Weather Centre correction

### Time authority

The server must not treat the first provider hour or an unqualified provider-local string as authoritative “now”. It must validate the provider timezone metadata, associate provider-local timestamps with that timezone, and select the first complete hourly bucket at or after the actual retrieval instant. The response must expose enough safe timing metadata for the client to display the location timezone and freshness. Stale or internally inconsistent provider data must fail into the existing degraded-weather state rather than present an old window as current.

The two-hour chart and written Next 24 hours cards must consume the same rolling hourly series. At 20:22 local time, an hourly forecast begins at the next available provider bucket (normally 21:00); the two-hour sampling then continues 21:00, 23:00, and so on.

### Inversion authority

The result is named **Forecast inversion potential**, never a measured inversion or Delta T. It remains an advisory surface-weather proxy using provider day/night, wind, cloud, humidity, and temperature trend inputs. Low/Medium/High results must include a compact factor explanation and the permanent warning that onsite assessment is required. Missing required proxy inputs must produce `Unknown`, not silently default to Low.

The model must have deterministic fixtures for credible Low, Medium, High and Unknown conditions. It must not claim a vertical temperature profile is available.

### Presentation

- Preserve the existing written current and hourly cards.
- Give the left wind axis adequate width and an explicit `Wind (km/h)` label.
- Label the right axis `Forecast inversion potential` with Low/Medium/High ticks.
- Add a clear legend for wind speed, gusts and inversion potential.
- Use green/amber/red inversion segments or dots, subtle day/night visual distinction, recognisable condition icons, and a visible `Now` reference without decorative clutter.
- Keep wind-direction arrows and textual compass labels.
- Use responsive layouts in Chromium and WebKit without clipped axes or overlapping labels.

## B. Multipart Field boundary correction

### Boundary authority

A Field boundary is an ordered collection of one or more polygon outer rings. `boundaryCoords` remains a compatibility projection of the first/largest polygon only; it cannot be the authority for a multipart import. A new `boundaryPolygons` field carries every validated polygon through import, form state, API/storage and subsequent reads.

No area may be calculated from a different geometry than the geometry displayed and persisted. The authoritative Field area is the sum of all retained polygon areas.

### Add/edit/display flow

- Add Field must pass `polygons` and `onPolygonsChange` to `FieldBoundaryEditor`.
- Importing 14 valid polygons must show 14 polygons, a 14-paddock label, and the summed area.
- The map must fit the combined bounds of every polygon rather than only the compatibility polygon.
- Saving must persist the entire collection and reopening must restore it.
- Editing a multipart Field must not discard secondary polygons.
- Manual single-polygon drawing remains compatible.
- Malformed or empty rings fail closed; holes are not silently converted into independent paddocks.

### Persistence

Use the repository's existing Field JSON/remote model if it can retain the bounded polygon array safely. If the authoritative Production schema cannot represent `boundaryPolygons`, stop and return a migration/API design for separate approval rather than hiding the geometry in a file attachment or truncating it.

## Verification

### Weather

- Provider timezone and current-instant selection tests, including UTC/local mismatch and stale responses.
- Low, Medium, High and Unknown inversion proxy fixtures.
- Shared rolling-window tests for chart and cards.
- Chromium and WebKit checks for axes, labels, responsive layout, icons, current marker and advisory wording.

### Fields

- Import fixture with 14 disjoint polygons and a summed area distinct from the largest polygon.
- Add, save, read, edit and reopen tests proving every polygon survives.
- Combined-bounds map test.
- Single-polygon compatibility and invalid-ring rejection tests.
- API decoding and tenant-scoped persistence tests where applicable.

### Shared gates

- Focused tests, deterministic sharded regression, Product Maturity, Production build, diff check and independent review.
- Non-mutating release rehearsal only after merge approval.

## Out of scope

- Authoritative inversion detection from vertical temperature-profile sensors.
- Changes to Mission weather evidence or operational authorisation.
- Editing individual imported polygon vertices as separate paddocks beyond existing editor capabilities.
- Production migration or deployment.
