# Mission Planner Safety Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate the mission register from a clean planner and add forecast weather, editable operational map annotations, hours/minutes duration, and risk-aware JSA controls.

**Architecture:** Keep the existing mission service and planner workflow, but move mission discovery into a focused `MissionRegister` route. Add small pure utility modules for duration, JSA evaluation, annotations and weather selection so behavior can be developed test-first, then connect those modules to the existing Material UI and Leaflet components.

**Tech Stack:** React 19, TypeScript 4.9, React Router 7, Material UI 7, Leaflet/React Leaflet, Open-Meteo, Jest, React Testing Library.

## Global Constraints

- New mission planning must never display past missions.
- Existing mission data without the new optional fields must remain readable.
- Duration remains persisted as total minutes.
- No role or financial-access expansion is included.
- Each unsafe JSA answer owns a separate risk control; residual risk must be below 6 to authorise.

---

### Task 1: Mission routes and register

**Files:**
- Create: `src/pages/MissionRegister.tsx`
- Create: `src/pages/MissionRegister.test.tsx`
- Create: `src/components/MissionRouteRedirect.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Layout.tsx`
- Modify: `src/pages/Home.tsx`
- Modify: `src/pages/Home.test.tsx`
- Modify: `src/pages/JSAManagement.tsx`

**Interfaces:**
- Produces routes `/missions`, `/missions/new`, `/missions/:missionId`.
- `MissionRegister` reads `getMissions()` from the existing mission service and navigates with `useNavigate()`.

- [ ] Write tests proving the Missions navigation opens `/missions`, the register renders Planning/Approved/Completed records, **New Mission** opens `/missions/new`, and a mission row opens `/missions/:missionId`.
- [ ] Run `CI=true npm test -- --watchAll=false src/pages/MissionRegister.test.tsx src/pages/Home.test.tsx` and confirm failures reference missing register/routes.
- [ ] Implement `MissionRegister` with search, status chips and a New Mission action; add protected routes and legacy redirects.
- [ ] Change all dashboard/JSA mission links to the new route vocabulary and update assertions.
- [ ] Re-run the focused tests and commit with `feat: separate mission register and planner routes`.

### Task 2: Clean planner route and duration input

**Files:**
- Create: `src/utils/missionDuration.ts`
- Create: `src/utils/__tests__/missionDuration.test.ts`
- Modify: `src/pages/MissionPlanning.tsx`
- Create: `src/pages/MissionPlanning.test.tsx`

**Interfaces:**
- `minutesToDurationParts(totalMinutes: number): { hours: number; minutes: number }`
- `durationPartsToMinutes(hours: number, minutes: number): number`
- Planner reads `missionId` only from `useParams`; absence means a new mission.

- [ ] Write failing utility tests for 0, 59, 60, 90 and minute overflow, plus a page test asserting `/missions/new` has no saved-mission list.
- [ ] Run `CI=true npm test -- --watchAll=false src/utils/__tests__/missionDuration.test.ts src/pages/MissionPlanning.test.tsx` and confirm the missing utilities/clean view fail.
- [ ] Implement clamped duration conversion and replace the numeric minutes field with separate Hours and Minutes fields backed by total minutes.
- [ ] Remove sorted mission cards and query-string mission selection; load only the route `missionId` when present.
- [ ] Re-run focused tests and commit with `feat: make mission planner a clean duration-aware workspace`.

### Task 3: Forecast weather retrieval

**Files:**
- Create: `src/utils/missionWeather.ts`
- Create: `src/utils/__tests__/missionWeather.test.ts`
- Modify: `src/types/mission.ts`
- Modify: `src/pages/MissionPlanning.tsx`

**Interfaces:**
- `selectWeatherWindow(hourly: HourlyWeatherPoint[], startIso: string, durationMinutes: number): MissionWeatherSnapshot`
- `MissionWeatherSnapshot` stores source, fetchedAt, forecastDate, temperature, wind, gust and rain-chance fields.

- [ ] Write failing tests for required date/location validation, nearest planned-hour selection, empty provider response and preservation of an existing snapshot on failure.
- [ ] Run `CI=true npm test -- --watchAll=false src/utils/__tests__/missionWeather.test.ts` and confirm failures are caused by the absent adapter.
- [ ] Add optional weather metadata to `MissionPlanningState` and implement the pure selection adapter over `fetchWeatherForDate()` results.
- [ ] Add **Get Weather** beside the planned date/location, with loading, attribution, forecast-window guidance and non-destructive failure feedback.
- [ ] Re-run focused tests and commit with `feat: fetch scheduled mission weather`.

### Task 4: Operational map annotation model

**Files:**
- Create: `src/types/missionMap.ts`
- Create: `src/utils/missionMapAnnotations.ts`
- Create: `src/utils/__tests__/missionMapAnnotations.test.ts`
- Modify: `src/types/mission.ts`

**Interfaces:**
- `MissionMapFeatureType = 'building' | 'obstacle' | 'point-of-interest' | 'primary-landing-zone' | 'secondary-landing-zone' | 'signage'`
- `upsertMapFeature(features, feature)` replaces the existing feature only for unique landing-zone types.
- `removeMapFeature(features, id)` returns a new list without the target.

- [ ] Write failing tests for multiple ordinary points, unique primary/secondary landing zones, polygon buildings, deletion and defaults for legacy missions.
- [ ] Run `CI=true npm test -- --watchAll=false src/utils/__tests__/missionMapAnnotations.test.ts` and confirm missing model failures.
- [ ] Implement serialisable GeoJSON-compatible point/polygon feature types and immutable helpers.
- [ ] Add optional `mapFeatures` to mission planning state with an empty-array default during load.
- [ ] Re-run tests and commit with `feat: add mission map annotation model`.

### Task 5: Annotation map tools and legend

**Files:**
- Create: `src/components/MissionMapLegend.tsx`
- Create: `src/components/__tests__/MissionMapLegend.test.tsx`
- Modify: `src/components/FieldBoundaryEditor.tsx`
- Modify: `src/pages/MissionPlanning.tsx`

**Interfaces:**
- `FieldBoundaryEditor` accepts optional `features`, `onFeaturesChange`, and `missionAnnotationMode` props without changing existing field/property callers.
- `MissionMapLegend` consumes `MissionMapFeature[]` and reports type counts.

- [ ] Write failing component tests for all legend labels/counts and annotation toolbar selection.
- [ ] Run `CI=true npm test -- --watchAll=false src/components/__tests__/MissionMapLegend.test.tsx` and confirm missing UI failures.
- [ ] Render point markers and building polygons with accessible labels; add select/edit/delete controls and enforce one primary and one secondary landing zone through `upsertMapFeature`.
- [ ] Keep boundary KML/SHP/ZIP import independent so imported polygons do not remove annotations; render the persistent legend below the map.
- [ ] Re-run component tests and commit with `feat: add operational annotations to mission map`.

### Task 6: Risk-aware mission checks

**Files:**
- Create: `src/utils/missionSafety.ts`
- Create: `src/utils/__tests__/missionSafety.test.ts`
- Modify: `src/types/mission.ts`
- Replace: `src/components/MissionJsaDialog.tsx`
- Modify: `src/components/__tests__/MissionJsaDialog.test.ts`

**Interfaces:**
- `MISSION_CHECKS` contains the 13 approved questions and each question's `unsafeAnswer`.
- `calculateRiskScore(likelihood: number, consequence: number): number` returns their product.
- `evaluateMissionSafety(assessment): { state: 'incomplete' | 'ready' | 'needs-mitigation' | 'cannot-proceed'; blockers: string[] }`.

- [ ] Write one failing table-driven test covering all 13 unsafe mappings, plus tests for unanswered questions, score 5, score 6 without mitigation, residual 5 and residual 6.
- [ ] Run `CI=true npm test -- --watchAll=false src/utils/__tests__/missionSafety.test.ts src/components/__tests__/MissionJsaDialog.test.ts` and confirm the new rules fail against the old hazard dialog.
- [ ] Add optional structured mission-check answers, comments and linked risk controls to `JSARecord` while retaining legacy hazard data.
- [ ] Implement pure trigger/safety evaluation, preserving mitigation notes when a trigger becomes safe.
- [ ] Rebuild the dialog as 13 Yes/No cards with per-question notes, general comments, triggered risk controls and clear Ready/Needs mitigation/Cannot proceed status.
- [ ] Re-run tests and commit with `feat: add risk-aware mission checks`.

### Task 7: Authorisation integration and regression verification

**Files:**
- Modify: `src/pages/MissionPlanning.tsx`
- Modify: `src/utils/missionWorkflow.ts`
- Modify: `src/utils/__tests__/missionWorkflow.test.ts`
- Modify: `docs/superpowers/specs/2026-07-18-mission-planner-safety-design.md`

**Interfaces:**
- Mission authorisation consumes `evaluateMissionSafety(jsaRecord.missionChecks)` and blocks unless state is `ready`.

- [ ] Write failing workflow tests proving incomplete checks and residual scores of 6+ block authorisation while safe checks and residual scores below 6 permit it.
- [ ] Run `CI=true npm test -- --watchAll=false src/utils/__tests__/missionWorkflow.test.ts` and confirm the new safety gate fails.
- [ ] Replace the old `jsaRecord.status === 'approved'` readiness check with structured safety evaluation and surface its blockers in the planner.
- [ ] Run `CI=true npm test -- --watchAll=false` and require all suites to pass without new warnings.
- [ ] Run `npm run build` and require a successful production build.
- [ ] Manually verify register → new mission → weather → boundary/import → annotations → JSA → mitigation → save, then update the spec status to Implemented.
- [ ] Commit with `feat: complete mission planning safety workflow`.
