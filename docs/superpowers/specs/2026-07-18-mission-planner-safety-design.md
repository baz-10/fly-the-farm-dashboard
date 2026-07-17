# Mission Register, Planner, Mapping and Safety Design

**Date:** 18 July 2026  
**Status:** Implemented and verified

## Objective

Separate mission history from mission creation and make the planner a focused operational workflow. The planner must support forecast retrieval, detailed editable site annotations, readable duration entry, and a mission-specific JSA that automatically opens risk controls when an answer is unsafe.

## Users and access

- Company administrators and contractors can view mission operational information according to the existing tenant and role controls.
- This release does not broaden financial access or change the previously accepted temporary platform-administrator model.
- Contractors must not gain access to profitability or company financial information through mission screens.

## Navigation and routes

- The Missions navigation item opens a mission register at `/missions`.
- The register contains planning, authorised and completed missions and does not automatically open the planner.
- A **New Mission** action on the register and dashboard opens a clean planner at `/missions/new`.
- Opening an existing mission uses `/missions/:missionId` and loads that mission into the planner.
- The legacy `/mission-planning` route redirects to `/missions` so old bookmarks do not break.
- Legacy links containing a mission identifier redirect to the corresponding mission detail route.

## Mission register

- Show saved missions across planning, authorised and completed states.
- Provide status filtering, search, and clear status labels.
- Each mission can be opened for review or continued planning.
- Provide a prominent **New Mission** action.

## New mission planner

- The new mission route starts with empty mission state and never shows past missions.
- Existing mission selection and historical mission cards are removed from the planner page.
- Existing planning capabilities, including mixed fleets and multiple aircraft, remain available.
- Duration is entered and displayed as hours and minutes while remaining stored as total minutes for backward compatibility.

## Weather

- Provide a **Get Weather** button near the planned date and location controls.
- Weather retrieval requires a planned date and a usable location or coordinates.
- Reuse the existing weather service and store the returned forecast, source and retrieval time in mission planning state.
- If the selected date is outside the provider's available forecast window, show a clear message and retain manual weather entry.
- A failed weather lookup must not erase previously saved weather data.

## Site map and annotations

The boundary editor becomes an operational site map with independently editable layers:

- Field boundary: polygon.
- Buildings: polygons.
- Obstacles: points.
- Points of interest: points.
- Primary landing zone: one point.
- Secondary landing zone: one point.
- Signage locations: points.

Users select the active drawing type before adding a feature. Features can be selected, edited and deleted. The map includes a persistent legend using distinct operational colours/icons and feature counts.

KML, SHP and ZIP imports continue to create field boundary geometry. Importing a boundary does not lock the map: all annotation types can still be added and edited afterward. Existing missions and fields without annotations remain valid.

## Mission checks (JSA)

Every question requires a **Yes** or **No** answer and provides its own optional notes area. The exact questions are:

1. Have you investigated the necessary maps and charts (either hard copy or electronic) for the area?
2. Have you determined if the weather is suitable for the RPA and the operation?
3. Have you reviewed the NOTAM related to the operations area?
4. Is there a possibility of a person moving into the area of operation or landing area during flight?
5. Are there footpaths, or other rights of way?
6. Is there a suitable take-off and landing areas (including alternate landing area)?
7. Is there an ability to maintain 30m horizontal separation from the public?
8. Are there obstructions (buildings, trees etc.)?
9. Is there a possible radio or GPS interference (power lines, antennas etc.)?
10. Will you have the ability to maintain VLOS / EVLOS?
11. Does the Remote pilot's ability match the location/task?
12. Are there privacy concerns?
13. Will there be a need for signage?

An additional general comments area supports information for operational approvals or stakeholder documentation.

## Unsafe-answer rules

The system evaluates the safety meaning of each answer rather than treating every **Yes** as unsafe.

- **No is unsafe** for questions 1, 2, 3, 6, 7, 10 and 11.
- **Yes is unsafe** for questions 4, 5, 8, 9, 12 and 13.

Each unsafe answer creates or activates its own linked Risk Control Form. Returning the answer to a safe value resolves the trigger but does not silently discard entered mitigation notes.

## Risk Control Form

- Each triggered form identifies the source JSA question.
- The assessor records likelihood and consequence, producing a risk score.
- An initial score below 6 requires no additional mitigation.
- An initial score of 6 or above requires mitigation procedures and a residual likelihood/consequence score.
- The residual score must be below 6.
- A mission with an unanswered JSA question, an unassessed trigger, or a residual score of 6 or above cannot proceed to authorisation.
- The interface clearly distinguishes **Ready**, **Needs mitigation**, and **Cannot proceed** states.

## Data compatibility

- Extend mission planning state with optional map annotations, weather metadata and the new JSA/risk-control records.
- Keep existing mission records readable by applying safe defaults when the new fields are absent.
- Retain total duration minutes as the persisted value.
- Preserve tenant identifiers and existing mission service boundaries.

## Visual direction

The screens retain the current Fly the Farm operational green system and Material UI foundations. The mission register is quiet and scan-focused. The planner's memorable element is the operational map legend paired with a persistent mission-safety status: colours and labels communicate real map feature types and readiness rather than acting as decoration. Existing typography and spacing are retained to avoid an unrelated rebrand during workflow work.

## Verification

Automated tests must cover:

- Missions navigation and route redirects.
- Clean new planner state with no mission history.
- Register status filtering and mission opening.
- Duration conversion between minutes and hours/minutes.
- Weather preconditions, success and failure preservation.
- Annotation creation, replacement of unique landing zones, editing, deletion and boundary-import preservation.
- All 13 JSA questions and their exact unsafe-answer mapping.
- Risk thresholds and authorisation blocking.
- Backward compatibility for missions missing new optional fields.

The completed workflow must also be exercised manually from the register through mission creation, weather retrieval, site mapping, JSA, mitigation and save.
