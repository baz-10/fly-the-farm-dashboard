# SC-013 Operations Brief Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Home's administrative dashboard presentation with a scoped Daily Operations Brief and a shared advisory Weather Centre.

**Architecture:** Add portable spray-weather interpretation, a trusted server read model and a thin frontend adapter. Home and Weather Centre consume the same response; existing Mission, compliance, aircraft and Personnel records remain authoritative.

**Tech Stack:** React 19, TypeScript 4.9, Material UI 7, React Router 7, Node/Vercel functions, PostgreSQL/Supabase, Open-Meteo, Jest, Testing Library.

## Global Constraints

- Home informs; lifecycle gates enforce.
- Quick Actions and ordinary permitted navigation remain available during warnings.
- Device location is explicit only.
- Forecast guidance never becomes Mission evidence or authorisation.
- No browser or legacy persistence fallback.
- Tenant, location, privacy and Assisted Support scope remain enforced.

---

### Task 1: Portable weather interpretation and provider projection

**Files:**
- Create: `server/spray-weather.js`
- Modify: `server/weather-provider.js`
- Test: `src/__tests__/operationsBriefWeather.test.js`

**Interfaces:**
- Produces `calculateDeltaT`, `assessSprayCondition`, `findBestSprayWindow` and `fetchOpenMeteoOperationsForecast`.

- [ ] Write failing boundary tests for Delta T, advisory condition bands, reasons and forecast projection.
- [ ] Run the focused test and confirm the missing exports fail.
- [ ] Implement one shared deterministic interpretation and Open-Meteo projection.
- [ ] Re-run the focused test and require PASS.

### Task 2: Trusted Operations Brief read model

**Files:**
- Create: `supabase/migrations/20260805210000_operations_brief_preferences.sql`
- Create: `server/operations-brief-api.js`
- Modify: `server/operational-dispatcher.js`
- Test: `src/__tests__/operationsBriefApi.test.js`

**Interfaces:**
- Produces `GET /api/v1/operations-brief` returning scoped location, weather, today's schedule, quick-action availability, advisory actions and alerts.
- Accepts explicit preference/location actions only through same-origin commands.

- [ ] Write failing tests for one-location auto-selection, missing coordinates, ordered schedule, non-blocking alerts, permission-filtered actions and scope enforcement.
- [ ] Run the focused test and confirm RED.
- [ ] Implement the handler using existing repositories, compliance projection and weather provider.
- [ ] Add a tenant-owned, user-scoped selected operating-location preference with repository-controlled RLS and no duplicated weather values.
- [ ] Register the dispatcher resource without changing existing public routes.
- [ ] Re-run the focused test and require PASS.

### Task 3: Operations Brief and Weather Centre UI

**Files:**
- Create: `src/services/operationsBriefApi.ts`
- Create: `src/pages/WeatherCentre.tsx`
- Modify: `src/pages/Home.tsx`
- Modify: `src/pages/Home.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Home consumes one `operationsBriefApi.read()` result.
- Weather Centre consumes the same forecast projection through `/weather`.

- [ ] Write failing component tests for all four Home areas, critical-warning non-blocking behaviour, working direct actions, weather values and Weather Centre navigation.
- [ ] Write failing Weather Centre tests for current, hourly, seven-day and advisory spray windows.
- [ ] Run focused tests and confirm RED.
- [ ] Implement responsive plain-language components using the established Spray Command visual system.
- [ ] Add the protected `/weather` route.
- [ ] Re-run focused tests and require PASS.

### Task 4: Release verification

**Files:**
- Modify only when verification exposes an SC-013 defect.

- [ ] Run the full regression suite.
- [ ] Run the production build and `git diff --check`.
- [ ] Run secret and environment-file scans.
- [ ] Deploy the focused slice to Production Beta.
- [ ] Verify real Home and Weather Centre behaviour, direct actions and responsive layouts.
- [ ] Confirm the worktree is clean and the pushed branch matches the deployed commit.
