# Compliance Health and Calendar Implementation Plan

**Goal:** Deliver deterministic, explainable Compliance Health and Calendar read projections in the existing CASA Compliance workspace without duplicating authoritative compliance data.

**Architecture:** Extend `ftf_read_casa_compliance_overview` through one repository-controlled migration. SQL CTEs derive mutually exclusive item states, category scores, critical blockers and calendar events at the supplied evaluation timestamp. The existing trusted Compliance API returns the projection; the React workspace renders score, provenance, views and filters without browser persistence.

**Requirements:** `NEW-CMP-022`, `NEW-CMP-023`, `SC-011`

## 1. Lock the projection contract with failing tests

- Extend the migration contract test for model version, state precedence, critical provenance, calendar sources and service-role-only execution.
- Add a PGlite behaviour test proving mutual exclusivity, critical override, RePL/AROC semantics, event derivation and cross-organisation isolation.
- Extend the page test for disclaimer, score, blocker explanation, calendar views and source drill-down.
- Run the focused tests and confirm they fail for the missing projection/UI.

## 2. Implement the derived SQL projection

- Add a new migration replacing `ftf_read_casa_compliance_overview`.
- Build authorised source CTEs from existing compliance, Personnel, aircraft and checklist records.
- Resolve one item state by explicit precedence and calculate `AU-CASA-HEALTH-1` category/overall results.
- Return fully attributed critical blockers and stable derived calendar events.
- Preserve current overview fields for backwards compatibility.
- Revoke public/anonymous/authenticated execution and grant only `service_role` execution.
- Run migration and PGlite tests.

## 3. Render Compliance Health and Calendar

- Add the Health Score card, legal-status disclaimer, category drill-down and critical-blocker provenance.
- Add Next 90, Agenda, Month, Overdue, Due soon and Completed views plus authorised filters.
- Link events and contributing items only through returned internal application routes.
- Preserve explicit unavailable and insufficient-evidence states.
- Run focused component and API tests.

## 4. Verify the integrated capability

- Run migration lint/contract tests, all Compliance tests, the full test suite and production build.
- Confirm no browser storage or duplicate persistence was introduced.
- Review the final diff against `NEW-CMP-022`, `NEW-CMP-023` and `SC-011` before deployment.
