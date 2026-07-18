# Mission Register Status Stack Design

**Date:** 18 July 2026  
**Status:** Approved for implementation

## Objective

Make mission progress immediately scannable by replacing the mixed register list with four clearly separated vertical status sections.

## Section order and mapping

1. **In Progress** — missions with status `Flying`.
2. **Authorised** — missions with status `Approved`.
3. **Planning** — missions with status `Planning`.
4. **Completed** — missions with status `Completed` or `Locked`.

The order is fixed so active operational work always appears first. Each section displays its mission count and an intentional empty state when no missions match.

## Mission cards

Each mission card displays:

- mission name and number;
- scheduled date;
- property, field or saved mission location;
- assigned aircraft registration when available;
- status/readiness label;
- a plain-language next action;
- an Open action linking to `/missions/:missionId`.

Next-action wording follows mission state:

- Flying: **Record flight progress or completion**.
- Approved: **Ready to commence flight**.
- Planning: use planning/JSA readiness where available; otherwise **Continue mission planning**.
- Completed or Locked: **Review completed mission**.

## Filtering and interaction

- Search filters mission cards across all four sections without mixing their section placement.
- The existing status dropdown is removed because status is represented by the stacked sections.
- In Progress, Authorised and Planning remain expanded.
- Completed starts collapsed when it contains missions and can be expanded by the user.
- Section controls are keyboard accessible and retain clear focus styling.
- Empty search results display within each section rather than replacing the entire register structure.

## Visual direction

Retain the current dashboard typography, spacing and operational green palette. Use colour only as status information:

- In Progress: green.
- Authorised: blue.
- Planning: amber.
- Completed: neutral grey.

Section headers, counts and left-edge card accents create the hierarchy. Avoid decorative colour that does not encode mission status.

## Verification

Automated tests cover section order, status mapping, counts, search filtering, Completed collapse/expand, mission navigation and empty states. A browser check confirms the layout is readable at the deployed desktop viewport.
