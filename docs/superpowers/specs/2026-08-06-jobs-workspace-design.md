# Jobs Workspace Focused Design

## Purpose

Jobs is the operational work register. The workspace lets an operator find current or historical work, open it directly, or start a new Job from known Client, Property and Field context.

## Approved interaction model

The existing `/jobs?view=jobs` route becomes a dedicated Jobs workspace without changing the Job domain, API, permissions, tenant boundaries, creation form or detail routes.

Primary actions are Search Jobs, Open Job and Add Job. Historical browsing and imports remain available under **More job actions**.

Each result shows the Job reference, plain-language scope, status, Client → Property → Field hierarchy, requested or scheduled date, and linked Mission count. Technical identifiers remain hidden.

## Mission continuation

Each Job card exposes the next authoritative Mission action without duplicating Mission logic:

- No Missions: **Create Mission**, using the existing Job-bound Mission creation route.
- One Draft Mission: **Continue Mission**, opening that Mission.
- One non-completed Mission: **Open Mission**, opening that Mission.
- Multiple Missions: **Open Missions**, opening the existing Mission register filtered by Job.
- Completed Missions only: **Mission History**, opening the existing Mission register filtered by Job.

The card describes the state in plain operational language. **Open Job** remains available as a secondary action. Mission creation continues to inherit the authoritative Client, Property, Field and Job chain through existing routes and data resolution.

## Create flow

Add Job applies SC-011 through the authoritative hierarchy:

1. Select Client.
2. Select one of that Client's Properties.
3. Select one Field belonging to that Property.
4. Continue to the existing authoritative Job form.

The workspace supplies known parent context through the existing route. It does not duplicate the Job form or mutate Client, Property or Field records.

## Failure and integrity behaviour

Loading failures are distinct from valid empty results. Jobs with incomplete or inconsistent parent references remain visible but cannot be opened through an invalid route. No browser or legacy persistence is introduced. Existing Job history remains accessible as a secondary workflow.
