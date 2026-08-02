# Mission Weather Location Capture and Delta T Display

Status: Approved by Product Owner on 2026-08-03  
Requirements: NEW-WEA-001, IMP-MIS-004

## Objective

Remove manual coordinate entry from authoritative Mission Weather while making the server-calculated Delta T visible to the operator.

## User workflow

The existing Mission Weather panel provides a `Capture current location` action. The operator deliberately invokes it, responds to the browser location permission prompt, and receives read-only latitude and longitude values. Weather cannot be saved until a location has been captured successfully. Permission denial, unavailable positioning, invalid coordinates, or capture failure produces a visible error and creates no Weather evidence.

The operator enters the remaining observation fields and saves through the existing trusted command. The browser does not calculate or submit Delta T. PostgreSQL calculates Delta T from temperature and relative humidity. The saved response and reopened authoritative observation display that persisted value prominently.

## Boundaries

- No automatic location request when the panel opens.
- No editable latitude or longitude fields.
- No client-side Delta T calculation or fallback.
- No browser or legacy persistence.
- Existing authentication, permission, tenant, operating-location, versioning, audit and outbox controls remain unchanged.

## Error handling

Location failures remain local validation failures and do not call the Weather write API. API or concurrency failures remain visible and do not create misleading local evidence. If a save response does not contain authoritative Delta T, the UI must not invent one.

## Acceptance criteria

1. The deployed Mission planner captures browser-provided coordinates after an explicit operator action.
2. Captured coordinates are read-only and included in the trusted Weather command.
3. Save is blocked until coordinates and every other mandatory field are present.
4. Location denial or failure is explained and persists no Weather observation.
5. Delta T is calculated by PostgreSQL and displayed from the saved/retrieved authoritative record.
6. Coordinates and Delta T survive refresh, re-login and a second authorised session.
7. Existing concurrency, tenant/location isolation, audit and outbox behaviour remains enforced.

