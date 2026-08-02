# Authoritative Mission Weather Evidence Design

**Status:** Product Owner approved, 2 August 2026  
**Requirements:** `NEW-WEA-001`, `IMP-MIS-004`

## Outcome

Fly The Farm can capture, retain, assess, and select exact weather evidence inside the existing Mission planner. Weather remains part of Mission—not a separate administrative module—and never falls back to browser or legacy persistence.

## Model

`mission_weather_observations` is an immutable, organisation- and location-owned evidence stream. Every row has a stable ID and monotonically increasing Mission weather version, Mission and operating-location IDs, source (`MANUAL` or `OPEN_METEO`), provider metadata, observation place and coordinates, observation/retrieval timestamps, atmospheric readings, explicit inversion assessment, provenance, actor, and authoritative Personnel observer where manual.

`mission_weather_selections` records the exact observation ID and version selected for review. Future readiness, authorisation, and Mission Pack evidence pointers extend this same protected-reference model; later observations never alter prior evidence.

`organisation_weather_policies` provides manual and provider freshness minutes, approaching-expiry lead time, and future verification/assignment flags. Production Beta defaults allow a manual observation immediately, require an active observer linked to the Mission Personnel revision, and do not require second-person verification.

## Calculation and freshness

PostgreSQL calculates wet-bulb temperature and Delta T with the documented Stull approximation:

`Tw = T·atan(0.151977·sqrt(RH+8.313659)) + atan(T+RH) − atan(RH−1.676331) + 0.00391838·RH^1.5·atan(0.023101·RH) − 4.686035`

`Delta T = T − Tw`, rounded to one decimal. If a client supplies Delta T and it differs by more than `0.3 °C`, the command rejects the observation atomically.

Freshness is evaluated against the current evaluation time for operational use and the Mission scheduled time when evaluating planned readiness. It returns `CURRENT`, `APPROACHING_EXPIRY`, or `EXPIRED` using the applicable source threshold and policy lead time. Stored evidence is immutable; freshness is derived each time so an old observation cannot remain silently valid.

## Inversion evidence

Every observation records `NOT_ASSESSED`, `UNLIKELY`, `POSSIBLE`, `LIKELY`, `CONFIRMED`, or `UNABLE_TO_DETERMINE`, plus assessment source, assessor Personnel ID when applicable, timestamp, and notes. The server never infers an inversion classification from unrelated readings.

## Commands and controls

- `ftf_create_mission_weather_observation`: validate tenant, location, Mission, permission boundary, active Personnel observer, Mission assignment policy, required fields, coordinates, ranges, explicit inversion state, Delta T, version, audit, and outbox in one transaction.
- `ftf_read_mission_weather`: return immutable history, selected evidence, calculated Delta T, and dynamically evaluated freshness.
- `ftf_select_mission_weather_observation`: optimistic-concurrency selection for Mission review evidence.
- `ftf_evaluate_mission_weather_readiness`: return structured blockers, warnings, missing fields, source, freshness, inversion, observer/assignment, and selected-evidence status.

Forced RLS and server-authoritative checks enforce tenant and operating-location isolation. Authenticated clients cannot write tables directly. API handlers enforce authentication, `weather.read`, `weather.observe.manual`, `weather.observe.provider`, `weather.select`, and Mission-location scope before trusted RPC calls.

## Provider boundary

The frontend calls the Spray Command API only. A provider-neutral server adapter converts Open-Meteo responses into the unified observation command, preserving provider ID, retrieval time, source coordinates, governed raw snapshot, and transformation metadata. Provider failure never creates partial evidence or replaces the selected observation.

## Existing Mission UI

The existing authoritative Mission planner gains an active Weather panel after Mission creation. It shows selected/current evidence, source, observer, location/time, readings, Delta T, explicit inversion assessment, freshness, blockers, warnings, immutable history, manual-entry controls, Open-Meteo retrieval, and evidence selection. The existing local Weather panel remains untouched for legacy-only mode, but Production Beta remote mode has no local fallback.

## Acceptance

Tests and deployed evidence must prove manual and Open-Meteo creation, calculation tolerance, freshness transitions and policy overrides, readiness detail, Personnel linkage and assignment enforcement, tenant/location/permission denial, optimistic concurrency, immutable revisions and selection, audit/outbox, refresh/re-login/second-session persistence, and absence of legacy fallback.

