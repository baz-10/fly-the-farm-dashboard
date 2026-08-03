# Planning Forecast Prefill Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the selected immutable Open-Meteo forecast in the existing Mission Planning Weather section and match it to the Mission's planned operating time without weakening Planning versus Pre-flight separation.

**Architecture:** Preserve the existing forecast API, PostgreSQL revision tables, and selection relationship. Add a pure frontend forecast projection that reads the selected revision's persisted provider snapshot, chooses the exact or nearest hourly interval for the Mission start, derives display-only Delta T and alignment/freshness state, and renders the provider evidence without copying it into mutable form state.

**Tech Stack:** React, TypeScript, Material UI, Jest/Testing Library, existing Node operational API and Supabase PostgreSQL RPCs.

## Global Constraints

- Provider forecast revisions remain immutable PostgreSQL evidence.
- The selected forecast relationship remains authoritative and versioned.
- Forecast evidence guides Planning only and never satisfies Pre-flight readiness or Authorisation.
- Retrieval failure preserves and displays the last selected revision.
- No browser storage or legacy persistence fallback.
- No second forecast workflow or database migration.

---

### Task 1: Selected forecast projection

**Files:**
- Create: `src/utils/planningForecast.ts`
- Create: `src/utils/__tests__/planningForecast.test.ts`

**Interfaces:**
- Produces: `projectSelectedPlanningForecast(forecasts, scheduledStartAt, now?)`, returning the selected revision, matched hourly interval, exact/nearest alignment, freshness, and display measurements.

- [ ] Write failing tests proving selected-revision resolution, exact-hour matching, nearest-interval matching, changed-time misalignment, Delta T projection, and missing-value handling.
- [ ] Run the focused test and confirm RED because the projection does not exist.
- [ ] Implement the minimal pure projection with no mutation of provider evidence.
- [ ] Run the focused test and confirm GREEN.
- [ ] Commit with `IMP-MIS-001`.

### Task 2: Existing Mission Weather display

**Files:**
- Modify: `src/components/mission/MissionWeatherEvidence.tsx`
- Modify: `src/components/mission/__tests__/MissionWeatherEvidence.test.tsx`

**Interfaces:**
- Consumes: `projectSelectedPlanningForecast` from Task 1.
- Produces: the existing Planning Forecast section populated from authoritative selected evidence.

- [ ] Write failing component tests proving provider, retrieval/valid times, location, version, temperature, humidity, Delta T, wind/gust/direction, precipitation, cloud, freshness, and exact/nearest alignment are visible after retrieval and after reload.
- [ ] Add a failing test proving changed Mission time warns without mutating or replacing the selected revision.
- [ ] Run focused component tests and confirm RED because the current UI only shows a revision count.
- [ ] Render the selected projection in the existing Planning Forecast section, relabel the sections `PLANNING FORECAST` and `OBSERVED PRE-FLIGHT WEATHER`, and change the retrieval action to `Get Forecast`/`Refresh Forecast` without touching observation state.
- [ ] Ensure retrieval failures leave the existing selected forecast visible and add a clear refresh/reselection prompt for misalignment or staleness.
- [ ] Run focused component tests and confirm GREEN.
- [ ] Commit with `IMP-MIS-001`.

### Task 3: Regression and deployed acceptance

**Files:**
- Modify only if a regression test exposes a contract defect in the existing API.

**Interfaces:**
- Consumes: existing versioned forecast API and selected evidence RPC.
- Produces: deployed, cross-session authoritative Planning Forecast display.

- [ ] Run forecast API, Mission Weather component, and Mission workflow tests.
- [ ] Run all tests and the production build.
- [ ] Deploy the existing branch to Production Beta.
- [ ] In the deployed Mission planner, retrieve/select a forecast for a future Mission, verify automatic display, refresh, re-login, and second authorised session restoration.
- [ ] Change the planned Mission time and verify a visible alignment warning while the selected revision remains unchanged.
- [ ] Retrieve again and verify a new immutable revision and version are displayed.
- [ ] Record the deployment ID and operational evidence.
