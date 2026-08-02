# Mission Weather Delta T Source Design

**Status:** Product Owner approved 2026-08-03  
**Requirements:** NEW-WEA-001, IMP-MIS-004

## Objective

Allow a Mission Weather observation to use either an on-site Kestrel Delta T reading or a server-calculated Delta T without losing provenance or silently replacing evidence.

## Existing behaviour

The trusted PostgreSQL command calculates Delta T from temperature and relative humidity. A submitted Delta T is currently only checked against the calculated value and is not retained as a distinct authoritative measurement.

## Approved workflow

The existing Mission Weather panel gains a **Delta T (°C)** field immediately above **Save Manual Weather** and a checkbox labelled **Calculate Delta T from temperature and humidity**.

- When checked, the server calculates Delta T from the entered temperature and relative humidity. The Delta T field is read-only and displays the server result.
- When unchecked, the operator enters the Delta T reported by the on-site Kestrel.
- Kestrel entry remains authoritative even when it differs materially from the server comparison calculation.
- A material variance produces a prominent, non-blocking warning. It never silently substitutes the calculated value.
- Save remains unavailable until the selected Delta T mode has a valid authoritative value.

## Evidence and data model

Each immutable weather observation permanently records:

- authoritative `delta_t_c`;
- `delta_t_source`: `CALCULATED` or `KESTREL_MEASURED`;
- server `calculated_delta_t_c` comparison;
- material-variance status and difference;
- the temperature and relative humidity inputs used for calculation;
- observer, observation time and existing Mission/tenant/location provenance.

Existing observations migrate to `CALCULATED`, with their existing `delta_t_c` retained. No evidence is rewritten.

## Trusted command and API

The existing versioned Mission Weather API remains unchanged at the route level. The create payload adds `deltaTMode` and, for Kestrel mode, `deltaTC`. PostgreSQL remains authoritative for calculation, comparison, validation and stored provenance. Responses expose all Delta T evidence fields required by the UI.

Invalid modes, missing Kestrel values and non-finite/out-of-range values fail visibly without creating an observation, audit record, outbox event or local fallback.

## Security and integrity

Existing server authorisation, tenant/location enforcement, RLS, immutable versioning, optimistic concurrency, audit and transactional outbox behaviour apply unchanged. The client cannot designate a calculated result as authoritative without the trusted command calculating it.

## Acceptance criteria

1. Calculated mode produces and displays a server-calculated authoritative Delta T before final Mission Weather evidence is accepted.
2. Kestrel mode accepts and permanently retains the operator-entered value and source.
3. A material mismatch displays a warning but does not block a valid Kestrel save.
4. Refresh, re-login and a second authorised session show the same authoritative value, source and comparison.
5. Existing Weather observations remain readable and are classified as calculated evidence.
6. Tenant/location denial, stale-write protection, audit, outbox and no-fallback guarantees continue to pass.

## Out of scope

No separate Weather application, automated Kestrel integration, redesigned Mission workflow or change to Mission Authorisation policy is included.
