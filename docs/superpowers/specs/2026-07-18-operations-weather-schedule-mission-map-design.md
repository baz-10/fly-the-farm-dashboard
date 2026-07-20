# Operations, Weather, Schedule, and Mission Map Design

## Purpose

Build a coherent operational workspace that gives agricultural drone operators an aligned Operations dashboard, a seven-day mission calendar, useful spray-weather decision support, and safe, editable mission-map features. The release must preserve existing missions and must not make Weather, Schedule, trucks, trailers, work packs, or map annotations mandatory for mission authorisation unless an existing mission rule already requires them.

## Scope and delivery order

The work is one shared foundation delivered in two stages:

1. Operations, Schedule, Weather, and navigation.
2. JSA risk context and safe Point, Line, Shape, boundary, and note editing in New Mission.

Shared models and utilities are built before page-specific presentation so Schedule and Operations use the same mission-booking rules, and Operations, Weather, and New Mission use the same weather calculations.

## Operations dashboard

### Grid and panel behaviour

- All primary dashboard panels use one shared locked outer height at desktop breakpoints, with equal internal padding and aligned headings and actions.
- The grid may use different column widths, but every primary panel occupies the same vertical height so rows and card edges remain consistently aligned.
- Content does not increase the outer card height. Lists that exceed the available body space scroll inside their panel.
- On narrow screens cards stack naturally and use a content-aware minimum height; the locked desktop grid must not create unusable empty space on mobile.

### Today and upcoming spray schedule

- Rename the card from `Today's Spray Schedule` to `Today and upcoming`.
- Show missions scheduled from the current local calendar day through the following six days.
- Group missions by date and sort each group by scheduled time.
- Each booking shows time, mission name or client, location, aircraft summary, and mission status.
- The card has a fixed body height and internal scroll when more bookings exist than fit.
- `View all` and the Operations header's `View Schedule` action navigate to `/schedule`.
- The empty state distinguishes `No missions today` from `No missions in the next seven days` and offers `Plan mission`.

### Weather card

- The compact card shows current and today's forecast conditions for the operator's selected location, not a saved mission's weather window.
- On first use, request browser/device geolocation only after the operator initiates location use or the app displays a clear location prompt.
- When permission is granted, resolve and display a human-readable location.
- When permission is denied or unavailable, use the last selected location. If no previous location exists, show location search without blocking the rest of Operations.
- Location search accepts a place name and stores the last selected and recent locations per user.
- Show location, observation/forecast timestamp, temperature, relative humidity, wind direction and speed, gusts, rain chance, Delta T, and inversion potential.
- Provide `Refresh` and `Open Weather` actions.
- A failed refresh retains the last successful weather result, marks it as stale, and displays its timestamp.

## Schedule page

- Add an authenticated `/schedule` route and `Schedule` item in the left navigation for company admins and contractors.
- The default view is a seven-day operational week beginning on the locale-appropriate start of week.
- Provide `Day`, `Week`, and `Month` view controls, with `Week` selected initially.
- Provide previous, today, and next date controls.
- Mission booking cards show scheduled time, mission name, status, location, and assigned aircraft count or summary.
- Status colours reuse the mission-register status system.
- Selecting a booking opens `/missions/:missionId`.
- `New Mission` opens `/missions/new`.
- Calendar views consume existing mission records; no duplicate booking store is introduced in this release.
- Unscheduled draft missions remain in the Missions register and do not appear as dated calendar bookings.

## Weather page and calculations

### Page capabilities

- Add an authenticated `/weather` route and `Weather` item in the left navigation for company admins and contractors.
- Reuse the selected Operations location and permit a new search, device-location refresh, and recent-location selection.
- Show current conditions, an hourly forecast, and a seven-day forecast.
- The hourly view graphs or tabulates temperature, relative humidity, wind, gusts, rain chance, Delta T, and inversion potential.
- Highlight potential spray windows but never label forecast conditions as authorisation to spray.
- Show source, forecast issue/retrieval time, location coordinates at sensible precision, and stale-data status.

### Provider boundary

- Weather access sits behind a provider adapter so a global forecast provider can be replaced or supplemented later without changing dashboard, calendar, or mission components.
- The initial provider must support geocoding, current conditions, hourly temperature, relative humidity, wind speed/direction, gusts, precipitation probability, cloud cover, and sunrise/sunset for global locations.
- Cache successful results by rounded location and forecast issue period. Manual refresh may bypass the cache.
- Provider errors return typed failure states and never block mission creation or authorisation.

### Delta T

- Delta T is dry-bulb temperature minus wet-bulb temperature in degrees Celsius.
- Wet-bulb temperature is derived from forecast air temperature and relative humidity using one documented, tested approximation across all surfaces.
- Display the source temperature and humidity with the calculated value.
- General display bands are:
  - `Preferred`: Delta T from 2 through 8 inclusive.
  - `Marginal`: below 2, or greater than 8 through 10 inclusive.
  - `Unsuitable`: above 10.
- These bands are decision support only. Product-label restraints and on-site measurements take priority.
- Reference: GRDC Spray Application Manual Module 10, updated February 2024: <https://grdc.com.au/__data/assets/pdf_file/0019/234820/GRDC_SM_Module_10_2024.pdf>.

### Inversion potential

- The product reports `Low`, `Moderate`, or `High forecast inversion potential`; it never reports that an inversion is definitively absent or present from ordinary forecast data alone.
- The initial deterministic heuristic evaluates:
  - the period from two hours before sunset through two hours after sunrise;
  - low or calm forecast wind, with particular attention below 11 km/h;
  - falling near-surface temperature;
  - low cloud cover or clear-sky radiative-cooling conditions;
  - fog, mist, dew/frost proxies, or very high relative humidity when data is available;
  - any available provider atmospheric-stability or multi-level temperature signal.
- `High` potential displays `Do not spray—verify conditions on site` and the observable warning signs operators must check.
- `Moderate` displays `Conditions may support an inversion—verify on site before spraying`.
- `Low` displays `Low forecast potential—an on-site check is still required`.
- No forecast rating overrides a chemical label or the prohibition on spraying during hazardous surface temperature inversion conditions.
- References:
  - APVMA spray drift definitions: <https://www.apvma.gov.au/resources/using-chemicals/spray-drift/spray-drift-definitions>.
  - APVMA spray drift labelling: <https://www.apvma.gov.au/registrations-and-permits/apvma-labelling-codes/alc/spray-drift-labelling-alc>.

## New Mission safety workflow

### JSA answers and risk controls

- Preserve the existing mission-check questions and the rule that only the unsafe answer for each question triggers a risk control. Not every literal `Yes` is unsafe; positive capability questions continue to trigger on `No`.
- Every JSA question retains its own editable notes field.
- A triggered risk-control form displays a read-only context block containing:
  - the full JSA question;
  - the answer that triggered the control;
  - the current JSA notes for that answer.
- Editing JSA notes immediately updates the context shown in its risk-control form without overwriting mitigation text.
- Risk-control mitigation procedures and residual-risk fields remain separate from JSA notes.
- Removing the unsafe answer removes the active control from the assessment. Existing entered control data may be retained in UI state during the current edit session for accidental-toggle recovery, but only active triggered controls are persisted as current risk controls.
- Mission approval continues to require every check answered, every triggered initial risk assessed, mitigation and residual scoring where the initial score is 6 or greater, and every residual score below 6.

## Mission map and boundary editing

### Geometry model

- Extend mission map geometry to support GeoJSON-compatible `Point`, `LineString`, and `Polygon` feature geometries.
- Every mission map feature stores a stable ID, feature type, operator-editable name, operator-editable notes, geometry, and optional source metadata.
- Existing point and polygon features load without manual migration. Missing name or notes values normalise to the existing label and an empty string.
- Boundary polygons remain distinct from non-boundary mission features but use the same stable feature-level editing principles.

### Drawing modes

- For buildings, obstacles, points of interest, primary landing zones, secondary landing zones, and signage, operators may choose `Point`, `Line`, or `Shape` before drawing.
- The interface suggests sensible defaults by feature type without preventing another geometry choice.
- Point mode completes on one click.
- Line mode accepts two or more vertices and completes through an explicit `Finish line` action.
- Shape mode accepts three or more vertices and completes through an explicit `Finish shape` action.
- Cancelling an unfinished drawing discards only that draft geometry.

### Imported KML and SHP boundaries

- Import converts source geometry into one or more editable polygons while retaining source-file metadata separately.
- Imported polygons and drawn polygons receive stable polygon IDs. Vertex edits target polygon ID plus vertex index, never the entire mission or boundary-file collection.
- Moving a vertex updates only that vertex.
- Deleting a vertex updates only that polygon. A polygon may not be left with fewer than three vertices.
- When removal would invalidate a polygon, offer `Delete this polygon` as a separate confirmed action; never silently remove the whole boundary.
- Deleting one polygon from a multi-polygon import preserves the other polygons and the mission.
- Deleting the last polygon requires a specific boundary-removal confirmation and still preserves the mission draft and its other data.
- Mission deletion remains a separate mission-level action outside the map editor.

### Editable map key / feature register

- Replace the count-only legend and separate delete list with one editable feature register directly below the map.
- Include boundary polygons and all non-boundary features.
- Each row shows colour/symbol, type, geometry kind, name, notes summary, and actions for `Edit`, `Zoom`, and `Delete`.
- Editing permits name and notes changes and, where valid, geometry changes through the map editor.
- Deleting is scoped to the selected feature or selected boundary polygon and requires confirmation for boundary polygons and other high-impact shapes.
- Empty notes are allowed, but every feature presents a notes input so operators can add operational context.
- Feature names and notes persist with mission planning state and load when the mission is reopened.

## Data compatibility and authorisation safeguards

- Existing mission records, JSA records, boundary coordinates, boundary polygon arrays, imported file metadata, and map features remain readable.
- Normalisation occurs at the model boundary; page components do not contain ad hoc legacy-data branches.
- Schedule, Weather, trucks, trailers, work packs, and optional map annotations do not become mandatory mission-authorisation conditions.
- Existing required boundary and JSA rules remain in force.
- A weather-provider outage, denied geolocation, or missing forecast does not erase saved mission weather and does not independently block authorisation.

## Error handling

- All weather surfaces distinguish loading, fresh, stale, unavailable, permission-denied, and location-not-found states.
- Schedule distinguishes no bookings from mission-load failure.
- Map import reports unsupported or malformed geometry without changing the current boundary.
- Feature edits are applied only after validation; failed edits leave the last valid mission geometry intact.
- Destructive map actions name the exact target in their confirmation text.

## Verification

Automated tests must cover:

- dashboard seven-day grouping, card height/layout contracts, and Schedule navigation;
- Day, Week, and Month calendar grouping and mission navigation;
- location fallback, caching, stale weather, and provider-error behaviour;
- Delta T calculation and display bands at boundary values;
- inversion-potential rules around sunrise/sunset, wind, cloud, humidity, and missing data;
- JSA unsafe-answer semantics, question/answer/notes prefilling, and mitigation preservation;
- Point, LineString, and Polygon normalisation and persistence;
- KML/SHP multi-polygon import, vertex move/delete, polygon deletion, and proof that no feature-level action deletes a mission;
- editable key name/notes persistence and targeted deletion;
- legacy mission and annotation loading;
- unchanged mission-authorisation behaviour when Schedule, Weather, optional vehicles, work packs, or annotations are absent.

Browser usability checks must cover desktop and narrow layouts for Operations, Schedule, Weather, and New Mission, including keyboard-visible focus, internal card scrolling, map drawing completion/cancellation, feature editing, and reopening a saved mission.

## Out of scope

- Drag-and-drop dispatching or rescheduling directly on the calendar.
- A separate booking database or non-mission appointments.
- Claiming that a forecast alone confirms or clears a hazardous surface temperature inversion.
- Automatic mission authorisation from forecast conditions.
- Full professional GIS topology tools, line splitting, polygon holes editing, or shapefile export.
- Weather-station hardware integration; the provider adapter leaves room for this later.
