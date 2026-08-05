# SC-013 Home / Operations Brief Design

**Status:** Approved
**Priority:** P0
**Requirements:** `SC-011`, `SC-012`, `SC-013`

## Purpose

Home is a Daily Operations Brief for operators and Operations Managers. Within sixty seconds it answers what is happening today, what needs attention, what is coming up and what work the user wants to open. Home informs; approved Mission, compliance and safety lifecycle gates enforce.

## First implementation slice

The page contains four independent primary areas: Weather Snapshot, Today's Schedule, always-available Quick Actions and advisory Next Best Actions. A critical warning may be prominent but never replaces, disables or hides these areas. Fleet, Personnel, finance and analytical expansion remain outside this slice.

## Weather

Weather uses the authorised operating location automatically when there is one. With multiple locations, the trusted server returns the user's stored selection and accepts an explicit selection update. Missing coordinates produces a direct `Set weather location` action while the rest of Home remains usable. Device location is requested only from an explicit `Use my current location` action and never silently replaces the operating-location preference.

The compact snapshot shows location, current/minimum/maximum temperature, wind, gusts, direction, rain probability and amount where available, condition, humidity, Delta T, spray-condition status, source and retrieval time. It opens `/weather`, whose focused first version shows current conditions, hourly operational values, seven days and advisory spray windows using shared portable weather-domain logic. Forecast guidance never becomes pre-flight evidence or Mission authorisation.

## Schedule and actions

Today's Schedule shows authoritative Mission items in time order with client/location context where available, status and one direct next action. Its calm empty state offers New Mission, Open Schedule and View Draft Missions. Quick Actions always include New Mission and expose permitted direct routes for draft continuation, Clients, Properties, Fields, Jobs, Schedule and Search through a compact `More actions` disclosure.

Next Best Actions combine explainable Mission preparation and authorised compliance warnings. Each item shows a plain-language title, reason, urgency, source area and direct action. Ordering is advisory only.

## Data and security

A cohesive trusted-server Operations Brief endpoint assembles scoped source records and weather data; Home does not manufacture authoritative state from browser storage. It respects organisation, assigned operating locations, permissions, Personnel privacy, restricted compliance evidence and Assisted Support scope. No Mission, weather, compliance or schedule evidence is duplicated.

## Acceptance

The four primary areas remain visible during critical compliance states. Weather and schedule data survive refresh and re-login through authoritative source records and server-side preference. All buttons open real workflows. Desktop, tablet and mobile layouts remain scannable and field-legible. Provider failure is visible, retains no invented values and never blocks navigation or planning.
